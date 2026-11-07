"use strict";
const {createHmac} = require("node:crypto");

// ONLY used inside an opted-in Identity Platform beforeUserCreated trigger.
// Firebase already has provider-level throttling; this adds a configurable,
// shared, per-IP transaction counter for new account creations, not logins.
// Shared networks (schools/LGUs) may share one IP. Stage at a forgiving limit.
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 30;
const SAFE_MAX_ATTEMPTS = 60;

class RegistrationRateLimitError extends Error {
  constructor() {
    super("Too many signups from this network. Please try again later.");
    this.name = "RegistrationRateLimitError";
  }
}
function hashedKey(secret, value) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("Registration IP limiter requires a 32+ character Secret Manager key.");
  }
  return createHmac("sha256", secret).update(String(value)).digest("hex");
}
function rateLimitWindow(ipAddress, secret, nowMs, windowMs = DEFAULT_WINDOW_MS) {
  if (!Number.isFinite(nowMs) || nowMs < 0 || !Number.isFinite(windowMs) || windowMs < 60000) {
    throw new Error("Invalid signup rate-limit window.");
  }
  const ip = String(ipAddress || "").trim();
  if (!ip || ip.length > 90 || !/^[a-fA-F0-9:.]+$/.test(ip)) {
    // Identity Platform supplies the IP address; missing/invalid metadata
    // must not block all users behind an auth provider outage. reCAPTCHA and
    // Firebase built-in auth quotas remain the fallback.
    return null;
  }
  const bucket = Math.floor(nowMs / windowMs);
  return {
    id: hashedKey(secret, `signup:create:${bucket}:${ip}`),
    bucket,
    expiresAt: new Date((bucket + 3) * windowMs),
  };
}
/**
 * Transaction makes the counter shared across Function instances, unlike a
 * local memory Map. Does not store raw IP, user email, or identifiable names.
 * Enable Firestore TTL for authSignupRateLimits.expiresAt before deployment.
 */
async function enforceSignupIpRateLimit({
  db, ipAddress, eventId, secret, nowMs = Date.now(),
  windowMs = DEFAULT_WINDOW_MS, maxAttempts = DEFAULT_MAX_ATTEMPTS,
}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > SAFE_MAX_ATTEMPTS) {
    throw new Error("Invalid signup limit (1–60 attempts per window).");
  }
  const window = rateLimitWindow(ipAddress, secret, nowMs, windowMs);
  if (!window) return {limited: false, enforced: false, reason: "missing_provider_ip"};
  const id = String(eventId || "");
  if (id.length > 200) throw new Error("Invalid authentication event id.");
  const fingerprint = id ? hashedKey(secret, `signup:event:${id}`) : "";
  const ref = db.collection("authSignupRateLimits").doc(window.id);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const count = Number.isInteger(data.count) && data.count >= 0 ? data.count : 0;
    const fingerprints = Array.isArray(data.eventFingerprints) ? data.eventFingerprints : [];
    if (fingerprint && fingerprints.includes(fingerprint)) {
      return {limited: false, enforced: true, duplicate: true};
    }
    if (count >= maxAttempts) throw new RegistrationRateLimitError();
    const next = fingerprint
      ? [...fingerprints, fingerprint].slice(-SAFE_MAX_ATTEMPTS)
      : fingerprints;
    tx.set(ref, {
      count: count + 1,
      eventFingerprints: next,
      expiresAt: window.expiresAt,
    });
    return {limited: false, enforced: true, remaining: maxAttempts - count - 1};
  });
}
module.exports = {
  DEFAULT_WINDOW_MS, DEFAULT_MAX_ATTEMPTS,
  RegistrationRateLimitError, rateLimitWindow, enforceSignupIpRateLimit,
};
