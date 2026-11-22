"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertIdentityStagingIsolation, isIdentityStagingEnvironment,
  identityEvidencePrefix,
} = require("../identityStagingGuard");

const firebaseJson = (projectId = "volunserve-full-staging") => JSON.stringify({
  project_id: projectId,
  private_key: "-----BEGIN PRIVATE KEY-----\nfake-unit-test-only\n-----END PRIVATE KEY-----",
  client_email: "backend@" + projectId + ".iam.gserviceaccount.com",
});
const safe = {
  VOLUNSERVE_RUNTIME_ENV: "staging",
  RENDER_SERVICE_NAME: "volunserve-backend-staging",
  FIREBASE_SERVICE_ACCOUNT_JSON: firebaseJson(),
  IDENTITY_AI_SERVICE_URL: "https://volunserve-identity-ai-staging.onrender.com",
};

test("production defaults are unaffected by the staging guard", () => {
  assert.deepEqual(assertIdentityStagingIsolation({ RENDER_SERVICE_NAME: "volunserve-backend" }),
    { staging: false });
  assert.equal(identityEvidencePrefix({ RENDER_SERVICE_NAME: "volunserve-backend" }),
    "volunserve/identity-review");
});
test("Render staging service is recognized without explicit environment tag", () => {
  assert.equal(isIdentityStagingEnvironment({
    RENDER_SERVICE_NAME: "volunserve-backend-staging",
  }), true);
  assert.throws(() => assertIdentityStagingIsolation({
    RENDER_SERVICE_NAME: "volunserve-backend-staging",
    FIREBASE_SERVICE_ACCOUNT_JSON: firebaseJson(),
  }), /VOLUNSERVE_RUNTIME_ENV=staging/);
});
test("staging rejects production service accounts and absent credentials", () => {
  assert.throws(() => assertIdentityStagingIsolation({ ...safe, FIREBASE_SERVICE_ACCOUNT_JSON: "" }),
    /dedicated full-staging Firebase/);
  assert.throws(() => assertIdentityStagingIsolation({
    ...safe, FIREBASE_SERVICE_ACCOUNT_JSON: firebaseJson("volunserve-3aa5b"),
  }), /full-staging project/);
});
test("staging rejects production or non-staging AI service", () => {
  assert.throws(() => assertIdentityStagingIsolation({
    ...safe, IDENTITY_AI_SERVICE_URL: "https://volunserve-identity-ai.onrender.com",
  }), /staging host/);
  assert.throws(() => assertIdentityStagingIsolation({
    ...safe, IDENTITY_AI_SERVICE_URL: "http://volunserve-identity-ai-staging.onrender.com",
  }), /dedicated HTTPS staging/);
});
test("staging rejects conflicting project vars, accepts isolated values", () => {
  assert.throws(() => assertIdentityStagingIsolation({
    ...safe, GOOGLE_CLOUD_PROJECT: "volunserve-3aa5b",
  }), /conflicts/);
  assert.deepEqual(assertIdentityStagingIsolation(safe), {
    staging: true,
    firebaseProject: "volunserve-full-staging",
  });
  assert.equal(identityEvidencePrefix(safe), "volunserve/identity-review-staging");
});
