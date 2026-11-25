"use strict";

/**
 * QA-only candidate for the original-AI backend, based on the exact currently
 * deployed Node commit d06aeb1e. No deployment is authorized by this file.
 *
 * In a staging Render service, prevent accidental Firebase project / AI
 * endpoint / Cloudinary cloud crossover BEFORE SDK initialization.
 * Production service behavior is unchanged unless explicitly configured as
 * staging or the runtime service name contains "staging".
 *
 * IMPORTANT: A distinct Cloudinary cloud name is a necessary check, not a
 * cryptographic proof that staging credentials were independently provisioned.
 * An operator must verify staging credentials before hosted media uploads.
 */
const PRODUCTION_FIREBASE_PROJECT_ID = "volunserve-3aa5b";
const PRODUCTION_DEFAULT_CLOUDINARY_NAME = "netjawtz";
const STAGING_AI_URL = "https://volunserve-identity-ai-staging.onrender.com";

function assertOriginalAiStagingIsolation(env, serviceAccount) {
  const vars = env || {};
  const stagingName = /staging/i.test(String(vars.RENDER_SERVICE_NAME || ""));
  const strict = String(vars.VOLUNSERVE_STAGING_STRICT || "").trim().toLowerCase();
  const deployment = String(vars.VOLUNSERVE_DEPLOYMENT_ENV || "").trim().toLowerCase();
  const stagingRequested = stagingName || strict === "true" || deployment === "staging";
  if (!stagingRequested) return; // Zero changes for unchanged live backend.

  if (!stagingName || strict !== "true" || deployment !== "staging") {
    throw new Error("Original AI staging isolation blocked: require named staging service and explicit strict=true / deployment=staging.");
  }

  const expectedFirebase = String(vars.VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID || "").trim();
  const actualFirebase = String(serviceAccount?.project_id || "").trim();
  if (!expectedFirebase || !actualFirebase || expectedFirebase === PRODUCTION_FIREBASE_PROJECT_ID ||
      actualFirebase === PRODUCTION_FIREBASE_PROJECT_ID ||
      expectedFirebase !== actualFirebase) {
    throw new Error("Original AI staging isolation blocked: Firebase service account must be independently provisioned for staging.");
  }

  const aiUrl = String(vars.IDENTITY_AI_SERVICE_URL || "").trim().replace(/\/+$/, "");
  if (aiUrl !== STAGING_AI_URL) {
    throw new Error("Original AI staging isolation blocked: dedicated staging Python AI URL required.");
  }

  const expectedCloud = String(vars.VOLUNSERVE_STAGING_CLOUDINARY_CLOUD_NAME || "").trim();
  const actualCloud = String(vars.CLOUDINARY_CLOUD_NAME || "").trim();
  const productionCloud = String(vars.VOLUNSERVE_PRODUCTION_CLOUDINARY_CLOUD_NAME ||
    PRODUCTION_DEFAULT_CLOUDINARY_NAME).trim();
  if (!expectedCloud || !actualCloud || !productionCloud ||
      expectedCloud !== actualCloud ||
      expectedCloud === productionCloud ||
      actualCloud === PRODUCTION_DEFAULT_CLOUDINARY_NAME ||
      !String(vars.CLOUDINARY_API_KEY || "").trim() ||
      !String(vars.CLOUDINARY_API_SECRET || "").trim()) {
    throw new Error("Original AI staging isolation blocked: separate authenticated Cloudinary cloud and credentials required.");
  }
}
module.exports = { assertOriginalAiStagingIsolation };
