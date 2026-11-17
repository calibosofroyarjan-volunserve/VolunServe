"use strict";

/** Isolated one-case Firebase staging fixture. No production operations. */
const {FieldValue} = require("./firebaseAdmin");
const CASE_ID="STAGING_TEST_001";
const CASE_TITLE="TEST ONLY - Dummy Emergency";

function refSet(db,uid) {
  const assignmentId=CASE_ID+"_"+uid;
  return {
    caseRef:db.collection("disasterCases").doc(CASE_ID),
    stateRef:db.collection("emergencyAutoDispatch").doc(CASE_ID),
    assignmentRef:db.collection("responseAssignments").doc(assignmentId),
    reserveRef:db.collection("autoVolunteerReservations").doc(uid),
    lockRef:db.collection("responderLocks").doc(uid),
    assignmentId,
  };
}
const result=(status,extra={})=>({status,...extra});
function safeUid(uid) {return typeof uid==="string" && /^[A-Za-z0-9_-]{1,160}$/.test(uid);}
async function getVolunteerOffer(db,uid,now=Date.now()) {
  if(!safeUid(uid))return result("unavailable");
  const refs=refSet(db,uid);
  const [caseSnap,stateSnap,assignmentSnap]=await Promise.all([
    refs.caseRef.get(),refs.stateRef.get(),refs.assignmentRef.get()
  ]);
  if(!caseSnap.exists||caseSnap.data()?.title!==CASE_TITLE)return result("unavailable");
  if(!assignmentSnap.exists)return result("not_offered");
  const data=assignmentSnap.data()||{},session=stateSnap.exists?stateSnap.data()||{}:{};
  if(data.caseId!==CASE_ID||data.volunteerId!==uid||
     data.createdBy!=="automatic_matching_engine")return result("unavailable");
  const expiresAtMs=Number(session.expiresAtMs||0);
  const active=data.status==="offered" && session.status==="waiting" &&
    session.assignmentId===refs.assignmentId && session.volunteerId===uid &&
    expiresAtMs>now;
  return result(active?"offered":
    data.status==="offered"?"expired":String(data.status||"unavailable"),{
    caseTitle:CASE_TITLE,caseId:CASE_ID,
    expiresAt:expiresAtMs>0?new Date(expiresAtMs).toISOString():null,
    canRespond:active,
  });
}
async function respondToStagingOffer(db,uid,decision,now=Date.now()) {
  if(!safeUid(uid) || !["accepted","declined"].includes(decision))
    return result("invalid_request");
  const refs=refSet(db,uid),stamp=FieldValue.serverTimestamp();
  return db.runTransaction(async tx=>{
    // All reads precede writes; Firestore transactions resolve races safely.
    const [caseSnap,stateSnap,assignmentSnap,reserveSnap,lockSnap]=await Promise.all(
      [refs.caseRef,refs.stateRef,refs.assignmentRef,refs.reserveRef,refs.lockRef].map(r=>tx.get(r)));
    if(!caseSnap.exists||caseSnap.data()?.title!==CASE_TITLE ||
       caseSnap.data()?.verificationStatus!=="validated")
      return result("not_staging_case");
    if(!assignmentSnap.exists||!stateSnap.exists)return result("not_offered");
    const a=assignmentSnap.data()||{},s=stateSnap.data()||{};
    if(a.caseId!==CASE_ID||a.volunteerId!==uid||
       a.createdBy!=="automatic_matching_engine"||
       s.volunteerId!==uid||s.assignmentId!==refs.assignmentId)
      return result("not_your_offer");
    if(a.status===decision)return result("already_"+decision);
    if(a.status!=="offered"||s.status!=="waiting")return result("not_active");
    if(!Number.isFinite(Number(s.expiresAtMs))||Number(s.expiresAtMs)<=now)
      return result("expired");
    if(!reserveSnap.exists||reserveSnap.data()?.assignmentId!==refs.assignmentId)
      return result("reservation_missing");
    if(lockSnap.exists)return result("already_busy");
    const wave=Number(s.wave||1);
    tx.update(refs.assignmentRef,{status:decision,updatedAt:stamp,
      ...(decision==="accepted"?{acceptedAt:stamp}:{declinedAt:stamp})});
    if(decision==="accepted") {
      tx.create(refs.lockRef,{
        responderUid:uid,assignmentId:refs.assignmentId,caseId:CASE_ID,
        status:"accepted",updatedAt:stamp
      });
      tx.update(refs.stateRef,{status:"accepted",reason:"volunteer_accepted",
        updatedAt:stamp});
      tx.update(refs.caseRef,{autoVolunteerDispatch:{
        state:"accepted",wave,attemptedCount:1,
        note:"Test Volunteer accepted the dummy offer",updatedAt:stamp
      },updatedAt:stamp});
    }else{
      tx.delete(refs.reserveRef);
      tx.update(refs.stateRef,{status:"needs_admin",reason:"test_volunteer_declined",
        attemptedVolunteerIds:[uid],
        // Preserve deterministic ownership for safe Admin-only reissue.
        assignmentId:refs.assignmentId,volunteerId:uid,
        expiresAtMs:null,updatedAt:stamp});
      tx.update(refs.caseRef,{
        activeVolunteerSupportUid:"",
        activeVolunteerSupportName:"",
        activeVolunteerSupportAssignmentId:"",
        autoVolunteerDispatch:{state:"needs_admin",wave,attemptedCount:1,
          note:"Test Volunteer declined; Admin can reissue fictional test",updatedAt:stamp},
        updatedAt:stamp
      });
    }
    return result(decision);
  });
}
/** Admin-only: reset only the one synthetic assignment, never an accepted task.
 * Used after expiry, so testers do not manually edit Firestore fields.
 */
