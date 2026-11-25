"use strict";

/**
 * Integration tests of the actual VolunServe submission transaction against
 * REAL Firebase Firestore emulator semantics (not an in-memory mock).
 * Reads/writes: disposable local emulator process ONLY.
 * NO production Firebase credentials, SDK client, image/media or network.
 */
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const crypto=require("node:crypto");

const PROJECT="demo-volunserve-trusted-auto-only";
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8180" ||
   process.env.GCLOUD_PROJECT!==PROJECT ||
   process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
   process.env.GOOGLE_APPLICATION_CREDENTIALS ||
   process.env.FIREBASE_TOKEN ||
   process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID!==PROJECT){
  throw Error("ABORT: unverified isolated Firestore emulator; NEVER contact production");
}
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const app=initializeApp({projectId:PROJECT},"emulator-identity-auto-only");
const db=getFirestore(app);
db.settings({ignoreUndefinedProperties:false});
after(async()=>{await deleteApp(app);});

const {assessAutomaticIdentityApproval}=require("./identityAutoApprovalGateway");
const {resolveTrustedAutomaticCompletion}=require("./identityTrustedAutomaticCompletion");
const {createTrustedSignedValidators}=require("./identityTrustedSignedProof");

const server=fs.readFileSync("backend/server.js","utf8");
const marker='      const outcome = await db.runTransaction(async (transaction) => {';
const terminator='      });\n      evidenceCommitted = true;';
const st=server.indexOf(marker),ed=server.indexOf(terminator,st+marker.length);
assert(st>0 && ed>st && server.indexOf(marker,st+1)===-1,
  "Exact identity submit transaction changed; stop emulator test");
const transactionBody=server.slice(st,ed+'      });'.length);
assert(transactionBody.includes("identityVerified: autoCompletion.eligible"));
assert(transactionBody.includes('identityAutomationEvents'));

const outcomeSrc=server.match(/function identityAttemptCount\(value\) \{[\s\S]*?\n\}\n\nfunction identityAttemptOutcome\(decision, attempts\) \{[\s\S]*?\n\}/);
assert(outcomeSrc,"Identity attempt outcome policy missing");
const policy=vm.runInNewContext(
  outcomeSrc[0]+"\n({identityAttemptCount,identityAttemptOutcome})",
  {MAX_IDENTITY_AI_ATTEMPTS:3});

const STATUS_BEGIN='app.get(\n  "/api/identity/status",';
const statusPos=server.indexOf(STATUS_BEGIN);
const statusEnd=server.indexOf('\n);\napp.post(',statusPos+STATUS_BEGIN.length);
assert(statusPos>0 && statusEnd>statusPos,"Identity status route boundary missing");
let statusHandler;
vm.runInNewContext(server.slice(statusPos,statusEnd+'\n);'.length),{
  app:{get:(url,...handlers)=>{
    assert.equal(url,"/api/identity/status");
    statusHandler=handlers.at(-1);
  }},
  requireFirebaseUser:()=>{},db,
  normalizeIdentityStatus:v=>String(v||"basic").toLowerCase(),
  cleanText:(v,n)=>String(v||"").slice(0,n),
  numberOrNull:v=>typeof v==="number"&&Number.isFinite(v)?v:null,
  normalizeIdDocumentScreening:v=>v||{},
  identityAttemptCount:policy.identityAttemptCount,
  MAX_IDENTITY_AI_ATTEMPTS:3,
  console:{error:()=>{}}
});
assert.equal(typeof statusHandler,"function");
async function readStatus(uid){
  const res={statusCode:200,body:null,
    status(v){this.statusCode=v;return this;},
    json(v){this.body=v;return this;}};
  await statusHandler({firebaseUser:{uid}},res);
  return res;
}

const front=slot=>(uid,requestId)=>({
  publicId:"volunserve/identity-private/"+uid+"/"+requestId+"/"+slot,
  resourceType:"image",deliveryType:"authenticated",format:"jpg"
});
const screening=()=>({
  status:"text_consistent_unverified",declaredIdType:"national_id",
  detectedIdType:"national_id",imageQualityStatus:"adequate",
  profileNameCheck:"possible_match",profileBirthDateCheck:"possible_match",
  backSideScreened:true,warningCodes:[],
});
const nextId=(()=>{let n=0;return()=>String(++n).padStart(3,"0");})();
const jwtPart=o=>Buffer.from(JSON.stringify(o)).toString("base64url");

