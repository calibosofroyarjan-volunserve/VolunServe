"use strict";

/**
 * AI and OCR results are screening signals, never authoritative proof of
 * National ID issuance, liveness or a Resident's identity.
 * A privileged human decision route is the only way to grant Verified status.
 */
function requireAdminFinalApproval(aiDecision) {
  if (aiDecision === "verified") return "manual_review";
  if (aiDecision === "failed") return "failed";
  return "manual_review";
}

module.exports = { requireAdminFinalApproval };
