"use strict";

/**
 * Executes the EXACT identity submission Firestore transaction callback from
 * backend/server.js against a synthetic, in-memory atomic Firestore.
 *
 * No Firebase Auth, real residents, images, Cloudinary, PSA or Render writes.
 * This is not a hosted credentialed E2E or clinical biometric validation.
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const crypto=require("node:crypto");
const {assessAutomaticIdentityApproval}=require("./identityAutoApprovalGateway");
const {resolveTrustedAutomaticCompletion}=require("./identityTrustedAutomaticCompletion");
const {createTrustedSignedValidators}=require("./identityTrustedSignedProof");

const uid="syntheticResident123";
const verificationId="syntheticVerification123";
const requestId="syntheticRequest123";
const NOW=1760000000000;
const issuerKey=crypto.generateKeyPairSync("ed25519");
const padKey=crypto.generateKeyPairSync("ed25519");
const signing=kind=>kind==="issuer"?issuerKey:padKey;
const expectedIssuer=kind=>kind==="issuer"?"SyntheticGovIssuer123":"SyntheticPADProvider123";
const keyId=kind=>kind==="issuer"?"issuerKey123":"padKey123";
const jwtPart=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
function signedProof(kind,patch={}){
  const payload={
    iss:expectedIssuer(kind),aud:"volunserve-trusted-identity-v1",
    sub:uid,verificationId,requestId,documentType:"national_id",
    proofType:kind,
    proofKind:kind==="issuer"?"trusted_independent_issuer":"validated_presentation_attack_detection",
    jti:"syntheticProofId123",iat:Math.floor(NOW/1000)-5,
    exp:Math.floor(NOW/1000)+120,...patch,
  };
  payload[kind==="issuer"?"documentGenuine":"livePersonConfirmed"]=true;
  const input=jwtPart({alg:"EdDSA",typ:"JWT",kid:keyId(kind)})+"."+jwtPart(payload);
  return input+"."+crypto.sign(null,Buffer.from(input),signing(kind).privateKey).toString("base64url");
}
const screening=()=>({
  status:"text_consistent_unverified",declaredIdType:"national_id",
  detectedIdType:"national_id",imageQualityStatus:"adequate",
  profileNameCheck:"possible_match",profileBirthDateCheck:"possible_match",
  backSideScreened:true,warningCodes:[],
});
const media=slot=>({publicId:"volunserve/identity-private/"+uid+"/"+requestId+"/"+slot,
  resourceType:"image",deliveryType:"authenticated",format:"jpg"});
const photos=()=>({front:media("front"),back:media("back"),selfie:media("selfie")});
const face=()=>({result:"match",algorithmValidated:true,
  calibrationValidated:true,samePersonAssertion:true,verificationId});
const issuerPad=()=>createTrustedSignedValidators({
  issuerToken:signedProof("issuer"),
  padToken:signedProof("pad"),
  uid,verificationId,requestId,documentType:"national_id",
  issuerKeyPem:issuerKey.publicKey.export({type:"spki",format:"pem"}),
  padKeyPem:padKey.publicKey.export({type:"spki",format:"pem"}),
  issuerName:expectedIssuer("issuer"),padName:expectedIssuer("pad"),
  issuerKeyId:keyId("issuer"),padKeyId:keyId("pad"),nowMs:NOW,
});

const server=fs.readFileSync("backend/server.js","utf8");
const START='      const outcome = await db.runTransaction(async (transaction) => {';
const STOP='      });\n      evidenceCommitted = true;';
const start=server.indexOf(START);
const end=server.indexOf(STOP,start+START.length);
assert(start>0&&end>start&&server.indexOf(START,start+1)===-1,
  "Fail closed: exact identity transaction boundary must be unique");
const actualTransaction=server.slice(start,end+'      });'.length);
assert(actualTransaction.includes("identityVerified: autoCompletion.eligible"));
assert(actualTransaction.includes('db.collection("identityAutomationEvents")'));
assert(actualTransaction.includes('current.processingRequestId !== requestId'));

const policySource=server.match(/function identityAttemptCount\(value\) \{[\s\S]*?\n\}\n\nfunction identityAttemptOutcome\(decision, attempts\) \{[\s\S]*?\n\}/);
assert(policySource,"Production identity attempt policy source missing");
const policy=vm.runInNewContext(policySource[0]+
  "\n({identityAttemptCount,identityAttemptOutcome})",{MAX_IDENTITY_AI_ATTEMPTS:3});

const DELETE=Symbol("deleteSentinel");
function makeDb(lease=requestId,verified=false,userExists=true){
  const store={
    users:userExists?{[uid]:{identityStatus:verified?"verified":"basic",identityVerified:verified}}:{},
    identityVerifications:{[uid]:{processingRequestId:lease,aiAttemptCount:0,aiAttemptCycle:1}},
    identityPrivateEvidence:{},
    identityVerificationAttempts:{},
    identityAutomationEvents:{},
    identityTrustedProofUses:{},
  };
  const writes=[];
  const db={
    collection(name){return {doc(key){return {collection:name,id:key,
      get:async()=>{const value=store[name]?.[key];return {exists:value!==undefined,data:()=>value};}
    };}};},
    async runTransaction(fn){
      const staged=[];
      const tx={
        async get(ref){
          const data=store[ref.collection]?.[ref.id];
          return {exists:data!==undefined,data:()=>data};
        },
        set(ref,value,{merge}={}){
          staged.push({mode:"set",ref,value,merge});
        },
        create(ref,value){
          staged.push({mode:"create",ref,value});
        },
        delete(ref){staged.push({mode:"delete",ref});},
      };
      const result=await fn(tx);
      for(const x of staged){
        store[x.ref.collection] ||= {};
        const collection=store[x.ref.collection];
        if(x.mode==="create"){
          assert(!Object.hasOwn(collection,x.ref.id),
            "Synthetic Firestore create() cannot overwrite an existing audit record");
        }
        if(x.mode==="delete"){delete collection[x.ref.id];continue;}
        const old=x.merge?(collection[x.ref.id]||{}):{};
        const combined={...old,...x.value};
        for(const [key,value] of Object.entries(combined)){
          if(value===DELETE)delete combined[key];
        }
        collection[x.ref.id]=combined;
      }
      writes.push(...staged);
      return result;
    },
  };
  return {store,writes,db};
}
async function runScenario({
  enabled=false,faceOnly=false,withoutIssuer=false,
  badFace=false,badId=false,badSelfie=false,badPad=false,
  lease=requestId,verified=false,userExists=true,decision="manual_review",
}={}){
  const data=makeDb(lease,verified,userExists);
  const documentScreening=screening();
  if(badId)documentScreening.status="mismatch";
  const newEvidenceAssets=photos();
  if(badSelfie)newEvidenceAssets.selfie.publicId="volunserve/identity-private/otherResident123/stale/selfie";
  const attempt={uid,verificationId,freshCapture:true,consentedEvidenceAvailable:true};
  const fakeFace=face();
  if(badFace)fakeFace.calibrationValidated=false;
  const adapters=issuerPad();
  const trustedAdapters=withoutIssuer?{padValidator:adapters.padValidator}
    :badPad?{issuerValidator:adapters.issuerValidator,
        padValidator:async()=>{throw new Error("PAD provider offline");}}
    :adapters;
  const automaticApproval=await assessAutomaticIdentityApproval({
    screening:documentScreening,face:fakeFace,attempt,...trustedAdapters,
  });
  const autoCompletion=resolveTrustedAutomaticCompletion({
    enabled,faceOnly,assessment:automaticApproval,
    uid,requestId,verificationId,screening:documentScreening,
    assets:newEvidenceAssets,aiDecision:decision,
  });
  const proofReplayRefs=autoCompletion.eligible ? {
    issuer:data.db.collection("identityTrustedProofUses")
      .doc(autoCompletion.trustedProofReplayKeys.issuer),
    pad:data.db.collection("identityTrustedProofUses")
      .doc(autoCompletion.trustedProofReplayKeys.pad),
  }:null;
  const FieldValue={
    serverTimestamp:()=>({syntheticTimestamp:true}),
    delete:()=>DELETE
  };
  const ctx={
    db:data.db,
    userRef:data.db.collection("users").doc(uid),
    verificationRef:data.db.collection("identityVerifications").doc(uid),
    evidenceRef:data.db.collection("identityPrivateEvidence").doc(uid),
    userSnapshot:null,verificationSnapshot:null,
    previousEvidenceAssets:null,
    uid,requestId,verificationId,newEvidenceAssets,
    autoCompletion,automaticApproval,documentScreening,proofReplayRefs,
    recognizedSelectedId:!badId,faceOnly,faceComparisonPassed:faceOnly,
    decision,reviewTrack:faceOnly?"face_only_admin_review":"standard_admin_review",
    matchScore:0.9,livenessScore:null,aiResult:{},
    MAX_IDENTITY_AI_ATTEMPTS:3,
    identityAttemptCount:policy.identityAttemptCount,
    identityAttemptOutcome:policy.identityAttemptOutcome,
    diditCleanupFields:()=>({}),
    cleanText:(v,n)=>String(v||"").slice(0,n),
    identityEvidenceRetentionDate:()=>({syntheticRetention:true}),
    FieldValue,
    makeHttpError:(statusCode,code,message)=>{
      const e=new Error(message);e.statusCode=statusCode;e.code=code;return e;
    },
  };
  // Async real source executes with a synthetic context; only staged writes
  // from a completed callback are visible, matching Firestore atomicity.
  const outcome=await vm.runInNewContext(
    "(async()=>{\n"+actualTransaction+"\nreturn outcome;\n})()",
    ctx,{timeout:2000});
  return {outcome,data,automaticApproval,autoCompletion};
}
test("signed independent ID+PAD and validated face -> atomic Verified Resident + durable audit",async()=>{
  const {data,outcome,automaticApproval}=await runScenario({enabled:true});
  assert.equal(automaticApproval.eligible,true);
  assert.equal(outcome.status,"verified");
  assert.equal(outcome.identityVerified,undefined);
  assert.equal(outcome.automaticVerificationApplied,true);
  assert.equal(data.store.users[uid].identityStatus,"verified");
  assert.equal(data.store.users[uid].identityVerified,true);
  assert.equal(data.store.users[uid].identityVerifiedBy,"trusted_independent_provider_auto");
  assert.equal(data.store.identityVerifications[uid].status,"verified");
  assert.equal(data.store.identityVerifications[uid].automaticVerificationApplied,true);
  assert.equal(data.store.identityVerificationAttempts[uid+"_"+requestId].status,"verified");
  assert.equal(data.store.identityAutomationEvents[uid+"_"+requestId].decision,"trusted_auto_verified");
  assert.equal(data.writes.filter(x=>x.mode==="create").length,4);
  assert.equal(Object.keys(data.store.identityTrustedProofUses).length,2);
});
test("default-off keeps signed full proof Pending and does not create auto-audit",async()=>{
  const {data,outcome}=await runScenario();
  assert.equal(outcome.status,"pending");
  assert.equal(data.store.users[uid].identityVerified,false);
  assert.equal(data.store.identityVerifications[uid].requiresManualReview,true);
  assert.deepEqual(Object.keys(data.store.identityAutomationEvents),[]);
});
test("the historical face-only flow always stays Admin Review even if test provider signs proof",async()=>{
  const {data,outcome}=await runScenario({enabled:true,faceOnly:true});
  assert.equal(outcome.status,"pending");
  assert.equal(outcome.automaticVerificationApplied,false);
  assert.equal(data.store.users[uid].identityVerified,false);
  assert.equal(data.store.identityVerifications[uid].reviewTrack,"face_only_admin_review");
  assert.equal(Object.keys(data.store.identityAutomationEvents).length,0);
});
for(const [title,changes] of [
  ["missing independent government issuer",{withoutIssuer:true}],
  ["failed or uncalibrated face matcher",{badFace:true}],
  ["unsupported or inconsistent government ID",{badId:true}],
  ["stale or cross-resident selfie",{badSelfie:true}],
  ["PAD provider unavailable",{badPad:true}],
  ["AI comparison failed",{decision:"failed"}]
]){
  test(title+" does not automatically grant Verified status",async()=>{
    const {data,outcome}=await runScenario({enabled:true,...changes});
    assert.equal(data.store.users[uid].identityVerified,false);
    assert.notEqual(outcome.status,"verified");
    assert.equal(data.store.identityVerifications[uid].automaticVerificationApplied,false);
    assert.equal(Object.keys(data.store.identityAutomationEvents).length,0);
  });
}
test("processing lease lost: transaction refuses stale auto-grant and commits no writes",async()=>{
  await assert.rejects(async()=>{
    await runScenario({enabled:true,lease:"anotherRequest123"});
  }, e=>e.code==="identity_request_expired");
});
test("already verified Resident: no duplicate auto grant or second audit record",async()=>{
  await assert.rejects(async()=>runScenario({enabled:true,verified:true}),
    e=>e.code==="identity_account_changed");
});
test("missing Resident profile: no create or grant",async()=>{
  await assert.rejects(async()=>runScenario({enabled:true,userExists:false}),
    e=>e.code==="identity_account_changed");
});


/* Authenticated resident status endpoint: execute its real Express handler,
   with the SAME synthetic database that the identity transaction wrote. */
