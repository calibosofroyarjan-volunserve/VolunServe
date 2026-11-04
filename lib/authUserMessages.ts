/**
 * Firebase Auth may disclose an email collision only when an actual signup is
 * attempted. Don't query whether an arbitrary address exists on field change:
 * that would enable account enumeration and may fail when email-enumeration
 * protection is enabled.
 */
export function isRegistrationEmailConflict(error: unknown): boolean {
  const value = error as {code?: string; message?: string} | null;
  const code = String(value?.code || "");
  const message = String(value?.message || "");
  return code === "auth/email-already-in-use" ||
    /^(Email already registered\.|This email address is already registered\.|This account already has a VolunServe profile\.)$/i.test(message) ||
    /^(An account may already exist for this address\.)/i.test(message);
}

export const REGISTRATION_EMAIL_CONFLICT_MESSAGE =
  "This email may already have a VolunServe account. Sign in instead, or use Forgot Password if you cannot access it.";

/**
 * User-facing authentication copy. Never render raw SDK/provider error text.
 * Do not distinguish nonexistent users from wrong passwords in production.
 */
export function getLoginErrorMessage(error: unknown, isLocalTesting = false): string {
  const value = error as {code?: string; message?: string} | null;
  const code = String(value?.code || "");
  const message = String(value?.message || "");
  const rawCode = code || (message.match(/auth\/[a-z-]+/) || [])[0] || "";

  if (rawCode === "auth/user-not-found" || rawCode === "auth/invalid-credential" ||
      rawCode === "auth/wrong-password" || /^(No account with this email\.|Invalid email or password\.|Incorrect password\.)$/.test(message)) {
    return isLocalTesting
      ? "This account is not available in local test mode. Create a separate test account, or check the email and VolunServe password."
      : "Incorrect email or VolunServe password. If you signed up with Google, choose Continue with Google. Otherwise, check your details or use Forgot password.";
  }
  if (rawCode === "auth/invalid-email") return "Enter a valid email address.";
  if (rawCode === "auth/too-many-requests") return "Too many attempts. Please try again later.";
  if (rawCode === "auth/user-disabled") return "This account is disabled. Please contact VolunServe support.";
  if (rawCode === "auth/network-request-failed" || code === "unavailable") {
    return "Unable to connect. Check your internet connection and try again.";
  }
  if (rawCode === "auth/operation-not-allowed") {
    return "This sign-in method is currently unavailable. Please contact VolunServe support.";
  }
  if (rawCode === "auth/email-already-in-use") {
    return "An account may already exist for this address. Try signing in or using Forgot password.";
  }
  if (rawCode === "auth/requires-recent-login") {
    return "Please sign in again to continue securely.";
  }
  if (code === "permission-denied" || rawCode === "auth/unauthorized-domain") {
    return "Unable to access this account. Please contact VolunServe support.";
  }

  // Preserve our own actionable error copy, but never leak provider/library names or codes.
  if (message &&
      !/firebase|auth\/[a-z-]+|functions\/[a-z-]+|firestore|\[.*\]|permission-denied|Error \(/i.test(message) &&
      message.length <= 400) {
    return message;
  }
  return "Unable to complete your request. Please check your details and try again.";
}

export function getResetErrorMessage(error: unknown, isLocalTesting = false): string | null {
  const value = error as {code?: string; message?: string} | null;
  const code = String(value?.code || "") ||
    (String(value?.message || "").match(/auth\/[a-z-]+/) || [])[0] || "";
  if (code === "auth/user-not-found") {
    // Production: don't reveal whether an address belongs to a user.
    return isLocalTesting
      ? "This email is not in the local test accounts. Create a test account first, then request a reset."
      : null;
  }
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/too-many-requests") return "Too many reset requests. Please try again later.";
  if (code === "auth/network-request-failed" || code === "unavailable") {
    return "Unable to connect. Check your internet connection and try again.";
  }
  if (code === "auth/user-disabled") {
    return "This account is disabled. Please contact VolunServe support.";
  }
  return "Unable to request a password reset right now. Please try again later.";
}
