"use strict";
/** Synthetic-only execution of the real authenticated Admin route.
 * No network, user accounts, passport images or Firebase credentials.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { selectedIdRecognized } = require("./selectedIdPolicy");
const { reviewIssuerEvidence } = require("./identityIssuerReviewPolicy");
const { getProfileRole, isApprovedAccount } = require("./adminAccess");

const source = fs.readFileSync("backend/server.js","utf8");
const a = source.indexOf("function normalizeIdDocumentScreening(value) {");
const b = source.indexOf("\nfunction numberOrNull(",a);
assert(a >= 0 && b > a);
const normalizeIdDocumentScreening = vm.runInNewContext(
  source.slice(a,b) + "\nnormalizeIdDocumentScreening", {},
);
const begin = source.indexOf('app.post(\n  "/api/admin/identity/reviews/:uid/decision"');
const end = source.indexOf('app.post(\n  "/api/admin/assistance/requests/:requestId/start-review"',begin);
assert(begin>=0 && end>begin, "must extract only actual identity decision route");
const actualRoute=source.slice(begin,end);

const DEMO_UID = "resident_synthetic_001";
const ADMIN_UID = "admin_synthetic_001";
const baseDoc = {
 declaredIdType:"passport", detectedIdType:"passport",
 status:"text_consistent_unverified", warningCodes:[],
 imageQualityStatus:"adequate", profileNameCheck:"possible_match",
 profileBirthDateCheck:"possible_match", backSideProvided:false,
 backSideScreened:false,passportMrzCheck:"checksum_consistent_unverified",
 passportMrzBirthDateCheck:"possible_match",passportMrzCheckDigitsConsistent:true
};
function trial({doc={},admin=true,auth=true,approved=true,personUid=DEMO_UID,
                action="verify",attested=true,validMethod=true,
                currentStatus="pending", targetRole="resident",
                residentAccess=true, targetStatus="approved",
                notes="Reviewed independently using the official document and in-person reference."}={}) {
  const records=new Map([
    ["users/"+DEMO_UID,{
      role:targetRole,residentAccess,status:targetStatus,
      identityStatus:"pending",identityVerified:false,
    }],
    ["identityVerifications/"+DEMO_UID,{
      verificationId:"synthetic_review_001",requiresManualReview:true,
      status:currentStatus,documentScreening:{...baseDoc,...doc},
      aiDecision:"manual_review",aiAttemptCount:1,
    }],
  ]);
  const writes=[];
  const db={
    collection(col){return {doc(id){return {col,id:id||"synthetic_audit_001"};}};},
    runTransaction:async work=>{
      const pending=[];
      const tx={
        get:async ref=>{
          const row=records.get(ref.col+"/"+ref.id);
          return {exists:!!row,data:()=>({...row})};
        },
        set:(ref,data,opts)=>pending.push({ref,data,opts}),
      };
      const val=await work(tx);
      for (const w of pending){
        const key=w.ref.col+"/"+w.ref.id;
        records.set(key,{...(records.get(key)||{}),...w.data});
        writes.push(w);
      }
      return val;
    }
  };
  let handlers;
  const stage={
    app:{post(path,...list){ assert.equal(path,"/api/admin/identity/reviews/:uid/decision");handlers=list;}},
    requireFirebaseUser(req,res,next){
      if(!auth)return res.status(401).json({error:"unauthenticated"});
      req.firebaseUser={uid:admin?ADMIN_UID:DEMO_UID,name:"Synthetic reviewer"};
      next();
    },
    requireOperationalAdmin(req,res,next){
      if(!admin || !approved)return res.status(403).json({error:"operational_admin_required"});
      req.volunServeProfile={role:"admin",status:"approved",fullName:"Synthetic reviewer"};
      next();
    },
    db, FieldValue:{serverTimestamp:()=>({syntheticTimestamp:true}),delete:()=>({syntheticDelete:true})},
    MAX_IDENTITY_AI_ATTEMPTS:3,
    cleanText:(value,max=200)=>String(value||"").trim().slice(0,max),
    numberOrNull:value=>typeof value==="number"&&Number.isFinite(value)?value:null,
    identityAttemptCount:value=>Number.isSafeInteger(value)?Math.min(Math.max(0,value),3):0,
    normalizeIdentityStatus:value=>["basic","pending","verified","failed"].includes(value)?value:"basic",
    normalizeIdDocumentScreening, selectedIdRecognized,reviewIssuerEvidence,
    getProfileRole,isApprovedAccount,
    makeHttpError:(status,code,message)=>Object.assign(new Error(message),{statusCode:status,code}),
    console:{error:()=>{}},
  };
  vm.runInNewContext(actualRoute,stage,{filename:"synthetic_actual_admin_route.js"});
  assert.equal(handlers.length,3);
  const request={
    params:{uid:personUid},
    body:{
      action, validationMethod:validMethod?"official_document_check":"",
      issuerReviewAttested:attested,
      notes,
    },
  };
  const response={
    statusCode:200,body:null,
    status(value){this.statusCode=value;return this;},
    json(value){this.body=value;return this;}
  };
  const run=async()=>{
    let index=0;
    return new Promise((resolve,reject)=>{
      const next=()=>{
        if(index>=handlers.length)return resolve();
        const handler=handlers[index++];
        try{
          const p=handler(request,response,next);
          if(p?.then)p.then(resolve,reject);
          if(index<=handlers.length && response.body!==null)resolve();
        }catch(e){reject(e);}
      };
      next();
      if(response.body!==null)resolve();
    }).then(()=>({response,writes,records}));
  };
  return run();
}

test("unauthenticated user cannot read or write Admin decision route",async()=>{
 const r=await trial({auth:false});
 assert.equal(r.response.statusCode,401);
 assert.equal(r.writes.length,0);
});
test("ordinary Resident cannot execute Admin approval",async()=>{
 const r=await trial({admin:false});
 assert.equal(r.response.statusCode,403);
 assert.equal(r.writes.length,0);
});
test("Admin cannot review own identity",async()=>{
 const r=await trial({personUid:ADMIN_UID});
 assert.equal(r.response.statusCode,403);
 assert.equal(r.writes.length,0);
});
test("staff, Admin, Super Admin and applicant accounts cannot be targets of Resident decisions",async()=>{
 for(const role of ["admin","superadmin","lgu_personnel","applicant","guest",""]){
   for(const action of ["verify","require_retry","reject"]){
     const r=await trial({targetRole:role,action});
     assert.equal(r.response.statusCode,403,role+" "+action);
     assert.equal(r.response.body.error,"identity_review_target_not_eligible");
     assert.equal(r.writes.length,0);
   }
 }
});
test("a role claim in requested/active mode cannot replace a real Resident profile",async()=>{
 const r=await trial({targetRole:"admin"});
 assert.equal(r.response.statusCode,403);
 assert.equal(r.writes.length,0);
});
test("inactive or nonresident-access accounts cannot be verified or retried",async()=>{
 for(const args of [{targetStatus:"suspended"},{targetStatus:"pending"},
                    {targetStatus:"rejected"},{residentAccess:false}]){
   for(const action of ["verify","require_retry","reject"]){
     const r=await trial({...args,action});
     assert.equal(r.response.statusCode,403,JSON.stringify({...args,action}));
     assert.equal(r.writes.length,0);
   }
 }
});
test("approved Volunteer with residentAccess remains eligible for human identity review",async()=>{
 const r=await trial({targetRole:"volunteer"});
 assert.equal(r.response.statusCode,200);
 assert.equal(r.response.body.identityVerified,true);
});
test("MRZ contradiction blocks the actual transaction before writes",async()=>{
 for(const doc of [
   {passportMrzCheck:"checksum_inconsistent_or_ocr_error"},
   {passportMrzBirthDateCheck:"possible_conflict"},
   {profileBirthDateCheck:"possible_conflict"},
   {passportMrzCheck:"multiple_candidates"},
 ]) {
   const r=await trial({doc});
   assert.equal(r.response.statusCode,409,JSON.stringify(doc));
   assert.equal(r.writes.length,0);
 }
});
test("independent reviewer attestation is required even with good OCR",async()=>{
 const r=await trial({attested:false});
 assert.equal(r.response.statusCode,400);
 assert.equal(r.writes.length,0);
});
test("verified status changes only by authorized Admin independent attestation",async()=>{
 const r=await trial();
 assert.equal(r.response.statusCode,200);
 assert.equal(r.response.body.identityVerified,true);
 assert.equal(r.records.get("users/"+DEMO_UID).identityStatus,"verified");
 assert.equal(r.records.get("users/"+DEMO_UID).identityVerified,true);
 assert.equal(r.records.get("identityVerifications/"+DEMO_UID).manualReviewDecision,"verified");
 assert.equal(r.records.get("identityVerifications/"+DEMO_UID).issuerApiAuthenticityVerified,false);
 assert.equal(r.writes.length,3);
 assert(r.writes.some(w=>w.ref.col==="adminActivityLogs"));
});
test("Require Retry stores reason but never verifies Resident",async()=>{
 const r=await trial({doc:{passportMrzCheck:"checksum_inconsistent_or_ocr_error"},
                      action:"require_retry",validMethod:false,attested:false});
 assert.equal(r.response.statusCode,200);
 assert.equal(r.response.body.identityVerified,false);
 assert.equal(r.records.get("users/"+DEMO_UID).identityVerified,false);
 assert.equal(r.records.get("identityVerifications/"+DEMO_UID).manualReviewDecision,"retry_required");
 assert.equal(r.writes.length,3);
});
test("non-pending review cannot be approved or replayed",async()=>{
 const r=await trial({currentStatus:"verified"});
 assert.equal(r.response.statusCode,409);
 assert.equal(r.writes.length,0);
});

test("Reject Submission is a distinct audited, non-verifying Admin outcome",async()=>{
 const r=await trial({action:"reject",attested:false,validMethod:false});
 assert.equal(r.response.statusCode,200);
 assert.equal(r.response.body.identityVerified,false);
 assert.equal(r.records.get("users/"+DEMO_UID).identityVerified,false);
 assert.equal(r.records.get("users/"+DEMO_UID).identityStatus,"failed");
 const decision=r.records.get("identityVerifications/"+DEMO_UID);
 assert.equal(decision.status,"failed");
 assert.equal(decision.decision,"rejected");
 assert.equal(decision.manualReviewDecision,"rejected");
 assert.equal(decision.aiAttemptCount,1,"Reject must NOT silently reset attempts");
 assert.equal(decision.requiresManualReview,false);
 assert(r.writes.some(w=>w.ref.col==="adminActivityLogs" &&
    w.data.action==="Resident Identity Submission Rejected"));
 assert.equal(r.writes.length,3);
});
test("Reject requires a reason but not AI/issuer pass",async()=>{
 const bad=await trial({action:"reject",notes:"No"});
 assert.equal(bad.response.statusCode,400);
 assert.equal(bad.response.body.error,"identity_retry_reason_required");
 assert.equal(bad.writes.length,0);
 const unsupported=await trial({action:"reject",doc:{detectedIdType:"school_id",status:"unsupported"}});
 assert.equal(unsupported.response.statusCode,200);
 assert.equal(unsupported.response.body.identityVerified,false);
});
test("Reject fails closed against stale review or unauthorized admin",async()=>{
 const inactive=await trial({action:"reject",currentStatus:"failed"});
 assert.equal(inactive.response.statusCode,409);
 assert.equal(inactive.writes.length,0);
 const ordinary=await trial({action:"reject",admin:false});
 assert.equal(ordinary.response.statusCode,403);
 assert.equal(ordinary.writes.length,0);
 const self=await trial({action:"reject",personUid:ADMIN_UID});
 assert.equal(self.response.statusCode,403);
 assert.equal(self.writes.length,0);
});
