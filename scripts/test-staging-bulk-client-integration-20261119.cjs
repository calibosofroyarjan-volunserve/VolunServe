"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
const ROOT=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(ROOT,"lib/stagingBulkVolunteerClient.ts"),"utf8");
const env={
  EXPO_PUBLIC_AUTO_VOLUNTEER_DISPATCH_ENABLED:"true",
  EXPO_PUBLIC_AUTO_VOLUNTEER_STAGING_ONLY:"true",
  EXPO_PUBLIC_AUTO_VOLUNTEER_MATCH_PROVIDER:"render",
  EXPO_PUBLIC_AUTO_VOLUNTEER_STAGING_PROJECT_ID:"volunserve-volunteer-staging",
};
const STAGING="volunserve-volunteer-staging";
const batch={caseId:"STAGING_E2E_002",volunteerId:"fakeVolunteer",offerMode:"staging_bulk_all_eligible"};
function load(flags,fetchFn){
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,
   module:ts.ModuleKind.CommonJS,strict:true},reportDiagnostics:true});
 const errors=(compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,"TypeScript transpilation diagnostics");
 const module={exports:{}};
 vm.runInNewContext(compiled.outputText,{
   exports:module.exports,module,fetch:fetchFn,process:{env:flags},Error,JSON,String,Number,
   Object,Array,Promise
 },{filename:"stagingBulkVolunteerClient.js",timeout:5000});
 return module.exports;
}
function token(){return {getIdToken:async()=>"test_token_is_not_a_real_credential"};}
function answer(data,status=200){
 return {ok:status>=200&&status<300,status,json:async()=>data};
}
test("production build and missing stage flag never call staging network or Firebase",async()=>{
 let network=0;
 const bridge=load({},async()=>{network++;return answer({ok:true,status:"accepted"});});
 await assert.rejects(bridge.respondToStagingBulkOffer(batch,"accepted",batch.volunteerId,
   STAGING,token()),/disabled outside/);
 await assert.rejects(bridge.ensureStagingBulkOffersAfterAdminValidation(
   batch.caseId,STAGING,token()),/disabled outside/);
 assert.equal(network,0);
});
test("production Firebase project mismatches staging and rejects BEFORE fetching token",async()=>{
 let touched=0;
 const bridge=load(env,async()=>{touched++;throw Error("should not fetch");});
 const auth={getIdToken:async()=>{touched++;throw Error("should not get token");}};
 await assert.rejects(bridge.respondToStagingBulkOffer(batch,"accepted",
   batch.volunteerId,"volunserve-3aa5b",auth),/disabled outside/);
 await assert.rejects(bridge.ensureStagingBulkOffersAfterAdminValidation(
   batch.caseId,"volunserve-3aa5b",auth),/disabled outside/);
 assert.equal(touched,0);
});
test("wrong case and wrong Volunteer owner block even with staging flags",async()=>{
 let requests=0;
 const bridge=load(env,async()=>{requests++;return answer({ok:true,status:"accepted"});});
 await assert.rejects(bridge.respondToStagingBulkOffer(
   {...batch,caseId:"real_incident_123"},"accepted",batch.volunteerId,STAGING,token()),
 /ownership mismatch/);
 await assert.rejects(bridge.respondToStagingBulkOffer(batch,"accepted",
   "otherVolunteer",STAGING,token()),/ownership mismatch/);
 await assert.rejects(bridge.ensureStagingBulkOffersAfterAdminValidation(
   "real_case",STAGING,token()),/limited to the fictional/);
 assert.equal(requests,0);
});
test("real stage Volunteer Accept and Decline produce one authenticated server action each",async()=>{
 const requests=[];
 const bridge=load(env,async(url,init)=>{
  requests.push({url,init});
  return answer({ok:true,status:JSON.parse(init.body).decision});
 });
 assert.equal((await bridge.respondToStagingBulkOffer(
   batch,"accepted",batch.volunteerId,STAGING,token())).status,"accepted");
 assert.equal((await bridge.respondToStagingBulkOffer(
   batch,"declined",batch.volunteerId,STAGING,token())).status,"declined");
 assert.equal(requests.length,2);
 for(const r of requests){
  assert.ok(r.url.endsWith("/api/staging/volunteer/e2e-002/bulk-respond"));
  assert.equal(r.init.method,"POST");
  assert.equal(r.init.headers.Authorization,"Bearer test_token_is_not_a_real_credential");
  assert.equal(JSON.parse(r.init.body).caseId,batch.caseId);
 }
});
test("backend denial never falls back to legacy client writes",async()=>{
 let hits=0;
 const bridge=load(env,async()=>{hits++;return answer({ok:false,error:"isolated_bulk_staging_disabled"},503);});
 await assert.rejects(bridge.respondToStagingBulkOffer(batch,"accepted",
   batch.volunteerId,STAGING,token()),/isolated_bulk_staging_disabled/);
 assert.equal(hits,1);
});
test("Admin checks status/preview then sends exactly one all-eligible batch",async()=>{
 const requests=[];
 const replies=[
  answer({ok:true,status:"not_started"}),
  answer({ok:true,status:"offer_all",wave:1,eligibleInSelectedWave:3}),
  answer({ok:true,status:"offered",wave:1,offered:3})
 ];
 const bridge=load(env,async(url,init)=>{
  requests.push({url,init});
  return replies.shift();
 });
 const r=await bridge.ensureStagingBulkOffersAfterAdminValidation(
   batch.caseId,STAGING,token());
 assert.equal(r.status,"offered");
 assert.equal(r.offered,3);
 assert.equal(requests.length,3);
 assert.ok(requests[0].url.endsWith("/bulk-status"));
 assert.ok(requests[1].url.endsWith("/bulk-preview"));
 assert.ok(requests[2].url.endsWith("/bulk-send"));
 assert.equal(JSON.parse(requests[2].init.body).confirmAllEligibleTestOffers,true);
});
test("Admin does not re-offer an existing staging batch",async()=>{
 let requests=0;
 const bridge=load(env,async()=>{requests++;return answer({ok:true,status:"waiting",wave:1});});
 const r=await bridge.ensureStagingBulkOffersAfterAdminValidation(
   batch.caseId,STAGING,token());
 assert.equal(r.status,"already_started");
 assert.equal(requests,1);
});
test("Existing Volunteer web/native cards guard backend-owned batch BEFORE Firestore writes",()=>{
 const web=fs.readFileSync(path.join(ROOT,"app/(tabs)/volunteer.web.tsx"),"utf8");
 const mobile=fs.readFileSync(path.join(ROOT,"app/(tabs)/volunteer.tsx"),"utf8");
 for(const [name,data] of [["web",web],["native",mobile]]){
  assert.ok(data.includes("respondToStagingBulkOffer("),name);
  const guard=data.indexOf("if (isStagingBulkAssignment(assignment))");
  const write=data.indexOf("await runTransaction",guard);
  assert.ok(guard>-1&&write>guard,name+" staging path precedes legacy Firestore write");
  assert.ok(data.slice(guard,write).includes("return;"),name+" staging always returns");
  assert.ok(data.includes("!isStagingBulkAssignment(assignment)"),name+" stage cannot claim live map");
 }
 const admin=fs.readFileSync(path.join(ROOT,"app/(admin)/admin-cases.tsx"),"utf8");
 assert.ok(admin.includes("ensureStagingBulkOffersAfterAdminValidation("));
 assert.ok(admin.includes("incident.id === STAGING_BULK_CASE_ID"));
});
