"use strict";
/**
 * Read-only verification of accepted fictional E2E 002 BULK offers.
 * Does NOT use the legacy single-task session. Does NOT change the case,
 * responder reservations/locks, accepted tasks, users or notifications.
 * Response is aggregate only, with no names, UIDs, emails or tokens.
 */
const {E2E_CASE_ID,recognizedStagingCase}=require("./stagingVolunteerTask");
const CASE=E2E_CASE_ID;
const ownedUid=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
const acceptedStatuses=new Set(["accepted","responding","on_site","completed"]);
const doc=(db,name,id)=>db.collection(name).doc(id);
const fail=reason=>({status:"blocked",reason,readOnly:true});
async function verifyStaging002BulkAcceptance(db){
  const [c,b,legacy,all]=await Promise.all([
    doc(db,"disasterCases",CASE).get(),
    doc(db,"emergencyAutoDispatchBatches",CASE).get(),
    doc(db,"emergencyAutoDispatch",CASE).get(),
    db.collection("responseAssignments").where("caseId","==",CASE).limit(201).get()
  ]);
  if(!c.exists||!recognizedStagingCase(c.data(),CASE))
    return fail("not_fixed_fictional_002");
  if(!b.exists||b.data()?.testOnly!==true||
    b.data()?.origin!=="staging_bulk_all_eligible_002"||legacy.exists)
    return fail("not_isolated_bulk_002");
  if(all.size>200)return fail("staging_assignment_pool_limit");
  const offers=all.docs.map(s=>s.data()||{});
  if(!offers.length||offers.some(x=>x.caseId!==CASE||
    x.offerMode!=="staging_bulk_all_eligible"))
    return fail("mixed_or_missing_bulk_assignments");
  const accepted=offers.filter(x=>acceptedStatuses.has(x.status));
  const nonAccepted=offers.filter(x=>!acceptedStatuses.has(x.status));
  const uids=offers.map(x=>x.volunteerId);
  if(uids.some(x=>!ownedUid(x))||new Set(uids).size!==uids.length)
    return fail("invalid_or_duplicate_volunteer_assignment");
  const evidence=await Promise.all(offers.map(async a=>{
    const uid=a.volunteerId;
    const aid=CASE+"_"+uid;
    const [lock,reserve,initial,acceptedNotice,audit]=await Promise.all([
      doc(db,"responderLocks",uid).get(),
      doc(db,"autoVolunteerReservations",uid).get(),
      doc(db,"notifications","auto_response_"+aid).get(),
      doc(db,"notifications","auto_batch_accepted_"+aid).get(),
      doc(db,"adminActivityLogs","auto_batch_decision_"+aid).get(),
    ]);
    const accepted=acceptedStatuses.has(a.status);
    return {
      accepted,
      lockGood:lock.exists&&lock.data()?.caseId===CASE&&
        lock.data()?.assignmentId===aid&&lock.data()?.responderUid===uid&&
        lock.data()?.status==="accepted",
      reserveGood:reserve.exists&&reserve.data()?.caseId===CASE&&
        reserve.data()?.assignmentId===aid&&reserve.data()?.uid===uid,
      initialGood:initial.exists&&initial.data()?.caseId===CASE&&
        initial.data()?.assignmentId===aid&&initial.data()?.userId===uid,
      noticeGood:acceptedNotice.exists&&acceptedNotice.data()?.caseId===CASE&&
        acceptedNotice.data()?.assignmentId===aid&&
        acceptedNotice.data()?.responderId===uid&&
        acceptedNotice.data()?.userId===c.data()?.reporterUid,
      auditGood:audit.exists&&audit.data()?.caseId===CASE&&
        audit.data()?.volunteerUid===uid&&
        audit.data()?.action==="Synthetic Bulk Volunteer Accepted",
    };
  }));
  const acceptedEvidence=evidence.filter(x=>x.accepted);
  const correctLocks=acceptedEvidence.filter(x=>x.lockGood).length;
  const correctReservations=acceptedEvidence.filter(x=>x.reserveGood).length;
  const correctInitialNotices=acceptedEvidence.filter(x=>x.initialGood).length;
  const correctResidentNotifications=acceptedEvidence.filter(x=>x.noticeGood).length;
  const correctAudits=acceptedEvidence.filter(x=>x.auditGood).length;
  const unexpectedLocks=evidence.filter(x=>!x.accepted&&x.lockGood).length;
  const count=accepted.length;
  return {
    status:count===0?"no_acceptance_yet":
      correctLocks===count&&correctReservations===count&&
      correctInitialNotices===count&&correctResidentNotifications===count&&
      correctAudits===count&&unexpectedLocks===0?"verified":"needs_review",
    offerCount:offers.length,accepted:count,
    pending:nonAccepted.filter(x=>x.status==="offered").length,
    declined:nonAccepted.filter(x=>x.status==="declined").length,
    correctResponderLocks:correctLocks,
    correctReservations,
    originalOfferNotifications:correctInitialNotices,
    acceptanceResidentNotifications:correctResidentNotifications,
    acceptanceAudits:correctAudits,
    unexpectedPendingResponderLocks:unexpectedLocks,
    // Session can remain "waiting" after an acceptance. This read-only
    // verifier does not claim the session transitioned to "supported".
    batchSessionStatus:String(b.data()?.status||"unknown"),
    furtherWaveEscalationVerified:false,
    fullAcceptanceEvidenceVerified:count>0&&correctLocks===count&&
      correctReservations===count&&correctInitialNotices===count&&
      correctResidentNotifications===count&&correctAudits===count&&
      unexpectedLocks===0,
    readOnly:true,noPersonalDetails:true
  };
}
module.exports={verifyStaging002BulkAcceptance};
