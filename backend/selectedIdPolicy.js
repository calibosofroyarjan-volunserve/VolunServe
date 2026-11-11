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

function enforceSelectedIdDecision(rawDecision, screening, livenessImplemented) {
  if (!selectedIdRecognized(screening)) return "failed";
  // Never auto-approve from face comparison or OCR keyword recognition alone.
  if (rawDecision === "verified" &&
      (screening.authenticityVerified !== true || livenessImplemented !== true)) {
    return "manual_review";
  }
  return rawDecision;
}

module.exports = { selectedIdRecognized, enforceSelectedIdDecision };
