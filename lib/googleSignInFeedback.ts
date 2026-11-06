import { userFacingError } from "./userFacingError";
/**
 * Clear, non-sensitive feedback for Firebase / Google OAuth failures.
 * Do not expose raw provider payloads, credentials or Firebase internals in the UI.
 */
export function googleSignInErrorMessage(error: unknown): string {
  const source = (error && typeof error === "object")
    ? error as {code?: unknown; message?: unknown}
    : null;
  const code = typeof source?.code === "string" ? source.code : "";

  switch (code) {
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "access_denied":
      return "Google sign-in was cancelled. Choose Continue with Google to try again.";
    case "auth/unauthorized-domain":
      return "Google sign-in is not authorized for this website address. Contact the VolunServe administrator to allow this domain in Firebase Authentication.";
    case "auth/operation-not-allowed":
      return "Google sign-in is not enabled for this Firebase project. Contact the VolunServe administrator.";
    case "auth/invalid-oauth-client-id":
    case "redirect_uri_mismatch":
    case "invalid_request":
      return "Google sign-in configuration is incomplete for this website. Contact the VolunServe administrator to check the OAuth client and redirect settings.";
    case "auth/account-exists-with-different-credential":
      return "This email already uses a different sign-in method. Sign in with that method first.";
    case "auth/network-request-failed":
      return "Cannot reach Google sign-in. Check your internet connection and try again.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Please try again later.";
    case "auth/web-storage-unsupported":
    case "auth/operation-not-supported-in-this-environment":
      return "This browser is blocking a feature required for Google sign-in. Enable cookies and browser storage, or try a normal browser window.";
    case "auth/invalid-credential":
    case "auth/invalid-idp-response":
    case "invalid_grant":
      return "Google did not return a usable sign-in credential. Please try again.";
  }

  return userFacingError(
    error,
    "Google sign-in could not be completed. Check your connection and try again. If it keeps happening, contact the VolunServe administrator."
  );
}
