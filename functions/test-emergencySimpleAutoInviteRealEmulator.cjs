"use strict";
/**
 * REAL Firebase Authentication + Firestore Rules + Functions Emulator E2E.
 * Authentication, Admin approval write, Volunteer inbox query and Callable
 * Accept/Decline execute against isolated demo-volunserve-simple-invites.
 * Never connects to real Firebase, Render, live Volunteers or real incidents.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp:adminInitialize,deleteApp:adminDelete}=require("firebase-admin/app");
const {getAuth:adminGetAuth}=require("firebase-admin/auth");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {initializeApp:clientInitialize,deleteApp:clientDelete}=require("firebase/app");
const {getAuth,connectAuthEmulator,signInWithEmailAndPassword}=require("firebase/auth");
const {getFirestore:clientFirestore,connectFirestoreEmulator,
  collection,doc,getDoc,getDocs,query,where,updateDoc,serverTimestamp}=require("firebase/firestore");
const {getFunctions,connectFunctionsEmulator,httpsCallable}=require("firebase/functions");

const PROJECT="demo-volunserve-simple-invites";
if(process.env.GCLOUD_PROJECT!==PROJECT||
   process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"||
   process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9099"||
   process.env.FUNCTIONS_EMULATOR!=="true"||
   process.env.VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID!==PROJECT||
   process.env.VOLUNSERVE_SIMPLE_AUTO_INVITES_ENABLED!=="true"||
   process.env.VOLUNSERVE_SIMPLE_AUTO_INVITES_PRODUCTION_APPROVED==="true"||
   process.env.GOOGLE_APPLICATION_CREDENTIALS||
   process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  throw Error("Refusing any real account or non-emulator connection");
const app=adminInitialize({projectId:PROJECT},"simple_invites_e2e_"+process.pid);
const db=getFirestore(app),authAdmin=adminGetAuth(app);
const U={admin:"qa_simple_admin",resident:"qa_simple_resident",
  a:"qa_simple_vol_a",b:"qa_simple_vol_b",c:"qa_simple_vol_c",
  suspended:"qa_simple_suspended",outsider:"qa_simple_outsider"};
const CASE="QA_SIMPLE_AUTO_CASE_001";
const PASSWORD="TestOnly!eMUlAt0rA67x";
const mail=uid=>uid+"@fictional.invalid";
const ref=(c,id)=>db.collection(c).doc(id);
const clientApps=[];
async function client(uid){
  const clientApp=clientInitialize({
    apiKey:"not-a-real-key",projectId:PROJECT,
    authDomain:PROJECT+".firebaseapp.com"
  },"real_e2e_"+uid+"_"+process.pid);
  clientApps.push(clientApp);
  const a=getAuth(clientApp);
  connectAuthEmulator(a,"http://127.0.0.1:9099",{disableWarnings:true});
  if(uid) {
    const loggedIn=await signInWithEmailAndPassword(a,mail(uid),PASSWORD);
    assert.equal(loggedIn.user.uid,uid);
  }
  const firestore=clientFirestore(clientApp);
  connectFirestoreEmulator(firestore,"127.0.0.1",8080);
  const fn=getFunctions(clientApp,"us-central1");
  connectFunctionsEmulator(fn,"127.0.0.1",5001);
  return {auth:a,firestore,
    decide:httpsCallable(fn,"respondToAutoVolunteerInvitation")};
}
async function poll(fn,label,timeoutMs=30000){
  const end=Date.now()+timeoutMs;
  while(Date.now()<end){
    const value=await fn();
    if(value)return value;
    await new Promise(resolve=>setTimeout(resolve,350));
  }
  throw Error("Timeout waiting for "+label);
}
function approvedProfile(uid,other={}){
  return {uid,role:"volunteer",status:"approved",
    volunteerAccess:true,volunteerStatus:"approved",
    activeMode:"volunteer",identityVerified:true,
    fullName:"FAKE "+uid,...other};
}
async function seed(){
  const people=Object.values(U);
  for(const uid of people)
    await authAdmin.createUser({uid,email:mail(uid),password:PASSWORD,
      emailVerified:true,disabled:false});
  const batch=db.batch();
  batch.set(ref("users",U.admin),{
    uid:U.admin,role:"admin",status:"approved",adminStatus:"active"
  });
  batch.set(ref("users",U.resident),{
    uid:U.resident,role:"resident",status:"approved",
    residentAccess:true,activeMode:"resident"
  });
  for(const [uid,profile] of [
    [U.a,approvedProfile(U.a,{barangay:"Citrus"})],
    [U.b,approvedProfile(U.b,{barangay:"Bagong Buhay I"})],
    [U.c,approvedProfile(U.c)], // no barangay
    [U.suspended,approvedProfile(U.suspended,{status:"suspended"})],
    [U.outsider,approvedProfile(U.outsider,{volunteerStatus:"pending"})]
  ]){
    batch.set(ref("users",uid),profile);
    batch.set(ref("volunteerApplications",uid),{
      uid,status:"approved",skills:["Cooking"]
    });
  }
  batch.set(ref("disasterCases",CASE),{
    status:"reported",verificationStatus:"pending_verification",
    evidenceReviewStatus:"pending_review",
    title:"FICTIONAL EMULATOR ONLY - Emergency report",
    reporterUid:U.resident,reporterBarangay:"Bagong Buhay I",
    incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],
    details:"This is not a real emergency, used for local QA only.",
    attachments:[{type:"image",url:"https://example.invalid/fake.jpg"}],
    assignedVolunteerIds:[],assignedVolunteersCount:0,
    dispatchBlocked:true,validatedAt:null,validatedBy:null,
    testOnly:true,createdAt:FieldValue.serverTimestamp(),
    updatedAt:FieldValue.serverTimestamp()
  });
  await batch.commit();
}
async function currentOffers(){
  const s=await db.collection("responseAssignments")
    .where("caseId","==",CASE).get();
  return s.docs;
}
async function decideAs(ctx,decision,overrides={}){
  const result=await ctx.decide({caseId:CASE,decision,...overrides});
  return result.data;
}
async function denied(promise,code){
  await assert.rejects(promise,error=>{
    assert.equal(error.code,code,JSON.stringify(error));
    return true;
  });
}

test("REAL Firebase Auth Admin write -> Functions event -> THREE Firestore offers, no barangay filter",async()=>{
  await seed();
  const admin=await client(U.admin);
  const before=await ref("emergencyAutoDispatchBatches",CASE).get();
  assert.equal(before.exists,false);
  // Exactly the fields the real Admin validation updates. The write is from
  // the authenticated client SDK and MUST pass deployed Firestore Rules.
  await updateDoc(doc(admin.firestore,"disasterCases",CASE),{
    status:"validated",verificationStatus:"validated",
    evidenceReviewStatus:"approved",dispatchBlocked:false,
    validatedBy:U.admin,validatedAt:serverTimestamp(),updatedAt:serverTimestamp()
  });
  await poll(async()=>{
    const s=await ref("emergencyAutoDispatchBatches",CASE).get();
    return s.exists?s.data():null;
  },"actual onDocumentUpdated automatic fanout");
  const docs=await currentOffers();
  assert.deepEqual(docs.map(x=>x.data().volunteerId).sort(),[U.a,U.b,U.c].sort());
  for(const uid of [U.a,U.b,U.c]){
    const t=await ref("responseAssignments",CASE+"_"+uid).get();
    const n=await ref("notifications","auto_response_"+CASE+"_"+uid).get();
    assert.equal(t.data().status,"offered");
    assert.equal(t.data().offerMode,"automatic_all_volunteers_no_barangay");
    assert.equal(n.data().userId,uid);
  }
  assert.equal((await ref("responseAssignments",CASE+"_"+U.suspended).get()).exists,false);
  assert.equal((await ref("responseAssignments",CASE+"_"+U.outsider).get()).exists,false);
  assert.equal((await ref("disasterCases",CASE).get()).data().status,"assigned");
  assert.equal((await ref("emergencyAutoDispatchBatches",CASE).get()).data().volunteerCount,3);
});
test("Each signed-in Volunteer can read THEIR own real Firestore assignment inbox",async()=>{
  for(const uid of [U.a,U.b,U.c]){
    const ctx=await client(uid);
    const q=query(collection(ctx.firestore,"responseAssignments"),
      where("volunteerId","==",uid));
    const snapshot=await getDocs(q);
    assert.deepEqual(snapshot.docs.map(x=>x.id),[CASE+"_"+uid]);
    const strangerId=CASE+"_"+(uid===U.a?U.b:U.a);
    await denied(getDoc(doc(ctx.firestore,"responseAssignments",strangerId)),
      "permission-denied");
  }
});
test("Anonymous and uninvited Volunteer cannot impersonate another invitation",async()=>{
  const anonymous=await client(null);
  await denied(decideAs(anonymous,"accepted"),"functions/unauthenticated");
  const outsider=await client(U.outsider);
  await denied(decideAs(outsider,"accepted",{uid:U.a}),
    "functions/failed-precondition");
  assert.equal((await ref("responseAssignments",CASE+"_"+U.a).get()).data().status,"offered");
});
test("REAL authenticated callable: Volunteer A Accept, B Decline, C Accept",async()=>{
  const one=await client(U.a),two=await client(U.b),three=await client(U.c);
  assert.equal((await decideAs(one,"accepted",{uid:U.b})).status,"accepted");
  assert.equal((await decideAs(two,"declined")).status,"declined");
  assert.equal((await decideAs(three,"accepted")).status,"accepted");
  assert.equal((await ref("responderLocks",U.a).get()).data().responderUid,U.a);
  assert.equal((await ref("responderLocks",U.c).get()).data().responderUid,U.c);
  assert.equal((await ref("responderLocks",U.b).get()).exists,false);
  assert.equal((await ref("autoVolunteerReservations",U.b).get()).exists,false);
  assert.equal((await ref("notifications","auto_decision_"+CASE+"_"+U.a).get()).data().userId,U.resident);
  assert.equal((await ref("notifications","auto_decision_"+CASE+"_"+U.b).get()).data().userId,U.admin);
  assert.equal((await ref("emergencyAutoDispatchBatches",CASE).get()).data().status,"supported");
  assert.equal((await ref("disasterCases",CASE).get()).data().autoVolunteerDispatch.state,"supported");
  assert.equal((await decideAs(one,"accepted")).status,"already_accepted");
  await denied(decideAs(one,"declined"),"functions/failed-precondition");
  const q=await currentOffers();
  assert.deepEqual(q.map(x=>x.data().status).sort(),["accepted","accepted","declined"]);
  const notes=await db.collection("notifications").get();
  assert.equal(notes.size,6,"Three invitations and exactly one outcome notice per Volunteer");
});
test("Repeated approval state update does not create duplicate auto invitations",async()=>{
  const c=await ref("disasterCases",CASE).get();
  await ref("disasterCases",CASE).update({updatedAt:FieldValue.serverTimestamp()});
  await new Promise(resolve=>setTimeout(resolve,650));
  assert.equal((await currentOffers()).length,3);
  assert.equal((await db.collection("notifications").get()).size,6);
  assert.equal((await ref("disasterCases",CASE).get()).data().status,"assigned");
});
test.after(async()=>{
  await Promise.all(clientApps.map(clientDelete));
  await adminDelete(app);
});
