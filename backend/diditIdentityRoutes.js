"use strict";

const crypto = require("crypto");
const { createDiditSession } = require("./didit");

const DIDIT_API = "https://verification.didit.me/v3";

function diditEnabled() {
  return process.env.DIDIT_INTEGRATION_ENABLED === "true";
}

function publicError(response, error) {
  const status = Number(error?.statusCode);
  response.status(status >= 400 && status <= 599 ? status : 503).json({
    error: error?.code || "identity_provider_unavailable",
    message: status >= 400 && status < 500
      ? String(error?.message || "Verification request failed.").slice(0, 300)
      : "Identity verification is temporarily unavailable. Please retry.",
  });
}

function fail(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function validSessionId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(value);
}

async function retrieveDiditDecision(sessionId) {
  if (!validSessionId(sessionId)) {
    throw fail(400, "invalid_session", "Invalid verification session.");
  }
  const apiKey = String(process.env.DIDIT_API_KEY || "").trim();
  if (!apiKey) throw fail(503, "provider_not_configured", "Identity provider not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const result = await fetch(
      DIDIT_API + "/session/" + encodeURIComponent(sessionId) + "/decision/",
      { headers: { "x-api-key": apiKey, Accept: "application/json" }, signal: controller.signal },
    );
    if (!result.ok) throw fail(502, "provider_read_failed", "Identity provider result was unavailable.");
    return await result.json();
  } finally {
    clearTimeout(timeout);
  }
}

function evaluateDiditDecision(result) {
  const providerStatus = String(result?.status || "Not Started");
  const normalized = providerStatus.toLowerCase().replace(/[_-]/g, " ").trim();
  const hasPassed = (key) => Array.isArray(result?.[key]) &&
    result[key].length > 0 &&
    result[key].every((item) => String(item?.status || "").toLowerCase() === "approved");
  const requiredChecksPassed =
    hasPassed("id_verifications") &&
    hasPassed("liveness_checks") &&
    hasPassed("face_matches");
  // This must also be restricted to approved, supported ID types in the Didit workflow.
  if (normalized === "approved" && requiredChecksPassed) {
    return { providerStatus, decision: "approved", review: false };
  }
  if (normalized === "approved" || normalized === "in review" || normalized === "declined") {
    return { providerStatus, decision: "review", review: true };
  }
  if (normalized === "expired" || normalized === "cancelled") {
    return { providerStatus, decision: "failed", review: false };
  }
  return { providerStatus, decision: "processing", review: false };
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    const object = {};
    for (const key of Object.keys(value).sort()) object[key] = canonicalizeJson(value[key]);
    return object;
  }
  return value;
}

