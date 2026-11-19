"use strict";
/**
 * PHASE 9 — DEMO FIRESTORE/AUTH EMULATOR ONLY.
 * Atomic Admin cancellation of a waiting Phase 7 automatic-offer batch.
 * No live server import, no production API or Cloud Scheduler registration.
 *
 * Cancellation NEVER changes accepted responders, active GPS/task lifecycle,
 * historical notifications, certificates or donations.
 */
const {FieldValue}=require("firebase-admin/firestore");
const {emulatorReady}=require("./autoVolunteerPhase6EmulatorDecisionServer");
const {isOperationalAdminProfile}=require("./adminAccess");
const {persistentBatchRef}=require("./autoVolunteerPhase7WaveWorkerEmulator");
const {leaseRef}=require("./autoVolunteerPhase8LeaseSchedulerEmulator");
const PROJECT="demo-volunserve-auto-phase4",MAX=200,LIMIT=201;
const ACCEPTED=new Set(["accepted","responding","on_site","completed"]);
const PENDING=new Set(["offered"]);
const KNOWN=new Set(["offered","expired","declined","cancelled"]);
const REASONS=new Set(["admin_manual_takeover","case_closed",
  "incorrect_report","safety_pause","other"]);
const validId=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
const blocked=reason=>({status:"blocked",reason,emulatorOnly:true,changed:false});
function allowed(db,env){
  return env===process.env && emulatorReady(env) &&
    env.FIREBASE_AUTH_EMULATOR_HOST==="127.0.0.1:9099" &&
    db?.projectId===PROJECT&&typeof db.runTransaction==="function";
}
function complete(s){return s&&Array.isArray(s.docs)&&
  Number.isInteger(s.size)&&s.docs.length===s.size&&s.size<=MAX;}
async function cancelEmulatedPendingWave({
  db,env=process.env,authenticatedAdminUid,caseId,reason,now=Date.now()
}={}){
  if(!allowed(db,env))return blocked("isolated_demo_emulators_only");
  if(!validId(authenticatedAdminUid)||!validId(caseId)||
     !REASONS.has(reason)||!Number.isSafeInteger(now)||
     now<1577836800000||now>4102444800000)
    return blocked("invalid_cancel_request");
  const cRef=db.collection("disasterCases").doc(caseId);
  const bRef=persistentBatchRef(db,caseId);
  const lRef=leaseRef(db,caseId);
  const adminRef=db.collection("users").doc(authenticatedAdminUid);
  const auditRef=db.collection("adminActivityLogs")
    .doc("phase9_cancel_"+caseId);
  try{
    return await db.runTransaction(async tx=>{
      // Snapshot scans are BOUNDED for fictional test datasets. Never guess
      // eligibility or ownership if an incomplete collection is returned.
      const [c,b,l,admin,assigns,reserves,locks,audit]=await Promise.all([
        tx.get(cRef),tx.get(bRef),tx.get(lRef),tx.get(adminRef),
        tx.get(db.collection("responseAssignments").limit(LIMIT)),
        tx.get(db.collection("autoVolunteerReservations").limit(LIMIT)),
        tx.get(db.collection("responderLocks").limit(LIMIT)),
        tx.get(auditRef)
      ]);
      if(!admin.exists||
         !isOperationalAdminProfile(admin.data()))
        return blocked("approved_operational_admin_required");
      if(!c.exists||!b.exists)return blocked("case_or_batch_missing");
      if(![assigns,reserves,locks].every(complete))
        return blocked("incomplete_source_scan");
      const caseData=c.data()||{},batch=b.data()||{};
      if(batch.origin!=="phase7_demo_persistent_worker"||
         batch.caseId!==caseId)
        return blocked("foreign_batch_origin");
      if(batch.status==="cancelled"){
        // No new audit/notification or second update.
        return {status:"already_cancelled",emulatorOnly:true,changed:false};
      }
      if(batch.status!=="waiting")
        return blocked("batch_not_pending");
      if(caseData.autoVolunteerDispatch?.state!=="waiting")
        return blocked("case_batch_state_mismatch");
      const assignments=assigns.docs.map(s=>({id:s.id,...s.data()}));
      const own=assignments.filter(x=>x.caseId===caseId);
      if(!own.length)return blocked("missing_pending_offers");
      // Protect accepted/ongoing missions FIRST, even if their status is
      // outside the set of cancellable pending offer statuses.
      if(own.some(x=>ACCEPTED.has(String(x.status||"").toLowerCase()))||
         caseData.autoVolunteerAcceptedAssignmentId||
         caseData.activeVolunteerSupportAssignmentId||
         caseData.activeVolunteerSupportUid)
        return blocked("accepted_or_manually_selected_responder");
      if(own.some(x=>x.offerMode!=="automatic_wave_proposed"||
         !KNOWN.has(String(x.status||"").toLowerCase())))
        return blocked("unknown_or_manual_case_assignment");
      const caseLocks=locks.docs.map(s=>({id:s.id,...s.data()}))
        .filter(x=>x.caseId===caseId);
      if(caseLocks.length)return blocked("existing_responder_lock");
      if(audit.exists)return blocked("unexpected_existing_cancel_audit");
      const allReservations=reserves.docs.map(s=>({id:s.id,...s.data()}));
      const offering=own.filter(x=>PENDING.has(x.status));
      for(const x of offering){
        if(!validId(x.volunteerId)||x.id!==caseId+"_"+x.volunteerId)
          return blocked("invalid_pending_offer_identity");
        const r=allReservations.find(s=>s.id===x.volunteerId);
        if(!r||r.caseId!==caseId||r.assignmentId!==x.id)
          return blocked("pending_reservation_missing_or_foreign");
      }
      // A stale reservation for an already-declined/expired assignment
      // is inconsistent and must be reviewed, not deleted blindly.
      const ownedReservations=allReservations.filter(x=>x.caseId===caseId);
      if(ownedReservations.some(x=>!own.some(a=>
           a.id===x.assignmentId && a.volunteerId===x.id &&
           a.status==="offered")))
        return blocked("orphan_or_stale_reservation");
      // Read set complete. SAME transaction fences accepting Volunteer,
      // due worker, and two Admin cancellation requests by writing CASE.
      const stamp=FieldValue.serverTimestamp();
      for(const x of offering)
        tx.update(db.collection("responseAssignments").doc(x.id),
          {status:"cancelled",updatedAt:stamp});
      for(const x of ownedReservations)
        tx.delete(db.collection("autoVolunteerReservations").doc(x.id));
      tx.update(bRef,{
        status:"cancelled",cancelReason:reason,
        cancelledBy:authenticatedAdminUid,cancelledAtMs:now,
        updatedAt:stamp
      });
      tx.update(cRef,{
        autoVolunteerDispatch:{state:"cancelled",cancelReason:reason,
          cancelledAtMs:now},updatedAt:stamp
      });
      if(l.exists)tx.update(lRef,{
        token:"",leaseUntilMs:0,nextDueAtMs:null,
        lastResult:"cancelled",updatedAt:stamp
      });
      tx.create(auditRef,{
        action:"Automatic Emergency Wave Cancelled (emulator)",
        caseId,actorUid:authenticatedAdminUid,reason,
        cancelledOffers:offering.length,timestamp:stamp
      });
      return {status:"cancelled",emulatorOnly:true,changed:true,
        cancelledOffers:offering.length};
    },{maxAttempts:7});
  }catch(_error){
    return blocked("cancellation_transaction_unavailable");
  }
}

