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
const { validateStagingEnvironment } = require("./stagingIsolation");

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
  const serviceAccount = getServiceAccount();
  // Before touching Firebase Auth/Firestore, reject accidental staging use
  // of production credentials or the production Python AI endpoint.
  validateStagingEnvironment(process.env, serviceAccount);

  const existingApps = getApps();
  if (existingApps.length > 0) {
    if (
      process.env.VOLUNSERVE_DEPLOYMENT_ENV === "staging" &&
      existingApps[0].options.projectId !== "volunserve-auth-staging"
    ) {
      throw new Error("Unsafe staging config: Firebase app is not the staging project.");
    }
    return existingApps[0];
  }

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