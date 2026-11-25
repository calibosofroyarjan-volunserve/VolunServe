"use strict";
/**
 * Exercises the EXACT isolated restored native submitVerification closure,
 * without rendering a phone or calling Firebase/AI or uploading any media.
 * All ID/selfie objects, network responses and status records are synthetic.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
const nativePath=path.join(__dirname,"../app/identity-verification.tsx");
const src=fs.readFileSync(nativePath,"utf8");
const tree=ts.createSourceFile(nativePath,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const component=tree.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==="IdentityVerification");
assert.ok(component?.body);
function actualClosure(name,locals){
  const node=component.body.statements.filter(ts.isVariableStatement)
    .flatMap(s=>s.declarationList.declarations)
    .find(d=>d.name?.getText(tree)===name);
  assert.ok(node?.initializer,"Expected exact existing native handler: "+name);
  const js=ts.transpileModule("module.exports="+node.initializer.getText(tree)+";",{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const module={exports:null};
  vm.runInNewContext(js,{module,...locals},{filename:name+".native-qa.js",timeout:1500});
  return module.exports;
}
const fakeFront={uri:"file:///fake-front.jpg",name:"qa-front.jpg",type:"image/jpeg"};
const fakeBack={uri:"file:///fake-back.jpg",name:"qa-back.jpg",type:"image/jpeg"};
const fakeSelfie={uri:"file:///fake-selfie.jpg",name:"qa-selfie.jpg",type:"image/jpeg"};
const pending={
  identityStatus:"pending",identityVerified:false,
  verificationId:"qa-firebase-persisted-20261125",
  message:"Pending independent LGU Admin review"
};
const failed={
  identityStatus:"failed",identityVerified:false,
  verificationId:"qa-firebase-failed-20261125",
  message:"Retake clearer photos"
};
const verified={
  identityStatus:"verified",identityVerified:true,
  verificationId:"qa-admin-verified-20261125",
  message:"Approved by Admin"
};
function makeScenario(options={}){
  const vals={
    idDocument:fakeFront,idBackDocument:fakeBack,selfie:fakeSelfie,
    idType:"national_id",consent:true,submitting:false,
    readyError:null,postError:null,postResult:{status:"pending",verificationId:"synthetic-pending"},
    statusResult:pending,statusError:null,platform:"android",...options
  };
  const recorded={
    ready:0,submitted:[],statusChecks:0,
    steps:[],alerts:[],messages:[],result:[],
    submitting:[],retrying:[],front:[],back:[],selfie:[],consent:[]
  };
  const callbacks={
    submitting:vals.submitting,idDocument:vals.idDocument,
    idBackDocument:vals.idBackDocument,selfie:vals.selfie,
    idType:vals.idType,consent:vals.consent,
    setStep:x=>recorded.steps.push(x),
    setSubmitting:x=>recorded.submitting.push(x),
    setLocalMessage:x=>recorded.messages.push(x),
    setStatusResult:x=>recorded.result.push(x),
    setRetryingFailed:x=>recorded.retrying.push(x),
    setIdDocument:x=>recorded.front.push(x),
    setIdBackDocument:x=>recorded.back.push(x),
    setSelfie:x=>recorded.selfie.push(x),
    setConsent:x=>recorded.consent.push(x),
    checkIdentityEngineReady:async()=>{
      recorded.ready++;
      if(vals.readyError)throw vals.readyError;
    },
    submitIdentityVerification:async request=>{
      recorded.submitted.push(request);
      if(vals.postError)throw vals.postError;
      return vals.postResult;
    },
    getIdentityVerificationStatus:async()=>{
      recorded.statusChecks++;
      if(vals.statusError)throw vals.statusError;
      return vals.statusResult;
    },
    Platform:{OS:vals.platform},
    Alert:{alert:(...args)=>recorded.alerts.push(args)}
  };
  const execute=actualClosure("submitVerification",callbacks);
  return {recorded,run:execute};
}
test("Missing ID front denies upload before readiness",async()=>{
  const {recorded,run}=makeScenario({idDocument:null});
  await run();
  assert.deepEqual(recorded.steps,[1]);
  assert.equal(recorded.ready,0);
  assert.equal(recorded.submitted.length,0);
  assert.match(recorded.alerts[0][0],/Government ID Required/);
});
test("Government ID requires reverse unless passport",async()=>{
  const {recorded,run}=makeScenario({idBackDocument:null});
  await run();
  assert.deepEqual(recorded.steps,[1]);
  assert.equal(recorded.ready,0);
  assert.equal(recorded.submitted.length,0);
});
test("Missing selfie denies upload and moves to face capture",async()=>{
  const {recorded,run}=makeScenario({selfie:null});
  await run();
  assert.deepEqual(recorded.steps,[2]);
  assert.equal(recorded.ready,0);
  assert.equal(recorded.submitted.length,0);
});
test("Missing explicit private evidence consent blocks posting",async()=>{
  const {recorded,run}=makeScenario({consent:false});
  await run();
  assert.equal(recorded.ready,0);
  assert.equal(recorded.submitted.length,0);
  assert.match(recorded.alerts[0][0],/Consent Required/);
});
test("Already-submitting screen never makes duplicate AI requests",async()=>{
  const {recorded,run}=makeScenario({submitting:true});
  await run();
  assert.equal(recorded.ready,0);
  assert.equal(recorded.submitted.length,0);
  assert.equal(recorded.statusChecks,0);
});
test("Readiness failure never posts private media or queries a nonexistent submission",async()=>{
  const {recorded,run}=makeScenario({readyError:Error("Synthetic engine unavailable")});
  await run();
  assert.equal(recorded.ready,1);
  assert.equal(recorded.submitted.length,0);
  assert.equal(recorded.statusChecks,0);
  assert.deepEqual(recorded.steps,[2]);
  assert.match(recorded.messages.at(-1),/Synthetic engine unavailable/);
  assert.deepEqual(recorded.submitting,[true,false]);
});
test("Native web readiness failure is visible inline without relying on Alert",async()=>{
  const {recorded,run}=makeScenario({readyError:Error("Synthetic readiness timeout"),platform:"web"});
  await run();
  assert.deepEqual(recorded.steps,[2]);
  assert.match(recorded.messages.at(-1),/readiness timeout/);
  assert.equal(recorded.alerts.length,0);
});
test("Confirmed Pending response sends Resident to Admin review, never promotes",async()=>{
  const {recorded,run}=makeScenario();
  await run();
  assert.deepEqual(recorded.steps,[3]);
  assert.equal(recorded.submitted.length,1);
  assert.equal(recorded.submitted[0].idDocument,fakeFront);
  assert.equal(recorded.submitted[0].idBackDocument,fakeBack);
  assert.equal(recorded.submitted[0].selfie,fakeSelfie);
  assert.equal(recorded.result[0].identityStatus,"pending");
  assert.equal(recorded.result[0].identityVerified,false);
  assert.equal(recorded.front.length,0);
  assert.equal(recorded.back.length,0);
  assert.equal(recorded.selfie.length,0);
});
test("Failed verification response shows a FAILED message instead of false Pending",async()=>{
  const {recorded,run}=makeScenario({postResult:{status:"failed"}});
  await run();
  assert.equal(recorded.result[0].identityStatus,"failed");
  assert.equal(recorded.result[0].identityVerified,false);
  assert.match(recorded.messages.at(-1),/attempt failed/i);
  assert.doesNotMatch(recorded.messages.at(-1),/pending LGU/);
  assert.deepEqual(recorded.retrying,[false]);
});
test("Passport omits nonexistent reverse ID side from submission",async()=>{
  const {recorded,run}=makeScenario({idType:"passport",idBackDocument:null});
  await run();
  assert.equal(recorded.submitted.length,1);
  assert.equal(recorded.submitted[0].idBackDocument,null);
  assert.deepEqual(recorded.steps,[3]);
});
test("Confirmed verified response releases captured media after successful Admin-approved status",async()=>{
  const {recorded,run}=makeScenario({postResult:{status:"verified"}});
  await run();
  assert.equal(recorded.result[0].identityVerified,true);
  assert.deepEqual(recorded.front,[null]);
  assert.deepEqual(recorded.back,[null]);
  assert.deepEqual(recorded.selfie,[null]);
  assert.deepEqual(recorded.consent,[false]);
});
test("Lost POST response + saved Pending record reconciles without asking for another selfie",async()=>{
  const {recorded,run}=makeScenario({postError:Error("Network dropped after Firebase commit"),statusResult:pending});
  await run();
  assert.equal(recorded.submitted.length,1);
  assert.equal(recorded.statusChecks,1);
  assert.deepEqual(recorded.steps,[3,3]);
  assert.deepEqual(recorded.result,[pending]);
  assert.deepEqual(recorded.retrying,[false]);
  assert.equal(recorded.alerts.length,0);
  assert.match(recorded.messages.at(-1),/Pending independent LGU/);
});
test("Lost POST response + saved failed attempt displays FAILED, never Pending",async()=>{
  const {recorded,run}=makeScenario({postError:Error("Interrupted response"),statusResult:failed});
  await run();
  assert.equal(recorded.statusChecks,1);
  assert.deepEqual(recorded.result,[failed]);
  assert.deepEqual(recorded.steps,[3,3]);
  assert.equal(recorded.alerts.length,0);
});
test("Lost POST response + confirmed Admin-verified status reconciles verified",async()=>{
  const {recorded,run}=makeScenario({postError:Error("Connection lost"),statusResult:verified});
  await run();
  assert.equal(recorded.statusChecks,1);
  assert.deepEqual(recorded.result,[verified]);
  assert.equal(recorded.alerts.length,0);
});
test("Contradictory Verified status with identityVerified=false NEVER promotes",async()=>{
  const {recorded,run}=makeScenario({
    postError:Error("No reply"),
    statusResult:{identityStatus:"verified",identityVerified:false}
  });
  await run();
  assert.deepEqual(recorded.steps,[3,2]);
  assert.equal(recorded.result.length,0);
  assert.equal(recorded.retrying.length,0);
  assert.equal(recorded.statusChecks,1);
  assert.equal(recorded.alerts.length,1);
});
test("Unconfirmed/basic account status cannot be invented as Pending",async()=>{
  const {recorded,run}=makeScenario({
    postError:Error("Connection lost"),
    statusResult:{identityStatus:"basic",identityVerified:false}
  });
  await run();
  assert.deepEqual(recorded.steps,[3,2]);
  assert.equal(recorded.result.length,0);
  assert.equal(recorded.statusChecks,1);
  assert.match(recorded.messages.at(-1),/Connection lost/);
});
test("If authoritative status lookup fails, native fails safely and shows captured-media retry",async()=>{
  const {recorded,run}=makeScenario({
    postError:Error("Unconfirmed submission"),
    statusError:Error("Synthetic Firebase unavailable")
  });
  await run();
  assert.equal(recorded.statusChecks,1);
  assert.deepEqual(recorded.steps,[3,2]);
  assert.deepEqual(recorded.result,[]);
  assert.match(recorded.messages.at(-1),/Unconfirmed submission/);
  assert.deepEqual(recorded.submitting,[true,false]);
});
test("Failed screen has a retry button with clean ID/selfie/consent state and cannot hide Pending",()=>{
  const failedBranch=src.indexOf('if (effectiveStatus === "failed")');
  const pendingBranch=src.indexOf('effectiveStatus ===\n    "pending"');
  assert.ok(failedBranch>=0 && pendingBranch>failedBranch);
  const jsx=src.slice(failedBranch,pendingBranch);
  for(const name of [
    "setRetryingFailed(true)","setStatusResult(null)","setIdDocument(null)",
    "setIdBackDocument(null)","setSelfie(null)","setConsent(false)",
    "setDocumentConsent(false)","setStep(1)"
  ])assert.ok(jsx.includes(name),"Retry action must clear "+name);
  assert.match(src,/retryingFailed && latestIdentityStatus === "failed"/);
  assert.match(src,/identityStatus === "pending"/);
  assert.match(src,/identityStatus === "verified"/);
});
