"use strict";

/**
 * Privacy-preserving storage contract for Hybrid Identity staging.
 *
 * Untrusted OCR/AI-provider prose may contain names, birth dates, document
 * numbers or image-derived data. Never persist it or display it in Admin
 * review. Use only the already-normalized, enumerated screening categories.
 *
 * These helpers make no Firebase calls, no network calls and no decisions
 * about document authenticity, liveness or Resident verification.
 */
const HOURS = 60 * 60 * 1000;
const PRECHECK_THROTTLE_RETENTION_MS = 48 * HOURS;
const VERIFICATION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,200}$/;

function boundedVerificationId(candidate, fallback) {
  // A provider ID is an opaque correlation token, not a message or OCR field.
  return typeof candidate === "string" &&
    VERIFICATION_ID_PATTERN.test(candidate)
    ? candidate
    : fallback;
}

function identityPrecheckExpiresAt(nowMs) {
  if (!Number.isFinite(nowMs) || nowMs < 0 ||
      nowMs > 8640000000000000 - PRECHECK_THROTTLE_RETENTION_MS) {
    throw new Error("Invalid precheck timestamp");
  }
  return new Date(nowMs + PRECHECK_THROTTLE_RETENTION_MS);
}

function safeIdentityOutcomeMessage({
  decision,
  requiresManualReview,
  attemptCount,
  maxAttempts = 3,
  documentScreening,
} = {}) {
  const warningCodes = Array.isArray(documentScreening?.warningCodes)
    ? documentScreening.warningCodes : [];

  if (decision === "failed") {
    if (requiresManualReview || attemptCount >= maxAttempts) {
      return "Three identity verification attempts were unsuccessful. Your case requires Admin review.";
    }
    if (warningCodes.includes("school_id_not_supported")) {
      return "School and employee IDs are not accepted. Use one of the five supported government IDs.";
    }
    if (warningCodes.includes("document_front_back_swapped")) {
      return "Your ID front and back appear reversed. Retake each side in the correct slot.";
    }
    if (warningCodes.includes("document_back_looks_like_front")) {
      return "Your ID back photo may show the front. Capture the reverse side again.";
    }
    if (warningCodes.includes("low_document_back_image_quality")) {
      return "Your ID back image is too blurry. Retake a clearer reverse-side photo.";
    }
    if (warningCodes.includes("low_document_image_quality")) {
      return "Your government ID photo is too blurry. Retake a clearer image.";
    }
    if (documentScreening?.profileBirthDateCheck === "possible_conflict") {
      return "The ID birth date may differ from your profile. Retake the document or request Admin review.";
    }
    return "Identity assessment did not pass. Please retry with a clear government ID and selfie.";
  }
  // A high facial similarity is not evidence of independent liveness or a
  // government-issued authentic ID and must never trigger automatic approval.
  if (decision === "verified" || decision === "manual_review") {
    return "Your ID and selfie assessment requires independent Admin review. Liveness and ID authenticity are not verified.";
  }
  return "Your identity submission requires Admin review. No automatic identity approval was granted.";
}

module.exports = {
  PRECHECK_THROTTLE_RETENTION_MS,
  boundedVerificationId,
  identityPrecheckExpiresAt,
  safeIdentityOutcomeMessage,
};
