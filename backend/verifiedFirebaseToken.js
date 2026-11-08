"use strict";
/**
 * Authentication is not authorization. Firebase email/password signup creates
 * an Auth-only UID BEFORE the user clicks the verification link. It must not
 * be able to invoke authenticated Render endpoints in this pending state.
 *
 * Google OAuth may set email_verified=true itself; no duplicate password or
 * second verification email should be needed for that provider.
 */
function isVerifiedFirebaseToken(decodedToken) {
  return !!decodedToken &&
    typeof decodedToken.uid === "string" &&
    decodedToken.uid.length > 0 &&
    decodedToken.email_verified === true &&
    typeof decodedToken.email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decodedToken.email);
}
/**
 * A verified Firebase UID is only a PENDING signup until users/{uid}
 * contains an approved server-backed role. A Guest or applicant record
 * must never be treated as a completed community/staff account.
 */
function isCompletedVolunServeProfile(profile) {
  if (!profile || typeof profile !== "object") return false;
  const role = String(profile.role || "").trim().toLowerCase();
  const status = profile.status;
  const approved = status === "approved" ||
    (status == null && !Object.prototype.hasOwnProperty.call(profile,"status") &&
      (role === "admin" || role === "superadmin"));
  return approved && ["resident","volunteer","admin","superadmin","lgu_personnel"].includes(role) &&
    String(profile.adminStatus || "").toLowerCase() !== "suspended";
}
module.exports = {isVerifiedFirebaseToken, isCompletedVolunServeProfile};
