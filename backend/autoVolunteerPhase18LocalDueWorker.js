"use strict";
/**
 * LOCAL AUTH + FIRESTORE EMULATOR ONLY.
 * Unlike the old manually clicked Phase 9 scan, this process-local worker
 * checks whether the next fictional offer wave is due without an Admin click.
 * It is NOT a production scheduler and deliberately has no Render, live,
 * staging, Cloud Scheduler, or server.js registration.
 */
const {emulatorReady}=require("./autoVolunteerPhase6EmulatorDecisionServer");
const {runPhase9DemoDueScan}=require("./autoVolunteerPhase9DueScanEmulator");
const PROJECT="demo-volunserve-auto-phase4";
const MIN_INTERVAL_MS=1000,MAX_INTERVAL_MS=60000;
function isolated(db,env){
  return env===process.env&&emulatorReady(env)&&
    env.FIREBASE_AUTH_EMULATOR_HOST==="127.0.0.1:9099"&&
    db?.projectId===PROJECT;
}

function createLocalEmulatorDueWorker({
  db,env=process.env,clock=()=>Date.now(),intervalMs=5000,
  schedule=setInterval,unschedule=clearInterval
}={}){
  if(!isolated(db,env))
    throw Error("Local auto-due worker refuses non-demo Firebase emulators");
  if(!Number.isInteger(intervalMs)||intervalMs<MIN_INTERVAL_MS||
     intervalMs>MAX_INTERVAL_MS||
     typeof clock!=="function"||typeof schedule!=="function"||
     typeof unschedule!=="function")
    throw Error("Invalid local auto-due worker configuration");

  let started=false,stopped=false,running=false,timer=null;
  let lastResult=null;
  async function tick(){
    if(!started||stopped)
      return {status:"stopped",emulatorOnly:true,dispatchEnabled:false};
    if(running)
      return {status:"skipped_busy",emulatorOnly:true,dispatchEnabled:false};
    // Re-check isolation on EVERY wakeup, not only when the app boots.
    if(!isolated(db,env))
      return {status:"blocked",reason:"emulator_isolation_lost",
        emulatorOnly:true,dispatchEnabled:false};
    running=true;
    try{
      lastResult=await runPhase9DemoDueScan({
        db,env,now:clock(),maxJobs:10
      });
      return lastResult;
    }catch(_error){
      lastResult={status:"blocked",reason:"local_auto_scan_unavailable",
        emulatorOnly:true,dispatchEnabled:false};
      return lastResult;
    }finally{running=false}
  }
  function start(){
    if(started||stopped)throw Error("Local auto-due worker already started/stopped");
    started=true;
    try{
      timer=schedule(()=>{
        // Timers must never leak errors or create unhandled rejections.
        // Returning this promise also lets local CI drive the fake clock.
        return tick().catch(()=>undefined);
      },intervalMs);
      timer?.unref?.();
    }catch(error){
      started=false;
      throw error;
    }
    return stop;
  }
  function stop(){
    if(stopped)return;
    stopped=true;
    if(timer!==null)unschedule(timer);
    timer=null;
  }
  function status(){
    return {emulatorOnly:true,dispatchEnabled:false,
      schedulerAlwaysOn:false,processLocal:true,intervalMs,
      active:started&&!stopped,
      busy:running,
      lastStatus:lastResult?.status||null};
  }
  return {start,stop,tick,status};
}
module.exports={createLocalEmulatorDueWorker};
