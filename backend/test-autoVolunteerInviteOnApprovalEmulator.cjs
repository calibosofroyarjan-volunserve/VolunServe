"use strict";
/**
 * REAL Firebase Firestore EMULATOR integration test; no production credentials
 * and no real emergency data. All records are fictional.
 */
const test=require("node:test");
const {beforeEach}=require("node:test");
const assert=require("node:assert/strict");
const {db}=require("./firebaseAdmin");
const {inviteAfterApproval,releaseGate,candidateOK,caseReady,MAX_ATOMIC_TARGETS}=
  require("./autoVolunteerInviteOnApproval");
const PROJECT="demo-volunserve-auto-invites-20261119";
if(process.env.GCLOUD_PROJECT!==PROJECT ||
   process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080" ||
   process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
   process.env.GOOGLE_APPLICATION_CREDENTIALS){
  throw Error("SAFEGUARD: tests require ONLY fictional local Firestore emulator");
}
const GOOD={
  VOLUNSERVE_AUTO_VOLUNTEER_INVITES_MODE:"enabled",
  VOLUNSERVE_AUTO_VOLUNTEER_RELEASE_REVIEWED:"yes",
  VOLUNSERVE_AUTO_VOLUNTEER_EXPLICIT_PRODUCTION_APPROVAL:"yes",
  VOLUNSERVE_AUTO_VOLUNTEER_TARGET_PROJECT:"volunserve-3aa5b"
};
const PROJECT_ID="volunserve-3aa5b";
const coll=(name,id)=>db.collection(name).doc(id);
beforeEach(async()=>{
  // Every case sees a clean fictional roster and no stale reservations.
  for(const collection of await db.listCollections())
    await db.recursiveDelete(collection);
});
async function set(name,id,value){await coll(name,id).set(value)}
const base={
  status:"validated",verificationStatus:"validated",
  validatedBy:"fictional_admin_1",reporterUid:"fictional_resident_1",
  incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],
  title:"TEST ONLY — fictional response report",dispatchBlocked:false
};
function person(uid,overrides={}){
  return {uid,role:"volunteer",status:"approved",volunteerAccess:true,
    volunteerStatus:"approved",identityVerified:true,
    barangay:"Bagong Buhay I",skills:["First Aid"],
    fullName:"Fictional Volunteer "+uid,...overrides};
}
async function seed(caseId,modifiers={}){
  await set("disasterCases",caseId,{...base,...modifiers});
  for(const [uid,changes] of Object.entries({
    "fictional_v1":{},
    "fictional_v2":{},
    "fictional_noid":{identityVerified:false,identityStatus:"basic"},
    "fictional_far":{barangay:"Citrus"},
    "fictional_resident_1":{},
    "fictional_busy":{}
  })){
    await set("users",uid,person(uid,changes));
    await set("volunteerApplications",uid,{
      uid,status:"approved",skills:["First Aid"]
    });
  }
  // A Volunteer busy on a different case must not receive new offers.
  await set("responseAssignments","fictional_other_case_fictional_busy",{
    caseId:"fictional_other_case",volunteerId:"fictional_busy",
    status:"offered",createdBy:"test"
  });
}
function call(caseId,options={}){
  return inviteAfterApproval({
    db,env:GOOD,credentialProject:PROJECT_ID,
    caseId,adminUid:"fictional_admin_1",now:Date.now(),
    ...options
  });
}

