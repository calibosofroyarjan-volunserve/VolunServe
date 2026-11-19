"use strict";
/**
 * Real Firebase Firestore + Functions EMULATOR E2E.
 * No real Firebase IDs, device tokens, outside requests, or actual emergencies.
 *
 * CI runs this ONLY under:
 * firebase emulators:exec --project demo-volunserve-auto-phase4
 *   --only firestore,functions "node --test functions/test-autoInviteApprovalEmulator.cjs"
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {
  createDemoApprovedCaseInviteHandler,explicitDemoGate,TEST_CATEGORY
}=require("./emergencyAutoInviteOnApproval");
const PROJECT="demo-volunserve-auto-phase4";
if(process.env.GCLOUD_PROJECT!==PROJECT ||
   process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"||
   process.env.VOLUNSERVE_AUTO_VOLUNTEER_TEST_TRIGGER!=="enabled"||
   process.env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH==="enabled"||
   !explicitDemoGate(process.env)){
  throw Error("Refusing Auto Volunteer test outside fictional emulators");
}
const app=initializeApp({projectId:PROJECT},"auto_invite_e2e_"+process.pid);
const db=getFirestore(app);
const doc=(name,id)=>db.collection(name).doc(id);
const admin="auto_invite_fictional_admin";
const reporter="auto_invite_fictional_reporter";
const makeVolunteer=(uid,overrides={})=>({
  role:"volunteer",status:"approved",volunteerAccess:true,
  volunteerStatus:"approved",identityVerified:true,
  barangay:"Bagong Buhay I",fullName:"Fictional "+uid,
  skills:["First Aid"],...overrides
});
async function seedBase(){
  const batch=db.batch();
  batch.set(doc("users",admin),{
    role:"admin",status:"approved",adminStatus:"active",testOnly:true
  });
  batch.set(doc("users",reporter),{
    role:"resident",status:"approved",testOnly:true
  });
  for(const [uid,profile] of [
    ["auto_qa_a",makeVolunteer("A")],
    ["auto_qa_b",makeVolunteer("B")],
    ["auto_qa_wrong_area",makeVolunteer("Citrus",{barangay:"Citrus"})],
    ["auto_qa_unverified",makeVolunteer("Unverified",{identityVerified:false})],
    ["auto_qa_blocked",makeVolunteer("Blocked",{status:"suspended"})]
  ]){
    batch.set(doc("users",uid),{...profile,testOnly:true});
    batch.set(doc("volunteerApplications",uid),{
      uid,status:"approved",skills:["First Aid"],testOnly:true
    });
  }
  await batch.commit();
}
function pendingCase(id){
  return {id,reporterUid:reporter,
    title:"FICTIONAL EMULATOR TRAINING REPORT",
    status:"reported",verificationStatus:"pending_verification",
    dispatchBlocked:true,incidentBarangay:"Bagong Buhay I",
    requiredSkills:["First Aid"],testOnly:true,testCategory:TEST_CATEGORY
  };
}
function approvedCase(id){
  return {...pendingCase(id),status:"validated",
    verificationStatus:"validated",dispatchBlocked:false,
    validatedBy:admin};
}
async function awaitState(pred,description,ms=45000){
  const until=Date.now()+ms;
  let last=null;
  while(Date.now()<until){
    last=await pred();
    if(last)return last;
    await new Promise(resolve=>setTimeout(resolve,400));
  }
  throw Error("Timed out waiting for "+description);
}
async function countCaseOffers(id){
  const all=await db.collection("responseAssignments")
    .where("caseId","==",id).get();
  return all.docs;
}
test("actual Firestore Admin approval event sends TWO automatic Volunteer invitations",async()=>{
  await seedBase();
  const id="DEMO_AUTO_CASE_TRIG_001";
  await doc("disasterCases",id).create(pendingCase(id));
  const before=await doc("emergencyAutoDispatchBatches",id).get();
  assert.equal(before.exists,false,"Must not invite before Admin approval");
  await doc("disasterCases",id).update({
    status:"validated",verificationStatus:"validated",
    dispatchBlocked:false,validatedBy:admin,
    validatedAt:FieldValue.serverTimestamp()
  });
  await awaitState(async()=>{
    const b=await doc("emergencyAutoDispatchBatches",id).get();
    return b.exists?b.data():null;
  },"automatic Firestore onDocumentUpdated dispatch");
  const docs=await countCaseOffers(id);
  assert.equal(docs.length,2);
  assert.deepEqual(docs.map(s=>s.data().volunteerId).sort(),
    ["auto_qa_a","auto_qa_b"]);
  for(const uid of ["auto_qa_a","auto_qa_b"]){
    const a=await doc("responseAssignments",id+"_"+uid).get();
    const n=await doc("notifications","auto_response_"+id+"_"+uid).get();
    const r=await doc("autoVolunteerReservations",uid).get();
    assert.equal(a.data().status,"offered");
    assert.equal(a.data().createdBy,"automatic_matching_engine");
    assert.equal(n.data().userId,uid);
    assert.equal(n.data().type,"response_assignment");
    assert.equal(r.data().caseId,id);
  }
  assert.equal((await doc("responseAssignments",id+"_auto_qa_wrong_area").get()).exists,false);
  assert.equal((await doc("responseAssignments",id+"_auto_qa_unverified").get()).exists,false);
  assert.equal((await doc("responseAssignments",id+"_auto_qa_blocked").get()).exists,false);
  const caseNow=(await doc("disasterCases",id).get()).data();
  assert.equal(caseNow.status,"assigned");
  assert.equal(caseNow.autoVolunteerDispatch.state,"waiting");
});
test("replaying the same event never duplicates tasks, notices or reservations",async()=>{
  const id="DEMO_AUTO_CASE_TRIG_001";
  const handler=createDemoApprovedCaseInviteHandler({
    db,FieldValue,knownBarangays:["Bagong Buhay I","Citrus"]
  });
  const event={params:{caseId:id},data:{
    before:{data:()=>pendingCase(id)},
    after:{data:()=>approvedCase(id)}
  }};
  const result=await handler(event);
  assert.equal(result.status,"already_started");
  assert.equal((await countCaseOffers(id)).length,2);
  assert.equal((await doc("notifications","auto_response_"+id+"_auto_qa_a").get()).exists,true);
});
test("two concurrent server trigger attempts cannot duplicate invitations",async()=>{
  const id="DEMO_AUTO_CASE_DIRECT_002";
  await doc("users","auto_qa_d").create(makeVolunteer("D"));
  await doc("volunteerApplications","auto_qa_d").create({
    uid:"auto_qa_d",status:"approved",skills:["First Aid"]
  });
  await doc("users","auto_qa_e").create(makeVolunteer("E"));
  await doc("volunteerApplications","auto_qa_e").create({
    uid:"auto_qa_e",status:"approved",skills:["First Aid"]
  });
  await doc("disasterCases",id).create(approvedCase(id));
  const handler=createDemoApprovedCaseInviteHandler({
    db,FieldValue,knownBarangays:["Bagong Buhay I","Citrus"]
  });
  const event={params:{caseId:id},data:{
    before:{data:()=>pendingCase(id)},
    after:{data:()=>approvedCase(id)}
  }};
  const responses=await Promise.all([handler(event),handler(event)]);
  assert.ok(responses.some(r=>r.status==="offered"),
    JSON.stringify(responses));
  assert.ok(responses.every(r=>["offered","already_started"].includes(r.status)),
    JSON.stringify(responses));
  assert.deepEqual((await countCaseOffers(id))
    .map(d=>d.data().volunteerId).sort(),["auto_qa_d","auto_qa_e"]);
});
test("fake approval, wrong project or real case are never invited",async()=>{
  const id="DEMO_AUTO_CASE_UNAPPROVED_003";
  await doc("disasterCases",id).create(approvedCase(id));
  await doc("disasterCases",id).update({validatedBy:"no_such_admin"});
  const h=createDemoApprovedCaseInviteHandler({
    db,FieldValue,knownBarangays:["Bagong Buhay I","Citrus"]
  });
  const event={params:{caseId:id},data:{
    before:{data:()=>pendingCase(id)},
    after:{data:()=>({...approvedCase(id),validatedBy:"no_such_admin"})}
  }};
  const r=await h(event);
  assert.equal(r.reason,"admin_approval_not_authorized");
  assert.equal((await countCaseOffers(id)).length,0);
  const ignored=await h({params:{caseId:"real_incident_123"},data:{
    before:{data:()=>pendingCase("real_incident_123")},
    after:{data:()=>approvedCase("real_incident_123")}
  }});
  assert.equal(ignored.status,"ignored");
  assert.equal(explicitDemoGate({...process.env,GCLOUD_PROJECT:"volunserve-3aa5b"}),false);
  assert.equal(explicitDemoGate({...process.env,VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"enabled"}),false);
});
test.after(async()=>{await deleteApp(app);});
