"use strict";
// These triggers REQUIRE Firebase Authentication with Identity Platform.
// DO NOT DEPLOY until isolated staging, real registration and existing staff
// login regression tests pass. Deploy ONLY the two exports after upgrade.
// Pre-sign-in cannot blanket reject unverified email: it also runs before
// the first registration token, which is needed to send a verification link.
const {beforeUserCreated, beforeUserSignedIn, HttpsError} = require("firebase-functions/v2/identity");
const {getFirestore} = require("firebase-admin/firestore");
const {defineSecret} = require("firebase-functions/params");
const {enforceSignupIpRateLimit, RegistrationRateLimitError} = require("./registrationIpRateLimiter");
const signupRateLimitSecret = defineSecret("VOLUNSERVE_REGISTRATION_RATE_LIMIT_SECRET");
const {classifyRegistrationEmail} = require("./registrationEmailScreening");

function rejectEmail() {
  throw new HttpsError(
      "permission-denied",
      "This email cannot be used for VolunServe registration. Use a permanent address."
  );
}
const beforeCreate = beforeUserCreated({
  region: "us-central1",
  secrets: [signupRateLimitSecret],
}, async (event) => {
  // Block the fake mailbox BEFORE creating a Firebase Auth UID.
  if (!classifyRegistrationEmail(event.data?.email).allowed) rejectEmail();
  // This is genuine server-side rate limiting: distributed Firestore
  // transaction keyed by HMAC(IP + time window), not a bypassable UI timer.
  // It is STAGED ONLY until Identity Platform and the secret + TTL policy are
  // configured and verified. Do not use this on normal sign-ins.
  try {
    await enforceSignupIpRateLimit({
      db: getFirestore(),
      ipAddress: event.ipAddress,
      eventId: event.eventId,
      secret: signupRateLimitSecret.value(),
    });
  } catch (error) {
    if (error instanceof RegistrationRateLimitError) {
      throw new HttpsError("resource-exhausted",
        "Too many registrations from this network. Please try again later.");
    }
    // Never allow an unverified Auth UID through when the required
    // rate-limit check unexpectedly fails.
    throw new HttpsError("unavailable", "Registration is temporarily unavailable. Please try again later.");
  }
});
const beforeSignIn = beforeUserSignedIn({region: "us-central1"}, async (event) => {
  const email = event.data?.email;
  if (classifyRegistrationEmail(email).allowed) return;
  // Keep currently approved historical staff access intact until an explicit
  // authorized migration. New public registrations have no user profile here.
  const uid = event.data?.uid;
  if (uid) {
    const snapshot = await getFirestore().doc("users/" + uid).get();
    const p = snapshot.exists ? snapshot.data() : null;
    if (p && (p.role === "admin" || p.role === "superadmin") &&
        (p.status === "approved" || p.status == null) &&
        p.adminStatus !== "suspended") return;
  }
  rejectEmail();
});
module.exports = {beforeCreate, beforeSignIn};