test("production gate is DISABLED by default and refuses mismatched project",()=>{
  assert.equal(releaseGate({},PROJECT_ID).enabled,false);
  assert.equal(releaseGate({...GOOD,VOLUNSERVE_AUTO_VOLUNTEER_RELEASE_REVIEWED:"no"},PROJECT_ID).enabled,false);
  assert.equal(releaseGate(GOOD,"volunserve-volunteer-staging").enabled,false);
  assert.equal(releaseGate(GOOD,PROJECT_ID).enabled,true);
  assert.equal(caseReady({...base,status:"reported"}),false);
  assert.equal(candidateOK(base,person("v",{skills:{unsafe:true}}),{status:"approved",skills:["First Aid"]}),true);
});
test("blocked live gate causes zero writes",async()=>{
  const r=await call("dummy_disabled",{env:{}});
  assert.equal(r.status,"blocked");
  assert.equal(r.offersWritten,false);
});
test("real Firestore transaction invites EVERY eligible fictional same-barangay Volunteer atomically",async()=>{
  const caseId="fictional_wave1_auto_invite_1";
  await seed(caseId);
  const first=await call(caseId);
  assert.equal(first.status,"offered",JSON.stringify(first));
  assert.equal(first.offered,2);
  assert.equal(first.partial,false);
  const batch=(await coll("emergencyAutoDispatchBatches",caseId).get()).data();
  assert.equal(batch.volunteerCount,2);
  assert.equal(batch.wave,1);
  assert.equal((await coll("disasterCases",caseId).get()).data().autoVolunteerDispatch.state,"waiting");
  for(const uid of ["fictional_v1","fictional_v2"]){
    const aid=caseId+"_"+uid;
    const offer=(await coll("responseAssignments",aid).get()).data();
    assert.equal(offer.status,"offered");
    assert.equal(offer.offerMode,"automatic_all_eligible_wave1");
    const notice=(await coll("notifications","auto_response_"+aid).get()).data();
    assert.equal(notice.userId,uid);
    assert.equal(notice.type,"response_assignment");
    const reservation=(await coll("autoVolunteerReservations",uid).get()).data();
    assert.equal(reservation.assignmentId,aid);
  }
  for(const uid of ["fictional_noid","fictional_far","fictional_busy",
    "fictional_resident_1"]){
    assert.equal((await coll("responseAssignments",caseId+"_"+uid).get()).exists,false,
      uid+" must not be automatically offered");
  }
  const second=await call(caseId);
  assert.equal(second.ok,false);
  const n=await db.collection("notifications").where("caseId","==",caseId).get();
  assert.equal(n.size,2,"Retries must not duplicate notifications");
});
test("unapproved report never creates an invitation",async()=>{
  const caseId="fictional_case_unapproved";
  await seed(caseId,{verificationStatus:"pending_verification",status:"reported"});
  const r=await call(caseId);
  assert.equal(r.status,"blocked");
  assert.equal((await coll("emergencyAutoDispatchBatches",caseId).get()).exists,false);
});
test("active manual case blocks automated fanout",async()=>{
  const caseId="fictional_manual_exists";
  await seed(caseId);
  await set("responseAssignments",caseId+"_existing_manual",{
    caseId,volunteerId:"some_other",status:"offered"
  });
  const r=await call(caseId);
  assert.equal(r.reason,"existing_dispatch_or_offer_records");
  assert.equal((await coll("emergencyAutoDispatchBatches",caseId).get()).exists,false);
});
test("duplicate requests cannot generate duplicate batch invitations",async()=>{
  const caseId="fictional_duplicate_race";
  await seed(caseId);
  const settled=await Promise.allSettled([call(caseId),call(caseId)]);
  const success=settled.filter(x=>x.status==="fulfilled"&&x.value.ok===true);
  assert.equal(success.length,1);
  const n=await db.collection("notifications").where("caseId","==",caseId).get();
  assert.equal(n.size,2);
});
test("over-cap fanout is fully blocked, never secretly sends a partial subset",async()=>{
  const caseId="fictional_pool_over_cap";
  await seed(caseId);
  for(let n=0;n<MAX_ATOMIC_TARGETS;n++){
    const uid="fictional_added_"+n;
    await set("users",uid,person(uid));
    await set("volunteerApplications",uid,{uid,status:"approved",skills:["First Aid"]});
  }
  const r=await call(caseId);
  assert.equal(r.reason,"atomic_fanout_limit_requires_batched_engine");
  assert.equal((await coll("emergencyAutoDispatchBatches",caseId).get()).exists,false);
});
