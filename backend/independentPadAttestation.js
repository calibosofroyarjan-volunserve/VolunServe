"use strict";
const crypto = require("node:crypto");

// SERVER-ONLY, fail-closed independent PAD attestation verifier (STAGING).
// This verifier does NOT detect liveness and does NOT certify a PAD provider.
// It provides the cryptographic trust boundary for a future independently
// evaluated PAD provider. No public key/provider -> no PAD approval.
// The attestation MUST be signed by a distinct trusted provider's Ed25519 key,
// bound to THIS one-time backend request and exact multipart byte digest.
// Do not put biometric images, UID, email, ID numbers or provider secrets here.

const PAD_VERSION = 1;
const MAX_ATTESTATION_AGE_MS = 90_000;
const FUTURE_CLOCK_SKEW_MS = 5_000;
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function notValidated(reason) {
  // Coarse finite categories only, never provider exception messages.
  const allowed = new Set([
    "provider_unconfigured", "evidence_missing", "invalid_evidence",
    "invalid_signature", "expired_or_unbound", "provider_rejected",
  ]);
  return {status:"not_validated",reason:allowed.has(reason)?reason:"invalid_evidence"};
}

/**
 * Expected evidence:
 * { payloadB64url: base64url(UTF8 JSON), signatureB64url: base64url(Ed25519 signature) }
 * Signed JSON: {version:1, issuer, decision:"live"|"attack", uidHash,
 * requestId, multipartSha256, issuedAtMs, expiresAtMs}
 *
 * The private key must never be in VolunServe's frontend or Firestore.
 * A signature only authenticates a provider decision; a PAD provider still
 * requires independent replay/print/device validation before deployment.
 */
function verifyIndependentPadAttestation({
  evidence, publicKeyPem, expectedIssuer, expectedUid,
  expectedRequestId, multipartBytes, nowMs = Date.now(),
} = {}) {
  if (!publicKeyPem || !expectedIssuer) return notValidated("provider_unconfigured");
  if (!evidence) return notValidated("evidence_missing");
  if (!Buffer.isBuffer(multipartBytes) || !multipartBytes.length ||
      typeof expectedUid !== "string" || !expectedUid ||
      typeof expectedRequestId !== "string" || !expectedRequestId ||
      typeof nowMs !== "number" || !Number.isFinite(nowMs)) {
    return notValidated("invalid_evidence");
  }
  const encoded = evidence?.payloadB64url;
  const signature = evidence?.signatureB64url;
  if (typeof encoded !== "string" || !B64URL.test(encoded) || encoded.length > 2048 ||
      typeof signature !== "string" || !B64URL.test(signature) ||
      signature.length !== 86) { // 64-byte Ed25519 signature base64url
    return notValidated("invalid_evidence");
  }

  let key, raw, attestation, signatureBytes;
  try {
    key = crypto.createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") return notValidated("provider_unconfigured");
    raw = Buffer.from(encoded, "base64url");
    signatureBytes = Buffer.from(signature, "base64url");
    if (signatureBytes.length !== 64) return notValidated("invalid_signature");
    // Signature verification precedes trusting any field values.
    if (!crypto.verify(null, raw, key, signatureBytes)) return notValidated("invalid_signature");
    attestation = JSON.parse(raw.toString("utf8"));
  } catch {
    return notValidated("invalid_evidence");
  }
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation) ||
      attestation.version !== PAD_VERSION ||
      attestation.issuer !== expectedIssuer ||
      typeof attestation.uidHash !== "string" ||
      !HEX_SHA256.test(attestation.uidHash) ||
      typeof attestation.multipartSha256 !== "string" ||
      !HEX_SHA256.test(attestation.multipartSha256) ||
      typeof attestation.requestId !== "string" ||
      !["live","attack"].includes(attestation.decision)) {
    return notValidated("invalid_evidence");
  }
  if (!Number.isSafeInteger(attestation.issuedAtMs) ||
      !Number.isSafeInteger(attestation.expiresAtMs) ||
      attestation.issuedAtMs > nowMs + FUTURE_CLOCK_SKEW_MS ||
      attestation.expiresAtMs < nowMs ||
      attestation.expiresAtMs <= attestation.issuedAtMs ||
      attestation.expiresAtMs - attestation.issuedAtMs > MAX_ATTESTATION_AGE_MS ||
      attestation.issuedAtMs < nowMs - MAX_ATTESTATION_AGE_MS ||
      attestation.requestId !== expectedRequestId) {
    return notValidated("expired_or_unbound");
  }
  // Compare digest values without leaking which field mismatched.
  const safeEqual = (a,b) => {
    const left=Buffer.from(a,"hex"),right=Buffer.from(b,"hex");
    return left.length===right.length && crypto.timingSafeEqual(left,right);
  };
  if (!safeEqual(attestation.uidHash,sha256Hex(expectedUid)) ||
      !safeEqual(attestation.multipartSha256,sha256Hex(multipartBytes))) {
    return notValidated("expired_or_unbound");
  }
  // Signatures are necessary, NOT sufficient. In the absence of an
  // independently validated PAD provider this output must NOT enable
  // biometric uploads or automatic identity approval.
  return attestation.decision === "attack"
    ? {status:"spoof_detected",reason:"provider_rejected"}
    : {status:"provider_attested",reason:"signed_provider_claim_unvalidated"};
}

module.exports={verifyIndependentPadAttestation};
