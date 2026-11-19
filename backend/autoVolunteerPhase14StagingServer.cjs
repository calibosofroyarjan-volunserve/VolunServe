"use strict";
/**
 * PHASE 14 — EXPLICITLY INVOKED NEW STAGING SERVICE HTTP ENTRYPOINT.
 *
 * Importing this module has ZERO effects. It NEVER imports production
 * backend/server.js, registers dispatch, runs a scheduler, or calls Firebase
 * until preflight passes. A new independent Render staging service would
 * have to explicitly run: node backend/autoVolunteerPhase14StagingServer.cjs
 *
 * Do NOT run from existing production or historically accepted staging
 * service. No cloud project, Render service or IAM is provisioned here.
 * Runtime flags are guardrails, NOT independent authorization / IAM proof.
 */
const {inspectPhase13StagingRuntime,
  createPhase13ReadOnlyCloudCandidate}
  =require("./autoVolunteerPhase13ReadOnlyCloudBootstrap.cjs");

class Phase14StartupRefusal extends Error{
  constructor(code){
    super("Isolated Phase 14 read-only staging startup refused");
    this.name="Phase14StartupRefusal";
    this.code=code;
  }
}
const refuse=code=>{throw new Phase14StartupRefusal(code)};
function inspectPhase14Listener({env=process.env}={}){
  if(env!==process.env)
    return {allowed:false,reason:"actual_runtime_environment_required"};
  const gate=inspectPhase13StagingRuntime({env});
  if(!gate.allowed)return {allowed:false,reason:gate.reason};
  if(env?.VOLUNSERVE_PHASE14_LISTENER!=="read_only_canary")
    return {allowed:false,reason:"listener_off_by_default"};
  if(env?.VOLUNSERVE_PHASE14_ALLOW_WRITES!=="disabled"||
     env?.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH!=="disabled")
    return {allowed:false,reason:"write_and_dispatch_kill_switch_required"};
  if(env?.VOLUNSERVE_PHASE14_NO_WORKER!=="true")
    return {allowed:false,reason:"background_worker_must_be_off"};

  // A loopback-only ephemeral port is useful for offline CI with fake SDK.
  // A cloud service must bind only with explicit 0.0.0.0 and a real PORT.
  const host=env?.VOLUNSERVE_PHASE14_BIND_HOST;
  if(host!=="127.0.0.1"&&host!=="0.0.0.0")
    return {allowed:false,reason:"explicit_listener_host_required"};
  const literal=env?.PORT;
  if(typeof literal!=="string"||!/^(0|[1-9][0-9]{0,4})$/.test(literal))
    return {allowed:false,reason:"explicit_valid_port_required"};
  const port=Number(literal);
  const localTestPort=port===0&&host==="127.0.0.1"&&
    env.NODE_ENV==="test";
  if(!localTestPort&&(port<1024||port>65535))
    return {allowed:false,reason:"explicit_valid_port_required"};
  if(host==="0.0.0.0"&&
    env.VOLUNSERVE_PHASE14_CLOUD_INGRESS!=="read_only_reviewed")
    return {allowed:false,reason:"cloud_ingress_review_required"};
  return {
    allowed:true,reason:null,host,port,readOnly:true,
    dispatchEnabled:false,schedulerEnabled:false,
    deploymentAuthorized:false,identityAndIamAttested:false
  };
}
/**
 * makeCandidate is injectable ONLY for hermetic tests; the default uses
 * Phase 13's Admin SDK, workload identity and Phase 12's GET-only app.
 * No listen() is attempted until ALL runtime guards and candidate creation
 * succeed. A failed listener closes the candidate Firebase Admin app.
 */
async function startPhase14StagingService({
  env=process.env,makeCandidate=createPhase13ReadOnlyCloudCandidate
}={}){
  const check=inspectPhase14Listener({env});
  if(!check.allowed)refuse(check.reason);
  if(typeof makeCandidate!=="function")
    refuse("candidate_factory_missing");
  let candidate;
  try{
    candidate=await makeCandidate({env});
    if(!candidate||candidate.readOnly!==true||
      candidate.dispatchEnabled!==false||
      candidate.autoSchedulerEnabled!==false||
      candidate.cloudDeployed!==false||
      typeof candidate.close!=="function"||
      typeof candidate.httpApp?.listen!=="function")
      refuse("candidate_not_read_only");
    // Re-evaluate mutable flags immediately before binding.
    const after=inspectPhase14Listener({env});
    if(!after.allowed)refuse("listener_disabled_during_startup");
    let server;
    try{
      server=await new Promise((resolve,reject)=>{
        const s=candidate.httpApp.listen(after.port,after.host);
        s.once("listening",()=>resolve(s));
        s.once("error",reject);
      });
    }catch(_e){
      refuse("listener_bind_failed");
    }
    let closed=false;
    return Object.freeze({
      started:true,
      address:server.address(),
      readOnly:true,
      dispatchEnabled:false,
      schedulerEnabled:false,
      cloudDeploymentAuthorized:false,
      async close(){
        if(closed)return;
        closed=true;
        let closeError=null;
        await new Promise(resolve=>{
          server.close(e=>{closeError=e;resolve()});
        });
        try{await candidate.close()}catch(_e){}
        if(closeError)throw new Phase14StartupRefusal("listener_close_failed");
      }
    });
  }catch(error){
    if(candidate?.close){
      try{await candidate.close()}catch(_e){}
    }
    if(error instanceof Phase14StartupRefusal)throw error;
    // Never expose cloud SDK, token, key, path or IAM errors in logs.
    refuse("candidate_staging_startup_unavailable");
  }
}
// This file is intentionally NOT the backend/package.json start script.
// Explicit execution is possible only after a separate new-service release
// authorization and effective cloud IAM audit by its human operator.
if(require.main===module){
  let running;
  let stopping=false;
  const shutdown=async()=>{
    if(stopping)return;
    stopping=true;
    if(running)await running.close().catch(()=>{});
    process.exitCode=0;
  };
  startPhase14StagingService().then(result=>{
    running=result;
    process.once("SIGTERM",shutdown);
    process.once("SIGINT",shutdown);
    // No project/UID/credential info printed.
    process.stdout.write("Phase 14 isolated READ-ONLY candidate listener started.\n");
  }).catch(error=>{
    process.stderr.write("Phase 14 refused startup: "+
      (error instanceof Phase14StartupRefusal?error.code:
        "startup_unavailable")+"\n");
    process.exitCode=1;
  });
}
module.exports={
  inspectPhase14Listener,startPhase14StagingService,
  Phase14StartupRefusal
};
