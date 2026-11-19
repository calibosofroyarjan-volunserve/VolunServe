"use strict";
/**
 * PHASE 7 — FIRESTORE EMULATOR ONLY — persistent batch + wave reconciliation.
 *
 * NO scheduling service, no HTTP route, no production server import.
 * A trusted, explicitly invoked demo worker can recover a due batch after a
 * process restart because the batch and offer deadlines live in Firestore.
 * Free Render's process-local setInterval is NOT a durable production worker.
 */
const {FieldValue}=require("firebase-admin/firestore");
const {emulatorReady,ASSIGNMENT_MODE}=require("./autoVolunteerPhase6EmulatorDecisionServer");
const {previewAllEligibleWave}=require("./emergencyAutoVolunteerReadOnlyPlanner");
const PROJECT="demo-volunserve-auto-phase4";
const MAX=200, LIMIT=201, OFFER_MS=180000;
const RESPONDED=new Set(["accepted","responding","on_site","completed"]);
const allowedCaseStatus=new Set(["validated","assigned","in_progress"]);
const validId=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
const blocked=reason=>({status:"blocked",reason,emulatorOnly:true});
const statusOf=x=>String(x?.status||"").trim().toLowerCase();
function complete(snapshot){
  return snapshot&&Array.isArray(snapshot.docs)&&
    Number.isInteger(snapshot.size)&&snapshot.size===snapshot.docs.length&&
    snapshot.size<=MAX;
}
function record(s){return {id:s.id,...s.data()};}
function isOwnedAuto(a,caseId){
  return a.caseId===caseId&&a.offerMode===ASSIGNMENT_MODE;
}
function offerRef(db,cid,uid){return db.collection("responseAssignments").doc(cid+"_"+uid);}
function reserveRef(db,uid){return db.collection("autoVolunteerReservations").doc(uid);}
function safeNow(n){return Number.isSafeInteger(n)&&n>1577836800000&&n<4102444800000;}
function persistentBatchRef(db,caseId){
  return db.collection("emergencyAutoDispatchBatches").doc(caseId);
}
function eligiblePlan({
  caseId,caseData,roster,assignments,locks,reservations,
  attempted=[],completed=[]
}){
  const reserved=new Set(reservations.map(x=>x.uid).filter(validId));
  // Any previously expired/declined offers must be ignored for "pending"
  // detection but their UIDs remain in attempted to prevent repeat offers.
  const normalized=assignments.map(x=>isOwnedAuto(x,caseId)&&
    ["expired","offered"].includes(statusOf(x))
    ? {...x,status:"cancelled"}:x);
  return previewAllEligibleWave({
    env:{VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW:"enabled",
      VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled"},
    caseData:{...caseData,id:caseId},
    roster:roster.filter(x=>!reserved.has(x.uid)),
    existingAssignments:normalized,activeLocks:locks,
    sourceScansComplete:true,
    attemptedVolunteerIds:attempted,completedWaves:completed,
    // No guessing physical adjacency. Wave 2 is DISABLED pending a
    // separately reviewed official SJDM adjacency map.
    neighborsByBarangay:{},neighborMapReviewed:false
  });
}
async function reconcileEmulatedAutomaticWave({
  db,env=process.env,caseId,now=Date.now()
}={}){
  if(!emulatorReady(env))return blocked("isolated_emulator_write_disabled");
  if(!db||typeof db.runTransaction!=="function"||db.projectId!==PROJECT)
    return blocked("demo_project_database_required");
  if(!validId(caseId)||!safeNow(now))return blocked("invalid_case_or_clock");
  const cRef=db.collection("disasterCases").doc(caseId);
  const bRef=persistentBatchRef(db,caseId);
  try{
    return await db.runTransaction(async tx=>{
      // Full bounded queries are necessary for this limited fictional QA
      // cohort. If >200 records exist, fail CLOSED; never drop eligible UIDs.
      const [c,b,apps,assign,locks,reservations]=await Promise.all([
        tx.get(cRef),tx.get(bRef),
        tx.get(db.collection("volunteerApplications").limit(LIMIT)),
        tx.get(db.collection("responseAssignments").limit(LIMIT)),
        tx.get(db.collection("responderLocks").limit(LIMIT)),
        tx.get(db.collection("autoVolunteerReservations").limit(LIMIT))
      ]);
      if(!c.exists)return blocked("case_missing");
      if(![apps,assign,locks,reservations].every(complete))
        return blocked("incomplete_or_over_limit_sources");
      const cData=c.data()||{};
      const assignments=assign.docs.map(record);
      const caseAssignments=assignments.filter(x=>x.caseId===caseId);
      const currentOffers=caseAssignments.filter(x=>isOwnedAuto(x,caseId));
      if(caseAssignments.some(x=>!isOwnedAuto(x,caseId)))
        return blocked("mixed_manual_and_automatic_assignment_history");
      if(cData.verificationStatus!=="validated"||
         !allowedCaseStatus.has(cData.status)||
         cData.dispatchBlocked===true||cData.resolvedAt||cData.closedAt)
        return blocked("case_not_dispatchable");
      if(b.exists){
        if(b.data()?.origin!=="phase7_demo_persistent_worker")
          return blocked("batch_not_owned_by_phase7");
        if(b.data().status==="supported"||b.data().status==="exhausted")
          return {status:b.data().status,emulatorOnly:true,changed:false};
        if(b.data().status!=="waiting")
          return blocked("batch_unknown_state");
        if(!currentOffers.length)return blocked("batch_missing_offers");
      }else if(caseAssignments.length){
        return blocked("existing_case_assignments_without_batch");
      }
      const responded=currentOffers.filter(x=>RESPONDED.has(statusOf(x)));
      if(responded.length){
        const winner=cData.autoVolunteerAcceptedAssignmentId;
        const matched=responded.length===1 &&
          winner===responded[0].id &&
          cData.activeVolunteerSupportAssignmentId===winner &&
          cData.activeVolunteerSupportUid===responded[0].volunteerId;
        if(!matched)return blocked("conflicting_or_unverified_accepted_responder");
        // Once one Volunteer accepts, every sibling OFFER must be closed and
        // their reservations released. Otherwise old pending offers keep
        // approved Volunteers unavailable for future fictional incidents.
        // The accepted winner, responder lock, history and notices stay intact.
        const siblings=currentOffers.filter(x=>statusOf(x)==="offered");
        const reserved=reservations.docs.map(record);
        for(const sibling of siblings){
          if(!validId(sibling.volunteerId)||
             sibling.id!==caseId+"_"+sibling.volunteerId)
            return blocked("untrusted_sibling_offer_identity");
          const match=reserved.find(x=>x.id===sibling.volunteerId);
          if(match&&(match.caseId!==caseId||
             match.assignmentId!==sibling.id||
             (match.uid&&match.uid!==sibling.volunteerId)))
            return blocked("foreign_sibling_reservation");
        }
        const stamp=FieldValue.serverTimestamp();
        for(const sibling of siblings){
          tx.update(offerRef(db,caseId,sibling.volunteerId),
            {status:"cancelled",updatedAt:stamp});
          if(reserved.some(x=>x.id===sibling.volunteerId))
            tx.delete(reserveRef(db,sibling.volunteerId));
        }
        tx.update(bRef,{status:"supported",updatedAt:stamp});
        return {status:"supported",emulatorOnly:true,changed:true,
          cancelledPendingOffers:siblings.length};
      }
      // If a manual Admin offer races with the demo batch, the case pointer
      // protects the worker from adding more offers. Phase 5 UI rules still
      // require full deployment review, which is deliberately NOT done here.
      if(cData.autoVolunteerAcceptedAssignmentId||
        cData.activeVolunteerSupportAssignmentId||
        cData.activeVolunteerSupportUid)
        return blocked("manual_or_accepted_responder_exists");
      if(currentOffers.some(x=>!["offered","declined","expired","cancelled"]
          .includes(statusOf(x))))
        return blocked("unexpected_prior_offer_state");
      const pending=currentOffers.filter(x=>x.status==="offered"&&
        Number.isSafeInteger(x.expiresAtMs)&&x.expiresAtMs>now);
      if(currentOffers.some(x=>x.status==="offered"&&
         (!safeNow(x.expiresAtMs)||x.expiresAtMs<=0)))
        return blocked("invalid_existing_offer_deadline");
      if(b.exists&&pending.length)
        return {status:"waiting",emulatorOnly:true,changed:false,
          wave:b.data().wave,pending:pending.length};
      const due=currentOffers.filter(x=>x.status==="offered"&&
        x.expiresAtMs<=now);
      const reservationsList=reservations.docs.map(record);
      // A reservation may only be deleted if it still belongs to this offer.
      for(const offered of due){
        const reservation=reservationsList.find(x=>x.id===offered.volunteerId);
        if(reservation && (reservation.caseId!==caseId||
             reservation.assignmentId!==offered.id))
          return blocked("existing_reservation_owned_by_other_case");
      }
      const existingLocks=locks.docs.map(record);
      const appsList=apps.docs.map(record);
      // Query + profile documents are still READ in the same transaction;
      // Firestore retries if any profile or case changes during this commit.
      const approved=appsList.filter(x=>
        statusOf(x)==="approved");
      const profiles=await Promise.all(approved.map(a=>{
        const uid=String(a.uid||a.userId||a.volunteerId||a.id);
        return validId(uid)?tx.get(db.collection("users").doc(uid)):Promise.resolve(null);
      }));
      const roster=approved.map((a,i)=>{
        const uid=String(a.uid||a.userId||a.volunteerId||a.id);
        return {uid,application:{...a,status:"approved"},
          user:profiles[i]?.exists?{...profiles[i].data(),uid}:{}};
      });
      const oldCompleted=Array.isArray(b.data()?.completedWaves)?
        b.data().completedWaves.filter(x=>[1,2,3].includes(x)):[];
      const completed=b.exists?
        [...new Set([...oldCompleted,b.data().wave])]:[];
      const attempted=caseAssignments.map(x=>x.volunteerId).filter(validId);
      const plan=eligiblePlan({caseId,caseData:cData,roster,assignments,
        locks:existingLocks,reservations:reservationsList,
        attempted,completed});
      if(plan.status==="blocked"&&
         plan.reason!=="no_verified_eligible_volunteers")
        return blocked(plan.reason);
      const exhausted=plan.status!=="preview_only";
      const people=exhausted?[]:plan.offerCandidateUids;
      if(people.length>40)return blocked("wave_fanout_limit");
      const candidateDocs=people.map(uid=>({
        uid,assignmentRef:offerRef(db,caseId,uid),
        reservationRef:reserveRef(db,uid),
        notificationRef:db.collection("notifications")
          .doc("phase7_offer_"+caseId+"_"+uid),
        auditRef:db.collection("adminActivityLogs")
          .doc("phase7_offer_"+caseId+"_"+uid)
      }));
      const checks=await Promise.all(candidateDocs.flatMap(x=>[
        tx.get(x.assignmentRef),tx.get(x.reservationRef),
        tx.get(x.notificationRef),tx.get(x.auditRef)
      ]));
      if(checks.some(x=>x.exists))
        return blocked("duplicate_candidate_or_side_effect_record");
      // ALL READS HAVE FINISHED. Only now stage atomic writes.
      const stamp=FieldValue.serverTimestamp();
      for(const offered of due){
        tx.update(offerRef(db,caseId,offered.volunteerId),
          {status:"expired",updatedAt:stamp});
        if(reservationsList.some(x=>x.id===offered.volunteerId))
          tx.delete(reserveRef(db,offered.volunteerId));
      }
      if(exhausted){
        const batchPatch={status:"exhausted",wave:b.exists?b.data().wave:0,
          completedWaves:completed,updatedAt:stamp};
        if(b.exists)tx.update(bRef,batchPatch);
        else tx.create(bRef,{...batchPatch,caseId,createdAt:stamp,
          origin:"phase7_demo_persistent_worker"});
        tx.update(cRef,{autoVolunteerDispatch:{
          state:"needs_admin_review",wave:batchPatch.wave
        },updatedAt:stamp});
        return {status:"exhausted",emulatorOnly:true,changed:true,
          expired:due.length};
      }
      const wave=plan.wave, expiresAtMs=now+OFFER_MS;
      const patch={status:"waiting",wave,completedWaves:completed,
        expiresAtMs,volunteerCount:people.length,updatedAt:stamp};
      if(b.exists)tx.update(bRef,patch);
      else tx.create(bRef,{...patch,caseId,createdAt:stamp,
        origin:"phase7_demo_persistent_worker"});
      for(const o of candidateDocs){
        const user=roster.find(x=>x.uid===o.uid)?.user||{};
        tx.create(o.reservationRef,{
          uid:o.uid,caseId,assignmentId:o.assignmentRef.id,
          wave,expiresAtMs,createdAt:stamp
        });
        tx.create(o.assignmentRef,{
          caseId,volunteerId:o.uid,
          volunteerName:String(user.fullName||"Fictional Volunteer").slice(0,120),
          caseTitle:String(cData.title||"Fictional Emergency").slice(0,120),
          createdBy:"automatic_matching_engine",
          offerMode:ASSIGNMENT_MODE,status:"offered",
          wave,expiresAtMs,createdAt:stamp,updatedAt:stamp
        });
        tx.create(o.notificationRef,{
          userId:o.uid,type:"emergency_task_offer",caseId,
          assignmentId:o.assignmentRef.id,
          title:"Emergency Volunteer offer",
          message:"An emergency task offer is available.",
          wave,read:false,createdAt:stamp
        });
        tx.create(o.auditRef,{
          action:"Automatic Volunteer Offered (emulator)",
          caseId,volunteerUid:o.uid,wave,
          timestamp:stamp
        });
      }
      tx.update(cRef,{
        status:"assigned",
        autoVolunteerDispatch:{
          state:"waiting",wave,expiresAtMs,volunteerCount:people.length
        },updatedAt:stamp
      });
      return {status:"offered",emulatorOnly:true,changed:true,
        wave,offered:people.length,expired:due.length,expiresAtMs};
    },{maxAttempts:7});
  }catch(_error){
    // Do not leak Firestore errors, candidate UIDs or private data.
    return blocked("transaction_unavailable");
  }
}
module.exports={reconcileEmulatedAutomaticWave,persistentBatchRef};
