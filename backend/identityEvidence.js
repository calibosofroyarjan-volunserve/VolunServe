"use strict";

// Private review evidence. The resident's multipart payload is still forwarded
// unchanged to the AI engine; these are protected copies for authorized review.
const crypto = require("crypto");
const { v2: cloudinary } = require("cloudinary");
const { identityEvidencePrefix } = require("./identityStagingGuard");

// Three images must fit within the backend's existing 20 MB multipart limit.
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_REQUEST_BYTES = 19 * 1024 * 1024;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TEMP_URL_SECONDS = 300;
const FIELDS = Object.freeze({ front: "idDocument", back: "idBack", selfie: "selfie" });

function evidenceError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function imageFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return "";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return "";
}

async function readImage(form, field, required) {
  const file = form.get(field);
  if (!file && !required) return null;
  if (!file || typeof file.arrayBuffer !== "function") {
    throw evidenceError("identity_image_missing", field + " photo must be captured before submission.");
  }
  if (!Number.isFinite(file.size) || file.size < 200 || file.size > MAX_IMAGE_BYTES) {
    throw evidenceError("identity_image_size_invalid", field + " photo must be between 200 bytes and 6 MB.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const format = imageFormat(buffer);
  if (!format) {
    throw evidenceError("identity_image_type_invalid", field + " photo must be a valid JPEG, PNG or WebP image.", 415);
  }
  return { buffer, format };
}

async function readIdentityEvidence(request) {
  if (!Buffer.isBuffer(request.body) || !request.body.length) {
    throw evidenceError("identity_media_missing", "Government ID images and selfie are required.");
  }
  if (request.body.length > MAX_REQUEST_BYTES) {
    throw evidenceError("identity_upload_too_large",
      "Front ID, Back ID and selfie combined must be under 19 MB. Retake with smaller photos.", 413);
  }
  const contentType = String(request.headers["content-type"] || "");
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) {
    throw evidenceError("identity_multipart_required", "Identity evidence requires multipart form data.", 415);
  }
  let form;
  try {
    // Node 22 Web Request handles multipart boundaries and binary image bytes.
    const multipart = new Request("http://localhost/identity-evidence", {
      method: "POST",
      headers: { "content-type": contentType },
      body: request.body,
    });
    form = await multipart.formData();
  } catch {
    throw evidenceError("identity_multipart_invalid", "Could not read the identity images.");
  }
  const idType = String(form.get("idType") || "");
  if (String(form.get("evidenceConsent") || "") !== "true") {
    throw evidenceError("identity_evidence_consent_required", "Consent to private ID and selfie storage for LGU review is required.");
  }
  const images = {};
  for (const [key, field] of Object.entries(FIELDS)) {
    images[key] = await readImage(form, field, key !== "back" || idType === "national_id");
  }
  return { idType, images };
}

function cloudinaryImage(upload, bytes) {
  if (!upload?.public_id || !upload?.format || !upload?.asset_id) {
    throw evidenceError("identity_secure_upload_incomplete", "Private identity image storage did not complete.", 502);
  }
  return {
    publicId: upload.public_id,
    assetId: upload.asset_id,
    format: upload.format,
    deliveryType: "authenticated",
    bytes,
  };
}

async function destroyIdentityEvidence(images) {
  const entries = Object.values(images || {}).filter((image) => image?.publicId);
  return await Promise.allSettled(entries.map(async (image) => {
    const result = await cloudinary.uploader.destroy(image.publicId, {
      resource_type: "image", type: "authenticated", invalidate: true,
    });
    if (!["ok", "not found"].includes(result?.result)) {
      throw new Error("Cloudinary private identity evidence deletion is not confirmed.");
    }
  }));
}

async function storeIdentityEvidence(uid, images) {
  const saved = {};
  try {
    for (const [kind, media] of Object.entries(images)) {
      if (!media) continue;
      const publicId = identityEvidencePrefix() + "/" + uid + "/" + crypto.randomUUID() + "-" + kind;
      const upload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          resource_type: "image",
          type: "authenticated",
          public_id: publicId,
          overwrite: false,
          unique_filename: false,
          use_filename: false,
        }, (error, result) => error ? reject(error) : resolve(result));
        stream.on("error", reject);
        stream.end(media.buffer);
      });
      // Track the returned asset before validating its metadata. Otherwise a
      // partially valid upload result could leave a private photo orphaned.
      if (upload?.public_id) {
        saved[kind] = { publicId: upload.public_id };
      }
      saved[kind] = cloudinaryImage(upload, media.buffer.length);
    }
    return saved;
  } catch (error) {
    const cleanup = await destroyIdentityEvidence(saved);
    if (cleanup.some((entry) => entry.status === "rejected")) {
      console.warn("Private identity photo cleanup requires follow-up.");
    }
    throw evidenceError("identity_evidence_upload_failed", "Could not securely save the identity photos for Admin review. Retry without consuming an AI attempt.", 503);
  }
}

function privateIdentityEvidenceUrl(image) {
  if (!image || image.deliveryType !== "authenticated" || !image.publicId ||
      !/^[a-z0-9]+$/i.test(image.format || "")) {
    throw evidenceError("identity_evidence_unavailable", "Protected identity evidence is unavailable.", 404);
  }
  const expiresAt = Math.floor(Date.now() / 1000) + TEMP_URL_SECONDS;
  return {
    url: cloudinary.utils.private_download_url(image.publicId, image.format, {
      resource_type: "image", type: "authenticated", expires_at: expiresAt,
    }),
    expiresAt,
  };
}

// Best-effort private-media cleanup: access already expires on the server at
// expiresAt, and this sweep removes stored bytes when the backend is active.
// Failed Cloudinary deletions leave metadata available for the next retry.
async function purgeExpiredIdentityEvidence(db) {
  const expired = await db.collection("identityEvidence")
    .where("expiresAt", "<=", new Date()).limit(25).get();
  let purged = 0;
  for (const doc of expired.docs) {
    const state = doc.data() || {};
    const outcome = await destroyIdentityEvidence(state.images);
    if (outcome.some((entry) => entry.status === "rejected")) continue;
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(doc.ref);
      const currentData = current.data() || {};
      // Never delete a newer submission that replaced an expired record.
      if (!current.exists || currentData.verificationId !== state.verificationId ||
          (currentData.expiresAt?.toMillis?.() || Number.POSITIVE_INFINITY) > Date.now()) return;
      transaction.delete(doc.ref);
      purged++;
    });
  }
  return { examined: expired.size, purged };
}

// Replaced submissions must also be deleted. A retry queue prevents an
// intermittent Cloudinary deletion failure leaving old sensitive ID photos
// with no Firestore reference and no future cleanup opportunity.
async function purgeRetiredIdentityEvidence(db) {
  const retired = await db.collection("identityEvidenceRetirements")
    .limit(25).get();
  let purged = 0;
  for (const record of retired.docs) {
    const deleted = await destroyIdentityEvidence(record.data()?.images);
    if (deleted.some((result) => result.status === "rejected")) continue;
    await record.ref.delete();
    purged++;
  }
  return { examined: retired.size, purged };
}

module.exports = {
  readIdentityEvidence,
  storeIdentityEvidence,
  destroyIdentityEvidence,
  privateIdentityEvidenceUrl,
  RETENTION_MS,
  purgeExpiredIdentityEvidence,
  purgeRetiredIdentityEvidence,
  imageFormat,
};
