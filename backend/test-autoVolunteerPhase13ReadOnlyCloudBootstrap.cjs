"use strict";
/**
 * Phase 13 OFFLINE contract tests: mock Firebase Admin SDK only.
 * NO Firebase project, Render service, cloud token, real ADC or network
 * except ephemeral 127.0.0.1 HTTP for the injected read-only Express app.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {
  inspectPhase13StagingRuntime,
  createPhase13ReadOnlyCloudCandidate,
  Phase13BootstrapRefusal
}=require("./autoVolunteerPhase13ReadOnlyCloudBootstrap.cjs");

const PROJECT="volunserve-auto-qa2026";
const SERVICE="srv-phase13freshonly01";
const KEYS=[
  "VOLUNSERVE_PHASE13_BOOTSTRAP","VOLUNSERVE_PHASE13_STAGING_ONLY",
  "VOLUNSERVE_PHASE13_SERVICE_ID","VOLUNSERVE_PHASE13_STAGING_BRANCH",
  "VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT",
  "VOLUNSERVE_PHASE12_CLOUD_PREVIEW",
  "VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW",
  "VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH",
  "VOLUNSERVE_PHASE12_MODE","RENDER_SERVICE_ID",
  "GCLOUD_PROJECT","GOOGLE_CLOUD_PROJECT",
  "FIRESTORE_EMULATOR_HOST","FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_SERVICE_ACCOUNT_JSON","GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_KEYFILE_JSON","GOOGLE_CLOUD_CREDENTIALS"
];
const ORIGINAL=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
function configured(){
  for(const k of KEYS)delete process.env[k];
  Object.assign(process.env,{
    VOLUNSERVE_PHASE13_BOOTSTRAP:"readonly_candidate",
    VOLUNSERVE_PHASE13_STAGING_ONLY:"true",
    VOLUNSERVE_PHASE13_SERVICE_ID:SERVICE,
    VOLUNSERVE_PHASE13_STAGING_BRANCH:
      "candidate/auto-volunteer-cloud-phase13-new",
    VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT:PROJECT,
    VOLUNSERVE_PHASE12_CLOUD_PREVIEW:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled",
    VOLUNSERVE_PHASE12_MODE:"new_isolated_read_only",
    RENDER_SERVICE_ID:SERVICE,
    GCLOUD_PROJECT:PROJECT,
    GOOGLE_CLOUD_PROJECT:PROJECT
  });
}
function fakeSdk({
  existing=false,wrongFirebaseApp=false,wrongAuth=false,
  wrongFirestore=false,authFailure=false,initializeFailure=false
}={}){
  const state={
    calls:[],apps:existing?[{name:"existing-default-production"}]:[],
    reads:0,writes:0,uid:"phase13_admin"
  };
  const docs={
    users:new Map([["phase13_admin",{
      role:"admin",status:"approved",adminStatus:"active",
      fullName:"PRIVATE ADMIN"
    }],["phase13_resident",{
      role:"resident",status:"approved"
    }]]),
    disasterCases:new Map([["phase13_case",{
      id:"phase13_case",reporterUid:"resident_reporter",
      status:"validated",verificationStatus:"validated",
      incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],
      title:"PRIVATE EMERGENCY CASE TITLE"
    }]]),
    volunteerApplications:new Map([["application_one",{
      uid:"phase13_volunteer",status:"approved",skills:["First Aid"]
    }]]),
    responseAssignments:new Map(),
    responderLocks:new Map()
  };
  docs.users.set("phase13_volunteer",{
    uid:"phase13_volunteer",role:"resident",status:"approved",
    volunteerAccess:true,volunteerStatus:"approved",
    identityVerified:true,barangay:"Bagong Buhay I",skills:["First Aid"],
    fullName:"PRIVATE VOLUNTEER",email:"private-volunteer@example.invalid"
  });
  const forbidden=()=>{
    state.writes++;
    throw Error("No write operation is permitted in Phase 13 preview");
  };
  const sdk={
    app:{
      getApps(){state.calls.push("getApps");return state.apps;},
      applicationDefault(){state.calls.push("applicationDefault");
        return {kind:"mock_ADC_no_secret"};},
      initializeApp(opts,name){
        state.calls.push("initializeApp");
        if(initializeFailure)throw Error("PRIVATE_ADC_SECRET_PATH");
        const app={name,options:{
          projectId:wrongFirebaseApp?"volunserve-3aa5b":opts.projectId
        }};
        state.apps.push(app);
        return app;
      },
      async deleteApp(app){
        state.calls.push("deleteApp");
        const i=state.apps.indexOf(app);
        if(i>=0)state.apps.splice(i,1);
      }
    },
    auth:{
      getAuth(app){
        state.calls.push("getAuth");
        return {
          app:wrongAuth?{options:{projectId:"old_wrong"}}:app,
          async verifyIdToken(token,revoked){
            state.calls.push("verifyIdToken");
            assert.equal(revoked,true);
            if(authFailure||token==="revoked"||token==="invalid")
              throw Error("PRIVATE_FIREBASE_TOKEN_VALUE");
            if(token==="resident")return {
              uid:"phase13_resident",email:"resident@example.invalid",
              email_verified:true
            };
            if(token==="unverified")return {
              uid:"phase13_admin",email:"admin@example.invalid",
              email_verified:false
            };
            return {uid:"phase13_admin",email:"admin@example.invalid",
              email_verified:true};
          }
        };
      }
    },
    firestore:{
      getFirestore(_app){
        state.calls.push("getFirestore");
        return {
          projectId:wrongFirestore?"volunserve-3aa5b":PROJECT,
          collection(name){
            const col=docs[name]||new Map();
            return {
              doc(id){return {
                async get(){
                  state.reads++;
                  const v=col.get(id);
                  return {id,exists:v!==undefined,data:()=>v};
                },
                set:forbidden,update:forbidden,delete:forbidden,create:forbidden
              }},
              limit(n){return {async get(){
                state.reads++;
                const d=[...col.entries()].slice(0,n)
                  .map(([id,value])=>({id,data:()=>value}));
                return {docs:d,size:d.length};
              }}},
              add:forbidden,update:forbidden,create:forbidden,delete:forbidden
            };
          },
          runTransaction:forbidden,
          batch:forbidden
        };
      }
    }
  };
  return {sdk,state};
}
async function req(base,uri,token="",method="GET"){
  const options={method,headers:token?{Authorization:"Bearer "+token}:{}};
  const r=await fetch(base+uri,options);
  const t=r.headers.get("content-type")||"";
  const body=await r.text();
  return {code:r.status,body:t.includes("application/json")?
    JSON.parse(body):body,headers:r.headers};
}
test.beforeEach(configured);
test("no flags, synthetic injected env, or missing dedicated runtime fails without cloud imports",()=>{
  const original=process.env.VOLUNSERVE_PHASE13_BOOTSTRAP;
  delete process.env.VOLUNSERVE_PHASE13_BOOTSTRAP;
  const g=inspectPhase13StagingRuntime();
  assert.equal(g.allowed,false);
  assert.equal(g.reason,"bootstrap_off_by_default");
  process.env.VOLUNSERVE_PHASE13_BOOTSTRAP=original;
  assert.equal(inspectPhase13StagingRuntime({env:{...process.env}}).reason,
    "actual_runtime_environment_required");
  const okay=inspectPhase13StagingRuntime();
  assert.equal(okay.allowed,true);
  assert.equal(okay.cloudProjectIndependentlyVerified,false);
  assert.equal(okay.deployAuthorized,false);
  assert.equal(okay.dispatchEnabled,false);
});
test("fake new project or old production, accepted staging and demo are rejected",()=>{
  for(const bad of [
    "volunserve-3aa5b","volunserve-volunteer-staging",
    "demo-volunserve-auto-phase4","DEMO-PROJECT","bad"
  ]){
    process.env.VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT=bad;
    process.env.GCLOUD_PROJECT=bad;
    process.env.GOOGLE_CLOUD_PROJECT=bad;
    const g=inspectPhase13StagingRuntime();
    assert.equal(g.allowed,false,bad);
    assert.equal(g.reason,"new_independent_firebase_project_required");
    configured();
  }
});
test("all existing protected Render services denied",()=>{
  for(const bad of [
    "srv-daofqomk1f9s73btsg20","srv-dbsglle1egvs73dq7i8g",
    "srv-dbufki67bikc739qfmlg"
  ]){
    process.env.RENDER_SERVICE_ID=bad;
    process.env.VOLUNSERVE_PHASE13_SERVICE_ID=bad;
    assert.equal(inspectPhase13StagingRuntime().reason,
      "brand_new_render_service_binding_required");
    configured();
  }
});
test("new service labels must bind exactly and candidate branch must be independent",()=>{
  process.env.VOLUNSERVE_PHASE13_SERVICE_ID=
    "srv-anothernewstaging01";
  assert.equal(inspectPhase13StagingRuntime().reason,
    "brand_new_render_service_binding_required");
  configured();
  for(const br of [
    "backend-live-protected",
    "feat/emergency-auto-dispatch-server-staging-20261115",
    "qa/auto-volunteer-phase10-isolated-app-e2e-20261119",
    "candidate/auto-volunteer-cloud-../unsafe",
    "candidate/auto-volunteer-cloud-",
    ""
  ]){
    process.env.VOLUNSERVE_PHASE13_STAGING_BRANCH=br;
    const g=inspectPhase13StagingRuntime();
    assert.equal(g.allowed,false,br);
    if(br!=="candidate/auto-volunteer-cloud-../unsafe")
      assert.equal(g.reason,"dedicated_candidate_branch_required",br);
    configured();
  }
});
test("runtime rejects emulators, service-account JSON/paths and project mismatch",()=>{
  for(const [key,v,code] of [
    ["FIRESTORE_EMULATOR_HOST","127.0.0.1:8080","emulator_runtime_forbidden"],
    ["FIREBASE_AUTH_EMULATOR_HOST","127.0.0.1:9099","emulator_runtime_forbidden"],
    ["FIREBASE_SERVICE_ACCOUNT_JSON","secret","standalone_credentials_forbidden"],
    ["GOOGLE_APPLICATION_CREDENTIALS","/private/key.json","standalone_credentials_forbidden"],
    ["GOOGLE_CLOUD_KEYFILE_JSON","secret","standalone_credentials_forbidden"],
    ["GOOGLE_CLOUD_CREDENTIALS","secret","standalone_credentials_forbidden"],
    ["GCLOUD_PROJECT","volunserve-3aa5b","cloud_project_binding_mismatch"],
    ["GOOGLE_CLOUD_PROJECT","volunserve-volunteer-staging","cloud_project_binding_mismatch"]
  ]){
    process.env[key]=v;
    assert.equal(inspectPhase13StagingRuntime().reason,code,key);
    configured();
  }
});
test("no Firebase SDK app can be initialized on a blocked runtime",async()=>{
  const {sdk,state}=fakeSdk();
  process.env.RENDER_SERVICE_ID="srv-daofqomk1f9s73btsg20";
  await assert.rejects(
    createPhase13ReadOnlyCloudCandidate({sdk}),
    e=>e instanceof Phase13BootstrapRefusal&&
      e.code==="brand_new_render_service_binding_required"
  );
  assert.equal(state.calls.length,0);
  assert.equal(state.reads,0);
  assert.equal(state.writes,0);
});
test("reject mixed existing Firebase apps BEFORE calling ADC",async()=>{
  const {sdk,state}=fakeSdk({existing:true});
  await assert.rejects(
    createPhase13ReadOnlyCloudCandidate({sdk}),
    e=>e.code==="preexisting_firebase_apps_forbidden"
  );
  assert.deepEqual(state.calls,["getApps"]);
});
test("SDK dependency must be complete; no partial client allowed",async()=>{
  await assert.rejects(
    createPhase13ReadOnlyCloudCandidate({sdk:{app:{}}}),
    e=>e.code==="firebase_admin_sdk_dependency_invalid"
  );
});
test("mismatched Firebase app gets cleaned up, never becomes active",async()=>{
  const {sdk,state}=fakeSdk({wrongFirebaseApp:true});
  await assert.rejects(
    createPhase13ReadOnlyCloudCandidate({sdk}),
    e=>e.code==="initialized_firebase_app_project_mismatch"
  );
  assert.deepEqual(state.calls,[
    "getApps","applicationDefault","initializeApp","deleteApp"
  ]);
  assert.equal(state.apps.length,0);
  assert.equal(state.reads,0);
});
test("Auth client bound to wrong app is refused and deleted",async()=>{
  const {sdk,state}=fakeSdk({wrongAuth:true});
  await assert.rejects(
    createPhase13ReadOnlyCloudCandidate({sdk}),
    e=>e.code==="auth_not_bound_to_dedicated_app"
  );
  assert.equal(state.apps.length,0);
  assert.equal(state.calls.includes("deleteApp"),true);
});
test("Firestore project mismatch is refused and deleted",async()=>{
  const {sdk,state}=fakeSdk({wrongFirestore:true});
  await assert.rejects(
    createPhase13ReadOnlyCloudCandidate({sdk}),
    e=>e.code==="firestore_not_bound_to_dedicated_project"
  );
  assert.equal(state.apps.length,0);
  assert.equal(state.calls.includes("deleteApp"),true);
});
test("ADC SDK failure returns only redacted reason without leaking credentials",async()=>{
  const {sdk,state}=fakeSdk({initializeFailure:true});
  await assert.rejects(
    createPhase13ReadOnlyCloudCandidate({sdk}),
    e=>{
      assert.equal(e.code,"firebase_admin_candidate_initialization_failed");
      assert.equal(e.message.includes("PRIVATE_ADC_SECRET_PATH"),false);
      return true;
    }
  );
  assert.equal(state.reads,0);
});
test("successful candidate ONLY exposes read-only Phase 12 GET health and Admin preview",async()=>{
  const {sdk,state}=fakeSdk();
  const candidate=await createPhase13ReadOnlyCloudCandidate({sdk});
  assert.equal(candidate.readOnly,true);
  assert.equal(candidate.dispatchEnabled,false);
  assert.equal(candidate.autoSchedulerEnabled,false);
  assert.equal(candidate.cloudDeployed,false);
  assert.equal(candidate.cloudIAMAttested,false);
  assert.equal(state.reads,0);
  assert.equal(state.writes,0);
  let server;
  try{
    server=await new Promise(resolve=>{
      const s=candidate.httpApp.listen(0,"127.0.0.1",()=>resolve(s));
    });
    const base="http://127.0.0.1:"+server.address().port;
    const health=await req(base,"/api/phase12/staging/health");
    assert.equal(health.code,200);
    assert.equal(health.body.autoSchedulingEnabled,false);
    const denied=await req(base,
      "/api/phase12/staging/admin/cases/phase13_case/preview");
    assert.equal(denied.code,401);
    const resident=await req(base,
      "/api/phase12/staging/admin/cases/phase13_case/preview","resident");
    assert.equal(resident.code,403);
    const valid=await req(base,
      "/api/phase12/staging/admin/cases/phase13_case/preview","admin");
    assert.equal(valid.code,200,JSON.stringify(valid.body));
    assert.equal(valid.body.eligibleCount,1);
    assert.equal(valid.body.wave2Enabled,false);
    assert.equal(valid.body.dispatchEnabled,false);
    const payload=JSON.stringify(valid.body);
    for(const sensitive of [
      "phase13_volunteer","PRIVATE VOLUNTEER",
      "PRIVATE EMERGENCY CASE TITLE","resident_reporter",
      "private-volunteer@example.invalid",PROJECT
    ])assert.ok(!payload.includes(sensitive),sensitive);
    const post=await req(base,
      "/api/phase12/staging/admin/cases/phase13_case/preview",
      "admin","POST");
    assert.equal(post.code,404);
    assert.equal(state.writes,0);
    const before=state.reads;
    process.env.VOLUNSERVE_PHASE12_CLOUD_PREVIEW="disabled";
    const off=await req(base,
      "/api/phase12/staging/admin/cases/phase13_case/preview","admin");
    assert.equal(off.code,503);
    assert.equal(state.reads,before);
  }finally{
    if(server)await new Promise((resolve,reject)=>
      server.close(e=>e?reject(e):resolve()));
    await candidate.close();
  }
  assert.equal(state.apps.length,0);
  assert.equal(state.calls.includes("deleteApp"),true);
});
test("candidate SOURCE neither mounts live server nor creates Cloud Tasks, timers or deploy",()=>{
  const file=fs.readFileSync(path.join(__dirname,
    "autoVolunteerPhase13ReadOnlyCloudBootstrap.cjs"),"utf8");
  const live=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
  assert.equal(live.includes("autoVolunteerPhase13ReadOnlyCloudBootstrap"),false);
  for(const forbidden of [
    "setInterval(", "setTimeout(", "app.post(", "runTransaction(",
    "CloudTasksClient", "firebase deploy", "render deploy"
  ])assert.equal(file.includes(forbidden),false,forbidden);
});
test.after(()=>{
  for(const k of KEYS){
    if(ORIGINAL[k]===undefined)delete process.env[k];
    else process.env[k]=ORIGINAL[k];
  }
});
