"use strict";
// Pure local test of the EXACT TypeScript resolver in lib/identityVerification.ts.
// No Firebase SDK, ID photo, API network calls, or environment writes.
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const original = fs.readFileSync("lib/identityVerification.ts", "utf8");
const start = original.indexOf("const FALLBACK_BACKEND_URL =");
const end = original.indexOf("\nasync function getAuthenticatedUser()", start);
assert(start >= 0 && end > start, "Expected bounded resolver source from production-based branch");
const compiled = ts.transpileModule(original.slice(start, end), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
if ((compiled.diagnostics?.length || 0) > 0) {
  const details = compiled.diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\\n"));
  throw new Error("Identity TypeScript resolver fixture did not compile: " + details.join(" | "));
}
const moduleMock = { exports: {} };
vm.runInNewContext(compiled.outputText, {
  module: moduleMock,
  exports: moduleMock.exports,
  URL,
  process: { env: {} },
  auth: { app: { options: { projectId: "volunserve-3aa5b" } } },
}, { filename: "identityVerification-extracted-env-gate.js" });
const resolve = moduleMock.exports.resolveIdentityBackendBaseUrl;
assert.equal(typeof resolve, "function");

const liveProject = "volunserve-3aa5b";
const qaProject = "volunserve-full-staging";

test("existing production clients retain original safe backend URL", () => {
  assert.equal(resolve("production", liveProject), "https://volunserve.onrender.com");
  assert.equal(
    resolve("production", liveProject, "https://volunserve.onrender.com/api/identity/status"),
    "https://volunserve.onrender.com",
  );
  assert.equal(
    resolve("production", liveProject, "https://volunserve.onrender.com/api/identity/verify"),
    "https://volunserve.onrender.com",
  );
});

test("staging requires separate Firebase and an explicit nonproduction backend", () => {
  assert.equal(
    resolve("staging", qaProject, "https://volunserve-backend-staging.onrender.com"),
    "https://volunserve-backend-staging.onrender.com",
  );
  assert.throws(() => resolve("staging", qaProject), /staging identity api url is required/i);
  assert.throws(() => resolve("staging", liveProject, "https://volunserve-backend-staging.onrender.com"), /separate Firebase/i);
});

test("staging identity photos or tokens cannot be sent to known production endpoints", () => {
  for (const origin of [
    "https://volunserve.onrender.com", "https://volunserve.com",
    "https://www.volunserve.com", "https://volunserve.org",
  ]) {
    assert.throws(() => resolve("staging", qaProject, origin), /cannot connect to production/i);
  }
});

test("production identity photos cannot go to staging URL or staging Firebase", () => {
  assert.throws(() =>
    resolve("production", liveProject, "https://volunserve-backend-staging.onrender.com"),
    /cannot connect to staging/i,
  );
  assert.throws(() =>
    resolve("production", qaProject),
    /project mismatch/i,
  );
});

test("invalid or unsafe backend URLs fail closed", () => {
  for (const invalid of [
    "http://volunserve.onrender.com", "javascript:alert(1)", "file:///etc/passwd",
    "https://volunserve.onrender.com?private=1",
    "https://someone:password@volunserve.onrender.com",
    "not a URL",
  ]) {
    assert.throws(() => resolve("production", liveProject, invalid));
  }
  assert.throws(() => resolve("wrong", liveProject), /valid Firebase target/i);
});

test("isolated local staging QA permits localhost only with explicit staging target", () => {
  assert.equal(
    resolve("staging", qaProject, "http://127.0.0.1:3000"),
    "http://127.0.0.1:3000",
  );
  assert.throws(() => resolve("production", liveProject, "http://127.0.0.1:3000"));
});
