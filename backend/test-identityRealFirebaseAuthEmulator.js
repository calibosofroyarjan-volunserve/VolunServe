"use strict";
/*
 * Authenticated integration: real Firebase Auth emulator ID token, production
 * requireFirebaseUser middleware, production Resident status Express route,
 * and production automatic-completion Firestore transaction.
 *
 * Strict LOCAL 127.0.0.1 Auth + Firestore emulators and demo project only.
 * No production credentials, images, Cloudinary, PSA or hosted requests.
 */
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const crypto=require("node:crypto");
const express=require("express");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {isVerifiedFirebaseToken,isCompletedVolunServeProfile}=require("./verifiedFirebaseToken");
const {assessAutomaticIdentityApproval}=require("./identityAutoApprovalGateway");
const {resolveTrustedAutomaticCompletion}=require("./identityTrustedAutomaticCompletion");
const {createTrustedSignedValidators}=require("./identityTrustedSignedProof");

const PROJECT="demo-volunserve-trusted-auto-only";
if(process.env.GCLOUD_PROJECT!==PROJECT ||
   process.env.FIREBASE_PROJECT_ID!==PROJECT ||
   process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8180" ||
   process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9199" ||
   ["FIREBASE_SERVICE_ACCOUNT_JSON","GOOGLE_APPLICATION_CREDENTIALS",
    "FIREBASE_TOKEN","GCLOUD_ACCESS_TOKEN","GOOGLE_OAUTH_ACCESS_TOKEN"]
    .some(k=>Boolean(process.env[k]))) {
  throw Error("UNSAFE QA PROJECT OR EMULATOR: refusing production access");
}

const appAdmin=initializeApp({projectId:PROJECT},"qa-real-auth-status");
const auth=getAuth(appAdmin);
const db=getFirestore(appAdmin);
const backend=fs.readFileSync("backend/server.js","utf8");
const middlewareStart=backend.indexOf("function getBearerToken(");
const middlewareEnd=backend.indexOf("function makeHttpError(",middlewareStart);
const statusStart=backend.indexOf('app.get(\n  "/api/identity/status",');
const statusEnd=backend.indexOf("\n);\napp.post(",statusStart);
assert(middlewareStart>0 && middlewareEnd>middlewareStart &&
       statusStart>0 && statusEnd>statusStart,
  "Production auth middleware or status endpoint missing");

const app=express();
const context={
  app,auth,db,
  isVerifiedFirebaseToken,isCompletedVolunServeProfile,
  loadUserProfile:async uid=>{
    const snapshot=await db.collection("users").doc(uid).get();
    if(!snapshot.exists){
      const error=new Error("profile_not_found");
      error.statusCode=404;
      throw error;
    }
    return snapshot.data();
  },
  normalizeIdentityStatus:value=>String(value||"basic").toLowerCase(),
  cleanText:(value,length)=>String(value||"").slice(0,length),
  numberOrNull:value=>typeof value==="number"&&Number.isFinite(value)?value:null,
  identityAttemptCount:value=>Number.isSafeInteger(Number(value))?
    Math.max(0,Math.min(3,Number(value))):0,
  normalizeIdDocumentScreening:v=>v||{},
  MAX_IDENTITY_AI_ATTEMPTS:3,
  console:{error:()=>{}},
};
vm.runInNewContext(
  backend.slice(middlewareStart,middlewareEnd)+"\n"+
  backend.slice(statusStart,statusEnd+"\n);".length),
  context,{timeout:2000});

