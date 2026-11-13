"use strict";
/**
 * Synthetic Resident UI/status integration contract, exercising the ACTUAL
 * shared status API function and existing Admin-review backend E2E separately.
 * No real auth, Firebase, camera, government ID or external network.
 */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const policyText = fs.readFileSync("lib/identityResidentStatusContract.ts", "utf8");
const apiText = fs.readFileSync("lib/identityVerification.ts", "utf8");

function executeTypeScript(code, mock = {}) {
  const compiled = ts.transpileModule(code, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length || 0, 0);
  const module = {exports:{}};
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports,
    Error, String, Number, Promise, Array, Object,
    ...mock,
  }, {filename:"identityResidentContract.transpiled.js", timeout:4000});
  return module.exports;
}

const policy = executeTypeScript(policyText);
const node = ts.createSourceFile("lib/identityVerification.ts",apiText,
  ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const statusAst = node.statements.find(x=>
  ts.isVariableStatement(x) && x.declarationList.declarations.some(y=>
    ts.isIdentifier(y.name) && y.name.text === "getIdentityVerificationStatus"));
assert.ok(statusAst,"shared Resident status function is missing");

async function callActualClient(statusPayload) {
  const counts = {calls:0};
  const mocks = {
    getAuthenticatedUser: async () => ({getIdToken:async()=> "fake-auth"}),
    getBackendBaseUrl: () => "https://synthetic.invalid",
    fetchWithTimeout: async (url, options) => {
      counts.calls++;
      assert.match(url,/\/api\/identity\/status$/);
      assert.equal(options.method,"GET");
      assert.equal(options.headers.Authorization,"Bearer fake-auth");
      return {ok:true,status:200};
    },
    readResponseBody: async() => statusPayload,
    getResponseMessage:()=> "No identity status",
    reconcileResidentIdentityStatus: policy.reconcileResidentIdentityStatus,
    reconcileResidentIdentityDecision: policy.reconcileResidentIdentityDecision,
    optionalNumber: x => typeof x==="number"&&Number.isFinite(x)?x:undefined,
    parseDocumentScreening:()=> undefined,
  };
  const {getIdentityVerificationStatus} = executeTypeScript(
    statusAst.getText(node),mocks);
  return {body:await getIdentityVerificationStatus(),counts};
}

test("only authoritative flag + matching verified status display Verified Resident",async()=>{
  const {body,counts} = await callActualClient({
    identityStatus:"verified",identityVerified:true,decision:"verified",
    message:"Admin independently verified the synthetic account.",
  });
  assert.equal(body.identityStatus,"verified");
  assert.equal(body.identityVerified,true);
  assert.equal(body.decision,"verified");
  assert.equal(counts.calls,1);
});

test("AI or stale row saying verified NEVER overrides false profile flag",async()=>{
  for(const payload of [
    {identityStatus:"verified",identityVerified:false,decision:"verified"},
    {identityStatus:"verified",decision:"verified"},
    {identityStatus:"verified",identityVerified:"true",decision:"verified"},
    {identityStatus:"verified",identityVerified:1,decision:"verified"},
    {identityStatus:"pending",identityVerified:true,decision:"manual_review"},
  ]) {
    const {body}=await callActualClient(payload);
    assert.notEqual(body.identityStatus,"verified",JSON.stringify(payload));
    assert.equal(body.identityVerified,false,JSON.stringify(payload));
    assert.notEqual(body.decision,"verified",JSON.stringify(payload));
  }
});

test("real shared status API preserves Admin pending and Require Retry cases",async()=>{
  for(const [payload,expected] of [
    [{identityStatus:"pending",identityVerified:false,decision:"manual_review"},"pending"],
    [{identityStatus:"failed",identityVerified:false,decision:"retry_required"},"failed"],
    [{identityStatus:"basic",identityVerified:false,decision:""},"basic"],
    [{identityStatus:"invalid",identityVerified:false,decision:"verified"},"basic"],
  ]) {
    const {body}=await callActualClient(payload);
    assert.equal(body.identityStatus,expected);
    assert.equal(body.identityVerified,false);
    if(expected==="failed")assert.equal(body.decision,"retry_required");
  }
});

test("both real Resident screens use shared authoritative API and manual refresh",()=>{
  for(const file of ["app/identity-verification.web.tsx",
                    "app/identity-verification.tsx"]) {
    const code=fs.readFileSync(file,"utf8");
    assert.match(code,/getIdentityVerificationStatus/);
    assert.match(code,/setStatusResult\(result\)/);
    assert.match(code,/refreshStatus/);
  }
  const admin=fs.readFileSync("app/(admin)/identity-reviews.tsx","utf8");
  assert.match(admin,/\/api\/admin\/identity\/reviews/);
  assert.match(admin,/\/decision/);
  assert.match(admin,/adminReviewDocumentEligible/);
  assert.match(admin,/issuerReviewAttested/);
});
