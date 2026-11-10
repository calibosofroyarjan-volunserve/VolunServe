"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

const source = fs.readFileSync(path.join(root, "lib/stagingCertificateBackend.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function policy(isStagingPreview) {
  const moduleRef = { exports: {} };
  const requireStub = (name) => {
    assert.equal(name, "./stagingBackendSafety");
    return {
      isStagingPreview,
      getSafeVolunServeBackendBaseUrl: () => "https://volunserve.onrender.com",
    };
  };
  new Function("module", "exports", "require", js)(moduleRef, moduleRef.exports, requireStub);
  return moduleRef.exports;
}

const staging = policy(true);
assert.equal(staging.getCommunityCertificateBackendBaseUrl(),
  "https://volunserve-backend-staging.onrender.com");
assert.equal(staging.COMMUNITY_CERTIFICATE_MINIMUM_MINUTES, 1);
assert.notEqual(staging.getCommunityCertificateBackendBaseUrl(), "https://volunserve.onrender.com");
const production = policy(false);
assert.equal(production.getCommunityCertificateBackendBaseUrl(), "https://volunserve.onrender.com");
assert.equal(production.COMMUNITY_CERTIFICATE_MINIMUM_MINUTES, 30);

const attendance = fs.readFileSync(path.join(root, "app/(admin)/community-attendance.tsx"), "utf8");
assert.match(attendance, /getCommunityCertificateBackendBaseUrl\(\)/);
assert.match(attendance, /getCommunityCertificateBackendBaseUrl/);
assert.match(attendance, /COMMUNITY_CERTIFICATE_MINIMUM_MINUTES \* 60 \* 1000/);
assert.match(attendance, /\{COMMUNITY_CERTIFICATE_MINIMUM_MINUTES\}m minimum met/);
assert.match(attendance, /\{serviceMinimumCount\} verified with \{COMMUNITY_CERTIFICATE_MINIMUM_MINUTES\}\+ min/);
assert.match(attendance, /at least \{COMMUNITY_CERTIFICATE_MINIMUM_MINUTES\} min/);
assert.match(attendance, /\/api\/admin\/community-certificates\/reconcile/);
assert.match(attendance, /Authorization: `Bearer \$\{idToken\}`/);
assert.doesNotMatch(attendance, /https:\/\/volunserve\.onrender\.com/);
assert.doesNotMatch(attendance, /30m minimum met|at least 30 minutes|verified with 30\+ minutes/);

console.log("PASS: isolated staging certificate route, threshold and production defaults.");
