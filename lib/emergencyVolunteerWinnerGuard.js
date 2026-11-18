"use strict";
/**
 * Shared, fail-closed client-side compatibility checks for draft Phase 5.
 * These checks are necessary but NOT a security boundary: production Firebase
 * Rules and server-side transactions must enforce any future automatic offers.
 *
 * Current manual Admin sets active case pointer on OFFER. A previously
 * accepted automatic responder must never have its pointer overwritten.
 */
function str(x){return typeof x==="string"?x.trim():"";}
function isAutoOffer(assignment){
  const mode=str(assignment?.offerMode);
  return mode==="automatic_wave_proposed" || mode.startsWith("automatic_");
}
function manualOfferConflictReason(caseData,targetAssignmentId,targetVolunteerUid){
  if(!caseData||!str(targetAssignmentId)||!str(targetVolunteerUid))
    return "Cannot verify this emergency assignment.";
  if(str(caseData.autoVolunteerAcceptedAssignmentId))
    return "An automatic Volunteer has already accepted this emergency. Do not replace the accepted responder.";
  const currentId=str(caseData.activeVolunteerSupportAssignmentId);
  const currentUid=str(caseData.activeVolunteerSupportUid);
  if((currentId&&currentId!==targetAssignmentId)||
     (currentUid&&currentUid!==targetVolunteerUid))
    return "Another Volunteer support offer or responder is active on this emergency. Finish or cancel it before creating a new offer.";
  if(caseData.dispatchBlocked===true)
    return "This emergency is not accepting Volunteer offers.";
  return null;
}
function volunteerTransitionConflictReason(caseData,assignment,next){
  const id=str(assignment?.id),uid=str(assignment?.volunteerId);
  if(!id||!uid)return "Cannot verify this Volunteer assignment.";
  const automatic=isAutoOffer(assignment);
  // A future production automatic offer must use a reviewed server-mediated
  // accept/decline transaction, not the legacy single-assignment UI action.
  if(automatic&&(next==="accepted"||next==="declined"))
    return "This automatic Volunteer offer requires secure server confirmation. Ask the Admin to complete the new response flow.";
  if(next==="declined")return null; // legacy manual decline unchanged
  if(!caseData){
    return automatic || next==="accepted"
      ? "The emergency case is unavailable. Refresh before updating the assignment."
      : null;
  }
  const selectedId=str(caseData.activeVolunteerSupportAssignmentId);
  const selectedUid=str(caseData.activeVolunteerSupportUid);
  const acceptedAuto=str(caseData.autoVolunteerAcceptedAssignmentId);
  if(automatic){
    if(acceptedAuto!==id||selectedId!==id||selectedUid!==uid)
      return "This automatic Volunteer is not the confirmed responder for this emergency.";
  }else if(acceptedAuto&&acceptedAuto!==id){
    return "Another Volunteer has already accepted this emergency.";
  }
  // Guard stale/manual offers as well: if a case pointer exists, it must match
  // this assignment and its Volunteer. Empty legacy pointers remain supported.
  if((selectedId&&selectedId!==id)||(selectedUid&&selectedUid!==uid))
    return "This Volunteer assignment is no longer selected for the emergency.";
  return null;
}
module.exports={manualOfferConflictReason,volunteerTransitionConflictReason,isAutoOffer};
