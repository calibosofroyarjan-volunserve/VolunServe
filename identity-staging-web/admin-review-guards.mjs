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
  // A stale verification row must never re-enable Verify on an already
  // verified profile. The Node backend enforces the same transactionally.
  if (review?.identityVerified === true || review?.identityStatus === "verified" ||
      review?.status === "verified" ||
      review?.manualReviewDecision === "verified") return "verified";
  if (review?.status === "pending" && review?.requiresManualReview === true) return "pending";
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
      screening.imageQualityStatus !== "adequate" ||
      evidenceConflicts(screening) ||
      !Array.isArray(screening.warningCodes) ||
      screening.warningCodes.length > 0) return false;
  if (screening.declaredIdType !== "passport" &&
      (screening.backSideProvided !== true || screening.backSideScreened !== true ||
       screening.backImageQualityStatus !== "adequate")) return false;
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
  if (screening.imageQualityStatus !== "adequate") return "Front ID photo quality unconfirmed or blurry. Retake the front; identity cannot be approved.";
  if (screening.declaredIdType !== "passport" &&
      screening.backImageQualityStatus !== "adequate") {
    return "Reverse-side ID photo quality unconfirmed or blurry. Retake the actual back; a readable front alone is not enough.";
  }
  if (Array.isArray(screening.warningCodes) && screening.warningCodes.length) {
    return "Document OCR has unresolved warnings. Retake the affected ID side or request independent Admin review.";
  }
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

/**
 * Explain only the caller's own staging login/access status. Never expose
 * another user's role, documents, UID or authentication token.
 *
 * The backend is still the canonical authorization gate. Do NOT grant
 * permissions or change the UI role based on the message shown here.
 */
export function stagingAccessMessage(status, errorCode) {
  const code=String(errorCode || "").slice(0,100);
  if (status === 401) {
    return "Your staging Firebase session was not accepted by the staging backend. Sign out, confirm you are using the full-staging account (not production), and sign in again.";
  }
  if (status === 403) {
    if (code === "email_not_verified") {
      return "Your staging Firebase email is not verified. Verify that staging account's email before trying again.";
    }
    if (code === "registration_incomplete") {
      return "Firebase sign-in worked, but no approved completed user profile was found in the full-staging Firestore project. Finish authorized staging account setup; production profiles do not transfer.";
    }
    if (code === "operational_admin_required") {
      return "Firebase sign-in worked, but this full-staging profile is not an approved operational Admin. An authorized staging Super Admin must review/approve a test Admin account. Do not change roles manually or use production credentials.";
    }
    return "Staging access denied. The account may not have the required Admin authorization. Ask an authorized staging Super Admin to check your test account.";
  }
  if (status === 404 && code === "profile_not_found") {
    return "This signed-in staging account has no matching full-staging Firestore user profile. Complete authorized staging account setup.";
  }
  if (status === 503 || status >= 500) {
    return "Staging backend could not check your account right now. Retry the staging check; do not change Admin permissions to work around it.";
  }
  if (status === 409) {
    return "This review was updated or its evidence conflicts. Refresh and require corrected evidence before approval.";
  }
  if (status === 423) {
    return "Staging ID/selfie uploads remain disabled; use only approved synthetic or previously authorized test reviews.";
  }
  return "Unable to load staging Admin reviews. Confirm staging account approval and service availability.";
}
