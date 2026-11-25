"use strict";
// Original face-only 2026-10-23 behavior. Offline synthetic bytes ONLY.
// Never imports Firebase Admin, Cloudinary SDK, Render secrets, or live ID images.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {parseConsentedIdentityEvidence} = require("./identityPrivateEvidence");

function fakeJpeg(seed) {
  return Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(80,seed)]);
}

async function request({type="national_id",back=false,selfie=true,consent=true,badType=false}={}) {
  const form=new FormData();
  form.set("idType",type);
  if(consent)form.set("identityEvidenceConsent","true");
  const mime=badType?"text/plain":"image/jpeg";
  form.append("idDocument",new Blob([fakeJpeg(4)],{type:mime}),"id-front.jpg");
  if(back)form.append("idBackDocument",new Blob([fakeJpeg(5)],{type:"image/jpeg"}),"id-back.jpg");
  if(selfie)form.append("selfie",new Blob([fakeJpeg(8)],{type:"image/jpeg"}),"selfie.jpg");
  const response=new Response(form);
  return {headers:{"content-type":response.headers.get("content-type")},
    body:Buffer.from(await response.arrayBuffer())};
}

test("face-only guarded parser accepts National ID front and selfie without OCR/back",async()=>{
  const files=await parseConsentedIdentityEvidence(await request(),{allowMissingBack:true});
  assert.ok(Buffer.isBuffer(files.front.data));
  assert.ok(Buffer.isBuffer(files.selfie.data));
  assert.equal(files.back,undefined);
  assert.notDeepEqual(files.front.data,files.selfie.data);
});
test("unmodified OCR evidence route still requires National ID reverse",async()=>{
  const input=await request();
  await assert.rejects(()=>parseConsentedIdentityEvidence(input),
    error=>error.code==="identity_evidence_incomplete");
});
test("without explicit consent, neither path retains private evidence",async()=>{
  assert.equal(await parseConsentedIdentityEvidence(await request({consent:false}),
    {allowMissingBack:true}),null);
});
test("face-only parser cannot skip missing selfie",async()=>{
  const input=await request({selfie:false});
  await assert.rejects(()=>parseConsentedIdentityEvidence(input,
    {allowMissingBack:true}),error=>error.code==="identity_evidence_incomplete");
});
test("unsupported ID cannot evade reverse-side requirement via optional-back",async()=>{
  const input=await request({type:"school_id"});
  await assert.rejects(()=>parseConsentedIdentityEvidence(input,
    {allowMissingBack:true}),error=>error.code==="identity_evidence_incomplete");
});
test("invalid image MIME rejected before private upload",async()=>{
  const input=await request({badType:true});
  await assert.rejects(()=>parseConsentedIdentityEvidence(input,
    {allowMissingBack:true}),error=>error.code==="identity_evidence_invalid");
});
test("backend face-only route is disabled unless explicit server flag",()=>{
  const s=fs.readFileSync(require.resolve("./server.js"),"utf8");
  assert.match(s,/VOLUNSERVE_FACE_ONLY_ENABLED/);
  assert.match(s,/request\.path === "\/api\/identity\/verify-face-only"/);
  assert.ok(s.includes('"/verify-face-only"'),"Proxy must forward to dedicated Python face-only route");
  assert.match(s,/faceOnly \? rawDecision : enforceSelectedIdDecision/);
  assert.match(s,/faceOnly \? "face_only_admin_review"/);
  assert.match(s,/faceOnly \? "volunserve_ai_face_only"/);
});
test("Admin independent approval still required and AI cannot auto-verify",()=>{
  const s=fs.readFileSync(require.resolve("./server.js"),"utf8");
  assert.match(s,/identityVerified:\s*false/);
  assert.match(s,/verification\.verificationMethod === "volunserve_ai_face_only"/);
  assert.match(s,/issuerReviewAttested/);
  assert.match(s,/reviewIssuerEvidence\(/);
  assert.match(s,/requireOperationalAdmin/);
  assert.match(s,/verification\.aiDecision !== "verified"/);
});
