"use strict";
/**
 * Optional server-side Firebase Authentication registration guard.
 *
 * Not exported from functions/index.js until the Firebase project has
 * AUTHENTICATION WITH IDENTITY PLATFORM and the beforeCreate trigger enabled.
 * Upgrading or registering the trigger changes the live signup path; deploy
 * ONLY after a separate rollout review and real-account smoke test.
 *
 * Offline list mirrors lib/disposableEmailDomains.generated.ts.
 * A static denylist does not identify all temporary domains.
 * This hook does not attempt to reject accounts with unverified email at
 * beforeCreate: new email/password accounts are unverified until the
 * verification link is delivered, so doing so would break all registrations.
 */
const known = require("./disposable-email-domains.json").domains;
const domains = new Set(known.map(value => String(value).trim().toLowerCase()));

const extras = [
  "mailinator.com", "yopmail.com", "guerrillamail.com",
  "sharklasers.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "maildrop.cc",
];
extras.forEach(domain => domains.add(domain));

function isDisposableRegistrationEmail(value) {
  if (typeof value !== "string" || value.length > 320) return false;
  const parts = value.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const domain = parts[1].replace(/\.$/, "");
  if (!/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(domain)) return false;
  const labels = domain.split(".");
  for (let index = 0; index < labels.length - 1; index++) {
    if (domains.has(labels.slice(index).join("."))) return true;
  }
  return false;
}

/** To activate only after Identity Platform is enabled:
 *   exports.blockDisposableEmailBeforeCreate =
 *     require("./registrationEmailBlocking").createBeforeCreateHook();
 */
function createBeforeCreateHook() {
  const { beforeUserCreated, HttpsError } = require("firebase-functions/v2/identity");
  return beforeUserCreated({ region: "us-central1" }, event => {
    const email = event?.data?.email;
    if (isDisposableRegistrationEmail(email)) {
      throw new HttpsError(
        "invalid-argument",
        "Use a permanent email address. Disposable email accounts are not accepted."
      );
    }
  });
}

module.exports = { isDisposableRegistrationEmail, createBeforeCreateHook };