/**
 * An UNMOUNTED route factory for the DEMO Auth + Firestore emulators.
 * Real production token verification is NOT implemented by this prototype;
 * the caller must inject a strict authenticated admin middleware. The DB
 * transaction additionally checks the canonical persisted admin profile.
 */
function registerPhase9EmulatorCancelRoute(app,{
  db,requireFirebaseUser,clock=()=>Date.now(),env=process.env
}={}){
  if(!app||typeof app.post!=="function"||
    typeof requireFirebaseUser!=="function"||
    !db||typeof db.runTransaction!=="function")
    throw new TypeError("Mandatory auth middleware and database required");
  app.post("/api/admin/emergency-auto/preview/:caseId/cancel",
    requireFirebaseUser,async(req,res)=>{
      res.set("Cache-Control","no-store, private");
      if(!allowed(db,env))
        return res.status(503).json({ok:false,status:"blocked",
          reason:"isolated_demo_emulators_only"});
      const data=req.body;
      if(!data||Array.isArray(data)||typeof data!=="object"||
         Object.keys(data).length!==1||
         !Object.prototype.hasOwnProperty.call(data,"reason"))
        return res.status(400).json({ok:false,status:"blocked",
          reason:"unexpected_request_fields"});
      if(!req.firebaseUser?.uid)
        return res.status(401).json({ok:false,status:"blocked",
          reason:"unauthenticated"});
      const result=await cancelEmulatedPendingWave({
        db,env,authenticatedAdminUid:req.firebaseUser.uid,
        caseId:req.params?.caseId,reason:data.reason,now:clock()
      });
      const ok=result.status==="cancelled"||
        result.status==="already_cancelled";
      return res.status(ok?200:409).json({
        ok,status:result.status,reason:result.reason||null,
        cancelledOffers:ok?result.cancelledOffers||0:0,
        changed:result.changed===true,
        emulatorOnly:true,dispatchEnabled:false
      });
    });
}
module.exports={cancelEmulatedPendingWave,registerPhase9EmulatorCancelRoute};
