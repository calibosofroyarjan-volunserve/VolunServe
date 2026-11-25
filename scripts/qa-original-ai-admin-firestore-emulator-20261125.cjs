"use strict";
/**
 * Offline synthetic Auth + Firestore E2E against the exact deployed VolunServe
 * Admin identity routes and middleware, extracted without modifying server.js.
 * Never start the entire production backend or contact live Google/Render.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {Writable} = require("node:stream");

const EXPECTED_PROJECT = "demo-volunserve-original-ai-admin-qa";
if (process.env.GCLOUD_PROJECT !== EXPECTED_PROJECT &&
    process.env.GOOGLE_CLOUD_PROJECT !== EXPECTED_PROJECT) {
  throw Error("Emulator test blocked: expected explicit DEMO Firebase project");
}
for (const [name,value] of [
  ["FIRESTORE_EMULATOR_HOST",process.env.FIRESTORE_EMULATOR_HOST],
  ["FIREBASE_AUTH_EMULATOR_HOST",process.env.FIREBASE_AUTH_EMULATOR_HOST],
]) {
  if (!/^127\.0\.0\.1:\d+$/.test(value || ""))
    throw Error("Emulator test blocked: missing loopback-only "+name);
}
for (const key of [
  "FIREBASE_SERVICE_ACCOUNT_JSON","GOOGLE_APPLICATION_CREDENTIALS",
  "CLOUDINARY_API_SECRET","PAYMONGO_SECRET_KEY",
  "IDENTITY_AI_INTERNAL_KEY",
]) {
  if (process.env[key]) throw Error("Emulator test blocked: credential in environment: "+key);
}
const {initializeApp,deleteApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore,FieldValue} = require("firebase-admin/firestore");
const express = require("express");
const firebaseApp=initializeApp({projectId:EXPECTED_PROJECT});
const auth=getAuth(firebaseApp);
const db=getFirestore(firebaseApp);
const source = fs.readFileSync(path.join(__dirname,"backend","server.js"),"utf8");
const {isVerifiedFirebaseToken,isCompletedVolunServeProfile} =
  require("./backend/verifiedFirebaseToken");
const {isOperationalAdminProfile} = require("./backend/adminAccess");
const {
  selectedIdRecognized, enforceSelectedIdDecision, classifyIdentityReviewTrack
} = require("./backend/selectedIdPolicy");
const {classifyHybridDocumentPrecheck} = require("./backend/identityHybridPrecheckDecision");
const {assessAutomaticIdentityApproval} = require("./backend/identityAutoApprovalGateway");
const crypto = require("node:crypto");
const {probeIdentityAiReadiness: liveProbeIdentityAiReadiness} =
  require("./backend/identityAiReadiness");
const {reviewIssuerEvidence} = require("./backend/identityIssuerReviewPolicy");
const {
  parseConsentedIdentityEvidence,uploadIdentityEvidence,
  signedIdentityEvidence,identityEvidenceRetentionDate,
  destroyIdentityEvidence,purgeExpiredIdentityEvidence,
} = require("./backend/identityPrivateEvidence");
const evidenceStorage=new Map();
const evidenceSignings=[];
const evidenceDeletes=[];
const destroyFailures=new Set();
const cloudinary={
  uploader:{
    upload_stream(options,callback){
      const chunks=[];
      return new Writable({
        write(chunk,_encoding,next){chunks.push(Buffer.from(chunk));next();},
        final(next){
          // Never upload beyond local memory, don't log media contents.
          assert.equal(options.type,"authenticated");
          assert.equal(options.overwrite,false);
          const bytes=Buffer.concat(chunks);
          assert.ok(bytes.length>16);
          evidenceStorage.set(options.public_id,{bytes,mime:"image/png"});
          callback(null,{
            asset_id:"synthetic-local-"+evidenceStorage.size,
            public_id:options.public_id,format:"png"
          });
          next();
        }
      });
    },
    async destroy(publicId,opts){
      assert.equal(opts.type,"authenticated");
      assert.equal(opts.invalidate,true);
      assert.equal(opts.resource_type,"image");
      evidenceDeletes.push(publicId);
      if(destroyFailures.has(publicId))throw Error("synthetic-local-cleanup-failure");
      evidenceStorage.delete(publicId);
      return {result:"ok"};
    }
  },
  utils:{
    private_download_url(publicId,format,opts){
      assert.equal(opts.type,"authenticated");
      assert.equal(opts.resource_type,"image");
      assert.ok(opts.expires_at>Math.floor(Date.now()/1000));
      evidenceSignings.push({publicId,expiresAt:opts.expires_at});
      return "https://qa.invalid/private-signed/"+encodeURIComponent(publicId)+"."+format+
        "?expires="+opts.expires_at;
    }
  }
};
function configureCloudinary(){ /* Fake only, no real service or credentials. */ }
// All upstream ID-AI responses here are fabricated. The production Node
// routes remain exact; the private Python service is NOT contacted.
let nextPrecheckAi=null;
let nextFaceAi=null;
let residentAiCalls=[];
async function callIdentityAiService(request,options={}){
  assert.ok(Buffer.isBuffer(request.body) && request.body.length>0);
  assert.equal(request.identityExpectedName.firstName,"Synthetic");
  assert.equal(request.identityExpectedName.lastName,"QA");
  residentAiCalls.push({uid:request.firebaseUser.uid,precheck:!!options.documentPrecheck});
  const result=options.documentPrecheck?nextPrecheckAi:nextFaceAi;
  assert.ok(result,"QA must explicitly configure an AI response");
  if(result instanceof Error)throw result;
  return structuredClone(result);
}
const app = express();
app.disable("x-powered-by");

// The actual pinned deployed Node /api/identity/engine-health route is
// exercised below, but all outbound Python AI GETs are intercepted in RAM.
// Never contact Render, nor use production Firebase/Cloudinary secrets.
const LOCAL_AI_ENDPOINT="http://127.0.0.1:18761/verify";
const LOCAL_AI_KEY="synthetic-qa-only-private-key-not-a-secret-20261125";
const readyAiHealth={
  ok:true,
  internalAuthConfigured:true,
  verificationEngineReady:true,
  documentOcrReady:true,
  profileComparisonReady:true,
  documentPrecheckReady:true,
  livenessImplemented:false
};
let aiScenario={health:{...readyAiHealth},authStatus:200,authBody:{authenticated:true}};
let syntheticOutboundCalls=[];
function aiResponse(status,body){
  return {ok:status>=200&&status<300,status,async json(){return body;}};
}
async function interceptPythonAiGet(url,options){
  assert.equal(options?.method,"GET","AI readiness must never POST /verify");
  assert.ok(url.startsWith("http://127.0.0.1:18761/"),"Non-loopback AI request forbidden");
  assert.ok(url.endsWith("/health")||url.endsWith("/api/internal/auth-check"),
    "Only private GET probes may run");
  syntheticOutboundCalls.push({path:new URL(url).pathname,method:options.method});
  if(aiScenario.unreachable)throw Error("synthetic_offline_ai_unreachable");
  if(url.endsWith("/health")){
    return aiResponse(aiScenario.healthStatus||200,aiScenario.health||readyAiHealth);
  }
  assert.equal(options.headers["X-VolunServe-Internal-Key"],LOCAL_AI_KEY);
  return aiResponse(aiScenario.authStatus||200,aiScenario.authBody||{authenticated:true});
}
function probeIdentityAiReadiness(args){
  assert.equal(args.endpoint,LOCAL_AI_ENDPOINT);
  assert.equal(args.internalKey,LOCAL_AI_KEY);
  return liveProbeIdentityAiReadiness({
    ...args,fetchImpl:interceptPythonAiGet,wait:async()=>{},
    healthTimeoutsMs:[5],authTimeoutsMs:[5]
  });
}
app.use(express.json({limit:"16kb"}));

