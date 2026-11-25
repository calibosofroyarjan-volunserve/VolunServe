"use strict";

// Private identity photos are isolated from public campaigns and Firestore
// client SDK access. Only the Node Admin API can issue expiring view links.
const crypto = require("node:crypto");

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const URL_LIFETIME_SECONDS = 180;
const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
function identityEvidenceRetentionDate(from = Date.now()) {
  return new Date(from + RETENTION_MS);
}
const FILES = Object.freeze([
  ["front", "idDocument"],
  ["back", "idBackDocument"],
  ["selfie", "selfie"],
]);
const EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

function evidenceError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function validImageHeader(data, mime) {
  if (mime === "image/jpeg")
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mime === "image/png")
    return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp")
    return data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  return false;
}

// This runs only AFTER a successful AI response. Never log image bytes.
async function parseConsentedIdentityEvidence(request, {requireSelfie = true, allowMissingBack = false} = {}) {
  if (!Buffer.isBuffer(request.body) ||
      !String(request.headers["content-type"] || "").toLowerCase().startsWith("multipart/form-data")) {
    throw evidenceError(400, "identity_media_missing", "Government ID and selfie files are required.");
  }
  let form;
  try {
    form = await new Response(request.body, {
      headers: { "Content-Type": request.headers["content-type"] },
    }).formData();
  } catch {
    throw evidenceError(400, "identity_multipart_invalid", "The identity images could not be read. Retake and submit them.");
  }
  // Older mobile clients can still use the pre-existing verification API,
  // but consent-free submissions are never persisted as private evidence.
  if (form.get("identityEvidenceConsent") !== "true") return null;
  const idType = String(form.get("idType") || "");
  const images = {};
  for (const [slot, field] of FILES) {
    const file = form.get(field);
    // Legacy face-only National ID compares the front portrait to the selfie.
    // The server alone authorizes allowMissingBack on its guarded route.
    const optionalPassportReverse = slot === "back" && (idType === "passport" || (allowMissingBack && idType === "national_id"));
    if (!file || typeof file.arrayBuffer !== "function") {
      if (optionalPassportReverse || (slot === "selfie" && !requireSelfie)) continue;
      throw evidenceError(400, "identity_evidence_incomplete",
        "The front and back ID images plus live selfie are required for secure Admin review.");
    }
    const mime = String(file.type || "").toLowerCase();
    if (!EXTENSIONS[mime] || !Number.isInteger(file.size) ||
        file.size < 16 || file.size > MAX_IMAGE_BYTES) {
      throw evidenceError(400, "identity_evidence_invalid",
        "Use a JPG, PNG, or WebP image up to 10 MB for each ID side and selfie.");
    }
    const data = Buffer.from(await file.arrayBuffer());
    if (!validImageHeader(data, mime)) {
      throw evidenceError(400, "identity_evidence_invalid",
        "An uploaded identity photo has an invalid image format. Retake the photo.");
    }
    images[slot] = { data, mime };
  }
  return images;
}

async function destroyIdentityEvidence({assets, cloudinary, configureCloudinary}) {
  if (!assets || typeof assets !== "object") return;
  configureCloudinary();
  const results = await Promise.allSettled(
    Object.values(assets).filter(Boolean).map(asset =>
      cloudinary.uploader.destroy(asset.publicId, {
        resource_type: "image", type: "authenticated", invalidate: true,
      })),
  );
  if (results.some(result => result.status === "rejected"))
    throw evidenceError(502, "identity_evidence_cleanup_failed",
      "Protected identity photo cleanup did not finish.");
}

