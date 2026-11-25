"use strict";
/**
 * REAL deployed Node /api/identity/status route -> REAL restored identity
 * client parser -> REAL QA-fixed Native submitVerification recovery closure.
 *
 * All users, IDs and results are synthetic records in ephemeral DEMO
 * Firebase Auth+Firestore emulators. No actual ID media, Python AI, service
 * credentials, Cloudinary, or Render endpoints are ever called.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
const express=require("express");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore}=require("firebase-admin/firestore");
const {isVerifiedFirebaseToken,isCompletedVolunServeProfile}=
  require("./backend/verifiedFirebaseToken");
const project="demo-volunserve-original-ai-native-status";
if(process.env.GCLOUD_PROJECT!==project ||
   process.env.GOOGLE_CLOUD_PROJECT!==project ||
   !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||"") ||
   !/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST||""))
  throw Error("Refusing non-demo/non-loopback Firebase environment");
for(const key of ["GOOGLE_APPLICATION_CREDENTIALS","FIREBASE_SERVICE_ACCOUNT_JSON",
  "CLOUDINARY_API_KEY","CLOUDINARY_API_SECRET","IDENTITY_AI_INTERNAL_KEY"]){
  if(process.env[key])throw Error("Refusing credentials in native status QA: "+key);
}
const fbApp=initializeApp({projectId:project});
const auth=getAuth(fbApp),db=getFirestore(fbApp);
const deployedServer=fs.readFileSync(path.join(__dirname,"backend/server.js"),"utf8");
const app=express();
app.disable("x-powered-by");
function section(a,b){
  const from=deployedServer.indexOf(a);
  const to=deployedServer.indexOf(b,from+a.length);
  assert.ok(from>=0&&to>from,"Deployed server source markers changed: "+a);
  return deployedServer.slice(from,to);
}
const code=[
  section("function identityAttemptCount(","const ASSISTANCE_EVIDENCE_UPLOAD_LIMIT"),
  section("function cleanText(","function normalizeAiDecision("),
  section("function normalizeIdDocumentScreening(","function getBearerToken("),
  section("function getBearerToken(","function getCloudinaryConfig("),
  section('app.get(\n  "/api/identity/status"', 'app.post(\n  ["/api/identity/verify"')
].join("\n");
assert.match(code,/app\.get\(\s*"\/api\/identity\/status"/);
assert.match(code,/requireFirebaseUser/);
assert.match(code,/identityAttemptCount\(verification\.aiAttemptCount\)/);
const install=new Function(
  "app","db","auth","isVerifiedFirebaseToken","isCompletedVolunServeProfile",
  "MAX_IDENTITY_AI_ATTEMPTS","console",code);
install(app,db,auth,isVerifiedFirebaseToken,isCompletedVolunServeProfile,3,console);

const clientSrc=fs.readFileSync(path.join(__dirname,"lib/identityVerification.ts"),"utf8");
const nativeSrc=fs.readFileSync(path.join(__dirname,"app/identity-verification.tsx"),"utf8");
function parse(file,text,kind){
  return ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,kind);
}
const clientTree=parse("identityVerification.ts",clientSrc,ts.ScriptKind.TS);
const nativeTree=parse("identity-verification.tsx",nativeSrc,ts.ScriptKind.TSX);
function compiledExpression(tree,name,extraSource=""){
  const definitions=tree.statements.filter(ts.isVariableStatement)
    .flatMap(stmt=>stmt.declarationList.declarations);
  const def=definitions.find(d=>d.name?.getText(tree)===name);
  assert.ok(def?.initializer,"Missing exact client/native closure "+name);
  return ts.transpileModule(extraSource+"\nmodule.exports="+def.initializer.getText(tree)+";",{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
}
function clientParserSource(){
  return ["normalizeStatus","optionalNumber","parseDocumentScreening"].map(name=>{
    const fn=clientTree.statements.find(
      x=>ts.isFunctionDeclaration(x)&&x.name?.text===name);
    assert.ok(fn,"Missing original client parser "+name);
    return fn.getText(clientTree);
  }).join("\n");
}
function nativeHandler(locals){
  const component=nativeTree.statements.find(
    x=>ts.isFunctionDeclaration(x)&&x.name?.text==="IdentityVerification");
  assert.ok(component?.body,"Missing native QA fix component");
  const declaration=component.body.statements.filter(ts.isVariableStatement)
    .flatMap(x=>x.declarationList.declarations)
    .find(x=>x.name?.getText(nativeTree)==="submitVerification");
  assert.ok(declaration?.initializer);
  const code=ts.transpileModule(
    "module.exports="+declaration.initializer.getText(nativeTree)+";",{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
    }).outputText;
  const mod={exports:null};
  vm.runInNewContext(code,{module:mod,...locals},{timeout:1600});
  return mod.exports;
}
const userPassword="SyntheticOnly_NoRealAccount_2026!";
async function register(uid,{verifiedEmail=true,withProfile=true}={}){
  const email=uid+"@example.test";
  await auth.createUser({uid,email,emailVerified:verifiedEmail,password:userPassword});
  if(withProfile)await db.collection("users").doc(uid).set({
    role:"resident",status:"approved",email,firstName:"Synthetic",lastName:"Status",
    identityStatus:"basic",identityVerified:false
  });
  const endpoint="http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST+
    "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only";
  const response=await fetch(endpoint,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({email,password:userPassword,returnSecureToken:true})
  });
  const result=await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  return {uid,token:result.idToken};
}
async function setIdentity(uid,status,overrides={}){
  await db.collection("users").doc(uid).update({
    identityStatus:status,identityVerified:status==="verified"
  });
  await db.collection("identityVerifications").doc(uid).set({
    status,verificationId:"synthetic_"+status+"_"+uid,verificationMethod:"volunserve_ai",
    aiDecision:status==="verified"?"manual_review":status==="pending"?"manual_review":"failed",
    requiresManualReview:status==="pending",
    aiAttemptCount:status==="failed"?2:1,
    matchScore:0.48,livenessScore:null,
    documentScreening:{
      status:"text_consistent_unverified",declaredIdType:"national_id",
      detectedIdType:"national_id",backSideProvided:true,
      backSideScreened:true,authenticityVerified:false,
      rawOCR:"synthetic sensitive ID string SHOULD NEVER RETURN"
    },
    message:status==="pending"?"Awaiting independent LGU Admin review":
      status==="failed"?"Retake with clearer photos":
      "Independently approved by synthetic QA Admin",
    ...(status==="verified"?{
      manualReviewDecision:"verified",
      reviewedBy:"synthetic_qa_admin",
      issuerApiAuthenticityVerified:false
    }:{}),...overrides
  });
}
let server;
const passed=[];
function pass(name){passed.push(name);console.log("PASS: "+name);}
const localBase=()=> "http://127.0.0.1:"+server.address().port;
async function guardedFetch(url,opts){
  assert.equal(url,localBase()+"/api/identity/status");
  assert.equal(opts.method,"GET");
  assert.ok(/^Bearer [^ ]+$/.test(opts.headers.Authorization));
  return fetch(url,{...opts,redirect:"error"});
}
function actualClientFor(token){
  const m={exports:null};
  const code=compiledExpression(clientTree,"getIdentityVerificationStatus",clientParserSource());
  vm.runInNewContext(code,{
    module:m,
    getAuthenticatedUser:async()=>({getIdToken:async()=>token}),
    getBackendBaseUrl:localBase,
    fetchWithTimeout:guardedFetch,
    readResponseBody:async response=>response.json(),
    getResponseMessage:(body,fallback)=>String(body?.message||fallback)
  },{filename:"restored-client-status.js",timeout:1500});
  return m.exports;
}
async function nativeAfterLostPost(token){
  const captured=[];
  const status=actualClientFor(token);
  const model={idDocument:{uri:"file:///fake-front.jpg",name:"fake",type:"image/jpeg"},
    idBackDocument:{uri:"file:///fake-back.jpg",name:"fake",type:"image/jpeg"},
    selfie:{uri:"file:///fake-selfie.jpg",name:"fake",type:"image/jpeg"}};
  const hooks={
    submitting:false,consent:true,idType:"national_id",...model,
    setStep:x=>captured.push(["step",x]),
    setStatusResult:x=>captured.push(["status",x]),
    setLocalMessage:x=>captured.push(["message",x]),
    setSubmitting:x=>captured.push(["busy",x]),
    setRetryingFailed:x=>captured.push(["retry",x]),
    checkIdentityEngineReady:async()=>{},
    submitIdentityVerification:async()=>{throw Error("Synthetic connection lost after backend transaction");},
    getIdentityVerificationStatus:status,
    Platform:{OS:"android"},Alert:{alert:(...args)=>captured.push(["alert",args])}
  };
  await nativeHandler(hooks)();
  return captured;
}
const last=(array,kind)=>array.filter(x=>x[0]===kind).at(-1)?.[1];
async function callStatus(token){
  const result=await fetch(localBase()+"/api/identity/status",{
    headers:token?{authorization:"Bearer "+token}:{},redirect:"error"});
  return {status:result.status,data:await result.json()};
}
async function run(){
  try{
    const pending=await register("synthetic_pending_status_qa");
    const failed=await register("synthetic_failed_status_qa");
    const approved=await register("synthetic_admin_approved_status_qa");
    const basic=await register("synthetic_basic_status_qa");
    const unverified=await register("synthetic_email_unverified_status_qa",{verifiedEmail:false});
    const noProfile=await register("synthetic_missing_profile_status_qa",{withProfile:false});
    await setIdentity(pending.uid,"pending");
    await setIdentity(failed.uid,"failed");
    await setIdentity(approved.uid,"verified");
    server=await new Promise(resolve=>{
      const s=app.listen(0,"127.0.0.1",()=>resolve(s));
    });
    let got=await callStatus(null);
    assert.equal(got.status,401);
    pass("Actual Node Firebase middleware: anonymous status request denied 401");
    got=await callStatus(unverified.token);
    assert.equal(got.status,403);
    pass("Actual Node Firebase middleware: unverified-email status request denied 403");
    got=await callStatus(noProfile.token);
    assert.equal(got.status,404);
    assert.equal(got.data.error,"profile_not_found");
    pass("Actual Node status route: missing resident profile denied 404");
    got=await callStatus(pending.token);
    assert.equal(got.status,200);
    assert.equal(got.data.identityStatus,"pending");
    assert.equal(got.data.identityVerified,false);
    assert.equal(got.data.requiresManualReview,true);
    assert.equal(got.data.attemptCount,1);
    assert.equal(got.data.maxAttempts,3);
    assert.equal(got.data.attemptsRemaining,2);
    assert.ok(!JSON.stringify(got.data).includes("rawOCR"));
    pass("Actual Node pending status: manual-review flags/count correct and raw OCR excluded");
    got=await callStatus(failed.token);
    assert.equal(got.status,200);
    assert.equal(got.data.identityStatus,"failed");
    assert.equal(got.data.identityVerified,false);
    assert.equal(got.data.attemptCount,2);
    assert.equal(got.data.attemptsRemaining,1);
    pass("Actual Node failed status reports remaining attempts without promotion");
    got=await callStatus(approved.token);
    assert.equal(got.status,200);
    assert.equal(got.data.identityStatus,"verified");
    assert.equal(got.data.identityVerified,true);
    pass("Actual Node status returns Verified for synthetically Admin-approved account");
    got=await callStatus(basic.token);
    assert.equal(got.status,200);
    assert.equal(got.data.identityStatus,"basic");
    assert.equal(got.data.identityVerified,false);
    pass("Actual Node unsubmitted resident remains Basic");

    const p=await actualClientFor(pending.token)();
    assert.equal(p.identityStatus,"pending");
    assert.equal(p.identityVerified,false);
    assert.equal(p.documentScreening.authenticityVerified,false);
    assert.equal(p.documentScreening.issuerAuthenticityStatus,"not_verified");
    assert.ok(!JSON.stringify(p).includes("rawOCR"));
    pass("Actual restored frontend status parser sanitizes OCR and keeps Pending unverified");

    const pUI=await nativeAfterLostPost(pending.token);
    assert.equal(last(pUI,"status").identityStatus,"pending");
    assert.equal(last(pUI,"status").identityVerified,false);
    assert.equal(last(pUI,"step"),3);
    assert.equal(pUI.filter(x=>x[0]==="alert").length,0);
    assert.equal(last(pUI,"busy"),false);
    pass("Lost POST response→REAL Node GET→original client parser→Native shows Pending without resubmitting");

    const fUI=await nativeAfterLostPost(failed.token);
    assert.equal(last(fUI,"status").identityStatus,"failed");
    assert.equal(last(fUI,"status").identityVerified,false);
    assert.equal(last(fUI,"step"),3);
    assert.equal(fUI.filter(x=>x[0]==="alert").length,0);
    pass("Lost POST response→actual backend FAILED→native shows Failed instead of false Pending");

    const vUI=await nativeAfterLostPost(approved.token);
    assert.equal(last(vUI,"status").identityStatus,"verified");
    assert.equal(last(vUI,"status").identityVerified,true);
    assert.equal(last(vUI,"step"),3);
    pass("Lost POST response→actual synthetic Admin-approved status→native shows Verified");

    const bUI=await nativeAfterLostPost(basic.token);
    assert.equal(bUI.filter(x=>x[0]==="status").length,0);
    assert.equal(last(bUI,"step"),2);
    assert.equal(last(bUI,"busy"),false);
    assert.equal(bUI.filter(x=>x[0]==="alert").length,1);
    pass("Lost POST response→actual Basic status: no invented Pending/Verified; safe retry message");

    // Tests are read-only once synthetic records are seeded. Neither status
    // checking nor Native recovery should create any verification attempts.
    const attempts=await db.collection("identityVerificationAttempts").get();
    assert.equal(attempts.size,0);
    const protectedEvidence=await db.collection("identityPrivateEvidence").get();
    assert.equal(protectedEvidence.size,0);
    pass("All status/recovery checks consumed zero face attempts and stored zero private media");
    console.log("SUCCESS: "+passed.length+" deployed Node→original client→fixed native E2E scenarios");
  } finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await deleteApp(fbApp);
  }
}
run().catch(err=>{console.error("QA FAIL:",err.stack||String(err));process.exitCode=1;});
