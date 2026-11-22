"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Writable } = require("node:stream");
const {
  parseConsentedIdentityEvidence,
  uploadIdentityEvidence,
  signedIdentityEvidence,
  destroyIdentityEvidence,
  identityEvidenceRetentionDate,
} = require("./identityPrivateEvidence");

const jpeg = Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.alloc(48, 7)]);
async function makeRequest({consent=true,back=true,passport=false,invalid=false}={}) {
  const form = new FormData();
  form.append("idType", passport ? "passport" : "national_id");
  if (consent) form.append("identityEvidenceConsent","true");
  const photo = invalid ? Buffer.alloc(40, 2) : jpeg;
  form.append("idDocument",new Blob([photo],{type:"image/jpeg"}),"front.jpg");
  if(back) form.append("idBackDocument",new Blob([jpeg],{type:"image/jpeg"}),"back.jpg");
  form.append("selfie",new Blob([jpeg],{type:"image/jpeg"}),"selfie.jpg");
  const request=new Request("http://localhost/verify",{method:"POST",body:form});
  return {body:Buffer.from(await request.arrayBuffer()),headers:{"content-type":request.headers.get("content-type")}};
}
function fakeCloudinary({failOn}={}){
  const calls=[], removed=[];
  const client={
    uploader:{
      upload_stream(options,cb){
        calls.push(options);
        return new Writable({
          write(_chunk,_encoding,next){next();},
          final(next){
            if(options.public_id.endsWith("/"+failOn))cb(new Error("mock failure"));
            else cb(null,{asset_id:"id",public_id:options.public_id,format:"jpg"});
            next();
          },
        });
      },
      async destroy(publicId,opts){removed.push({publicId,opts});return {result:"ok"};},
    },
    utils:{private_download_url(publicId,format,options){
      assert.equal(options.type,"authenticated");
      assert(options.expires_at>Math.floor(Date.now()/1000));
      return "https://res.cloudinary.com/example/"+publicId+"."+format;
    }},
  };
  return {client,calls,removed};
}
test("consent missing: legacy clients are not silently stored",async()=>{
  const images=await parseConsentedIdentityEvidence(await makeRequest({consent:false}));
  assert.equal(images,null);
});
test("all three valid images parsed only when resident consented",async()=>{
  const images=await parseConsentedIdentityEvidence(await makeRequest());
  assert.deepEqual(Object.keys(images),["front","back","selfie"]);
  assert.equal(images.front.data.compare(jpeg),0);
});
test("missing reverse for National ID fails closed; passport reverse optional",async()=>{
  await assert.rejects(parseConsentedIdentityEvidence(await makeRequest({back:false})),
    e=>e.code==="identity_evidence_incomplete");
  const images=await parseConsentedIdentityEvidence(await makeRequest({back:false,passport:true}));
  assert.equal(images.back,undefined);
});
test("reject claimed JPEG with wrong image signature",async()=>{
  await assert.rejects(parseConsentedIdentityEvidence(await makeRequest({invalid:true})),
    e=>e.code==="identity_evidence_invalid");
});
test("authenticated upload and short-lived read links",async()=>{
  const {client,calls,removed}=fakeCloudinary();
  const uid="test-resident-123",requestId="b41c59cd-f11b-4a40-bbee-890a45e3a121";
  const images=await parseConsentedIdentityEvidence(await makeRequest());
  const assets=await uploadIdentityEvidence({
    images,uid,requestId,cloudinary:client,configureCloudinary:()=>{},
  });
  assert.equal(calls.length,3);
  assert(calls.every(call=>call.type==="authenticated"&&call.overwrite===false));
  const signed=signedIdentityEvidence({uid,assets,cloudinary:client,configureCloudinary:()=>{}});
  assert(signed.images.front.startsWith("https://"));
  assert(signed.images.back && signed.images.selfie);
  assert(signed.expiresAt<=Math.floor(Date.now()/1000)+180);
  await destroyIdentityEvidence({assets,cloudinary:client,configureCloudinary:()=>{}});
  assert.equal(removed.length,3);
  assert(removed.every(x=>x.opts.type==="authenticated"));
});
test("rejected upload deletes previously saved portions",async()=>{
  const {client,removed}=fakeCloudinary({failOn:"back"});
  const images=await parseConsentedIdentityEvidence(await makeRequest());
  await assert.rejects(uploadIdentityEvidence({
    images,uid:"test-resident-123",requestId:"12345678-1234-1234-1234-123456789abc",
    cloudinary:client,configureCloudinary:()=>{},
  }), e=>e.code==="identity_evidence_upload_failed");
  assert.equal(removed.length,1);
});
test("forged public-ID path cannot be signed",()=>{
  const {client}=fakeCloudinary();
  assert.throws(()=>signedIdentityEvidence({
    uid:"test-resident-123",
    assets:{front:{publicId:"volunserve/assistance-evidence/foo",format:"jpg",resourceType:"image",deliveryType:"authenticated"}},
    cloudinary:client,configureCloudinary:()=>{},
  }),e=>e.code==="identity_evidence_not_private");
});

test("private image retention expires 30 days after consented upload",()=>{
  const start = Date.UTC(2026,10,23);
  assert.equal(identityEvidenceRetentionDate(start).toISOString(),
    new Date(start+30*24*60*60*1000).toISOString());
});
