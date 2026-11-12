"use strict";

// Only documents explicitly selected in the UI and recognized by OCR may
// proceed to ID-based manual approval. OCR cannot authenticate issuance.
const ALLOWED = new Set(["national_id", "drivers_license", "passport", "umid", "prc_id"]);

function selectedIdRecognized(screening) {
  return !!screening &&
    screening.status === "text_consistent_unverified" &&
    // A *positive* document type match requires zero unresolved warnings.
    // The AI may return contradictory status+warning fields: treat ALL
    // warnings (including school_id_not_supported and back-side conflicts)
    // as disqualifying, even when its status says "text_consistent".
    // Undefined warningCodes is tolerated only for older sanitized fixtures.
    (screening.warningCodes === undefined ||
      (Array.isArray(screening.warningCodes) && screening.warningCodes.length === 0)) &&
    // Never accept a non-passport ID without both sides screened by the AI.
    (screening.declaredIdType === "passport" ||
      (screening.backSideProvided === true && screening.backSideScreened === true)) &&
    screening.imageQualityStatus !== "low" &&
    // Profile DOB and passport MRZ conflicts block even when upstream
    // supplied a misleading "consistent" status with no warning codes.
    screening.profileBirthDateCheck !== "possible_conflict" &&
    screening.passportMrzBirthDateCheck !== "possible_conflict" &&
    !["checksum_inconsistent_or_ocr_error", "multiple_candidates"].includes(
      screening.passportMrzCheck
    ) &&
    ALLOWED.has(screening.declaredIdType) &&
    screening.detectedIdType === screening.declaredIdType;
}

function blurryNationalIdNeedsReview(screening) {
  // Do not infer this is truly a National ID. Only an inconclusive scan
  // selected as National ID with objectively low image sharpness may be
  // queued for a human to request a rescan. NEVER automatically approve.
  return !!screening &&
    screening.declaredIdType === "national_id" &&
    (screening.status === "inconclusive" ||
      screening.status === "text_consistent_unverified") &&
    (screening.detectedIdType === null ||
      screening.detectedIdType === "national_id") &&
    screening.imageQualityStatus === "low" &&
    // Narrowly allow only blur/inconclusive OCR clues for *human review*.
    // A selected government type with conflicting school/issuer/side signals
    // must NOT enter the blurry-ID exception even when "low" is reported.
    Array.isArray(screening.warningCodes) &&
    screening.warningCodes.includes("low_document_image_quality") &&
    screening.warningCodes.every(code => [
      "low_document_image_quality",
      "document_type_not_recognized",
      "document_front_type_inconclusive",
      "document_back_ocr_inconclusive",
    ].includes(code));
}

function classifyIdentityReviewTrack({screening, decision, idImageQualityScore} = {}) {
  if (decision !== "manual_review") return "none";
  if (blurryNationalIdNeedsReview(screening)) return "blurry_id_review";
  if (selectedIdRecognized(screening) &&
      screening.declaredIdType === "national_id" &&
      screening.profileNameCheck === "possible_match" &&
      screening.profileBirthDateCheck === "possible_match" &&
      screening.profileAddressCheck === "possible_match" &&
      screening.imageQualityStatus === "adequate" &&
      Number.isFinite(idImageQualityScore) && idImageQualityScore >= 0.68) {
    // Expedite only. OCR name presence, a score and a face comparison
    // do NOT prove government issuance or a live person.
    return "priority_admin_review";
  }
  return "standard_admin_review";
}

function enforceSelectedIdDecision(rawDecision, screening, livenessImplemented) {
  if (rawDecision === "manual_review" && blurryNationalIdNeedsReview(screening)) return "manual_review";
  if (!selectedIdRecognized(screening)) return "failed";
  // A DOB conflict is an OCR clue, not fraud. Do not grant verification;
  // route to independent Admin correction/identity review.
  if (screening.profileBirthDateCheck === "possible_conflict" &&
      rawDecision === "verified") return "manual_review";
  // Until a separate, authorized issuer check AND independently validated
  // presentation attack detection exist, NO AI result can auto-verify.
  // Ignore AI "authenticityVerified" or "livenessImplemented" claims alone.
  if (rawDecision === "verified") return "manual_review";
  return rawDecision;
}

module.exports = {
  selectedIdRecognized, blurryNationalIdNeedsReview,
  classifyIdentityReviewTrack, enforceSelectedIdDecision,
};
