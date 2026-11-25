"use strict";

const {selectedIdRecognized} = require("./selectedIdPolicy");

/**
 * Last, independent gate before promoting a Basic Resident to Verified.
 *
 * assessment MUST be the return value from server-owned
 * assessAutomaticIdentityApproval() with independent, authenticated issuer/PAD
 * validators and a calibrated face check. NEVER use an AI JSON value, browser
 * form field or copied Firestore profile as this object.
 *
 * The entire live face-only flow remains Admin-only because it has no verified
 * government issuer proof, no calibrated face result and no validated PAD.
 * Feature flag is OFF unless an operator intentionally enables it after
 * independent provider integrations, validation and staged E2E testing.
 */
function resolveTrustedAutomaticCompletion({
  enabled = false,
  faceOnly = false,
  assessment,
  uid,
  requestId,
  verificationId,
  screening,
  assets,
} = {}) {
  const blocked = reason => ({eligible:false, reason});
  if (enabled !== true) return blocked("trusted_automatic_verification_disabled");
  if (faceOnly === true) return blocked("face_only_requires_independent_admin_review");
  if (!assessment || assessment.eligible !== true ||
      assessment.decision !== "auto_verified" ||
      assessment.reason !== "all_independent_proofs_validated")
    return blocked("trusted_independent_provider_proofs_missing");
  if (!selectedIdRecognized(screening))
    return blocked("selected_government_id_not_recognized");

  // Recheck photo-to-attempt binding independently of the issuer/PAD gateway.
  for (const value of [uid, requestId, verificationId]) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,200}$/.test(value))
      return blocked("invalid_verification_identity");
  }
  if (!assets || typeof assets !== "object")
    return blocked("consented_private_evidence_missing");
  const slots = screening?.declaredIdType === "passport"
    ? ["front", "selfie"]
    : ["front", "back", "selfie"];
  for (const slot of slots) {
    const a = assets[slot];
    if (!a || a.publicId !== `volunserve/identity-private/${uid}/${requestId}/${slot}` ||
        a.resourceType !== "image" || a.deliveryType !== "authenticated" ||
        !["jpg", "jpeg", "png", "webp"].includes(a.format))
      return blocked("missing_or_untrusted_private_" + slot);
  }
  return {eligible:true, reason:"trusted_issuer_pad_and_face_validated"};
}

module.exports = {resolveTrustedAutomaticCompletion};
