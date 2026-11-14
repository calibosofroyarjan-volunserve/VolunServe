"use strict";

/**
 * Strict, bounded, in-memory multipart inspection at the authenticated
 * Node-to-Python boundary. This is NOT an OCR, issuer, face or liveness check.
 * Only the five planned ID types and expected media fields are forwarded.
 * Never log buffers, filenames, OCR, form data or user IDs.
 *
 * Note: the staging media approval gate remains disabled (HTTP 423); this
 * guard prepares future authorized staging review without enabling uploads.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ENVELOPE_BYTES = 32 * 1024 * 1024;
const SUPPORTED_IDS = new Set([
  "national_id", "drivers_license", "passport", "umid", "prc_id",
]);
const MIME_TYPES = new Set(["image/jpeg","image/jpg","image/png","image/webp"]);
const FILE_FIELDS = new Set(["idDocument","idBackDocument","selfie"]);
const SEPARATOR = Buffer.from("\r\n\r\n","ascii");

function rejected(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function fail() {
  throw rejected(400,"invalid_identity_multipart",
    "The ID/selfie upload format is invalid. Retake the images and try again.");
}

function multipartBoundary(contentType) {
  const type = String(contentType || "");
  if (type.length > 240 || /[\r\n\u0000-\u001f\u007f]/.test(type)) {
    throw rejected(415,"invalid_identity_content_type",
      "Government ID images require a valid multipart form submission.");
  }
  const match = /^multipart\/form-data\s*;\s*boundary=(?:"([^"]{1,70})"|([^;\s]{1,70}))\s*$/i.exec(type);
  const boundary = match?.[1] || match?.[2];
  // A strict ASCII token avoids ambiguous multipart boundaries and CRLF
  // injection. The browser/React Native generate compliant random tokens.
  if (!boundary || !/^[A-Za-z0-9'()+_,./:=?-]{1,70}$/.test(boundary)) {
    throw rejected(415,"invalid_identity_content_type",
      "Government ID images require a valid multipart form submission.");
  }
  return boundary;
}

function detectMagic(data, mimeType) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return data.length >= 3 && data[0] === 0xff &&
      data[1] === 0xd8 && data[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return data.length >= 8 &&
      data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  }
  if (mimeType === "image/webp") {
    return data.length >= 12 &&
      data.toString("ascii",0,4) === "RIFF" &&
      data.toString("ascii",8,12) === "WEBP";
  }
  return false;
}

function inspectIdentityMultipartEnvelope(body, contentType, mode) {
  if (mode !== "verify" && mode !== "precheck") {
    throw new Error("Unexpected identity multipart validation mode");
  }
  const boundary = multipartBoundary(contentType);
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw rejected(400,"missing_identity_media","Government ID media is required.");
  }
  if (body.length > MAX_ENVELOPE_BYTES) {
    throw rejected(413,"identity_media_too_large","ID/selfie submission is too large.");
  }

  const delimiter = Buffer.from("--" + boundary,"ascii");
  const partBoundary = Buffer.from("\r\n--" + boundary,"ascii");
  if (!body.subarray(0,delimiter.length).equals(delimiter)) fail();
  let cursor = delimiter.length;
  const seen = new Set();
  let idType = "";
  let count = 0;

  while (cursor < body.length) {
    if (body.toString("ascii",cursor,cursor+2) !== "\r\n") fail();
    cursor += 2;
    const headerEnd = body.indexOf(SEPARATOR,cursor);
    if (headerEnd < cursor || headerEnd-cursor > 2048) fail();
    const headerText = body.toString("utf8",cursor,headerEnd);
    if (!/^[\x20-\x7e\r\n]*$/.test(headerText)) fail();
    const headers = new Map();
    for (const line of headerText.split("\r\n")) {
      const m = /^([A-Za-z-]+):[ \t]*(.*)$/.exec(line);
      if (!m) fail();
      const key = m[1].toLowerCase();
      if (headers.has(key) || !["content-disposition","content-type"].includes(key)) fail();
      headers.set(key,m[2].trim());
    }
    const disposition = headers.get("content-disposition") || "";
    const info = /^form-data;\s*name="([^"\r\n]{1,40})"(?:;\s*filename="([^"\r\n]{1,255})")?$/i.exec(disposition);
    if (!info) fail();
    const name = info[1];
    const isMedia = FILE_FIELDS.has(name);
    if (!(isMedia || name === "idType") || seen.has(name)) fail();
    seen.add(name);
    count += 1;
    if (count > 4) fail();
    if (mode === "precheck" && name === "selfie") {
      throw rejected(400,"selfie_not_allowed_in_precheck",
        "A selfie is not required for preliminary ID screening.");
    }

    cursor = headerEnd + SEPARATOR.length;
    const next = body.indexOf(partBoundary,cursor);
    if (next < cursor) fail();
    const length = next-cursor;
    if (isMedia) {
      if (!info[2] || !length) fail();
      if (length > MAX_FILE_BYTES) {
        throw rejected(413,"identity_image_too_large",
          "Each government ID/selfie image must be 10 MB or smaller.");
      }
      const mime = (headers.get("content-type") || "").toLowerCase();
      if (!MIME_TYPES.has(mime) || !detectMagic(body.subarray(cursor,next),mime)) {
        throw rejected(415,"unsupported_identity_image",
          "Use an actual JPEG, PNG or WebP image for the government ID/selfie.");
      }
    } else {
      if (info[2] || length < 3 || length > 60) fail();
      const mime = (headers.get("content-type") || "").toLowerCase();
      if (mime && mime !== "text/plain" && mime !== "text/plain; charset=utf-8") fail();
      const value = body.toString("utf8",cursor,next);
      if (!SUPPORTED_IDS.has(value)) {
        throw rejected(400,"unsupported_government_id",
          "Select one of the five supported government ID types.");
      }
      idType = value;
    }
    cursor = next + partBoundary.length;
    const ending = body.toString("ascii",cursor,cursor+2);
    if (ending === "--") {
      cursor += 2;
      // A terminal CRLF is permitted by standard browser-generated multipart.
      if (cursor === body.length-2 && body.toString("ascii",cursor) === "\r\n") cursor += 2;
      if (cursor !== body.length) fail();
      break;
    }
    if (ending !== "\r\n") fail();
    if (count >= 4) fail();
  }

  if (cursor !== body.length || !idType || !seen.has("idDocument") ||
      (idType !== "passport" && !seen.has("idBackDocument")) ||
      (mode === "verify" && !seen.has("selfie"))) {
    fail();
  }
  // Do not persist or return file metadata; the Python service independently
  // checks individual image formats and actual decoded image integrity.
  return true;
}

function requireValidatedIdentityMultipart(mode) {
  return function validatedIdentityMultipart(request,response,next) {
    try {
      inspectIdentityMultipartEnvelope(
        request.body,request.headers["content-type"],mode);
      return next();
    } catch(error) {
      const code = error?.code || "invalid_identity_multipart";
      const status = Number(error?.statusCode);
      return response.status([400,413,415].includes(status) ? status : 400).json({
        error: code,
        message: String(error?.message || "Invalid identity media.").slice(0,180),
      });
    }
  };
}

module.exports = {
  inspectIdentityMultipartEnvelope,
  requireValidatedIdentityMultipart,
};
