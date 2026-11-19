"use strict";
/**
 * Actual Firestore + Functions Emulator automatic due-offer test:
 * a real Admin approval event creates first-wave offers; a local interval
 * automatically expires them and offers all qualified fictional fallback
 * Volunteers. No manual "Due Scan" click or HTTP request required.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {explicitDemoGate,TEST_CATEGORY}=require("./emergencyAutoInviteOnApproval");
const {createDemoVolunteerDecision}=require("./emergencyAutoInviteVolunteerDecision");
const {
  createDemoFollowupScanner,createDemoFollowupWorker
}=require("./emergencyAutoInviteFollowupEmulator");

const PROJECT="demo-volunserve-auto-phase4";
if(process.env.GCLOUD_PROJECT!==PROJECT||
  process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"||
  !explicitDemoGate(process.env))
  throw Error("Real fictional Firestore Emulator required for due-wave tests");
const app=initializeApp({projectId:PROJECT},"followup_"+process.pid);
const db=getFirestore(app);
const doc=(collection,id)=>db.collection(collection).doc(id);
const admin="followup_test_admin",reporter="followup_test_reporter";
const a="followup_test_a",b="followup_test_b",c="followup_test_c";
const CASE1="DEMO_AUTO_CASE_FOLLOWUP_001";
const CASE2="DEMO_AUTO_CASE_FOLLOWUP_CANCEL_002";
const CASE3="DEMO_AUTO_CASE_FOLLOWUP_EXHAUST_003";
const known=["Bagong Buhay I","Citrus"];
let shifted=Date.now();
const clock=()=>shifted;
function caseData(id){
  return {id,title:"FICTIONAL FOLLOWUP FIREBASE EMULATOR REPORT",
    reporterUid:reporter,incidentBarangay:"Bagong Buhay I",
    requiredSkills:["First Aid"],
    testOnly:true,testCategory:TEST_CATEGORY,
    status:"reported",verificationStatus:"pending_verification",
    dispatchBlocked:true};
}
async function until(fn,label,timeout=20000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    const v=await fn();
    if(v)return v;
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw Error("Timed out waiting for "+label);
}
async function createApproved(id){
  await doc("disasterCases",id).create(caseData(id));
  assert.equal((await doc("emergencyAutoDispatchBatches",id).get()).exists,false);
  await doc("disasterCases",id).update({
    status:"validated",verificationStatus:"validated",
    dispatchBlocked:false,validatedBy:admin,
    validatedAt:FieldValue.serverTimestamp()
  });
  await until(async()=>{
    const b=await doc("emergencyAutoDispatchBatches",id).get();
    return b.exists&&b.data().status==="waiting"?b.data():null;
  },"actual Firestore approval auto-fanout: "+id);
}
async function offers(id){
  const q=await db.collection("responseAssignments")
    .where("caseId","==",id).get();
  return q.docs.map(x=>x.data());
}
async function setup(){
  const batch=db.batch();
  batch.set(doc("users",admin),{
    role:"admin",status:"approved",adminStatus:"active",testOnly:true
  });
  batch.set(doc("users",reporter),{
    role:"resident",status:"approved",testOnly:true
  });
  for(const [uid,barangay] of [
    [a,"Bagong Buhay I"],[b,"Bagong Buhay I"],[c,"Citrus"]
  ]){
    batch.set(doc("users",uid),{
      role:"volunteer",status:"approved",volunteerStatus:"approved",
      volunteerAccess:true,identityVerified:true,
      fullName:"FICTIONAL "+uid,
      barangay,skills:["First Aid"],testOnly:true
    });
    batch.set(doc("volunteerApplications",uid),{
      uid,status:"approved",skills:["First Aid"],testOnly:true
    });
  }
  await batch.commit();
}
test("initial approval offers to ALL same-barangay Volunteers, not citywide prematurely",async()=>{
  await setup();
  await createApproved(CASE1);
  assert.deepEqual((await offers(CASE1)).map(x=>x.volunteerId).sort(),[a,b]);
  assert.equal((await doc("notifications",
    "auto_response_"+CASE1+"_"+c).get()).exists,false);
  const scan=createDemoFollowupScanner({
    db,FieldValue,clock,knownBarangays:known
  });
  assert.equal((await scan.scanCase(CASE1)).status,"waiting");
});
test("automatic local timer expires old offers and sends Wave 3 WITHOUT Admin Due Scan",async()=>{
  shifted=Date.now()+190000;
  const worker=createDemoFollowupWorker({
    db,FieldValue,clock,knownBarangays:known,intervalMs:300
  });
  worker.start();
  try{
    await until(async()=>{
      const x=await doc("emergencyAutoDispatchBatches",CASE1).get();
      return x.data()?.wave===3?x.data():null;
    },"background local timer -> citywide Wave 3");
    const list=await offers(CASE1);
    assert.equal(list.length,3,"Exactly one task for each eligible fictional person");
    for(const uid of [a,b]){
      assert.equal(list.find(x=>x.volunteerId===uid)?.status,"expired");
      assert.equal((await doc("autoVolunteerReservations",uid).get()).exists,false);
    }
    const fallback=list.find(x=>x.volunteerId===c);
    assert.equal(fallback.status,"offered");
    assert.equal(fallback.wave,3);
    assert.equal((await doc("autoVolunteerReservations",c).get()).data().caseId,CASE1);
    assert.equal((await doc("notifications",
      "auto_response_"+CASE1+"_"+c).get()).data().userId,c);
    assert.equal((await doc("adminActivityLogs",
      "auto_followup_"+CASE1+"_"+c).get()).exists,true);
    const next=await worker.tick();
    assert.equal(next.status,"scanned");
    assert.equal((await offers(CASE1)).length,3,"Repeated timer never duplicates");
    assert.equal(worker.status().reliableCloudScheduler,false);
    assert.equal(worker.status().processLocal,true);
  }finally{worker.stop()}
  assert.equal(worker.status().active,false);
});
test("an accepted fictional Wave 3 responder prevents later-wave invitations",async()=>{
  const decision=createDemoVolunteerDecision({
    db,FieldValue,clock:()=>shifted+1000
  });
  const accepted=await decision({uid:c,caseId:CASE1,decision:"accepted"});
  assert.equal(accepted.status,"accepted");
  assert.equal((await doc("emergencyAutoDispatchBatches",CASE1).get()).data().status,"supported");
  const scanner=createDemoFollowupScanner({db,FieldValue,
    clock:()=>shifted+500000,knownBarangays:known});
  const r=await scanner.scanCase(CASE1);
  assert.equal(r.status,"stopped_accepted");
  assert.equal((await offers(CASE1)).length,3);
});
test("cancelled fictional case expires offers and sends NO next-wave invitations",async()=>{
  await createApproved(CASE2);
  assert.deepEqual((await offers(CASE2)).map(x=>x.volunteerId).sort(),[a,b]);
  await doc("disasterCases",CASE2).update({
    status:"cancelled",dispatchBlocked:true
  });
  const scanner=createDemoFollowupScanner({
    db,FieldValue,clock:()=>Date.now()+200000,
    knownBarangays:known
  });
  const outcome=await scanner.scanCase(CASE2);
  assert.equal(outcome.status,"cancelled");
  assert.equal((await doc("emergencyAutoDispatchBatches",CASE2).get()).data().status,"cancelled");
  assert.equal((await offers(CASE2)).length,2);
  assert.ok((await offers(CASE2)).every(x=>x.status==="expired"));
  assert.equal((await doc("autoVolunteerReservations",a).get()).exists,false);
  assert.equal((await doc("autoVolunteerReservations",b).get()).exists,false);
  assert.equal((await doc("notifications",
    "auto_response_"+CASE2+"_"+c).get()).exists,false);
});
test("if all attempts expire and other eligible Volunteers are busy, demand Admin review",async()=>{
  await createApproved(CASE3);
  const scanner=createDemoFollowupScanner({
    db,FieldValue,clock:()=>Date.now()+200000,
    knownBarangays:known
  });
  const response=await scanner.scanCase(CASE3);
  assert.equal(response.status,"exhausted");
  assert.equal((await doc("emergencyAutoDispatchBatches",CASE3).get()).data().status,"exhausted");
  assert.equal((await doc("disasterCases",CASE3).get()).data()
    .autoVolunteerDispatch.state,"needs_admin_review");
  assert.equal((await offers(CASE3)).length,2);
  assert.equal((await doc("responderLocks",c).get()).data().caseId,CASE1,
    "Accepted previous responder lock must never be changed");
  const replay=await scanner.scanCase(CASE3);
  assert.equal(replay.status,"already_finished");
});
test.after(async()=>{await deleteApp(app)});
