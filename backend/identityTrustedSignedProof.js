"use strict";

const crypto = require("node:crypto");

/**
 * Provider-neutral verifier for future independently signed National ID
 * issuer and liveness/PAD attestations. This is NOT the PSA API protocol.
 * PSA onboarding/official API specifications are required before production.
 * Proofs are not logged, stored in Firestore, or returned to clients.
 */
const AUDIENCE = "volunserve-trusted-identity-v1";
const MAXIMUM_TOKEN_BYTES = 8192;
const MAXIMUM_TTL_SECONDS = 180;
const MAXIMUM_CLOCK_SKEW_SECONDS = 15;
const SUPPORTED_ID_TYPES = new Set([
  "national_id", "passport", "drivers_license", "umid", "prc_id",
]);

const SPECS = Object.freeze({
  issuer: {
    proofKind: "trusted_independent_issuer",
    successClaim: "documentGenuine",
  },
  pad: {
    proofKind: "validated_presentation_attack_detection",
    successClaim: "livePersonConfirmed",
  },
});

function validId(value) {
  return typeof value === "string" &&
    value.length >= 8 && value.length <= 200 &&
    /^[A-Za-z0-9_-]+$/.test(value);
}
function strictBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("invalid_signed_provider_proof");
  const raw = Buffer.from(value, "base64url");
  if (!raw.length || raw.toString("base64url") !== value)
    throw new Error("invalid_signed_provider_proof");
  return raw;
}
function parseSegment(value) {
  const raw = strictBase64Url(value);
  if (raw.length > MAXIMUM_TOKEN_BYTES)
    throw new Error("invalid_signed_provider_proof");
  const out = JSON.parse(raw.toString("utf8"));
  if (!out || Array.isArray(out) || typeof out !== "object")
    throw new Error("invalid_signed_provider_proof");
  return out;
}
function verifiedProviderPublicKey(pem) {
  if (typeof pem !== "string" || pem.length < 100 ||
      pem.length > 4096 || !pem.includes("BEGIN PUBLIC KEY"))
    throw new Error("trusted_provider_public_key_missing");
  const key = crypto.createPublicKey(pem);
  if (key.asymmetricKeyType !== "ed25519")
    throw new Error("trusted_provider_key_type_unsupported");
  return key;
}
function verifyTrustedSignedProof({
  token, keyPem, provider, expectedIssuer, expectedKeyId,
  uid, verificationId, requestId, documentType, nowMs = Date.now(),
} = {}) {
  const reject = () => { throw new Error("independent_provider_proof_unverified"); };
  const spec = SPECS[provider];
  if (!spec || !validId(uid) || !validId(verificationId) ||
      !validId(requestId) || !SUPPORTED_ID_TYPES.has(documentType) ||
      !validId(expectedIssuer) ||
      !validId(expectedKeyId) || !Number.isFinite(nowMs)) reject();
  if (typeof token !== "string" || token.length > MAXIMUM_TOKEN_BYTES)
    reject();
  const parts = token.split(".");
  if (parts.length !== 3) reject();

  try {
    const header = parseSegment(parts[0]);
    const payload = parseSegment(parts[1]);
    const signature = strictBase64Url(parts[2]);

    // Forbid unsigned/downgraded proofs, remote keys or unknown critical fields.
    if (header.alg !== "EdDSA" || header.typ !== "JWT" ||
        header.kid !== expectedKeyId ||
        Object.keys(header).sort().join(",") !== "alg,kid,typ") reject();

    const key = verifiedProviderPublicKey(keyPem);
    if (!crypto.verify(null, Buffer.from(parts[0] + "." + parts[1]), key, signature))
      reject();

    const nowSeconds = Math.floor(nowMs / 1000);
    if (payload.iss !== expectedIssuer || payload.aud !== AUDIENCE ||
        payload.sub !== uid || payload.verificationId !== verificationId ||
        payload.requestId !== requestId ||
        payload.documentType !== documentType || payload.proofType !== provider ||
        payload.proofKind !== spec.proofKind ||
        payload[spec.successClaim] !== true || !validId(payload.jti) ||
        !Number.isSafeInteger(payload.iat) ||
        !Number.isSafeInteger(payload.exp) ||
        payload.iat > nowSeconds + MAXIMUM_CLOCK_SKEW_SECONDS ||
        payload.exp <= nowSeconds ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > MAXIMUM_TTL_SECONDS ||
        nowSeconds - payload.iat > MAXIMUM_TTL_SECONDS)
      reject();

    const out = {
      uid, verificationId, proofKind: spec.proofKind,
      serverValidated: true, signatureVerified: true,
    };
    out[spec.successClaim] = true;
    return Object.freeze(out);
  } catch {
    reject();
  }
}

/**
 * Constructs pinned validators consumed by the existing trust gateway.
 * Caller must obtain proofs from an authorized independent provider,
 * not from a model flag or a resident profile.
 */
function createTrustedSignedValidators({
  issuerToken, padToken, uid, requestId, verificationId, documentType,
  issuerKeyPem, padKeyPem,
  issuerName, padName,
  issuerKeyId, padKeyId,
  nowMs,
} = {}) {
  if (!validId(uid) || !validId(requestId) || !validId(verificationId) ||
      !SUPPORTED_ID_TYPES.has(documentType) ||
      !validId(issuerName) || !validId(padName) ||
      issuerName === padName || !validId(issuerKeyId) ||
      !validId(padKeyId))
    throw new Error("independent_provider_configuration_missing");

  const issuerKey = verifiedProviderPublicKey(issuerKeyPem);
  const padKey = verifiedProviderPublicKey(padKeyPem);
  if (issuerKey.export({type:"spki",format:"der"}).equals(
    padKey.export({type:"spki",format:"der"})))
    throw new Error("issuer_pad_must_use_distinct_trust_roots");

  function validator(provider, token, keyPem, expectedIssuer, expectedKeyId) {
    return async ({uid:actualUid, verificationId:actualVerificationId}) => {
      if (actualUid !== uid || actualVerificationId !== verificationId)
        throw new Error("provider_proof_attempt_mismatch");
      return verifyTrustedSignedProof({
        token, keyPem, provider, expectedIssuer, expectedKeyId,
        uid, requestId, verificationId, documentType, nowMs,
      });
    };
  }
  return Object.freeze({
    issuerValidator: validator("issuer", issuerToken, issuerKeyPem, issuerName, issuerKeyId),
    padValidator: validator("pad", padToken, padKeyPem, padName, padKeyId),
  });
}

module.exports = {
  verifyTrustedSignedProof, createTrustedSignedValidators,
};
