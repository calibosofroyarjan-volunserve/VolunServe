"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {assertIsolatedStagingFirebase} = require("./stagingFirebaseIsolationPolicy");
const prod = "volunserve-3aa5b";
const stage = "volunserve-identity-testing-example";
const environment = Object.freeze({
  VOLUNSERVE_STAGING_STRICT: "true",
  VOLUNSERVE_DEPLOYMENT_ENV: "staging",
  VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID: stage,
  IDENTITY_AI_SERVICE_URL: "https://volunserve-identity-ai-staging.onrender.com",
  RENDER_SERVICE_NAME: "volunserve-backend-staging",
});
test("separate explicitly named staging Firebase project is accepted", () =>
  assert.doesNotThrow(() => assertIsolatedStagingFirebase(environment, {project_id: stage})));
test("production project can NEVER be accepted by staging", () =>
  assert.throws(() => assertIsolatedStagingFirebase(environment, {project_id: prod}), /isolation blocked/));
test("misconfigured expected project cannot be production", () =>
  assert.throws(() => assertIsolatedStagingFirebase({...environment,VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:prod},{project_id:prod}), /isolation blocked/));
test("empty project id fails closed", () =>
  assert.throws(() => assertIsolatedStagingFirebase(environment,{}), /isolation blocked/));
test("missing expected staging project id fails closed", () =>
  assert.throws(() => assertIsolatedStagingFirebase({...environment,VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:""},{project_id:stage}), /isolation blocked/));
test("strict flag must be enabled", () =>
  assert.throws(() => assertIsolatedStagingFirebase({...environment,VOLUNSERVE_STAGING_STRICT:"false"},{project_id:stage}), /isolation blocked/));
test("deployment env must be staging", () =>
  assert.throws(() => assertIsolatedStagingFirebase({...environment,VOLUNSERVE_DEPLOYMENT_ENV:"production"},{project_id:stage}), /isolation blocked/));
test("must never target production AI service", () =>
  assert.throws(() => assertIsolatedStagingFirebase({...environment,IDENTITY_AI_SERVICE_URL:"https://volunserve-identity-ai.onrender.com"},{project_id:stage}), /isolation blocked/));
test("production app remains unchanged when not in staging", () =>
  assert.doesNotThrow(() => assertIsolatedStagingFirebase({VOLUNSERVE_DEPLOYMENT_ENV:"production"},{project_id:prod})));
