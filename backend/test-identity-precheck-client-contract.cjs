"use strict";
/** Runtime tests of the REAL shared TypeScript transfer functions and pure
 * OCR gate; synthetic media only, no external network/Firebase/ID photos.
 */
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");

function compileToExports(source, extra = {}) {
  const output = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics?.length || 0, 0);
  const module = {exports: {}};
  vm.runInNewContext(output.outputText, {
    module, exports: module.exports, Error, Set, String, Array, Object,
    Promise, ...extra,
  }, {timeout: 4000});
  return module.exports;
}

const policySource = fs.readFileSync("lib/identityPrecheckContract.ts", "utf8");
const {resolveIdentityPrecheckOutcome: resolve} = compileToExports(policySource);
function screening(type="national_id") {
  return {
    declaredIdType: type, detectedIdType: type,
    status: "text_consistent_unverified", warningCodes: [],
    imageQualityStatus: "adequate", backSideProvided: true,
    backSideScreened: true, backImageQualityStatus: "adequate",
    profileBirthDateCheck: "possible_match",
  };
}

test("real OCR precheck contract accepts only complete and consistent sides", () => {
  assert.equal(resolve("national_id", "pass", screening()), "pass");
  const passport = {...screening("passport"), backSideProvided: false,
    backSideScreened: false, backImageQualityStatus: "not_required"};
  assert.equal(resolve("passport", "pass", passport), "pass");
  for (const patch of [
    {warningCodes: ["school_id_not_supported"]},
    {warningCodes: null}, {warningCodes: ["", 12]},
    {detectedIdType: "passport"}, {declaredIdType: "passport"},
    {backSideProvided: false}, {backSideScreened: false},
    {backImageQualityStatus: "low"},
    {imageQualityStatus: "low"},
    {profileBirthDateCheck: "possible_conflict"},
    {passportMrzCheck: "multiple_candidates"},
  ]) {
    assert.equal(resolve("national_id", "pass", {...screening(), ...patch}), "retry",
      JSON.stringify(patch));
  }
  assert.equal(resolve("national_id", "pass", null), "retry");
});

test("blur-review cannot be faked by school ID, wrong side or unsupported response", () => {
  const blurred = {...screening(), status: "inconclusive",
    imageQualityStatus: "low", detectedIdType: null,
    warningCodes: ["low_document_image_quality"]};
  assert.equal(resolve("national_id", "review", blurred), "review");
  for (const patch of [
    {warningCodes: ["low_document_image_quality", "school_id_not_supported"]},
    {warningCodes: ["document_front_back_swapped", "low_document_image_quality"]},
    {imageQualityStatus: "adequate"},
    {detectedIdType: "drivers_license"},
    {status: "unsupported"},
  ]) {
    assert.equal(resolve("national_id", "review", {...blurred, ...patch}), "retry",
      JSON.stringify(patch));
  }
  assert.equal(resolve("passport", "review", {...blurred, declaredIdType: "passport"}),
    "retry");
});

const clientSource = fs.readFileSync("lib/identityVerification.ts", "utf8");
const parsed = ts.createSourceFile("lib/identityVerification.ts", clientSource,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const keep = new Set(["precheckIdentityDocument",
  "submitIdentityVerification", "ensureStagingIdentityMediaTransferReady"]);
const nodes = parsed.statements.filter(node => {
  if (ts.isFunctionDeclaration(node)) return keep.has(node.name?.text);
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.some(
    d => ts.isIdentifier(d.name) && keep.has(d.name.text));
  return false;
});
assert.equal(nodes.length, 3, "Missing an actual shared API method or capability helper");
const selectedTs = nodes.map(node => node.getText(parsed)).join("\n");

function harness(environment, enabled = false, responsePayload = null) {
  const counts = {forms:0, appends:0, health:0, mediaRequests:0};
  class SyntheticFormData {
    constructor() { counts.forms++; }
    append() { counts.appends++; }
  }
  const mock = {
    process:{env:{EXPO_PUBLIC_VOLUNSERVE_ENV:environment,
      EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:environment}},
    auth:{app:{options:{projectId:environment === "staging"
      ? "volunserve-full-staging" : "volunserve-3aa5b"}}},
    identityEnvironmentTarget: () => environment,
    checkIdentityEngineReady:async () => {
      counts.health++;
      if (!enabled) throw Error("Government ID and selfie submissions are paused in this staging environment. No identity images were sent.");
    },
    validateMedia: () => undefined,
    getAuthenticatedUser: async () => ({getIdToken: async () => "synthetic-token"}),
    FormData:SyntheticFormData,
    appendMedia: () => {counts.appends++;},
    getBackendBaseUrl:()=> "https://staging.invalid",
    fetchWithTimeout: async(url, opts) => {
      if (opts.method === "POST") counts.mediaRequests++;
      return {ok:true,status:200};
    },
    readResponseBody: async () => responsePayload ?? {outcome:"pass", documentScreening:screening(), message:"synthetic"},
    parseDocumentScreening: x => x,
    resolveIdentityPrecheckOutcome:resolve,
    getResponseMessage:(body, fallback) => body?.message || fallback,
    normalizeStatus: x => x,
    optionalNumber: x => x,
  };
  return {api:compileToExports(selectedTs, mock), counts};
}
const media = {uri:"fake-memory:", name:"synthetic.jpg", type:"image/jpeg"};
const input = {idType:"national_id", idDocument:media,
  idBackDocument:media, selfie:media, consent:true};

test("direct staging ID-only precheck cannot construct or send multipart while paused", async()=>{
  const {api,counts} = harness("staging");
  await assert.rejects(api.precheckIdentityDocument(input), /submissions are paused/);
  assert.equal(counts.health,1);
  assert.equal(counts.forms,0);
  assert.equal(counts.appends,0);
  assert.equal(counts.mediaRequests,0);
});

test("direct staging ID+selfie submit cannot construct or send multipart while paused", async()=>{
  const {api,counts} = harness("staging");
  await assert.rejects(api.submitIdentityVerification(input), /submissions are paused/);
  assert.equal(counts.health,1);
  assert.equal(counts.forms,0);
  assert.equal(counts.appends,0);
  assert.equal(counts.mediaRequests,0);
});

test("staging with explicitly approved capability allows processing (not approval)", async()=>{
  const {api,counts} = harness("staging",true);
  const outcome = await api.precheckIdentityDocument(input);
  assert.equal(outcome.outcome,"pass");
  assert.equal(counts.health,1);
  assert.equal(counts.mediaRequests,1);
});

test("production shared client behavior isn't blocked by staging-specific health check", async()=>{
  const {api,counts} = harness("production");
  const outcome = await api.precheckIdentityDocument(input);
  assert.equal(outcome.outcome,"pass");
  assert.equal(counts.health,0);
  assert.equal(counts.mediaRequests,1);
});

test("contradictory upstream pass returns retry and truthful text", async()=>{
  const bad = {...screening(), warningCodes:["document_back_looks_like_front"]};
  const {api} = harness("production",false,{
    outcome:"pass", documentScreening:bad, message:"Everything passed!"});
  const result = await api.precheckIdentityDocument(input);
  assert.equal(result.outcome,"retry");
  assert.match(result.message,/incomplete or conflicting/);
  assert.doesNotMatch(result.message,/Everything passed/);
});
