"use strict";
const { decideAutomaticIdentityApproval } = require("./automaticIdentityApprovalPolicy");

/**
 * Future trusted-provider orchestration. NEVER pass uploads, the AI JSON
 * response, request bodies or client-provided flags as issuer/PAD attestation.
 *
 * Each validator is a server-owned adapter that independently authenticates
 * its provider proof and returns a signed/verified, attempt-bound result.
 * Production has NO such adapters, so no current submission is eligible.
 */
async function assessAutomaticIdentityApproval({
  screening, face, attempt, issuerValidator, padValidator,
} = {}) {
  const pending = reason => ({
    eligible: false,
    decision: "pending_admin_review",
    reason,
  });
  if (!attempt || typeof attempt.verificationId !== "string" ||
      !attempt.verificationId || typeof attempt.uid !== "string" ||
      !attempt.uid) return pending("missing_trusted_attempt");

  if (typeof issuerValidator !== "function" || typeof padValidator !== "function")
    return pending("independent_provider_validators_not_configured");

  let issuer, pad;
  try {
    // Trusted validators are closed over server-side provider credentials
    // and independently validate provider signatures, issuer status, anti-spoof
    // proof, expiration, consent and SAME attempt/user before they return.
    [issuer, pad] = await Promise.all([
      issuerValidator({uid:attempt.uid,verificationId:attempt.verificationId}),
      padValidator({uid:attempt.uid,verificationId:attempt.verificationId}),
    ]);
  } catch {
    return pending("independent_provider_validation_failed");
  }

  // Recheck binding in this gateway even when individual adapters say verified.
  const sameAttempt = issuer?.uid === attempt.uid &&
    pad?.uid === attempt.uid &&
    issuer?.verificationId === attempt.verificationId &&
    pad?.verificationId === attempt.verificationId;
  if (!sameAttempt) return pending("provider_evidence_attempt_mismatch");

  const {uid: _ignoredUid, ...trustedAttempt} = attempt;
  const decision = decideAutomaticIdentityApproval({
    screening, face, attempt:trustedAttempt,
    issuerAttestation:issuer,
    padAttestation:pad,
    serverVerifiedProofs:
      issuer?.serverValidated === true &&
      pad?.serverValidated === true,
  });
  if (!decision.eligible) return decision;
  // Eligibility is never enough to grant Verified status without two
  // independently signed, one-time-use proof identifiers. They are SHA-256
  // digests of issuer-scoped JWT IDs (never raw proofs or identity numbers).
  const a = issuer?.trustedProofReplayKey;
  const b = pad?.trustedProofReplayKey;
  if (typeof a !== "string" || typeof b !== "string" ||
      !/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b) || a === b)
    return pending("trusted_proof_replay_receipts_missing");
  return {
    ...decision,
    trustedProofReplayKeys: Object.freeze({issuer:a,pad:b}),
  };
}

module.exports = { assessAutomaticIdentityApproval };
