"use strict";
// Synthetic QA only: no Firebase credentials, user accounts, ID images, or POSTs.
const fs=require("node:fs");
const vm=require("node:vm");
const test=require("node:test");
const assert=require("node:assert/strict");
const source=fs.readFileSync("backend/server.js","utf8");

const match=source.match(/const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false;[\s\S]*?function requireStagingIdentityMediaApproval\(_request,response,next\) \{[\s\S]*?\n\}/);
assert.ok(match,"Staging media route gate must be present");

function loadedGate(){
 const code=match[0]+"\nrequireStagingIdentityMediaApproval";
 return vm.runInNewContext(code);
}

test("Authenticated staging media POST never reaches multipart decoder or AI while gated",()=>{
 const route=source.slice(source.indexOf('"/api/identity/document/precheck"'),
                          source.indexOf("const IDENTITY_DOC_PRECHECK_COOLDOWN_MS",0)>0?source.length:source.length);
 for(const name of ["/api/identity/document/precheck","/api/identity/verify"]){
   const a=source.indexOf('"'+name+'"');
   assert.ok(a>0);
   const handlers=source.slice(a,a+280);
   assert.match(handlers,/requireFirebaseUser,\s*requireStagingIdentityMediaApproval,\s*express\.raw/);
 }
 assert.match(source,/const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false/);
});
test("server returns HTTP 423 before calling next() or touching user data",()=>{
 let nextCalls=0,httpStatus=0,payload=null;
 const response={
   status(s){httpStatus=s;return this;},
   json(value){payload=value;return this;},
 };
 loadedGate()({},response,()=>nextCalls++);
 assert.equal(httpStatus,423);
 assert.equal(nextCalls,0);
 assert.equal(payload.error,"staging_identity_media_disabled");
 assert.ok(!JSON.stringify(payload).includes("uid"));
});
test("Dedicated staging UI is allowed by CORS but production Firebase is not configured in UI code",()=>{
 const origins=source.slice(source.indexOf("const DEFAULT_ALLOWED_ORIGINS"),source.indexOf("function getAllowedOrigins"));
 assert.match(origins,/https:\/\/volunserve-identity-test-staging\.onrender\.com/);
 assert.equal((source.match(/requireStagingIdentityMediaApproval,/g)||[]).length,2);
});
