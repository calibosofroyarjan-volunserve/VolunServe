"use strict";
/** Exercise actual Node /api/identity/verify route with inert fake AI output.
 * No real images, Firebase connections, passwords, ID numbers or model weights.
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const crypto=require("node:crypto");
const {
  boundedVerificationId,identityPrecheckExpiresAt,
  safeIdentityOutcomeMessage,PRECHECK_THROTTLE_RETENTION_MS,
}=require("./identityPrivacyPolicy");

const source=fs.readFileSync("backend/server.js","utf8");
const aiSource=fs.readFileSync("identity-ai/main.py","utf8");
const start=source.indexOf('app.post(\n  "/api/identity/verify"');
const end=source.indexOf("function identityAdminTimestampIso(",start);
assert(start>=0&&end>start,"real identity verification route missing");
const actualVerify=source.slice(start,end);

const UID="fictional_resident_001";
const SECRET_MARKER="PRIVATE_OCR_PASSPORT_NUMBER_987654321_NAME_FIXTURE";
const fakeAI={
  decision:"manual_review",
  status:"pending",
  verificationId:"identity: "+SECRET_MARKER,
  message:"Matched facial features for "+SECRET_MARKER,
  matchScore:0.93,
  selfieByteArray:SECRET_MARKER,
  rawFaceLandmarks:SECRET_MARKER,
  documentScreening:{
    declaredIdType:"national_id",
    detectedIdType:"national_id",
    status:"text_consistent_unverified",
    warningCodes:[],
    backSideProvided:true,
    backSideScreened:true,
    imageQualityStatus:"adequate",
    backImageQualityStatus:"adequate",
    profileNameCheck:"possible_match",
    profileBirthDateCheck:"possible_match",
    rawOCR:SECRET_MARKER,
    rawMrz:SECRET_MARKER,
  },
};
function testHarness(){
  const records=new Map([
    ["users/"+UID,{
      uid:UID,role:"resident",status:"approved",residentAccess:true,
      identityVerified:false,identityStatus:"basic",
    }],
    ["identityVerifications/"+UID,{
      uid:UID,status:"failed",requiresManualReview:false,
      aiAttemptCount:0,aiAttemptCycle:1,
      manualReviewDecision:"retry_required",
      manualReviewNotes:"LEGACY_PRIVATE_REVIEW_NOTE_NO_COPY",
      reviewedBy:"confidential_reviewer_fixture",
      reviewedAt:"2026-11-10T00:00:00Z",
      matchScore:0.45,
    }],
  ]);
  let nextDoc=0;
  const asSnapshot=ref=>{
    const key=ref.collection+"/"+ref.id;
    const data=records.get(key);
    return {id:ref.id,exists:data!==undefined,data:()=>data};
  };
  const db={
    collection(name){
      return {
        doc(id){return {collection:name,id:id||"fictional_auto_"+(++nextDoc)}},
      };
    },
    async runTransaction(work){
      const writes=[];
      const tx={
        get:async ref=>asSnapshot(ref),
        set:(ref,data,options)=>writes.push({ref,data,options}),
        create:(ref,data)=>writes.push({ref,data,options:null}),
      };
      const result=await work(tx);
      for(const {ref,data,options} of writes){
        const key=ref.collection+"/"+ref.id;
        const next=options?.merge?{...(records.get(key)||{})}:{};
        for(const [name,value] of Object.entries(data)){
          if(value?.__delete===true)delete next[name];
          else next[name]=value;
        }
        records.set(key,next);
      }
      return result;
    },
  };
  const routes=new Map();
  const sandbox={
    app:{post:(path,...list)=>routes.set(path,list)},
    requireFirebaseUser:()=>{},
    requireStagingIdentityMediaApproval:()=>{},
    requireValidatedIdentityMultipart:()=>()=>{},
    express:{raw:()=>()=>{}},
    IDENTITY_UPLOAD_LIMIT:"32mb",
    db,crypto,
    process:{env:{}},
    console:{warn:()=>{}},
    FieldValue:{
      delete:()=>({__delete:true}),
      serverTimestamp:()=>({toMillis:()=>Date.now()}),
    },
    identityAttemptCount:n=>Number.isSafeInteger(n)&&n>0?Math.min(n,3):0,
    normalizeIdentityStatus:x=>["basic","pending","verified","failed"].includes(x)?x:"basic",
    numberOrNull:x=>typeof x==="number"&&Number.isFinite(x)?x:null,
    cleanText:(x,n=100)=>String(x||"").trim().slice(0,n),
    makeHttpError:(statusCode,code,message)=>Object.assign(new Error(message),{statusCode,code}),
    MAX_IDENTITY_AI_ATTEMPTS:3,
    IDENTITY_PROCESSING_LEASE_MS:180000,
    IDENTITY_RETRY_DELAY_MS:8000,
    identityAttemptOutcome:decision=>({
      status:decision==="manual_review"||decision==="verified"?"pending":"failed",
      requiresManualReview:decision==="manual_review"||decision==="verified",
    }),
    diditCleanupFields:()=>({}),
    callIdentityAiService:async()=>fakeAI,
    normalizeIdDocumentScreening:x=>({
      // Staging transport's existing normalized enum fields only.
      declaredIdType:x?.declaredIdType,
      detectedIdType:x?.detectedIdType,
      status:x?.status,
      warningCodes:[],
      backSideProvided:true,
      backSideScreened:true,
      imageQualityStatus:"adequate",
      backImageQualityStatus:"adequate",
      profileNameCheck:"possible_match",
      profileBirthDateCheck:"possible_match",
      authenticityVerified:false,livenessVerified:false,
    }),
    normalizeAiDecision:x=>x,
    enforceSelectedIdDecision:x=>x,
    verifyIndependentPadAttestation:()=>({status:"not_validated"}),
    boundedVerificationId,safeIdentityOutcomeMessage,
  };
  vm.runInNewContext(actualVerify,sandbox,{filename:"actual_identity_verify.js"});
  const list=routes.get("/api/identity/verify");
  assert.equal(list.length,5,"actual private verify route must have its auth/media middleware");
  const handler=list.at(-1);
  const response={
    code:200,body:null,headers:{},
    set(key,value){this.headers[key]=value;return this;},
    status(n){this.code=n;return this;},
    json(data){this.body=data;return this;},
  };
  const request={firebaseUser:{uid:UID},body:Buffer.from("SYNTHETIC_BYTES_NOT_REAL_PHOTOS")};
  return {records,response,handler,request};
}

test("real verification handler persists no provider OCR/private message and never auto-verifies",async()=>{
  const h=testHarness();
  await h.handler(h.request,h.response);
  assert.equal(h.response.code,200,JSON.stringify(h.response.body));
  assert.equal(h.response.headers["Cache-Control"],"private, no-store, max-age=0");
  const snapshot=JSON.stringify([...h.records.entries()]);
  const response=JSON.stringify(h.response.body);
  for(const secret of [SECRET_MARKER,"LEGACY_PRIVATE_REVIEW_NOTE_NO_COPY",
                       "confidential_reviewer_fixture"]){
    assert(!snapshot.includes(secret),"sensitive data escaped into persistent writes: "+secret);
    assert(!response.includes(secret),"sensitive data escaped to API: "+secret);
  }
  const verification=h.records.get("identityVerifications/"+UID);
  assert.equal(verification.status,"pending");
  assert.equal(verification.requiresManualReview,true);
  assert.equal(verification.message,
    "Your ID and selfie assessment requires independent Admin review. Liveness and ID authenticity are not verified.");
  assert.match(verification.verificationId,/^identity_[a-zA-Z0-9_-]+$/);
  const attempt=[...h.records.entries()].find(([name])=>name.startsWith("identityVerificationAttempts/"));
  assert(attempt,"immutable attempt metadata must still be recorded");
  const row=attempt[1];
  assert.equal(row.attemptNumber,1);
  assert.equal(row.status,"pending");
  assert.equal(row.matchScore,undefined,"biometric score not duplicated into attempt audit");
  assert.equal(row.documentScreening,undefined,"full OCR hints not duplicated into attempt audit");
  assert.equal(row.previousReview?.previousReviewNotes,undefined);
  assert.equal(h.records.get("users/"+UID).identityVerified,false);
});
test("privacy message policy never persists or returns provider-authored free text",()=>{
  const request={
    decision:"failed",requiresManualReview:false,attemptCount:1,
    maxAttempts:3,documentScreening:{warningCodes:["document_front_back_swapped"],
      privateValue:SECRET_MARKER},
  };
  assert.equal(safeIdentityOutcomeMessage(request),
    "Your ID front and back appear reversed. Retake each side in the correct slot.");
  assert.equal(boundedVerificationId("identity: "+SECRET_MARKER,"fallback_safe_123"),
    "fallback_safe_123");
  assert.equal(boundedVerificationId("identity_secure_fixture_001","fallback_safe_123"),
    "identity_secure_fixture_001");
  for(const code of [null,undefined,"",SECRET_MARKER+" user@example.invalid","../../other",
                     "identity\nheader"]){
    assert.equal(boundedVerificationId(code,"fallback_safe_123"),"fallback_safe_123");
  }
});
test("temporary throttle has bounded timestamp and explicit 48h retention metadata",()=>{
  const now=Date.UTC(2026,10,14,1);
  const expiry=identityPrecheckExpiresAt(now);
  assert.equal(expiry.getTime()-now,48*60*60*1000);
  assert.equal(PRECHECK_THROTTLE_RETENTION_MS,48*60*60*1000);
  assert.throws(()=>identityPrecheckExpiresAt(Number.NaN));
  assert(source.includes("expiresAt: identityPrecheckExpiresAt(now)"));
});
test("API responses are no-store; media upload approval remains DISABLED",()=>{
  assert(source.includes("const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false;"));
  const boundaries=[
    ['app.get(\n  "/api/identity/status"', 'app.post(\n  "/api/identity/verify"'],
    ['app.post(\n  "/api/identity/verify"', "function identityAdminTimestampIso("],
    ['app.get(\n  "/api/admin/identity/reviews"', 'app.post(\n  "/api/admin/identity/reviews/:uid/decision"'],
    ['app.post(\n  "/api/admin/identity/reviews/:uid/decision"', 'app.post(\n  "/api/admin/assistance/requests/:requestId/start-review"'],
  ];
  for(const [a,b] of boundaries){
    const i=source.indexOf(a),j=source.indexOf(b,i+a.length);
    assert(i>=0&&j>i);
    assert(source.slice(i,j).includes('response.set?.("Cache-Control", "private, no-store, max-age=0")'));
  }
  assert(!source.includes('console.error(\n      "Firebase token verification failed:",\n      error?.message'));
  assert(!aiSource.includes('logging.exception("Face comparison engine error")'));
});
