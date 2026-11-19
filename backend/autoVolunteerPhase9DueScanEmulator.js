"use strict";
/**
 * Phase 9 DEMO only: manually invoked due-batch scan -> Phase 8 durable lease
 * -> Phase 7 idempotent reconciliation. No cron/webhook/server registration.
 * It is NOT a managed always-on scheduler.
 */
const {emulatorReady}=require("./autoVolunteerPhase6EmulatorDecisionServer");
const {invokeEmulatedDueWave}=require("./autoVolunteerPhase8LeaseSchedulerEmulator");
const PROJECT="demo-volunserve-auto-phase4";
const validMs=x=>Number.isSafeInteger(x)&&x>1577836800000&&x<4102444800000;
const blocked=reason=>({status:"blocked",reason,emulatorOnly:true});
async function runPhase9DemoDueScan({
  db,env=process.env,now=Date.now(),maxJobs=10
}={}){
  if(env!==process.env||!emulatorReady(env)||
     env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9099"||
     db?.projectId!==PROJECT)
    return blocked("isolated_demo_emulators_only");
  if(!validMs(now)||!Number.isInteger(maxJobs)||maxJobs<1||maxJobs>10)
    return blocked("invalid_schedule_params");
  try{
    const snaps=await db.collection("emergencyAutoDispatchBatches")
      .limit(201).get();
    if(!Array.isArray(snaps.docs)||snaps.size!==snaps.docs.length||
       snaps.docs.length>200)
      return blocked("incomplete_or_over_limit_batches");
    // Any pending batch can be selected when a responder accepted; the
    // worker's lease transaction independently validates winning state.
    const waiting=snaps.docs.filter(d=>d.data()?.status==="waiting");
    const candidates=[];
    for(const snap of waiting){
      const data=snap.data();
      const isDue=validMs(data.expiresAtMs)&&data.expiresAtMs<=now;
      const c=await db.collection("disasterCases").doc(snap.id).get();
      const accepted=c.exists&&
        typeof c.data()?.autoVolunteerAcceptedAssignmentId==="string"&&
        c.data().autoVolunteerAcceptedAssignmentId.length>0;
      if(isDue||accepted)candidates.push({id:snap.id,
        dueAt:data.expiresAtMs});
    }
    candidates.sort((a,b)=>a.dueAt-b.dueAt||a.id.localeCompare(b.id));
    const chosen=candidates.slice(0,maxJobs);
    const statuses={};
    for(const entry of chosen){
      const result=await invokeEmulatedDueWave({
        db,env,caseId:entry.id,now
      });
      statuses[result.status]=(statuses[result.status]||0)+1;
    }
    return {status:"scanned",emulatorOnly:true,dispatchEnabled:false,
      inspected:snaps.docs.length,due:candidates.length,executed:chosen.length,
      deferred:candidates.length-chosen.length,outcomes:statuses};
  }catch(_e){return blocked("due_scan_unavailable")}
}
module.exports={runPhase9DemoDueScan};
