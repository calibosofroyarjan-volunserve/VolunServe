"use strict";
/**
 * Actual Firebase Auth + Firestore + Functions Emulator callable E2E.
 * Only fictional credentials/accounts in demo-volunserve-auto-phase4.
 * No Firebase Cloud credentials, production traffic or actual emergencies.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp:initializeAdmin,deleteApp:deleteAdmin}=require("firebase-admin/app");
const {getAuth:getAdminAuth}=require("firebase-admin/auth");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {initializeApp:initializeClient,deleteApp:deleteClient}=require("firebase/app");
const {getAuth,connectAuthEmulator,signInWithEmailAndPassword}=require("firebase/auth");
const {getFunctions,connectFunctionsEmulator,httpsCallable}=require("firebase/functions");
const {explicitDemoGate,TEST_CATEGORY}=require("./emergencyAutoInviteOnApproval");

const PROJECT="demo-volunserve-auto-phase4";
if(process.env.GCLOUD_PROJECT!==PROJECT||
   process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"||
   process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9099"||
   process.env.VOLUNSERVE_AUTO_VOLUNTEER_TEST_TRIGGER!=="enabled"||
   !explicitDemoGate(process.env))
  throw Error("Refused: real Auth + Firestore + Functions demo emulators required");

const a=initializeAdmin({projectId:PROJECT},"demo_decisions_"+process.pid);
const db=getFirestore(a),adminAuth=getAdminAuth(a);
const id="DEMO_AUTO_CASE_DECISION_001";
const UIDS={
  admin:"demo_decision_admin",reporter:"demo_decision_reporter",
  a:"demo_decision_volunteer_a",b:"demo_decision_volunteer_b",
  c:"demo_decision_volunteer_c",other:"demo_decision_outsider"
};
const PASSWORD="EmulatorOnly!A5b6C7d8";
const email=uid=>uid+"@fictional.example";
const doc=(collection,key)=>db.collection(collection).doc(key);
const clients=[];
async function client(uid){
  const app=initializeClient({
    projectId:PROJECT,apiKey:"not-a-real-key",authDomain:"localhost"
  },"decisions_"+(uid||"guest")+"_"+process.pid);
  clients.push(app);
  const auth=getAuth(app);
  connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
  if(uid)await signInWithEmailAndPassword(auth,email(uid),PASSWORD);
  const fns=getFunctions(app,"us-central1");
  connectFunctionsEmulator(fns,"127.0.0.1",5001);
  return httpsCallable(fns,"emulatorAutoVolunteerDecision");
}
async function awaitState(fn,label,timeoutMs=20000){
  const end=Date.now()+timeoutMs;
  while(Date.now()<end){
    const state=await fn();
    if(state)return state;
    await new Promise(resolve=>setTimeout(resolve,350));
  }
  throw Error("Timed out waiting for "+label);
}
async function setup(){
  const all=Object.values(UIDS);
  for(const uid of all){
    await adminAuth.createUser({uid,email:email(uid),
      password:PASSWORD,emailVerified:true,disabled:false});
  }
  const b=db.batch();
  b.set(doc("users",UIDS.admin),{
    role:"admin",status:"approved",adminStatus:"active",testOnly:true
  });
  b.set(doc("users",UIDS.reporter),{
    role:"resident",status:"approved",testOnly:true
  });
  for(const uid of [UIDS.a,UIDS.b,UIDS.c,UIDS.other]){
    b.set(doc("users",uid),{
      role:"volunteer",status:"approved",
      volunteerAccess:true,volunteerStatus:"approved",
      identityVerified:true,barangay:uid===UIDS.other?"Citrus":"Bagong Buhay I",
      fullName:"FICTIONAL "+uid,skills:["First Aid"],testOnly:true
    });
    b.set(doc("volunteerApplications",uid),{
      uid,status:"approved",skills:["First Aid"],testOnly:true
    });
  }
  b.set(doc("disasterCases",id),{
    id,title:"FICTIONAL EMULATOR DISPATCH ONLY",
    testOnly:true,testCategory:TEST_CATEGORY,
    reporterUid:UIDS.reporter,
    incidentBarangay:"Bagong Buhay I",
    requiredSkills:["First Aid"],
    status:"reported",verificationStatus:"pending_verification",
    dispatchBlocked:true
  });
  await b.commit();
  const prior=await doc("emergencyAutoDispatchBatches",id).get();
  assert.equal(prior.exists,false);
  await doc("disasterCases",id).update({
    status:"validated",verificationStatus:"validated",
    dispatchBlocked:false,validatedBy:UIDS.admin,
    validatedAt:FieldValue.serverTimestamp()
  });
  await awaitState(async()=>{
    const r=await doc("emergencyAutoDispatchBatches",id).get();
    return r.exists?r.data():null;
  },"real Firestore onDocumentUpdated auto invitations");
  const offers=await db.collection("responseAssignments")
    .where("caseId","==",id).get();
  assert.deepEqual(offers.docs.map(d=>d.data().volunteerId).sort(),
    [UIDS.a,UIDS.b,UIDS.c].sort());
}
async function call(c,decision,extra={}){
  const response=await c({caseId:id,decision,...extra});
  return response.data;
}
async function expectDenied(promise,code){
  await assert.rejects(promise,error=>{
    assert.equal(error.code,code,JSON.stringify(error));
    return true;
  });
}
test("Admin approval automatically invites all THREE authenticated demo Volunteers",async()=>{
  await setup();
  const b=(await doc("emergencyAutoDispatchBatches",id).get()).data();
  assert.equal(b.status,"waiting");
  assert.equal(b.volunteerCount,3);
  assert.equal((await doc("notifications",
    "auto_response_"+id+"_"+UIDS.a).get()).data().userId,UIDS.a);
  assert.equal((await doc("responseAssignments",id+"_"+UIDS.other).get()).exists,false);
});
test("anonymous caller and unrelated Volunteer cannot decide an invitation",async()=>{
  const guest=await client(null);
  await expectDenied(call(guest,"accepted"),"functions/unauthenticated");
  const stranger=await client(UIDS.other);
  await expectDenied(call(stranger,"accepted"),"functions/failed-precondition");
  assert.equal((await doc("responseAssignments",id+"_"+UIDS.a).get()).data().status,"offered");
});
test("Volunteer A ACCEPT: Auth UID owns offer, atomic responder lock and resident notification",async()=>{
  const volunteerA=await client(UIDS.a);
  const value=await call(volunteerA,"accepted",{uid:UIDS.b});
  assert.equal(value.status,"accepted");
  assert.equal((await doc("responseAssignments",id+"_"+UIDS.a).get()).data().status,"accepted");
  assert.equal((await doc("responderLocks",UIDS.a).get()).data().responderUid,UIDS.a);
  assert.equal((await doc("notifications",
    "emulator_auto_accepted_"+id+"_"+UIDS.a).get()).data().userId,UIDS.reporter);
  assert.equal((await doc("emergencyAutoDispatchBatches",id).get()).data().status,"supported");
  assert.equal((await doc("disasterCases",id).get()).data().autoVolunteerDispatch.state,"supported");
  assert.equal((await doc("responseAssignments",id+"_"+UIDS.b).get()).data().status,"offered",
    "Never decline a different authenticated Volunteer without their decision");
  const repeated=await call(volunteerA,"accepted");
  assert.equal(repeated.status,"already_accepted");
  await expectDenied(call(volunteerA,"declined"),"functions/failed-precondition");
  assert.equal((await doc("notifications",
    "emulator_auto_declined_"+id+"_"+UIDS.a).get()).exists,false);
});
test("Volunteer B DECLINE: own offer closed, reservation released, Admin alerted exactly once",async()=>{
  const volunteerB=await client(UIDS.b);
  const first=await call(volunteerB,"declined");
  assert.equal(first.status,"declined");
  assert.equal((await doc("responseAssignments",id+"_"+UIDS.b).get()).data().status,"declined");
  assert.equal((await doc("autoVolunteerReservations",UIDS.b).get()).exists,false);
  assert.equal((await doc("notifications",
    "emulator_auto_declined_"+id+"_"+UIDS.b).get()).data().userId,UIDS.admin);
  assert.equal((await call(volunteerB,"declined")).status,"already_declined");
  await expectDenied(call(volunteerB,"accepted"),"functions/failed-precondition");
  assert.equal((await doc("adminActivityLogs",
    "emulator_auto_decision_"+id+"_"+UIDS.b).get()).exists,true);
});
test("Volunteer C can independently ACCEPT existing all-eligible offer without later wave",async()=>{
  const volunteerC=await client(UIDS.c);
  assert.equal((await call(volunteerC,"accepted")).status,"accepted");
  const b=(await doc("emergencyAutoDispatchBatches",id).get()).data();
  assert.equal(b.status,"supported");
  assert.equal(b.acceptedCount,2);
  assert.equal(b.declinedCount,1);
  assert.equal((await doc("responderLocks",UIDS.c).get()).data().caseId,id);
  assert.equal((await doc("responderLocks",UIDS.b).get()).exists,false);
});
test("suspended/revoked Volunteer cannot accept an existing offered invitation",async()=>{
  const case2="DEMO_AUTO_CASE_REVOKED_002";
  const caseRef=doc("disasterCases",case2);
  const e=await doc("disasterCases",id).get();
  await caseRef.create({...e.data(),id:case2,
    autoVolunteerDispatch:{state:"waiting",wave:1},
    status:"assigned"});
  await doc("emergencyAutoDispatchBatches",case2).create({
    caseId:case2,status:"waiting",wave:1,testOnly:true,
    origin:"fictional_emulator_auto_volunteer_only"
  });
  await doc("responseAssignments",case2+"_"+UIDS.b).create({
    caseId:case2,volunteerId:UIDS.b,status:"offered",testOnly:true,
    createdBy:"automatic_matching_engine",
    offerMode:"fictional_emulator_auto_invitation",
    expiresAtMs:Date.now()+120000
  });
  await doc("autoVolunteerReservations",UIDS.b).create({
    caseId:case2,uid:UIDS.b,
    assignmentId:case2+"_"+UIDS.b,expiresAtMs:Date.now()+120000
  });
  await doc("notifications","auto_response_"+case2+"_"+UIDS.b).create({
    userId:UIDS.b,caseId:case2,assignmentId:case2+"_"+UIDS.b
  });
  await doc("users",UIDS.b).update({status:"suspended"});
  const clientB=clients.find(x=>x.name==="decisions_"+UIDS.b+"_"+process.pid);
  const fns=getFunctions(clientB,"us-central1");
  const deny=httpsCallable(fns,"emulatorAutoVolunteerDecision");
  await expectDenied(deny({caseId:case2,decision:"accepted"}),"functions/failed-precondition");
  assert.equal((await doc("responseAssignments",case2+"_"+UIDS.b).get()).data().status,"offered");
});
test.after(async()=>{
  await Promise.all(clients.map(deleteClient));
  await deleteAdmin(a);
});
