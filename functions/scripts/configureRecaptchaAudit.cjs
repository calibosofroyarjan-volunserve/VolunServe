"use strict";
/**
 * Run ONLY in a dedicated Firebase staging project, from functions/ after
 * npm ci, with GOOGLE_APPLICATION_CREDENTIALS or other Admin SDK auth.
 * Prints the intended plan by default. Nothing changes without an explicit
 * YES and a staging project different from VolunServe production.
 *
 * Example from repo root:
 *   VOLUNSERVE_STAGING_PROJECT_ID=my-staging-project \
 *     node functions/scripts/configureRecaptchaAudit.cjs
 *
 * Set VOLUNSERVE_CONFIRM_STAGING_AUDIT=YES only after reviewing the plan.
 * Never use this script to set ENFORCE or production values.
 */
const PRODUCTION_PROJECT = "volunserve-3aa5b";
const stagingProjectId = String(process.env.VOLUNSERVE_STAGING_PROJECT_ID || "").trim();
const EXPLICIT = process.env.VOLUNSERVE_CONFIRM_STAGING_AUDIT === "YES";
const allowedId = /^[a-z][a-z0-9-]{4,29}$/.test(stagingProjectId);
if (!allowedId || stagingProjectId === PRODUCTION_PROJECT ||
    stagingProjectId.includes("prod") || stagingProjectId.includes("production")) {
  console.error("Supply a valid, separate Firebase STAGING project ID. Production is blocked.");
  process.exitCode = 1;
} else {
  const proposed = {
    emailPasswordEnforcementState: "AUDIT",
    managedRules: [{endScore: 0.5, action: "BLOCK"}],
  };
  console.log("STAGING PROJECT:",stagingProjectId);
  console.log("reCAPTCHA Enterprise email-password bot protection plan:",JSON.stringify(proposed));
  if (!EXPLICIT) {
    console.log("DRY RUN only. No Google Cloud configuration was changed.");
  } else {
    // Intentionally load credentials only after the explicit staging checks.
    const {initializeApp,getApps} = require("firebase-admin/app");
    const {getAuth} = require("firebase-admin/auth");
    if (getApps().length === 0) initializeApp({projectId:stagingProjectId});
    getAuth().projectConfigManager().updateProjectConfig({recaptchaConfig:proposed})
      .then(() => console.log("Staging reCAPTCHA AUDIT configuration applied. Inspect metrics before ENFORCE."))
      .catch(err => {console.error("Staging configuration failed:",err.code || err.message);process.exitCode=1;});
  }
}
