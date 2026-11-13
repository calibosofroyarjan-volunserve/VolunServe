"use strict";
/**
 * REAL Firebase Auth + Firestore EMULATORS, real signed-in emulator ID
 * tokens, and the unchanged identity middleware/routes extracted from
 * backend/server.js. All accounts, documents and attestations are FICTIONAL.
 *
 * Not a deployed staging browser test, not an issuer check, not PAD, and
 * never a real identity approval. No service account, live Firebase or Render.
 */
const {test, before, after} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const express = require("express");
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getProfileRole,isApprovedAccount,isOperationalAdminProfile} = require("./adminAccess");
const {isVerifiedFirebaseToken,isCompletedVolunServeProfile} = require("./verifiedFirebaseToken");
const {selectedIdRecognized} = require("./selectedIdPolicy");
const {reviewIssuerEvidence} = require("./identityIssuerReviewPolicy");

const PROJECT = "demo-volunserve-identity-e2e";
const AUTH_HOST = "127.0.0.1:9099";
const FIRESTORE_HOST = "127.0.0.1:8080";
function assertIsolatedEmulators() {
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,AUTH_HOST,
    "REFUSED: the Firebase Auth emulator must be local and explicit");
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,FIRESTORE_HOST,
    "REFUSED: the Firestore emulator must be local and explicit");
  assert.equal(process.env.GCLOUD_PROJECT,PROJECT,
    "REFUSED: only a no-resource demo project is allowed");
  assert.equal(process.env.FIREBASE_SERVICE_ACCOUNT_JSON,undefined,
    "REFUSED: this test must never use a service account");
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS,undefined,
    "REFUSED: this test must never use cloud credentials");
}
assertIsolatedEmulators();

const serverSource=fs.readFileSync("backend/server.js","utf8");
function segment(first,last) {
  const start=serverSource.indexOf(first);
  const end=serverSource.indexOf(last,start+first.length);
  assert(start>=0 && end>start, "Actual server handler not found: "+first);
  return serverSource.slice(start,end);
}
const normalizeIdDocumentScreening=vm.runInNewContext(
  segment("function normalizeIdDocumentScreening(value) {","\nfunction numberOrNull(")+
  "\nnormalizeIdDocumentScreening",{}
);

// Use real Firebase emulator tokens with the *original* auth/role middleware;
// unlike older synthetic tests, viewer UIDs cannot be passed in request body.
const actualAuth=segment("function getBearerToken(","function makeHttpError(");
const actualProfile=segment("async function loadUserProfile(","async function requireVerifiedResident(");
const actualAdminAuth=segment("async function requireOperationalAdmin(","function isVerifiedLguPersonnelProfile(");
const actualStatus=segment('app.get(\n  "/api/identity/status"', 'app.post(\n  "/api/identity/verify"');
const actualAdminRoutes=segment("function identityAdminTimestampIso(value) {",
  'app.post(\n  "/api/admin/assistance/requests/:requestId/start-review"');
const actualMediaGate=segment("const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false;",
  "const MAX_IDENTITY_AI_ATTEMPTS = 3;");

const names={
  admin:"admin_emulator_001",
  resident:"resident_emulator_001",
  retry:"volunteer_emulator_001",
  inactive:"inactive_emulator_001",
  unverified:"unverified_emulator_001",
  guest:"guest_emulator_001",
};
const pw="EmulatorOnlyNoRealPassword_2026!";
const safeBase={
  declaredIdType:"passport",detectedIdType:"passport",
  status:"text_consistent_unverified",warningCodes:[],
  imageQualityStatus:"adequate",backImageQualityStatus:"not_required",
  backSideProvided:false,backSideScreened:false,
  passportMrzCheck:"checksum_consistent_unverified",
  passportMrzBirthDateCheck:"possible_match",
  passportMrzCheckDigitsConsistent:true,
  profileBirthDateCheck:"possible_match",profileNameCheck:"possible_match",
};
let firebaseApp, firebaseAuth, db, server, baseUrl;
const tokens={};

