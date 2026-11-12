"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {assessFullStagingEnvironment} = require("./stagingFirebaseIsolation");

const good = () => ({
  VOLUNSERVE_STAGING_STRICT: "1",
  VOLUNSERVE_DEPLOYMENT_ENV: "staging",
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account",
    project_id: "volunserve-full-staging",
    client_email: "demo@volunserve-full-staging.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nsynthetic test only\n-----END PRIVATE KEY-----",
  }),
  IDENTITY_AI_SERVICE_URL: "https://volunserve-identity-ai-staging.onrender.com/verify",
  IDENTITY_AI_INTERNAL_KEY: "synthetic-key-not-a-real-secret",
});
const failure = (config) => assessFullStagingEnvironment(config).checks.filter(x => !x.passed).map(x => x.code);

test("complete full-staging config passes without accessing Firebase or network", () => {
  const outcome = assessFullStagingEnvironment(good());
  assert.equal(outcome.safeToUseFullStaging, true);
  assert.equal(outcome.readOnly, true);
  assert.equal(outcome.checks.length, 8);
});
test("production Firebase service-account project always fails", () => {
  const env = good();
  const raw = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  raw.project_id = "volunserve-3aa5b";
  env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(raw);
  assert(failure(env).includes("FIREBASE_PROJECT_IS_FULL_STAGING"));
});
test("previous auth-only staging project fails full-staging gate", () => {
  const env = good();
  const raw = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  raw.project_id = "volunserve-auth-staging";
  raw.client_email = "demo@volunserve-auth-staging.iam.gserviceaccount.com";
  env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(raw);
  assert(failure(env).includes("FIREBASE_PROJECT_IS_FULL_STAGING"));
});
test("strict mode disabled fails", () => {
  const env = {...good(), VOLUNSERVE_STAGING_STRICT: "0"};
  assert(failure(env).includes("STAGING_MODE_ENABLED"));
});
test("missing or ambiguous deployment environment fails", () => {
  for (const mode of [undefined, "", "production"]) {
    const env = {...good(), VOLUNSERVE_DEPLOYMENT_ENV: mode};
    assert(failure(env).includes("DEPLOYMENT_ENV_IS_STAGING"));
  }
});
test("service account email must belong to full staging", () => {
  const env = good();
  const raw = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  raw.client_email = "demo@volunserve-3aa5b.iam.gserviceaccount.com";
  env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(raw);
  assert(failure(env).includes("SERVICE_ACCOUNT_BELONGS_TO_FULL_STAGING"));
});
test("missing or malformed service account JSON blocks access", () => {
  for (const value of ["", "{", "null", '"string"', "[]"]) {
    const env = {...good(), FIREBASE_SERVICE_ACCOUNT_JSON: value};
    assert.equal(assessFullStagingEnvironment(env).safeToUseFullStaging, false);
  }
});
test("private key must be present but is never disclosed", () => {
  const env = good();
  const raw = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  raw.private_key = "secret-containing-no-private-key-header";
  env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(raw);
  const result = assessFullStagingEnvironment(env);
  assert(result.checks.some(c => c.code === "SERVICE_ACCOUNT_HAS_PRIVATE_KEY" && !c.passed));
  assert(!JSON.stringify(result).includes(raw.private_key));
  assert(!JSON.stringify(result).includes(raw.client_email));
});
test("AI target cannot point to production or unknown hosts", () => {
  for (const url of [
    "https://volunserve-identity-ai.onrender.com",
    "https://volunserve.onrender.com",
    "http://volunserve-identity-ai-staging.onrender.com",
    "https://other-staging.example.com",
    "https://volunserve-identity-ai-staging.onrender.com/verify?token=1",
    "https://user:pass@volunserve-identity-ai-staging.onrender.com/verify",
  ]) {
    assert(failure({...good(), IDENTITY_AI_SERVICE_URL: url}).includes("AI_TARGET_IS_STAGING_ONLY"));
  }
});
test("AI internal key cannot be absent", () => {
  assert(failure({...good(), IDENTITY_AI_INTERNAL_KEY: ""}).includes("PRIVATE_AI_KEY_CONFIGURED"));
});

test("Firebase Admin initialization enforces staging isolation before credentials", () => {
  const source = fs.readFileSync(require("node:path").join(__dirname, "firebaseAdmin.js"), "utf8");
  const checkAt = source.indexOf("assessFullStagingEnvironment(process.env)");
  const appAt = source.indexOf("const existingApps = getApps();");
  const credentialsAt = source.indexOf("const serviceAccount =\n    getServiceAccount();");
  assert(checkAt > 0 && appAt > checkAt && credentialsAt > checkAt);
  assert(source.includes("if (!isolation.safeToUseFullStaging)"));
  assert(source.includes("STAGING_ISOLATION_BLOCKED"));
  assert(!source.includes('serviceAccount.project_id !== "volunserve-auth-staging"'));
  assert(source.includes('existingApps[0].options.projectId !== "volunserve-full-staging"'));
});
