/**
 * Resident identity status reconciliation (UI-only, never an approval grant).
 *
 * The authenticated Node status endpoint builds identityVerified from the
 * profile-owned boolean written by a separate authorized Admin transaction.
 * Untrusted/stale verification row text alone must NOT display "Verified".
 * Both values must agree before the Resident client shows that status.
 */
export type ResidentDisplayIdentityStatus = "basic" | "pending" | "verified" | "failed";

export function reconcileResidentIdentityStatus(
  status: unknown,
  identityVerified: unknown,
): {identityStatus: ResidentDisplayIdentityStatus; identityVerified: boolean} {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (normalized === "verified") {
    return identityVerified === true
      ? {identityStatus: "verified", identityVerified: true}
      : {identityStatus: "basic", identityVerified: false};
  }
  const identityStatus: ResidentDisplayIdentityStatus =
    normalized === "pending" || normalized === "failed" ? normalized : "basic";
  return {identityStatus, identityVerified: false};
}

export function reconcileResidentIdentityDecision(
  decision: unknown,
  identityStatus: ResidentDisplayIdentityStatus,
): string | undefined {
  const text = typeof decision === "string" ? decision.trim() : "";
  if (!text) return undefined;
  if (text === "verified" && identityStatus !== "verified") {
    // A stale/falsified AI/verification-row decision is never authoritative.
    return identityStatus === "pending" ? "manual_review" : undefined;
  }
  return text.slice(0, 80);
}