function createActualHandlers(app) {
  const silentConsole={error:()=>{},warn:()=>{},log:()=>{}};
  const sandbox={
    app,auth:firebaseAuth,db,FieldValue,
    isVerifiedFirebaseToken,isCompletedVolunServeProfile,
    classifyStagingFirestoreFailure:()=> "emulator_only",
    isOperationalAdminProfile,getProfileRole,isApprovedAccount,
    selectedIdRecognized,reviewIssuerEvidence,normalizeIdDocumentScreening,
    normalizeIdentityStatus:value=>["pending","verified","failed"].includes(value)?value:"basic",
    cleanText:(x,n=200)=>String(x ?? "").trim().slice(0,n),
    numberOrNull:x=>(x===null||x===undefined||x==="")?null:(Number.isFinite(Number(x))?Number(x):null),
    identityAttemptCount:x=>Number.isSafeInteger(x)&&x>0?Math.min(x,3):0,
    MAX_IDENTITY_AI_ATTEMPTS:3,
    makeHttpError:(statusCode,code,message)=>Object.assign(new Error(message),{statusCode,code}),
    console:silentConsole,
  };
  vm.runInNewContext(
    actualMediaGate+actualProfile+actualAuth+actualAdminAuth+
    actualStatus+actualAdminRoutes,sandbox,
    {filename:"actual_backend_identity_routes_emulator.js",timeout:7000}
  );
  // Test ONLY the literal media gate from actual backend/server.js.
  app.post("/emulator-test/identity-media",
    sandbox.requireFirebaseUser,sandbox.requireStagingIdentityMediaApproval,
    (_req,res)=>res.status(500).json({error:"media_gate_bypassed"}));
}
async function emulatorSignIn(email) {
  const endpoint="http://"+AUTH_HOST+"/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only";
  const response=await fetch(endpoint,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,password:pw,returnSecureToken:true}),
  });
  assert.equal(response.status,200, "Emulator sign-in failed for synthetic user");
  const body=await response.json();
  assert.ok(typeof body.idToken==="string" && body.idToken.length>40);
  return body.idToken;
}
async function req(method,path,token,body=undefined){
  assert.ok(path.startsWith("/api/")||path.startsWith("/emulator-test/"));
  const response=await fetch(baseUrl+path,{
    method,headers:{
      ...(token?{Authorization:"Bearer "+token}:{}),
      ...(body?{"Content-Type":"application/json"}:{}),
    },
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  const output=await response.json();
  return {code:response.status,body:output};
}
async function reviews(token){return req("GET","/api/admin/identity/reviews",token);}
async function status(token){return req("GET","/api/identity/status",token);}
async function decision(token,uid,action,extra={}){
  return req("POST","/api/admin/identity/reviews/"+uid+"/decision",token,{
    action,validationMethod:"official_document_check",
    issuerReviewAttested:true,
    notes:"Emulator-only fictional attestation; no real issuer validation.",
    ...extra,
  });
}
async function insertPending(uid,documentScreening=safeBase){
  await db.collection("identityVerifications").doc(uid).set({
    uid,verificationId:"fictional_verification_"+uid,
    status:"pending",requiresManualReview:true,
    aiDecision:"manual_review",decision:"manual_review",
    aiAttemptCount:2,matchScore:0.8,livenessScore:null,
    documentScreening,createdAt:FieldValue.serverTimestamp(),
    updatedAt:FieldValue.serverTimestamp(),
  });
}

before(async()=>{
  firebaseApp=initializeApp({projectId:PROJECT},"identity-emulator-only");
  firebaseAuth=getAuth(firebaseApp);
  db=getFirestore(firebaseApp);
  const profiles={
    admin:{role:"admin",status:"approved",adminStatus:"approved",fullName:"Fictional LGU Admin"},
    resident:{role:"resident",status:"approved",residentAccess:true,
      identityStatus:"pending",identityVerified:false,fullName:"Fictional Resident"},
    retry:{role:"volunteer",status:"approved",residentAccess:true,
      identityStatus:"pending",identityVerified:false,fullName:"Fictional Volunteer"},
    inactive:{role:"admin",status:"suspended",fullName:"Fictional Suspended Admin"},
    unverified:{role:"resident",status:"approved",residentAccess:true,
      identityStatus:"pending",identityVerified:false,fullName:"Unverified Mailbox"},
    guest:{role:"guest",status:"pending",fullName:"Incomplete Account"},
  };
  for(const [kind,uid] of Object.entries(names)){
    const email=kind+"@example.invalid";
    await firebaseAuth.createUser({uid,email,password:pw,emailVerified:kind!=="unverified"});
    await db.collection("users").doc(uid).set({...profiles[kind],email,uid});
    tokens[kind]=await emulatorSignIn(email);
  }
  await insertPending(names.resident);
  await insertPending(names.retry,{
    ...safeBase, passportMrzCheck:"checksum_inconsistent_or_ocr_error",
    warningCodes:["passport_mrz_conflict"],
  });
  const app=express();
  app.use(express.json({limit:"16kb"}));
  createActualHandlers(app);
  server=await new Promise((resolve,reject)=>{
    const listener=app.listen(0,"127.0.0.1",()=>resolve(listener));
    listener.once("error",reject);
  });
  baseUrl="http://127.0.0.1:"+server.address().port;
});

after(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(firebaseApp)await deleteApp(firebaseApp);
});

test("Auth emulator tokens are checked by original Firebase middleware",async()=>{
  assert.equal((await status()).code,401);
  assert.equal((await status("invalid-not-a-token")).code,401);
  const unverified=await status(tokens.unverified);
  assert.equal(unverified.code,403);
  assert.equal(unverified.body.error,"email_not_verified");
  const guest=await status(tokens.guest);
  assert.equal(guest.code,403);
  assert.equal(guest.body.error,"registration_incomplete");
  const own=await status(tokens.resident);
  assert.equal(own.code,200);
  assert.equal(own.body.identityStatus,"pending");
  assert.equal(own.body.identityVerified,false);
});

test("Real Admin role middleware enforces persisted Firestore role, not client claims",async()=>{
  assert.equal((await reviews()).code,401);
  assert.equal((await reviews(tokens.resident)).code,403);
  assert.equal((await reviews(tokens.inactive)).code,403);
  const admin=await reviews(tokens.admin);
  assert.equal(admin.code,200);
  assert.equal(admin.body.ok,true);
  assert.equal(admin.body.items.length,2);
  assert.equal(admin.body.items.find(x=>x.uid===names.resident).requiresManualReview,true);
  assert.equal(admin.body.items.find(x=>x.uid===names.resident).identityVerified,false);
});

test("Staging identity media remains locked BEFORE any image handler",async()=>{
  const response=await req("POST","/emulator-test/identity-media",tokens.resident);
  assert.equal(response.code,423);
  assert.equal(response.body.error,"staging_identity_media_disabled");
});

test("Authenticated Resident -> Admin Verify -> Firestore -> Resident status",async()=>{
  const unauthorized=await decision(tokens.resident,names.resident,"verify");
  assert.equal(unauthorized.code,403);
  let beforeStatus=await status(tokens.resident);
  assert.equal(beforeStatus.body.identityStatus,"pending");
  const approved=await decision(tokens.admin,names.resident,"verify");
  assert.equal(approved.code,200,JSON.stringify(approved.body));
  assert.equal(approved.body.identityVerified,true);
  const residentAfter=await status(tokens.resident);
  assert.equal(residentAfter.code,200);
  assert.equal(residentAfter.body.identityVerified,true);
  assert.equal(residentAfter.body.identityStatus,"verified");
  assert.equal(residentAfter.body.decision,"verified");
  assert.equal(residentAfter.body.padValidated,false);
  const stored=await db.collection("users").doc(names.resident).get();
  assert.equal(stored.data().identityVerified,true);
  assert.equal(stored.data().identityVerifiedBy,names.admin);
  assert.equal((await decision(tokens.admin,names.resident,"verify")).code,409);
});

test("Conflicting evidence cannot Verify; Require Retry updates status and audit",async()=>{
  assert.equal((await decision(tokens.admin,names.retry,"verify")).code,409);
  const retry=await decision(tokens.admin,names.retry,"require_retry",{
    issuerReviewAttested:false,validationMethod:"",
    notes:"Emulator-only rescan required; fictional mismatched MRZ.",
  });
  assert.equal(retry.code,200,JSON.stringify(retry.body));
  assert.equal(retry.body.identityVerified,false);
  const resident=await status(tokens.retry);
  assert.equal(resident.body.identityStatus,"failed");
  assert.equal(resident.body.decision,"retry_required");
  assert.equal(resident.body.attemptCount,0);
  assert.equal((await decision(tokens.admin,names.retry,"require_retry")).code,409);
  const snapshot=await db.collection("users").doc(names.retry).get();
  assert.equal(snapshot.data().identityVerified,false);
  assert.equal(snapshot.data().identityStatus,"failed");
});

test("Admin queue & audit reflect ONLY original authorized transactions",async()=>{
  const queue=await reviews(tokens.admin);
  assert.equal(queue.code,200);
  const verified=queue.body.items.find(x=>x.uid===names.resident);
  const retry=queue.body.items.find(x=>x.uid===names.retry);
  assert.equal(verified.manualReviewDecision,"verified");
  assert.equal(verified.identityVerified,true);
  assert.equal(retry.manualReviewDecision,"retry_required");
  assert.equal(retry.identityVerified,false);
  const logs=await db.collection("adminActivityLogs").get();
  assert.equal(logs.size,2);
  const types=logs.docs.map(doc=>doc.data().action).sort();
  assert.deepEqual(types,["Resident Identity Manually Verified","Resident Identity Retry Required"]);
  for(const doc of logs.docs){
    assert.equal(doc.data().performedBy,names.admin);
  }
  const responseStrings=JSON.stringify(queue.body);
  for(const forbidden of ["rawMrz","untrustedSelfieBytes","privateKey","idDocumentBytes"]){
    assert.equal(responseStrings.includes(forbidden),false);
  }
});
