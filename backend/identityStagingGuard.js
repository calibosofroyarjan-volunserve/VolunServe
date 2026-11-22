"use strict";

/**
 * Fail closed BEFORE Firebase Admin is initialized on dedicated identity staging.
 * Render's own service name/hostname identifies the staging service even when
 * a deploy was accidentally started without VOLUNSERVE_RUNTIME_ENV.
 */
const LIVE_PROJECT_ID = "volunserve-3aa5b";
const STAGING_PROJECT_ID = "volunserve-full-staging";
const LIVE_AI_HOST = "volunserve-identity-ai.onrender.com";

function isIdentityStagingEnvironment(env = process.env) {
  return String(env.VOLUNSERVE_RUNTIME_ENV || "").toLowerCase() === "staging" ||
    /\bstaging\b/i.test(String(env.RENDER_SERVICE_NAME || "").replace(/[-_]/g, " ")) ||
    /(?:^|[-.])staging(?:[-.]|$)/i.test(String(env.RENDER_EXTERNAL_HOSTNAME || ""));
}

function stagingGuardError(reason) {
  const error = new Error("IDENTITY_STAGING_ISOLATION_BLOCKED: " + reason);
  error.code = "identity_staging_isolation_blocked";
  return error;
}

function identityEvidencePrefix(env = process.env) {
  return isIdentityStagingEnvironment(env)
    ? "volunserve/identity-review-staging"
    : "volunserve/identity-review";
}

function assertIdentityStagingIsolation(env = process.env) {
  if (!isIdentityStagingEnvironment(env)) return { staging: false };
  if (env.VOLUNSERVE_RUNTIME_ENV !== "staging") {
    throw stagingGuardError("Set VOLUNSERVE_RUNTIME_ENV=staging before starting a staging backend.");
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(String(env.FIREBASE_SERVICE_ACCOUNT_JSON || ""));
  } catch {
    throw stagingGuardError("A dedicated full-staging Firebase service account is required.");
  }
  const serviceAccountProject = String(serviceAccount?.project_id || "");
  if (serviceAccountProject !== STAGING_PROJECT_ID || serviceAccountProject === LIVE_PROJECT_ID) {
    throw stagingGuardError("The Firebase service account must belong to the full-staging project.");
  }
  for (const projectValue of [env.GOOGLE_CLOUD_PROJECT, env.GCLOUD_PROJECT, env.FIREBASE_PROJECT_ID]) {
    if (projectValue && projectValue !== STAGING_PROJECT_ID) {
      throw stagingGuardError("Firebase project configuration conflicts with full staging.");
    }
  }
  if (typeof serviceAccount?.private_key !== "string" || !serviceAccount.private_key.trim() ||
      !serviceAccount.client_email?.endsWith("@" + STAGING_PROJECT_ID + ".iam.gserviceaccount.com")) {
    throw stagingGuardError("Full-staging Firebase credentials are incomplete.");
  }

  let aiEndpoint;
  try {
    aiEndpoint = new URL(String(env.IDENTITY_AI_SERVICE_URL || ""));
  } catch {
    throw stagingGuardError("Set a separate staging identity AI service URL.");
  }
  if (aiEndpoint.protocol !== "https:" ||
      aiEndpoint.username || aiEndpoint.password ||
      !/(?:^|[-.])staging(?:[-.]|$)/i.test(aiEndpoint.hostname) ||
      aiEndpoint.hostname === LIVE_AI_HOST) {
    throw stagingGuardError("Identity AI must use a dedicated HTTPS staging host, not production.");
  }
  return { staging: true, firebaseProject: STAGING_PROJECT_ID };
}

module.exports = {
  assertIdentityStagingIsolation,
  isIdentityStagingEnvironment,
  identityEvidencePrefix,
};