async function scenario({
  enabled=true,faceOnly=false,
  missingIssuer=false,expiredIssuer=false,wrongIdType=false,
  faceCalibrated=true,padUnavailable=false,
  wrongSelfie=false,staleLease=false,
  reuseUid=null,requestIdOverride=null,
  decision="manual_review",
}={}){
  const id=nextId();
  const uid=reuseUid||"qaSyntheticResident"+id;
  const requestId=requestIdOverride||"qaSyntheticCapture"+id;
  const verificationId="qaSyntheticVerification"+id;
  const docType="national_id";
  const images={
    front:front("front")(uid,requestId),
    back:front("back")(uid,requestId),
    selfie:front("selfie")(uid,requestId),
  };
  if(wrongSelfie)images.selfie.publicId="volunserve/identity-private/otherResident/stale/selfie";
  const documentScreening=screening();
  const keys={
    issuer:crypto.generateKeyPairSync("ed25519"),
    pad:crypto.generateKeyPairSync("ed25519"),
  };
  const now=Math.floor(Date.now()/1000);
  const sign=kind=>{
    const name=kind==="issuer"?"SyntheticIndependentIssuer":"SyntheticIndependentPAD";
    const payload={
      iss:name,aud:"volunserve-trusted-identity-v1",sub:uid,requestId,
      verificationId,documentType:wrongIdType?"passport":docType,
      proofType:kind,
      proofKind:kind==="issuer"?"trusted_independent_issuer":"validated_presentation_attack_detection",
      jti:"signedEvidence"+id,
      iat:now-5,exp:now+(expiredIssuer&&kind==="issuer"?-1:120),
      [kind==="issuer"?"documentGenuine":"livePersonConfirmed"]:true,
    };
    const header={alg:"EdDSA",typ:"JWT",kid:kind==="issuer"?"syntheticIssuerKey":"syntheticPADKey"};
    const input=jwtPart(header)+"."+jwtPart(payload);
    return input+"."+crypto.sign(null,Buffer.from(input),keys[kind].privateKey).toString("base64url");
  };
  const providers=createTrustedSignedValidators({
    issuerToken:sign("issuer"),padToken:sign("pad"),
    uid,requestId,verificationId,documentType:docType,
    issuerKeyPem:keys.issuer.publicKey.export({type:"spki",format:"pem"}),
    padKeyPem:keys.pad.publicKey.export({type:"spki",format:"pem"}),
    issuerName:"SyntheticIndependentIssuer",padName:"SyntheticIndependentPAD",
    issuerKeyId:"syntheticIssuerKey",padKeyId:"syntheticPADKey",
  });
  const adapters=missingIssuer?{padValidator:providers.padValidator}
    :padUnavailable?{issuerValidator:providers.issuerValidator,
      padValidator:async()=>{throw Error("PAD unavailable");}}
    :providers;
  const automaticApproval=await assessAutomaticIdentityApproval({
    screening:documentScreening,
    face:{result:"match",algorithmValidated:true,
      calibrationValidated:faceCalibrated,samePersonAssertion:true,
      verificationId},
    attempt:{uid,verificationId,freshCapture:true,consentedEvidenceAvailable:true},
    ...adapters,
  });
  const autoCompletion=resolveTrustedAutomaticCompletion({
    enabled,faceOnly,assessment:automaticApproval,
    uid,requestId,verificationId,screening:documentScreening,
    assets:images,aiDecision:decision,
  });
  const userRef=db.collection("users").doc(uid);
  const verificationRef=db.collection("identityVerifications").doc(uid);
  const evidenceRef=db.collection("identityPrivateEvidence").doc(uid);
  // These records exist only inside the local disposable emulator.
  if(!reuseUid){
    await userRef.create({identityStatus:"basic",identityVerified:false});
    await verificationRef.create({
      processingRequestId:staleLease?"someoneElsesCapture":requestId,
      aiAttemptCount:0,aiAttemptCycle:1
    });
  }
  async function finalize(){
    // Cloud Firestore SDK requires its transaction callback to return a
    // native host-realm Promise. The extracted production callback executes
    // inside a VM, whose async Promise belongs to another JavaScript realm.
    // Wrap ONLY the test database boundary; keep the real transaction source.
    const emulatorBridge={
      collection:name=>db.collection(name),
      runTransaction:callback=>db.runTransaction(tx=>Promise.resolve(callback(tx))),
    };
    const ctx={
      uid,requestId,verificationId,db:emulatorBridge,
      userRef,verificationRef,evidenceRef,
      documentScreening,
      newEvidenceAssets:images,previousEvidenceAssets:null,
      autoCompletion,automaticApproval,
      aiResult:{},decision,faceOnly,faceComparisonPassed:faceOnly,
      reviewTrack:faceOnly?"face_only_admin_review":"standard_admin_review",
      matchScore:0.89,livenessScore:null,recognizedSelectedId:true,
      identityAttemptCount:policy.identityAttemptCount,
      identityAttemptOutcome:policy.identityAttemptOutcome,
      MAX_IDENTITY_AI_ATTEMPTS:3,
      diditCleanupFields:()=>({}),
      cleanText:(v,n)=>String(v||"").slice(0,n),
      identityEvidenceRetentionDate:()=>new Date(Date.now()+86400000),
      FieldValue,
      makeHttpError:(statusCode,code,message)=>{
        const error=new Error(message);error.code=code;
        error.statusCode=statusCode;return error;
      }
    };
    return vm.runInNewContext(
      "(async()=>{\n"+transactionBody+"\nreturn outcome;\n})()",
      ctx,{timeout:4000});
  }
  return {uid,requestId,verificationId,
    automaticApproval,autoCompletion,userRef,verificationRef,
    finalize,
    auditRef:db.collection("identityAutomationEvents").doc(uid+"_"+requestId),
    attemptRef:db.collection("identityVerificationAttempts").doc(uid+"_"+requestId),
  };
}
async function assertNeverApproved(fixture){
  const result=await fixture.finalize();
  const user=(await fixture.userRef.get()).data();
  const verification=(await fixture.verificationRef.get()).data();
  assert.equal(result.automaticVerificationApplied,false);
  assert.equal(user.identityVerified,false);
  assert.notEqual(user.identityStatus,"verified");
  assert.equal(verification.automaticVerificationApplied,false);
  assert.equal((await fixture.auditRef.get()).exists,false);
}
test("REAL emulator transaction: independently signed proof grants verified and creates audit",async()=>{
  const f=await scenario();
  assert.equal(f.automaticApproval.eligible,true);
  const result=await f.finalize();
  assert.equal(result.status,"verified");
  assert.equal(result.automaticVerificationApplied,true);
  assert.equal((await f.userRef.get()).data().identityVerified,true);
  assert.equal((await f.verificationRef.get()).data().status,"verified");
  assert.equal((await f.auditRef.get()).data().decision,"trusted_auto_verified");
  assert.equal((await f.attemptRef.get()).data().automaticVerificationApplied,true);
  const status=await readStatus(f.uid);
  assert.equal(status.statusCode,200);
  assert.equal(status.body.identityStatus,"verified");
  assert.equal(status.body.identityVerified,true);
});
test("REAL emulator: disabled automatic feature stays Pending despite valid synthetic proofs",async()=>{
  await assertNeverApproved(await scenario({enabled:false}));
});
test("REAL emulator: original face-only always Admin Review",async()=>{
  await assertNeverApproved(await scenario({faceOnly:true}));
});
for(const [name,opt] of [
  ["missing independent issuer",{missingIssuer:true}],
  ["expired issuer signature",{expiredIssuer:true}],
  ["issuer attests wrong government ID",{wrongIdType:true}],
  ["uncalibrated face comparison",{faceCalibrated:false}],
  ["liveness provider unavailable",{padUnavailable:true}],
  ["old or wrong-user selfie",{wrongSelfie:true}],
  ["AI failed face comparison",{decision:"failed"}],
]){
  test("REAL emulator: "+name+" never auto-approves",async()=>{
    await assertNeverApproved(await scenario(opt));
  });
}
test("REAL emulator: stale processing lease refuses mutation",async()=>{
  const f=await scenario({staleLease:true});
  await assert.rejects(f.finalize(),e=>e.code==="identity_request_expired");
  assert.equal((await f.userRef.get()).data().identityVerified,false);
  assert.equal((await f.attemptRef.get()).exists,false);
  assert.equal((await f.auditRef.get()).exists,false);
});
test("REAL emulator: concurrent finalizers cannot create duplicate Verified events",async()=>{
  const f=await scenario();
  const results=await Promise.allSettled([f.finalize(),f.finalize()]);
  assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(results.filter(x=>x.status==="rejected").length,1);
  assert.equal((await f.userRef.get()).data().identityVerified,true);
  assert.equal((await f.auditRef.get()).exists,true);
  assert.equal((await f.attemptRef.get()).exists,true);
});
test("REAL emulator: status lookup does not expose other Residents",async()=>{
  const f=await scenario();
  await f.finalize();
  const response=await readStatus("qaOtherResidentUnknown");
  assert.equal(response.statusCode,404);
  assert.equal(response.body.error,"profile_not_found");
});
