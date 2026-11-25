"use strict";
const crypto = require("node:crypto");

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

  // An attacker or accidental deployment can relabel a production Firebase
  // private key with a staging project_id. Project and client_email labels alone
  // are NOT credential provenance. Require operator-attested, separate private
  // key fingerprints before any Firebase SDK initialization.
  const accountEmail = String(serviceAccount?.client_email || "").trim().toLowerCase();
  const accountKey = typeof serviceAccount?.private_key === "string"
    ? serviceAccount.private_key.trim() : "";
  const expectedAccountDomain = "@" + expectedFirebase.toLowerCase() + ".iam.gserviceaccount.com";
  if (String(serviceAccount?.type || "") !== "service_account" ||
      !accountEmail.endsWith(expectedAccountDomain) || !accountKey) {
    throw new Error(
      "Original AI staging isolation blocked: staging Firebase service account identity and private key required.",
    );
  }
  const stageFirebaseKeyFingerprint = String(
    vars.VOLUNSERVE_STAGING_FIREBASE_PRIVATE_KEY_SHA256 || "",
  ).trim().toLowerCase();
  const productionFirebaseKeyFingerprint = String(
    vars.VOLUNSERVE_PRODUCTION_FIREBASE_PRIVATE_KEY_SHA256 || "",
  ).trim().toLowerCase();
  const firebaseSha256Format = /^[a-f0-9]{64}$/;
  if (!firebaseSha256Format.test(stageFirebaseKeyFingerprint) ||
      !firebaseSha256Format.test(productionFirebaseKeyFingerprint)) {
    throw new Error(
      "Original AI staging isolation blocked: independently recorded Firebase credential fingerprints required.",
    );
  }
  const actualFirebaseKeyDigest = crypto.createHash("sha256")
    .update(accountKey, "utf8").digest();
  const expectedFirebaseKeyDigest = Buffer.from(stageFirebaseKeyFingerprint, "hex");
  const productionFirebaseKeyDigest = Buffer.from(productionFirebaseKeyFingerprint, "hex");
  if (!crypto.timingSafeEqual(actualFirebaseKeyDigest, expectedFirebaseKeyDigest) ||
      crypto.timingSafeEqual(expectedFirebaseKeyDigest, productionFirebaseKeyDigest)) {
    throw new Error(
      "Original AI staging isolation blocked: staging Firebase private key does not match isolated credential attestation.",
    );
  }

  // Other SDKs may read implicit Google/Firebase environment variables,
  // bypassing the explicitly validated service-account project above.
  // This staging candidate requires only the dedicated JSON account.
  if (String(vars.GOOGLE_APPLICATION_CREDENTIALS || "").trim() ||
      String(vars.FIREBASE_CONFIG || "").trim()) {
    throw new Error(
      "Original AI staging isolation blocked: implicit Google/Firebase credential configuration is forbidden.",
    );
  }
  for (const projectVariable of ["GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT"]) {
    const implicitProject = String(vars[projectVariable] || "").trim();
    if (implicitProject && implicitProject !== expectedFirebase) {
      throw new Error(
        "Original AI staging isolation blocked: implicit Google project conflicts with staging Firebase project.",
      );
    }
  }

  const aiUrl = String(vars.IDENTITY_AI_SERVICE_URL || "").trim().replace(/\/+$/, "");
  if (aiUrl !== STAGING_AI_URL) {
    throw new Error("Original AI staging isolation blocked: dedicated staging Python AI URL required.");
  }

  // Cloudinary's URL-style environment configuration may carry a second
  // credential and cloud selection that bypasses the explicit stage-only
  // cloud_name/api_key/api_secret validation. Reject it rather than risk
  // loading a hidden production account via the SDK.
  if (String(vars.CLOUDINARY_URL || "").trim()) {
    throw new Error(
      "Original AI staging isolation blocked: implicit Cloudinary URL credentials are forbidden.",
    );
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

  // Cloud names alone cannot establish credential isolation. Require
  // operator-attested SHA-256 fingerprints for BOTH Cloudinary credentials
  // and compare against an independently recorded production fingerprint.
  // This protects against accidental prod key/secret reuse under a fake
  // staging cloud label. It is NOT proof of Cloudinary account ownership.
  // Do not log raw keys, secrets, expected hashes or calculated digests.
  const cloudinaryFingerprintPairs = [
    {
      actual: String(vars.CLOUDINARY_API_KEY || "").trim(),
      staging: String(vars.VOLUNSERVE_STAGING_CLOUDINARY_API_KEY_SHA256 || "").trim().toLowerCase(),
      production: String(vars.VOLUNSERVE_PRODUCTION_CLOUDINARY_API_KEY_SHA256 || "").trim().toLowerCase(),
    },
    {
      actual: String(vars.CLOUDINARY_API_SECRET || "").trim(),
      staging: String(vars.VOLUNSERVE_STAGING_CLOUDINARY_API_SECRET_SHA256 || "").trim().toLowerCase(),
      production: String(vars.VOLUNSERVE_PRODUCTION_CLOUDINARY_API_SECRET_SHA256 || "").trim().toLowerCase(),
    },
  ];
  for (const item of cloudinaryFingerprintPairs) {
    const validSha256 = /^[a-f0-9]{64}$/;
    if (!item.actual || !validSha256.test(item.staging) || !validSha256.test(item.production)) {
      throw new Error(
        "Original AI staging isolation blocked: Cloudinary credential fingerprint attestation missing or invalid.",
      );
    }
    const computed = crypto.createHash("sha256").update(item.actual, "utf8").digest();
    const expected = Buffer.from(item.staging, "hex");
    const production = Buffer.from(item.production, "hex");
    if (!crypto.timingSafeEqual(computed, expected) ||
        crypto.timingSafeEqual(expected, production)) {
      throw new Error(
        "Original AI staging isolation blocked: staging Cloudinary credentials do not match isolated fingerprints.",
      );
    }
  }

  // The Node→Python private API must not silently inherit the live key.
  // Compare SHA-256 fingerprints, never log or expose the actual key.
  const key = String(vars.IDENTITY_AI_INTERNAL_KEY || "").trim();
  const stagingFingerprint = String(vars.VOLUNSERVE_STAGING_INTERNAL_KEY_SHA256 || "").trim().toLowerCase();
  const productionFingerprint = String(vars.VOLUNSERVE_PRODUCTION_INTERNAL_KEY_SHA256 || "").trim().toLowerCase();
  const fingerprintFormat = /^[a-f0-9]{64}$/;
  const computed = crypto.createHash("sha256").update(key, "utf8").digest("hex");
  if (key.length < 32 ||
      !fingerprintFormat.test(stagingFingerprint) ||
      !fingerprintFormat.test(productionFingerprint) ||
      !crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(stagingFingerprint || "00".repeat(32), "hex")) ||
      crypto.timingSafeEqual(Buffer.from(stagingFingerprint, "hex"), Buffer.from(productionFingerprint, "hex"))) {
    throw new Error("Original AI staging isolation blocked: private backend API key must be strong and independent of production.");
  }
}
module.exports = { assertOriginalAiStagingIsolation };
