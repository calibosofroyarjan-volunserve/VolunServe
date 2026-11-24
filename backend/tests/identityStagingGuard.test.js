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
  CLOUDINARY_CLOUD_NAME: "volunserve-identity-isolated-stage",
  CLOUDINARY_API_KEY: "synthetic-non-secret-test-key",
  CLOUDINARY_API_SECRET: "synthetic-non-secret-test-secret",
  ALLOWED_ORIGINS: "https://volunserve-expo-resident-full-staging.onrender.com",
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

test("staging backend refuses live frontend origins", () => {
  assert.throws(() => assertIdentityStagingIsolation({
    ...safe, ALLOWED_ORIGINS: "https://volunserve.com",
  }), /Staging CORS/);
  assert.throws(() => assertIdentityStagingIsolation({
    ...safe, ALLOWED_ORIGINS: "",
  }), /ALLOWED_ORIGINS/);
  assert.throws(() => assertIdentityStagingIsolation({
    ...safe, ALLOWED_ORIGINS: "https://volunserve-expo-resident-full-staging.onrender.com,https://www.volunserve.com",
  }), /Staging CORS/);
});

test("staging refuses production Cloudinary and missing private storage credentials", () => {
  assert.throws(() => assertIdentityStagingIsolation({
    ...safe, CLOUDINARY_CLOUD_NAME: "netjawtz",
  }), /dedicated staging Cloudinary/);
  assert.throws(() => assertIdentityStagingIsolation({
    ...safe, CLOUDINARY_CLOUD_NAME: "",
  }), /dedicated staging Cloudinary/);
  assert.throws(() => assertIdentityStagingIsolation({
    ...safe, CLOUDINARY_API_SECRET: "",
  }), /dedicated staging Cloudinary/);
});
