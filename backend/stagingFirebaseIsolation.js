"use strict";
/**
 * Read-only staging isolation evaluator. Does not import Firebase Admin,
 * connect to a database, access the network, or print environment values.
 * Use only the status codes, never a service-account key, for triage.
 */
const EXPECTED_PROJECT = "volunserve-full-staging";
const EXPECTED_AI_ORIGIN = "https://volunserve-identity-ai-staging.onrender.com";

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
module.exports = {assessFullStagingEnvironment};
