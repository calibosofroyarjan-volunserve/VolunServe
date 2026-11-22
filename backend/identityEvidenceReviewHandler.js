"use strict";

/**
 * Actual Admin evidence delivery handler. A separate route-level Firebase
 * auth and operational Admin middleware is required by the app installer.
 * This layer additionally checks the actor UID, submission ID, 30-day
 * retention, image completeness and audit persistence before any URLs leave.
 */
function createProtectedIdentityEvidenceHandler({
  db, FieldValue, configureCloudinary, privateIdentityEvidenceUrl,
  cleanText, makeHttpError,
}) {
  return async (request, response) => {
    response.set("Cache-Control", "private, no-store, max-age=0");
    response.set("Pragma", "no-cache");
    try {
      if (!request.firebaseUser?.uid) {
        throw makeHttpError(401, "identity_admin_auth_required", "Admin sign-in is required.");
      }
      const uid = cleanText(request.params?.uid || "", 200);
      if (!/^[A-Za-z0-9_-]{8,200}$/.test(uid)) {
        throw makeHttpError(400, "invalid_identity_evidence_uid", "Invalid Resident ID.");
      }
      const [evidenceDoc, verificationDoc] = await Promise.all([
        db.collection("identityEvidence").doc(uid).get(),
        db.collection("identityVerifications").doc(uid).get(),
      ]);
      const data = evidenceDoc.data() || {};
      const current = verificationDoc.data() || {};
      if (!evidenceDoc.exists || !verificationDoc.exists ||
          data.consentToPrivateAdminReview !== true ||
          !current.verificationId || current.verificationId !== data.verificationId) {
        throw makeHttpError(404, "identity_evidence_not_found",
          "This submission has no matching private ID evidence. Ask the Resident to resubmit.");
      }
      const expiryMs = data.expiresAt?.toMillis?.() || new Date(data.expiresAt || 0).getTime();
      if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
        throw makeHttpError(410, "identity_evidence_expired",
          "Identity evidence has expired. Request a fresh submission.");
      }
      if (!data.images?.front || !data.images?.selfie ||
          (data.idType === "national_id" && !data.images?.back)) {
        throw makeHttpError(404, "identity_evidence_incomplete",
          "Required ID Front, Back, or Selfie photo is missing. Ask for resubmission.");
      }

      configureCloudinary();
      const images = {};
      for (const side of ["front", "back", "selfie"]) {
        if (data.images[side]) {
          images[side] = privateIdentityEvidenceUrl(data.images[side]);
        }
      }
      // No URLs or image content in audit logs. Failure to audit means no
      // images are returned. Always preserve a trace of privileged access.
      await db.collection("adminActivityLogs").add({
        action: "identity_evidence_viewed",
        actorUid: request.firebaseUser.uid,
        targetUid: uid,
        verificationId: current.verificationId,
        createdAt: FieldValue.serverTimestamp(),
      });
      response.status(200).json({
        ok: true, verificationId: current.verificationId,
        images, expiresAt: new Date(expiryMs).toISOString(),
      });
    } catch (error) {
      const clientError = Number(error?.statusCode);
      const safeStatus = clientError >= 400 && clientError <= 499 ? clientError : 500;
      response.status(safeStatus).json({
        ok: false,
        error: safeStatus === 500 ? "identity_evidence_access_failed" :
          cleanText(error?.code || "identity_evidence_access_denied", 100),
        message: safeStatus === 500
          ? "Unable to view private identity photos. Please retry or contact an administrator."
          : cleanText(error?.message || "Private identity evidence is unavailable.", 300),
      });
    }
  };
}

module.exports = { createProtectedIdentityEvidenceHandler };
