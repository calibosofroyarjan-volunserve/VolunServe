"use strict";

// Only documents explicitly selected in the UI and recognized by OCR may
// proceed to ID-based manual approval. OCR cannot authenticate issuance.
const ALLOWED = new Set(["national_id", "drivers_license", "passport", "umid", "prc_id"]);

function selectedIdRecognized(screening) {
  return !!screening &&
    screening.status === "text_consistent_unverified" &&
    ALLOWED.has(screening.declaredIdType) &&
    screening.detectedIdType === screening.declaredIdType;
}

function blurryNationalIdNeedsReview(screening) {
  // Do not infer this is truly a National ID. Only an inconclusive scan
  // selected as National ID with objectively low image sharpness may be
  // queued for a human to request a rescan. NEVER automatically approve.
  return !!screening &&
    screening.declaredIdType === "national_id" &&
    screening.status === "inconclusive" &&
    screening.detectedIdType === null &&
    screening.imageQualityStatus === "low" &&
    screening.warningCodes?.includes("low_document_image_quality") === true &&
    !screening.warningCodes.includes("school_id_not_supported") &&
    !screening.warningCodes.includes("ocr_unavailable");
}

function classifyIdentityReviewTrack({screening, decision, idImageQualityScore} = {}) {
  if (decision !== "manual_review") return "none";
  if (blurryNationalIdNeedsReview(screening)) return "blurry_id_review";
  if (selectedIdRecognized(screening) &&
      screening.declaredIdType === "national_id" &&
      screening.profileNameCheck === "possible_match" &&
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
  // Never auto-approve from face comparison or OCR keyword recognition alone.
  if (rawDecision === "verified" &&
      (screening.authenticityVerified !== true || livenessImplemented !== true)) {
    return "manual_review";
  }
  return rawDecision;
}

module.exports = {
  selectedIdRecognized, blurryNationalIdNeedsReview,
  classifyIdentityReviewTrack, enforceSelectedIdDecision,
};
