"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const source=fs.readFileSync("lib/automaticVolunteerApprovalBridge.ts","utf8");
const admin=fs.readFileSync("app/(admin)/admin-cases.tsx","utf8");

function load(flags,project,fetchImpl){
  const wrapped=source.replace(
    'import { firebaseConfig } from "./firebase";',
    'const firebaseConfig = {projectId:'+JSON.stringify(project)+'};'
  );
  const transpiled=ts.transpileModule(wrapped,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
    reportDiagnostics:true
  });
  assert.equal((transpiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
  const module={exports:{}};
  vm.runInNewContext(transpiled.outputText,{
    exports:module.exports,module,process:{env:flags},
    fetch:fetchImpl,AbortController,setTimeout,clearTimeout,
    Number,String,Object,Promise,Error,JSON
  });
  return module.exports;
}
const adminToken={getIdToken:async()=>"fictional-test-token"};
const enabled={
  EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"production",
  EXPO_PUBLIC_VOLUNSERVE_AUTO_INVITES_REVIEWED:"yes"
};
const ok=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});

test("zero network or token access unless explicit web release flag and production Firebase target",async()=>{
  let network=0,tokens=0;
  const u={getIdToken:async()=>{tokens++;return "never";}};
  for(const [flags,project] of [
    [{}, "volunserve-3aa5b"],
    [enabled,"volunserve-volunteer-staging"],
    [{...enabled,EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"staging"},"volunserve-3aa5b"]
  ]){
    const bridge=load(flags,project,async()=>{network++;throw Error("never fetch");});
    const r=await bridge.requestAutomaticVolunteersAfterApproval({caseId:"fictional_case",user:u});
    assert.equal(r.enabled,false);
    assert.equal(r.status,"disabled");
  }
  assert.equal(network,0);
  assert.equal(tokens,0);
});
test("bad case ID is refused before requesting any sign-in token",async()=>{
  let network=0,tokens=0;
  const bridge=load(enabled,"volunserve-3aa5b",async()=>{network++;});
  const r=await bridge.requestAutomaticVolunteersAfterApproval({
    caseId:"../../actual_report",
    user:{getIdToken:async()=>{tokens++;return "never";}}
  });
  assert.equal(r.status,"blocked");
  assert.equal(network,0);
  assert.equal(tokens,0);
});
test("after Admin validation: one signed backend POST, confirms all eligible invites",async()=>{
  const requests=[];
  const bridge=load(enabled,"volunserve-3aa5b",async(url,options)=>{
    requests.push({url,options});
    return ok({ok:true,status:"offered",wave:1,offered:3});
  });
  const r=await bridge.requestAutomaticVolunteersAfterApproval({
    caseId:"fictional_approved_report",user:adminToken
  });
  assert.equal(r.status,"offered");
  assert.equal(r.offered,3);
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,
    "https://volunserve.onrender.com/api/admin/emergency-auto/offer-after-validation");
  assert.equal(requests[0].options.method,"POST");
  assert.equal(requests[0].options.headers.Authorization,
    "Bearer fictional-test-token");
  assert.deepEqual(JSON.parse(requests[0].options.body),
    {caseId:"fictional_approved_report"});
});
test("existing verified batch is reported without falsely claiming a new dispatch",async()=>{
  const bridge=load(enabled,"volunserve-3aa5b",async()=>
    ok({ok:true,status:"already_started",wave:1,offered:2})
  );
  const r=await bridge.requestAutomaticVolunteersAfterApproval({
    caseId:"fictional_case",user:adminToken
  });
  assert.equal(r.enabled,true);
  assert.equal(r.status,"already_started");
  assert.equal(r.offered,2);
  assert.ok(admin.includes("No duplicate invitations sent."));
});
test("backend 503, malformed reply and network error never claim invitations sent",async()=>{
  for(const response of [
    ok({ok:false,status:"blocked",reason:"automatic_volunteer_release_not_authorized"},503),
    ok({ok:true,status:"already_started",offered:0}),
    ok({ok:true,status:"offered",offered:0}),
  ]){
    const bridge=load(enabled,"volunserve-3aa5b",async()=>response);
    const r=await bridge.requestAutomaticVolunteersAfterApproval({
      caseId:"fictional_case",user:adminToken
    });
    assert.notEqual(r.status,"offered");
    assert.equal(r.offered,0);
  }
  const offline=load(enabled,"volunserve-3aa5b",async()=>{throw Error("offline")});
  assert.equal((await offline.requestAutomaticVolunteersAfterApproval({
    caseId:"fictional_case",user:adminToken
  })).status,"unavailable");
});
test("Admin triggers after approval transaction and avoids duplicate approved-case rewrites",()=>{
  const fn=admin.indexOf("const reviewVerification = async");
  assert.ok(fn>=0);
  const txn=admin.indexOf("const validationOutcome = await runTransaction",fn);
  const dispatch=admin.indexOf("await requestAutomaticVolunteersAfterApproval(",txn);
  assert.ok(txn>fn && dispatch>txn);
  const segment=admin.slice(txn,dispatch);
  assert.ok(segment.includes('if (action === "validate" && currentVerification === "validated")'));
  assert.ok(segment.includes("return { alreadyValidated: true };"));
  assert.ok(segment.includes("return { alreadyValidated: false };"));
  assert.ok(segment.includes('if (action === "validate")'));
  assert.ok(admin.includes("automatic invitations were NOT confirmed"));
  assert.ok(!source.includes("runTransaction(") && !source.includes("updateDoc("),
    "The new UI bridge must NEVER write Firebase directly");
});
