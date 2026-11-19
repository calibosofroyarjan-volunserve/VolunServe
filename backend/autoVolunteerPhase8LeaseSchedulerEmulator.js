"use strict";
/**
 * PHASE 8: EMULATOR-ONLY persistent lease and due-batch recovery contract.
 * No cron, no Cloud Tasks, no production web route, no server.js import.
 * Future real wake-up requires an authenticated externally scheduled worker.
 *
 * Firestore transactions make lease claims race-safe in one demo project,
 * but a lease ALONE is NOT a production fencing guarantee: the Phase 7
 * reconciliation transaction does not check the lease token. Underlying
 * idempotent wave state still prevents duplicate offers in this demo.
 */
const {randomUUID}=require("node:crypto");
const {FieldValue}=require("firebase-admin/firestore");
const {emulatorReady}=require("./autoVolunteerPhase6EmulatorDecisionServer");
const {reconcileEmulatedAutomaticWave,persistentBatchRef}
  =require("./autoVolunteerPhase7WaveWorkerEmulator");
const PROJECT="demo-volunserve-auto-phase4";
const LEASE_MS=45000;
const RETRY_MS=300000;
const validId=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
const isMs=x=>Number.isSafeInteger(x)&&x>=1577836800000&&x<=4102444800000;
const blocked=reason=>({status:"blocked",reason,emulatorOnly:true});
function allowed(db,env){
  return emulatorReady(env) && db?.projectId===PROJECT &&
    typeof db.runTransaction==="function";
}
function leaseRef(db,caseId){
  return db.collection("autoVolunteerSchedulerLeases").doc(caseId);
}
/** Atomic claim of ONE existing batch. Nothing is scheduled automatically. */
async function claimEmulatedDueWave({db,env=process.env,caseId,now=Date.now()}={}){
  if(!allowed(db,env))return blocked("isolated_emulator_only");
  if(!validId(caseId)||!isMs(now))return blocked("invalid_case_or_clock");
  const token=randomUUID(); // private worker token: never expose via HTTP.
  const bRef=persistentBatchRef(db,caseId);
  const lRef=leaseRef(db,caseId);
  const cRef=db.collection("disasterCases").doc(caseId);
  try{
    return await db.runTransaction(async tx=>{
      const [batch,lease,incident]=await Promise.all([
        tx.get(bRef),tx.get(lRef),tx.get(cRef)
      ]);
      if(!batch.exists||!incident.exists)return blocked("batch_or_case_missing");
      const b=batch.data()||{},c=incident.data()||{};
      if(b.origin!=="phase7_demo_persistent_worker")
        return blocked("batch_not_owned_by_demo");
      if(b.status!=="waiting")
        return {status:b.status==="supported"||b.status==="exhausted"?
          "terminal":"blocked",emulatorOnly:true,changed:false};
      const accepted=typeof c.autoVolunteerAcceptedAssignmentId==="string" &&
        c.autoVolunteerAcceptedAssignmentId.length>0;
      if(!isMs(b.expiresAtMs))return blocked("invalid_batch_due_at");
      if(!accepted&&b.expiresAtMs>now)
        return {status:"not_due",emulatorOnly:true,changed:false,
          dueAtMs:b.expiresAtMs};
      const previous=lease.exists?lease.data()||{}:{};
      if(typeof previous.token==="string"&&previous.token.length>0 &&
        isMs(previous.leaseUntilMs)&&previous.leaseUntilMs>now)
        return {status:"leased_elsewhere",emulatorOnly:true,changed:false};
      const patch={
        caseId,token,leaseUntilMs:now+LEASE_MS,
        claimedAtMs:now,
        dueAtMs:b.expiresAtMs,
        attempts:Math.min(100000,(Number.isInteger(previous.attempts)?
          previous.attempts:0)+1),
        updatedAt:FieldValue.serverTimestamp()
      };
      if(lease.exists)tx.update(lRef,patch);
      else tx.create(lRef,patch);
      return {status:"claimed",emulatorOnly:true,changed:true,
        token,leaseUntilMs:now+LEASE_MS};
    },{maxAttempts:7});
  }catch(_error){return blocked("lease_claim_unavailable")}
}
/**
 * Complete only the exact lease holder. A lost or expired lease cannot be
 * acknowledged by a stale worker. Next due is persistent for inspection.
 */
async function finishEmulatedLease({
  db,env=process.env,caseId,token,now=Date.now(),resultStatus="blocked"
}={}){
  if(!allowed(db,env))return blocked("isolated_emulator_only");
  if(!validId(caseId)||typeof token!=="string"||token.length<16||
    !isMs(now))return blocked("invalid_finish_request");
  const bRef=persistentBatchRef(db,caseId),lRef=leaseRef(db,caseId);
  try{
    return await db.runTransaction(async tx=>{
      const [lease,batch]=await Promise.all([tx.get(lRef),tx.get(bRef)]);
      if(!lease.exists||lease.data()?.token!==token)
        return blocked("not_lease_holder");
      if(!isMs(lease.data()?.leaseUntilMs)||
        lease.data().leaseUntilMs<=now)
        return blocked("lease_expired");
      const b=batch.exists?batch.data()||{}:{};
      const terminal=b.status==="supported"||b.status==="exhausted";
      const dueAt=terminal?null:
        b.status==="waiting"&&isMs(b.expiresAtMs)?
        b.expiresAtMs:now+RETRY_MS;
      tx.update(lRef,{
        token:"",leaseUntilMs:0,finishedAtMs:now,
        lastResult:String(resultStatus).slice(0,60),
        nextDueAtMs:dueAt,
        updatedAt:FieldValue.serverTimestamp()
      });
      return {status:"finished",emulatorOnly:true,changed:true,
        terminal,nextDueAtMs:dueAt};
    },{maxAttempts:7});
  }catch(_error){return blocked("lease_finish_unavailable")}
}
/**
 * Intended to be invoked by a future *external trusted* scheduler.
 * No timer is registered, and no endpoint exists. The local runner invokes
 * Phase 7 only after claiming a due batch, and acknowledges the result.
 */
async function invokeEmulatedDueWave({db,env=process.env,caseId,now=Date.now()}={}){
  const claim=await claimEmulatedDueWave({db,env,caseId,now});
  if(claim.status!=="claimed")return claim;
  const result=await reconcileEmulatedAutomaticWave({db,env,caseId,now});
  const done=await finishEmulatedLease({
    db,env,caseId,token:claim.token,now:Math.max(now,Date.now()),
    resultStatus:result.status
  });
  // Never return the private lease token to an app client.
  return {status:result.status,reason:result.reason||null,
    emulatorOnly:true,changed:result.changed===true,
    acknowledged:done.status==="finished",
    leaseStatus:done.status};
}
module.exports={claimEmulatedDueWave,finishEmulatedLease,invokeEmulatedDueWave,leaseRef};