async function resetExpiredFixture(db,now=Date.now()) {
  const caseRef=db.collection("disasterCases").doc(CASE_ID);
  const stateRef=db.collection("emergencyAutoDispatch").doc(CASE_ID);
  const caseSnap=await caseRef.get(),stateSnap=await stateRef.get();
  if(!caseSnap.exists||caseSnap.data()?.title!==CASE_TITLE)return result("not_staging_case");
  if(!stateSnap.exists)return result("ready");
  const state=stateSnap.data()||{};
  if(!safeUid(state.volunteerId) || !state.assignmentId ||
     state.assignmentId!==CASE_ID+"_"+state.volunteerId){
    // For declined state, the original volunteer id has been cleared. Never
    // guess an unrelated UID or inspect other real users.
    return result("manual_review_required");
  }
  const refs=refSet(db,state.volunteerId);
  return db.runTransaction(async tx=>{
    const [c,s,a,r,l,log]=await Promise.all([
      caseRef,stateRef,refs.assignmentRef,refs.reserveRef,refs.lockRef,
      db.collection("adminActivityLogs").doc("auto_offer_"+refs.assignmentId),
    ].map(ref=>tx.get(ref)));
    if(!c.exists||c.data()?.title!==CASE_TITLE||!s.exists)return result("not_staging_case");
    const current=s.data()||{},offer=a.exists?a.data()||{}:{};
    if(current.assignmentId!==refs.assignmentId||
       current.volunteerId!==state.volunteerId||
       (a.exists && (offer.volunteerId!==state.volunteerId||
        offer.createdBy!=="automatic_matching_engine")))return result("state_changed");
    if(l.exists||["accepted","responding","on_site","completed"].includes(offer.status)||
       ["accepted","completed"].includes(current.status))
      return result("cannot_reset_accepted_task");
    if(current.status==="waiting" && Number(current.expiresAtMs||0)>now)
      return result("offer_still_active");
    if(!["waiting","needs_admin","disabled","ready"].includes(current.status))
      return result("manual_review_required");
    if(r.exists && r.data()?.assignmentId!==refs.assignmentId)
      return result("reservation_changed");
    // Clear only deterministic records generated by the test engine.
    if(a.exists)tx.delete(refs.assignmentRef);
    if(r.exists)tx.delete(refs.reserveRef);
    tx.delete(stateRef);
    if(log.exists)tx.delete(db.collection("adminActivityLogs").doc("auto_offer_"+refs.assignmentId));
    tx.delete(db.collection("notifications").doc("auto_response_"+refs.assignmentId));
    tx.update(caseRef,{
      status:"validated",activeVolunteerSupportUid:"",
      activeVolunteerSupportName:"",activeVolunteerSupportAssignmentId:"",
      autoVolunteerDispatch:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()
    });
    return result("reset");
  });
}
module.exports={getVolunteerOffer,respondToStagingOffer,resetExpiredFixture,CASE_ID,CASE_TITLE};
