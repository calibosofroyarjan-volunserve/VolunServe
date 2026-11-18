"use strict";

/** Isolated one-case Firebase staging fixture. No production operations. */
const {FieldValue} = require("./firebaseAdmin");
const CASE_ID="STAGING_TEST_001";
const CASE_TITLE="TEST ONLY - Dummy Emergency";
const E2E_CASE_ID="STAGING_E2E_002";
const E2E_CASE_TITLE="TEST ONLY - Fresh Volunteer E2E 002";
const TITLES=Object.freeze({[CASE_ID]:CASE_TITLE,[E2E_CASE_ID]:E2E_CASE_TITLE});
const titleForCase=caseId=>TITLES[caseId] || null;

function refSet(db,uid,caseId=CASE_ID) {
  const assignmentId=caseId+"_"+uid;
  return {
    caseRef:db.collection("disasterCases").doc(caseId),
    stateRef:db.collection("emergencyAutoDispatch").doc(caseId),
    assignmentRef:db.collection("responseAssignments").doc(assignmentId),
    reserveRef:db.collection("autoVolunteerReservations").doc(uid),
    lockRef:db.collection("responderLocks").doc(uid),
    assignmentId,
  };
}
const result=(status,extra={})=>({status,...extra});
function safeUid(uid) {return typeof uid==="string" && /^[A-Za-z0-9_-]{1,160}$/.test(uid);}
async function getVolunteerOffer(db,uid,now=Date.now(),caseId=CASE_ID) {
  if(!safeUid(uid)||!titleForCase(caseId))return result("unavailable");
  const refs=refSet(db,uid,caseId);
  const [caseSnap,stateSnap,assignmentSnap]=await Promise.all([
    refs.caseRef.get(),refs.stateRef.get(),refs.assignmentRef.get()
  ]);
  if(!caseSnap.exists||caseSnap.data()?.title!==titleForCase(caseId))return result("unavailable");
  if(!assignmentSnap.exists)return result("not_offered");
  const data=assignmentSnap.data()||{},session=stateSnap.exists?stateSnap.data()||{}:{};
  if(data.caseId!==caseId||data.volunteerId!==uid||
     data.createdBy!=="automatic_matching_engine")return result("unavailable");
  const expiresAtMs=Number(session.expiresAtMs||0);
  const active=data.status==="offered" && session.status==="waiting" &&
    session.assignmentId===refs.assignmentId && session.volunteerId===uid &&
    expiresAtMs>now;
  return result(active?"offered":
    data.status==="offered"?"expired":String(data.status||"unavailable"),{
    caseTitle:titleForCase(caseId),caseId:caseId,
    expiresAt:expiresAtMs>0?new Date(expiresAtMs).toISOString():null,
    canRespond:active,
  });
}
async function respondToStagingOffer(db,uid,decision,now=Date.now(),caseId=CASE_ID) {
  if(!safeUid(uid) || !titleForCase(caseId) || !["accepted","declined"].includes(decision))
    return result("invalid_request");
  const refs=refSet(db,uid,caseId),stamp=FieldValue.serverTimestamp();
  return db.runTransaction(async tx=>{
    // All reads precede writes; Firestore transactions resolve races safely.
    const [caseSnap,stateSnap,assignmentSnap,reserveSnap,lockSnap]=await Promise.all(
      [refs.caseRef,refs.stateRef,refs.assignmentRef,refs.reserveRef,refs.lockRef].map(r=>tx.get(r)));
    if(!caseSnap.exists||caseSnap.data()?.title!==titleForCase(caseId) ||
       caseSnap.data()?.verificationStatus!=="validated")
      return result("not_staging_case");
    if(!assignmentSnap.exists||!stateSnap.exists)return result("not_offered");
    const a=assignmentSnap.data()||{},s=stateSnap.data()||{};
    if(a.caseId!==caseId||a.volunteerId!==uid||
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
    // Mirror production Firestore Rules: Volunteer transition may change
    // only status and updatedAt. Stage uses Admin SDK, so test this parity.
    tx.update(refs.assignmentRef,{status:decision,updatedAt:stamp});
    if(decision==="accepted") {
      tx.create(refs.lockRef,{
        responderUid:uid,assignmentId:refs.assignmentId,caseId:caseId,
        status:"accepted",updatedAt:stamp
      });
      const reporterUid=caseSnap.data()?.reporterUid;
      if(safeUid(reporterUid) && reporterUid!==uid){
        tx.set(db.collection("notifications").doc("auto_test_accepted_"+refs.assignmentId),{
          userId:reporterUid,audience:"resident",type:"resident_response_update",
          caseId:caseId,assignmentId:refs.assignmentId,responderId:uid,
          title:"Test Volunteer accepted your case",
          message:"A test Volunteer accepted the fictional emergency support task.",
          status:"accepted",read:false,createdAt:stamp,
        });
      }
      tx.set(db.collection("adminActivityLogs").doc("auto_test_decision_"+refs.assignmentId),{
        action:"Synthetic Volunteer Accepted",caseId:caseId,
        volunteerUid:uid,performedBy:"staging_volunteer",timestamp:stamp,
      });
      tx.update(refs.stateRef,{status:"accepted",reason:"volunteer_accepted",
        updatedAt:stamp});
      tx.update(refs.caseRef,{autoVolunteerDispatch:{
        state:"accepted",wave,attemptedCount:1,
        note:"Test Volunteer accepted the dummy offer",updatedAt:stamp
      },updatedAt:stamp});
    }else{
      const adminUid=caseSnap.data()?.validatedBy;
      if(safeUid(adminUid) && adminUid!==uid){
        tx.set(db.collection("notifications").doc("auto_test_declined_"+refs.assignmentId),{
          userId:adminUid,audience:"admin",type:"emergency_dispatch_escalation",
          caseId:caseId,assignmentId:refs.assignmentId,
          title:"Test Volunteer declined",
          message:"The fictional Volunteer offer was declined. Admin may reissue the test.",
          read:false,createdAt:stamp,
        });
      }
      tx.set(db.collection("adminActivityLogs").doc("auto_test_decision_"+refs.assignmentId),{
        action:"Synthetic Volunteer Declined",caseId:caseId,
        volunteerUid:uid,performedBy:"staging_volunteer",timestamp:stamp,
      });
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
async function resetExpiredFixture(db,now=Date.now(),caseId=CASE_ID) {
  if(!titleForCase(caseId))return result("not_staging_case");
  const caseRef=db.collection("disasterCases").doc(caseId);
  const stateRef=db.collection("emergencyAutoDispatch").doc(caseId);
  const caseSnap=await caseRef.get(),stateSnap=await stateRef.get();
  if(!caseSnap.exists||caseSnap.data()?.title!==titleForCase(caseId))return result("not_staging_case");
  if(!stateSnap.exists)return result("ready");
  const state=stateSnap.data()||{};
  if(!safeUid(state.volunteerId) || !state.assignmentId ||
     state.assignmentId!==caseId+"_"+state.volunteerId){
    // For declined state, the original volunteer id has been cleared. Never
    // guess an unrelated UID or inspect other real users.
    return result("manual_review_required");
  }
  const refs=refSet(db,state.volunteerId,caseId);
  return db.runTransaction(async tx=>{
    const [c,s,a,r,l,log]=await Promise.all([
      caseRef,stateRef,refs.assignmentRef,refs.reserveRef,refs.lockRef,
      db.collection("adminActivityLogs").doc("auto_offer_"+refs.assignmentId),
    ].map(ref=>tx.get(ref)));
    if(!c.exists||c.data()?.title!==titleForCase(caseId)||!s.exists)return result("not_staging_case");
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
    tx.delete(db.collection("adminActivityLogs").doc("auto_test_decision_"+refs.assignmentId));
    tx.delete(db.collection("notifications").doc("auto_test_accepted_"+refs.assignmentId));
    tx.delete(db.collection("notifications").doc("auto_test_declined_"+refs.assignmentId));
    tx.delete(db.collection("notifications").doc("auto_response_"+refs.assignmentId));
    tx.update(caseRef,{
      status:"validated",activeVolunteerSupportUid:"",
      activeVolunteerSupportName:"",activeVolunteerSupportAssignmentId:"",
      autoVolunteerDispatch:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()
    });
    return result("reset");
  });
}

/**
 * Admin-only, read-only QA diagnostic for a single fictional case.
 * All lookups are hardcoded to the recognized staging case, and output
 * exposes statuses only. No UIDs, names, credentials or token data.
 */
async function inspectStagingAssignmentConsistency(db,caseId=CASE_ID) {
  if(!titleForCase(caseId))return {status:"unavailable",reason:"unrecognized_dummy_case"};
  const caseSnap=await db.collection("disasterCases").doc(caseId).get();
  if(!caseSnap.exists||caseSnap.data()?.title!==titleForCase(caseId))
    return {status:"unavailable",reason:"fictional_case_missing"};
  const sessionSnap=await db.collection("emergencyAutoDispatch").doc(caseId).get();
  if(!sessionSnap.exists)return {status:"not_started"};
  const session=sessionSnap.data()||{};
  const uid=String(session.volunteerId||"");
  if(!safeUid(uid)||session.assignmentId!==caseId+"_"+uid)
    return {status:"review_required",reason:"invalid_session_ownership"};
  const refs=refSet(db,uid,caseId);
  const [assignment,lock,reservation,initialNotification,acceptanceNotification,
    declineNotification,decisionLog]=await Promise.all([
    refs.assignmentRef.get(),refs.lockRef.get(),refs.reserveRef.get(),
    db.collection("notifications").doc("auto_response_"+refs.assignmentId).get(),
    db.collection("notifications").doc("auto_test_accepted_"+refs.assignmentId).get(),
    db.collection("notifications").doc("auto_test_declined_"+refs.assignmentId).get(),
    db.collection("adminActivityLogs").doc("auto_test_decision_"+refs.assignmentId).get(),
  ]);
  const a=assignment.exists?assignment.data()||{}:{};
  const owned=assignment.exists && a.caseId===caseId && a.volunteerId===uid &&
    a.createdBy==="automatic_matching_engine";
  const accepted=owned && a.status==="accepted" && session.status==="accepted";
  const lockCorrect=lock.exists && lock.data()?.assignmentId===refs.assignmentId &&
    lock.data()?.responderUid===uid;
  const caseCorrect=caseSnap.data()?.activeVolunteerSupportAssignmentId===refs.assignmentId &&
    caseSnap.data()?.autoVolunteerDispatch?.state==="accepted";
  const notificationCorrect=acceptanceNotification.exists &&
    acceptanceNotification.data()?.caseId===caseId &&
    acceptanceNotification.data()?.assignmentId===refs.assignmentId &&
    acceptanceNotification.data()?.userId===caseSnap.data()?.reporterUid;
  const auditAction=decisionLog.exists?decisionLog.data()?.action:null;
  const auditCorrect=decisionLog.exists &&
    decisionLog.data()?.caseId===caseId &&
    decisionLog.data()?.volunteerUid===uid &&
    ["Synthetic Volunteer Accepted",
      "Synthetic Volunteer Acceptance Reconciled (Later QA)"].includes(auditAction);
  const reconciled=acceptanceNotification.data()?.recordOrigin==="staging_acceptance_reconciliation" ||
    decisionLog.data()?.recordOrigin==="staging_acceptance_reconciliation";
  const supportRecordsVerified=accepted && lockCorrect && caseCorrect && notificationCorrect &&
    initialNotification.exists && auditCorrect && reservation.exists;
  const result={
    status:!owned?"review_required":String(a.status||"unknown"),
    assignmentStatus:String(a.status||"missing"),
    sessionStatus:String(session.status||"missing"),
    wave:Number(session.wave||0),
    initialOfferNotificationPresent:initialNotification.exists,
    acceptedResponderLockCorrect:lockCorrect,
    acceptedCaseStatusCorrect:caseCorrect,
    acceptedResidentNotificationPresent:notificationCorrect,
    adminAuditPresent:decisionLog.exists,
    adminAuditCorrect:auditCorrect,
    declineAlertPresent:declineNotification.exists,
    reservationPresent:reservation.exists,
    supportRecordsVerified,
    reconciliationRecorded:reconciled && notificationCorrect && auditCorrect,
    historicalOriginalAcceptanceVerified:supportRecordsVerified && !reconciled,
    // A later QA repair never proves the ORIGINAL acceptance wrote everything.
    fullAcceptanceVerified:supportRecordsVerified && !reconciled,
  };
  return result;
}

module.exports={getVolunteerOffer,respondToStagingOffer,resetExpiredFixture,
  inspectStagingAssignmentConsistency,CASE_ID,CASE_TITLE,
  E2E_CASE_ID,E2E_CASE_TITLE,titleForCase};
