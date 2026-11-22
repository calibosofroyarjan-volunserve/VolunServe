/**
 * In-memory UI coordination only: not an authorization or identity decision.
 * While an existing password owner explicitly links a Google credential,
 * RootLayout must not navigate away from Login before linking finishes.
 *
 * This state never persists credentials, tokens, email, or account data.
 * Firestore rules and UID/email/provider checks remain authoritative.
 */
let linkingExistingGoogleAccount = false;

export function setExistingGoogleLinkInProgress(active: boolean): void {
  linkingExistingGoogleAccount = active;
}

export function isExistingGoogleLinkInProgress(): boolean {
  return linkingExistingGoogleAccount;
}
