"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {planApprovedEmergencyVolunteerInvites:plan}=
  require("./emergencyAutoInviteCompatibility");

const known=["Bagong Buhay I","Citrus","Sapang Palay Proper"];
const incident={
  id:"fictional_approved_report_001",status:"validated",
  verificationStatus:"validated",dispatchBlocked:false,
  reporterUid:"fictional_resident",incidentBarangay:"Bagong Buhay I",
  requiredSkills:["First Aid"]
};
function volunteer(uid,patch={}){
  const role=patch.role||"volunteer";
  return {uid,application:{
      uid,status:patch.applicationStatus||"approved",
      skills:patch.skills===undefined?["First Aid"]:patch.skills
    },
    user:{
      role,status:patch.accountStatus||"approved",
      volunteerAccess:patch.volunteerAccess===undefined?true:patch.volunteerAccess,
      volunteerStatus:patch.volunteerStatus||"approved",
      identityVerified:patch.identityVerified===undefined?true:patch.identityVerified,
      barangay:patch.barangay||"Bagong Buhay I",
      fullName:"Fictional "+uid,
      skills:patch.skills===undefined?["First Aid"]:patch.skills
    }
  };
}
const args={incident,knownBarangays:known};
test("verified Admin-approved case plans all eligible same-barangay invitations",()=>{
  const r=plan({...args,roster:[
    volunteer("fictional_b"),volunteer("fictional_a"),volunteer("fictional_a")
  ]});
  assert.equal(r.status,"ready");
  assert.equal(r.productionDispatchEnabled,false);
  assert.equal(r.readOnly,true);
  assert.equal(r.wave,1);
  assert.deepEqual(r.offers.map(x=>x.volunteerUid),
    ["fictional_a","fictional_b"]);
  assert.deepEqual(r.offers.map(x=>x.notificationId),[
    "auto_response_fictional_approved_report_001_fictional_a",
    "auto_response_fictional_approved_report_001_fictional_b"
  ]);
});
test("must not mix automatic offers with active legacy Admin assignments",()=>{
  for(const patch of [
    {activeVolunteerSupportAssignmentId:"existing_1"},
    {activeVolunteerSupportUid:"fictional_assigned"},
    {autoVolunteerDispatch:{state:"waiting"}}
  ]){
    const result=plan({...args,incident:{...incident,...patch},
      roster:[volunteer("fictional_a")]});
    assert.equal(result.status,"blocked");
    assert.equal(result.reason,"existing_legacy_or_auto_assignment");
  }
  const r=plan({...args,caseAssignments:[
    {caseId:incident.id,volunteerId:"fictional_assigned",status:"declined"}
  ],roster:[volunteer("fictional_a")]});
  assert.equal(r.reason,"existing_case_assignment_requires_review");
});
test("no invitations for not validated, blocked or closed incidents",()=>{
  for(const patch of [
    {status:"reported"}, {verificationStatus:"pending_verification"},
    {dispatchBlocked:true}, {status:"closed"},
    {resolvedAt:"2026-11-19"}, {closedAt:"2026-11-19"}
  ]){
    assert.equal(plan({...args,incident:{...incident,...patch},
      roster:[volunteer("fictional_a")]}).status,"blocked");
  }
});
test("exclude reporter, busy, blocked, unverified, wrong skills and wrong area",()=>{
  const r=plan({...args,roster:[
    volunteer("fictional_resident"),
    volunteer("fictional_busy"),
    volunteer("fictional_disabled",{accountStatus:"suspended"}),
    volunteer("fictional_revoked",{volunteerAccess:false}),
    volunteer("fictional_unverified",{identityVerified:false}),
    volunteer("fictional_wrong_skill",{skills:["Cooking"]}),
    volunteer("fictional_elsewhere",{barangay:"Citrus"}),
    volunteer("fictional_eligible")
  ],activeAssignments:[{volunteerId:"fictional_busy",status:"responding"}]});
  assert.deepEqual(r.offers.map(x=>x.volunteerUid),["fictional_eligible"]);
  assert.equal(r.exclusions.reporter_cannot_volunteer,1);
  assert.equal(r.exclusions.already_busy,1);
  assert.equal(r.exclusions.unapproved_or_blocked_volunteer,2);
  assert.equal(r.exclusions.identity_not_verified,1);
  assert.equal(r.exclusions.skills_not_verified,1);
  assert.equal(r.exclusions.outside_verified_same_barangay,1);
});
test("reject unapproved or missing SJDM barangay configuration",()=>{
  assert.equal(plan({...args,knownBarangays:[],roster:[
    volunteer("fictional_a")
  ]}).reason,"unverified_sjdm_barangay_configuration");
  assert.equal(plan({...args,incident:{...incident,incidentBarangay:"Quezon City"},
    roster:[volunteer("fictional_a")]}).reason,"unverified_case_barangay");
});
test("refuse >40 atomic invite writes, no silent truncation",()=>{
  const roster=Array.from({length:41},(_,i)=>volunteer("fictional_"+String(i).padStart(3,"0")));
  const r=plan({...args,roster});
  assert.equal(r.status,"blocked");
  assert.equal(r.reason,"atomic_wave_exceeds_limit");
  assert.equal(r.eligibleCount,41);
  assert.equal(r.offers.length,0);
});
test("never allow backend contract to mutate source objects",()=>{
  const row=volunteer("fictional_a");
  const before=JSON.stringify({incident,row});
  const r=plan({...args,roster:[row]});
  assert.equal(r.status,"ready");
  assert.equal(JSON.stringify({incident,row}),before);
});
test("wrong candidate identity or Admin role must not receive invitations",()=>{
  const row=volunteer("fictional_a");
  row.application.uid="fictional_b";
  const r=plan({...args,roster:[row,volunteer("fictional_admin",{role:"admin"})]});
  assert.equal(r.offers.length,0);
  assert.equal(r.exclusions.invalid_volunteer_identity,1);
  assert.equal(r.exclusions.unapproved_or_blocked_volunteer,1);
});
