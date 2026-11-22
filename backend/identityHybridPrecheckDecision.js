"use strict";
const {selectedIdRecognized, blurryNationalIdNeedsReview} = require("./selectedIdPolicy");

// Sanitize to a small decision vocabulary. No raw OCR, name, face, or ID
// details are processed or persisted by this classifier.
// OCR only verifies plausible document labels, never ID authenticity.
function classifyHybridDocumentPrecheck({ screening, aiOutcome } = {}) {
  const warnings = screening?.warningCodes || [];
  const nameMismatch = screening?.profileNameCheck === "possible_conflict";
  // DOB OCR is advisory during precheck. An OCR date conflict cannot
  // authorize account approval and stays visible to LGU/Admin after face scan.
  const unsupported = screening?.status === "unsupported" ||
    warnings.includes("school_id_not_supported");
  const typeMismatch = screening?.status === "mismatch" ||
    warnings.includes("selected_id_type_conflicts_with_ocr") ||
    warnings.includes("document_back_type_conflict");
  const invalidSides = warnings.some(code => [
    "document_front_back_swapped", "document_front_side_conflict",
    "document_back_looks_like_front",
  ].includes(code));
  const readableMatchingNationalName = screening?.declaredIdType !== "national_id" ||
    screening?.profileNameCheck === "possible_match";
  if (unsupported || typeMismatch || invalidSides) {
    return {outcome:"retry",decision:"rescan_required",reviewTrack:"none"};
  }
  if (nameMismatch) {
    return {outcome:"retry",decision:"profile_mismatch",reviewTrack:"none"};
  }
  if (aiOutcome === "pass" && selectedIdRecognized(screening) &&
      readableMatchingNationalName &&
      (screening.declaredIdType === "passport" || screening.backSideScreened === true)) {
    // Only advances to a face scan: this is never Verified Resident.
    return {outcome:"pass",decision:"ready_for_face_scan",reviewTrack:"none"};
  }
  if (aiOutcome === "review" && blurryNationalIdNeedsReview(screening) &&
      screening?.backSideProvided === true &&
      screening?.backSideScreened === true &&
      !warnings.includes("document_back_ocr_inconclusive")) {
    // OCR-only case: admin can REQUEST RESCAN. Approval requires a fresh
    // document+face flow and independent evidence.
    return {outcome:"review",decision:"pending_admin_review",reviewTrack:"blurry_id_review"};
  }
  return {outcome:"retry",decision:"rescan_required",reviewTrack:"none"};
}
module.exports = {classifyHybridDocumentPrecheck};
