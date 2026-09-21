"use strict";

const admin = require("firebase-admin");

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

if (!admin.apps.length) {
  const serviceAccount =
    getServiceAccount();

  if (serviceAccount) {
    admin.initializeApp({
      credential:
        admin.credential.cert(
          serviceAccount,
        ),
    });
  } else {
    admin.initializeApp({
      credential:
        admin.credential.applicationDefault(),
    });
  }
}

const auth =
  admin.auth();

const db =
  admin.firestore();

const FieldValue =
  admin.firestore.FieldValue;

module.exports = {
  admin,
  auth,
  db,
  FieldValue,
};