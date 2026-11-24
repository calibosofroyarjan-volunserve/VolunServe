"use strict";

/**
 * Dedicated Didit Sandbox gateway for the disposable volunserve-didit-qa
 * Firebase project. NEVER mount the entire VolunServe production server here.
 *
 * Starts safely even before QA credentials are provisioned. Until then all
 * verification endpoints fail closed with HTTP 503 (not a fake successful QA).
 */
const express = require("express");

const PROJECT = "volunserve-didit-qa";
const WORKFLOW = "9fd6c419-790b-45bf-be09-4892216eb155";
const ALLOWED_SERVICE = /^volunserve(?:-[a-z0-9]+)*-qa(?:-[a-z0-9]+)*$/;

function qaConfiguration(env = process.env) {
  const required = {
    VOLUNSERVE_DIDIT_QA_ISOLATED: "true",
    VOLUNSERVE_DEPLOYMENT_ENV: "staging",
    VOLUNSERVE_STAGING_STRICT: "true",
    VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID: PROJECT,
    DIDIT_ENVIRONMENT: "sandbox",
    DIDIT_WORKFLOW_ID: WORKFLOW,
  };
  const missing = Object.entries(required)
    .filter(([name, expected]) => env[name] !== expected)
    .map(([name]) => name);
  if (!ALLOWED_SERVICE.test(String(env.RENDER_SERVICE_NAME || ""))) {
    missing.push("RENDER_SERVICE_NAME");
  }
  let credentialsValid = false;
  try {
    const obj = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || "null");
    credentialsValid = obj?.project_id === PROJECT && obj?.type === "service_account" &&
      typeof obj.private_key === "string" && obj.private_key.length > 100;
  } catch {
    // Do not output or parse-error-log any secret material.
  }
  if (!credentialsValid) missing.push("FIREBASE_SERVICE_ACCOUNT_JSON");
  for (const key of ["DIDIT_API_KEY", "DIDIT_WEBHOOK_SECRET", "DIDIT_TEST_UIDS"]) {
    if (!String(env[key] || "").trim()) missing.push(key);
  }
  if (env.DIDIT_INTEGRATION_ENABLED !== "true") missing.push("DIDIT_INTEGRATION_ENABLED");
  if (String(env.IDENTITY_AI_SERVICE_URL || "").trim()) missing.push("IDENTITY_AI_SERVICE_URL must be unset");
  return { ready: missing.length === 0, missing };
}

function createQaApp(env = process.env, dependencies = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  const check = qaConfiguration(env);
  app.get("/health", (_req, res) => res.json({
    ok: true,
    service: "volunserve-didit-isolated-qa",
    ready: check.ready,
  }));
  // A separate presentation-only Sandbox API may run with production-auth
  // signature verification, but never reads/writes production Firebase data.
  // It has an independent opt-in flag and an explicit test UID allowlist.
  require("./diditPresentationRoutes.cjs").registerPresentationRoutes(
    app, env, dependencies.presentation || {});
  if (!check.ready) {
    // Do not disclose which particular secret is missing to unauthenticated clients.
    app.use("/api/identity/didit", (_req, res) =>
      res.status(503).json({ error: "didit_qa_not_configured" }));
    return app;
  }

  // Delayed initialization avoids loading any real Firebase Admin credentials
  // until the target project's isolation and Sandbox configuration pass.
  const { auth, db, FieldValue } = dependencies.firebase || require("./firebaseAdmin");
  const { registerDiditIdentityRoutes } = require("./diditIdentityRoutes");

  const validUid = uid => typeof uid === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(uid);
  const allowedUids = new Set(String(env.DIDIT_TEST_UIDS).split(",").map(x => x.trim()).filter(validUid));
  async function requireQaResident(request, response, next) {
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(String(request.headers.authorization || ""));
    if (!match) return response.status(401).json({ error: "unauthenticated" });
    try {
      const decoded = await auth.verifyIdToken(match[1], true);
      if (!decoded.email_verified || !decoded.email || !validUid(decoded.uid) ||
          !allowedUids.has(decoded.uid)) {
        return response.status(403).json({ error: "qa_resident_required" });
      }
      const snap = await db.collection("users").doc(decoded.uid).get();
      const p = snap.data();
      if (!snap.exists || p?.email !== decoded.email || p?.role !== "resident" ||
          p?.status !== "approved" || p?.residentAccess !== true ||
          p?.activeMode !== "resident" || p?.adminStatus === "suspended") {
        return response.status(403).json({ error: "qa_profile_required" });
      }
      request.firebaseUser = decoded;
      return next();
    } catch {
      return response.status(401).json({ error: "invalid_token" });
    }
  }

  // Only a separately hosted QA web page may send cross-origin browser calls.
  // Never authorize the live volunserve.com origin here.
  const allowedOrigin = String(env.DIDIT_QA_FRONTEND_ORIGIN || "");
  const validOrigin = /^https:\/\/volunserve(?:-[a-z0-9]+)*-qa(?:-[a-z0-9]+)*[.]onrender[.]com$/.test(allowedOrigin)
    ? allowedOrigin : "";
  app.use("/api/identity/didit", (req, res, next) => {
    if (validOrigin && req.headers.origin === validOrigin) {
      res.set("Access-Control-Allow-Origin", validOrigin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  });

  registerDiditIdentityRoutes(app, { db, FieldValue, requireFirebaseUser: requireQaResident });
  return app;
}

if (require.main === module) {
  const app = createQaApp();
  app.listen(Number(process.env.PORT || 10000), "0.0.0.0", () => {
    // Do not print provider credentials, Firebase tokens or resident identifiers.
    console.log("VolunServe Didit isolated QA gateway listening");
  });
}

module.exports = { createQaApp, qaConfiguration };
