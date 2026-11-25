"use strict";
/**
 * Offline synthetic Auth + Firestore E2E against the exact deployed VolunServe
 * Admin identity routes and middleware, extracted without modifying server.js.
 * Never start the entire production backend or contact live Google/Render.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
const {selectedIdRecognized} = require("./backend/selectedIdPolicy");
const {reviewIssuerEvidence} = require("./backend/identityIssuerReviewPolicy");
const app = express();
app.disable("x-powered-by");
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
  section("function identityAdminTimestampIso(","app.get(\n  \"/api/admin/identity/reviews\""),
  getRoute("get","/api/admin/identity/reviews","/api/admin/identity/reviews/:uid/evidence"),
  getRoute("post","/api/admin/identity/reviews/:uid/decision","/api/admin/assistance/requests/:requestId/start-review"),
];
assert.ok(modules[7].includes("requireOperationalAdmin") &&
          modules[8].includes("self_identity_review_forbidden") &&
          modules[8].includes("reviewIssuerEvidence(") &&
          modules[8].includes("db.runTransaction("),
  "Refusing test of detached or substituted Admin logic");
// Use the SAME JavaScript Promise realm as Firestore Admin SDK.
// The Firestore SDK requires its transaction callback to return a native
// Promise; vm.runInNewContext creates cross-realm promises and falsely fails.
const dependencyNames=[
  "app","db","auth","FieldValue","console","MAX_IDENTITY_AI_ATTEMPTS",
  "isVerifiedFirebaseToken","isCompletedVolunServeProfile",
  "isOperationalAdminProfile","selectedIdRecognized","reviewIssuerEvidence"
];
const installRoutes = new Function(...dependencyNames,modules.join("\n"));
installRoutes(
  app,db,auth,FieldValue,console,3,
  isVerifiedFirebaseToken,isCompletedVolunServeProfile,
  isOperationalAdminProfile,selectedIdRecognized,reviewIssuerEvidence
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
  return {status:response.status,body:payload};
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

    console.log("PASS: "+labels.length+" real emulator HTTP+Firestore Admin scenarios; DEMO project only");
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    await deleteApp(firebaseApp);
  }
}
run().catch(e=>{console.error("QA FAIL:",e.stack||e);process.exitCode=1;});
