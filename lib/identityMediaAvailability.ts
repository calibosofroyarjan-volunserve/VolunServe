/**
 * Explicit backend capability gate for sensitive government ID/selfie uploads.
 *
 * An AI health probe saying "ready" only confirms service/authorization checks;
 * it does NOT mean private uploads are permitted, and absolutely does NOT mean
 * independent PAD, issuer authenticity or identity approval was validated.
 * Fail closed on missing/ambiguous capability before opening an ID camera.
 */
export const IDENTITY_MEDIA_PAUSED_MESSAGE =
  "Government ID and selfie submissions are paused in this staging environment. " +
  "No identity images were sent. Camera-only research remains separate; " +
  "your account is not verified by these tests.";

export function assertIdentityMediaSubmissionAllowed(body: unknown): void {
  const status = body as {ready?: unknown; mediaSubmissionEnabled?: unknown} | null;
  if (!status || status.ready !== true || status.mediaSubmissionEnabled !== true) {
    throw new Error(IDENTITY_MEDIA_PAUSED_MESSAGE);
  }
}
