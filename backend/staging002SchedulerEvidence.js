"use strict";
/**
 * In-memory, status-only instrumentation for the isolated fixed-fictional 002
 * scheduler. A heartbeat means a scheduled call FINISHED in this server
 * process. It is NOT a durable scheduler or production-grade job guarantee.
 *
 * No IDs, tokens, user data or credentials are retained.
 */
const KNOWN=new Set([
  "supported","waiting","offered","exhausted","blocked",
  "supported_or_changed","error"
]);
function createStaging002SchedulerEvidence(configured=false, clock=()=>Date.now()){
  let count=0,lastStatus="not_run",lastCompletedAtUtc=null;
  function record(result){
    const raw=typeof result==="string"?result:result?.status;
    lastStatus=KNOWN.has(raw)?raw:"other";
    count+=1;
    const now=clock();
    lastCompletedAtUtc=Number.isFinite(now)?new Date(now).toISOString():null;
    return lastStatus;
  }
  function snapshot(){
    return {
      automaticWaveTimerConfigured:Boolean(configured),
      schedulerRunCount:count,
      schedulerLastResult:lastStatus,
      schedulerLastCompletedAtUtc:lastCompletedAtUtc,
      timerExecutionObserved:count>0,
      actualTimerExecutionNotProven:count===0,
      schedulerObservationScope:"current_server_process"
    };
  }
  return {record,snapshot};
}
module.exports={createStaging002SchedulerEvidence};