function section(from,to) {
  const a=source.indexOf(from);
  const b=source.indexOf(to,a+from.length);
  assert.ok(a>=0 && b>a,"Pinned deployed Node section absent: "+from+" -> "+to);
  return source.slice(a,b);
}
function getRoute(method,needle,nextNeedle) {
  const needleAt=source.indexOf('"'+needle+'"');
  const nextAt=source.indexOf('"'+nextNeedle+'"',needleAt+needle.length);
  assert.ok(needleAt>=0 && nextAt>needleAt,"Admin route source boundary missing: "+needle);
  const a=source.lastIndexOf("app."+method+"(",needleAt);
  const b=source.lastIndexOf("app.",nextAt);
  assert.ok(a>=0 && b>a,"Pinned Admin route source register bounds invalid: "+needle);
  return source.slice(a,b);
}
const modules=[
  section("function cleanText(","function normalizeAiDecision("),
  section("function normalizeIdDocumentScreening(","function getBearerToken("),
  section("function getBearerToken(","function getCloudinaryConfig("),
  section("async function loadUserProfile(","async function requireVerifiedResident("),
  section("async function requireOperationalAdmin(","function isVerifiedLguPersonnelProfile("),
  section("function identityAttemptCount(","const ASSISTANCE_EVIDENCE_UPLOAD_LIMIT"),
  section("function getIdentityAiEndpoint(","function getIdentityAiHeaders("),
  section('app.get(\n  "/api/identity/engine-health"', "// Authenticated OCR-only document precheck BEFORE webcam/selfie collection."),
  section("function identityAdminTimestampIso(","app.get(\n  \"/api/admin/identity/reviews\""),
  getRoute("get","/api/admin/identity/reviews","/api/admin/identity/reviews/:uid/evidence"),
  getRoute("get","/api/admin/identity/reviews/:uid/evidence","/api/admin/identity/reviews/:uid/decision"),
  getRoute("post","/api/admin/identity/reviews/:uid/decision","/api/admin/assistance/requests/:requestId/start-review"),
  section("function normalizeAiDecision(","function normalizeIdDocumentScreening("),
  section('function diditCleanupFields()', 'app.get(\n  "/health"'),
  section("const IDENTITY_DOC_PRECHECK_COOLDOWN_MS","app.get(\n  \"/api/identity/status\""),
  section('app.post(\n  ["/api/identity/verify"', "function identityAdminTimestampIso("),
];
assert.ok(modules[7].includes("probeIdentityAiReadiness({") &&
          modules[7].includes("requireFirebaseUser") &&
          modules[9].includes("requireOperationalAdmin") &&
          modules[10].includes("signedIdentityEvidence({") &&
          modules[10].includes("identity_evidence_expired") &&
          modules[11].includes("self_identity_review_forbidden") &&
          modules[11].includes("reviewIssuerEvidence(") &&
          modules[11].includes("db.runTransaction(") &&
          modules[14].includes("document_evidence_consent_required") &&
          modules[15].includes("identityAttemptOutcome(decision, attemptCount)") &&
          modules[15].includes("automaticVerificationEligible"),
  "Refusing test of detached or substituted Admin/Resident logic");
// Use the SAME JavaScript Promise realm as Firestore Admin SDK.
// The Firestore SDK requires its transaction callback to return a native
// Promise; vm.runInNewContext creates cross-realm promises and falsely fails.
const dependencyNames=[
  "app","db","auth","FieldValue","console","MAX_IDENTITY_AI_ATTEMPTS",
  "isVerifiedFirebaseToken","isCompletedVolunServeProfile",
  "isOperationalAdminProfile","selectedIdRecognized","reviewIssuerEvidence",
  "signedIdentityEvidence","cloudinary","configureCloudinary",
  "probeIdentityAiReadiness","process",
  "crypto","express","callIdentityAiService","classifyHybridDocumentPrecheck",
  "enforceSelectedIdDecision","classifyIdentityReviewTrack",
  "assessAutomaticIdentityApproval","parseConsentedIdentityEvidence",
  "uploadIdentityEvidence","destroyIdentityEvidence",
  "identityEvidenceRetentionDate","IDENTITY_UPLOAD_LIMIT",
  "IDENTITY_RETRY_DELAY_MS","IDENTITY_PROCESSING_LEASE_MS"
];
const installRoutes = new Function(...dependencyNames,modules.join("\n"));
installRoutes(
  app,db,auth,FieldValue,console,3,
  isVerifiedFirebaseToken,isCompletedVolunServeProfile,
  isOperationalAdminProfile,selectedIdRecognized,reviewIssuerEvidence,
  signedIdentityEvidence,cloudinary,configureCloudinary,
  probeIdentityAiReadiness,process,
  crypto,express,callIdentityAiService,classifyHybridDocumentPrecheck,
  enforceSelectedIdDecision,classifyIdentityReviewTrack,
  assessAutomaticIdentityApproval,parseConsentedIdentityEvidence,
  uploadIdentityEvidence,destroyIdentityEvidence,identityEvidenceRetentionDate,
  "32mb",8000,3*60*1000
);

const adminUid="synthetic_admin_20261125";
const unverifiedUid="synthetic_unverified_20261125";
const pendingUid="synthetic_pending_admin_20261125";
const residentUid="synthetic_resident_20261125";
const validScreening={
  status:"text_consistent_unverified",declaredIdType:"national_id",
  detectedIdType:"national_id",imageQualityStatus:"adequate",
  backSideProvided:true,backSideScreened:true,warningCodes:[],
  profileNameCheck:"possible_match",
};
const unsupportedScreening={
  status:"unsupported",declaredIdType:"national_id",detectedIdType:null,
  imageQualityStatus:"adequate",warningCodes:["school_id_not_supported"],
};

