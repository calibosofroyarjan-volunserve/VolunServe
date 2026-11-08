/**
 * UI spam guard only: Firebase Auth and Identity Platform enforce their own
 * server-side limits. Do not treat this device-local timer as bot protection.
 */
export const VERIFICATION_EMAIL_COOLDOWN_MS = 60_000;

export function verificationCooldownSeconds(lastSuccessfulSendAtMs: number, nowMs: number): number {
  if (!Number.isFinite(lastSuccessfulSendAtMs) || lastSuccessfulSendAtMs <= 0) return 0;
  return Math.max(0, Math.ceil(
    (lastSuccessfulSendAtMs + VERIFICATION_EMAIL_COOLDOWN_MS - nowMs) / 1000
  ));
}
