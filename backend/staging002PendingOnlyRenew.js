"use strict";
/**
 * STAGING ONLY: renew one expired pending invitation on the FIXED fictional
 * STAGING_E2E_002 case after another fixture already accepted.
 *
 * This is a QA recovery action, NOT automatic emergency dispatch:
 * - requires a verified isolated staging Admin API route
 * - never changes an accepted/declined assignment or existing responder lock
 * - never creates a new assignment or retries a real case
 * - one Auth fixture only, max two renewals, fully idempotent transaction
 */
const {FieldValue}=require("./firebaseAdmin");
const {Timestamp}=require("firebase-admin/firestore");
const {E2E_CASE_ID,recognizedStagingCase}=require("./stagingVolunteerTask");
const {FIXTURES}=require("./staging002TestVolunteerProvisioning");
const {deadlineMs}=require("./staging002OfferDeadline");
const CASE=E2E_CASE_ID;
const MAX_RENEWALS=2;
const QA_TTL_MS=15*60*1000;
const blocked=reason=>({status:"blocked",reason});
const doc=(db,coll,id)=>db.collection(coll).doc(id);
const idValid=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);

async function renewExpiredPending002(db,adminUid,slot,now=Date.now()){
  if(!idValid(adminUid))return blocked("staging_admin_required");
  if(!Number.isSafeInteger(now)||now<1577836800000)return blocked("invalid_time");
  if(![1,2,3].includes(slot))return blocked("only_fixed_fictional_slots");
  const fixture=FIXTURES.find(x=>x.slot===slot);
  if(!fixture)return blocked("fixture_not_found");
  const uid=fixture.uid;
  const cRef=doc(db,"disasterCases",CASE);
  const bRef=doc(db,"emergencyAutoDispatchBatches",CASE);
  const legacyRef=doc(db,"emergencyAutoDispatch",CASE);
  const aRefs=FIXTURES.map(x=>doc(db,"responseAssignments",CASE+"_"+x.uid));
  const myRef=doc(db,"responseAssignments",CASE+"_"+uid);
  const resRef=doc(db,"autoVolunteerReservations",uid);
  const lockRef=doc(db,"responderLocks",uid);
  const uRef=doc(db,"users",uid);
  const appRef=doc(db,"volunteerApplications",uid);
  return db.runTransaction(async tx=>{
    // Firestore requires all reads before first write, including the audit id.
    const baseRefs=[cRef,bRef,legacyRef,...aRefs,resRef,lockRef,uRef,appRef];
    const snaps=await Promise.all(baseRefs.map(ref=>tx.get(ref)));
    const [c,b,legacy,...rest]=snaps;
    const offers=rest.slice(0,3);
    const [reservation,lock,user,application]=rest.slice(3);
    const incident=c.exists?c.data()||{}:{};
    const batch=b.exists?b.data()||{}:{};
    if(!c.exists||!recognizedStagingCase(incident,CASE)||
      incident.status!=="assigned"||incident.verificationStatus!=="validated"||
      incident.dispatchBlocked===true||legacy.exists)
      return blocked("not_active_fixed_fictional_case");
    if(!b.exists||batch.testOnly!==true||
      batch.origin!=="staging_bulk_all_eligible_002"||
      batch.status!=="waiting"||batch.wave!==1||batch.volunteerCount!==3)
      return blocked("not_fictional_waiting_batch");
    const assignments=offers.map((snap,i)=>({
      ...FIXTURES[i],data:snap.exists?snap.data()||{}:null
    }));
    if(assignments.some(x=>!x.data||x.data.volunteerId!==x.uid||
      x.data.caseId!==CASE||x.data.offerMode!=="staging_bulk_all_eligible"||
      x.data.createdBy!=="automatic_matching_engine"||
      !["offered","accepted","declined"].includes(x.data.status)))
      return blocked("fixture_assignments_mismatch");
    // No recovery before at least one already-accepted fictional Volunteer:
    // ordinary all-expired/no-accepted cases use the existing stricter retry.
    if(!assignments.some(x=>x.data.status==="accepted"))
      return blocked("no_existing_accepted_fixture");
    const target=assignments.find(x=>x.uid===uid).data;
    if(target.status!=="offered")return blocked("target_not_pending");
    const expiry=deadlineMs(target.expiresAtMs);
    if(expiry===null||expiry>now)return blocked("target_not_expired");
    const prior=Number(target.qaPendingRenewals||0);
    if(!Number.isSafeInteger(prior)||prior<0||prior>=MAX_RENEWALS)
      return blocked("qa_renewal_limit");
    if(!reservation.exists||reservation.data()?.caseId!==CASE||
      reservation.data()?.assignmentId!==CASE+"_"+uid||lock.exists)
      return blocked("reservation_or_responder_lock_conflict");
    const u=user.exists?user.data()||{}:{},app=application.exists?application.data()||{}:{};
    if(!user.exists||!application.exists||u.testOnly!==true||
      u.testFixture!==CASE||u.testFixtureSlot!==slot||
      u.role!=="volunteer"||u.status!=="approved"||
      u.volunteerStatus!=="approved"||u.volunteerAccess!==true||
      u.identityVerified!==true||
      app.testOnly!==true||app.testFixture!==CASE||
      app.uid!==uid||app.status!=="approved")
      return blocked("fictional_volunteer_no_longer_approved");
    const renewNumber=prior+1;
    const logRef=doc(db,"adminActivityLogs",
      "qa_pending_only_renew_"+CASE+"_"+uid+"_"+renewNumber);
    const noteRef=doc(db,"notifications",
      "qa_pending_only_renew_"+CASE+"_"+uid+"_"+renewNumber);
    const [log,note]=await Promise.all([tx.get(logRef),tx.get(noteRef)]);
    if(log.exists||note.exists)return blocked("renewal_already_recorded");
    const expiresAtMs=now+QA_TTL_MS;
    const stamp=FieldValue.serverTimestamp();
    // Crucially: no tx.update on the batch, case, other assignments or locks.
    tx.update(myRef,{expiresAtMs,qaPendingRenewals:renewNumber,updatedAt:stamp});
    tx.update(resRef,{expiresAt:Timestamp.fromMillis(expiresAtMs),updatedAt:stamp});
    tx.create(noteRef,{
      userId:uid,audience:"volunteer",type:"response_assignment",
      caseId:CASE,assignmentId:CASE+"_"+uid,
      title:"FICTIONAL QA expired task offer extended",
      message:"Testing only. Your pending task can be Accepted or Declined for 15 minutes.",
      testOnly:true,read:false,createdAt:stamp
    });
    tx.create(logRef,{
      caseId:CASE,volunteerUid:uid,performedBy:adminUid,
      action:"Fictional staging expired pending offer renewed",
      attempt:renewNumber,testOnly:true,timestamp:stamp
    });
    return {status:"renewed",caseId:CASE,volunteerSlot:slot,
      expiresAtMs,renewalNumber:renewNumber,
      acceptedFixturesPreserved:true,fictionalOnly:true};
  });
}
module.exports={renewExpiredPending002,MAX_RENEWALS,QA_TTL_MS};
