"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const {test}=require("node:test");

const lib=fs.readFileSync("lib/automaticVolunteerMatchPreview.ts","utf8");
const admin=fs.readFileSync("app/(admin)/admin-cases.tsx","utf8");
const anchor="export async function requestStagingAutoOfferAfterAdminValidation(";
const idx=lib.indexOf(anchor);
assert.ok(idx>0,"Staging-only validation hook missing");
const hook=lib.slice(idx);
function load({enabled=true,fetchImpl=async()=>({ok:true,json:async()=>({action:"offered"})})}={}){
  const js=ts.transpileModule(
    "const AUTO_VOLUNTEER_MATCH_UI_PREVIEW = "+String(enabled)+";\n"+hook,
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}
  ).outputText;
  const module={exports:{}};
  const context={
    module,exports:module.exports,
    AbortController,setTimeout,clearTimeout,
    fetch:fetchImpl,
  };
  vm.runInNewContext(js,context,{timeout:1500});
  return module.exports.requestStagingAutoOfferAfterAdminValidation;
}
function opts(overrides={}){
  return {
    caseId:"STAGING_TEST_001",originalCaseStatus:"reported",
    originalVerificationStatus:"pending_verification",
    getIdToken:async()=>"staging-test-token-only",
    ...overrides,
  };
}
test("production, missing preview flag, or wrong case does not read token or fetch",async()=>{
 let calls=0,tokenCalls=0;
 const request=load({enabled:false,fetchImpl:async()=>{calls++;throw Error("NEVER");}});
 const args=opts({getIdToken:async()=>{tokenCalls++;throw Error("NEVER");}});
 assert.equal((await request(args)).offered,false);
 const staged=load({enabled:true,fetchImpl:async()=>{calls++;throw Error("NEVER");}});
 for(const pair of [
   {caseId:"real-incident-982"},
   {caseId:"STAGING_TEST_001",originalCaseStatus:"assigned"},
   {caseId:"STAGING_TEST_001",originalVerificationStatus:"validated"},
 ]){
   assert.equal((await staged({...args,...pair})).offered,false);
 }
 assert.equal(calls,0);
 assert.equal(tokenCalls,0);
});
test("staging synthetic first-approval sends authenticated server request only after transaction",async()=>{
 let calls=0;
 const request=load({enabled:true,fetchImpl:async(url,options)=>{
   calls++;
   assert.equal(url,"https://volunserve-emergency-match-staging-free.onrender.com/api/admin/emergency-auto/start");
   assert.equal(options.method,"POST");
   assert.equal(options.headers.Authorization,"Bearer staging-test-token-only");
   assert.equal(JSON.parse(options.body).caseId,"STAGING_TEST_001");
   assert.ok(options.signal instanceof AbortSignal);
   return {ok:true,json:async()=>({action:"offered"})};
 }});
 const result=await request(opts());
 assert.equal(result.offered,true);
 assert.equal(result.reason,"server_confirmed_synthetic_staging_offer");
 assert.equal(calls,1);
 assert.ok(admin.includes("requestStagingAutoOfferAfterAdminValidation"));
 const validation=admin.indexOf("const reviewVerification = async");
 const committed=admin.indexOf("await runTransaction(db, async (transaction)",validation);
 const postCommit=admin.indexOf("requestStagingAutoOfferAfterAdminValidation",validation);
 assert.ok(committed>=0&&postCommit>committed);
 assert.ok(admin.slice(validation,postCommit).includes("if (action === \"validate\")"));
});
test("staging server must explicitly confirm an offer",async()=>{
 for(const response of [
  {ok:false,status:403,json:async()=>({action:"offered"})},
  {ok:true,json:async()=>({action:"no_eligible_volunteers"})},
  {ok:true,json:async()=>{throw Error("bad json")}},
 ]){
  const request=load({enabled:true,fetchImpl:async()=>response});
  assert.equal((await request(opts())).offered,false);
 }
});
test("network and missing ID token fail closed without breaking Admin case validation",async()=>{
 const net=load({enabled:true,fetchImpl:async()=>{throw Error("staging offline");}});
 assert.equal((await net(opts())).reason,"staging_dispatch_request_unavailable");
 const r=load({enabled:true,fetchImpl:async()=>{throw Error("fetch must not run");}});
 assert.equal((await r(opts({getIdToken:async()=>""}))).offered,false);
 assert.equal((await r(opts({getIdToken:async()=>{throw Error("expired")}}))).offered,false);
});
test("only static staging origin and fixture are permitted; production flow untouched",()=>{
 assert.match(lib,/usingStagingFirebase\s*&&\s*firebaseConfig\.projectId === "volunserve-volunteer-staging"/);
 assert.match(lib,/EXPO_PUBLIC_VOLUNSERVE_AUTO_MATCH_UI_PREVIEW === "true"/);
 assert.doesNotMatch(hook,/volunserve-3aa5b|updateDoc|setDoc|addDoc|runTransaction/);
 assert.match(admin,/if \(AUTO_VOLUNTEER_MATCH_UI_PREVIEW\)/);
 assert.match(admin,/The case is now eligible for Volunteer offers/);
});
