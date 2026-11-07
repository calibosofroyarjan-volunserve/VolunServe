"use strict";

// Applies ONLY when explicitly configured as staging. Never let the staging
// backend contact the live identity AI endpoint or use production Firebase.
function validateStagingEnvironment(env, serviceAccount) {
  if (env.VOLUNSERVE_DEPLOYMENT_ENV !== "staging") return;

  if (
    !serviceAccount ||
    serviceAccount.project_id !== "volunserve-auth-staging"
  ) {
    throw new Error(
      "Unsafe staging config: FIREBASE_SERVICE_ACCOUNT_JSON must belong to volunserve-auth-staging.",
    );
  }

  if (!String(env.IDENTITY_AI_INTERNAL_KEY || "").trim()) {
    throw new Error("Unsafe staging config: staging identity AI internal key is required.");
  }

  let endpoint;
  try {
    endpoint = new URL(String(env.IDENTITY_AI_SERVICE_URL || "").trim());
  } catch {
    throw new Error("Unsafe staging config: staging identity AI URL is required.");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "volunserve-identity-ai-staging.onrender.com" ||
    (endpoint.pathname !== "/" && endpoint.pathname !== "" && endpoint.pathname !== "/verify")
  ) {
    throw new Error("Unsafe staging config: refuse non-staging identity AI endpoint.");
  }
}

module.exports = { validateStagingEnvironment };
