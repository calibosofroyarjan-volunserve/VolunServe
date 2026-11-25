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

test("face-only readiness skips OCR but always proves private Node-Python authentication",async()=>{
  const {probeIdentityAiReadiness}=require("./identityAiReadiness");
  const health={ok:true,verificationEngineReady:true,internalAuthConfigured:true,
    documentOcrReady:false,profileComparisonReady:false,documentPrecheckReady:false,
    livenessImplemented:false};
  const mocked=async(url,request)=>{
    assert.equal(request.method,"GET");
    if(url.endsWith("/health"))return{ok:true,status:200,json:async()=>health};
    assert.ok(url.endsWith("/api/internal/auth-check"));
    assert.equal(request.headers["X-VolunServe-Internal-Key"],"SYNTHETIC_TEST_ONLY_KEY");
    return{ok:true,status:200,json:async()=>({authenticated:true})};
  };
  const opts={endpoint:"https://nonexistent.example/verify",internalKey:"SYNTHETIC_TEST_ONLY_KEY",
    fetchImpl:mocked,wait:async()=>{},healthTimeoutsMs:[50],authTimeoutsMs:[50]};
  const face=await probeIdentityAiReadiness({...opts,requireDocumentReadiness:false});
  assert.equal(face.statusCode,200);
  assert.equal(face.body.ready,true);
  assert.equal(face.body.documentOcrReady,false);
  assert.equal(face.body.livenessImplemented,false);
  const strict=await probeIdentityAiReadiness(opts);
  assert.equal(strict.statusCode,503);
  assert.equal(strict.body.error,"identity_document_readiness_failed");
});

test("private front+face evidence uses authenticated Cloudinary upload, no reverse required",async()=>{
  const {uploadIdentityEvidence}=require("./identityPrivateEvidence");
  const uploads=[];
  const cloudinary={
    uploader:{upload_stream:(options,done)=>{
      const stream={on(){return this;},end(bytes){
        uploads.push({options,bytes});
        done(null,{asset_id:"SYNTHETIC_ASSET_"+uploads.length,
          public_id:options.public_id,format:"jpg"});
      }};
      return stream;
    }},
  };
  const uid="syntheticresident123", requestId="syntheticrequest123";
  const images={front:{data:fakeJpeg(1),mime:"image/jpeg"},
                selfie:{data:fakeJpeg(2),mime:"image/jpeg"}};
  const assets=await uploadIdentityEvidence({images,uid,requestId,cloudinary,
    configureCloudinary:()=>{}});
  assert.deepEqual(Object.keys(assets).sort(),["front","selfie"]);
  assert.equal(uploads.length,2);
  assert.ok(uploads.every(item=>item.options.type==="authenticated"));
  assert.ok(uploads.every(item=>item.options.overwrite===false));
  assert.ok(uploads.every(item=>item.options.public_id.startsWith("volunserve/identity-private/"+uid+"/")));
  assert.equal(assets.front.deliveryType,"authenticated");
  assert.equal(assets.selfie.deliveryType,"authenticated");
});
test("private Admin URLs still exclude missing back and expire; no secrets/media printed",()=>{
  const {signedIdentityEvidence}=require("./identityPrivateEvidence");
  const uid="syntheticresident123",requestId="syntheticrequest123";
  const seen=[];
  const cloudinary={utils:{private_download_url:(name,fmt,options)=>{
    seen.push({name,fmt,options});
    return "https://synthetic.invalid/"+name;
  }}};
  const asset=(slot)=>({publicId:"volunserve/identity-private/"+uid+"/"+requestId+"/"+slot,
    format:"jpg",resourceType:"image",deliveryType:"authenticated"});
  const result=signedIdentityEvidence({uid,assets:{front:asset("front"),selfie:asset("selfie")},
    cloudinary,configureCloudinary:()=>{}});
  assert.ok(result.images.front);
  assert.ok(result.images.selfie);
  assert.equal(result.images.back,null);
  assert.equal(seen.length,2);
  assert.ok(seen.every(item=>item.options.type==="authenticated"));
  assert.ok(result.expiresAt>=Math.floor(Date.now()/1000));
  assert.ok(result.expiresAt<=Math.floor(Date.now()/1000)+181);
});
