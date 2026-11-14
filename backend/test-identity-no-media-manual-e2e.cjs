"use strict";
/**
 * Exercises actual no-photo Resident route + existing Admin decision + queue
 * with synthetic Firebase, in-memory Firestore and no privileged credentials.
 * Does NOT prove real identity, liveness, issuer authenticity or deployment.
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {installManualIdentityReviewRoutes}=require("./identityManualReviewRoutes");
const {getProfileRole,isApprovedAccount}=require("./adminAccess");
const {reviewIssuerEvidence}=require("./identityIssuerReviewPolicy");
const SOURCE=fs.readFileSync("backend/server.js","utf8");
const start=SOURCE.indexOf("function identityAdminTimestampIso(value) {");
const stop=SOURCE.indexOf('app.post(\n  "/api/admin/assistance/requests/:requestId/start-review"',start);
assert(start>=0&&stop>start,"existing Admin queue/decision not found");
const ORIGINAL_ADMIN=SOURCE.slice(start,stop);
const UID="resident_synthetic_manual_001",ADMIN="approved_synthetic_admin_001";
const NOTES="I personally inspected the original ID and compared the person's face to it, with independent LGU document validation completed.";
const DEFAULT_BODY={consent:true,idType:"drivers_license"};
const DELETED={__deleted:true};
function harness({project="volunserve-full-staging",staging=true,residentRole="resident",
  residentStatus="approved",residentAccess=true}={}){
  const records=new Map([
    ["users/"+UID,{
      uid:UID,role:residentRole,status:residentStatus,residentAccess,
      identityStatus:"basic",identityVerified:false,
      email:"synthetic-resident@example.invalid",fullName:"Fictional Test Resident",
    }],
    ["users/"+ADMIN,{uid:ADMIN,role:"admin",status:"approved",adminStatus:"active",
      fullName:"Fictional LGU Reviewer"}],
  ]);
  let nextId=0;
  const snapshot=(ref)=>{
    const row=records.get(ref.collection+"/"+ref.id);
    return {id:ref.id,exists:row!==undefined,data:()=>row};
  };
  const db={
    collection(collection) {
      return {
        doc(id){const ref={collection,id:id||"fake_activity_"+(++nextId)};return {...ref,get:async()=>snapshot(ref)}},
        orderBy(){return {limit(n){return {get:async()=>({
          docs:[...records.keys()].filter(x=>x.startsWith(collection+"/"))
            .slice(0,n).map(k=>snapshot({collection,id:k.slice(collection.length+1)})),
        })}}}},
      };
    },
    async runTransaction(fn){
      const changes=[];
      const tx={
        get:async(ref)=>snapshot(ref),
        set:(ref,data,opts)=>changes.push({ref,data,opts}),
        create:(ref,data)=>changes.push({ref,data}),
      };
      const result=await fn(tx);
      for(const {ref,data,opts} of changes){
        const key=ref.collection+"/"+ref.id;
        const next=opts?.merge?{...(records.get(key)||{})}:{};
        for(const [name,value] of Object.entries(data)){
          if(value===DELETED || value?.__deleted===true)delete next[name];
          else next[name]=value;
        }
        records.set(key,next);
      }
      return result;
    },
  };
  const routes=new Map();
  const app={
    get(route,...handlers){routes.set("GET "+route,handlers)},
    post(route,...handlers){routes.set("POST "+route,handlers)},
  };
  const auth={app:{options:{projectId:project}}};
  const FieldValue={
    serverTimestamp:()=>({toMillis:()=>Date.now(),toDate:()=>new Date()}),
    delete:()=>DELETED,
  };
  const requireFirebaseUser=(req,res,next)=>{
    if(!req.viewerUid)return res.status(401).json({error:"unauthenticated"});
    req.firebaseUser={uid:req.viewerUid,name:"Fictional User"};next();
  };
  const requireOperationalAdmin=(req,res,next)=>{
    const profile=records.get("users/"+req.viewerUid);
    if(!profile||req.viewerUid!==ADMIN||getProfileRole(profile)!=="admin"||
       !isApprovedAccount(profile))return res.status(403).json({error:"admin_required"});
    req.volunServeProfile=profile;next();
  };
  // Explicit synthetic staging runtime; host process.env remains untouched.
  const env={
    RENDER_SERVICE_NAME:staging?"volunserve-backend-staging":"production-only",
    VOLUNSERVE_STAGING_STRICT:staging?"1":"0",
    VOLUNSERVE_DEPLOYMENT_ENV:staging?"full-staging":"production",
  };
  installManualIdentityReviewRoutes({
    app,db,auth,FieldValue,requireFirebaseUser,runtimeEnvironment:env,
  });
  const adminCtx={
    app,db,auth,FieldValue,process:{env},
    requireFirebaseUser,requireOperationalAdmin,
    isFullStagingRuntime:()=>staging,
    cleanText:(x,n=200)=>String(x||"").trim().slice(0,n),
    numberOrNull:(x)=>typeof x==="number"&&Number.isFinite(x)?x:null,
    identityAttemptCount:(x)=>Number.isSafeInteger(x)?x:0,
    MAX_IDENTITY_AI_ATTEMPTS:3,
    getProfileRole,isApprovedAccount,reviewIssuerEvidence,
    selectedIdRecognized:()=>false,
    normalizeIdDocumentScreening:()=>({status:"inconclusive",declaredIdType:null}),
    normalizeIdentityStatus:(value)=>["basic","pending","failed","verified"].includes(value)?value:"basic",
    makeHttpError:(statusCode,code,message)=>Object.assign(new Error(message),{statusCode,code}),
    console:{warn:()=>{},error:()=>{}},
  };
  vm.runInNewContext(ORIGINAL_ADMIN,adminCtx,{filename:"staging_actual_admin_reviews.js"});
  async function call(method,path,{viewerUid=UID,body={},params={}}={}){
    const handlers=routes.get(method+" "+path);
    assert(handlers,"missing handler for "+method+" "+path);
    const req={viewerUid,body,params,headers:{"content-type":"application/json"}};
    const response={
      code:200,body:null,headers:{},
      set(name,value){this.headers[name]=value;return this},
      status(code){this.code=code;return this},
      json(x){this.body=x;return this},
    };
    for(const handler of handlers){
      if(response.body!==null)break;
      let next=false;
      await handler(req,response,()=>{next=true});
      if(response.body===null&&!next)throw Error("No response from actual route");
    }
    assert(response.body!==null);
    return response;
  }
  const request=(body=DEFAULT_BODY,viewerUid=UID)=>call(
    "POST","/api/identity/manual-review-request",{viewerUid,body});
  const queue=(viewerUid=ADMIN)=>call("GET","/api/admin/identity/reviews",{viewerUid});
  const decide=(action,extra={},viewerUid=ADMIN)=>call(
    "POST","/api/admin/identity/reviews/:uid/decision",
    {viewerUid,params:{uid:UID},body:{
      action,notes:NOTES,validationMethod:"in_person_lgu_validation",
      issuerReviewAttested:true,...extra,
    }});
  return {request,queue,decide,records,env};
}
test("Resident request creates pending only, never biometric/Verified status",async()=>{
  const h=harness();
  const r=await h.request();
  assert.equal(r.code,201,JSON.stringify(r.body));
  assert.equal(r.body.identityVerified,false);
  assert.equal(r.body.decision,"manual_review");
  assert.equal(r.body.manualReviewChannel,"lgu_in_person_no_media");
  assert.equal(r.headers["Cache-Control"],"private, no-store, max-age=0");
  const user=h.records.get("users/"+UID);
  const row=h.records.get("identityVerifications/"+UID);
  assert.equal(user.identityVerified,false);
  assert.equal(user.identityStatus,"pending");
  assert.equal(row.status,"pending");
  assert.equal(row.verificationMethod,"manual_lgu_in_person_no_media");
  assert.equal(row.manualIdType,"drivers_license");
  assert.equal(row.matchScore,undefined);
  assert.equal(row.livenessScore,undefined);
  assert.equal(row.documentScreening,undefined);
  assert.equal(row.aiAttemptCount,undefined);
  const serialized=JSON.stringify([...h.records]);
  for(const forbidden of ["idDocument","selfieBytes","faceEmbedding","idNumber","personalFaceTemplate"])
    assert(!serialized.includes(forbidden));
  const duplicate=await h.request();
  assert.equal(duplicate.code,409);
  assert.equal(duplicate.body.error,"identity_review_already_pending");
});
test("staging guard denies production and wrong Firebase project, no writes",async()=>{
  for(const config of [{staging:false},{project:"volunserve-3aa5b"}]){
    const h=harness(config);
    const r=await h.request();
    assert.equal(r.code,404,JSON.stringify(r.body));
    assert.equal(h.records.get("users/"+UID).identityStatus,"basic");
    assert.equal(h.records.has("identityVerifications/"+UID),false);
  }
});
test("reject unwanted file fields, unsupported IDs and missing consent",async()=>{
  const h=harness();
  for(const body of [
    {idType:"national_id",consent:false},
    {idType:"school_id",consent:true},
    {idType:"passport",consent:true,idDocument:"FAKE_BINARY"},
    {idType:"passport",consent:true,selfie:"FAKE_BINARY"},
    {idType:"passport",consent:true,rawOcr:"FAKE_OCR"},
  ]){
    const r=await h.request(body);
    assert.equal(r.code,400,JSON.stringify(body));
    assert.equal(h.records.has("identityVerifications/"+UID),false);
  }
  assert.equal((await h.request(DEFAULT_BODY,null)).code,401);
});
test("ineligible staff, inactive or non-Resident cannot create queue case",async()=>{
  for(const config of [
    {residentRole:"admin"},{residentRole:"guest"},
    {residentStatus:"suspended"},{residentStatus:"pending"},
    {residentAccess:false},
  ]){
    const h=harness(config),r=await h.request();
    assert.equal(r.code,403,JSON.stringify(config));
    assert.equal(h.records.has("identityVerifications/"+UID),false);
  }
});
test("Admin list sees real pending manual channel but Resident cannot view queue",async()=>{
  const h=harness();
  await h.request({idType:"national_id",consent:true});
  assert.equal((await h.queue(UID)).code,403);
  const q=await h.queue();
  assert.equal(q.code,200,JSON.stringify(q.body));
  assert.equal(q.headers["Cache-Control"],"private, no-store, max-age=0");
  const item=q.body.items.find(x=>x.uid===UID);
  assert(item);
  assert.equal(item.manualReviewChannel,"lgu_in_person_no_media");
  assert.equal(item.manualIdType,"national_id");
  assert.equal(item.identityVerified,false);
  assert.equal(item.documentScreening,null);
  assert.equal(item.targetEligible,true);
});
test("manual approval refuses missing in-person evidence or issuer attestation",async()=>{
  const h=harness();
  await h.request();
  for(const extra of [
    {},
    {inPersonIdInspected:true},
    {inPersonFaceCompared:true},
    {inPersonIdInspected:true,inPersonFaceCompared:true,issuerReviewAttested:false},
    {inPersonIdInspected:true,inPersonFaceCompared:true,notes:"too short"},
    {inPersonIdInspected:true,inPersonFaceCompared:true,validationMethod:"psa_national_id_qr_check"},
  ]){
    const r=await h.decide("verify",extra);
    assert([400,409].includes(r.code),JSON.stringify(extra)+" "+JSON.stringify(r.body));
    assert.equal(h.records.get("users/"+UID).identityVerified,false);
  }
  const unauthorized=await h.decide("verify",{
    inPersonIdInspected:true,inPersonFaceCompared:true,
  },UID);
  assert.equal(unauthorized.code,403);
  assert.equal(h.records.get("users/"+UID).identityVerified,false);
});
test("only approved Admin with recorded physical checks can Verify and audit",async()=>{
  const h=harness();
  await h.request();
  const ok=await h.decide("verify",{
    inPersonIdInspected:true,inPersonFaceCompared:true,
  });
  assert.equal(ok.code,200,JSON.stringify(ok.body));
  assert.equal(ok.body.identityVerified,true);
  const user=h.records.get("users/"+UID);
  const doc=h.records.get("identityVerifications/"+UID);
  assert.equal(user.identityVerified,true);
  assert.equal(user.identityVerificationMethod,"volunserve_lgu_in_person_manual_review");
  assert.equal(doc.originalIdInspectedInPerson,true);
  assert.equal(doc.faceComparedInPerson,true);
  assert.equal(doc.manualReviewDecision,"verified");
  assert.equal(doc.issuerApiAuthenticityVerified,false);
  const logs=[...h.records.entries()].filter(([name])=>name.startsWith("adminActivityLogs/"));
  assert.equal(logs.length,1);
  assert.equal(logs[0][1].performedBy,ADMIN);
  assert.equal((await h.decide("verify",{inPersonIdInspected:true,inPersonFaceCompared:true})).code,409);
});
test("manual requests can be rejected or sent for retry without granting identity",async()=>{
  for(const action of ["reject","require_retry"]){
    const h=harness();
    await h.request();
    const result=await h.decide(action,{
      validationMethod:"",issuerReviewAttested:false,notes:"In-person LGU document evidence must be resubmitted.",
    });
    assert.equal(result.code,200,JSON.stringify(result.body));
    assert.equal(h.records.get("users/"+UID).identityVerified,false);
    assert.equal(h.records.get("identityVerifications/"+UID).requiresManualReview,false);
  }
});
