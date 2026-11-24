"use strict";

const crypto = require("crypto");
const { createDiditSession } = require("./didit");

const DIDIT_API = "https://verification.didit.me/v3";

const SANDBOX_WORKFLOW = "9fd6c419-790b-45bf-be09-4892216eb155";

function liveWorkflow() { return String(process.env.DIDIT_WORKFLOW_ID || "").trim(); }
function diditEnabled(env = process.env) {
  return env.DIDIT_LIVE_ENABLED === "true" &&
    env.DIDIT_INTEGRATION_ENABLED === "true" &&
    env.DIDIT_ENVIRONMENT === "live" &&
    /^[A-Za-z0-9_-]{8,128}$/.test(String(env.DIDIT_WORKFLOW_ID || "")) &&
    env.DIDIT_WORKFLOW_ID !== SANDBOX_WORKFLOW &&
    Boolean(String(env.DIDIT_API_KEY || "").trim()) &&
    Boolean(String(env.DIDIT_WEBHOOK_SECRET || "").trim());
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

function nameTokens(value) {
  return String(value || "").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}
function idMatchesResident(document, profile) {
  const first = nameTokens(profile?.firstName);
  const last = nameTokens(profile?.lastName);
  const full = new Set(nameTokens(document?.full_name));
  const expectedDob = String(profile?.dateOfBirth || "").slice(0, 10);
  const idDob = String(document?.date_of_birth || "").slice(0, 10);
  // Exact name tokens: "Ann" must never be considered equal to "Joanne".
  // Missing DOB and any ambiguity always require human review.
  return first.length > 0 && last.length > 0 &&
    [...first, ...last].every(token => token.length >= 2 && full.has(token)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(expectedDob) && expectedDob === idDob;
}
function classifyLiveDocument(doc) {
  const normalize = value => String(value || "").toLowerCase().replace(/[_-]/g, " ").trim();
  const type = normalize(doc?.document_type);
  const subtype = normalize(doc?.document_subtype);
  if (!doc || doc.issuing_state !== "PHL" || !type) return "review";
  if (/student|school|university|college|campus|employee|staff/i.test(type+" "+subtype)) return "reject";
  const passport = type === "passport" && (!subtype || /^(passport|epassport|e passport)$/.test(subtype));
  const driver = /^(driver license|driving license|driver's license|drivers license)$/.test(type) &&
    (!subtype || /^(driver license|driving license|driver's license|drivers license)$/.test(subtype));
  const national = /^(id card|identity card)$/.test(type) &&
    /^(philippine national id|national id|philippine identification card|philid|philsys id|philsys national id|umid card|umid|prc id|professional regulation commission id)$/.test(subtype);
  return passport || driver || national ? "allowed" : "review";
}
function evaluateDiditDecision(result, profile = {}) {
  const status = String(result?.status || "Not Started");
  const normalized = status.toLowerCase().replace(/[_-]/g, " ").trim();
  const groups = ["id_verifications", "liveness_checks", "face_matches"];
  const documents = Array.isArray(result?.id_verifications) ? result.id_verifications : [];
  const classes = documents.map(classifyLiveDocument);
  if (classes.includes("reject")) return { providerStatus: status, decision: "declined", review: false };
  const declined = groups.some(key => Array.isArray(result?.[key]) &&
    result[key].some(entry => String(entry?.status || "").toLowerCase() === "declined"));
  if (declined || normalized === "declined") return { providerStatus: status, decision: "declined", review: false };
  const allApproved = groups.every(key => Array.isArray(result?.[key]) &&
    result[key].length > 0 &&
    result[key].every(entry => String(entry?.status || "").toLowerCase() === "approved"));
  const noWarnings = documents.every(doc => !Array.isArray(doc.warnings) || doc.warnings.length === 0);
  const namesMatch = documents.length > 0 && documents.every(doc => idMatchesResident(doc, profile));
  if (normalized === "approved" && allApproved && classes.every(c => c === "allowed") &&
      namesMatch && noWarnings) return { providerStatus: status, decision: "approved", review: false };
  if (["approved", "in review", "needs review", "inconclusive"].includes(normalized)) {
    return { providerStatus: status, decision: "review", review: true };
  }
  if (["expired", "kyc expired", "abandoned", "canceled", "cancelled"].includes(normalized)) {
    return { providerStatus: status, decision: "failed", review: false };
  }
  return { providerStatus: status, decision: "processing", review: false };
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    const object = Object.create(null);
    for (const key of Object.keys(value).sort()) object[key] = canonicalizeJson(value[key]);
    return object;
  }
  return value;
}

function validWebhookSignature(request) {
  const secret = String(process.env.DIDIT_WEBHOOK_SECRET || "").trim();
  const timestamp = Number(request.headers["x-timestamp"]);
  const signature = String(request.headers["x-signature-v2"] || "");
  if (!secret || !Number.isSafeInteger(timestamp) || Number(request.body?.timestamp) !== timestamp ||
      Math.abs(Date.now() / 1000 - timestamp) > 300 ||
      !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const canonical = JSON.stringify(canonicalizeJson(request.body));
  const expected = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

// Hard fail closed unless using the REAL live VolunServe Firebase service.
// A Sandbox API key or QA Render instance must never alter real Resident accounts.
function liveProjectAllowed(project, env = process.env) {
  if (project !== "volunserve-3aa5b" ||
      env.DIDIT_ENVIRONMENT !== "live" ||
      env.VOLUNSERVE_DIDIT_QA_ISOLATED === "true" ||
      (env.RENDER && env.RENDER_SERVICE_NAME !== "VolunServe")) return false;
  try {
    const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || "null");
    return account?.type === "service_account" && account?.project_id === project;
  } catch { return false; }
}

function registerDiditIdentityRoutes(app, { db, FieldValue, requireFirebaseUser }) {
  const user = (uid) => db.collection("users").doc(uid);
  const verification = (uid) => db.collection("identityVerifications").doc(uid);

  // Check actual Firestore target after the first read, before provider calls or writes.
  function requireLiveResident(uid) {
    if (!liveProjectAllowed(db.projectId) ||
        typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
      throw fail(403, "live_identity_disabled", "Live identity verification is not enabled on this service.");
    }
  }

  async function syncUser(uid, sessionId) {
    const [userSnap, verificationSnap] = await Promise.all([
      user(uid).get(), verification(uid).get(),
    ]);
    requireLiveResident(uid);
    const current = verificationSnap.data() || {};
    if (!userSnap.exists || current.provider !== "didit_live" ||
        current.sessionId !== sessionId) {
      throw fail(404, "session_not_found", "No active identity verification session found.");
    }
    const remote = await retrieveDiditDecision(sessionId);
    if (String(remote?.session_id || "") !== sessionId ||
        String(remote?.vendor_data || "") !== uid ||
        String(remote?.workflow_id || "") !== String(current.workflowId) ||
        current.workflowId !== liveWorkflow() || remote?.environment !== "live" ||
        String(remote?.session_kind || "") !== "user") {
      throw fail(409, "session_mismatch", "Verification result did not match the resident.");
    }

    const decision = evaluateDiditDecision(remote, userSnap.data() || {});
    const isApproved = decision.decision === "approved" && process.env.DIDIT_AUTO_APPROVAL_ENABLED === "true";
    return db.runTransaction(async (transaction) => {
      const [freshUser, freshVerification] = await Promise.all([
        transaction.get(user(uid)), transaction.get(verification(uid)),
      ]);
      if (!freshUser.exists || freshVerification.data()?.provider !== "didit_live" ||
          freshVerification.data()?.sessionId !== sessionId) {
        throw fail(409, "session_changed", "Verification session changed; refresh your account.");
      }
      const profile = freshUser.data() || {};
      if (profile.role !== "resident" || profile.status !== "approved") throw fail(403, "inactive_resident", "An active Resident account is required.");
      const entry = freshVerification.data() || {};
      if (!verificationSnap.updateTime.isEqual(freshVerification.updateTime) || !userSnap.updateTime.isEqual(freshUser.updateTime)) {
        // A concurrent sync or Admin decision won while the provider request was in flight.
        // Webhooks retry and the resident screen polls the authoritative decision again.
        throw fail(409, "sync_conflict", "Verification changed. Refresh to retry.");
      }
      const priorFailures = Math.min(3, Math.max(0, Number(entry.diditFailedAttempts) || 0));
      const newlyDeclined = decision.decision === "declined" &&
        entry.lastCountedDiditSessionId !== sessionId;
      const failedAttempts = newlyDeclined ? Math.min(3, priorFailures + 1) : priorFailures;
      const requiresReview = decision.review || (decision.decision === "approved" && !isApproved) || (decision.decision === "declined" && failedAttempts >= 3);
      const identityStatus = isApproved ? "verified" : requiresReview ? "pending" :
        ["declined", "failed"].includes(decision.decision) ? "failed" : "pending";
      const reviewedAt = entry.reviewedAt?.toMillis?.() || 0;
      const startedAt = entry.sessionRequestedAt?.toMillis?.() || 0;
      if (reviewedAt && startedAt && reviewedAt > startedAt) {
        return { ok: true, identityStatus: profile.identityStatus || "pending",
          providerStatus: decision.providerStatus, requiresManualReview: false };
      }
      if ((profile.identityVerified === true || profile.identityStatus === "verified") && profile.identityVerifiedBy !== "didit_live") {
        return { ok: true, sandbox: false, identityStatus: "verified", providerStatus: decision.providerStatus };
      }
      // Keep a pending Admin review safe from later in-progress session updates.
      if (entry.requiresManualReview === true && decision.decision === "processing") {
        return { ok: true, identityStatus: "pending", providerStatus: decision.providerStatus,
          requiresManualReview: true };
      }
      if (entry.status === "verified" && decision.decision === "processing") {
        return { ok: true, identityStatus: "verified", sandbox: false, providerStatus: entry.providerStatus };
      }
      const outcome = { ok: true, identityStatus, providerStatus: decision.providerStatus,
        requiresManualReview: requiresReview, failedAttempts, sandbox: false };
      if (entry.providerStatus === decision.providerStatus && entry.status === identityStatus &&
          entry.aiDecision === (isApproved ? "verified" : requiresReview ? "manual_review" : decision.decision)) return outcome;
      if (decision.decision === "processing" && entry.status === "failed") {
        return { ...outcome, identityStatus: "failed", providerStatus: entry.providerStatus };
      }
      transaction.set(verification(uid), {
        provider: "didit_live",
        verificationMethod: "didit_live",
        verificationId: sessionId,
        providerStatus: decision.providerStatus,
        diditSummary: ["Live provider verification", ...[["ID", "id_verifications"], ["Liveness", "liveness_checks"], ["Face match", "face_matches"]]
          .map(([label, key]) => label + ": " + (Array.isArray(remote[key]) && remote[key].length ?
            remote[key].map(item => String(item.status || "Unknown").slice(0, 30)).join(", ") : "Unavailable"))].join(" · "),
        status: identityStatus,
        aiDecision: isApproved ? "verified" : requiresReview ? "manual_review" : decision.decision,
        diditFailedAttempts: failedAttempts,
        aiAttemptCount: failedAttempts,
        ...(newlyDeclined ? { lastCountedDiditSessionId: sessionId } : {}),
        requiresManualReview: requiresReview,
        message: isApproved ? "Identity verification completed successfully." :
          requiresReview ? "Verification requires Admin review." :
          identityStatus === "failed" ? "Verification was declined or expired. You may retry up to three times." :
          "Verification is still in progress.",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(user(uid), {
        identityStatus,
        identityVerified: isApproved,
        identityVerificationProvider: "didit_live",
        identityVerificationSessionId: sessionId,
        identityVerificationMethod: "didit_live",
        ...(isApproved ? {
          identityVerifiedAt: FieldValue.serverTimestamp(),
          identityVerifiedBy: "didit_live",
          identityFailureReason: FieldValue.delete(),
        } : profile.identityVerifiedBy === "didit_live" ? {
          identityVerifiedBy: FieldValue.delete(), identityVerifiedAt: FieldValue.delete(),
        } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { ok: true, identityStatus, providerStatus: decision.providerStatus,
        requiresManualReview: requiresReview, failedAttempts,
        attemptsRemaining: Math.max(0, 3 - failedAttempts), sandbox: false };
    });
  }

  app.post("/api/identity/didit/start", requireFirebaseUser, async (request, response) => {
    try {
      if (!diditEnabled()) throw fail(503, "integration_disabled", "Identity verification setup is not enabled yet.");
      const uid = request.firebaseUser.uid;
      const profileSnap = await user(uid).get();
      requireLiveResident(uid);
      if (!profileSnap.exists) throw fail(404, "profile_not_found", "Resident account was not found.");
      const profile = profileSnap.data() || {};
      if (profile.role !== "resident" || profile.status !== "approved") {
        throw fail(403, "account_not_active", "Account is not active.");
      }
      if (profile.identityVerified === true || profile.identityStatus === "verified") {
        throw fail(409, "already_verified", "Resident is already verified.");
      }
      const previous = (await verification(uid).get()).data() || {};
      if (Object.keys(previous).length && previous.provider !== "didit_live") {
        throw fail(409, "existing_verification", "An existing verification case requires Admin review before starting another provider.");
      }
      if (previous.requiresManualReview === true && previous.status === "pending") {
        throw fail(409, "manual_review_pending", "Your verification is waiting for Admin review.");
      }
      if (previous.provider === "didit_live" && previous.status === "pending" && previous.sessionId &&
          previous.manualReviewDecision !== "retry_required") {
        const remote = await retrieveDiditDecision(previous.sessionId);
        if (remote.environment !== "live" || remote.vendor_data !== uid || remote.workflow_id !== liveWorkflow() ||
            remote.session_id !== previous.sessionId) throw fail(409, "session_mismatch", "Verification session mismatch.");
        if (evaluateDiditDecision(remote, profile).decision === "processing" && remote.session_url) {
          return response.json({ ok: true, sessionId: previous.sessionId, url: remote.session_url });
        }
        await syncUser(uid, previous.sessionId);
        throw fail(409, "refresh_status", "Your verification has updated. Refresh the status before retrying.");
      }
      const session = await createDiditSession({
        uid, email: String(request.firebaseUser.email || ""),
      });
      if (!validSessionId(session.sessionId) || session.workflowId !== liveWorkflow() || session.vendorData !== uid) {
        throw fail(502, "invalid_provider_session", "Identity provider returned an invalid session.");
      }
      await db.runTransaction(async (transaction) => {
        const [u, v] = await Promise.all([
          transaction.get(user(uid)), transaction.get(verification(uid)),
        ]);
        if ((v.exists && v.data()?.provider !== "didit_live") || v.data()?.sessionId !== previous.sessionId || u.data()?.role !== "resident" ||
            u.data()?.status !== "approved" || !u.exists || u.data()?.identityVerified === true ||
            v.data()?.requiresManualReview === true && v.data()?.status === "pending") {
          throw fail(409, "account_changed", "Resident verification state has changed.");
        }
        transaction.set(verification(uid), {
          uid, environment: "live", lastSubmissionAt: FieldValue.serverTimestamp(),
          manualReviewDecision: FieldValue.delete(), diditSummary: FieldValue.delete(), provider: "didit_live", sessionId: session.sessionId,
          workflowId: session.workflowId, providerStatus: session.providerStatus,
          sessionRequestedAt: FieldValue.serverTimestamp(),
          verificationId: session.sessionId, verificationMethod: "didit_live",
          status: "pending", requiresManualReview: false,
          aiDecision: FieldValue.delete(), message: "Verification is waiting for completion.",
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: v.data()?.createdAt || FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(user(uid), {
          identityStatus: "pending", identityVerified: false,
          identityVerificationProvider: "didit_live",
          identityVerificationSessionId: session.sessionId,
          identityVerificationMethod: "didit_live",
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
      if (state.provider !== "didit_live" || !validSessionId(state.sessionId)) {
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
    if (!validSessionId(sessionId) || !uid || uid.includes("/") || uid.length > 128) {
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
  liveProjectAllowed,
  diditEnabled,
  classifyLiveDocument,
};