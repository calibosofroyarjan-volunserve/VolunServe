"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {manualOfferConflictReason,volunteerTransitionConflictReason,isAutoOffer}
  =require("../lib/emergencyVolunteerWinnerGuard");

const incident=()=>({id:"case_001",verificationStatus:"validated",
  status:"assigned",reporterUid:"resident_001"});
const manualOffer=(id="case_001_volunteer_a",uid="volunteer_a")=>({
  id,volunteerId:uid,status:"offered"
});
test("fresh manual Admin offer still works; same declined task may be reoffered",()=>{
  assert.equal(manualOfferConflictReason(incident(),"case_001_volunteer_a","volunteer_a"),null);
  assert.equal(manualOfferConflictReason({...incident(),
    activeVolunteerSupportAssignmentId:"case_001_volunteer_a",
    activeVolunteerSupportUid:"volunteer_a"},
  "case_001_volunteer_a","volunteer_a"),null);
});
test("accepted automatic winner takes precedence even when manual offer UID matches",()=>{
  const c={...incident(),autoVolunteerAcceptedAssignmentId:"case_001_volunteer_a",
    activeVolunteerSupportUid:"volunteer_a",
    activeVolunteerSupportAssignmentId:"case_001_volunteer_a"};
  for(const id of ["case_001_volunteer_a","case_001_volunteer_b"]){
    const reason=manualOfferConflictReason(c,id,"volunteer_a");
    assert.match(reason,/already accepted/i);
  }
});
test("different active manual offer cannot be overwritten",()=>{
  for(const c of [
    {...incident(),activeVolunteerSupportAssignmentId:"case_001_volunteer_a"},
    {...incident(),activeVolunteerSupportUid:"volunteer_a"}
  ]){
    const reason=manualOfferConflictReason(c,"case_001_volunteer_b","volunteer_b");
    assert.match(reason,/Another Volunteer support offer/i);
  }
});
test("blocked and missing case cannot create a new manual offer",()=>{
 assert.ok(manualOfferConflictReason(null,"case_001_a","a"));
 assert.match(manualOfferConflictReason({...incident(),dispatchBlocked:true},
  "case_001_a","a"),/not accepting/i);
});
test("legacy manual acceptance allowed when selected pointer matches",()=>{
  const a=manualOffer();
  assert.equal(volunteerTransitionConflictReason({...incident(),
    activeVolunteerSupportAssignmentId:a.id,
    activeVolunteerSupportUid:a.volunteerId},a,"accepted"),null);
  assert.equal(volunteerTransitionConflictReason({...incident()},
    a,"accepted"),null,"legacy manual records with empty pointer stay usable");
  assert.equal(volunteerTransitionConflictReason(null,a,"declined"),null);
});
test("stale manual Accept blocked when case points to another responder",()=>{
 const a=manualOffer();
 for(const status of ["accepted","responding","on_site","completed"]){
  const reason=volunteerTransitionConflictReason({...incident(),
    activeVolunteerSupportAssignmentId:"case_001_volunteer_b",
    activeVolunteerSupportUid:"volunteer_b"},a,status);
  assert.match(reason,/no longer selected/i,status);
 }
});
test("accepted automatic winner blocks a legacy manual Volunteer acceptance",()=>{
 const a=manualOffer();
 const reason=volunteerTransitionConflictReason({...incident(),
   autoVolunteerAcceptedAssignmentId:"case_001_volunteer_b"},a,"accepted");
 assert.match(reason,/Another Volunteer/i);
});
test("automatic offers cannot be directly accepted or declined via legacy Web/Mobile client",()=>{
 for(const next of ["accepted","declined"]){
  const a={...manualOffer(),offerMode:"automatic_wave_proposed"};
  assert.equal(isAutoOffer(a),true);
  assert.match(volunteerTransitionConflictReason(null,a,next),
    /requires secure server confirmation/i);
 }
});
test("automatic accepted lifecycle is allowed ONLY for matching winner, pointer and UID",()=>{
 const a={...manualOffer(),offerMode:"automatic_wave_proposed",status:"accepted"};
 const selected={...incident(),autoVolunteerAcceptedAssignmentId:a.id,
   activeVolunteerSupportAssignmentId:a.id,
   activeVolunteerSupportUid:a.volunteerId};
 for(const next of ["responding","on_site","completed"]){
  assert.equal(volunteerTransitionConflictReason(selected,a,next),null,next);
  assert.match(volunteerTransitionConflictReason({...selected,
    activeVolunteerSupportUid:"volunteer_b"},a,next),
    /not the confirmed responder/i,next);
 }
});
test("guard code is shared by LIVE Admin and BOTH Volunteer variants; no remote deployment hooks",()=>{
 const root=path.resolve(__dirname,"..");
 const admin=fs.readFileSync(path.join(root,"app/(admin)/admin-cases.tsx"),"utf8");
 const web=fs.readFileSync(path.join(root,"app/(tabs)/volunteer.web.tsx"),"utf8");
 const mobile=fs.readFileSync(path.join(root,"app/(tabs)/volunteer.tsx"),"utf8");
 const helper=fs.readFileSync(path.join(root,"lib/emergencyVolunteerWinnerGuard.js"),"utf8");
 const backend=fs.readFileSync(path.join(root,"backend/server.js"),"utf8");
 assert.match(admin,/import \{ manualOfferConflictReason \} from "\.\.\/\.\.\/lib\/emergencyVolunteerWinnerGuard"/);
 assert.match(admin,/const winnerConflict = manualOfferConflictReason\(\s*currentCase,\s*assignmentRef\.id,\s*volunteer\.uid/);
 assert.ok(admin.indexOf("const winnerConflict = manualOfferConflictReason") >
   admin.indexOf("await runTransaction(db, async (transaction) => {",admin.indexOf("const assignVolunteerToCase")));
 assert.ok(admin.indexOf("const winnerConflict = manualOfferConflictReason") <
   admin.indexOf("transaction.update(caseRef, casePatch);",admin.indexOf("const assignVolunteerToCase")));
 for(const s of [web,mobile]){
  assert.match(s,/import \{ volunteerTransitionConflictReason \} from "\.\.\/\.\.\/lib\/emergencyVolunteerWinnerGuard"/);
  assert.match(s,/const conflict = volunteerTransitionConflictReason\(/);
  assert.ok(s.indexOf("const conflict = volunteerTransitionConflictReason") <
    s.indexOf("transaction.update(assignmentRef, patch)",s.indexOf("const transitionAssignment")));
 }
 for(const s of [helper,backend]){
  assert.equal(/STAGING_E2E_002/.test(s),false);
 }
 for(const banned of ["firebase-admin","runTransaction(","setInterval(","app.post("]){
  assert.ok(!helper.includes(banned),"pure guard must not touch live backend: "+banned);
 }
 assert.ok(!backend.includes("autoVolunteerAtomicDecisionPolicy"),
   "No production automatic dispatch import is allowed");
});
