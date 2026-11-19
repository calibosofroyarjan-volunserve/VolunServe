"use strict";
/**
 * Phase 14 OFFLINE readiness tests, including real localhost listener.
 * Firebase Admin, Firestore and Auth are simulated only; no cloud services,
 * ADC, real credentials, Render or production data are ever used.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const net=require("node:net");
const express=require("express");
const {
  inspectPhase14Listener,startPhase14StagingService,Phase14StartupRefusal
}=require("./autoVolunteerPhase14StagingServer.cjs");
const {createPhase13ReadOnlyCloudCandidate}
  =require("./autoVolunteerPhase13ReadOnlyCloudBootstrap.cjs");

const PROJECT="volunserve-auto-phase14-qa";
const SERVICE="srv-phase14brandnewqa001";
const KEYS=[
  "VOLUNSERVE_PHASE13_BOOTSTRAP",
  "VOLUNSERVE_PHASE13_STAGING_ONLY",
  "VOLUNSERVE_PHASE13_SERVICE_ID",
  "VOLUNSERVE_PHASE13_STAGING_BRANCH",
  "VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT",
  "VOLUNSERVE_PHASE12_CLOUD_PREVIEW",
  "VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW",
  "VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH",
  "VOLUNSERVE_PHASE12_MODE",
  "RENDER_SERVICE_ID","GCLOUD_PROJECT","GOOGLE_CLOUD_PROJECT",
  "FIRESTORE_EMULATOR_HOST","FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_SERVICE_ACCOUNT_JSON","GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_KEYFILE_JSON","GOOGLE_CLOUD_CREDENTIALS",
  "VOLUNSERVE_PHASE14_LISTENER","VOLUNSERVE_PHASE14_ALLOW_WRITES",
  "VOLUNSERVE_PHASE14_NO_WORKER","VOLUNSERVE_PHASE14_BIND_HOST",
  "VOLUNSERVE_PHASE14_CLOUD_INGRESS","PORT","NODE_ENV"
];
const original=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
function setup(){
  for(const key of KEYS)delete process.env[key];
  Object.assign(process.env,{
    VOLUNSERVE_PHASE13_BOOTSTRAP:"readonly_candidate",
    VOLUNSERVE_PHASE13_STAGING_ONLY:"true",
    VOLUNSERVE_PHASE13_SERVICE_ID:SERVICE,
    VOLUNSERVE_PHASE13_STAGING_BRANCH:
      "candidate/auto-volunteer-cloud-phase14-new",
    VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT:PROJECT,
    VOLUNSERVE_PHASE12_CLOUD_PREVIEW:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled",
    VOLUNSERVE_PHASE12_MODE:"new_isolated_read_only",
    RENDER_SERVICE_ID:SERVICE,GCLOUD_PROJECT:PROJECT,
    GOOGLE_CLOUD_PROJECT:PROJECT,
    VOLUNSERVE_PHASE14_LISTENER:"read_only_canary",
    VOLUNSERVE_PHASE14_ALLOW_WRITES:"disabled",
    VOLUNSERVE_PHASE14_NO_WORKER:"true",
    VOLUNSERVE_PHASE14_BIND_HOST:"127.0.0.1",
    PORT:"0",NODE_ENV:"test"
  });
}
function mockSdk(){
  const state={apps:[],calls:[],reads:0,writes:0};
  const docs={
    users:new Map([["phase14_admin",{
      role:"admin",status:"approved",adminStatus:"active",
      fullName:"Secret QA Administrator"
    }],["phase14_resident",{
      role:"resident",status:"approved"
    }],["phase14_volunteer",{
      uid:"phase14_volunteer",role:"resident",status:"approved",
      volunteerAccess:true,volunteerStatus:"approved",
      identityVerified:true,barangay:"Bagong Buhay I",
      skills:["First Aid"],fullName:"SECRET VOLUNTEER"
    }]]),
    disasterCases:new Map([["phase14_case",{
      status:"validated",verificationStatus:"validated",
      title:"SECRET CASE",incidentBarangay:"Bagong Buhay I",
      reporterUid:"reporter_secret",requiredSkills:["First Aid"]
    }]]),
    volunteerApplications:new Map([["qa_app",{
      uid:"phase14_volunteer",status:"approved",skills:["First Aid"]
    }]]),
    responderLocks:new Map(),responseAssignments:new Map()
  };
  const noWrites=()=>{state.writes++;throw Error("WRITE UNAVAILABLE")};
  const sdk={
    app:{
      getApps(){state.calls.push("getApps");return state.apps},
      applicationDefault(){state.calls.push("ADC");
        return {mockCredential:true}},
      initializeApp(config,name){
        state.calls.push("initializeApp");
        const result={name,options:{projectId:config.projectId}};
        state.apps.push(result);
        return result;
      },
      async deleteApp(x){
        state.calls.push("deleteApp");
        state.apps=state.apps.filter(y=>y!==x);
      }
    },
    auth:{
      getAuth(app){
        state.calls.push("getAuth");
        return {app,async verifyIdToken(token,checkRevoked){
          assert.equal(checkRevoked,true);
          if(token==="bad"||token==="revoked")throw Error("PRIVATE TOKEN");
          const uid=token==="resident"?"phase14_resident":"phase14_admin";
          return {uid,email:uid+"@example.invalid",email_verified:true};
        }};
      }
    },
    firestore:{
      getFirestore(){
        state.calls.push("getFirestore");
        return {projectId:PROJECT,collection(name){
          const map=docs[name]||new Map();
          return {
            doc(id){return {async get(){
              state.reads++;
              const val=map.get(id);
              return {id,exists:val!==undefined,data:()=>val};
            },set:noWrites,update:noWrites,delete:noWrites}},
            limit(n){return {async get(){
              state.reads++;
              const items=[...map.entries()].slice(0,n)
                .map(([id,val])=>({id,data:()=>val}));
              return {size:items.length,docs:items};
            }}},
            add:noWrites,update:noWrites
          };
        },runTransaction:noWrites,batch:noWrites};
      }
    }
  };
  return {sdk,state};
}
test.beforeEach(setup);
test("default listener OFF and forged environment rejected before SDK load",()=>{
  delete process.env.VOLUNSERVE_PHASE14_LISTENER;
  assert.equal(inspectPhase14Listener().reason,"listener_off_by_default");
  setup();
  assert.equal(inspectPhase14Listener({env:{...process.env}}).reason,
    "actual_runtime_environment_required");
  const g=inspectPhase14Listener();
  assert.equal(g.allowed,true);
  assert.equal(g.deploymentAuthorized,false);
  assert.equal(g.identityAndIamAttested,false);
});
test("production/old staging Firebase and Render destinations blocked",()=>{
  for(const pid of ["volunserve-3aa5b","volunserve-volunteer-staging"]){
    process.env.VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT=pid;
    process.env.GCLOUD_PROJECT=pid;
    process.env.GOOGLE_CLOUD_PROJECT=pid;
    assert.equal(inspectPhase14Listener().allowed,false);
    setup();
  }
  for(const id of ["srv-daofqomk1f9s73btsg20",
    "srv-dbsglle1egvs73dq7i8g","srv-dbufki67bikc739qfmlg"]){
    process.env.RENDER_SERVICE_ID=id;
    process.env.VOLUNSERVE_PHASE13_SERVICE_ID=id;
    assert.equal(inspectPhase14Listener().allowed,false);
    setup();
  }
});
test("preview and writes flags cannot be relaxed during startup",()=>{
  for(const [key,val] of [
    ["VOLUNSERVE_PHASE14_LISTENER","enabled"],
    ["VOLUNSERVE_PHASE14_ALLOW_WRITES","enabled"],
    ["VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH","enabled"],
    ["VOLUNSERVE_PHASE14_NO_WORKER","false"],
    ["VOLUNSERVE_PHASE12_CLOUD_PREVIEW","disabled"],
    ["VOLUNSERVE_PHASE13_BOOTSTRAP","off"]
  ]){
    process.env[key]=val;
    assert.equal(inspectPhase14Listener().allowed,false,key);
    setup();
  }
});
test("listener host, cloud ingress review and port parsing fail closed",()=>{
  for(const [key,value] of [
    ["VOLUNSERVE_PHASE14_BIND_HOST","example.com"],
    ["VOLUNSERVE_PHASE14_BIND_HOST",""],
    ["PORT","-1"],["PORT","65536"],["PORT","NaN"],
    ["PORT","10000;curl production"],["PORT","00000"]
  ]){
    process.env[key]=value;
    assert.equal(inspectPhase14Listener().allowed,false,key);
    setup();
  }
  process.env.VOLUNSERVE_PHASE14_BIND_HOST="0.0.0.0";
  process.env.PORT="10000"; // production-like port must be valid before ingress gate
  assert.equal(inspectPhase14Listener().reason,"cloud_ingress_review_required");
  process.env.VOLUNSERVE_PHASE14_CLOUD_INGRESS="read_only_reviewed";
  assert.equal(inspectPhase14Listener().allowed,true);
  setup();
  process.env.NODE_ENV="production";
  assert.equal(inspectPhase14Listener().reason,"explicit_valid_port_required");
});
test("blocked startup does NOT call an injected Firebase factory",async()=>{
  let invoked=0;
  process.env.VOLUNSERVE_PHASE14_LISTENER="off";
  await assert.rejects(startPhase14StagingService({
    makeCandidate:async()=>{invoked++;throw Error("forbidden")}
  }),e=>e instanceof Phase14StartupRefusal&&
    e.code==="listener_off_by_default");
  assert.equal(invoked,0);
});
test("invalid candidate fails closed and calls candidate cleanup",async()=>{
  let cleaned=0;
  await assert.rejects(startPhase14StagingService({
    makeCandidate:async()=>({
      readOnly:false,dispatchEnabled:true,autoSchedulerEnabled:false,
      cloudDeployed:false,close:async()=>{cleaned++},
      httpApp:express()
    })
  }),e=>e.code==="candidate_not_read_only");
  assert.equal(cleaned,1);
});
test("SDK factory failure redacts underlying credential/error details",async()=>{
  await assert.rejects(startPhase14StagingService({
    makeCandidate:async()=>{throw Error("SECRET_WORKLOAD_IDENTITY_TOKEN");}
  }),e=>{
    assert.equal(e.code,"candidate_staging_startup_unavailable");
    assert.ok(!e.message.includes("SECRET"));
    return true;
  });
});
test("changing kill switch during async candidate setup prevents HTTP bind",async()=>{
  let closed=0;
  await assert.rejects(startPhase14StagingService({
    makeCandidate:async()=>{
      process.env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH="enabled";
      return {
        readOnly:true,dispatchEnabled:false,autoSchedulerEnabled:false,
        cloudDeployed:false,close:async()=>{closed++},
        httpApp:express()
      };
    }
  }),e=>e.code==="listener_disabled_during_startup");
  assert.equal(closed,1);
});
test("real localhost listener with Phase 13 mock SDK exposes GET only, never writes",async()=>{
  const {sdk,state}=mockSdk();
  const running=await startPhase14StagingService({
    makeCandidate:({env})=>createPhase13ReadOnlyCloudCandidate({env,sdk})
  });
  assert.equal(running.started,true);
  assert.equal(running.dispatchEnabled,false);
  assert.equal(running.schedulerEnabled,false);
  assert.equal(running.cloudDeploymentAuthorized,false);
  const url="http://127.0.0.1:"+running.address.port;
  try{
    const health=await fetch(url+"/api/phase12/staging/health");
    assert.equal(health.status,200);
    const body=await health.json();
    assert.equal(body.dispatchEnabled,false);
    assert.equal(body.autoSchedulingEnabled,false);
    const missing=await fetch(url+
      "/api/phase12/staging/admin/cases/phase14_case/preview");
    assert.equal(missing.status,401);
    const unauthorized=await fetch(url+
      "/api/phase12/staging/admin/cases/phase14_case/preview",{
        headers:{Authorization:"Bearer resident"}
      });
    assert.equal(unauthorized.status,403);
    const allowed=await fetch(url+
      "/api/phase12/staging/admin/cases/phase14_case/preview",{
        headers:{Authorization:"Bearer admin"}
      });
    assert.equal(allowed.status,200);
    const json=await allowed.json();
    assert.equal(json.eligibleCount,1);
    assert.equal(json.dispatchEnabled,false);
    assert.equal(json.wave2Enabled,false);
    for(const secret of ["SECRET","phase14_volunteer","reporter_secret",PROJECT])
      assert.ok(!JSON.stringify(json).includes(secret),secret);
    const post=await fetch(url+
      "/api/phase12/staging/admin/cases/phase14_case/preview",{
        method:"POST",headers:{Authorization:"Bearer admin"}
      });
    assert.equal(post.status,404);
    assert.equal(state.writes,0);
    const before=state.reads;
    process.env.VOLUNSERVE_PHASE12_CLOUD_PREVIEW="disabled";
    const stopped=await fetch(url+
      "/api/phase12/staging/admin/cases/phase14_case/preview",{
        headers:{Authorization:"Bearer admin"}
      });
    assert.equal(stopped.status,503);
    assert.equal(state.reads,before);
  }finally{
    await running.close();
    await running.close(); // idempotent graceful shutdown
  }
  assert.equal(state.apps.length,0);
  assert.equal(state.calls.includes("deleteApp"),true);
  assert.equal(state.writes,0);
});
test("a occupied listener port fails startup and frees its Firebase Admin app",async()=>{
  const occupying=net.createServer();
  await new Promise(resolve=>occupying.listen(0,"127.0.0.1",resolve));
  process.env.PORT=String(occupying.address().port);
  const {sdk,state}=mockSdk();
  try{
    await assert.rejects(startPhase14StagingService({
      makeCandidate:({env})=>createPhase13ReadOnlyCloudCandidate({env,sdk})
    }),e=>e.code==="listener_bind_failed");
    assert.equal(state.apps.length,0);
    assert.equal(state.calls.includes("deleteApp"),true);
  }finally{
    await new Promise(resolve=>occupying.close(resolve));
  }
});
test("no normal production start, no scheduler, no deployment or live server import",()=>{
  const source=fs.readFileSync(path.join(__dirname,
    "autoVolunteerPhase14StagingServer.cjs"),"utf8");
  const prod=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
  const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,
    "package.json"),"utf8"));
  assert.equal(pkg.scripts.start,"node server.js");
  assert.equal(prod.includes("autoVolunteerPhase14StagingServer"),false);
  for(const marker of [
    "setInterval(", "CloudTasksClient",
    "firebase deploy", "render deploy",
    "runTransaction(", "app.post("
  ])assert.equal(source.includes(marker),false,marker);
});
test.after(()=>{
  for(const k of KEYS){
    if(original[k]===undefined)delete process.env[k];
    else process.env[k]=original[k];
  }
});
