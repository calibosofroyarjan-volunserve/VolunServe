"use strict";
/**
 * REAL Auth + Firestore Security Rules emulator integration for NO-BLAZE
 * Render dispatch. Refuses any non-emulator or service account connection.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getAuth:getAdminAuth}=require("firebase-admin/auth");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {initializeApp:initializeClient,deleteApp:deleteClient}=require("firebase/app");
const {getAuth,connectAuthEmulator,signInWithEmailAndPassword}=require("firebase/auth");
const {getFirestore:clientDb,connectFirestoreEmulator,
  collection,query,where,getDocs,getDoc,doc}=require("firebase/firestore");
const {makeEngine,config}=require("./renderEmergencyAutoInvites");

const PROJECT="demo-volunserve-simple-invites";
if(process.env.GCLOUD_PROJECT!==PROJECT||
   process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"||
   process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9099"||
   process.env.GOOGLE_APPLICATION_CREDENTIALS||
   process.env.FIREBASE_SERVICE_ACCOUNT_JSON||
   process.env.VOLUNSERVE_RENDER_AUTO_PRODUCTION_APPROVED==="true")
  throw Error("EMULATOR ONLY. Never connect to actual project or service account.");
const env={
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:PROJECT}),
  VOLUNSERVE_RENDER_AUTO_PROJECT_ID:PROJECT,
  VOLUNSERVE_RENDER_AUTO_ENABLED:"true",
  VOLUNSERVE_RENDER_AUTO_EMULATOR_APPROVED:"true",
  FIRESTORE_EMULATOR_HOST:"127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9099"
};
if(config(env).enabled!==true)throw Error("Emulator permit missing");
const app=initializeApp({projectId:PROJECT},"render_e2e_"+process.pid);
const db=getFirestore(app),auth=getAdminAuth(app);
const resident="qa_render_resident",admin="qa_render_admin";
const volunteers=["qa_render_vol_1","qa_render_vol_2","qa_render_vol_3"];
const outsider="qa_render_not_invited";
const caseId="QA_RENDER_AUTO_CASE_001";
const password="EmuFakePassword!44";
const email=uid=>uid+"@example.invalid";
const clients=[];
const stamp=()=>FieldValue.serverTimestamp();
const dataRef=(col,id)=>db.collection(col).doc(id);
const stageProfile=(uid)=>({uid,role:"volunteer",status:"approved",
  activeMode:"volunteer",volunteerAccess:true,
  volunteerStatus:"approved",identityVerified:true,
  fullName:"FICTIONAL "+uid});
async function client(uid){
  const appClient=initializeClient({apiKey:"not-a-real-key",projectId:PROJECT,
    authDomain:PROJECT+".firebaseapp.com"},"r_"+uid+"_"+clients.length);
  clients.push(appClient);
  const session=getAuth(appClient);
  connectAuthEmulator(session,"http://127.0.0.1:9099",{disableWarnings:true});
  await signInWithEmailAndPassword(session,email(uid),password);
  const fs=clientDb(appClient);
  connectFirestoreEmulator(fs,"127.0.0.1",8080);
  return {fs};
}
async function seedCase(id){
  await dataRef("disasterCases",id).set({
    reporterUid:resident,source:"resident_emergency_assistance",
    requestKind:"emergency_assistance",status:"reported",
    verificationStatus:"pending_verification",evidenceReviewStatus:"pending_review",
    testOnly:true,title:"TEST ONLY - Emergency fake submission",
    severity:"low",reporterName:"FICTIONAL Resident",
    location:"FICTIONAL San Jose del Monte",latitude:14.817,longitude:121.045,
    attachments:[{type:"image",url:"https://example.invalid/fake.jpg"}],
    dispatchBlocked:false,createdAt:stamp(),updatedAt:stamp(),
    assignedVolunteerIds:[],assignedVolunteersCount:0
  });
}
async function setup(){
  for(const uid of [resident,admin,...volunteers,outsider])
    await auth.createUser({uid,email:email(uid),password,emailVerified:true});
  const batch=db.batch();
  batch.set(dataRef("users",resident),{uid:resident,role:"resident",
    status:"approved",residentAccess:true,activeMode:"resident"});
  batch.set(dataRef("users",admin),{uid:admin,role:"admin",
    status:"approved",adminStatus:"active"});
  for(const uid of volunteers){
    batch.set(dataRef("users",uid),stageProfile(uid));
    batch.set(dataRef("volunteerApplications",uid),{uid,status:"approved"});
  }
  batch.set(dataRef("users",outsider),stageProfile(outsider));
  await batch.commit();
  await seedCase(caseId);
}
test("Render Resident report -> 3 offered, own notifications/tasks, only invited case reads",async()=>{
  await setup();
  const engine=makeEngine({db,FieldValue,env,clock:()=>Date.now()});
  const sent=await engine.submitted({uid:resident,caseId,
    profile:{role:"resident",status:"approved",residentAccess:true}});
  assert.deepEqual([sent.status,sent.offered],["completed",3]);
  const report=(await dataRef("disasterCases",caseId).get()).data();
  assert.equal(report.status,"reported");
  assert.equal(report.verificationStatus,"pending_verification");
  for(const uid of volunteers){
    const c=await client(uid);
    const tasks=await getDocs(query(collection(c.fs,"responseAssignments"),
      where("volunteerId","==",uid)));
    assert.ok(tasks.docs.some(d=>d.id===caseId+"_"+uid));
    const notes=await getDocs(query(collection(c.fs,"notifications"),
      where("userId","==",uid)));
    assert.ok(notes.docs.some(d=>d.id==="auto_response_"+caseId+"_"+uid));
    const caseRead=await getDoc(doc(c.fs,"disasterCases",caseId));
    assert.equal(caseRead.exists(),true);
  }
  const non=await client(outsider);
  await assert.rejects(getDoc(doc(non.fs,"disasterCases",caseId)),
    e=>e?.code==="permission-denied");
  const adminClient=await client(admin);
  const all=await getDocs(collection(adminClient.fs,"responseAssignments"));
  assert.equal(all.docs.filter(x=>x.data().caseId===caseId).length,3);
});
test("2 secure Accept + 1 Decline, Admin sees exact statuses and replay no extra offers",async()=>{
 const engine=makeEngine({db,FieldValue,env,clock:()=>Date.now()});
 const before=(await db.collection("notifications").where("caseId","==",caseId).get()).size;
 const decisions=["accepted","accepted","declined"];
 for(let i=0;i<3;i++){
   const done=await engine.respond({uid:volunteers[i],caseId,decision:decisions[i]});
   assert.equal(done.status,decisions[i]);
 }
 const statuses=await db.collection("responseAssignments").where("caseId","==",caseId).get();
 assert.deepEqual(statuses.docs.map(d=>d.data().status).sort(),
   ["accepted","accepted","declined"]);
 assert.equal((await dataRef("responderLocks",volunteers[0]).get()).exists,true);
 assert.equal((await dataRef("responderLocks",volunteers[1]).get()).exists,true);
 assert.equal((await dataRef("responderLocks",volunteers[2]).get()).exists,false);
 const repeat=await engine.submitted({uid:resident,caseId,
   profile:{role:"resident",status:"approved",residentAccess:true}});
 assert.equal(repeat.status,"already_completed");
 const after=(await db.collection("notifications").where("caseId","==",caseId).get()).size;
 assert.equal(after,before+3,"Only 3 decision notifications were added, no duplicate offers");
});
test("43 additional fictional approved volunteers receive invites (no hard 40)",async()=>{
 const caseMore="QA_RENDER_43_MORE";
 const batch=db.batch();
 for(let n=0;n<43;n++){
   const uid="qa_render_extra_"+String(n).padStart(3,"0");
   batch.set(dataRef("users",uid),stageProfile(uid));
   batch.set(dataRef("volunteerApplications",uid),{uid,status:"approved"});
 }
 await batch.commit();
 await seedCase(caseMore);
 const done=await makeEngine({db,FieldValue,env,clock:()=>Date.now()})
  .submitted({uid:resident,caseId:caseMore,
    profile:{role:"resident",status:"approved",residentAccess:true}});
 assert.equal(done.status,"completed");
 assert.equal(done.offered,44,
   "Prior accepted Volunteers are busy; declined Volunteer and 43 new ones are eligible");
});
test.after(async()=>{
  await Promise.all(clients.map(deleteClient));
  await deleteApp(app);
});
