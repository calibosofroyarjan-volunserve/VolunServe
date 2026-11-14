"use strict";

/**
 * Read-only staging Admin access diagnosis.
 * Does NOT create accounts, approve LGU applications, reset credentials or
 * assign roles. Production and auth-only staging projects fail closed.
 */
const { isOperationalAdminProfile } = require("./adminAccess");

const EXPECTED_PROJECT = "volunserve-full-staging";

function assertStagingAccessOnly(env) {
  if (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST) {
    throw Error("STAGING_ADMIN_PREFLIGHT_BLOCKED: emulator endpoints forbidden");
  }
  if (env.VOLUNSERVE_STAGING_STRICT !== "1" ||
      !["staging", "full-staging"].includes(String(env.VOLUNSERVE_DEPLOYMENT_ENV || "").trim())) {
    throw Error("STAGING_ADMIN_PREFLIGHT_BLOCKED: explicit staging flags required");
  }
  let account;
  try {
    account = JSON.parse(String(env.FIREBASE_SERVICE_ACCOUNT_JSON || ""));
  } catch {
    throw Error("STAGING_ADMIN_PREFLIGHT_BLOCKED: explicit staging service account required");
  }
  if (!account || account.type !== "service_account" ||
      account.project_id !== EXPECTED_PROJECT ||
      typeof account.client_email !== "string" ||
      !account.client_email.endsWith("@" + EXPECTED_PROJECT + ".iam.gserviceaccount.com") ||
      typeof account.private_key !== "string" ||
      !account.private_key.includes("BEGIN PRIVATE KEY")) {
    throw Error("STAGING_ADMIN_PREFLIGHT_BLOCKED: service account not scoped to full staging");
  }
  const other = String(env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || "").trim();
  if (other && other !== EXPECTED_PROJECT) {
    throw Error("STAGING_ADMIN_PREFLIGHT_BLOCKED: conflicting target project");
  }
  return EXPECTED_PROJECT;
}

function classifyStagingAdminAccess(authRecord, profile) {
  if (!authRecord) return "AUTH_ACCOUNT_NOT_FOUND";
  if (authRecord.disabled === true) return "AUTH_ACCOUNT_DISABLED";
  if (authRecord.emailVerified !== true) return "AUTH_EMAIL_NOT_VERIFIED";
  if (!profile || typeof profile !== "object") return "STAGING_PROFILE_MISSING";
  if (String(authRecord.uid || "") !== String(profile.uid || "")) {
    return "AUTH_PROFILE_UID_MISMATCH";
  }
  if (String(authRecord.email || "").trim().toLowerCase() !==
      String(profile.email || "").trim().toLowerCase()) {
    return "AUTH_PROFILE_EMAIL_MISMATCH";
  }
  if (profile.role !== "admin") return "ROLE_NOT_ADMIN";
  if (String(profile.adminStatus || "").toLowerCase() === "suspended") {
    return "ADMIN_SUSPENDED";
  }
  if (!isOperationalAdminProfile(profile)) return "ADMIN_NOT_APPROVED";
  return "READY_FOR_STAGING_ADMIN_SIGN_IN";
}

module.exports = {
  EXPECTED_PROJECT, assertStagingAccessOnly, classifyStagingAdminAccess,
};