function validWebhookSignature(request) {
  const secret = String(process.env.DIDIT_WEBHOOK_SECRET || "").trim();
  const timestamp = Number(request.headers["x-timestamp"]);
  const signature = String(request.headers["x-signature-v2"] || "");
  if (!secret || !Number.isSafeInteger(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > 300 ||
      !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const canonical = JSON.stringify(canonicalizeJson(request.body));
  const expected = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

function registerDiditIdentityRoutes(app, { db, FieldValue, requireFirebaseUser }) {
  const user = (uid) => db.collection("users").doc(uid);
  const verification = (uid) => db.collection("identityVerifications").doc(uid);

  async function syncUser(uid, sessionId) {
    const [userSnap, verificationSnap] = await Promise.all([
      user(uid).get(), verification(uid).get(),
    ]);
    const current = verificationSnap.data() || {};
    if (!userSnap.exists || current.provider !== "didit" ||
        current.sessionId !== sessionId) {
      throw fail(404, "session_not_found", "No active identity verification session found.");
    }
    const remote = await retrieveDiditDecision(sessionId);
    if (String(remote?.session_id || "") !== sessionId ||
        String(remote?.vendor_data || "") !== uid ||
        String(remote?.workflow_id || "") !== String(current.workflowId) ||
        String(remote?.session_kind || "") !== "user") {
      throw fail(409, "session_mismatch", "Verification result did not match the resident.");
    }

    const decision = evaluateDiditDecision(remote);
    const liveAllowed = process.env.DIDIT_ENVIRONMENT === "live" &&
      process.env.DIDIT_AUTO_VERIFY_ENABLED === "true";
    const isLiveResponse = String(remote?.environment || "live").toLowerCase() === "live";
    const isApproved = decision.decision === "approved" && liveAllowed && isLiveResponse;
    const requiresReview = decision.review || (decision.decision === "approved" && !isApproved);
    const identityStatus = isApproved ? "verified" :
      decision.decision === "failed" ? "failed" : "pending";

    return db.runTransaction(async (transaction) => {
      const [freshUser, freshVerification] = await Promise.all([
        transaction.get(user(uid)), transaction.get(verification(uid)),
      ]);
      if (!freshUser.exists || freshVerification.data()?.provider !== "didit" ||
          freshVerification.data()?.sessionId !== sessionId) {
        throw fail(409, "session_changed", "Verification session changed; refresh your account.");
      }
      const profile = freshUser.data() || {};
      const entry = freshVerification.data() || {};
      if (profile.identityVerified === true || profile.identityStatus === "verified") {
        return { ok: true, identityStatus: "verified", providerStatus: decision.providerStatus };
      }
      // Keep a pending Admin review safe from later in-progress session updates.
      if (entry.requiresManualReview === true && decision.decision === "processing") {
        return { ok: true, identityStatus: "pending", providerStatus: decision.providerStatus,
          requiresManualReview: true };
      }
      transaction.set(verification(uid), {
        provider: "didit",
        verificationMethod: "didit",
        verificationId: sessionId,
        providerStatus: decision.providerStatus,
        status: identityStatus,
        aiDecision: isApproved ? "verified" : requiresReview ? "manual_review" : decision.decision,
        requiresManualReview: requiresReview,
        message: isApproved ? "Identity verification completed successfully." :
          requiresReview ? "Verification requires Admin review." :
          identityStatus === "failed" ? "Verification expired. Please start again." :
          "Verification is still in progress.",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(user(uid), {
        identityStatus,
        identityVerified: isApproved,
        identityVerificationProvider: "didit",
        identityVerificationSessionId: sessionId,
        identityVerificationMethod: "didit",
        ...(isApproved ? {
          identityVerifiedAt: FieldValue.serverTimestamp(),
          identityVerifiedBy: "didit",
          identityFailureReason: FieldValue.delete(),
        } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { ok: true, identityStatus, providerStatus: decision.providerStatus,
        requiresManualReview: requiresReview, sandbox: !liveAllowed };
    });
  }

  app.post("/api/identity/didit/start", requireFirebaseUser, async (request, response) => {
    try {
      if (!diditEnabled()) throw fail(503, "integration_disabled", "Identity verification setup is not enabled yet.");
      const uid = request.firebaseUser.uid;
      const profileSnap = await user(uid).get();
      if (!profileSnap.exists) throw fail(404, "profile_not_found", "Resident account was not found.");
      const profile = profileSnap.data() || {};
      if (profile.status && String(profile.status).toLowerCase() !== "approved") {
        throw fail(403, "account_not_active", "Account is not active.");
      }
      if (profile.identityVerified === true || profile.identityStatus === "verified") {
        throw fail(409, "already_verified", "Resident is already verified.");
      }
      const previous = (await verification(uid).get()).data() || {};
      if (previous.requiresManualReview === true && previous.status === "pending") {
        throw fail(409, "manual_review_pending", "Your verification is waiting for Admin review.");
      }
      const session = await createDiditSession({
        uid, email: String(request.firebaseUser.email || ""),
      });
      if (!validSessionId(session.sessionId)) {
        throw fail(502, "invalid_provider_session", "Identity provider returned an invalid session.");
      }
      await db.runTransaction(async (transaction) => {
        const [u, v] = await Promise.all([
          transaction.get(user(uid)), transaction.get(verification(uid)),
        ]);
        if (!u.exists || u.data()?.identityVerified === true ||
            v.data()?.requiresManualReview === true && v.data()?.status === "pending") {
          throw fail(409, "account_changed", "Resident verification state has changed.");
        }
        transaction.set(verification(uid), {
          uid, provider: "didit", sessionId: session.sessionId,
          workflowId: session.workflowId, providerStatus: session.providerStatus,
          verificationId: session.sessionId, verificationMethod: "didit",
          status: "pending", requiresManualReview: false,
          aiDecision: FieldValue.delete(), message: "Verification is waiting for completion.",
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: v.data()?.createdAt || FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(user(uid), {
          identityStatus: "pending", identityVerified: false,
          identityVerificationProvider: "didit",
          identityVerificationSessionId: session.sessionId,
          identityVerificationMethod: "didit",
          identityVerificationStartedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      response.status(201).json({
        ok: true, url: session.url, sessionId: session.sessionId, identityStatus: "pending",
      });
    } catch (error) {
      publicError(response, error);
    }
  });

  app.get("/api/identity/didit/sync", requireFirebaseUser, async (request, response) => {
    try {
      if (!diditEnabled()) throw fail(503, "integration_disabled", "Identity verification setup is not enabled yet.");
      const uid = request.firebaseUser.uid;
      const state = (await verification(uid).get()).data() || {};
      if (state.provider !== "didit" || !validSessionId(state.sessionId)) {
        throw fail(404, "session_not_found", "Start verification first.");
      }
      response.set("Cache-Control", "no-store");
      response.json(await syncUser(uid, state.sessionId));
    } catch (error) {
      publicError(response, error);
    }
  });

  app.post("/api/identity/didit/webhook", async (request, response) => {
    if (!diditEnabled()) return response.status(503).json({ ok: false });
    if (!validWebhookSignature(request)) return response.status(401).json({ error: "invalid_signature" });
    if (String(request.headers["x-didit-test-webhook"] || "") === "true") {
      return response.json({ ok: true, test: true });
    }
    const payload = request.body || {};
    if (payload.webhook_type !== "status.updated") return response.json({ ok: true });
    const sessionId = String(payload.session_id || "");
    const uid = String(payload.vendor_data || "");
    if (!validSessionId(sessionId) || !uid || uid.length > 200) {
      return response.status(400).json({ error: "invalid_event" });
    }
    try {
      // Ignore the webhook verdict itself; re-fetch the decision with our private API key.
      await syncUser(uid, sessionId);
      return response.json({ ok: true });
    } catch (error) {
      if (error.code === "session_not_found" || error.code === "session_mismatch") {
        return response.status(409).json({ error: "unrecognized_session" });
      }
      return response.status(503).json({ error: "sync_unavailable" });
    }
  });
}

module.exports = {
  registerDiditIdentityRoutes,
  evaluateDiditDecision,
  canonicalizeJson,
  validWebhookSignature,
};