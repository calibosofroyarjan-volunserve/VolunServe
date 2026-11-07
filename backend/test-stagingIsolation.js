"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {validateStagingEnvironment} = require("./stagingIsolation");

const staging = {
  VOLUNSERVE_DEPLOYMENT_ENV: "staging",
  IDENTITY_AI_SERVICE_URL: "https://volunserve-identity-ai-staging.onrender.com",
  IDENTITY_AI_INTERNAL_KEY: "synthetic-test-secret",
};
const credentials = {project_id: "volunserve-auth-staging"};

test("staging accepts matching test Firebase and Python AI service", () => {
  assert.doesNotThrow(() => validateStagingEnvironment(staging, credentials));
});

test("staging rejects production Firebase project", () => {
  assert.throws(() => validateStagingEnvironment(staging, {project_id: "volunserve-3aa5b"}), /staging/);
});

test("staging rejects missing Firebase credentials", () => {
  assert.throws(() => validateStagingEnvironment(staging, null), /FIREBASE_SERVICE_ACCOUNT_JSON/);
});

test("staging rejects production AI endpoint", () => {
  assert.throws(() => validateStagingEnvironment({...staging, IDENTITY_AI_SERVICE_URL: "https://volunserve-identity-ai.onrender.com"}, credentials), /refuse/);
});

test("staging rejects missing and invalid AI URLs", () => {
  assert.throws(() => validateStagingEnvironment({...staging, IDENTITY_AI_SERVICE_URL: ""}, credentials), /required/);
  assert.throws(() => validateStagingEnvironment({...staging, IDENTITY_AI_SERVICE_URL: "https://volunserve-identity-ai-staging.onrender.com.evil.test"}, credentials), /refuse/);
});

test("staging rejects missing internal key", () => {
  assert.throws(() => validateStagingEnvironment({...staging, IDENTITY_AI_INTERNAL_KEY: ""}, credentials), /internal key/);
});

test("non-staging configuration stays backward compatible", () => {
  assert.doesNotThrow(() => validateStagingEnvironment({}, null));
});