const STATUS_START='app.get(\n  "/api/identity/status",';
const STATUS_STOP='\n);\napp.post(';
const statusStart=server.indexOf(STATUS_START);
const statusEnd=server.indexOf(STATUS_STOP,statusStart+STATUS_START.length);
assert(statusStart>0&&statusEnd>statusStart,"Actual identity status GET route missing");
const statusRouteSource=server.slice(statusStart,statusEnd+"\n);".length);
async function readResidentStatus(db,loggedInUid){
  let handler;
  vm.runInNewContext(statusRouteSource,{
    app:{get:(path,...handlers)=>{
      assert.equal(path,"/api/identity/status");
      handler=handlers.at(-1);
    }},
    requireFirebaseUser:()=>{},
    db,
    normalizeIdentityStatus:v=>String(v||"basic").toLowerCase(),
    cleanText:(v,n)=>String(v||"").slice(0,n),
    numberOrNull:v=>typeof v==="number"?v:null,
    identityAttemptCount:policy.identityAttemptCount,
    MAX_IDENTITY_AI_ATTEMPTS:3,
    normalizeIdDocumentScreening:v=>v||{},
    console:{error:()=>{}},
  },{timeout:2000});
  assert.equal(typeof handler,"function");
  const response={
    code:200,body:undefined,
    status(x){this.code=x;return this;},
    json(x){this.body=x;return this;},
  };
  await handler({firebaseUser:{uid:loggedInUid}},response);
  return response;
}
test("after trusted automatic transaction, actual Resident status GET shows Verified Resident",async()=>{
  const {data}=await runScenario({enabled:true});
  const response=await readResidentStatus(data.db,uid);
  assert.equal(response.code,200);
  assert.equal(response.body.ok,true);
  assert.equal(response.body.identityStatus,"verified");
  assert.equal(response.body.identityVerified,true);
  assert.equal(response.body.requiresManualReview,false);
});
test("without validated providers, actual Resident status GET remains Pending Admin Review",async()=>{
  const {data}=await runScenario({enabled:true,withoutIssuer:true});
  const response=await readResidentStatus(data.db,uid);
  assert.equal(response.code,200);
  assert.equal(response.body.identityStatus,"pending");
  assert.equal(response.body.identityVerified,false);
  assert.equal(response.body.requiresManualReview,true);
});
test("resident status endpoint cannot return another Resident's identity records",async()=>{
  const {data}=await runScenario({enabled:true});
  const response=await readResidentStatus(data.db,"unrelatedResident456");
  assert.equal(response.code,404);
  assert.equal(response.body.error,"profile_not_found");
});
