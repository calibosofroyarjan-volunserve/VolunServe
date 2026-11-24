"use strict";
const assert = require("node:assert/strict");
const { sandboxProjectAllowed } = require("./diditIdentityRoutes");
const { assertIsolatedStagingFirebase } = require("./stagingFirebaseIsolationPolicy");

// No network, Firebase credentials, database access, or paid Didit calls.
// This is a fail-closed project isolation test, not provider end-to-end QA.
const qa = {
  VOLUNSERVE_DIDIT_QA_ISOLATED: "true",
  VOLUNSERVE_DEPLOYMENT_ENV: "staging",
  VOLUNSERVE_STAGING_STRICT: "true",
  VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID: "volunserve-didit-qa",
  RENDER_SERVICE_NAME: "volunserve-didit-qa-backend",
  DIDIT_ENVIRONMENT: "sandbox",
  IDENTITY_AI_SERVICE_URL: "",
};
assert.equal(sandboxProjectAllowed("volunserve-didit-qa", qa), true);
for (const project of ["volunserve-3aa5b", "volunserve-full-staging", "demo-volunserve"]) {
  assert.equal(sandboxProjectAllowed(project, qa), false, project + " must be blocked in QA mode");
}
assert.equal(sandboxProjectAllowed("volunserve-didit-qa", { ...qa, VOLUNSERVE_DIDIT_QA_ISOLATED: "" }), false);
assert.equal(sandboxProjectAllowed("volunserve-didit-qa", { ...qa, VOLUNSERVE_STAGING_STRICT: "" }), false);
assert.equal(sandboxProjectAllowed("volunserve-didit-qa", { ...qa, VOLUNSERVE_DEPLOYMENT_ENV: "production" }), false);
assert.equal(sandboxProjectAllowed("volunserve-didit-qa", { ...qa, RENDER_SERVICE_NAME: "volunserve-full-staging" }), false);
assert.equal(sandboxProjectAllowed("volunserve-didit-qa", { ...qa, VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID: "volunserve-full-staging" }), false);
assert.equal(sandboxProjectAllowed("volunserve-full-staging", { VOLUNSERVE_DIDIT_QA_ISOLATED: "" }), true);
assert.equal(sandboxProjectAllowed("volunserve-3aa5b", { VOLUNSERVE_DIDIT_QA_ISOLATED: "" }), false);

// Separate QA Firebase credentials and no shared AI service are prerequisites.
assert.doesNotThrow(() => assertIsolatedStagingFirebase(qa, { project_id: "volunserve-didit-qa" }));
assert.throws(() => assertIsolatedStagingFirebase(qa, { project_id: "volunserve-3aa5b" }));
assert.throws(() => assertIsolatedStagingFirebase(qa, { project_id: "volunserve-full-staging" }));
assert.throws(() => assertIsolatedStagingFirebase({ ...qa, IDENTITY_AI_SERVICE_URL: "https://volunserve-identity-ai-staging.onrender.com" }, { project_id: "volunserve-didit-qa" }));
assert.throws(() => assertIsolatedStagingFirebase({ ...qa, VOLUNSERVE_STAGING_STRICT: "false" }, { project_id: "volunserve-didit-qa" }));
console.log("Didit QA isolation guards passed without modifying any environment.");
