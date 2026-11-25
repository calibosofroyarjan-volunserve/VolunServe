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
const { assertOriginalAiStagingIsolation } = require("./stagingOriginalAiIsolationPolicy");

const {
  getFirestore,
  FieldValue,
} = require("firebase-admin/firestore");

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
  const existingApps =
    getApps();

  if (existingApps.length > 0) {
    // Preserve existing production behavior. On staging only, refuse
    // an already-created Firebase app if isolation is unconfirmed.
    const env = process.env;
    if (/staging/i.test(String(env.RENDER_SERVICE_NAME || "")) ||
        String(env.VOLUNSERVE_DEPLOYMENT_ENV || "").toLowerCase() === "staging" ||
        String(env.VOLUNSERVE_STAGING_STRICT || "").toLowerCase() === "true") {
      const expectedAccount = getServiceAccount();
      assertOriginalAiStagingIsolation(env, expectedAccount);
      // An SDK app initialized before this module must not silently reuse
      // a production credential. If its project is unknown, fail closed.
      const actualProject = String(existingApps[0]?.options?.projectId || "").trim();
      if (!actualProject || actualProject !== expectedAccount?.project_id) {
        throw new Error(
          "Original AI staging isolation blocked: existing Firebase app project cannot be independently verified.",
        );
      }
    }
    return existingApps[0];
  }

  const serviceAccount =
    getServiceAccount();
  // Staging must fail before any Firebase network client is initialized.
  // No changes to approved production role/account data or Firebase rules.
  assertOriginalAiStagingIsolation(process.env, serviceAccount);

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