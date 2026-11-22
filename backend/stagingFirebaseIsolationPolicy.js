"use strict";

/**
 * Fail closed in staging before Firebase Admin initializes.
 * The expected staging project id is a NON-SECRET public identifier.
 * Production Firebase credentials and accidental staging-production crossover
 * must never be accepted by the staging backend.
 */
const PRODUCTION_FIREBASE_PROJECT_ID = "volunserve-3aa5b";
const EXPECTED_AI_STAGING_URL = "https://volunserve-identity-ai-staging.onrender.com";

function assertIsolatedStagingFirebase(env, serviceAccount) {
  const strict = String(env.VOLUNSERVE_STAGING_STRICT || "").trim().toLowerCase();
  const deploymentEnv = String(env.VOLUNSERVE_DEPLOYMENT_ENV || "").trim().toLowerCase();
  const inferredStaging = /staging/i.test(String(env.RENDER_SERVICE_NAME || ""));

  if (strict !== "true" && deploymentEnv !== "staging" && !inferredStaging) {
    return; // Existing production behavior remains unchanged.
  }
  if (strict !== "true" || deploymentEnv !== "staging") {
    throw new Error("Staging Firebase isolation blocked: require explicit staging environment and strict=true.");
  }

  const expected = String(env.VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID || "").trim();
  const actual = String(serviceAccount?.project_id || "").trim();
  if (!expected || !actual || expected === PRODUCTION_FIREBASE_PROJECT_ID ||
      actual === PRODUCTION_FIREBASE_PROJECT_ID || actual !== expected) {
    throw new Error("Staging Firebase isolation blocked: expected separate staging Firebase project does not match credentials.");
  }
  const aiUrl = String(env.IDENTITY_AI_SERVICE_URL || "").trim().replace(/\/+$/, "");
  if (aiUrl !== EXPECTED_AI_STAGING_URL) {
    throw new Error("Staging AI isolation blocked: expected dedicated staging AI endpoint.");
  }
}

module.exports = { assertIsolatedStagingFirebase };
