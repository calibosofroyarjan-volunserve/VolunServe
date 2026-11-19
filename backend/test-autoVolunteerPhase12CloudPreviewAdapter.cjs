"use strict";
/**
 * Phase 12 fake-cloud SDK contract QA only:
 * - actual Express HTTP locally on 127.0.0.1
 * - injected in-memory Firebase Admin-shaped Auth and Firestore interfaces
 * - ZERO Firebase credentials, Cloud SDK calls, projects or deploys.
 *
 * This cannot establish any real cloud project isolation, project ownership,
 * token verification, hosted availability, or production authorization.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {
  getCloudStagingPreviewGate,createPhase12IsolatedCloudReadOnlyApp
}=require("./autoVolunteerPhase12IsolatedCloudPreviewAdapter");

const PROJECT="volunserve-auto-qa2026";
const KEYS=[
  "VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT",
  "VOLUNSERVE_PHASE12_CLOUD_PREVIEW",
  "VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW",
  "VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH",
  "VOLUNSERVE_PHASE12_MODE","GCLOUD_PROJECT","GOOGLE_CLOUD_PROJECT",
  "FIRESTORE_EMULATOR_HOST","FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_SERVICE_ACCOUNT_JSON","GOOGLE_APPLICATION_CREDENTIALS"
];
const ORIGINAL=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
const originalSetup=()=> {
  for(const k of KEYS)delete process.env[k];
  Object.assign(process.env,{
    VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT:PROJECT,
    VOLUNSERVE_PHASE12_CLOUD_PREVIEW:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled",
    VOLUNSERVE_PHASE12_MODE:"new_isolated_read_only",
    GCLOUD_PROJECT:PROJECT,GOOGLE_CLOUD_PROJECT:PROJECT
  });
};
const CASE_ID="fake_case_001";
function fakeDoc(id,data){
  return {id,exists:data!==undefined,data:()=>data};
}
function fakeDatabase(projectId=PROJECT){
  const collections=new Map();
  const counters={reads:0,writes:0,tokenChecks:0,sourceReads:0};
  const state={failCollection:"",failDoc:""};
  function records(name){
    if(!collections.has(name))collections.set(name,new Map());
    return collections.get(name);
  }
  function forbid(){counters.writes++;throw Error("BLOCKED: READ-ONLY SERVICE")}
  const db={
    projectId,
    collection(name){
      const col=records(name);
      return {
        doc(id){
          return {
            async get(){
              counters.reads++;
              if(name==="users"&&id==="approved_volunteer")counters.sourceReads++;
              if(state.failDoc===name+"/"+id)
                throw Error("SECRET_UTILITY_PRIVATE_FIRESTORE_DETAILS");
              return fakeDoc(id,col.get(id));
            },
            set:forbid,update:forbid,delete:forbid,create:forbid
          };
        },
        limit(n){
          return {async get(){
            counters.reads++;counters.sourceReads++;
            if(state.failCollection===name)
              throw Error("SECRET_UTILITY_PRIVATE_FIRESTORE_DETAILS");
            const docs=[...col.entries()].slice(0,n)
              .map(([id,value])=>fakeDoc(id,value));
            return {size:docs.length,docs};
          }};
        },
        add:forbid,update:forbid,create:forbid
      };
    },
    runTransaction:forbid,
    batch:forbid
  };
  return {db,collections,records,counters,state};
}
function fakeAuth(projectId=PROJECT,counters={}){
  return {
    app:{options:{projectId}},
    async verifyIdToken(token,checkRevoked){
      counters.tokenChecks=(counters.tokenChecks||0)+1;
      assert.equal(checkRevoked,true);
      if(token==="invalid"||token==="revoked")throw Error("INTERNAL_PRIVATE_AUTH_TOKEN");
      if(token==="unverified")return {
        uid:"administrator",email:"approved@testing.invalid",email_verified:false
      };
      if(token==="malformed")return {
        uid:"administrator",email_verified:true
      };
      if(["admin","resident","pending","suspended","superadmin"].includes(token))
        return {uid:token==="admin"?"administrator":token,
          email:token+"@testing.invalid",email_verified:true};
      throw Error("INVALID_TOKEN");
    }
  };
}
let envDB,auth,server,base,authCounters;
function seed(){
  envDB.collections.clear();
  envDB.counters.reads=0;
  envDB.counters.writes=0;
  envDB.counters.sourceReads=0;
  envDB.state.failCollection="";
  envDB.state.failDoc="";
  authCounters.tokenChecks=0;
  envDB.records("users").set("administrator",{
    role:"admin",status:"approved",adminStatus:"active",
    fullName:"Private Administrator Person"
  });
  envDB.records("users").set("resident",{role:"resident",status:"approved"});
  envDB.records("users").set("pending",{role:"admin",status:"pending"});
  envDB.records("users").set("suspended",{
    role:"admin",status:"approved",adminStatus:"suspended"
  });
  envDB.records("users").set("superadmin",{role:"superadmin",status:"approved"});
  envDB.records("users").set("approved_volunteer",{
    uid:"approved_volunteer",role:"resident",status:"approved",
    volunteerAccess:true,volunteerStatus:"approved",identityVerified:true,
    skills:["First Aid"],barangay:"Bagong Buhay I",
    email:"SECRET_PRIVATE_VOLUNTEER_EMAIL@testing.invalid",
    fullName:"SECRET_VOLUNTEER_FULL_NAME"
  });
  envDB.records("volunteerApplications").set("application_1",{
    uid:"approved_volunteer",status:"APPROVED",skills:["First Aid"]
  });
  envDB.records("disasterCases").set(CASE_ID,{
    reporterUid:"fictional_resident",status:"validated",
    verificationStatus:"validated",incidentBarangay:"Bagong Buhay I",
    requiredSkills:["First Aid"],title:"SECRET_PRIVATE_CASE_TITLE"
  });
}
async function request(uri,{token="",method="GET"}={}){
  const opts={method,headers:token?{Authorization:"Bearer "+token}:{}};
  const response=await fetch(base+uri,opts);
  const type=response.headers.get("content-type")||"";
  const text=await response.text();
  return {code:response.status,body:type.includes("application/json")?
    JSON.parse(text):text,headers:response.headers};
}
const preview=(token="admin",extra="")=>
  request("/api/phase12/staging/admin/cases/"+CASE_ID+"/preview"+extra,{token});
test.before(async()=>{
  originalSetup();
  envDB=fakeDatabase();
  authCounters={};
  auth=fakeAuth(PROJECT,authCounters);
  seed();
  const app=createPhase12IsolatedCloudReadOnlyApp({
    db:envDB.db,authClient:auth
  });
  server=await new Promise(resolve=>{
    const s=app.listen(0,"127.0.0.1",()=>resolve(s));
  });
  base="http://127.0.0.1:"+server.address().port;
});
test.beforeEach(()=>{
  originalSetup();
  seed();
});
test("pure gate recognizes NEW project-bound adapter without claiming independent resource verification",()=>{
  const result=getCloudStagingPreviewGate({
    db:envDB.db,authClient:auth
  });
  assert.equal(result.allowed,true);
  assert.equal(result.readOnly,true);
  assert.equal(result.dispatchEnabled,false);
  assert.equal(result.cloudResourceIndependentlyVerified,false);
  const fabricated=getCloudStagingPreviewGate({
    db:envDB.db,authClient:auth,env:{...process.env}
  });
  assert.equal(fabricated.allowed,false);
  assert.ok(fabricated.reasons.includes("actual_runtime_environment_required"));
});
test("explicit enable flags and read-only mode are mandatory",()=>{
  for(const [key,value,reason] of [
    ["VOLUNSERVE_PHASE12_CLOUD_PREVIEW","disabled","cloud_preview_off_by_default"],
    ["VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW","disabled","read_only_preview_off"],
    ["VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH","enabled",
      "dispatch_must_be_explicitly_disabled"],
    ["VOLUNSERVE_PHASE12_MODE","full_dispatch",
      "new_isolated_read_only_mode_required"]
  ]){
    process.env[key]=value;
    const gate=getCloudStagingPreviewGate({db:envDB.db,authClient:auth});
    assert.equal(gate.allowed,false,key);
    assert.ok(gate.reasons.includes(reason),key);
    originalSetup();
  }
});
test("production, accepted historical staging, demo and incorrect bound cloud project are rejected",()=>{
  for(const project of [
    "volunserve-3aa5b","volunserve-volunteer-staging",
    "demo-volunserve-auto-phase4"
  ]){
    process.env.VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT=project;
    process.env.GCLOUD_PROJECT=project;
    process.env.GOOGLE_CLOUD_PROJECT=project;
    const gate=getCloudStagingPreviewGate({db:envDB.db,authClient:auth});
    assert.equal(gate.allowed,false,project);
    assert.ok(gate.reasons.includes("new_dedicated_project_required"),project);
    originalSetup();
  }
  const badDb=fakeDatabase("a-different-new-project").db;
  assert.ok(getCloudStagingPreviewGate({db:badDb,authClient:auth})
    .reasons.includes("firestore_project_binding_unverified"));
  const badAuth=fakeAuth("a-different-new-project");
  assert.ok(getCloudStagingPreviewGate({db:envDB.db,authClient:badAuth})
    .reasons.includes("auth_project_binding_unverified"));
});
test("emulator variables, direct service-account files and wrong runtime project block cloud adapter",()=>{
  for(const [key,value,expected] of [
    ["FIRESTORE_EMULATOR_HOST","127.0.0.1:8080","cloud_emulators_not_supported"],
    ["FIREBASE_AUTH_EMULATOR_HOST","127.0.0.1:9099","cloud_emulators_not_supported"],
    ["FIREBASE_SERVICE_ACCOUNT_JSON","PRIVATE_TEST_VALUE",
      "standalone_service_account_files_not_approved"],
    ["GOOGLE_APPLICATION_CREDENTIALS","/secret/path",
      "standalone_service_account_files_not_approved"],
    ["GCLOUD_PROJECT","volunserve-3aa5b","runtime_project_mismatch"],
    ["GOOGLE_CLOUD_PROJECT","volunserve-3aa5b",
      "google_cloud_project_mismatch"]
  ]){
    process.env[key]=value;
    const gate=getCloudStagingPreviewGate({db:envDB.db,authClient:auth});
    assert.equal(gate.allowed,false,key);
    assert.ok(gate.reasons.includes(expected),key);
    originalSetup();
  }
});
test("health response reveals no Firebase project ID, UID or secrets",async()=>{
  const res=await request("/api/phase12/staging/health");
  assert.equal(res.code,200);
  assert.equal(res.body.readOnly,true);
  assert.equal(res.body.dispatchEnabled,false);
  assert.equal(res.body.autoSchedulingEnabled,false);
  assert.equal(res.body.cloudProvisionedByThisAdapter,false);
  assert.ok(res.headers.get("cache-control").includes("no-store"));
  assert.ok(!JSON.stringify(res.body).includes(PROJECT));
});
test("missing, revoked and invalid ID tokens denied before ANY Firestore read",async()=>{
  for(const token of ["","revoked","invalid"]){
    const res=await preview(token);
    assert.equal(res.code,401,token);
    assert.equal(envDB.counters.reads,0,token);
  }
  assert.equal(envDB.counters.writes,0);
});
test("unverified email and malformed token denied with no Firestore read",async()=>{
  for(const token of ["unverified","malformed"]){
    const res=await preview(token);
    assert.equal(res.code,403);
    assert.equal(envDB.counters.reads,0);
  }
});
test("Resident, pending Admin, suspended Admin and Super Admin cannot inspect operational Admin preview",async()=>{
  for(const token of ["resident","pending","suspended","superadmin"]){
    const res=await preview(token);
    assert.equal(res.code,403,token);
    assert.equal(envDB.counters.sourceReads,0,token);
    assert.equal(envDB.counters.writes,0);
  }
});
test("approved Admin sees only aggregate eligible preview; no candidate UID, name, email or case contents",async()=>{
  const res=await preview();
  assert.equal(res.code,200,JSON.stringify(res.body));
  assert.equal(res.body.ok,true);
  assert.equal(res.body.status,"preview_only");
  assert.equal(res.body.wave,1);
  assert.equal(res.body.eligibleCount,1);
  assert.equal(res.body.inspectedApplications,1);
  assert.equal(res.body.readOnly,true);
  assert.equal(res.body.dispatchEnabled,false);
  assert.equal(res.body.wave2Enabled,false);
  assert.equal(res.body.dataFreshness,"non_transactional_snapshot");
  const json=JSON.stringify(res.body);
  for(const sensitive of [
    PROJECT,CASE_ID,"approved_volunteer","fictional_resident",
    "Private Administrator Person","SECRET_PRIVATE_VOLUNTEER_EMAIL",
    "SECRET_VOLUNTEER_FULL_NAME","SECRET_PRIVATE_CASE_TITLE",
    "offerCandidateUids","incidentBarangay"
  ])assert.ok(!json.includes(sensitive),sensitive);
  assert.equal(envDB.counters.writes,0);
});
test("query/body cannot forge Admin UID, source roster or SJDM neighbors",async()=>{
  const res=await preview("admin",
    "?uid=resident&projectId=volunserve-3aa5b&neighborMapReviewed=true&volunteerUid=other");
  assert.equal(res.code,200);
  assert.equal(res.body.eligibleCount,1);
  assert.equal(envDB.counters.writes,0);
});
test("invalid case ID and missing case fail without leaking any protected data",async()=>{
  const bad=await request("/api/phase12/staging/admin/cases/%2E%2E%2Fusers/preview",
    {token:"admin"});
  assert.notEqual(bad.code,200);
  const missing=await request(
    "/api/phase12/staging/admin/cases/nonexistent_case/preview",
    {token:"admin"}
  );
  assert.equal(missing.code,404);
  assert.equal(missing.body.reason,"case_not_found");
  assert.equal(envDB.counters.writes,0);
});
test("source pool above 200 records fails closed instead of missing eligible people",async()=>{
  const apps=envDB.records("volunteerApplications");
  for(let i=0;i<201;i++){
    apps.set("app_over_"+i,{
      uid:"approved_volunteer",status:"approved",skills:["First Aid"]
    });
  }
  const res=await preview();
  assert.equal(res.code,409);
  assert.equal(res.body.reason,"source_exceeds_audited_200_limit");
  assert.equal(envDB.counters.writes,0);
});
test("source failures do not serialize Firestore errors or private details",async()=>{
  envDB.state.failCollection="responseAssignments";
  const res=await preview();
  assert.equal(res.code,503);
  assert.equal(res.body.reason,"staging_preview_unavailable");
  assert.ok(!JSON.stringify(res.body).includes("SECRET_UTILITY_PRIVATE"));
  assert.equal(envDB.counters.writes,0);
});
test("runtime kill-switch blocks further previews with no extra reads",async()=>{
  const res=await preview();
  assert.equal(res.code,200);
  const before=envDB.counters.reads;
  process.env.VOLUNSERVE_PHASE12_CLOUD_PREVIEW="disabled";
  const blocked=await preview();
  assert.equal(blocked.code,503);
  assert.equal(blocked.body.reason,"isolated_cloud_preview_disabled");
  assert.equal(envDB.counters.reads,before);
  const health=await request("/api/phase12/staging/health");
  assert.equal(health.code,503);
});
test("service exposes NO POST route, mutation, scheduler or production server import",async()=>{
  const p=await request(
    "/api/phase12/staging/admin/cases/"+CASE_ID+"/preview",
    {token:"admin",method:"POST"}
  );
  assert.equal(p.code,404);
  assert.equal(envDB.counters.writes,0);
  const localSource=fs.readFileSync(path.join(__dirname,
    "autoVolunteerPhase12IsolatedCloudPreviewAdapter.js"),"utf8");
  const liveSource=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
  assert.ok(!liveSource.includes("autoVolunteerPhase12IsolatedCloudPreviewAdapter"));
  for(const banned of [
    "runTransaction(", "FieldValue", "setInterval(",
    "app.post(", "tx.update(", "tx.create(", "firebase deploy", "render deploy"
  ])assert.equal(localSource.includes(banned),false,banned);
});
test.after(async()=>{
  if(server)await new Promise((resolve,reject)=>
    server.close(e=>e?reject(e):resolve()));
  for(const k of KEYS){
    if(ORIGINAL[k]===undefined)delete process.env[k];
    else process.env[k]=ORIGINAL[k];
  }
});
