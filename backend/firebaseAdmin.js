"use strict";

const {
  initializeApp,
  applicationDefault,
  cert,
  getApps,
} = require("firebase-admin/app");

const {
  getAuth,
} = require("firebase-admin/auth");

const {
  getFirestore,
  FieldValue,
} = require("firebase-admin/firestore");

const {assessFullStagingEnvironment, isFullStagingRuntime} = require("./stagingFirebaseIsolation");


function getServiceAccount() {
  const raw =
    String(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
    ).trim();

  if (!raw) {
    return null;
  }

  let serviceAccount;

  try {
    serviceAccount =
      JSON.parse(raw);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.",
    );
  }

  if (
    serviceAccount.private_key &&
    typeof serviceAccount.private_key === "string"
  ) {
    serviceAccount.private_key =
      serviceAccount.private_key.replace(
        /\\n/g,
        "\n",
      );
  }

  return serviceAccount;
}

function getFirebaseApp() {
  // Validate BEFORE Firebase initialization, and before considering a cached
  // app. Never read or write Firestore to determine the target project.
  const isStaging = isFullStagingRuntime(process.env);
  if (isStaging) {
    const isolation = assessFullStagingEnvironment(process.env);
    if (!isolation.safeToUseFullStaging) {
      // Errors are intentionally generic: no tokens, service-account JSON,
      // email addresses or URLs are included in exception messages.
      throw new Error("STAGING_ISOLATION_BLOCKED: backend must use isolated full-staging Firebase and AI.");
    }
    console.log("PASS FULL_STAGING_ISOLATION: staging configuration checked without database access.");
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    if (isStaging && existingApps[0].options.projectId !== "volunserve-full-staging") {
      throw new Error("STAGING_ISOLATION_BLOCKED: Firebase app target mismatch.");
    }
    return existingApps[0];
  }

  const serviceAccount =
    getServiceAccount();

  if (serviceAccount) {
    return initializeApp({
      credential:
        cert(serviceAccount),
    });
  }

  return initializeApp({
    credential:
      applicationDefault(),
  });
}

const app =
  getFirebaseApp();

const auth =
  getAuth(app);

const db =
  getFirestore(app);

module.exports = {
  app,
  auth,
  db,
  FieldValue,
};