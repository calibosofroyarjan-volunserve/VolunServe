"use strict";

/**
 * Fail-closed automated Resident identity approval eligibility.
 *
 * This is a *policy* for future independently validated issuer + PAD
 * integrations. Do not use a face score, OCR text, account self-report,
 * or AI-service livenessImplemented/authenticityVerified booleans as proof.
 *
 * IMPORTANT: issuerAttestation and padAttestation must be created ONLY by
 * server-side proof validation against external trusted services. Never
 * deserialize them from user uploads, Firestore profile fields or AI JSON.
 *
 * No issuer/PAD validators are connected in current VolunServe production.
 * As a result, this function cannot authorize any current resident.
 */
const {selectedIdRecognized} = require("./selectedIdPolicy");

const SUPPORTED_ISSUER_PROOF = "trusted_independent_issuer";
const SUPPORTED_PAD_PROOF = "validated_presentation_attack_detection";

function decideAutomaticIdentityApproval({
  screening,
  face,
  issuerAttestation,
  padAttestation,
  attempt,
  serverVerifiedProofs = false,
} = {}) {
  const ineligible = reason => ({eligible:false,decision:"pending_admin_review",reason});
  if (!selectedIdRecognized(screening)) return ineligible("id_not_recognized");
  if (screening.profileNameCheck !== "possible_match")
    return ineligible("name_not_confirmed");
  if (screening.profileBirthDateCheck !== "possible_match")
    return ineligible("dob_not_confirmed");
  if (screening.declaredIdType !== "passport" &&
      screening.backSideScreened !== true)
    return ineligible("back_side_not_screened");
  if (screening.imageQualityStatus !== "adequate")
    return ineligible("image_quality_not_adequate");
  if (screening.warningCodes?.length)
    return ineligible("document_has_warnings");

  // A calibrated matcher must give a signed/bounded result. The current
  // MediaPipe shape-distance number is not a calibrated P(same person).
  if (face?.result !== "match" ||
      face?.algorithmValidated !== true ||
      face?.calibrationValidated !== true ||
      face?.samePersonAssertion !== true)
    return ineligible("validated_face_comparison_missing");
  if (attempt?.freshCapture !== true ||
      attempt?.consentedEvidenceAvailable !== true ||
      attempt?.verificationId !== face?.verificationId)
    return ineligible("bound_current_evidence_missing");

  // Verify both attestations server-side before invoking this function:
  // same user, same attempt, valid issuer proof + independently validated PAD.
  if (!serverVerifiedProofs ||
      issuerAttestation?.proofKind !== SUPPORTED_ISSUER_PROOF ||
      issuerAttestation?.signatureVerified !== true ||
      issuerAttestation?.documentGenuine !== true ||
      issuerAttestation?.verificationId !== attempt.verificationId)
    return ineligible("independent_issuer_proof_missing");

  if (padAttestation?.proofKind !== SUPPORTED_PAD_PROOF ||
      padAttestation?.signatureVerified !== true ||
      padAttestation?.livePersonConfirmed !== true ||
      padAttestation?.verificationId !== attempt.verificationId)
    return ineligible("validated_liveness_missing");

  return {eligible:true,decision:"auto_verified",reason:"all_independent_proofs_validated"};
}

module.exports = {decideAutomaticIdentityApproval};
