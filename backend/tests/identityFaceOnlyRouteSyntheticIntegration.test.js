"use strict";
// Synthetic authenticated-route integration of the EXACT registered Express
// handler extracted from server.js. No real Firebase users, credentials,
// hosted network, private images or Cloudinary resources.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {validateFaceOnlyReviewEvidence} = require("../identityFaceOnlyReviewEvidence");
const {reviewIssuerEvidence} = require("../identityIssuerReviewPolicy");
const {isOperationalAdminProfile} = require("../adminAccess");

const ADMIN="syntheticAdmin123";
const USER="syntheticResident123";
const REQ="syntheticRequest123";
const VER="synthetic-verification-001";
const NOW=Date.now();
const photo=slot=>({
  publicId: "volunserve/identity-private/"+USER+"/"+REQ+"/"+slot,
  resourceType:"image",deliveryType:"authenticated",format:"jpg"
});
const validEvidence=()=>({
  uid:USER,requestId:REQ,verificationId:VER,
  purpose:"consented_manual_identity_review",
  retentionUntil:{toMillis:()=>NOW+86400e3},
  assets:{front:photo("front"),selfie:photo("selfie")}
});
const validVerification=()=>({
  verificationMethod:"volunserve_ai_face_only",
  status:"pending",requiresManualReview:true,
  aiDecision:"manual_review",faceComparisonPassed:true,
  verificationId:VER,privateEvidenceRequestId:REQ,
  documentScreening:{declaredIdType:"national_id",detectedIdType:null,status:"inconclusive"},
  aiAttemptCount:1,aiAttemptCycle:1,matchScore:0.8
});
function makeState(){
  return {
    users:{
      [USER]:{identityStatus:"pending",identityVerified:false,status:"approved",role:"resident"},
    },
    identityVerifications:{[USER]:validVerification()},
    identityPrivateEvidence:{[USER]:validEvidence()},
    adminActivityLogs:{}
  };
}
function readDoc(state,ref){
  const value=state[ref.collection]?.[ref.id];
  return {exists:value!==undefined,data:()=>value};
}
function createDb(state,record){
  return {
    collection(collection){
      return {doc(id){return {collection,id:id||"syntheticActivityLog"};}};
    },
    async runTransaction(callback){
      const writes=[];
      const tx={
        get: async ref=>readDoc(state,ref),
        set(ref,fields,{merge}={}){
          writes.push({ref,fields,merge});
        }
      };
      const result=await callback(tx);
      for(const {ref,fields,merge} of writes){
        state[ref.collection] ||= {};
        state[ref.collection][ref.id] = merge
          ? {...state[ref.collection][ref.id],...fields}
          : fields;
      }
      record.writes.push(...writes);
      return result;
    }
  };
}
const backend=fs.readFileSync("backend/server.js","utf8");
const start=backend.indexOf('app.post(\n  "/api/admin/identity/reviews/:uid/decision"');
const stop=backend.indexOf('app.post(\n  "/api/admin/assistance/requests/',start+20);
assert(start>0 && stop>start,"Actual Admin decision route could not be isolated");
const routeSource=backend.slice(start,stop);
function assemble(state,record){
  let route;
  const requireFirebaseUser=(req,res,next)=>{
    if(!req.firebaseUser?.uid){res.status(401).json({ok:false,error:"auth_required"});return;}
    next();
  };
  const requireOperationalAdmin=(req,res,next)=>{
    if(!isOperationalAdminProfile(req.volunServeProfile)){
      res.status(403).json({ok:false,error:"operational_admin_required"});return;
    }
    next();
  };
  const stubs={
    app:{post:(url,...handlers)=>{
      assert.equal(url,"/api/admin/identity/reviews/:uid/decision");
      route=handlers;
    }},
    requireFirebaseUser,requireOperationalAdmin,
    db:createDb(state,record),
    FieldValue:{
      serverTimestamp:()=>({synthetic:"timestamp"}),
      delete:()=>({synthetic:"delete"})
    },
    validateFaceOnlyReviewEvidence,reviewIssuerEvidence,
    cleanText:(value,max=9999)=>String(value||"").trim().slice(0,max),
    normalizeIdentityStatus:value=>String(value||"basic").toLowerCase(),
    normalizeIdDocumentScreening:value=>value||{},
    selectedIdRecognized:value=>value?.status==="text_consistent_unverified" &&
      value?.declaredIdType===value?.detectedIdType,
    numberOrNull:value=>typeof value==="number" && Number.isFinite(value)?value:null,
    makeHttpError:(statusCode,code,message)=>{
      const e=new Error(message);e.statusCode=statusCode;e.code=code;return e;
    },
    console:{error:()=>{}},
  };
  vm.runInNewContext(routeSource,stubs,{timeout:1500});
  assert.equal(route?.length,3,"Must register both auth middlewares and real handler");
  assert.strictEqual(route[0],requireFirebaseUser);
  assert.strictEqual(route[1],requireOperationalAdmin);
  return route;
}
async function simulate({
  user=ADMIN,target=USER,
  adminProfile={role:"admin",status:"approved",adminStatus:"active",fullName:"Synthetic Admin"},
  action="verify",
  data={},
  params={}
}={}){
  const state=makeState();
  const record={writes:[]};
  // Only supplied synthetic records are altered; no cloud or actual Admin SDK.
  if(data.user)Object.assign(state.users[USER],data.user);
  if(data.verification)Object.assign(state.identityVerifications[USER],data.verification);
  if(data.evidence===null)delete state.identityPrivateEvidence[USER];
  else if(data.evidence)Object.assign(state.identityPrivateEvidence[USER],data.evidence);
  if(data.assets)Object.assign(state.identityPrivateEvidence[USER].assets,data.assets);
  const route=assemble(state,record);
  const request={
    params:{uid:target},firebaseUser:user?{uid:user,email:"synthetic-admin@example.invalid"}:null,
    volunServeProfile:adminProfile,
    body:{
      action,validationMethod:"psa_national_id_qr_check",
      notes:"Independently checked official National ID source",
      issuerReviewAttested:true,...params
    }
  };
  const response={
    code:200,body:null,
    status(v){this.code=v;return this;},
    json(v){this.body=v;return this;}
  };
  // Execute synthetic auth gates synchronously, then AWAIT the real async
  // decision handler. Express's next() is not an awaited promise; treating it
  // as one can falsely mark failed approval scenarios as HTTP 200.
  for(const middleware of route.slice(0,2)){
    let permitted=false;
    await middleware(request,response,()=>{permitted=true;});
    if(!permitted)
      return {code:response.code,body:response.body,state,writes:record.writes};
  }
  await route[2](request,response);
  assert(response.body!==null,"Actual Admin decision handler did not finish");
  return {code:response.code,body:response.body,state,writes:record.writes};
}
test("synthetic authenticated Admin + current private National ID/selfie can approve only after issuer attestation",async()=>{
  const r=await simulate();
  assert.equal(r.code,200);
  assert.equal(r.body?.identityVerified,true);
  assert.equal(r.state.users[USER].identityVerified,true);
  assert.equal(r.state.identityVerifications[USER].status,"verified");
  assert.equal(r.state.adminActivityLogs.syntheticActivityLog.action,"Resident Identity Manually Verified");
  assert.equal(r.state.identityVerifications[USER].issuerApiAuthenticityVerified,false);
  assert.equal(r.writes.length,3);
});
async function mustBlock(label, options, expectedCode, expectedReason){
  await test(label,async()=>{
    const r=await simulate(options);
    assert.equal(r.code,expectedCode);
    assert.equal(r.body?.error,expectedReason);
    assert.equal(r.writes.length,0,"Failed attempt must not write ANY record");
    // A blocked request must NEVER mutate the resident's existing state.
    // The already-Verified scenario starts true and correctly stays true.
    assert.equal(r.state.users[USER].identityVerified,options.data?.user?.identityVerified===true);
  });
}
(async()=>{
  await mustBlock("no Firebase user denied before handler", {user:null},401,"auth_required");
  await mustBlock("basic Resident cannot approve", {adminProfile:{role:"resident",status:"approved"}},403,"operational_admin_required");
  await mustBlock("unapproved Admin cannot approve", {adminProfile:{role:"admin",status:"pending"}},403,"operational_admin_required");
  await mustBlock("self approval denied", {target:ADMIN},403,"self_identity_review_forbidden");
  await mustBlock("missing linked evidence denied",{data:{evidence:null}},409,"face_only_evidence_unavailable");
  await mustBlock("expired evidence denied",{data:{evidence:{retentionUntil:{toMillis:()=>NOW-1}}}},409,"face_only_evidence_unavailable");
  await mustBlock("wrong request link denied",{data:{evidence:{requestId:"staleRequest"}}},409,"face_only_evidence_unavailable");
  await mustBlock("wrong Resident photo denied",{data:{assets:{selfie:{...photo("selfie"),publicId:"volunserve/identity-private/anotherResident/stale/selfie"}}}},409,"face_only_evidence_unavailable");
  await mustBlock("missing selfie denied",{data:{assets:{selfie:null}}},409,"face_only_evidence_unavailable");
  await mustBlock("publicly accessible image denied",{data:{assets:{front:{...photo("front"),deliveryType:"upload"}}}},409,"face_only_evidence_unavailable");
  await mustBlock("spoofed AI match flag denied",{data:{verification:{faceComparisonPassed:false}}},409,"face_only_independent_review_required");
  await mustBlock("unsupported face-only ID denied",{data:{verification:{documentScreening:{declaredIdType:"school_id"}}}},409,"face_only_independent_review_required");
  await mustBlock("Admin has not checked issuer denied",{params:{issuerReviewAttested:false}},400,"independent_id_review_required");
  await mustBlock("arbitrary issuer method denied",{params:{validationMethod:"selfie_only"}},400,"independent_id_review_required");
  await mustBlock("account already Verified cannot re-verify",{data:{user:{identityStatus:"verified",identityVerified:true}}},409,"identity_already_verified");
  await mustBlock("verification no longer Pending cannot be approved",{data:{verification:{status:"failed",requiresManualReview:false}}},409,"identity_review_not_pending");
  await test("require retry allowed without retained images, does not verify",async()=>{
    const r=await simulate({action:"require_retry",data:{evidence:null},params:{notes:"Need clearer photo"}});
    assert.equal(r.code,200);
    assert.equal(r.body?.identityVerified,false);
    assert.equal(r.state.users[USER].identityVerified,false);
    assert.equal(r.state.identityVerifications[USER].manualReviewDecision,"retry_required");
  });
  await test("reject allowed without retained images, does not verify",async()=>{
    const r=await simulate({action:"reject",data:{evidence:null},params:{notes:"Submitted ID clearly unsupported"}});
    assert.equal(r.code,200);
    assert.equal(r.body?.identityVerified,false);
    assert.equal(r.state.users[USER].identityVerified,false);
    assert.equal(r.state.identityVerifications[USER].manualReviewDecision,"rejected");
  });
})().catch(err=>{console.error(err);process.exitCode=1;});
