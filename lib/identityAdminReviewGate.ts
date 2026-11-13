import type { DocumentScreening } from "./identityVerification";

/**
 * Fail-closed UI PRECHECK for an independently reviewed government ID.
 * Does not authorize identity verification; the transactional Node Admin
 * endpoint is the sole decision authority and checks account permissions.
 *
 * Legacy snapshots missing documented quality evidence must request a
 * corrected scan rather than enabling a client-side Verify button.
 */
const SUPPORTED_ID_TYPES = [
  "national_id", "drivers_license", "passport", "umid", "prc_id",
] as const;

export function adminReviewDocumentEligible(
  screening?: DocumentScreening | null,
): boolean {
  if (!screening || screening.status !== "text_consistent_unverified") return false;
  const declared = screening.declaredIdType;
  if (!declared || !SUPPORTED_ID_TYPES.includes(declared) ||
      screening.detectedIdType !== declared) return false;
  if (!Array.isArray(screening.warningCodes) ||
      screening.warningCodes.length !== 0) return false;
  if (screening.imageQualityStatus !== "adequate") return false;
  if (declared !== "passport" &&
      (screening.backSideProvided !== true ||
       screening.backSideScreened !== true ||
       screening.backImageQualityStatus !== "adequate")) return false;
  if (screening.profileBirthDateCheck === "possible_conflict" ||
      screening.passportMrzBirthDateCheck === "possible_conflict" ||
      screening.passportMrzCheck === "checksum_inconsistent_or_ocr_error" ||
      screening.passportMrzCheck === "multiple_candidates") return false;
  return true;
}

export type AdminReviewStatus = "pending" | "verified" | "retry_required" | "all";

export type AdminReviewStatusInput = {
  status?: string;
  identityStatus?: string;
  identityVerified?: boolean;
  manualReviewDecision?: string;
  requiresManualReview?: boolean;
};

/** A stale pending verification row cannot mask an already verified profile. */
export function adminReviewStatusBucket(row: AdminReviewStatusInput): AdminReviewStatus {
  if (row.identityVerified === true || row.identityStatus === "verified" ||
      row.status === "verified" || row.manualReviewDecision === "verified")
    return "verified";
  if (row.status === "failed" || row.manualReviewDecision === "retry_required")
    return "retry_required";
  if (row.status === "pending" && row.requiresManualReview === true)
    return "pending";
  return "all";
}
