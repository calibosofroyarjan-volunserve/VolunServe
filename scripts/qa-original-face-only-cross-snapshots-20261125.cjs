"use strict";
// Combined offline transport contract: Node's real AI proxy -> fake local Python
// endpoint with ORIGINAL 2026-10-23 JSON response. No real media or providers.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const http = require("node:http");

const source = fs.readFileSync("backend/server.js","utf8");
const python = fs.readFileSync("../python/identity-ai/main.py","utf8");
const web = fs.readFileSync("../web/app/identity-verification.web.tsx","utf8");
const client = fs.readFileSync("../web/lib/identityVerification.ts","utf8");
const admin = fs.readFileSync("../web/app/(admin)/identity-reviews.tsx","utf8");
const i = source.indexOf("function getIdentityAiEndpoint()");
const j = source.indexOf("function diditCleanupFields()",i);
assert.ok(i>0 && j>i,"Cannot extract actual Node HTTP gateway");
const e = source.indexOf("function identityAttemptOutcome(");
const eEnd = source.indexOf("const ASSISTANCE_EVIDENCE_UPLOAD_LIMIT",e);
const n = source.indexOf("function normalizeAiDecision(");
const nEnd = source.indexOf("function normalizeIdDocumentScreening(",n);
assert.ok(e>0 && eEnd>e && n>0 && nEnd>n);

function makeGateway(endpoint,key="SYNTHETIC_INTERNAL_TEST_KEY") {
  const module = {exports:{}};
  const env = {IDENTITY_AI_SERVICE_URL:endpoint,IDENTITY_AI_INTERNAL_KEY:key};
  const ctx = vm.createContext({
    module,Buffer,fetch,AbortSignal,console,process:{env},
    cleanText:(val,max)=>String(val??"").trim().slice(0,max),
    makeHttpError:(status,code,message)=>Object.assign(new Error(message),{code,statusCode:status}),
    MAX_IDENTITY_AI_ATTEMPTS:3,
  });
  vm.runInContext([
    source.slice(i,j),source.slice(e,eEnd),source.slice(n,nEnd),
    "module.exports={callIdentityAiService,identityAttemptOutcome,normalizeAiDecision};",
  ].join("\n"),ctx,{timeout:2000});
  return {gateway:module.exports,env};
}
async function mockForm() {
  const fd = new FormData();
  fd.append("idType","national_id");
  fd.append("identityEvidenceConsent","true");
  const bytes=(n)=>new Uint8Array([255,216,255,...new Array(80).fill(n)]);
  fd.append("idDocument",new Blob([bytes(1)],{type:"image/jpeg"}),"synthetic-front.jpg");
  fd.append("selfie",new Blob([bytes(2)],{type:"image/jpeg"}),"synthetic-selfie.jpg");
  const response=new Response(fd);
  return {
    headers:{"content-type":response.headers.get("content-type")},
    body:Buffer.from(await response.arrayBuffer()),
    firebaseUser:{uid:"synthetic_resident_uid"},
    identityExpectedName:{firstName:"Synthetic",lastName:"Resident",dateOfBirth:"2000-01-01",barangay:"Testing"},
  };
}
async function localServer(handler,run) {
  const srv=http.createServer(async(req,res)=>{
    const chunks=[];
    for await (const chunk of req)chunks.push(chunk);
    handler(req,Buffer.concat(chunks),res);
  });
  await new Promise(resolve=>srv.listen(0,"127.0.0.1",resolve));
  try {
    return await run("http://127.0.0.1:"+srv.address().port+"/verify");
  } finally {
    await new Promise((resolve,reject)=>srv.close(err=>err?reject(err):resolve()));
  }
}

test("real Node gateway forwards front ID + selfie to dedicated face-only Python route without OCR",async()=>{
  let count=0;
  await localServer((req,body,res)=>{
    count++;
    assert.equal(req.method,"POST");
    assert.equal(req.url,"/verify-face-only");
    assert.equal(req.headers["x-volunserve-internal-key"],"SYNTHETIC_INTERNAL_TEST_KEY");
    assert.equal(req.headers["x-volunserve-user-id"],"synthetic_resident_uid");
    assert.ok(req.headers["content-type"].startsWith("multipart/form-data;"));
    assert.ok(body.includes(Buffer.from('name="idDocument"')));
    assert.ok(body.includes(Buffer.from('name="selfie"')));
    assert.ok(body.includes(Buffer.from('name="identityEvidenceConsent"')));
    assert.ok(!body.includes(Buffer.from('name="idBackDocument"')));
    res.writeHead(200,{"Content-Type":"application/json"});
    // Actual historical matched-face decision is manual_review, not verified.
    res.end(JSON.stringify({ok:true,status:"pending",decision:"manual_review",
      verificationId:"synthetic_case",matchScore:0.63,matchThreshold:0.52,
      faceComparisonPassed:true,livenessScore:null,
      livenessImplemented:false,engine:"mediapipe-landmark-1to1-v1"}));
  },async endpoint=>{
    const {gateway}=makeGateway(endpoint);
    const result=await gateway.callIdentityAiService(await mockForm(),{faceOnly:true});
    assert.equal(result.decision,"manual_review");
    assert.equal(result.status,"pending");
    assert.equal(result.faceComparisonPassed,true);
    assert.equal(gateway.normalizeAiDecision(result.decision),"manual_review");
    const outcome=gateway.identityAttemptOutcome("manual_review",1);
    assert.equal(outcome.status,"pending");
    assert.equal(outcome.requiresManualReview,true);
  });
  assert.equal(count,1,"Never retry an actual face upload");
});