let server;
async function ensureLocalServer(){
  if(server)return server;
  server=await new Promise((resolve,reject)=>{
    const listening=app.listen(0,"127.0.0.1");
    listening.once("error",reject);
    listening.once("listening",()=>resolve(listening));
  });
  return server;
}
after(async()=>{
  if(server)await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  await deleteApp(appAdmin);
});
function localUrl(){
  return "http://127.0.0.1:"+server.address().port+"/api/identity/status";
}
async function requestStatus(token){
  await ensureLocalServer();
  const response=await fetch(localUrl(),{
    headers:token?{Authorization:"Bearer "+token}:{},
    signal:AbortSignal.timeout(8000),
  });
  return {status:response.status,body:await response.json()};
}
let sequence=0;
async function createAccount({verifiedEmail=true,approvedProfile=true}={}){
  const i=String(++sequence).padStart(3,"0");
  const uid="qaFirebaseAuthResident"+i;
  const email="qa"+i+"@example.invalid";
  const password="SyntheticTestPassword!123456";
  await auth.createUser({uid,email,password,emailVerified:verifiedEmail});
  if(approvedProfile){
    await db.collection("users").doc(uid).set({
      role:"resident",status:"approved",
      identityVerified:false,identityStatus:"basic",
    });
  }
  const target=new URL(
    "http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
  );
  target.searchParams.set("key","firebase-demo-emulator-only");
  assert.equal(target.hostname,"127.0.0.1");
  const response=await fetch(target,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({email,password,returnSecureToken:true}),
    signal:AbortSignal.timeout(10000),
  });
  assert.equal(response.status,200,"Real Firebase Auth emulator did not issue a token");
  const body=await response.json();
  assert.equal(body.localId,uid);
  assert.equal(typeof body.idToken,"string");
  return {uid,token:body.idToken};
}
test("local Auth endpoint refuses a request without a Firebase ID token",async()=>{
  const result=await requestStatus(null);
  assert.equal(result.status,401);
  assert.equal(result.body.error,"unauthenticated");
});
test("local Auth endpoint refuses an invalid Firebase ID token",async()=>{
  const result=await requestStatus("invalid-token-not-a-jwt");
  assert.equal(result.status,401);
  assert.equal(result.body.error,"invalid_token");
});
test("real Firebase sign-in token without verified email is denied",async()=>{
  const person=await createAccount({verifiedEmail:false});
  const result=await requestStatus(person.token);
  assert.equal(result.status,403);
  assert.equal(result.body.error,"email_not_verified");
});
test("verified email but incomplete VolunServe registration is denied",async()=>{
  const person=await createAccount({approvedProfile:false});
  const result=await requestStatus(person.token);
  assert.equal(result.status,403);
  assert.equal(result.body.error,"registration_incomplete");
});
test("real Firebase verified email and approved Resident can read their Basic status",async()=>{
  const person=await createAccount();
  const result=await requestStatus(person.token);
  assert.equal(result.status,200);
  assert.equal(result.body.identityStatus,"basic");
  assert.equal(result.body.identityVerified,false);
});

const TX_START='      const outcome = await db.runTransaction(async (transaction) => {';
const TX_END='      });\n      evidenceCommitted = true;';
const begin=backend.indexOf(TX_START);
const end=backend.indexOf(TX_END,begin+TX_START.length);
assert(begin>0 && end>begin,"Actual backend automatic promotion transaction not found");
const transactionSrc=backend.slice(begin,end+'      });'.length);
assert(transactionSrc.includes("identityVerified: autoCompletion.eligible"));
assert(transactionSrc.includes('db.collection("identityAutomationEvents")'));

const countPolicy=backend.match(/function identityAttemptCount\(value\) \{[\s\S]*?\n\}\n\nfunction identityAttemptOutcome\(decision, attempts\) \{[\s\S]*?\n\}/);
assert(countPolicy,"Current retry policy unavailable");
const policies=vm.runInNewContext(
  countPolicy[0]+"\n({identityAttemptCount,identityAttemptOutcome})",
  {MAX_IDENTITY_AI_ATTEMPTS:3});
