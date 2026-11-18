"use strict";
/**
 * Phase 3 OFFLINE POLICY MODEL ONLY. No Firebase imports, DB reads or writes.
 * It proposes fields a FUTURE reviewed server transaction would need to
 * atomically validate and commit; NO actual commit is implemented here.
 *
 * IMPORTANT: Current live manual Admin transactions can set
 * activeVolunteerSupportAssignmentId on OFFER, not acceptance. Do NOT wire this
 * policy into a live server until those competing transaction paths share a
 * reviewed per-case winner/offer invariant and Firestore emulator tests pass.
 */
const {norm}=require("./emergencyAutoVolunteerReadOnlyPlanner");
const ASSIGNMENT_MODE="automatic_wave_proposed"; // hypothetical, NOT deployed
const statuses=new Set(["validated","assigned","in_progress"]);
const validId=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{1,160}$/.test(x);
const block=(reason)=>Object.freeze({status:"blocked",reason,readOnly:true,
  dispatchEnabled:false});
function enabled(env={}){
  return env?.VOLUNSERVE_AUTO_VOLUNTEER_DECISION_REVIEW==="enabled" &&
    env?.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH!=="enabled";
}
function deadlineMillis(value){
  if(Number.isSafeInteger(value)&&value>=1577836800000&&value<=4102444800000)return value;
  if(value&&typeof value.toMillis==="function"){
    try{
      const ms=value.toMillis();
      if(Number.isSafeInteger(ms)&&ms>=1577836800000&&ms<=4102444800000)return ms;
    }catch{}
  }
  return null;
}
function validIdentity(user,application){
  return user?.status==="approved" &&
    ["volunteer","resident"].includes(user.role) &&
    user.volunteerAccess===true &&
    user.volunteerStatus==="approved" &&
    (user.identityVerified===true||user.identityStatus==="verified") &&
    application?.status==="approved";
}
function validSkill(caseData,user,application){
  const required=Array.isArray(caseData.requiredSkills)?
    caseData.requiredSkills.map(norm).filter(x=>x && x!=="general volunteer"):[];
  if(!required.length)return true;
  const skills=[
    ...(Array.isArray(user.skills)?user.skills:[]),
    ...(Array.isArray(user.volunteerSkills)?user.volunteerSkills:[]),
    ...(Array.isArray(application.skills)?application.skills:[])
  ].map(norm);
  return required.some(r=>skills.includes(r));
}
/**
 * Inputs represent ONE CONSISTENT transactional snapshot, including a proven
 * fully checked active assignment/availability scan. The policy cannot prove
 * such provenance; future production adapter MUST. The evaluator never reads
 * or modifies Firestore. Output is never an authorized operation.
 *
 * "manual-case-pointer" and "single accepted winner" are independent checks.
 * A newly accepted automatic offer must atomically set the case winner pointer
 * and volunteer lock. Subsequent manual or automatic offers must respect it.
 */
function proposeAutoVolunteerDecision({
  env={},caseData,assignment,volunteer,application,reservation,lock,
  decision,now=Date.now(),verifiedNoOtherActiveAssignments=false
}={}){
  if(!enabled(env))return block("review_mode_disabled");
  if(!["accepted","declined"].includes(decision))
    return block("invalid_decision");
  if(!Number.isSafeInteger(now)||now<0)return block("invalid_clock");
  const cid=caseData?.id,uid=volunteer?.uid;
  const aid=assignment?.id;
  if(!validId(cid)||!validId(uid)||!validId(aid) ||
     !validId(caseData?.reporterUid))
    return block("invalid_assignment_identity");
  if(assignment.caseId!==cid||assignment.volunteerId!==uid ||
     aid!==cid+"_"+uid||assignment.offerMode!==ASSIGNMENT_MODE)
    return block("not_this_automatic_offer");
  const winner=caseData.autoVolunteerAcceptedAssignmentId||"";
  // Idempotent replays MUST NOT create another notice/lock, change deadline,
  // or create a duplicate audit. A complete first acceptance is required.
  if(decision==="accepted"&&assignment.status==="accepted" &&
    winner===aid &&
    caseData.activeVolunteerSupportAssignmentId===aid &&
    caseData.activeVolunteerSupportUid===uid &&
    lock?.caseId===cid&&lock?.assignmentId===aid&&
    lock?.responderUid===uid&&lock?.status==="accepted")
    return Object.freeze({status:"already_accepted",readOnly:true,
      dispatchEnabled:false});
  if(decision==="declined"&&assignment.status==="declined")
    return Object.freeze({status:"already_declined",readOnly:true,
      dispatchEnabled:false});
  if(assignment.status!=="offered")return block("offer_no_longer_pending");
  const exp=deadlineMillis(assignment.expiresAtMs);
  if(exp===null||exp<=now)return block("offer_expired_or_unknown");
  if(!statuses.has(caseData.status) ||
     caseData.verificationStatus!=="validated" ||
     caseData.dispatchBlocked===true ||
     caseData.resolvedAt||caseData.closedAt)
    return block("case_not_currently_approved");
  if(caseData.reporterUid===uid)return block("self_response_not_allowed");
  if(!validIdentity(volunteer,application) ||
     (application.uid&&application.uid!==uid))
    return block("volunteer_approval_or_identity_missing");
  if(!validSkill(caseData,volunteer,application))
    return block("verified_skill_match_missing");
  if(verifiedNoOtherActiveAssignments!==true)
    return block("active_assignment_scan_not_proven");
  if(winner || caseData.activeVolunteerSupportAssignmentId ||
     caseData.activeVolunteerSupportUid)
    return block("case_has_manual_or_accepted_responder");
  if(lock)return block("volunteer_already_locked");
  if(!reservation||reservation.caseId!==cid ||
     reservation.assignmentId!==aid ||
     (reservation.uid&&reservation.uid!==uid))
    return block("reservation_not_owned");
  // Proposal ONLY. These are logical *intent* objects for reviewing
  // transaction semantics; do not directly apply to production Firestore.
  const writes=decision==="accepted"?[
    {kind:"assignment_update",id:aid,status:"accepted"},
    {kind:"case_winner_update",id:cid,activeVolunteerSupportUid:uid,
      activeVolunteerSupportAssignmentId:aid,
      autoVolunteerAcceptedAssignmentId:aid},
    {kind:"responder_lock_create",uid,caseId:cid,assignmentId:aid,status:"accepted"}
  ]:[
    {kind:"assignment_update",id:aid,status:"declined"},
    {kind:"reservation_delete",uid,caseId:cid,assignmentId:aid}
  ];
  return {status:"proposed_only",decision,readOnly:true,
    dispatchEnabled:false,
    logicalWriteIntents:writes,
    warning:"SIMULATION ONLY. Cannot enforce atomicity against current live manual Admin and Volunteer clients."};
}
module.exports={proposeAutoVolunteerDecision,enabled,ASSIGNMENT_MODE};
