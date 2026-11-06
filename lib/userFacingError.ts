/**
 * Display friendly, actionable errors on registration and sign-in screens.
 * The exact SDK code remains available to developers via error.code, but
 * internal Firestore/Firebase text must never be shown directly to users.
 */
export function userFacingError(
  error: unknown,
  fallback = "We could not complete your request. Check your details and try again."
): string {
  const details = error && typeof error === "object"
    ? error as { code?: unknown; message?: unknown }
    : null;
  const code = typeof details?.code === "string" ? details.code.toLowerCase() : "";

  const known: Record<string, string> = {
    "auth/invalid-email": "Enter a valid email address.",
    "auth/email-already-in-use": "This email is already registered. Sign in or reset your password.",
    "auth/weak-password": "Choose a stronger password and try again.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/invalid-login-credentials": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "No connection. Check your internet and try again.",
    "auth/user-disabled": "This account is disabled. Please contact the VolunServe administrator.",
    "auth/requires-recent-login": "For security, sign in again before continuing.",
    "auth/operation-not-allowed": "This sign-in method is unavailable. Contact the VolunServe administrator.",
    "auth/unauthorized-domain": "Google sign-in is not allowed on this website address. Contact the VolunServe administrator.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups and try again.",
    "auth/popup-closed-by-user": "Sign-in was cancelled. Please try again.",
    "auth/cancelled-popup-request": "Sign-in was cancelled. Please try again.",
    "auth/account-exists-with-different-credential": "This email already uses another sign-in method. Sign in using that method.",
    "auth/credential-already-in-use": "This sign-in method is already linked to another account.",
    "auth/provider-already-linked": "This sign-in method is already connected to your account.",
    "permission-denied": "You do not have permission for this action. Check your account access or contact an administrator.",
    "firestore/permission-denied": "You do not have permission for this action. Check your account access or contact an administrator.",
    "unauthenticated": "Your session has expired. Please sign in again.",
    "firestore/unauthenticated": "Your session has expired. Please sign in again.",
    "unavailable": "This service is temporarily unavailable. Check your connection and try again.",
    "firestore/unavailable": "This service is temporarily unavailable. Check your connection and try again.",
    "failed-precondition": "This action cannot be completed right now. Please try again later or contact an administrator.",
    "firestore/failed-precondition": "This action cannot be completed right now. Please try again later or contact an administrator.",
    "resource-exhausted": "The service is busy. Please try again later.",
    "deadline-exceeded": "The request took too long. Check your connection and try again.",
    "not-found": "The requested information was not found.",
  };
  if (code && known[code]) return known[code];

  const message = typeof details?.message === "string" ? details.message.trim() : "";
  if (
    message.length > 0 && message.length <= 250 &&
    !/firebase|firestore|database|missing or insufficient permissions|insufficient permissions|permission.denied|auth\/|failed.precondition|\berror\b\s*[:(\[]|\[[\w/.-]+\]|grpc|cloud.functions|stack trace|https?:\/\/|api.?key|access.?token|id.?token|client.?secret|internal|\bcode\s*\d{3,4}\b/i.test(message)
  ) return message;

  return fallback;
}
