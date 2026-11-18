"use strict";
/**
 * Fixed-fictional STAGING_E2E_002 only. Read-only snapshot of wave-stop state.
 * Never invokes the potentially mutating advanceBatchWave worker.
 * No identities/UIDs or assignment document IDs are returned.
 */
const {E2E_CASE_ID,recognizedStagingCase}=require("./stagingVolunteerTask");
const {verifyStaging002BulkAcceptance}=require("./staging002BulkAcceptanceVerifier");
const {deadlineMs}=require("./staging002OfferDeadline");
const ID=E2E_CASE_ID;
const ACCEPTED=new Set(["accepted","responding","on_site","completed"]);
const stop=(reason)=>({status:"blocked",reason,readOnly:true,productionConnected:false});
async function verifyStaging002WaveStop(db,{timerConfigured=false,now=Date.now()}={}){
  if(!Number.isSafeInteger(now)||now<0)return stop("invalid_clock");
  const [caseSnap,batchSnap,legacySnap,all]=await Promise.all([
    db.collection("disasterCases").doc(ID).get(),
    db.collection("emergencyAutoDispatchBatches").doc(ID).get(),
    db.collection("emergencyAutoDispatch").doc(ID).get(),
    db.collection("responseAssignments").where("caseId","==",ID).limit(201).get()
  ]);
  if(!caseSnap.exists||!recognizedStagingCase(caseSnap.data(),ID))
    return stop("fictional_case_not_recognized");
  const c=caseSnap.data()||{};
  if(!batchSnap.exists||batchSnap.data()?.testOnly!==true||
     batchSnap.data()?.origin!=="staging_bulk_all_eligible_002"||
     legacySnap.exists)return stop("not_isolated_bulk_case");
  if(all.size>200)return stop("staging_assignment_pool_limit");
  const session=batchSnap.data()||{};
  const offers=all.docs.map(x=>x.data()||{});
  if(!offers.length||offers.some(x=>x.caseId!==ID ||
    x.offerMode!=="staging_bulk_all_eligible"||
    !Number.isInteger(x.wave)||x.wave<1||x.wave>3))
    return stop("invalid_or_mixed_wave_offers");
  const accepted=offers.filter(x=>ACCEPTED.has(x.status));
  const acceptedInCurrentWave=accepted.filter(x=>x.wave===session.wave).length;
  const laterWaveOffers=offers.filter(x=>x.wave>session.wave).length;
  const earlierWaveOffers=offers.filter(x=>x.wave<session.wave).length;
  const pending=offers.filter(x=>x.status==="offered");
  const expiredPending=pending.filter(x=>{
    const deadline=deadlineMs(x.expiresAtMs);
    return deadline!==null&&deadline<=now;
  }).length;
  const unknownDeadlines=pending.filter(x=>deadlineMs(x.expiresAtMs)===null).length;
  const priorReview=await verifyStaging002BulkAcceptance(db);
  if(priorReview.status==="blocked")return stop("bulk_acceptance_verification_blocked");
  const acceptanceEvidence=priorReview.fullAcceptanceEvidenceVerified===true &&
    priorReview.status==="verified" &&
    priorReview.accepted===accepted.length;
  // This reproduces the positive read-only guard conditions before the
  // wave engine's early return. It does NOT prove that a Render timer fired.
  const acceptedStopsNextWave=accepted.length>0 &&
    session.status==="waiting" && (c.status==="assigned"||c.status==="validated") &&
    c.verificationStatus==="validated" && c.dispatchBlocked!==true &&
    !c.activeVolunteerSupportAssignmentId &&
    laterWaveOffers===0 && acceptanceEvidence;
  const observedAfterExpiry=acceptedStopsNextWave &&
    pending.length===expiredPending && unknownDeadlines===0;
  return {
    status:acceptedStopsNextWave?"wave_stop_guard_confirmed":
      accepted.length===0?"no_accepted_responder":"needs_review",
    readOnly:true,productionConnected:false,noPersonalDetails:true,
    caseType:"fixed_fictional_002",
    currentWave:Number(session.wave||0),
    batchSessionStatus:String(session.status||"unknown"),
    totalOffers:offers.length,accepted:accepted.length,
    acceptedInCurrentWave,otherPendingOffers:pending.length,
    expiredOtherOffers:expiredPending,unknownDeadlines,
    earlierWaveOffers,laterWaveOffers,
    correctResponderLocks:priorReview.correctResponderLocks||0,
    acceptanceEvidenceVerified:acceptanceEvidence,
    noLaterWaveObserved:laterWaveOffers===0,
    waveStopGuardConfirmed:acceptedStopsNextWave,
    observedAfterOtherOffersExpired:observedAfterExpiry,
    automaticWaveTimerConfigured:Boolean(timerConfigured),
    timerExecutionObserved:false,
    actualTimerExecutionNotProven:true,
    serverTimeUtc:new Date(now).toISOString(),
    note:observedAfterExpiry?
      "One accepted fictional responder; no later wave observed after other offers expired. This does not prove the scheduler ran.":
      "Snapshot only. A further-wave stop cannot yet be fully established."
  };
}
module.exports={verifyStaging002WaveStop};
