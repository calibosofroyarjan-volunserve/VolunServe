"use strict";
/** Synthetic AWS + Firestore only; no cloud calls, no biometric images. */
const assert=require("node:assert/strict");
const test=require("node:test");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../backend/lguStaffLiveness.js"),"utf8");
const USER="synthetic-lgu-liveness-applicant_2026",REGION="ap-northeast-1";
const SESSION="e42689ae-0d6c-4453-9e9c-3760fdfd59ab";
function harness({enabled=true,release=true,role="applicant",verified=true,
  consent=true,withdrew=false,providerConfidence=96,providerStatus="SUCCEEDED",
  threshold="90",providerFailure=false,nowTime=100000}={}){
  const records=new Map([
    ["users/"+USER,{role,status:"pending_review"}],
    ["lguApplicantEvidence/"+USER,{uid:USER,idType:"ph_national_id",
      reviewStatus:"pending_manual_review",...(consent?{consentVersion:"lgu-intake-v1"}:{})}],
    ["lguIdentityIntake/release",{enabled:release}],
  ]);
  if(withdrew)records.set("lguApplicantPrivacyRequests/"+USER,{uid:USER,status:"requested"});
  const DELETE=Symbol("delete");
  const counts={create:0,results:0};let now=nowTime;
  function ref(key){return {
    key,async get(){return snapshot(key);},
  }}
  const snapshot=key=>({exists:records.has(key),data:()=>records.get(key)});
  function update(r,fields){
    const doc={...(records.get(r.key)||{})};
    for(const [k,v] of Object.entries(fields)){if(v===DELETE)delete doc[k];else doc[k]=v;}
    records.set(r.key,doc);
  }
  const db={
    collection(name){return{doc(id){return ref(name+"/"+id);}};},
    async runTransaction(fn){
      return await fn({async get(r){return snapshot(r.key);},
        set(r,data,{merge}={}){records.set(r.key,merge?{...records.get(r.key),...data}:data);},
        update,
      });
    },
  };
  const sdk={async create(){counts.create++;if(providerFailure)throw Error("mock AWS offline");return SESSION;},
    async results(){counts.results++;if(providerFailure)throw Error("mock AWS offline");
      return{status:providerStatus,confidence:providerConfidence};}};
  const routes=new Map(),mod={exports:{}};
  vm.runInNewContext(source,{
    module:mod,exports:mod.exports,Buffer,console,
    process:{env:{
      LGU_STAFF_ACTIVE_LIVENESS_ENABLED:enabled?"true":"false",
      AWS_REKOGNITION_REGION:REGION,
      LGU_STAFF_LIVENESS_MIN_CONFIDENCE:threshold,
    }},
    require(name){if(name==="node:crypto")return require("node:crypto");
      throw Error("Unexpected SDK import in mock tests: "+name);},
  },{filename:"lguStaffLiveness.js"});
  mod.exports.mountLguStaffLiveness({post(p,_middleware,cb){routes.set(p,cb);}},{
    db,FieldValue:{serverTimestamp:()=>"SERVER_TIMESTAMP",delete:()=>DELETE},
    requireFirebaseUser(req,res,next){next?.();},
    providerFactory:()=>sdk,now:()=>now,
  });
  async function call(route,{uid=USER,sessionId=SESSION,emailVerified=verified}={}){
    let status=200,result=null;
    const response={status(x){status=x;return this;},json(data){result=data;return data;}};
    await routes.get("/api/lgu-staff/liveness/"+route)({
      firebaseUser:{uid,email_verified:emailVerified},body:{sessionId},
    },response);
    return{status,result};
  }
  return{call,records,counts,advance(ms){now+=ms;},USER,SESSION};
}
test("default-off AWS liveness cannot start or leak a real session",async()=>{
  const h=harness({enabled:false}),r=await h.call("start");
  assert.equal(r.status,503);assert.equal(r.result.error,"active_liveness_not_configured");
  assert.equal(h.counts.create,0);
});
test("server release, verified applicant and consent are mandatory",async()=>{
  for(const options of [{release:false},{role:"admin"},{verified:false},{consent:false},{withdrew:true}]){
    const h=harness(options);const r=await h.call("start");
    assert.notEqual(r.status,200);assert.equal(h.counts.create,0);
  }
});
test("start creates bounded one-time session and blocks concurrent duplicates",async()=>{
  const h=harness(),first=await h.call("start");
  assert.equal(first.status,200);assert.equal(first.result.sessionId,SESSION);
  assert.equal(first.result.status,"camera_challenge_required");
  assert(!JSON.stringify(first.result).includes("Confidence"));
  const second=await h.call("start");
  assert.equal(second.status,409);assert.equal(h.counts.create,1);
});
test("client cannot substitute or invent another applicant session",async()=>{
  const h=harness();await h.call("start");
  const r=await h.call("result",{sessionId:"fake-session-12345678901"});
  assert.equal(r.status,403);assert.equal(h.counts.results,0);
});
test("real provider SUCCEEDED returns text-only live presence signal, never score or Admin approval",async()=>{
  const h=harness();await h.call("start");
  const r=await h.call("result");
  assert.equal(r.status,200);assert.equal(r.result.status,"live_presence_checked");
  assert.equal(r.result.identityDecision,"manual_review_required");
  assert.equal(r.result.documentAuthenticityVerified,false);
  assert.equal(r.result.adminAccessGranted,false);
  assert(!JSON.stringify(r.result).match(/confidence|score|percent|96/i));
  const record=h.records.get("lguApplicantLivenessSessions/"+h.USER);
  assert.equal(record.state,"completed");
  assert.equal(record.signal,"live_presence_signal_present");
  assert.equal(Object.hasOwn(record,"sessionId"),false);
  assert.equal(Object.hasOwn(record,"confidence"),false);
});
test("low/missing provider scores require manual review without leaking scores",async()=>{
  for(const confidence of [20,null,NaN]){
    const h=harness({providerConfidence:confidence});await h.call("start");
    const r=await h.call("result");
    assert.equal(r.result.status,"manual_review_required");
    assert.equal(h.records.get("lguApplicantLivenessSessions/"+h.USER).signal,"manual_review_required");
  }
});
test("provider incomplete result remains pending, no false success",async()=>{
  const h=harness({providerStatus:"IN_PROGRESS"});await h.call("start");
  const r=await h.call("result");
  assert.equal(r.result.status,"checking_live_presence");
  assert.equal(h.records.get("lguApplicantLivenessSessions/"+h.USER).state,"ready");
});
test("expired liveness session cannot be evaluated and cannot grant privileges",async()=>{
  const h=harness();await h.call("start");h.advance(125000);
  const r=await h.call("result");
  assert.equal(r.status,409);assert.equal(h.counts.results,0);
});
test("AWS outage cannot return false verified state or expose provider error",async()=>{
  const h=harness({providerFailure:true}),r=await h.call("start");
  assert.equal(r.status,503);
  assert.equal(r.result.error,"liveness_provider_unavailable");
  assert.equal(JSON.stringify(r.result).includes("mock AWS offline"),false);
});
test("missing approved threshold fails closed even when provider says succeeded",async()=>{
  const h=harness({threshold:""});await h.call("start");
  const r=await h.call("result");assert.equal(r.status,503);
  assert.equal(r.result.error,"liveness_threshold_not_approved");
});
