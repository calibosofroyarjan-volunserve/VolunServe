"use strict";
/**
 * Local synthetic-only tests. No real auth, camera, government ID or upload.
 * The AI engine may be healthy while the separately configured staging
 * private upload gate is intentionally disabled. Always fail closed.
 */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const path = "lib/identityMediaAvailability.ts";
const source = fs.readFileSync(path, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length || 0, 0);
const mocked = {exports:{}};
vm.runInNewContext(compiled.outputText, {
  module:mocked, exports:mocked.exports, Error,
}, {filename:"identityMediaAvailability.js"});
const {assertIdentityMediaSubmissionAllowed, IDENTITY_MEDIA_PAUSED_MESSAGE} = mocked.exports;

test("healthy AI engine but mediaSubmissionEnabled=false MUST block ID photos", () => {
  assert.throws(
    () => assertIdentityMediaSubmissionAllowed({ready:true,mediaSubmissionEnabled:false}),
    /submissions are paused in this staging environment/,
  );
  assert.match(IDENTITY_MEDIA_PAUSED_MESSAGE,/No identity images were sent/);
});

test("omitted, ambiguous or dishonest upload-readiness state fails closed", () => {
  for (const data of [null, undefined, {}, {ready:true}, {ready:false,mediaSubmissionEnabled:true},
                      {ready:true,mediaSubmissionEnabled:0}, {ready:true,mediaSubmissionEnabled:"true"},
                      {ready:1,mediaSubmissionEnabled:true}, {ready:true,mediaSubmissionEnabled:null}]) {
    assert.throws(() => assertIdentityMediaSubmissionAllowed(data),/submissions are paused/);
  }
});

test("only explicit healthy + enabled media gate allows proceeding (never verifies identity)", () => {
  assert.doesNotThrow(
    () => assertIdentityMediaSubmissionAllowed({ready:true,mediaSubmissionEnabled:true}),
  );
  assert.doesNotMatch(source,/identityVerified\s*=\s*true/);
  assert.doesNotMatch(source,/livenessVerified\s*=\s*true/);
  assert.doesNotMatch(source,/Verified Resident.*approved/);
});

test("client health must inspect media capability, not just AI readiness", () => {
  const client = fs.readFileSync("lib/identityVerification.ts", "utf8");
  const start = client.indexOf("export async function checkIdentityEngineReady()");
  const end = client.indexOf("export const submitIdentityVerification", start);
  assert(start >= 0 && end > start);
  const section = client.slice(start, end);
  assert.match(section,/assertIdentityMediaSubmissionAllowed\(body\)/);
  assert(section.indexOf("assertIdentityMediaSubmissionAllowed(body)") >
         section.indexOf("const body = await readResponseBody(response)"));
});

test("both web/native must check permission BEFORE any government ID camera access", () => {
  const web = fs.readFileSync("app/identity-verification.web.tsx", "utf8");
  const native = fs.readFileSync("app/identity-verification.tsx", "utf8");
  const choose = web.slice(web.indexOf("const chooseIdDocument = async"),web.indexOf("const captureIdDocument =",web.indexOf("const chooseIdDocument = async")));
  assert(choose.includes("await checkIdentityEngineReady()"));
  assert(choose.indexOf("await checkIdentityEngineReady()") < choose.indexOf("setIdCameraOpen(true)"));
  const capture = native.slice(native.indexOf("const captureIdSide = async"),native.indexOf("const chooseIdDocument =",native.indexOf("const captureIdSide = async")));
  assert(capture.includes("await checkIdentityEngineReady()"));
  assert(capture.indexOf("await checkIdentityEngineReady()") <
         capture.indexOf("ImagePicker.requestCameraPermissionsAsync()"));
  assert(capture.indexOf("await checkIdentityEngineReady()") <
         capture.indexOf("ImagePicker.launchCameraAsync("));
});

test("backend HTTP 423 gate stays directly before private multipart handlers", () => {
  const server = fs.readFileSync("backend/server.js", "utf8");
  const probe = fs.readFileSync("backend/identityAiReadiness.js", "utf8");
  assert.match(server,/STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED\s*=\s*false/);
  for (const endpoint of ["/api/identity/document/precheck", "/api/identity/verify"]) {
    const i = server.indexOf('"' + endpoint + '"');
    assert(i >= 0);
    const handler = server.slice(i, i + 310);
    assert.match(handler,/requireStagingIdentityMediaApproval/);
  }
  assert.match(probe,/mediaSubmissionEnabled:\s*false/);
});
