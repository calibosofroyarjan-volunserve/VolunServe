"use strict";
/**
 * Read-only staging isolation evaluator. Does not import Firebase Admin,
 * connect to a database, access the network, or print environment values.
 * Use only the status codes, never a service-account key, for triage.
 */
const EXPECTED_PROJECT = "volunserve-full-staging";
const EXPECTED_AI_ORIGIN = "https://volunserve-identity-ai-staging.onrender.com";
const STAGING_NODE_SERVICE_ID = "srv-dbnp9ulg1s2s73daj250";
const STAGING_NODE_SERVICE_NAME = "volunserve-backend-staging";
const STAGING_NODE_EXTERNAL_ORIGIN = "https://volunserve-backend-staging.onrender.com";

// Detect known staging *runtime identity* even if an operator forgot both
// VOLUNSERVE_STAGING_STRICT and VOLUNSERVE_DEPLOYMENT_ENV. Without this,
// missing flags could bypass the Firebase isolation check entirely.
// These environment values are provided by Render and are not read from
// client requests or untrusted uploaded documents.
function isFullStagingRuntime(env) {
  const mode = String(env.VOLUNSERVE_DEPLOYMENT_ENV || "").trim().toLowerCase();
  if (env.VOLUNSERVE_STAGING_STRICT === "1" ||
      mode === "staging" || mode === "full-staging") return true;
  if (env.RENDER_SERVICE_ID === STAGING_NODE_SERVICE_ID ||
      env.RENDER_SERVICE_NAME === STAGING_NODE_SERVICE_NAME) return true;
  try {
    const address = new URL(String(env.RENDER_EXTERNAL_URL || "").trim());
    if (address.origin === STAGING_NODE_EXTERNAL_ORIGIN &&
        ["", "/"].includes(address.pathname) &&
        !address.username && !address.password &&
        !address.search && !address.hash) return true;
  } catch { /* no Render external URL available */ }
  // A copied full-staging account in a misconfigured runtime is another
  // reason to demand explicit strict flags before initializing the SDK.
  try {
    const creds = JSON.parse(String(env.FIREBASE_SERVICE_ACCOUNT_JSON || ""));
    if (creds?.project_id === EXPECTED_PROJECT) return true;
  } catch { /* malformed credentials are checked by the strict evaluator */ }
  return false;
}


function assessFullStagingEnvironment(env) {
  const checks = [];
  const requireCheck = (code, condition) => {
    checks.push({code, passed: Boolean(condition)});
  };

  requireCheck("STAGING_MODE_ENABLED", env.VOLUNSERVE_STAGING_STRICT === "1");
  requireCheck(
    "DEPLOYMENT_ENV_IS_STAGING",
    ["staging", "full-staging"].includes(String(env.VOLUNSERVE_DEPLOYMENT_ENV || "").trim().toLowerCase()),
  );

  let account = null;
  const raw = String(env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  try {
    if (raw) account = JSON.parse(raw);
  } catch {
    // Never disclose the invalid raw JSON or its parsing exception.
  }
  requireCheck("SERVICE_ACCOUNT_JSON_VALID", account !== null && typeof account === "object" && !Array.isArray(account));
  requireCheck(
    "FIREBASE_PROJECT_IS_FULL_STAGING",
    account?.project_id === EXPECTED_PROJECT,
  );
  requireCheck(
    "SERVICE_ACCOUNT_BELONGS_TO_FULL_STAGING",
    typeof account?.client_email === "string" &&
      account.client_email.endsWith("@" + EXPECTED_PROJECT + ".iam.gserviceaccount.com"),
  );
  requireCheck(
    "SERVICE_ACCOUNT_HAS_PRIVATE_KEY",
    account?.type === "service_account" &&
      typeof account?.private_key === "string" &&
      account.private_key.includes("BEGIN PRIVATE KEY"),
  );

  const aiUrl = String(env.IDENTITY_AI_SERVICE_URL || "").trim();
  let aiAddress = null;
  try { aiAddress = new URL(aiUrl); } catch { /* fail closed */ }
  requireCheck(
    "AI_TARGET_IS_STAGING_ONLY",
    aiAddress?.origin === EXPECTED_AI_ORIGIN &&
      ["", "/", "/verify"].includes(aiAddress.pathname) &&
      aiAddress.username === "" && aiAddress.password === "" &&
      aiAddress.search === "" && aiAddress.hash === "",
  );
  requireCheck(
    "PRIVATE_AI_KEY_CONFIGURED",
    String(env.IDENTITY_AI_INTERNAL_KEY || "").length >= 16,
  );
  return {
    safeToUseFullStaging: checks.every(check => check.passed),
    readOnly: true,
    checks,
  };
}
module.exports = {assessFullStagingEnvironment, isFullStagingRuntime};