test("unconfigured Node AI URL fails closed instead of crashing",async()=>{
  const {gateway}=makeGateway("");
  const data=await mockForm();
  await assert.rejects(()=>gateway.callIdentityAiService(data,{faceOnly:true}),
    err=>err.code==="identity_ai_not_configured" && err.statusCode===503);
});

test("incorrect private Node-Python key is rejected without reattempt",async()=>{
  let count=0;
  await localServer((req,body,res)=>{
    count++;assert.equal(req.url,"/verify-face-only");
    res.writeHead(401,{"Content-Type":"application/json"});
    res.end(JSON.stringify({detail:"Unauthorized internal backend"}));
  },async endpoint=>{
    const {gateway}=makeGateway(endpoint,"SYNTHETIC_WRONG_KEY");
    const data=await mockForm();
    await assert.rejects(()=>gateway.callIdentityAiService(data,{faceOnly:true}),
      err=>err.statusCode===401);
  });
  assert.equal(count,1);
});

test("historical face-only decision is never auto Verified; Admin issuer attestation stays required",()=>{
  assert.match(python,/"decision": "manual_review"/);
  assert.match(python,/@app.post\("\/verify-face-only"\)/);
  assert.match(source,/faceOnly \? rawDecision : enforceSelectedIdDecision/);
  assert.match(source,/\["verified", "manual_review"\].includes\(verification.aiDecision\)/);
  assert.match(source,/identityVerified:\s*false/);
  assert.match(source,/verification\.faceComparisonPassed !== true/);
  assert.match(source,/aiResult\?\.faceComparisonPassed === true/);
  assert.match(source,/faceComparisonPassed: faceOnly \? faceComparisonPassed : FieldValue\.delete\(\)/);
  assert.match(admin,/item\.faceComparisonPassed === true/);
  assert.match(python,/"faceComparisonPassed": face_comparison_passed/);
  assert.match(source,/issuerReviewAttested/);
  assert.match(source,/reviewIssuerEvidence\(/);
  assert.match(source,/requireOperationalAdmin/);
  assert.match(admin,/item.aiDecision === "manual_review"/);
  assert.match(admin,/eligibleFaceOnly/);
  assert.match(admin,/item.evidenceAvailable === true/);
});
test("uncertain or missing Python face-pass flag fails closed at Node decision boundary",()=>{
  const match=source.match(/const faceComparisonPassed = ([\s\S]*?)\s*;\n\s*\/\/ A face match cannot compensate/);
  assert.ok(match,"Production gateway must derive face pass from private AI answer");
  const evaluate=(faceOnly,rawDecision,aiResult)=>vm.runInNewContext(match[1],{faceOnly,rawDecision,aiResult});
  assert.equal(evaluate(true,"manual_review",{faceComparisonPassed:true}),true);
  assert.equal(evaluate(true,"manual_review",{faceComparisonPassed:false}),false);
  assert.equal(evaluate(true,"manual_review",{}),false);
  assert.equal(evaluate(true,"failed",{faceComparisonPassed:true}),false);
  assert.equal(evaluate(false,"manual_review",{faceComparisonPassed:true}),false);
});

test("screenshot layout remains with two National ID cards, but no OCR in enabled original mode",()=>{
  assert.match(web,/\.\.\.\(idType === "passport" \? \[\] : \[/);
  assert.match(web,/Back of National ID/);
  assert.match(web,/Front of National ID/);
  assert.match(web,/Optional for face comparison/);
  assert.match(web,/Continue to Face Scan/);
  assert.match(web,/EXPO_PUBLIC_VOLUNSERVE_ORIGINAL_FACE_ONLY === "true"/);
  assert.match(client,/\/api\/identity\/verify-face-only/);
  assert.match(client,/\/api\/identity\/face-engine-health/);
  assert.match(web,/!FACE_ONLY_MODE && movementRef.current.stage/);
  assert.match(web,/!faceOnlyMode && documentPrecheckScreening/);
});
