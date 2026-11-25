"use strict";

/**
 * Server-only, fail-closed metadata guard for a manually reviewed, consented
 * face-only National ID submission. No biometric image or Cloudinary URL is
 * accepted from an Admin request; only private Firestore evidence metadata.
 *
 * Call inside the same Firestore transaction used to grant Verified Resident.
 */
function validateFaceOnlyReviewEvidence({uid, verification, evidence, now = Date.now()}) {
  const fail = reason => ({ok: false, reason});
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(String(uid || "")))
    return fail("invalid_resident");
  if (!verification || typeof verification !== "object")
    return fail("verification_missing");
  if (!evidence || typeof evidence !== "object")
    return fail("evidence_missing");
  const requestId = String(verification.privateEvidenceRequestId || "");
  const verificationId = String(verification.verificationId || "");
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(requestId) || !verificationId)
    return fail("verification_evidence_unlinked");
  if (evidence.uid !== uid || evidence.requestId !== requestId ||
      evidence.verificationId !== verificationId ||
      evidence.purpose !== "consented_manual_identity_review")
    return fail("verification_evidence_mismatch");
  const expiration = evidence.retentionUntil;
  const expiresMs = expiration && typeof expiration.toMillis === "function"
    ? expiration.toMillis() : NaN;
  if (!Number.isFinite(now) || !Number.isFinite(expiresMs) || expiresMs <= now)
    return fail("evidence_expired_or_invalid");
  // Both photos must be the current request's authenticated Cloudinary media,
  // not an older submission, public URL or another Resident's assets.
  for (const slot of ["front", "selfie"]) {
    const image = evidence.assets?.[slot];
    const exactPublicId = `volunserve/identity-private/${uid}/${requestId}/${slot}`;
    if (!image || image.publicId !== exactPublicId ||
        image.resourceType !== "image" ||
        image.deliveryType !== "authenticated" ||
        !["jpg", "jpeg", "png", "webp"].includes(image.format))
      return fail("private_" + slot + "_missing_or_invalid");
  }
  return {ok: true, reason: "verified_private_evidence_metadata"};
}

module.exports = {validateFaceOnlyReviewEvidence};