const b64=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
async function applyActualAutomaticTransaction(uid,{faceOnly=false}={}){
  const verificationId="qaAuthVerification"+uid.slice(-3);
  const requestId="qaAuthCapture"+uid.slice(-3);
  const issuer=crypto.generateKeyPairSync("ed25519");
  const pad=crypto.generateKeyPairSync("ed25519");
  const now=Math.floor(Date.now()/1000);
  const sign=(kind,key)=>{
    const payload={
      iss:kind==="issuer"?"SyntheticGovernmentIssuer":"SyntheticAntiSpoofProvider",
      aud:"volunserve-trusted-identity-v1",sub:uid,
      requestId,verificationId,documentType:"national_id",proofType:kind,
      proofKind:kind==="issuer"?"trusted_independent_issuer":
        "validated_presentation_attack_detection",
      jti:"syntheticSignedCapture"+uid.slice(-3),
      iat:now-5,exp:now+120,
      [kind==="issuer"?"documentGenuine":"livePersonConfirmed"]:true,
    };
    const hdr={alg:"EdDSA",typ:"JWT",
      kid:kind==="issuer"?"syntheticIssuerKey":"syntheticPADKey"};
    const payloadToSign=b64(hdr)+"."+b64(payload);
    return payloadToSign+"."+
      crypto.sign(null,Buffer.from(payloadToSign),key.privateKey).toString("base64url");
  };
  const validators=createTrustedSignedValidators({
    uid,requestId,verificationId,documentType:"national_id",
    issuerToken:sign("issuer",issuer),padToken:sign("pad",pad),
    issuerKeyPem:issuer.publicKey.export({type:"spki",format:"pem"}),
    padKeyPem:pad.publicKey.export({type:"spki",format:"pem"}),
    issuerName:"SyntheticGovernmentIssuer",
    padName:"SyntheticAntiSpoofProvider",
    issuerKeyId:"syntheticIssuerKey",padKeyId:"syntheticPADKey",
  });
  const documentScreening={
    status:"text_consistent_unverified",declaredIdType:"national_id",
    detectedIdType:"national_id",backSideScreened:true,
    imageQualityStatus:"adequate",profileNameCheck:"possible_match",
    profileBirthDateCheck:"possible_match",warningCodes:[]
  };
  const newEvidenceAssets={};
  for(const slot of ["front","back","selfie"]){
    newEvidenceAssets[slot]={
      publicId:"volunserve/identity-private/"+uid+"/"+requestId+"/"+slot,
      resourceType:"image",deliveryType:"authenticated",format:"jpg",
    };
  }
  const automaticApproval=await assessAutomaticIdentityApproval({
    screening:documentScreening,
    face:{result:"match",algorithmValidated:true,calibrationValidated:true,
      samePersonAssertion:true,verificationId},
    attempt:{uid,verificationId,freshCapture:true,consentedEvidenceAvailable:true},
    ...validators,
  });
  const autoCompletion=resolveTrustedAutomaticCompletion({
    enabled:true,faceOnly,assessment:automaticApproval,
    uid,requestId,verificationId,screening:documentScreening,
    assets:newEvidenceAssets,aiDecision:"manual_review",
  });
  const userRef=db.collection("users").doc(uid);
  const verificationRef=db.collection("identityVerifications").doc(uid);
  const evidenceRef=db.collection("identityPrivateEvidence").doc(uid);
  await verificationRef.set({processingRequestId:requestId,aiAttemptCount:0,aiAttemptCycle:1});
  const ctx={
    db:{collection:name=>db.collection(name),
      runTransaction:callback=>db.runTransaction(tx=>Promise.resolve(callback(tx)))},
    userRef,verificationRef,evidenceRef,
    uid,requestId,verificationId,documentScreening,newEvidenceAssets,
    autoCompletion,automaticApproval,
    previousEvidenceAssets:null,
    decision:"manual_review",faceOnly,faceComparisonPassed:faceOnly,
    recognizedSelectedId:true,
    reviewTrack:faceOnly?"face_only_admin_review":"standard_admin_review",
    matchScore:0.93,livenessScore:null,aiResult:{},
    MAX_IDENTITY_AI_ATTEMPTS:3,
    identityAttemptCount:policies.identityAttemptCount,
    identityAttemptOutcome:policies.identityAttemptOutcome,
    diditCleanupFields:()=>({}),
    cleanText:(v,n)=>String(v||"").slice(0,n),
    identityEvidenceRetentionDate:()=>new Date(Date.now()+86400000),
    FieldValue,
    makeHttpError:(status,code,message)=>{
      const error=new Error(message);error.statusCode=status;error.code=code;
      return error;
    },
  };
  const result=await vm.runInNewContext(
    "(async()=>{\n"+transactionSrc+"\nreturn outcome;\n})()",
    ctx,{timeout:3000});
  return {result,requestId,
    audit:await db.collection("identityAutomationEvents").doc(uid+"_"+requestId).get()};
}
test("REAL Firebase token -> trusted automatic Firestore transaction -> authenticated Verified status",async()=>{
  const person=await createAccount();
  const before=await requestStatus(person.token);
  assert.equal(before.body.identityVerified,false);
  const applied=await applyActualAutomaticTransaction(person.uid);
  assert.equal(applied.result.automaticVerificationApplied,true);
  assert.equal(applied.audit.exists,true);
  const after=await requestStatus(person.token);
  assert.equal(after.status,200);
  assert.equal(after.body.identityStatus,"verified");
  assert.equal(after.body.identityVerified,true);
});
test("REAL Firebase token -> face-only comparison -> authenticated Pending Admin Review",async()=>{
  const person=await createAccount();
  const applied=await applyActualAutomaticTransaction(person.uid,{faceOnly:true});
  assert.equal(applied.result.automaticVerificationApplied,false);
  assert.equal(applied.audit.exists,false);
  const status=await requestStatus(person.token);
  assert.equal(status.status,200);
  assert.equal(status.body.identityVerified,false);
  assert.equal(status.body.identityStatus,"pending");
});
test("one Resident ID token cannot read another Resident's Verified status",async()=>{
  const first=await createAccount();
  const second=await createAccount();
  await applyActualAutomaticTransaction(first.uid);
  const secondStatus=await requestStatus(second.token);
  assert.equal(secondStatus.status,200);
  assert.equal(secondStatus.body.identityStatus,"basic");
  assert.equal(secondStatus.body.identityVerified,false);
});
