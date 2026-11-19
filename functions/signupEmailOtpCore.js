"use strict";
const crypto = require("node:crypto");

const CODE_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_GUESSES = 5;
const MAX_SENDS_PER_UID_DAY = 5;
const MAX_SENDS_PER_IP_DAY = 20;

class OtpError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OtpError";
    this.code = code;
  }
}

function normalizeAccount(user, requester) {
  if (!requester || typeof requester.uid !== "string" || !requester.uid) {
    throw new OtpError("unauthenticated", "Sign in with your new email and password first.");
  }
  if (!user || user.uid !== requester.uid || !user.email) {
    throw new OtpError("permission-denied", "This registration session is not valid.");
  }
  const email = user.email.toLowerCase();
  if (requester.email?.toLowerCase() !== email) {
    throw new OtpError("permission-denied", "Your email changed. Sign in again.");
  }
  if (!/^[^@\s]+@(gmail\.com|yahoo\.com)$/.test(email)) {
    throw new OtpError("permission-denied", "New registration supports Gmail and Yahoo only.");
  }
  if (user.emailVerified) {
    throw new OtpError("failed-precondition", "Your email is already verified.");
  }
  if (email.endsWith("@gmail.com") &&
      (email.split("@")[0].includes("+") ||
        (email.split("@")[0].match(/\./g) || []).length >= 4)) {
    throw new OtpError("permission-denied", "This Gmail format cannot be used for new registration.");
  }
  return email;
}

function codeDigest({pepper, uid, email, salt, code}) {
  return crypto.createHmac("sha256", pepper)
    .update([uid, email, salt, code].join(":"))
    .digest("hex");
}

function matchesDigest(expected, received) {
  const a = Buffer.from(expected || "", "hex");
  const b = Buffer.from(received || "", "hex");
  return a.length === 32 && b.length === 32 && crypto.timingSafeEqual(a, b);
}

/**
 * Firebase Admin Firestore transaction and Auth adapters are injected so that
 * no real user, Firestore document or email is touched by unit tests.
 * No caller-supplied destination email, UID, OTP secret, or verification status
 * is trusted. The caller's bearer token is checked in the onCall adapter.
 */
function createSignupEmailOtpService({
  db, adminAuth, deliverEmail, pepper, clock = Date.now,
  drawCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0"),
}) {
  if (!db || !adminAuth || typeof deliverEmail !== "function" ||
      typeof pepper !== "string" || pepper.length < 32) {
    throw new Error("Secure OTP backend is not configured.");
  }

  const currentAccount = async (requester) => {
    if (!requester || typeof requester.uid !== "string" || !requester.uid) {
      throw new OtpError("unauthenticated", "Sign in with your new email and password first.");
    }
    const user = await adminAuth.getUser(requester.uid);
    const email = normalizeAccount(user, requester);
    return {user, email};
  };

  async function send(requester, ipAddress = "") {
    const {user, email} = await currentAccount(requester);
    const nowMs = clock();
    const day = Math.floor(nowMs / 86400000);
    const ipDigest = crypto.createHmac("sha256", pepper)
      .update(String(ipAddress || "unknown").slice(0, 120)).digest("hex").slice(0, 32);
    const challengeRef = db.doc("residentEmailOtpChallenges/" + user.uid);
    const ipRef = db.doc("residentEmailOtpIpQuota/" + ipDigest + "_" + day);
    const code = drawCode();
    if (!/^\d{6}$/.test(code)) throw new Error("OTP random generator produced an invalid code");
    const salt = crypto.randomBytes(16).toString("hex");
    const digest = codeDigest({pepper, uid: user.uid, email, salt, code});

    await db.runTransaction(async (transaction) => {
      const challenge = (await transaction.get(challengeRef)).data() || {};
      const ipQuota = (await transaction.get(ipRef)).data() || {};
      if (Number(challenge.resendAfter) > nowMs) {
        throw new OtpError("resource-exhausted", "Wait 60 seconds before requesting another code.");
      }
      const sentToday = challenge.day === day ? (Number(challenge.sentToday) || 0) : 0;
      if (sentToday >= MAX_SENDS_PER_UID_DAY ||
          (Number(ipQuota.sent) || 0) >= MAX_SENDS_PER_IP_DAY) {
        throw new OtpError("resource-exhausted", "Email verification limit reached. Please try again tomorrow.");
      }
      transaction.set(challengeRef, {
        uid: user.uid, email, salt, digest, expiresAt: nowMs + CODE_LIFETIME_MS,
        resendAfter: nowMs + RESEND_COOLDOWN_MS, attempts: 0, usedAt: null,
        sentToday: sentToday + 1, day,
      });
      transaction.set(ipRef, {sent: (Number(ipQuota.sent) || 0) + 1, day});
    });

    try {
      await deliverEmail({to: email, code, lifetimeMinutes: 10});
    } catch (error) {
      // Never return or log the six-digit code. Invalidate the unsent challenge
      // but preserve rate counters to stop an attacker abusing failed delivery.
      await db.runTransaction(async (transaction) => {
        const current = (await transaction.get(challengeRef)).data() || {};
        if (current.digest === digest && current.usedAt === null) {
          transaction.update(challengeRef, {expiresAt: 0});
        }
      });
      throw new OtpError("unavailable", "Could not send the verification code. Please try again shortly.");
    }
    return {expiresInSeconds: 600, resendAfterSeconds: 60};
  }

  async function verify(requester, rawCode) {
    const {user, email} = await currentAccount(requester);
    const code = String(rawCode || "");
    if (!/^\d{6}$/.test(code)) {
      throw new OtpError("invalid-argument", "Enter the complete six-digit email code.");
    }
    const nowMs = clock();
    const challengeRef = db.doc("residentEmailOtpChallenges/" + user.uid);
    const accepted = await db.runTransaction(async (transaction) => {
      const state = (await transaction.get(challengeRef)).data();
      if (!state || state.uid !== user.uid || state.email !== email ||
          state.usedAt !== null || !Number.isFinite(state.expiresAt) ||
          nowMs >= state.expiresAt) {
        throw new OtpError("failed-precondition", "Code expired or already used. Request a new code.");
      }
      if ((Number(state.attempts) || 0) >= MAX_GUESSES) {
        throw new OtpError("resource-exhausted", "Too many incorrect codes. Request a new code.");
      }
      const received = codeDigest({pepper, uid: user.uid, email, salt: state.salt, code});
      const valid = matchesDigest(state.digest, received);
      transaction.update(challengeRef, valid
        ? {usedAt: nowMs}
        : {attempts: (Number(state.attempts) || 0) + 1});
      return valid;
    });
    if (!accepted) throw new OtpError("permission-denied", "Incorrect verification code.");
    // Re-check uid/mailbox before Admin privileges change emailVerified.
    const latest = await adminAuth.getUser(user.uid);
    normalizeAccount(latest, requester);
    await adminAuth.updateUser(user.uid, {emailVerified: true});
    return {verified: true};
  }

  return {send, verify};
}

module.exports = {
  OtpError, CODE_LIFETIME_MS, RESEND_COOLDOWN_MS,
  MAX_GUESSES, MAX_SENDS_PER_UID_DAY, MAX_SENDS_PER_IP_DAY,
  createSignupEmailOtpService,
};
