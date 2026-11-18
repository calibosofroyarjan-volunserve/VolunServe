"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {proposeAutoVolunteerDecision,enabled,ASSIGNMENT_MODE}
  =require("./autoVolunteerAtomicDecisionPolicy");
const now=Date.UTC(2026,10,19,8,0,0);
const env={VOLUNSERVE_AUTO_VOLUNTEER_DECISION_REVIEW:"enabled",
 VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled"};
function make(uid="volunteer_001"){
 const cid="incident_001",aid=cid+"_"+uid;
 return {
  env,decision:"accepted",now,verifiedNoOtherActiveAssignments:true,
  caseData:{id:cid,reporterUid:"resident_reporter",status:"assigned",
    verificationStatus:"validated",incidentBarangay:"Bagong Buhay I",
    requiredSkills:["First Aid"]},
  assignment:{id:aid,caseId:cid,volunteerId:uid,
    offerMode:ASSIGNMENT_MODE,status:"offered",expiresAtMs:now+180000},
  volunteer:{uid,status:"approved",role:"resident",volunteerAccess:true,
    volunteerStatus:"approved",identityVerified:true,
    skills:["First Aid"],barangay:"Bagong Buhay I"},
  application:{uid,status:"approved",skills:["First Aid"]},
  reservation:{uid,caseId:cid,assignmentId:aid},lock:null
 };
}
test("defaults OFF and refuses dispatch-enabled flag even with review enabled",()=>{
 const input=make();
 for(const cfg of [{},{VOLUNSERVE_AUTO_VOLUNTEER_DECISION_REVIEW:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"enabled"}]){
  const r=proposeAutoVolunteerDecision({...input,env:cfg});
  assert.equal(r.status,"blocked");
  assert.equal(r.reason,"review_mode_disabled");
 }
 assert.equal(enabled({}),false);
});
test("qualified pending offer proposes exactly one case winner and lock but does NOT apply writes",()=>{
 const input=make(),before=JSON.stringify(input);
 const p=proposeAutoVolunteerDecision(input);
 assert.equal(p.status,"proposed_only");
 assert.equal(p.decision,"accepted");
 assert.equal(p.readOnly,true);
 assert.equal(p.dispatchEnabled,false);
 assert.deepEqual(p.logicalWriteIntents.map(x=>x.kind),
   ["assignment_update","case_winner_update","responder_lock_create"]);
 assert.equal(p.logicalWriteIntents[1].autoVolunteerAcceptedAssignmentId,input.assignment.id);
 assert.equal(p.logicalWriteIntents[2].uid,input.volunteer.uid);
 assert.equal(JSON.stringify(input),before);
});
test("decline proposes assignment transition and reservation release, never active responder",()=>{
 const p=proposeAutoVolunteerDecision({...make(),decision:"declined"});
 assert.equal(p.status,"proposed_only");
 assert.deepEqual(p.logicalWriteIntents.map(x=>x.kind),
   ["assignment_update","reservation_delete"]);
 assert.equal(p.logicalWriteIntents.some(x=>x.kind==="case_winner_update"),false);
 assert.equal(p.logicalWriteIntents.some(x=>x.kind==="responder_lock_create"),false);
});
test("repeated accepted/declined decision yields no further write intent if fully consistent",()=>{
 const current=make();
 const first=proposeAutoVolunteerDecision(current);
 const caseData={...current.caseData,autoVolunteerAcceptedAssignmentId:current.assignment.id,
   activeVolunteerSupportAssignmentId:current.assignment.id,
   activeVolunteerSupportUid:current.volunteer.uid};
 const again=proposeAutoVolunteerDecision({...current,caseData,
   assignment:{...current.assignment,status:"accepted"},
   lock:{caseId:caseData.id,assignmentId:current.assignment.id,
     responderUid:current.volunteer.uid,status:"accepted"}});
 assert.equal(first.status,"proposed_only");
 assert.equal(again.status,"already_accepted");
 assert.equal(again.logicalWriteIntents,undefined);
 const decline=proposeAutoVolunteerDecision({...make(),decision:"declined",
   assignment:{...make().assignment,status:"declined"}});
 assert.equal(decline.status,"already_declined");
 assert.equal(decline.logicalWriteIntents,undefined);
});
test("corrupted duplicate replay never repairs or replaces the lock silently",()=>{
 const base=make();
 const p=proposeAutoVolunteerDecision({...base,
  caseData:{...base.caseData,autoVolunteerAcceptedAssignmentId:base.assignment.id,
   activeVolunteerSupportAssignmentId:base.assignment.id,
   activeVolunteerSupportUid:base.volunteer.uid},
  assignment:{...base.assignment,status:"accepted"},
  lock:{caseId:"another_case",assignmentId:base.assignment.id,status:"accepted"}});
 assert.equal(p.status,"blocked");
 assert.equal(p.reason,"offer_no_longer_pending");
});
test("expired and ambiguous deadlines deny both accept and decline",()=>{
 for(const exp of [now,now-1,undefined,null,"three minutes",{_seconds:1}])
  for(const decision of ["accepted","declined"]){
   const base=make();
   const p=proposeAutoVolunteerDecision({...base,decision,
     assignment:{...base.assignment,expiresAtMs:exp}});
   assert.equal(p.reason,"offer_expired_or_unknown");
  }
 const stamp={toMillis:()=>now+10000};
 assert.equal(proposeAutoVolunteerDecision({...make(),
   assignment:{...make().assignment,expiresAtMs:stamp}}).status,"proposed_only");
});
test("unverified/closed/cancelled cases and self-report block",()=>{
 const base=make();
 for(const patch of [{status:"reported"},{verificationStatus:"rejected"},
   {status:"resolved"},{closedAt:now},{resolvedAt:now},{dispatchBlocked:true}]){
  const p=proposeAutoVolunteerDecision({...base,caseData:{...base.caseData,...patch}});
  assert.equal(p.status,"blocked");
 }
 const self=proposeAutoVolunteerDecision({...base,
   caseData:{...base.caseData,reporterUid:base.volunteer.uid}});
 assert.equal(self.reason,"self_response_not_allowed");
});
test("role/status/identity/skill/revoked application fail closed",()=>{
 const base=make();
 const badUsers=[
   {status:"suspended"},{role:"admin"},{volunteerAccess:false},
   {volunteerStatus:"revoked"},{identityVerified:false,identityStatus:"pending"},
   {skills:["Baking"]}
 ];
 for(const patch of badUsers){
  const input={...base,volunteer:{...base.volunteer,...patch},
   application:patch.skills?{...base.application,skills:["Baking"]}:base.application};
  const p=proposeAutoVolunteerDecision(input);
  assert.equal(p.status,"blocked",JSON.stringify(patch));
 }
 const revoked=proposeAutoVolunteerDecision({...base,
   application:{...base.application,status:"pending"}});
 assert.equal(revoked.reason,"volunteer_approval_or_identity_missing");
});
test("manual Admin pointer or other accepted Volunteer blocks new acceptance",()=>{
 const base=make();
 for(const patch of [
  {activeVolunteerSupportUid:"manualVolunteer"},
  {activeVolunteerSupportAssignmentId:"manualAssignment"},
  {autoVolunteerAcceptedAssignmentId:"another_auto_offer"}
 ]){
  const p=proposeAutoVolunteerDecision({...base,caseData:{...base.caseData,...patch}});
  assert.equal(p.reason,"case_has_manual_or_accepted_responder");
 }
});
test("existing lock and missing/mismatched reservation or unproven busy scan block",()=>{
 const base=make();
 assert.equal(proposeAutoVolunteerDecision({...base,lock:{
   caseId:"other_case",responderUid:base.volunteer.uid
 }}).reason,"volunteer_already_locked");
 assert.equal(proposeAutoVolunteerDecision({...base,reservation:null}).reason,
   "reservation_not_owned");
 assert.equal(proposeAutoVolunteerDecision({...base,
   reservation:{...base.reservation,assignmentId:"wrong"}}).reason,
   "reservation_not_owned");
 assert.equal(proposeAutoVolunteerDecision({...base,
   verifiedNoOtherActiveAssignments:false}).reason,
   "active_assignment_scan_not_proven");
});
test("forged offer ID or mismatched case/UID cannot produce any write intents",()=>{
 const base=make();
 const variants=[
  {assignment:{...base.assignment,id:"forged"}},
  {assignment:{...base.assignment,caseId:"other_case"}},
  {assignment:{...base.assignment,volunteerId:"other_volunteer"}},
  {assignment:{...base.assignment,offerMode:"manual"}},
  {decision:"completed"}
 ];
 for(const patch of variants){
  const r=proposeAutoVolunteerDecision({...base,...patch});
  assert.equal(r.status,"blocked");
  assert.equal(r.logicalWriteIntents,undefined);
 }
});
/*
 * SERIALIZABLE FAKE TRANSACTION, NOT FIRESTORE EMULATOR.
 * This checks policy across a case-level shared winner; a real production
 * adapter MUST also serialize manual Admin, Volunteer web/mobile write paths.
 */
function fakeSerializedCaseHarness(){
 let caseData=make().caseData;
 const assignments=new Map();
 const reservations=new Map();
 const locks=new Map();
 for(const uid of ["volunteer_a","volunteer_b"]){
  const seed=make(uid);
  assignments.set(uid,seed.assignment);
  reservations.set(uid,seed.reservation);
 }
 let queue=Promise.resolve(),commitCount=0;
 function invoke(uid,decision="accepted"){
  const task=async()=>{
   const input=make(uid);
   const result=proposeAutoVolunteerDecision({...input,decision,
     caseData,assignment:assignments.get(uid),lock:locks.get(uid)||null,
     reservation:reservations.get(uid)||null});
   if(result.status==="proposed_only"){
    for(const write of result.logicalWriteIntents){
     if(write.kind==="assignment_update"){
      assignments.set(uid,{...assignments.get(uid),status:write.status});
     }else if(write.kind==="case_winner_update"){
      caseData={...caseData,
       autoVolunteerAcceptedAssignmentId:write.autoVolunteerAcceptedAssignmentId,
       activeVolunteerSupportAssignmentId:write.activeVolunteerSupportAssignmentId,
       activeVolunteerSupportUid:write.activeVolunteerSupportUid};
     }else if(write.kind==="responder_lock_create"){
      locks.set(uid,{caseId:write.caseId,assignmentId:write.assignmentId,
       responderUid:uid,status:"accepted"});
     }else if(write.kind==="reservation_delete")reservations.delete(uid);
    }
    commitCount++;
   }
   return result.status;
  };
  const current=queue.then(task);
  queue=current.catch(()=>{});
  return current;
 }
 return {invoke,read:()=>({caseData,assignments,locks,reservations,commitCount})};
}
test("simulated two concurrent Accept requests on one case produce exactly ONE winner",async()=>{
 const h=fakeSerializedCaseHarness();
 const results=await Promise.all([h.invoke("volunteer_a"),h.invoke("volunteer_b")]);
 assert.deepEqual(results,["proposed_only","blocked"]);
 const data=h.read();
 assert.equal(data.commitCount,1);
 assert.equal(data.caseData.activeVolunteerSupportUid,"volunteer_a");
 assert.equal(data.locks.size,1);
 assert.equal(data.assignments.get("volunteer_a").status,"accepted");
 assert.equal(data.assignments.get("volunteer_b").status,"offered");
});
test("simulated two simultaneous duplicate requests produce no second commit",async()=>{
 const h=fakeSerializedCaseHarness();
 const results=await Promise.all([h.invoke("volunteer_a"),h.invoke("volunteer_a")]);
 assert.deepEqual(results,["proposed_only","already_accepted"]);
 assert.equal(h.read().commitCount,1);
});
test("manual Admin pointer set before hypothetical accept blocks automatic candidate",()=>{
 const base=make();
 const p=proposeAutoVolunteerDecision({...base,
   caseData:{...base.caseData,activeVolunteerSupportAssignmentId:"manual_assignment",
     activeVolunteerSupportUid:"manual_volunteer"}});
 assert.equal(p.reason,"case_has_manual_or_accepted_responder");
});
test("module source and running backend are unwired, no Firestore writes or scheduler",()=>{
 const root=__dirname;
 const src=fs.readFileSync(path.join(root,"autoVolunteerAtomicDecisionPolicy.js"),"utf8");
 const server=fs.readFileSync(path.join(root,"server.js"),"utf8");
 for(const banned of [
  'require("firebase-admin', "runTransaction(", "tx.update(", "tx.set(",
  "tx.create(", "setInterval(", "app.post(", "firebaseAdmin"
 ])assert.equal(src.includes(banned),false,banned);
 assert.equal(server.includes("autoVolunteerAtomicDecisionPolicy"),false);
 assert.equal(server.includes("autoVolunteerProductionPreviewReader"),false);
});
