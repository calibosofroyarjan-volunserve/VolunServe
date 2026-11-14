"use strict";
/**
 * Usage (authorized operator's secured workstation only):
 *   VOLUNSERVE_STAGING_STRICT=1 VOLUNSERVE_DEPLOYMENT_ENV=staging \
 *     FIREBASE_SERVICE_ACCOUNT_JSON=<from-secret-manager> \
 *     IDENTITY_AI_SERVICE_URL=https://volunserve-identity-ai-staging.onrender.com \
 *     IDENTITY_AI_INTERNAL_KEY=<from-secret-manager> \
 *     node backend/scripts/check-staging-admin-account.cjs --email=account@example.org
 *
 * READ ONLY. The service-account JSON must never be pasted into a chat, ticket,
 * repository, log, shell history, or CLI argument. Run only on a secured
 * workstation with an authorized full-staging service-account credential.
 */
const {assertStagingAccessOnly, classifyStagingAdminAccess} =
  require("../stagingAdminAccessPreflight");

const args = process.argv.slice(2);
const emailArgs = args.filter(a => /^--email=/.test(a));
if (args.length !== 1 || emailArgs.length !== 1) {
  console.error("USAGE: node backend/scripts/check-staging-admin-account.cjs --email=<staging-admin-email>");
  process.exit(2);
}
const email = emailArgs[0].slice(8).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  console.error("STAGING_ADMIN_PREFLIGHT_BLOCKED: invalid email input");
  process.exit(2);
}

async function main() {
  assertStagingAccessOnly(process.env); // fail closed BEFORE Firebase import
  const {auth, db, app} = require("../firebaseAdmin");
  if (app.options.projectId !== "volunserve-full-staging") {
    throw Error("STAGING_ADMIN_PREFLIGHT_BLOCKED: SDK project mismatch");
  }
  let account;
  try {
    account = await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      console.log("STAGING_ADMIN_ACCESS=AUTH_ACCOUNT_NOT_FOUND");
      return;
    }
    throw Error("STAGING_ADMIN_PREFLIGHT_BLOCKED: Auth lookup unavailable");
  }
  const doc = await db.collection("users").doc(account.uid).get();
  // UID comes from the canonical Auth record and the Firestore document key.
  const profile = doc.exists ? {...(doc.data() || {}), uid: doc.id} : null;
  console.log("STAGING_ADMIN_ACCESS=" + classifyStagingAdminAccess(account, profile));
}

main().catch(error => {
  // Never log Firebase exception messages, identities, tokens or service keys.
  const message = String(error?.message || "");
  if (message.startsWith("STAGING_ADMIN_PREFLIGHT_BLOCKED:")) {
    console.error(message);
  } else {
    console.error("STAGING_ADMIN_PREFLIGHT_BLOCKED: staging Auth/profile check unavailable");
  }
  process.exitCode = 1;
});
