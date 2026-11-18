"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {previewAllEligibleWave,previewEnabled}=require("./emergencyAutoVolunteerReadOnlyPlanner");
const enabled={VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW:"enabled",
  VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled"};
const C=()=>({
  id:"emergency001",reporterUid:"resident_reporter",
  title:"SIMULATED incident",verificationStatus:"validated",status:"validated",
  incidentBarangay:"Bagong Buhay I",dispatchBlocked:false,
  requiredSkills:["First Aid"]
});
function person(n,barangay="Bagong Buhay I",role="resident"){
  const uid="volunteer_"+n;
  return {uid,application:{uid,status:"approved",skills:["First Aid"]},
    user:{uid,role,status:"approved",volunteerAccess:true,
      volunteerStatus:"approved",identityStatus:"verified",
      barangay,skills:["First Aid"]}};
}
const P=(opts={})=>previewAllEligibleWave({
  env:enabled,caseData:C(),roster:[person(1),person(2)],
  existingAssignments:[],activeLocks:[],sourceScansComplete:true,
  ...opts
});
test("default OFF; no explicit preview flag means no offers, and dispatch flag never enables planner",()=>{
  const d=P({env:{}});
  assert.equal(d.status,"blocked");
  assert.equal(d.reason,"feature_off_by_default");
  assert.equal(d.dispatchEnabled,false);
  assert.equal(d.readOnly,true);
  assert.equal(previewEnabled({}),false);
  assert.equal(previewEnabled({VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"enabled"}),false);
  assert.equal(previewEnabled(enabled),true);
});
test("read-only Wave 1 selects ALL eligible same-barangay Volunteers once, deterministic order",()=>{
  const d=P();
  assert.equal(d.status,"preview_only");
  assert.equal(d.wave,1);
  assert.deepEqual(d.offerCandidateUids,["volunteer_1","volunteer_2"]);
  assert.equal(d.candidateCount,2);
  assert.equal(d.dispatchEnabled,false);
  assert.equal(d.readOnly,true);
});
test("real case must be validated and cannot have existing manual pointer",()=>{
  for(const change of [
    {status:"reported"},{verificationStatus:"pending"},
    {status:"rejected"},{status:"closed"},
    {status:"validated",dispatchBlocked:true},
    {activeVolunteerSupportUid:"existingVolunteer"},
    {activeVolunteerSupportAssignmentId:"manual_task_1"}
  ]){
    const result=P({caseData:{...C(),...change}});
    assert.equal(result.status,"blocked");
    assert.notEqual(result.reason,"no_verified_eligible_volunteers");
  }
});
test("never infer incident barangay from Resident home barangay",()=>{
  const c={...C(),reporterBarangay:"Bagong Buhay I"};
  delete c.incidentBarangay;
  assert.equal(P({caseData:c}).reason,"incident_barangay_unverified_or_outside_sjdm");
  assert.equal(P({caseData:{...C(),incidentBarangay:"Quezon City"}}).status,"blocked");
});
test("incomplete sources cannot be treated as ALL eligible candidates",()=>{
  for(const changes of [
    {sourceScansComplete:false},{roster:null},{activeLocks:null},
    {existingAssignments:null}
  ])assert.equal(P(changes).reason,"complete_trusted_source_snapshots_required");
});
test("existing manual/accepted/offered and unknown case task statuses block any new batch",()=>{
  for(const status of ["offered","accepted","responding","on_site","completed","unexpected"]){
    const d=P({existingAssignments:[{caseId:"emergency001",volunteerId:"other",status}]});
    assert.equal(d.status,"blocked",status);
  }
  assert.equal(P({activeLocks:[{caseId:"emergency001",responderUid:"other"}]}).status,"blocked");
});
test("previously declined and busy on another case excluded from subsequent offer",()=>{
  const d=P({
    existingAssignments:[
      {caseId:"emergency001",volunteerId:"volunteer_1",status:"declined"},
      {caseId:"other_case",volunteerId:"volunteer_2",status:"offered"}
    ]
  });
  assert.equal(d.reason,"no_verified_eligible_volunteers");
  assert.equal(d.exclusions.previous_offer_or_busy,2);
  const withLock=P({activeLocks:[{responderUid:"volunteer_2",caseId:"other_case",
    status:"accepted"}]});
  assert.equal(withLock.status,"preview_only");
  assert.deepEqual(withLock.offerCandidateUids,["volunteer_1"]);
});
test("require approved application, account, capability, identity and specialized skills",()=>{
  const cases=[
    {application:{uid:"volunteer_1",status:"pending",skills:["First Aid"]}},
    {user:{...person(1).user,status:"suspended"}},
    {user:{...person(1).user,role:"admin"}},
    {user:{...person(1).user,volunteerAccess:false}},
    {user:{...person(1).user,identityStatus:"pending"}},
    {user:{...person(1).user,skills:["Baking"]},application:{uid:"volunteer_1",status:"approved",skills:["Baking"]}}
  ];
  for(const patch of cases){
    const changed={...person(1),...patch};
    const result=P({roster:[changed]});
    assert.equal(result.status,"blocked");
  }
});
test("Resident cannot be offered their own incident even if approved Volunteer",()=>{
  const uid="volunteer_1";
  const d=P({caseData:{...C(),reporterUid:uid}});
  assert.equal(d.status,"preview_only");
  assert.deepEqual(d.offerCandidateUids,["volunteer_2"]);
  assert.equal(d.exclusions.self_report,1);
});
test("without reviewed adjacency, skip Wave 2; Wave 3 contains SJDM-only users",()=>{
  const d=P({roster:[person(1,"Bagong Buhay II"),person(2,"Citrus")]});
  assert.equal(d.wave,3);
  assert.equal(d.candidateCount,2);
  assert.equal(d.wave2RequiresReviewedAdjacency,true);
});
test("with explicitly reviewed SJDM neighbors, Wave 2 receives all matching, Wave 3 remains fallback",()=>{
  const list=[person(1,"Bagong Buhay II"),person(2,"Citrus")];
  const base={roster:list,neighborsByBarangay:{"Bagong Buhay I":["Bagong Buhay II"]},
    neighborMapReviewed:true};
  const first=P(base);
  assert.equal(first.wave,2);
  assert.deepEqual(first.offerCandidateUids,["volunteer_1"]);
  const next=P({...base,completedWaves:[1,2]});
  assert.equal(next.wave,3);
  assert.deepEqual(next.offerCandidateUids,["volunteer_2"]);
});
test("unreviewed or invalid neighbor map cannot create fake nearby assignments",()=>{
  for(const map of [
    {"Bagong Buhay I":["Unknown Place"]},
    {"Not A Barangay":["Citrus"]},
    {"Bagong Buhay I":["Bagong Buhay I"]}
  ]){
    const d=P({roster:[person(1,"Citrus")],neighborsByBarangay:map,
      neighborMapReviewed:true});
    assert.equal(d.wave,3);
    assert.equal(d.wave2RequiresReviewedAdjacency,true);
  }
});
test("duplicate UIDs and mismatched account/profile IDs cannot double-offer",()=>{
  const d=P({roster:[person(1),person(1),{...person(2),
    user:{...person(2).user,uid:"someoneElse"}}]});
  assert.equal(d.status,"preview_only");
  assert.deepEqual(d.offerCandidateUids,["volunteer_1"]);
  assert.equal(d.exclusions.missing_duplicate_or_mismatched_uid,2);
});
test("exceeding audited 40-per-wave and 200-source caps blocks rather than silently truncating",()=>{
  const big=Array.from({length:41},(_,i)=>person(i+1));
  assert.equal(P({roster:big}).reason,"wave_over_audited_fanout_limit");
  assert.equal(P({roster:Array.from({length:201},(_,i)=>person(i+1))}).reason,
    "source_pool_exceeds_audited_preview_limit");
});
test("planner is a pure module, has no database/socket imports and never changes inputs",()=>{
  const source=fs.readFileSync(path.join(__dirname,
    "emergencyAutoVolunteerReadOnlyPlanner.js"),"utf8");
  for(const banned of [
    "firebase-admin","firestore","runTransaction(","setInterval(",
    "app.post(","app.get(","fetch(","STAGING_E2E_002","volunserve-volunteer-staging"
  ])assert.ok(!source.includes(banned),"unexpected side-effect or staging reference: "+banned);
  const original={caseData:C(),roster:[person(1)],existingAssignments:[],activeLocks:[]};
  const before=JSON.stringify(original);
  const d=P(original);
  assert.equal(d.status,"preview_only");
  assert.equal(JSON.stringify(original),before);
});
