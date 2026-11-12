// Public, PII-free Admin review gate helpers. Server performs the real auth,
// issuer attestation, transactional state change and audit logging.
const IDS = Object.freeze(["national_id", "drivers_license", "passport", "umid", "prc_id"]);
const METHODS = Object.freeze({
  national_id: ["psa_national_id_qr_check"],
  drivers_license: ["in_person_lgu_validation", "official_document_check"],
  passport: ["in_person_lgu_validation", "official_document_check"],
  umid: ["in_person_lgu_validation", "official_document_check"],
  prc_id: ["in_person_lgu_validation", "official_document_check"],
});
const UNRESOLVED_PASSPORT = Object.freeze([
  "checksum_inconsistent_or_ocr_error", "multiple_candidates",
]);

export const METHOD_LABELS = Object.freeze({
  psa_national_id_qr_check: "PSA National ID Check (independent QR result)",
  in_person_lgu_validation: "In-person LGU identity check",
  official_document_check: "Independent official document check",
});
export function reviewBucket(review) {
  if (review?.status === "pending" && review?.requiresManualReview === true) return "pending";
  if (review?.identityVerified === true || review?.status === "verified" ||
      review?.manualReviewDecision === "verified") return "verified";
  if (review?.status === "failed" || review?.manualReviewDecision === "retry_required") return "retry_required";
  return "other";
}
export function availableMethods(type) {
  return (METHODS[type] || []).slice();
}
export function evidenceConflicts(screening) {
  if (!screening || typeof screening !== "object") return false;
  return screening.profileBirthDateCheck === "possible_conflict" ||
    screening.passportMrzBirthDateCheck === "possible_conflict" ||
    UNRESOLVED_PASSPORT.includes(screening.passportMrzCheck) ||
    (Array.isArray(screening.warningCodes) &&
      screening.warningCodes.some(code => code === "passport_mrz_review_required" ||
        code === "passport_mrz_profile_birth_date_conflict"));
}
export function documentEligibleForAdminReview(screening) {
  if (!screening || !IDS.includes(screening.declaredIdType)) return false;
  if (screening.detectedIdType !== screening.declaredIdType ||
      screening.status !== "text_consistent_unverified" ||
      screening.imageQualityStatus === "low" ||
      evidenceConflicts(screening) ||
      !Array.isArray(screening.warningCodes) ||
      screening.warningCodes.length > 0) return false;
  if (screening.declaredIdType !== "passport" &&
      (screening.backSideProvided !== true || screening.backSideScreened !== true)) return false;
  return true;
}
export function canVerify({review, method, attested, notes, busy}={}) {
  return !busy && reviewBucket(review) === "pending" &&
    documentEligibleForAdminReview(review?.documentScreening) &&
    availableMethods(review.documentScreening.declaredIdType).includes(method) &&
    attested === true && String(notes || "").trim().length >= 10 &&
    String(notes || "").trim().length <= 1000;
}
export function canRequireRetry({review,notes,busy}={}) {
  return !busy && reviewBucket(review) === "pending" &&
    String(notes || "").trim().length >= 5 &&
    String(notes || "").trim().length <= 1000;
}
export function screeningDescription(screening) {
  if (!screening) return "No document OCR screening is available. Request a new submission.";
  const status = String(screening.status || "inconclusive");
  if (status === "unsupported") return "Unsupported ID — school, employee and non-listed cards cannot proceed.";
  if (status === "mismatch") return "Selected ID type conflicts with OCR signals.";
  if (evidenceConflicts(screening)) return "Possible OCR, passport MRZ or birthday conflict. Resolve before approval; not proof of fraud.";
  if (status === "text_consistent_unverified") {
    return "Selected government ID type appears consistent with OCR. Authenticity, holder identity and liveness remain unverified.";
  }
  return "OCR result is inconclusive. Correct evidence or independent Admin review required.";
}
export function mrzDescription(screening) {
  if (screening?.declaredIdType !== "passport") return null;
  switch (screening.passportMrzCheck) {
    case "checksum_consistent_unverified":
      return "MRZ check digits consistent (OCR only). Passport issuance NOT authenticated.";
    case "checksum_inconsistent_or_ocr_error":
      return "MRZ checksum discrepancy or OCR error — request manual review.";
    case "multiple_candidates":
      return "Contradictory machine-readable OCR results — manual review required.";
    default:
      return "Machine-readable passport text not found or not checked.";
  }
}