let server;
const labels=[];
function pass(label) {labels.push(label);console.log("PASS: "+label);}
const password="NoRealAccounts_Qa-Only_2026!";
async function makeAccount(uid,role,status,emailVerified=true) {
  const email=uid+"@example.test";
  await auth.createUser({uid,email,password,emailVerified});
  await db.collection("users").doc(uid).set({
    role,status,firstName:"Synthetic",lastName:"QA",
    fullName:"Synthetic QA",email,adminStatus:"active",
    identityStatus:"basic",identityVerified:false
  });
  const url="http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST+
    "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-emulator-only";
  const result=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({email,password,returnSecureToken:true})});
  const body=await result.json();
  assert.equal(result.status,200,JSON.stringify(body));
  assert.ok(body.idToken,"Auth emulator did not issue an ID token");
  return body.idToken;
}
async function record(uid,options={}) {
  const {screening=validScreening,method="volunserve_ai",attempts=1}=options;
  await db.collection("users").doc(uid).set({
    role:"resident",status:"approved",email:uid+"@example.test",
    identityStatus:"pending",identityVerified:false,
  },{merge:true});
  await db.collection("identityVerifications").doc(uid).set({
    verificationId:"demo-verification-"+uid,
    status:"pending",decision:"manual_review",aiDecision:"manual_review",
    verificationMethod:method,reviewTrack:attempts===3?
      "three_failed_attempts":"standard_admin_review",
    requiresManualReview:true,documentScreening:screening,
    aiAttemptCount:attempts,aiAttemptCycle:1,
    matchScore:0.91,updatedAt:FieldValue.serverTimestamp()
  });
}
async function call(method,url,token,body) {
  const headers={};
  if(token)headers.authorization="Bearer "+token;
  if(body!==undefined)headers["content-type"]="application/json";
  const response=await fetch("http://127.0.0.1:"+server.address().port+url,{
    method,headers,body:body===undefined?undefined:JSON.stringify(body)
  });
  const payload=await response.json();
  return {status:response.status,body:payload,cacheControl:response.headers.get("cache-control")};
}
const verifiedBody={
  action:"verify",
  validationMethod:"psa_national_id_qr_check",
  issuerReviewAttested:true,
  notes:"Synthetic emulator independent manual check for QA only",
};
const verificationRef=uid=>db.collection("identityVerifications").doc(uid);
const profileRef=uid=>db.collection("users").doc(uid);
async function assertNoVerified(uid){
  const p=(await profileRef(uid).get()).data();
  assert.equal(p.identityVerified,false,"Unexpected Verified Resident promotion");
  assert.notEqual(p.identityStatus,"verified");
}
async function run() {
  try {
    const adminToken=await makeAccount(adminUid,"admin","approved");
    const unverifiedToken=await makeAccount(unverifiedUid,"admin","approved",false);
    const pendingToken=await makeAccount(pendingUid,"admin","pending");
    const residentToken=await makeAccount(residentUid,"resident","approved");
    server=await new Promise(resolve=>{
      const listener=app.listen(0,"127.0.0.1",()=>resolve(listener));
    });

    // The actual deployed protected engine-health route, Firebase ID token
    // middleware, Node readiness function and private key handshake contract.
    // The outbound Python AI is a local stub, not Render or any real account.
    const engineRoute="/api/identity/engine-health";
    process.env.IDENTITY_AI_SERVICE_URL="http://127.0.0.1:18761";
    process.env.IDENTITY_AI_INTERNAL_KEY=LOCAL_AI_KEY;
    const beforeIdentityChecks=(await db.collection("identityVerifications").get()).size;
    aiScenario={health:{...readyAiHealth},authStatus:200,authBody:{authenticated:true}};
    syntheticOutboundCalls=[];
    let aiCheck=await call("GET",engineRoute,null);
    assert.equal(aiCheck.status,401,JSON.stringify(aiCheck.body));
    assert.equal(syntheticOutboundCalls.length,0);
    pass("Actual engine-health route blocks unauthenticated callers before Python GET (401)");
    aiCheck=await call("GET",engineRoute,unverifiedToken);
    assert.equal(aiCheck.status,403,JSON.stringify(aiCheck.body));
    assert.equal(syntheticOutboundCalls.length,0);
    pass("Unverified Firebase email blocked before AI health/auth requests (403)");

    aiCheck=await call("GET",engineRoute,residentToken);
    assert.equal(aiCheck.status,200,JSON.stringify(aiCheck.body));
    assert.equal(aiCheck.body.ready,true);
    assert.equal(aiCheck.body.provider,"volunserve-custom-ai");
    assert.equal(aiCheck.body.livenessImplemented,false);
    assert.match(aiCheck.cacheControl,/no-store/);
    assert.deepEqual(syntheticOutboundCalls.map(c=>c.path),
      ["/health","/api/internal/auth-check"]);
    pass("Authenticated Resident passes real Node readiness GET and matching internal-key handshake");

    aiScenario={health:{...readyAiHealth},authStatus:401,authBody:{detail:"no"}};
    syntheticOutboundCalls=[];
    aiCheck=await call("GET",engineRoute,residentToken);
    assert.equal(aiCheck.status,503,JSON.stringify(aiCheck.body));
    assert.equal(aiCheck.body.error,"identity_ai_auth_mismatch");
    assert.equal(aiCheck.body.ready,false);
    assert.deepEqual(syntheticOutboundCalls.map(c=>c.path),
      ["/health","/api/internal/auth-check"]);
    pass("Incorrect backend→Python internal key returns fail-closed 503 mismatch without media");

    aiScenario={health:{...readyAiHealth},authStatus:404};
    aiCheck=await call("GET",engineRoute,residentToken);
    assert.equal(aiCheck.status,503,JSON.stringify(aiCheck.body));
    assert.equal(aiCheck.body.error,"identity_ai_auth_check_missing");
    pass("Missing Python private auth endpoint prevents identity verification (503)");

    aiScenario={health:{...readyAiHealth,documentOcrReady:false}};
    syntheticOutboundCalls=[];
    aiCheck=await call("GET",engineRoute,residentToken);
    assert.equal(aiCheck.status,503,JSON.stringify(aiCheck.body));
    assert.equal(aiCheck.body.error,"identity_document_readiness_failed");
    assert.deepEqual(syntheticOutboundCalls.map(c=>c.path),["/health"]);
    pass("Unready Python OCR fails before private auth and blocks resident ID scans");

    aiScenario={health:{...readyAiHealth,profileComparisonReady:false}};
    aiCheck=await call("GET",engineRoute,residentToken);
    assert.equal(aiCheck.status,503,JSON.stringify(aiCheck.body));
    assert.equal(aiCheck.body.error,"identity_document_readiness_failed");
    pass("Missing profile comparison blocks AI before uploading ID or consuming attempts");

    aiScenario={health:{...readyAiHealth},authStatus:200,authBody:{authenticated:false}};
    aiCheck=await call("GET",engineRoute,residentToken);
    assert.equal(aiCheck.status,503,JSON.stringify(aiCheck.body));
    assert.equal(aiCheck.body.error,"identity_ai_auth_check_invalid");
    pass("Private API returns HTTP 200 but authenticated:false: Node still denies readiness");

    aiScenario={health:{...readyAiHealth},unreachable:true};
    aiCheck=await call("GET",engineRoute,residentToken);
    assert.equal(aiCheck.status,503,JSON.stringify(aiCheck.body));
    assert.equal(aiCheck.body.error,"identity_ai_unreachable");
    assert.equal(aiCheck.body.ready,false);
    assert.match(aiCheck.cacheControl,/no-store/);
    pass("Unreachable Python AI returns safe 503, no automatic retry of /verify");

    aiScenario={health:{...readyAiHealth},authStatus:200,authBody:{authenticated:true}};
    assert.equal((await db.collection("identityVerifications").get()).size,beforeIdentityChecks);
    assert.ok(syntheticOutboundCalls.every(c=>c.method==="GET"));
    assert.ok(syntheticOutboundCalls.every(c=>!c.path.includes("/verify")));
    pass("Nine readiness failures/successes consume zero verification attempts, zero uploads or user writes");
    delete process.env.IDENTITY_AI_SERVICE_URL;
    delete process.env.IDENTITY_AI_INTERNAL_KEY;


    // Full Resident document-only precheck and ID+selfie handler tests:
    // the **exact deployed Node Express route bodies** run against
    // isolated Firebase Auth/Firestore, mocked Python AI and Cloudinary.
    const residentPng=Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9m9G0AAAAASUVORK5CYII=",
      "base64");
    const reviewImages=async(token,route,{selfie=false,consent=true,precheckConsent=true}={})=>{
      const form=new FormData();
      form.set("idType","national_id");
      if(consent)form.set("identityEvidenceConsent","true");
      for(const field of ["idDocument","idBackDocument",...(selfie?["selfie"]:[])])
        form.set(field,new Blob([residentPng],{type:"image/png"}),field+".png");
      // Any untrusted form name/DOB must not override the saved profile.
      form.set("firstName","FORGED-FRONTEND-NAME");
      form.set("dateOfBirth","1950-01-01");
      const headers={};
      if(token)headers.authorization="Bearer "+token;
      if(precheckConsent)headers["X-VolunServe-Document-Precheck-Consent"]="true";
      const res=await fetch("http://127.0.0.1:"+server.address().port+route,{
        method:"POST",headers,body:form
      });
      return {status:res.status,body:await res.json(),cacheControl:res.headers.get("cache-control")};
    };
    const docRoute="/api/identity/document/precheck-with-evidence";
    const faceRoute="/api/identity/verify-with-evidence";
    const baselineScreen={
      ...validScreening,
      profileNameCheck:"possible_match",
      profileBirthDateCheck:"possible_match",
      profileAddressCheck:"possible_match",
      warningCodes:[],
    };
    const faceStatus=uid=>db.collection("identityVerifications").doc(uid);
    const faceMedia=uid=>db.collection("identityPrivateEvidence").doc(uid);
    const prepAttempts=uid=>db.collection("identityVerificationAttempts").where("uid","==",uid).get();
    const precheckPassToken=await makeAccount("synthetic_doc_precheck_pass_20261125","resident","approved");
    nextPrecheckAi={outcome:"pass",documentScreening:baselineScreen};
    let resident=await reviewImages(null,docRoute,{selfie:false});
    assert.equal(resident.status,401);
    assert.equal(residentAiCalls.length,0);
    pass("Resident document precheck requires Firebase sign-in before any AI request");
    resident=await reviewImages(precheckPassToken,docRoute,{selfie:false,precheckConsent:false});
    assert.equal(resident.status,400);
    assert.equal(resident.body.error,"document_precheck_consent_required");
    assert.equal(residentAiCalls.length,0);
    pass("Missing preliminary ID processing consent blocked; zero AI attempts");
    resident=await reviewImages(precheckPassToken,docRoute,{selfie:false});
    assert.equal(resident.status,200,JSON.stringify(resident.body));
    assert.equal(resident.body.outcome,"pass");
    assert.equal(resident.body.decision,"ready_for_face_scan");
    assert.equal(resident.body.authenticityVerified,false);
    assert.equal((await faceStatus("synthetic_doc_precheck_pass_20261125").get()).exists,false);
    assert.equal((await faceMedia("synthetic_doc_precheck_pass_20261125").get()).exists,false);
    assert.equal(residentAiCalls.length,1);
    assert.match(resident.cacheControl,/no-store/);
    pass("Recognized synthetic government ID advances to selfie scan, no Verified status/media saved");

    const unsupportedPreUid="synthetic_school_precheck_20261125";
    const unsupportedPreToken=await makeAccount(unsupportedPreUid,"resident","approved");
    nextPrecheckAi={outcome:"pass",documentScreening:{
      ...baselineScreen,status:"unsupported",detectedIdType:null,
      warningCodes:["school_id_not_supported"]
    }};
    resident=await reviewImages(unsupportedPreToken,docRoute,{selfie:false});
    assert.equal(resident.status,200,JSON.stringify(resident.body));
    assert.equal(resident.body.outcome,"retry");
    assert.equal(resident.body.decision,"rescan_required");
    assert.equal((await faceStatus(unsupportedPreUid).get()).exists,false);
    assert.equal((await faceMedia(unsupportedPreUid).get()).exists,false);
    pass("School ID rejected during actual precheck; no Admin case or selfie request");

    const blurryPreUid="synthetic_blurry_precheck_20261125";
    const blurryPreToken=await makeAccount(blurryPreUid,"resident","approved");
    nextPrecheckAi={outcome:"review",documentScreening:{
      ...baselineScreen,status:"inconclusive",detectedIdType:null,
      imageQualityStatus:"low",
      warningCodes:["low_document_image_quality"],
      profileNameCheck:"inconclusive",
    }};
    resident=await reviewImages(blurryPreToken,docRoute,{selfie:false});
    assert.equal(resident.status,200,JSON.stringify(resident.body));
    assert.equal(resident.body.outcome,"review");
    assert.equal(resident.body.status,"pending");
    const blurryCase=(await faceStatus(blurryPreUid).get()).data();
    assert.equal(blurryCase.status,"pending");
    assert.equal(blurryCase.verificationMethod,"volunserve_ai_ocr_manual_review");
    assert.equal(blurryCase.reviewTrack,"blurry_id_review");
    assert.equal(blurryCase.aiAttemptCount,undefined);
    const blurryMedia=(await faceMedia(blurryPreUid).get()).data();
    assert.ok(blurryMedia.assets.front&&blurryMedia.assets.back);
    assert.equal(blurryMedia.assets.selfie,undefined);
    assert.equal((await db.collection("users").doc(blurryPreUid).get()).data().identityVerified,false);
    pass("Blurry National ID queues OCR-only Admin review with protected front/back and zero face attempts");
    const uploadCountAtPending=evidenceStorage.size;
    const aiCallsAtPending=residentAiCalls.length;
    resident=await reviewImages(blurryPreToken,docRoute,{selfie:false});
    assert.equal(resident.status,200);
    assert.equal(resident.body.outcome,"review");
    assert.equal(resident.body.verificationId,blurryCase.verificationId);
    assert.equal(residentAiCalls.length,aiCallsAtPending);
    assert.equal(evidenceStorage.size,uploadCountAtPending);
    pass("Repeated pending precheck is idempotent: no second AI request or media upload");
    resident=await reviewImages(blurryPreToken,faceRoute,{selfie:true});
    assert.equal(resident.status,409);
    assert.equal(resident.body.error,"identity_manual_review_pending");
    assert.equal((await prepAttempts(blurryPreUid)).size,0);
    pass("Face scan blocked while OCR-only review pending; no face attempt consumed");

    const fullUid="synthetic_full_face_review_20261125";
    const fullToken=await makeAccount(fullUid,"resident","approved");
    nextFaceAi={
      status:"verified",decision:"verified",
      verificationId:"synthetic_ai_claimed_verified",
      matchScore:.99,livenessScore:.99,
      livenessImplemented:true,authenticityVerified:true,
      documentScreening:baselineScreen,
      message:"Synthetic AI claimed positive match - never trust as issuer proof"
    };
    const fullBefore=evidenceStorage.size;
    resident=await reviewImages(fullToken,faceRoute,{selfie:true});
    assert.equal(resident.status,200,JSON.stringify(resident.body));
    assert.equal(resident.body.status,"pending");
    assert.equal(resident.body.decision,"manual_review");
    assert.equal(resident.body.attemptCount,1);
    assert.equal(resident.body.automaticVerificationEligible,false);
    const fullProfile=(await db.collection("users").doc(fullUid).get()).data();
    assert.equal(fullProfile.identityStatus,"pending");
    assert.equal(fullProfile.identityVerified,false);
    const fullVerify=(await faceStatus(fullUid).get()).data();
    assert.equal(fullVerify.aiAttemptCount,1);
    assert.equal(fullVerify.requiresManualReview,true);
    assert.equal(fullVerify.automaticVerificationEligible,false);
    assert.equal(fullVerify.privateEvidenceRequestId,
      (await faceMedia(fullUid).get()).data().requestId);
    assert.equal(evidenceStorage.size-fullBefore,3);
    assert.equal((await prepAttempts(fullUid)).size,1);
    assert.ok(!JSON.stringify(fullVerify).includes("FORGED-FRONTEND-NAME"));
    pass("Even forged AI 'verified' + liveness claims yield pending Admin and private 3-image evidence");
    const fullCallsBefore=residentAiCalls.length;
    resident=await reviewImages(fullToken,faceRoute,{selfie:true});
    assert.equal(resident.status,409);
    assert.equal(resident.body.error,"identity_manual_review_pending");
    assert.equal(residentAiCalls.length,fullCallsBefore);
    assert.equal((await prepAttempts(fullUid)).size,1);
    pass("Duplicate face submit while Admin review pending cannot consume another attempt");

    const noConsentUid="synthetic_missing_consent_20261125";
    const noConsentToken=await makeAccount(noConsentUid,"resident","approved");
    const beforeMissingConsent=residentAiCalls.length;
    resident=await reviewImages(noConsentToken,faceRoute,{selfie:true,consent:false});
    assert.equal(resident.status,400,JSON.stringify(resident.body));
    assert.equal(resident.body.error,"identity_evidence_consent_required");
    assert.equal(residentAiCalls.length,beforeMissingConsent);
    const noConsent=(await faceStatus(noConsentUid).get()).data();
    assert.equal(noConsent.aiAttemptCount,undefined);
    assert.equal(noConsent.processingRequestId,undefined);
    assert.equal((await faceMedia(noConsentUid).get()).exists,false);
    pass("Missing selfie/ID retention consent blocks AI proxy and cleans Firestore processing lease");

    const exhaustedUid="synthetic_exhausted_attempts_20261125";
    const exhaustedToken=await makeAccount(exhaustedUid,"resident","approved");
    await faceStatus(exhaustedUid).set({
      aiAttemptCount:3,status:"failed",requiresManualReview:false,
      lastSubmissionAt:FieldValue.serverTimestamp()
    });
    const callsBeforeCap=residentAiCalls.length;
    resident=await reviewImages(exhaustedToken,faceRoute,{selfie:true});
    assert.equal(resident.status,409,JSON.stringify(resident.body));
    assert.equal(resident.body.error,"identity_attempt_limit_reached");
    assert.equal(residentAiCalls.length,callsBeforeCap);
    assert.equal((await prepAttempts(exhaustedUid)).size,0);
    assert.equal((await db.collection("users").doc(exhaustedUid).get()).data().identityVerified,false);
    pass("Three-attempt limit is enforced atomically BEFORE Python AI call or media upload");

    // Teardown of the fabricated Resident-side image fixtures, before the
    // pre-existing private evidence suite asserts its own independent media
    // counts. All records exist only in the disposable Firebase emulator.
    for(const uid of [blurryPreUid,fullUid]){
      const snapshot=await faceMedia(uid).get();
      if(snapshot.exists){
        await destroyIdentityEvidence({
          assets:snapshot.data().assets,cloudinary,configureCloudinary
        });
        await snapshot.ref.delete();
        await faceStatus(uid).update({privateEvidenceRequestId:FieldValue.delete()});
      }
    }
    assert.equal(evidenceStorage.size,0);
    pass("Synthetic Resident media fixtures cleaned before independent Admin/evidence regression");

    const target="synthetic_case_main_20261125";
    await record(target);
    const route="/api/admin/identity/reviews/"+target+"/decision";

    let res=await call("POST",route,null,verifiedBody);
    assert.equal(res.status,401,JSON.stringify(res.body));
    pass("Missing Firebase Bearer token rejected (401)");

    res=await call("POST",route,unverifiedToken,verifiedBody);
    assert.equal(res.status,403,JSON.stringify(res.body));
    assert.equal(res.body.error,"email_not_verified");
    pass("Unverified email token rejected by original auth middleware (403)");

    res=await call("POST",route,pendingToken,verifiedBody);
    assert.equal(res.status,403,JSON.stringify(res.body));
    pass("Pending Admin role denied original approval route (403)");

    res=await call("POST",route,residentToken,verifiedBody);
    assert.equal(res.status,403,JSON.stringify(res.body));
    assert.equal(res.body.error,"operational_admin_required");
    pass("Resident role denied original Admin approval route (403)");

    res=await call("GET","/api/admin/identity/reviews",residentToken);
    assert.equal(res.status,403,JSON.stringify(res.body));
    pass("Resident cannot access private Admin identity queue (403)");

    await record(adminUid);
    // Preserve the real Admin role while testing this Admin\'s own identity case.
    await profileRef(adminUid).update({role:"admin",status:"approved",identityStatus:"basic"});
    res=await call("POST","/api/admin/identity/reviews/"+adminUid+"/decision",adminToken,verifiedBody);
    assert.equal(res.status,403,JSON.stringify(res.body));
    assert.equal(res.body.error,"self_identity_review_forbidden");
    await assertNoVerified(adminUid);
    pass("Approved Admin cannot verify own identity (403)");

    const ocrUid="synthetic_ocr_only_20261125";
    await record(ocrUid,{method:"volunserve_ai_ocr_manual_review"});
    res=await call("POST","/api/admin/identity/reviews/"+ocrUid+"/decision",adminToken,verifiedBody);
    assert.equal(res.status,409,JSON.stringify(res.body));
    assert.equal(res.body.error,"ocr_only_review_requires_rescan");
    await assertNoVerified(ocrUid);
    pass("OCR-only record cannot be Verified without selfie evidence (409)");

    const unsupportedUid="synthetic_school_id_20261125";
    await record(unsupportedUid,{screening:unsupportedScreening,attempts:3});
    res=await call("POST","/api/admin/identity/reviews/"+unsupportedUid+"/decision",adminToken,verifiedBody);
    assert.equal(res.status,409,JSON.stringify(res.body));
    assert.equal(res.body.error,"selected_government_id_not_recognized");
    await assertNoVerified(unsupportedUid);
    pass("School ID rejected by actual Admin transaction after 3 attempts (409)");

    res=await call("POST",route,adminToken,{...verifiedBody,issuerReviewAttested:false});
    assert.equal(res.status,400,JSON.stringify(res.body));
    assert.equal(res.body.error,"independent_id_review_required");
    await assertNoVerified(target);
    pass("Missing independent manual review attestation blocks approval (400)");

    res=await call("POST",route,adminToken,verifiedBody);
    assert.equal(res.status,200,JSON.stringify(res.body));
    assert.equal(res.body.identityVerified,true);
    const p=(await profileRef(target).get()).data();
    const v=(await verificationRef(target).get()).data();
    assert.equal(p.identityStatus,"verified");
    assert.equal(p.identityVerifiedBy,adminUid);
    assert.equal(v.manualReviewDecision,"verified");
    assert.equal(v.issuerApiAuthenticityVerified,false,
      "Manual check must not masquerade as issuer API proof");
    assert.equal(v.independentAdminCheckAttested,true);
    pass("Actual Admin route commits independent review approval in Firestore emulator");

    res=await call("POST",route,adminToken,verifiedBody);
    assert.equal(res.status,409,JSON.stringify(res.body));
    assert.equal(res.body.error,"identity_already_verified");
    pass("Second approval cannot double-verify already Verified Resident (409)");

    const rejectUid="synthetic_reject_20261125";
    await record(rejectUid,{attempts:3});
    res=await call("POST","/api/admin/identity/reviews/"+rejectUid+"/decision",
      adminToken,{action:"reject",notes:"Fabricated ID not accepted in QA"});
    assert.equal(res.status,200,JSON.stringify(res.body));
    const rejected=(await verificationRef(rejectUid).get()).data();
    assert.equal(rejected.manualReviewDecision,"rejected");
    assert.equal(rejected.aiAttemptCount,0);
    assert.equal(rejected.aiAttemptCycle,2);
    await assertNoVerified(rejectUid);
    pass("Rejection writes reason, resets attempts and never disables account");

    const retryUid="synthetic_retry_20261125";
    await record(retryUid,{method:"volunserve_ai_ocr_manual_review"});
    res=await call("POST","/api/admin/identity/reviews/"+retryUid+"/decision",
      adminToken,{action:"require_retry",notes:"Rescan the synthetic example card"});
    assert.equal(res.status,200,JSON.stringify(res.body));
    assert.equal((await verificationRef(retryUid).get()).data().manualReviewDecision,"retry_required");
    await assertNoVerified(retryUid);
    pass("OCR-only Pending can require retry without granting Verified Resident");

    res=await call("GET","/api/admin/identity/reviews",adminToken);
    assert.equal(res.status,200,JSON.stringify(res.body));
    assert.equal(res.body.ok,true);
    assert.ok(res.body.items.some(x=>x.uid===ocrUid));
    assert.ok(res.body.items.some(x=>x.uid===target && x.identityVerified===true));
    const serialized=JSON.stringify(res.body);
    assert.ok(!serialized.includes("private_key") && !serialized.includes("rawOCR"));
    pass("Admin private queue returns stored synthetic decisions and no raw OCR/keys");

    const audit=await db.collection("adminActivityLogs").get();
    assert.equal(audit.docs.filter(doc=>doc.data().residentUid===target &&
      doc.data().action==="Resident Identity Manually Verified").length,1);
    assert.equal(audit.docs.filter(doc=>doc.data().residentUid===rejectUid &&
      doc.data().action==="Resident Identity Verification Rejected").length,1);
    assert.equal(audit.docs.filter(doc=>doc.data().residentUid===retryUid &&
      doc.data().action==="Resident Identity Retry Required").length,1);
    pass("Admin Verify/Reject/Retry decisions create exactly one audit record per case");


    // Test the exact private evidence upload/signing library and the actual
    // deployed Admin viewer route, not just isolated permission functions.
    // The PNG bytes below are a fabricated blank pixel, not a face or ID.
    const blankPng=Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9m9G0AAAAASUVORK5CYII=",
      "base64"
    );
    assert.ok(blankPng.length>=16);
    async function uploadSynthetic(uid,requestId,{includeSelfie=true}={}){
      const form=new FormData();
      form.set("idType","national_id");
      form.set("identityEvidenceConsent","true");
      for(const field of ["idDocument","idBackDocument",...(includeSelfie?["selfie"]:[])])
        form.set(field,new Blob([blankPng],{type:"image/png"}),field+".png");
      const req=new Request("http://127.0.0.1:7777/test-only",{method:"POST",body:form});
      const body=Buffer.from(await req.arrayBuffer());
      const images=await parseConsentedIdentityEvidence({
        body,headers:{"content-type":req.headers.get("content-type")}
      },{requireSelfie:includeSelfie});
      assert.equal(Object.keys(images).length,includeSelfie?3:2);
      const assets=await uploadIdentityEvidence({
        images,uid,requestId,cloudinary,configureCloudinary
      });
      assert.deepEqual(Object.keys(assets),
        includeSelfie?["front","back","selfie"]:["front","back"]);
      return assets;
    }
    const evidenceUid="synthetic_evidence_main_20261125";
    const requestId="synthetic_evidence_attempt_20261125";
    await record(evidenceUid);
    const uploaded=await uploadSynthetic(evidenceUid,requestId);
    assert.equal(evidenceStorage.size,3);
    await verificationRef(evidenceUid).update({privateEvidenceRequestId:requestId});
    await db.collection("identityPrivateEvidence").doc(evidenceUid).set({
      requestId,verificationId:"demo-verification-"+evidenceUid,
      retentionUntil:FieldValue.serverTimestamp(),
      assets:uploaded
    });
    await db.collection("identityPrivateEvidence").doc(evidenceUid).update({
      retentionUntil: new Date(Date.now()+3*24*60*60*1000)
    });
    const evidenceRoute="/api/admin/identity/reviews/"+evidenceUid+"/evidence";
    let seen=await call("GET",evidenceRoute,null);
    assert.equal(seen.status,401,JSON.stringify(seen.body));
    seen=await call("GET",evidenceRoute,residentToken);
    assert.equal(seen.status,403,JSON.stringify(seen.body));
    seen=await call("GET",evidenceRoute,pendingToken);
    assert.equal(seen.status,403,JSON.stringify(seen.body));
    pass("Real private evidence route blocks anonymous, Resident and unapproved Admin");

    const accessCountBefore=(await db.collection("adminActivityLogs")
      .where("action","==","Resident Identity Evidence Viewed").get()).size;
    const signingCountBefore=evidenceSignings.length;
    seen=await call("GET",evidenceRoute,adminToken);
    assert.equal(seen.status,200,JSON.stringify(seen.body));
    assert.equal(seen.body.ok,true);
    assert.equal(seen.body.uid,evidenceUid);
    assert.match(seen.cacheControl,/no-store/);
    assert.match(seen.cacheControl,/private/);
    for(const slot of ["front","back","selfie"])
      assert.match(seen.body.images[slot],/^https:\/\/qa\.invalid\/private-signed\//);
    assert.ok(seen.body.expiresAt>Math.floor(Date.now()/1000));
    assert.ok(seen.body.expiresAt<=Math.floor(Date.now()/1000)+180);
    assert.equal(evidenceSignings.length,signingCountBefore+3);
    const viewLogs=(await db.collection("adminActivityLogs")
      .where("action","==","Resident Identity Evidence Viewed").get());
    assert.equal(viewLogs.size,accessCountBefore+1);
    assert.ok(viewLogs.docs.some(d=>{
      const v=d.data();
      return v.residentUid===evidenceUid && v.performedBy===adminUid &&
        !JSON.stringify(v).includes("qa.invalid");
    }));
    pass("Authorized Admin gets 3 private signed URLs expiring within 180 sec, no-store and audit");

    const wrongUid="synthetic_missing_private_20261125";
    await record(wrongUid);
    seen=await call("GET","/api/admin/identity/reviews/"+wrongUid+"/evidence",adminToken);
    assert.equal(seen.status,404);
    assert.equal(seen.body.error,"identity_evidence_not_retained");
    pass("Missing evidence rejected without signing assets");

    await verificationRef(evidenceUid).update({
      privateEvidenceRequestId:"synthetic_outdated_attempt_20261125"
    });
    const signBeforeMismatch=evidenceSignings.length;
    seen=await call("GET",evidenceRoute,adminToken);
    assert.equal(seen.status,404);
    assert.equal(seen.body.error,"identity_evidence_not_retained");
    assert.equal(evidenceSignings.length,signBeforeMismatch);
    await verificationRef(evidenceUid).update({privateEvidenceRequestId:requestId});
    pass("Stale or mismatched evidence request ID denied; no signed URLs issued");

    await db.collection("identityPrivateEvidence").doc(evidenceUid).update({
      retentionUntil:new Date(Date.now()-60*1000)
    });
    const signBeforeExpiry=evidenceSignings.length;
    seen=await call("GET",evidenceRoute,adminToken);
    assert.equal(seen.status,410,JSON.stringify(seen.body));
    assert.equal(seen.body.error,"identity_evidence_expired");
    assert.equal(evidenceSignings.length,signBeforeExpiry);
    await db.collection("identityPrivateEvidence").doc(evidenceUid).update({
      retentionUntil:new Date(Date.now()+3*24*60*60*1000)
    });
    pass("Expired evidence blocked HTTP 410 before signing a private URL");

    const forged={...uploaded,
      front:{...uploaded.front,publicId:"volunserve/assistance-evidence/forged/path"}};
    await db.collection("identityPrivateEvidence").doc(evidenceUid).update({assets:forged});
    seen=await call("GET",evidenceRoute,adminToken);
    assert.equal(seen.status,409,JSON.stringify(seen.body));
    assert.equal(seen.body.error,"identity_evidence_not_private");
    await db.collection("identityPrivateEvidence").doc(evidenceUid).update({assets:uploaded});
    pass("Tampered public asset path rejected by actual Cloudinary private signer");

    const idOnlyUid="synthetic_evidence_ocr_20261125";
    const idOnlyReq="synthetic_ocr_evidence_attempt_20261125";
    await record(idOnlyUid,{method:"volunserve_ai_ocr_manual_review"});
    const idOnlyAssets=await uploadSynthetic(idOnlyUid,idOnlyReq,{includeSelfie:false});
    await verificationRef(idOnlyUid).update({privateEvidenceRequestId:idOnlyReq});
    await db.collection("identityPrivateEvidence").doc(idOnlyUid).set({
      requestId:idOnlyReq,verificationId:"demo-verification-"+idOnlyUid,
      retentionUntil: new Date(Date.now()+24*60*60*1000),
      assets:idOnlyAssets
    });
    seen=await call("GET","/api/admin/identity/reviews/"+idOnlyUid+"/evidence",adminToken);
    assert.equal(seen.status,200,JSON.stringify(seen.body));
    assert.ok(seen.body.images.front && seen.body.images.back);
    assert.equal(seen.body.images.selfie,null);
    pass("OCR-only retained 2-sided ID can be reviewed, no fabricated selfie or auto approval");

    const finalViewLogs=(await db.collection("adminActivityLogs")
      .where("action","==","Resident Identity Evidence Viewed").get());
    assert.equal(finalViewLogs.size,accessCountBefore+2);
    assert.equal((await profileRef(idOnlyUid).get()).data().identityVerified,false);
    pass("Each successful private Admin evidence view audited exactly once; unauthorized views not audited");


    // Actual private-evidence retention and orphan cleanup routines,
    // isolated from production Firebase or Cloudinary.
    const retentionStart=Date.UTC(2026,10,25,0,0,0);
    assert.equal(
      identityEvidenceRetentionDate(retentionStart).getTime()-retentionStart,
      30*24*60*60*1000
    );
    pass("Private evidence retention duration is precisely 30 days");

    // Start with an expired ID/selfie record created by the existing upload
    // helper. The cleanup must destroy all 3 authenticated fake assets,
    // remove private Firestore metadata, and clear ONLY the matching pointer.
    await db.collection("identityPrivateEvidence").doc(evidenceUid).update({
      retentionUntil:new Date(Date.now()-60*1000)
    });
    const assetCountBeforeCleanup=evidenceStorage.size;
    const deletedBeforeCleanup=evidenceDeletes.length;
    let purged=await purgeExpiredIdentityEvidence({
      db,FieldValue,cloudinary,configureCloudinary
    });
    assert.equal(purged,1);
    assert.equal(evidenceDeletes.length-deletedBeforeCleanup,3);
    for(const asset of Object.values(uploaded)) {
      assert.equal(evidenceStorage.has(asset.publicId),false);
    }
    assert.equal(evidenceStorage.size,assetCountBeforeCleanup-3);
    assert.equal((await db.collection("identityPrivateEvidence").doc(evidenceUid).get()).exists,false);
    const cleared=(await verificationRef(evidenceUid).get()).data();
    assert.ok(!Object.prototype.hasOwnProperty.call(cleared,"privateEvidenceRequestId"));
    seen=await call("GET",evidenceRoute,adminToken);
    assert.equal(seen.status,404);
    assert.equal(seen.body.error,"identity_evidence_not_retained");
    pass("Actual purge removes expired 3 private assets, Firestore metadata, and matching verification pointer");

    // The nonexpired OCR-only document remains available: cleanup should
    // not touch two-sided ID metadata, storage or verification pointer.
    purged=await purgeExpiredIdentityEvidence({
      db,FieldValue,cloudinary,configureCloudinary
    });
    assert.equal(purged,0);
    for(const asset of Object.values(idOnlyAssets))
      assert.ok(evidenceStorage.has(asset.publicId));
    assert.equal((await db.collection("identityPrivateEvidence").doc(idOnlyUid).get()).exists,true);
    assert.equal((await verificationRef(idOnlyUid).get()).data().privateEvidenceRequestId,idOnlyReq);
    pass("Active OCR-only ID evidence is retained; repeated cleanup is idempotent");

    // A provider deletion failure must NOT clear the Firestore metadata and
    // must NOT permit Admin viewing an already expired record.
    const failUid="synthetic_cleanup_failure_20261125";
    const failReq="synthetic_cleanup_failure_attempt_20261125";
    await record(failUid);
    const failAssets=await uploadSynthetic(failUid,failReq);
    await verificationRef(failUid).update({privateEvidenceRequestId:failReq});
    await db.collection("identityPrivateEvidence").doc(failUid).set({
      requestId:failReq,verificationId:"demo-verification-"+failUid,
      retentionUntil:new Date(Date.now()-60000),
      assets:failAssets
    });
    destroyFailures.add(failAssets.front.publicId);
    purged=await purgeExpiredIdentityEvidence({
      db,FieldValue,cloudinary,configureCloudinary
    });
    assert.equal(purged,0);
    assert.equal((await db.collection("identityPrivateEvidence").doc(failUid).get()).exists,true);
    assert.equal((await verificationRef(failUid).get()).data().privateEvidenceRequestId,failReq);
    seen=await call("GET","/api/admin/identity/reviews/"+failUid+"/evidence",adminToken);
    assert.equal(seen.status,410);
    assert.equal(seen.body.error,"identity_evidence_expired");
    destroyFailures.delete(failAssets.front.publicId);
    purged=await purgeExpiredIdentityEvidence({
      db,FieldValue,cloudinary,configureCloudinary
    });
    assert.equal(purged,1);
    assert.equal((await db.collection("identityPrivateEvidence").doc(failUid).get()).exists,false);
    assert.equal((await verificationRef(failUid).get()).data().privateEvidenceRequestId,undefined);
    for(const asset of Object.values(failAssets))
      assert.equal(evidenceStorage.has(asset.publicId),false);
    pass("Cloudinary mock deletion failure preserves expired metadata for retry; subsequent cleanup succeeds");

    // If a Resident submitted a newer application, purging the older stored
    // images must not remove the NEW current verification pointer.
    const replacedUid="synthetic_superseded_20261125";
    const oldReq="synthetic_old_request_20261125";
    const newerReq="synthetic_newer_request_20261125";
    await record(replacedUid);
    const obsolete=await uploadSynthetic(replacedUid,oldReq);
    await db.collection("identityPrivateEvidence").doc(replacedUid).set({
      requestId:oldReq,verificationId:"demo-verification-"+replacedUid,
      retentionUntil:new Date(Date.now()-10000),
      assets:obsolete
    });
    await verificationRef(replacedUid).update({privateEvidenceRequestId:newerReq});
    purged=await purgeExpiredIdentityEvidence({
      db,FieldValue,cloudinary,configureCloudinary
    });
    assert.equal(purged,1);
    assert.equal((await db.collection("identityPrivateEvidence").doc(replacedUid).get()).exists,false);
    assert.equal((await verificationRef(replacedUid).get()).data().privateEvidenceRequestId,newerReq);
    for(const asset of Object.values(obsolete))
      assert.equal(evidenceStorage.has(asset.publicId),false);
    pass("Purging superseded request preserves the new verification attempt pointer");

    // Directly exercise the real upload helper's partial-write rollback.
    // The mock fails the SECOND upload, so the FRONT must be destroyed.
    const brokenUid="synthetic_upload_rollback_20261125";
    const brokenReq="synthetic_upload_rollback_attempt_20261125";
    const rollbackCloudinary={
      ...cloudinary,
      uploader:{
        ...cloudinary.uploader,
        upload_stream(options,callback){
          if(options.public_id.endsWith("/back")){
            return new Writable({
              write(_chunk,_encoding,next){next();},
              final(next){callback(new Error("synthetic-back-upload-failure"));next();}
            });
          }
          return cloudinary.uploader.upload_stream(options,callback);
        }
      }
    };
    const rollbackFrontId="volunserve/identity-private/"+brokenUid+"/"+brokenReq+"/front";
    await assert.rejects(
      uploadIdentityEvidence({
        images:{
          front:{data:blankPng,mime:"image/png"},
          back:{data:blankPng,mime:"image/png"},
          selfie:{data:blankPng,mime:"image/png"}
        },uid:brokenUid,requestId:brokenReq,
        cloudinary:rollbackCloudinary,configureCloudinary
      }),
      error=>error.code==="identity_evidence_upload_failed"
    );
    assert.equal(evidenceStorage.has(rollbackFrontId),false);
    assert.ok(evidenceDeletes.includes(rollbackFrontId));
    assert.equal((await db.collection("identityPrivateEvidence").doc(brokenUid).get()).exists,false);
    pass("Partial private image upload failure rolls back previously uploaded fake asset");

    // The actual cleanup routine remains safe if there is nothing expired.
    purged=await purgeExpiredIdentityEvidence({
      db,FieldValue,cloudinary,configureCloudinary
    });
    assert.equal(purged,0);
    assert.equal(evidenceStorage.size,2); // nonexpired OCR-only front and back
    pass("No expired evidence remains, and only active two-sided ID assets survive");

    console.log("PASS: "+labels.length+" real emulator HTTP+Firestore Admin scenarios; DEMO project only");
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    await deleteApp(firebaseApp);
  }
}
run().catch(e=>{console.error("QA FAIL:",e.stack||e);process.exitCode=1;});
