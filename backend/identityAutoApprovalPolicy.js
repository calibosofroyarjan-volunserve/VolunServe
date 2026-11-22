"use strict";

const {selectedIdRecognized} = require("./selectedIdPolicy");

// Future trusted-provider integration boundary.
//
// DO NOT pass issuer or PAD evidence directly from the browser or the
// current OCR/face-matching AI service: its output cannot establish official
// government issuance or independent presentation-attack detection.
// The backend must independently validate each provider's signed response,
// binding it to this resident, session and an unexpired nonce, before calling
// this policy. That integration is not available in current VolunServe.
const AUTO_APPROVAL_IN_PRODUCTION = false;

function evaluateAutoApprovalReadiness({
  screening, faceMatchPassed,
  trustedIssuerEvidence, trustedPadEvidence,
  userIdentityConsistent, sessionBindingVerified,
} = {}) {
  const requirements = {
    selectedGovernmentIdRecognized: selectedIdRecognized(screening),
    accountNameMatches: screening?.profileNameCheck === "possible_match",
    birthDateNoConflict: screening?.profileBirthDateCheck !== "possible_conflict",
    photoQualityAdequate: screening?.imageQualityStatus === "adequate",
    independentFaceMatch: faceMatchPassed === true,
    governmentIssuerCheck: trustedIssuerEvidence?.issuerRegistryVerified === true &&
      trustedIssuerEvidence?.signatureValidated === true &&
      trustedIssuerEvidence?.boundToSession === true,
    independentValidatedAntiSpoofing: trustedPadEvidence?.presentationAttackPassed === true &&
      trustedPadEvidence?.independentlyValidated === true &&
      trustedPadEvidence?.signatureValidated === true &&
      trustedPadEvidence?.boundToSession === true,
    authenticatedAccountBinding: userIdentityConsistent === true &&
      sessionBindingVerified === true,
  };
  const missing = Object.entries(requirements)
    .filter(([,passed]) => !passed)
    .map(([name]) => name);

  // Gate OFF until two real independent, vetted provider integrations are
  // implemented and security-reviewed. Never mark a Resident Verified based
  // solely on an AI's OCR, a still-photo face score, or a client-side challenge.
  return {
    eligible: AUTO_APPROVAL_IN_PRODUCTION && missing.length === 0,
    decision: "admin_review",
    requirementsMet: missing.length === 0,
    missingRequirements: missing,
    automaticApprovalActive: AUTO_APPROVAL_IN_PRODUCTION,
  };
}
module.exports = {evaluateAutoApprovalReadiness};
