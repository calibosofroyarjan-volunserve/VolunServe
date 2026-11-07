"use strict";
// Require an email-verified Firebase session in every authenticated callable.
// This does not affect the initial Auth-only signup step or verification link.
function isVerifiedCallableEmail(request) {
  return !!request?.auth?.uid &&
    request.auth.token?.email_verified === true &&
    typeof request.auth.token?.email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.auth.token.email);
}
module.exports = {isVerifiedCallableEmail};
