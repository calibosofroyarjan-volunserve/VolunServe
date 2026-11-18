"use strict";

/**
 * An explicit, audited reconciliation of support records for ONE existing,
 * already-accepted fictional staging task. This is NOT a replay of Volunteer
 * acceptance and is not evidence of an original end-to-end acceptance flow.
 * Runs only behind approved Admin authentication and isolated staging gate.
 */
const {FieldValue}=require("./firebaseAdmin");
const {CASE_ID,CASE_TITLE}=require("./stagingVolunteerTask");

const ORIGIN="staging_acceptance_reconciliation";
const validUid=x=>typeof x==="string" && /^[A-Za-z0-9_-]{1,160}$/.test(x);
const blocked=reason=>({status:"blocked",reason,createdNotification:false,createdAudit:false});

async function reconcileAcceptedStagingSupport(db,adminUid) {
  if(!validUid(adminUid))return blocked("approved_admin_required");
  const caseRef=db.collection("disasterCases").doc(CASE_ID);
  const stateRef=db.collection("emergencyAutoDispatch").doc(CASE_ID);
  // Read-only preliminary check determines the exact fixed test assignment.
  // Re-check every value inside the transaction before writing anything.
  const sessionSnap=await stateRef.get();
  if(!sessionSnap.exists)return blocked("test_session_missing");
  const preliminary=sessionSnap.data()||{};
  const uid=preliminary.volunteerId;
  const assignmentId=CASE_ID+"_"+uid;
  if(!validUid(uid)||preliminary.assignmentId!==assignmentId ||
      !/^[A-Za-z0-9_-]{1,325}$/.test(assignmentId))
    return blocked("invalid_test_assignment");

  const assignmentRef=db.collection("responseAssignments").doc(assignmentId);
  const lockRef=db.collection("responderLocks").doc(uid);
  const reservationRef=db.collection("autoVolunteerReservations").doc(uid);
  const initialRef=db.collection("notifications").doc("auto_response_"+assignmentId);
  // Reuse the deterministic test IDs only when absent. A reconciled record
  // is explicitly labelled, timestamped NOW, never backdated.
  const notificationRef=db.collection("notifications").doc("auto_test_accepted_"+assignmentId);
  const auditRef=db.collection("adminActivityLogs").doc("auto_test_decision_"+assignmentId);

  return db.runTransaction(async tx=>{
    const docs=await Promise.all([
      caseRef,stateRef,assignmentRef,lockRef,reservationRef,initialRef,
      notificationRef,auditRef
    ].map(ref=>tx.get(ref)));
    const [c,s,a,l,r,initial,notice,audit]=docs;
    if(!c.exists||!s.exists||!a.exists||!l.exists||!r.exists||!initial.exists)
      return blocked("incomplete_accepted_test_evidence");

    const caseData=c.data()||{},session=s.data()||{},offer=a.data()||{},
      lock=l.data()||{},reservation=r.data()||{},initialData=initial.data()||{};
    if(caseData.title!==CASE_TITLE ||
       caseData.verificationStatus!=="validated" ||
       !["assigned","in_progress"].includes(caseData.status) ||
       caseData.autoVolunteerDispatch?.state!=="accepted" ||
       caseData.activeVolunteerSupportAssignmentId!==assignmentId ||
       !validUid(caseData.reporterUid) ||
       caseData.reporterUid===uid ||
       caseData.reporterUid===adminUid ||
       !validUid(caseData.validatedBy))
      return blocked("case_not_verified_for_reconciliation");
    if(session.assignmentId!==assignmentId || session.volunteerId!==uid ||
       session.status!=="accepted" || offer.caseId!==CASE_ID ||
       offer.volunteerId!==uid || offer.status!=="accepted" ||
       offer.createdBy!=="automatic_matching_engine" ||
       lock.assignmentId!==assignmentId || lock.responderUid!==uid ||
       reservation.assignmentId!==assignmentId ||
       initialData.caseId!==CASE_ID ||
       initialData.assignmentId!==assignmentId)
      return blocked("assignment_evidence_mismatch");

    // Never overwrite or reinterpret an existing original notification/audit.
    if(notice.exists){
      const n=notice.data()||{};
      if(n.caseId!==CASE_ID || n.assignmentId!==assignmentId ||
         n.userId!==caseData.reporterUid ||
         (n.recordOrigin && n.recordOrigin!==ORIGIN))
        return blocked("existing_notification_needs_review");
    }
    if(audit.exists){
      const record=audit.data()||{};
      if(record.caseId!==CASE_ID || record.volunteerUid!==uid ||
         (record.recordOrigin && record.recordOrigin!==ORIGIN))
        return blocked("existing_audit_needs_review");
    }
    const stamp=FieldValue.serverTimestamp();
    if(!notice.exists)tx.create(notificationRef,{
      userId:caseData.reporterUid,audience:"resident",
      type:"resident_response_update",caseId:CASE_ID,assignmentId,
      responderId:uid,status:"accepted",read:false,
      title:"Earlier test Volunteer acceptance confirmed",
      message:"The fictional test Volunteer task was already accepted. This staging QA notification was created later after consistency review.",
      recordOrigin:ORIGIN,isLateNotification:true,
      createdAt:stamp,reconciledAt:stamp,
    });
    if(!audit.exists)tx.create(auditRef,{
      action:"Synthetic Volunteer Acceptance Reconciled (Later QA)",
      caseId:CASE_ID,volunteerUid:uid,performedBy:adminUid,
      recordOrigin:ORIGIN,originalAcceptanceTimeUnknown:true,
      reason:"Pre-existing accepted test task verified; reconciliation recorded at current time, not acceptance time",
      timestamp:stamp,reconciledAt:stamp,
    });
    return {
      status:(!notice.exists||!audit.exists)?"reconciled":"already_present",
      createdNotification:!notice.exists,createdAudit:!audit.exists,
      historicalOriginalAcceptanceVerified:false,
    };
  });
}

module.exports={reconcileAcceptedStagingSupport,ORIGIN};
