"use strict";

const {
  initializeApp,
  cert,
  getApps,
} = require("firebase-admin/app");

const {
  getAuth,
} = require("firebase-admin/auth");
const { assertIsolatedStagingFirebase } = require("./stagingFirebaseIsolationPolicy");

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
  const serviceAccount =
    getServiceAccount();

  const emulatorProject = process.env.GOOGLE_CLOUD_PROJECT;
  const localEmulator = !process.env.RENDER && !serviceAccount &&
    /^demo-[a-z0-9-]+$/.test(emulatorProject || "") &&
    process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080";
  if (!localEmulator) {
    // QA is a separate, explicitly selected project. Never make the ordinary
    // staging backend accept the new QA project's service account by accident.
    const qaMode = process.env.VOLUNSERVE_DIDIT_QA_ISOLATED === "true";
    const expectedProject = qaMode ? "volunserve-didit-qa" : "volunserve-full-staging";
    if (qaMode && !/^volunserve(?:-[a-z0-9]+)*-qa(?:-[a-z0-9]+)*$/.test(
      String(process.env.RENDER_SERVICE_NAME || ""))) {
      throw new Error("Didit QA requires a separately named QA Render service.");
    }
    if (process.env.VOLUNSERVE_DEPLOYMENT_ENV !== "staging" ||
        process.env.VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID !== expectedProject ||
        process.env.VOLUNSERVE_STAGING_STRICT !== "true" ||
        process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      throw new Error("This backend requires an explicitly isolated staging or Didit QA Firebase project.");
    }
    assertIsolatedStagingFirebase(process.env, serviceAccount);
  }
  const projectId = localEmulator ? emulatorProject : serviceAccount.project_id;
  const existing = getApps().find(app => app.name === "[DEFAULT]");
  if (existing) {
    if (existing.options.projectId !== projectId) throw new Error("Firebase app project mismatch.");
    return existing;
  }
  return initializeApp(localEmulator ? { projectId } : { projectId, credential: cert(serviceAccount) });
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