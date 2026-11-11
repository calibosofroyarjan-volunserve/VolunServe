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
    return existingApps[0];
  }

  const serviceAccount =
    getServiceAccount();

  // Staging release guard: refuse any missing or production Firebase
  // service-account credentials before accepting authenticated requests.
  if (process.env.VOLUNSERVE_STAGING_STRICT === "1" &&
      (!serviceAccount || serviceAccount.project_id !== "volunserve-auth-staging")) {
    throw new Error("Staging Firebase project mismatch: refusing to start backend.");
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