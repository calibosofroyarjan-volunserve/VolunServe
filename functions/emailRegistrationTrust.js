"use strict";

const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {onCall, HttpsError} = require("firebase-functions/https");

// Identical maintained known-domain snapshot to the VolunServe client.
// This check is trusted: altering the APK/client cannot bypass Firestore's
// requirement for a corresponding server-created emailTrust document.
const blockedDomains = new Set([
  "mailinator.com", "yopmail.com", "guerrillamail.com",
  "guerrillamailblock.com", "sharklasers.com", "10minutemail.com",
  "temp-mail.org", "tempmail.com", "tempmail.net", "trashmail.com",
  "dispostable.com", "getnada.com", "maildrop.cc", "minuteinbox.com",
  "mohmal.com", "emailondeck.com", "throwawaymail.com", "mailnesia.com",
  "fakeinbox.com", "tempmailo.com",
  ...require("./disposableEmailDomains.generated"),
]);

function emailIsDisallowed(email) {
  const value = String(email || "").trim().toLowerCase();
  const parts = value.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1] || value.length > 254) {
    return true;
  }
  const domain = parts[1].replace(/\.$/, "");
  if (!/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(domain)) {
    return true;
  }
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i += 1) {
    if (blockedDomains.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

/**
 * Called after Firebase Auth user creation, before creating a Resident profile.
 * Uses the canonical email from Admin Auth, NEVER a client-provided UID/email.
 * The Firestore 'approved' gate still requires verified email ownership.
 * A Firebase Auth UID alone does not grant VolunServe Resident privileges.
 */
exports.verifyRegistrationEmailDomain = onCall(
    {timeoutSeconds: 20, memory: "256MiB"},
    async (request) => {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError("unauthenticated", "Sign in before registering.");
      }
      const user = await getAuth().getUser(uid);
      const email = String(user.email || "").trim().toLowerCase();
      if (!email || emailIsDisallowed(email)) {
        throw new HttpsError(
            "permission-denied",
            "Temporary or invalid email addresses are not accepted. Use your own permanent email.",
        );
      }
      if (user.disabled) {
        throw new HttpsError("permission-denied", "This account is disabled.");
      }
      await getFirestore().collection("emailTrust").doc(uid).set({
        uid,
        email,
        approved: true,
        policyVersion: 1,
        checkedAt: FieldValue.serverTimestamp(),
      });
      return {approved: true};
    },
);
