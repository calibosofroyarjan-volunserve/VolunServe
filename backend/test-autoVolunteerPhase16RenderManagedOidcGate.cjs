"use strict";
/**
 * Phase 16 OFFLINE security tests; ONLY synthetic local files/tokens,
 * fake Firebase Admin/Firestore interfaces, and localhost HTTP.
 * Absolutely NO Render API, Google token exchange, IAM, Firebase cloud,
 * real accounts, service-account keys or network outside loopback.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {inspectPhase16RenderManagedOidc}
  =require("./autoVolunteerPhase16RenderManagedOidcGate.cjs");
const {getCloudStagingPreviewGate}
  =require("./autoVolunteerPhase12IsolatedCloudPreviewAdapter.js");
const {inspectPhase13StagingRuntime,createPhase13ReadOnlyCloudCandidate}
  =require("./autoVolunteerPhase13ReadOnlyCloudBootstrap.cjs");
const {inspectPhase14Listener}
  =require("./autoVolunteerPhase14StagingServer.cjs");
const PROJECT="volunserve-phase16-newqa",NUMBER="123456789012";
const PROVIDER="projects/"+NUMBER+
 "/locations/global/workloadIdentityPools/phase16-qa-pool/providers/render-phase16";
const SERVICE="srv-phase16newstage001";
const WORKSPACE="tea-phase16workspace001";
const KEYS=[
  "VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT",
  "VOLUNSERVE_PHASE12_CLOUD_PREVIEW",
  "VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW",
  "VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH",
  "VOLUNSERVE_PHASE12_MODE","GCLOUD_PROJECT","GOOGLE_CLOUD_PROJECT",
  "FIRESTORE_EMULATOR_HOST","FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_SERVICE_ACCOUNT_JSON","GOOGLE_CLOUD_KEYFILE_JSON",
  "GOOGLE_CLOUD_CREDENTIALS","GOOGLE_APPLICATION_CREDENTIALS",
  "GCP_WORKLOAD_IDENTITY_PROVIDER","GCP_SERVICE_ACCOUNT_EMAIL",
  "VOLUNSERVE_PHASE16_RENDER_OIDC_MODE",
  "VOLUNSERVE_PHASE16_DIRECT_FEDERATION_ONLY",
  "VOLUNSERVE_PHASE16_EXPECTED_WIF_PROVIDER",
  "VOLUNSERVE_PHASE13_BOOTSTRAP","VOLUNSERVE_PHASE13_STAGING_ONLY",
  "VOLUNSERVE_PHASE13_SERVICE_ID","VOLUNSERVE_PHASE13_STAGING_BRANCH",
  "RENDER_SERVICE_ID","VOLUNSERVE_PHASE14_LISTENER",
  "VOLUNSERVE_PHASE14_ALLOW_WRITES","VOLUNSERVE_PHASE14_NO_WORKER",
  "VOLUNSERVE_PHASE14_BIND_HOST",
  "VOLUNSERVE_PHASE14_CLOUD_INGRESS","PORT","NODE_ENV"
];
const previous=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"phase16-fake-oidc-"));
const configPath=path.join(temp,"adc-config.json");
const tokenPath=path.join(temp,"oidc-token.txt");
const symlinkConfig=path.join(temp,"adc-symlink.json");
const symlinkToken=path.join(temp,"token-symlink.txt");
const fakeDb={projectId:PROJECT,collection(){return {}}};
const fakeAuth={app:{options:{projectId:PROJECT}},
 verifyIdToken(){return {}}};
function defaultConfig(){
  return {
    type:"external_account",
    audience:"//iam.googleapis.com/"+PROVIDER,
    subject_token_type:"urn:ietf:params:oauth:token-type:jwt",
    token_url:"https://sts.googleapis.com/v1/token",
    credential_source:{file:tokenPath,format:{type:"text"}}
  };
}
function saveConfig(value=defaultConfig()){
  fs.writeFileSync(configPath,typeof value==="string"?value:
    JSON.stringify(value),{mode:0o600,flag:"w"});
  fs.chmodSync(configPath,0o600);
}
function setup(){
  for(const k of KEYS)delete process.env[k];
  Object.assign(process.env,{
    VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT:PROJECT,
    VOLUNSERVE_PHASE12_CLOUD_PREVIEW:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled",
    VOLUNSERVE_PHASE12_MODE:"new_isolated_read_only",
    GCLOUD_PROJECT:PROJECT,GOOGLE_CLOUD_PROJECT:PROJECT,
    GOOGLE_APPLICATION_CREDENTIALS:configPath,
    GCP_WORKLOAD_IDENTITY_PROVIDER:PROVIDER,
    VOLUNSERVE_PHASE16_RENDER_OIDC_MODE:"schema_review_only",
    VOLUNSERVE_PHASE16_DIRECT_FEDERATION_ONLY:"true",
    VOLUNSERVE_PHASE16_EXPECTED_WIF_PROVIDER:PROVIDER,
    VOLUNSERVE_PHASE13_BOOTSTRAP:"readonly_candidate",
    VOLUNSERVE_PHASE13_STAGING_ONLY:"true",
    VOLUNSERVE_PHASE13_SERVICE_ID:SERVICE,
    VOLUNSERVE_PHASE13_STAGING_BRANCH:"candidate/auto-volunteer-cloud-phase16",
    RENDER_SERVICE_ID:SERVICE,
    VOLUNSERVE_PHASE14_LISTENER:"read_only_canary",
    VOLUNSERVE_PHASE14_ALLOW_WRITES:"disabled",
    VOLUNSERVE_PHASE14_NO_WORKER:"true",
    VOLUNSERVE_PHASE14_BIND_HOST:"127.0.0.1",
    NODE_ENV:"test",PORT:"0"
  });
  fs.writeFileSync(tokenPath,"FICTIONAL-LOCAL-OPAQUE-TOKEN-NOT-A-JWT",
    {mode:0o600,flag:"w"});
  fs.chmodSync(tokenPath,0o600);
  saveConfig();
}
const credential=()=>inspectPhase16RenderManagedOidc();
const denied=(reason)=>{
  const result=credential();
  assert.equal(result.allowed,false,JSON.stringify(result));
  assert.equal(result.reason,reason);
  assert.equal(result.dispatchEnabled,false);
  return result;
};
test.beforeEach(setup);
test("managed Render OIDC is opt-in only, even with otherwise plausible fake files",()=>{
  delete process.env.VOLUNSERVE_PHASE16_RENDER_OIDC_MODE;
  denied("managed_oidc_off_by_default");
  setup();
  process.env.VOLUNSERVE_PHASE16_DIRECT_FEDERATION_ONLY="false";
  denied("managed_oidc_off_by_default");
  const forged=inspectPhase16RenderManagedOidc({env:{...process.env}});
  assert.equal(forged.reason,"actual_runtime_environment_required");
});
test("synthetic valid external_account passes SHAPE only; never attests Render, IAM or deployment",()=>{
  const result=credential();
  assert.equal(result.allowed,true,JSON.stringify(result));
  assert.equal(result.provenRenderOrigin,false);
  assert.equal(result.provenCloudIam,false);
  assert.equal(result.automaticDispatchAuthorized,false);
  assert.equal(result.mode,"render_external_account_config_shape_only");
});
test("Phase 12 + 13 + 14 read-only gates accept opt-in safe config without source removal",()=>{
  assert.equal(getCloudStagingPreviewGate({
    db:fakeDb,authClient:fakeAuth
  }).allowed,true);
  assert.equal(inspectPhase13StagingRuntime().allowed,true);
  assert.equal(inspectPhase14Listener().allowed,true);
  assert.equal(inspectPhase14Listener().deploymentAuthorized,false);
});
test("an arbitrary GOOGLE_APPLICATION_CREDENTIALS path remains forbidden, even with opt-in flags",()=>{
  process.env.GOOGLE_APPLICATION_CREDENTIALS="/secret/private-service-account.json";
  denied("adc_config_unreadable_or_unsafe");
  const p12=getCloudStagingPreviewGate({db:fakeDb,authClient:fakeAuth});
  assert.ok(p12.reasons.includes("standalone_service_account_files_not_approved"));
  assert.equal(inspectPhase13StagingRuntime().reason,
    "standalone_credentials_forbidden");
});
test("Firebase service_account private keys cannot pass external_account schema",()=>{
  saveConfig({type:"service_account",project_id:PROJECT,
    private_key:"FAKE_PEM_NOT_REAL",client_email:"fake@example.invalid"});
  denied("invalid_external_account_provider_or_sts");
  setup();
  const bad=defaultConfig();
  bad.private_key="FAKE_PEM_NOT_REAL";
  saveConfig(bad);
  denied("unapproved_secret_source_or_impersonation");
});
test("wrong audience, GCP project number or STS endpoint blocks credential",()=>{
  for(const [key,value] of [
    ["audience","//iam.googleapis.com/projects/222222222222/locations/global/workloadIdentityPools/other/providers/other"],
    ["subject_token_type","urn:ietf:params:oauth:token-type:saml2"],
    ["token_url","https://example.invalid/sts"]
  ]){
    const bad=defaultConfig();bad[key]=value;saveConfig(bad);
    denied("invalid_external_account_provider_or_sts");
    setup();
  }
});
test("provider pin exact-match: no wildcard, old-project or alternate provider access",()=>{
  for(const [key,value] of [
    ["GCP_WORKLOAD_IDENTITY_PROVIDER","projects/123456789012/locations/global/workloadIdentityPools/old/providers/old"],
    ["VOLUNSERVE_PHASE16_EXPECTED_WIF_PROVIDER",
      "projects/987654321012/locations/global/workloadIdentityPools/old/providers/old"],
    ["GCP_WORKLOAD_IDENTITY_PROVIDER","projects/*/locations/global/workloadIdentityPools/old/providers/old"]
  ]){
    process.env[key]=value;
    denied("dedicated_wif_provider_pin_mismatch");
    setup();
  }
});
test("direct federation only: service account email or impersonation URL blocked",()=>{
  process.env.GCP_SERVICE_ACCOUNT_EMAIL=
    "prod@volunserve-3aa5b.iam.gserviceaccount.com";
  denied("private_key_or_impersonation_forbidden");
  setup();
  const bad=defaultConfig();
  bad.service_account_impersonation_url=
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/bad@example.invalid:generateAccessToken";
  saveConfig(bad);
  denied("unapproved_secret_source_or_impersonation");
});
test("remote or executable credential_source cannot load a token",()=>{
  for(const extra of [
    {url:"https://attacker.invalid/oidc"},
    {executable:{command:"echo private"}},
    {environment_id:"AWS1"},
    {headers:{Authorization:"fake"}},
    {quota_project_id:"volunserve-3aa5b"}
  ]){
    const c=defaultConfig();
    if("quota_project_id" in extra)c.quota_project_id=extra.quota_project_id;
    else c.credential_source=extra;
    saveConfig(c);
    denied("unapproved_secret_source_or_impersonation");
    setup();
  }
});
test("token source only: unexpected credential_source format/fields denied",()=>{
  for(const source of [
    {file:tokenPath,format:{type:"json",subject_token_field_name:"x"}},
    {file:tokenPath,format:{type:"text",extra:"command"}},
    {file:tokenPath,environment_id:"AWS1"},
    {file:tokenPath,format:"text"}
  ]){
    const c=defaultConfig();c.credential_source=source;saveConfig(c);
    const found=credential();
    assert.equal(found.allowed,false,JSON.stringify(found));
    setup();
  }
});
test("absolute local regular files required: relative path and missing files denied",()=>{
  process.env.GOOGLE_APPLICATION_CREDENTIALS="./adc.json";
  denied("adc_config_unreadable_or_unsafe");
  setup();
  const c=defaultConfig();c.credential_source.file="/definitely/absent/oidc.jwt";
  saveConfig(c);
  denied("unsafe_or_missing_local_oidc_token_source");
});
test("config symlink and token symlink are denied without reading token data",()=>{
  fs.symlinkSync(configPath,symlinkConfig);
  process.env.GOOGLE_APPLICATION_CREDENTIALS=symlinkConfig;
  denied("adc_config_unreadable_or_unsafe");
  setup();
  fs.symlinkSync(tokenPath,symlinkToken);
  const c=defaultConfig();c.credential_source.file=symlinkToken;
  saveConfig(c);
  denied("unsafe_or_missing_local_oidc_token_source");
});
test("world-writable configs and token files are denied",()=>{
  fs.chmodSync(configPath,0o666);
  denied("adc_config_unreadable_or_unsafe");
  setup();
  fs.chmodSync(tokenPath,0o666);
  denied("unsafe_or_missing_local_oidc_token_source");
});
test("overlarge malformed ADC JSON is denied without leaking its contents",()=>{
  saveConfig("not-json private-data");
  denied("adc_config_unreadable_or_unsafe");
  setup();
  saveConfig("x".repeat(20000));
  denied("adc_config_unreadable_or_unsafe");
  setup();
  fs.writeFileSync(tokenPath,"x".repeat(12000),{mode:0o600});
  denied("unsafe_or_missing_local_oidc_token_source");
});
test("runtime kill switches and project mismatches refuse the config",()=>{
  process.env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH="enabled";
  denied("read_only_mode_required");
  setup();
  process.env.VOLUNSERVE_PHASE12_MODE="full_dispatch";
  denied("read_only_mode_required");
  setup();
  process.env.GCLOUD_PROJECT="volunserve-3aa5b";
  denied("firebase_project_binding_mismatch");
  setup();
  process.env.FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099";
  denied("no_emulator_oidc_mix");
});
test("Phase 13 can build GET-only preview with FAKE Admin SDK, managed ADC opt-in",async()=>{
  const state={apps:[],writes:0};
  const fakeSdk={
    app:{
      getApps(){return state.apps},
      applicationDefault(){return {fake:true}},
      initializeApp(options,name){
        const a={name,options:{projectId:options.projectId}};
        state.apps.push(a);return a;
      },
      async deleteApp(a){state.apps=state.apps.filter(x=>x!==a)}
    },
    auth:{getAuth(app){return {app,async verifyIdToken(){
      return {uid:"fake_admin",email:"fake_admin@local.invalid",
        email_verified:true};
    }}}},
    firestore:{getFirestore(){
      const collections={
        users:new Map([["fake_admin",{fullName:"Fictional Admin",
          role:"admin",status:"approved",adminStatus:"active"}]]),
        disasterCases:new Map(),volunteerApplications:new Map(),
        responseAssignments:new Map(),responderLocks:new Map()
      };
      const forbid=()=>{state.writes++;throw Error("WRITES_FORBIDDEN")};
      return {projectId:PROJECT,collection(name){
        const m=collections[name]||new Map();
        return {
          doc(id){return {async get(){const d=m.get(id);
            return {id,exists:d!==undefined,data:()=>d}},set:forbid,update:forbid}},
          limit(n){return {async get(){const docs=[...m.entries()]
            .slice(0,n).map(([id,v])=>({id,data:()=>v}));
            return {docs,size:docs.length}}}},
          add:forbid
        };
      },runTransaction:forbid,batch:forbid}
    }}
  };
  const candidate=await createPhase13ReadOnlyCloudCandidate({sdk:fakeSdk});
  assert.equal(candidate.readOnly,true);
  assert.equal(candidate.dispatchEnabled,false);
  assert.equal(candidate.cloudIAMAttested,false);
  let server;
  try{
    server=await new Promise(resolve=>{
      const s=candidate.httpApp.listen(0,"127.0.0.1",()=>resolve(s));
    });
    const url="http://127.0.0.1:"+server.address().port;
    const health=await fetch(url+"/api/phase12/staging/health");
    assert.equal(health.status,200);
    assert.equal((await health.json()).dispatchEnabled,false);
    const r=await fetch(url+"/api/phase12/staging/health",
      {method:"POST"});
    assert.equal(r.status,404);
    process.env.VOLUNSERVE_PHASE16_RENDER_OIDC_MODE="off";
    const off=await fetch(url+"/api/phase12/staging/health");
    assert.equal(off.status,503);
    assert.equal(state.writes,0);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await candidate.close();
  }
  assert.equal(state.apps.length,0);
});
test("CI explicitly does not require a real OIDC token or secrets in the repository",()=>{
  const source=fs.readFileSync(path.join(__dirname,
    "autoVolunteerPhase16RenderManagedOidcGate.cjs"),"utf8");
  const prod=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
  assert.equal(prod.includes("autoVolunteerPhase16RenderManagedOidcGate"),false);
  for(const fragment of ["CloudTasksClient","firebase deploy",
    "render deploy","runTransaction(","app.post("])
    assert.equal(source.includes(fragment),false,fragment);
});
test.after(()=>{
  for(const k of KEYS){
    if(previous[k]===undefined)delete process.env[k];
    else process.env[k]=previous[k];
  }
  fs.rmSync(temp,{recursive:true,force:true});
});
