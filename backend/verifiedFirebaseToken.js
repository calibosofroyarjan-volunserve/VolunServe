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
module.exports = {isVerifiedFirebaseToken};