async function uploadIdentityEvidence({images, uid, requestId, cloudinary, configureCloudinary}) {
  if (!images) return null;
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(uid) ||
      !/^[A-Za-z0-9_-]{8,200}$/.test(requestId)) {
    throw evidenceError(400, "identity_evidence_identifier_invalid", "Invalid identity upload reference.");
  }
  configureCloudinary();
  const uploaded = {};
  try {
    for (const [slot] of FILES) {
      const media = images[slot];
      if (!media) continue;
      const publicId = `volunserve/identity-private/${uid}/${requestId}/${slot}`;
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          resource_type: "image",
          type: "authenticated",
          public_id: publicId,
          overwrite: false,
          unique_filename: false,
          use_filename: false,
        }, (error, value) => error ? reject(error) : resolve(value));
        stream.on("error", reject);
        stream.end(media.data);
      });
      if (!result?.asset_id || result.public_id !== publicId ||
          !/^(jpg|jpeg|png|webp)$/.test(String(result.format || ""))) {
        throw evidenceError(502, "identity_evidence_upload_failed",
          "Protected identity image upload did not return a valid result.");
      }
      uploaded[slot] = {
        publicId,
        format: String(result.format),
        resourceType: "image",
        deliveryType: "authenticated",
      };
    }
    return uploaded;
  } catch {
    try {
      await destroyIdentityEvidence({assets: uploaded, cloudinary, configureCloudinary});
    } catch {
      // Retry cleanup can be performed by an operator; never print media references.
    }
    throw evidenceError(503, "identity_evidence_upload_failed",
      "Identity evidence could not be saved securely. No verification attempt was used; please retry.");
  }
}

function signedIdentityEvidence({uid, assets, cloudinary, configureCloudinary}) {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(uid)) {
    throw evidenceError(400, "identity_evidence_identifier_invalid", "Invalid Resident reference.");
  }
  configureCloudinary();
  const expiresAt = Math.floor(Date.now() / 1000) + URL_LIFETIME_SECONDS;
  const images = {front: null, back: null, selfie: null};
  for (const [slot] of FILES) {
    const asset = assets?.[slot];
    if (!asset) continue;
    const prefix = `volunserve/identity-private/${uid}/`;
    if (!String(asset.publicId || "").startsWith(prefix) ||
        asset.resourceType !== "image" || asset.deliveryType !== "authenticated" ||
        !/^(jpg|jpeg|png|webp)$/.test(String(asset.format || ""))) {
      throw evidenceError(409, "identity_evidence_not_private", "Identity evidence is not protected.");
    }
    images[slot] = cloudinary.utils.private_download_url(asset.publicId, asset.format, {
      resource_type: "image",
      type: "authenticated",
      expires_at: expiresAt,
    });
  }
  return {images, expiresAt};
}

// The Firestore metadata is inaccessible to clients; Render performs a
// lightweight, resumable sweep when awake. Expired assets are never signed.
async function purgeExpiredIdentityEvidence({db, FieldValue, cloudinary, configureCloudinary}) {
  const now = new Date();
  const expired = await db.collection("identityPrivateEvidence")
    .where("retentionUntil", "<=", now).limit(25).get();
  let purged = 0;
  for (const document of expired.docs) {
    const current = document.data() || {};
    const currentRequestId = String(current.requestId || "");
    if (!currentRequestId) continue;
    try {
      await destroyIdentityEvidence({
        assets: current.assets, cloudinary, configureCloudinary,
      });
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(document.ref);
        if (!snapshot.exists || snapshot.data()?.requestId !== currentRequestId) return;
        const record = snapshot.data() || {};
        if (!record.retentionUntil || record.retentionUntil.toMillis() > Date.now()) return;
        const verificationRef = db.collection("identityVerifications").doc(document.id);
        const verification = await transaction.get(verificationRef);
        transaction.delete(document.ref);
        if (verification.exists &&
            verification.data()?.privateEvidenceRequestId === currentRequestId) {
          transaction.set(verificationRef,
            {privateEvidenceRequestId: FieldValue.delete()}, {merge:true});
        }
      });
      purged += 1;
    } catch {
      // Keep metadata to allow retry; no signed URL can be issued after expiry.
      console.warn("Expired private identity evidence cleanup will be retried.");
    }
  }
  return purged;
}

module.exports = {
  parseConsentedIdentityEvidence,
  uploadIdentityEvidence,
  signedIdentityEvidence,
  destroyIdentityEvidence,
  identityEvidenceRetentionDate,
  purgeExpiredIdentityEvidence,
};
