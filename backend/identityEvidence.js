"use strict";

// Private review evidence. The resident's multipart payload is still forwarded
// unchanged to the AI engine; these are protected copies for authorized review.
const crypto = require("crypto");
const { v2: cloudinary } = require("cloudinary");

const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
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
    throw evidenceError("identity_image_size_invalid", field + " photo must be between 200 bytes and 7 MB.");
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
  await Promise.allSettled(entries.map(async (image) => {
    await cloudinary.uploader.destroy(image.publicId, {
      resource_type: "image", type: "authenticated", invalidate: true,
    });
  }));
}

async function storeIdentityEvidence(uid, images) {
  const saved = {};
  try {
    for (const [kind, media] of Object.entries(images)) {
      if (!media) continue;
      const publicId = "volunserve/identity-review/" + uid + "/" + crypto.randomUUID() + "-" + kind;
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
      saved[kind] = cloudinaryImage(upload, media.buffer.length);
    }
    return saved;
  } catch (error) {
    await destroyIdentityEvidence(saved);
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

module.exports = {
  readIdentityEvidence,
  storeIdentityEvidence,
  destroyIdentityEvidence,
  privateIdentityEvidenceUrl,
  RETENTION_MS,
  imageFormat,
};
