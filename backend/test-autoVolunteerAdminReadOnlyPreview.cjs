"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {loadProductionPreviewInputs,PreviewSourceError}
  =require("./autoVolunteerProductionPreviewReader");
const {registerAutoVolunteerAdminReadOnlyPreview}
  =require("./autoVolunteerAdminPreviewRoute");
const env={VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW:"enabled",
  VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled"};
const CASE_ID="incident_001";
const CASE={
  reporterUid:"resident_reporter",status:"validated",
  verificationStatus:"validated",incidentBarangay:"Bagong Buhay I",
  requiredSkills:["First Aid"],dispatchBlocked:false
};
const fixture=(uid,barangay="Bagong Buhay I")=>({
  uid,application:{uid,status:"approved",skills:["First Aid"]},
  user:{uid,role:"resident",status:"approved",volunteerAccess:true,
    volunteerStatus:"approved",identityVerified:true,barangay,
    skills:["First Aid"],email:uid+"@private.invalid",fullName:"Sensitive QA name"}
});
function mockDb({caseData=CASE,appRecords=[fixture("user_001")],
  assignments=[],locks=[],failUser="",failCollection=""}={}){
  let reads=0,writes=0;
  const docs={
    disasterCases:new Map(caseData===null?[]:[[CASE_ID,caseData]]),
    users:new Map(appRecords.map(x=>[x.uid,x.user])),
    volunteerApplications:new Map(appRecords.map((x,i)=>["application_"+i,x.application])),
    responseAssignments:new Map(assignments.map((x,i)=>["assignment_"+i,x])),
    responderLocks:new Map(locks.map((x,i)=>[x.uid||x.responderUid||"lock_"+i,x]))
  };
  const db={
    collection(name){
      if(!Object.hasOwn(docs,name))throw Error("Unexpected collection "+name);
      const col=docs[name];
      return {
        doc(id){
          return {async get(){
            reads++;
            if(name==="users"&&id===failUser)throw Error("private database failure");
            const v=col.get(id);
            return {id,exists:v!==undefined,data:()=>v};
          }};
        },
        limit(n){
          return {async get(){
            reads++;
            if(name===failCollection)throw Error("private query error");
            const a=[...col.entries()].slice(0,n).map(([id,v])=>({
              id,data:()=>v
            }));
            return {size:a.length,docs:a};
          }};
        },
        add(){writes++;throw Error("MUST NOT WRITE")},
        update(){writes++;throw Error("MUST NOT WRITE")},
        set(){writes++;throw Error("MUST NOT WRITE")}
      };
    },
    runTransaction(){writes++;throw Error("NO TRANSACTIONS")},
    get counters(){return {reads,writes}}
  };
  return db;
}
function routeHarness(db,settings=env){
  let registered;
  const firebaseAuth=function requireFirebaseUser(){};
  const operationalAdmin=function requireOperationalAdmin(){};
  const app={get(route,...chain){registered={route,chain};}};
  registerAutoVolunteerAdminReadOnlyPreview(app,{
    db,env:settings,requireFirebaseUser:firebaseAuth,
    requireOperationalAdmin:operationalAdmin
  });
  assert.equal(registered.route,"/api/admin/emergency-auto/preview/:caseId");
  assert.equal(registered.chain[0],firebaseAuth);
  assert.equal(registered.chain[1],operationalAdmin);
  assert.equal(registered.chain.length,3);
  async function invoke({uid="auth_admin",profile={role:"admin",status:"approved"},
    caseId=CASE_ID,query={}}={}){
    const headers={},result={code:200,body:null,headers};
    const response={
      set(key,val){headers[key.toLowerCase()]=val;return this},
      status(code){result.code=code;return this},
      json(value){result.body=value;return this}
    };
    await registered.chain[2]({
      firebaseUser:uid?{uid}:undefined,volunServeProfile:profile,
      params:{caseId},query
    },response);
    return result;
  }
  return {invoke,registered};
}
test("loading production-scheme inputs reads all sources and current authoritative user profile",async()=>{
  const db=mockDb({appRecords:[fixture("user_001"),
    {...fixture("user_002","Citrus"),application:
      {uid:"user_002",status:"APPROVED",skills:["First Aid"]}}]});
  const d=await loadProductionPreviewInputs(db,CASE_ID);
  assert.equal(d.sourceScansComplete,true);
  assert.equal(d.caseData.id,CASE_ID);
  assert.equal(d.roster.length,2);
  assert.equal(d.roster[1].application.status,"approved");
  assert.equal(d.sourceLimits.allApplications,2);
  assert.equal(d.sourceLimits.approvedApplications,2);
  assert.equal(d.snapshotConsistency,"non_transactional_read_only");
  assert.equal(db.counters.writes,0);
});
test("approved, verified Admin can obtain AGGREGATE wave result without identity leakage",async()=>{
  const db=mockDb({appRecords:[fixture("user_001"),fixture("user_002")]});
  const h=routeHarness(db);
  const r=await h.invoke({query:{caseId:"forged",neighborsByBarangay:"fake",roster:"fake"}});
  assert.equal(r.code,200);
  assert.equal(r.body.status,"preview_only");
  assert.equal(r.body.wave,1);
  assert.equal(r.body.eligibleCount,2);
  assert.equal(r.body.approvedApplications,2);
  assert.equal(r.body.readOnly,true);
  assert.equal(r.body.dispatchEnabled,false);
  assert.ok(r.headers["cache-control"].includes("no-store"));
  const raw=JSON.stringify(r.body);
  for(const sensitive of ["user_001","user_002","Sensitive QA name",
    "@private.invalid","offerCandidateUids","resident_reporter",
    "Bagong Buhay I","incident_001"]){
    assert.equal(raw.includes(sensitive),false,sensitive);
  }
  assert.equal(db.counters.writes,0);
});
test("even a verified user cannot read without persisted APPROVED operational Admin role",async()=>{
  for(const profile of [
    {role:"volunteer",status:"approved"},
    {role:"resident",status:"approved"},
    {role:"superadmin",status:"approved"},
    {role:"admin",status:"pending"},
    {role:"admin",status:"suspended"},
    {role:"admin",status:"approved",adminStatus:"suspended"},
    {primaryRole:"admin",status:"approved"},null
  ]){
    const db=mockDb(); const r=await routeHarness(db).invoke({profile});
    assert.equal(r.code,403,JSON.stringify(profile));
    assert.equal(db.counters.reads,0);
    assert.equal(db.counters.writes,0);
  }
  const unauth=mockDb();
  assert.equal((await routeHarness(unauth).invoke({uid:""})).code,403);
  assert.equal(unauth.counters.reads,0);
});
test("disabled preview or requested dispatch switch always blocks before Firestore",async()=>{
  for(const settings of [{},{VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"enabled"}]){
    const db=mockDb();
    const r=await routeHarness(db,settings).invoke();
    assert.equal(r.code,404);
    assert.equal(r.body.reason,"feature_off_by_default");
    assert.equal(db.counters.reads,0);
  }
});
test("case not found, invalid case ID and reporter home-only location fail closed",async()=>{
  const invalid=mockDb();
  const r=await routeHarness(invalid).invoke({caseId:"../../users"});
  assert.equal(r.code,400);
  assert.equal(invalid.counters.reads,0);
  const missing=mockDb({caseData:null});
  assert.equal((await routeHarness(missing).invoke()).code,404);
  const homeOnly=mockDb({caseData:{
    ...CASE,incidentBarangay:undefined,reporterBarangay:"Bagong Buhay I"
  }});
  const denied=await routeHarness(homeOnly).invoke();
  assert.equal(denied.code,409);
  assert.equal(denied.body.reason,"incident_barangay_requires_review");
  assert.equal(homeOnly.counters.writes,0);
});
test("existing manual responder active pointer makes preview BLOCK, not another offer",async()=>{
  const db=mockDb({caseData:{...CASE,
    activeVolunteerSupportUid:"another_existing_volunteer"}});
  const r=await routeHarness(db).invoke();
  assert.equal(r.body.status,"blocked");
  assert.equal(r.body.reason,"manual_or_active_responder_exists");
  assert.equal(r.body.eligibleCount,0);
});
test("all collection scans must be COMPLETE and <=200, with no silent truncation",async()=>{
  const big=Array.from({length:201},(_,i)=>fixture("user_"+i));
  const db=mockDb({appRecords:big});
  await assert.rejects(()=>loadProductionPreviewInputs(db,CASE_ID),
    e=>e instanceof PreviewSourceError &&
      e.code==="source_exceeds_audited_200_limit");
  const r=await routeHarness(db).invoke();
  assert.equal(r.code,409);
  assert.equal(r.body.reason,"source_exceeds_audited_200_limit");
  assert.equal(r.body.eligibleCount,undefined);
  assert.equal(db.counters.writes,0);
  for(const key of ["responseAssignments","responderLocks"]){
    const records=Array.from({length:201},(_,i)=>
      key==="responseAssignments"?
        {caseId:"something_else",volunteerId:"user_"+i,status:"declined"}:
        {uid:"user_"+i,caseId:"something_else",status:"accepted"});
    const db2=mockDb(key==="responseAssignments"?
      {assignments:records}:{locks:records});
    const d=await routeHarness(db2).invoke();
    assert.equal(d.body.reason,"source_exceeds_audited_200_limit");
    assert.equal(db2.counters.writes,0);
  }
});
test("missing profiles cannot create artificial approved candidates",async()=>{
  const d=mockDb({appRecords:[{uid:"user_001",
    application:{uid:"user_001",status:"approved",skills:["First Aid"]},
    user:null}]});
  const r=await routeHarness(d).invoke();
  assert.equal(r.body.status,"blocked");
  assert.equal(r.body.reason,"no_verified_eligible_volunteers");
});
test("Firestore read error is generic 503, no user IDs or error messages returned",async()=>{
  const db=mockDb({failUser:"user_001"});
  const r=await routeHarness(db).invoke();
  assert.equal(r.code,503);
  assert.equal(r.body.reason,"preview_read_unavailable");
  assert.equal(JSON.stringify(r.body).includes("private"),false);
  assert.equal(db.counters.writes,0);
});
test("requires both real-auth and operational-admin middleware; server is not patched or mounted",()=>{
  const db=mockDb();
  assert.throws(()=>registerAutoVolunteerAdminReadOnlyPreview({get(){}},
    {db,env}),TypeError);
  const server=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
  assert.ok(!server.includes("autoVolunteerAdminPreviewRoute"));
  assert.ok(!server.includes("autoVolunteerProductionPreviewReader"));
  const routeSource=fs.readFileSync(path.join(__dirname,
    "autoVolunteerAdminPreviewRoute.js"),"utf8");
  const source=fs.readFileSync(path.join(__dirname,
    "autoVolunteerProductionPreviewReader.js"),"utf8");
  for(const banned of [
    "runTransaction(","setInterval(","createUser(",
    "app.post(","transaction.update(","transaction.create("
  ])assert.ok(!source.includes(banned),banned);
  assert.ok(!routeSource.includes("app.post("));
});
