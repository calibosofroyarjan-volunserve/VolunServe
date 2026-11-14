"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {
  inspectIdentityMultipartEnvelope:inspect,
  requireValidatedIdentityMultipart:middleware,
}=require("./identityMultipartGuard");

const JPEG=Buffer.from([0xff,0xd8,0xff,0xe0,0,16,74,70,73,70,0,0]);
const PNG=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const WEBP=Buffer.from("RIFF0000WEBPVP8 ","ascii");
const image=(bytes,type)=>new Blob([bytes],{type});
async function payload(options={}) {
  const {
    type="national_id",front=JPEG,back=PNG,selfie=WEBP,
    precheck=false,backIncluded=true,frontIncluded=true,
    selfieIncluded=!precheck,duplicated=false,unknown=false,
  }=options;
  const form=new FormData();
  form.append("idType",type);
  if(frontIncluded) form.append("idDocument",image(front,"image/jpeg"),"front.jpg");
  if(backIncluded) form.append("idBackDocument",image(back,"image/png"),"back.png");
  if(selfieIncluded) form.append("selfie",image(selfie,"image/webp"),"selfie.webp");
  if(duplicated) form.append("idDocument",image(JPEG,"image/jpeg"),"extra.jpg");
  if(unknown) form.append("isAdmin","true");
  const req=new Request("https://fixture.invalid/identity",{method:"POST",body:form});
  return {body:Buffer.from(await req.arrayBuffer()),contentType:req.headers.get("content-type")};
}
const verify=(p,mode="verify")=>inspect(p.body,p.contentType,mode);
function fails(fn,status,code){
  assert.throws(fn,error=>error.statusCode===status&&error.code===code);
}
test("valid browser multipart is accepted with correct modes and ID sides",async()=>{
  assert.equal(verify(await payload()),true);
  assert.equal(verify(await payload({precheck:true}),"precheck"),true);
  assert.equal(verify(await payload({type:"passport",backIncluded:false})),true);
  assert.equal(verify(await payload({
    type:"passport",backIncluded:false,precheck:true
  }),"precheck"),true);
});
test("allow exactly five government ID types, never school ID",async()=>{
  for(const type of ["national_id","drivers_license","passport","umid","prc_id"]){
    assert.equal(verify(await payload({type})),true);
  }
  const bad=await payload({type:"school_id"});
  fails(()=>verify(bad),400,"unsupported_government_id");
});
test("reject missing mandatory image, wrong side, or selfie precheck",async()=>{
  for(const options of [
    {frontIncluded:false},
    {backIncluded:false},
    {selfieIncluded:false},
  ]) {
    const p=await payload(options);
    fails(()=>verify(p),400,"invalid_identity_multipart");
  }
  const selfiePre=await payload({precheck:true,selfieIncluded:true});
  fails(()=>verify(selfiePre,"precheck"),400,"selfie_not_allowed_in_precheck");
  const backMissing=await payload({backIncluded:false,precheck:true});
  fails(()=>verify(backMissing,"precheck"),400,"invalid_identity_multipart");
});
test("reject duplicate and unauthorized fields before AI forwarding",async()=>{
  for(const options of [{duplicated:true},{unknown:true}]) {
    const p=await payload(options);
    fails(()=>verify(p),400,"invalid_identity_multipart");
  }
});
test("reject invalid content type and boundary injection",async()=>{
  const p=await payload();
  for(const contentType of [
    "application/json",
    "multipart/form-data",
    "multipart/form-data; boundary=bad\r\nX-Injected: yes",
    "multipart/form-data; boundary=../../danger; other=true",
    "multipart/form-data; boundary=bad boundary",
  ]) {
    fails(()=>inspect(p.body,contentType,"verify"),415,"invalid_identity_content_type");
  }
  fails(()=>verify({...p,body:Buffer.alloc(0)}),400,"missing_identity_media");
});
test("reject truncated, corrupted or malformed multipart endings",async()=>{
  const p=await payload();
  for(const body of [
    p.body.subarray(0,p.body.length-2),
    p.body.subarray(1),
    Buffer.from("not a multipart envelope"),
  ]) {
    fails(()=>verify({...p,body}),400,"invalid_identity_multipart");
  }
});
test("reject content-type and magic-byte mismatch on ID and selfie",async()=>{
  const badFront=await payload({front:Buffer.from("This is not a real JPEG")});
  fails(()=>verify(badFront),415,"unsupported_identity_image");
  const badBack=await payload({back:JPEG});
  fails(()=>verify(badBack),415,"unsupported_identity_image");
  const badSelfie=await payload({selfie:PNG});
  fails(()=>verify(badSelfie),415,"unsupported_identity_image");
});
test("enforce 10 MiB per image and 32 MiB envelope limit",async()=>{
  const large=await payload({front:Buffer.concat([JPEG,Buffer.alloc(10*1024*1024)])});
  fails(()=>verify(large),413,"identity_image_too_large");
  const normal=await payload();
  const oversized={...normal,body:Buffer.alloc(32*1024*1024+1)};
  fails(()=>verify(oversized),413,"identity_media_too_large");
});
test("middleware returns safe 4xx without recording image data or calling next",async()=>{
  const p=await payload({unknown:true});
  let nextCalls=0,printed={status:0,data:null};
  const response={
    status(s){printed.status=s;return this},
    json(x){printed.data=x;return this},
  };
  middleware("verify")({body:p.body,headers:{"content-type":p.contentType}},
    response,()=>nextCalls++);
  assert.equal(nextCalls,0);
  assert.equal(printed.status,400);
  assert.equal(printed.data.error,"invalid_identity_multipart");
  assert(!JSON.stringify(printed.data).includes("front.jpg"));
  const good=await payload();
  middleware("verify")({body:good.body,headers:{"content-type":good.contentType}},
    response,()=>nextCalls++);
  assert.equal(nextCalls,1);
});
test("existing disabled staging media gate still runs before private parser or AI",()=>{
  const source=fs.readFileSync("backend/server.js","utf8");
  assert.match(source,/const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false/);
  for(const [path,mode] of [
    ["/api/identity/document/precheck","precheck"],
    ["/api/identity/verify","verify"],
  ]) {
    const section=source.slice(source.indexOf('"'+path+'"'),source.indexOf("async (request, response)",source.indexOf('"'+path+'"'))+80);
    assert.match(section,/requireFirebaseUser,\s*requireStagingIdentityMediaApproval,\s*express\.raw/);
    assert(section.includes('requireValidatedIdentityMultipart("'+mode+'")'));
    assert(section.indexOf("requireStagingIdentityMediaApproval") <
      section.indexOf("requireValidatedIdentityMultipart"));
  }
  assert(!source.includes("STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = true"));
});
