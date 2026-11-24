"use strict";
// Presentation-only Didit Sandbox gateway.
// Accepts authenticated, explicitly allowlisted production test accounts but
// NEVER connects to or modifies production Firestore, user records, or roles.
const crypto = require("node:crypto");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const SANDBOX_WORKFLOW = "9fd6c419-790b-45bf-be09-4892216eb155";
const PROD_AUTH_PROJECT = "volunserve-3aa5b";
const ORIGINS = new Set(["https://volunserve.com", "https://www.volunserve.com"]);
const DEMO_PATH = "/api/demo/didit";
const MAX_DEMOS_PER_UID = 3;
const SESSION_LIFETIME_MS = 60 * 60 * 1000;

function presentationReady(env = process.env) {
  const allow = String(env.DIDIT_PRESENTATION_ALLOWED_UIDS || "")
    .split(",").map(x => x.trim()).filter(x => /^[A-Za-z0-9_-]{12,128}$/.test(x));
  return env.DIDIT_PRESENTATION_ENABLED === "true" &&
    env.VOLUNSERVE_DIDIT_QA_ISOLATED === "true" &&
    env.VOLUNSERVE_DEPLOYMENT_ENV === "staging" &&
    env.VOLUNSERVE_STAGING_STRICT === "true" &&
    env.VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID === "volunserve-didit-qa" &&
    env.RENDER_SERVICE_NAME === "volunserve-didit-qa-backend" &&
    env.DIDIT_ENVIRONMENT === "sandbox" &&
    env.DIDIT_WORKFLOW_ID === SANDBOX_WORKFLOW &&
    String(env.DIDIT_API_KEY || "").length > 12 &&
    String(env.DIDIT_WEBHOOK_SECRET || "").length > 12 &&
    !String(env.IDENTITY_AI_SERVICE_URL || "").trim() &&
    allow.length > 0;
}
function makeToken(secret, claim) {
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret)
    .update("volunserve-didit-presentation-v1:" + payload)
    .digest("base64url");
  return payload + "." + sig;
}
function decodeToken(secret, token, uid, now = Date.now()) {
  if (typeof token !== "string" || token.length > 800 || token.length < 20) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
      !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  // Recompute signature directly to avoid normalizing untrusted token JSON.
  const signature = crypto.createHmac("sha256", secret)
    .update("volunserve-didit-presentation-v1:" + parts[0])
    .digest("base64url");
  if (signature.length !== parts[1].length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(parts[1]))) return null;
  try {
    const obj = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (obj.v !== 1 || obj.uid !== uid ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(String(obj.sessionId)) ||
        !/^demo_[a-f0-9]{24}$/.test(String(obj.vendor)) ||
        !Number.isSafeInteger(obj.issued) || !Number.isSafeInteger(obj.expiry) ||
        obj.issued > now + 1000 || obj.expiry < now || obj.expiry > obj.issued + SESSION_LIFETIME_MS) return null;
    return obj;
  } catch { return null; }
}
function evaluatePresentationResult(remote) {
  const checks = ["id_verifications", "liveness_checks", "face_matches"];
  const documents = Array.isArray(remote.id_verifications) ? remote.id_verifications : [];
  const label = d => [d?.document_type,d?.document_subtype].map(v=>String(v||"")).join(" ").toLowerCase();
  const schoolFlag = documents.some(d => /\b(school|student|university|college|campus)\b/.test(label(d)));
  const declined = checks.some(key => Array.isArray(remote[key]) &&
    remote[key].some(x => String(x?.status||"").toLowerCase() === "declined"));
  const approved = String(remote.status || "").toLowerCase() === "approved" &&
    checks.every(key => Array.isArray(remote[key]) && remote[key].length > 0 &&
      remote[key].every(x => String(x?.status||"").toLowerCase() === "approved"));
  if (schoolFlag) return "demo_school_id_flagged";
  if (declined || String(remote.status||"").toLowerCase() === "declined") return "demo_declined";
  return approved ? "demo_approved_simulated" : "demo_review_or_processing";
}
function defaultVerifyIdToken(token) {
  const name = "volunserve-sandbox-demo-auth-readonly";
  const app = getApps().find(x => x.name === name) ||
    initializeApp({projectId: PROD_AUTH_PROJECT}, name);
  // Signature/expiry/project verification only; NO production data read.
  return getAuth(app).verifyIdToken(token, false);
}
function registerPresentationRoutes(app, env = process.env, deps = {}) {
  const counts = new Map();
  const ready = presentationReady(env);
  const allow = new Set(String(env.DIDIT_PRESENTATION_ALLOWED_UIDS||"").split(",").map(x=>x.trim()));
  const verify = deps.verifyIdToken || defaultVerifyIdToken;
  const startSession = deps.startSession || (args => require("./didit").createDiditSession(args));
  const fetchDecision = deps.fetchDecision || (async sessionId => {
    const resp = await fetch("https://verification.didit.me/v3/session/" +
      encodeURIComponent(sessionId) + "/decision/", {
      headers: {"x-api-key": env.DIDIT_API_KEY, Accept: "application/json"},
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) throw Error("didit_provider_unavailable");
    return resp.json();
  });
  const secret = crypto.createHmac("sha256", String(env.DIDIT_WEBHOOK_SECRET || ""))
    .update("presentation-session-key-v1").digest();
  app.use(DEMO_PATH, (req, res, next) => {
    res.set("Cache-Control", "no-store");
    // Browser requests are cross-origin. Set CORS *before* disabled-mode
    // errors so the UI can show the real blocker instead of "Failed to fetch".
    // Only the actual live VolunServe origin is allowed, never wildcards.
    const origin = req.headers.origin;
    if (!ORIGINS.has(origin)) return res.status(403).json({error:"demo_origin_required"});
    res.set("Vary","Origin");
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods","GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers","Authorization, Content-Type");
    res.set("Access-Control-Max-Age", "300");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    if (!ready) return res.status(503).json({error:"presentation_demo_disabled"});
    next();
  });
  async function authorized(req,res,next) {
    const match = /^Bearer ([A-Za-z0-9._-]{40,6000})$/.exec(String(req.headers.authorization || ""));
    if (!match) return res.status(401).json({error:"unauthenticated"});
    try {
      const decoded = await verify(match[1]);
      if (decoded?.aud !== PROD_AUTH_PROJECT || decoded?.iss !== "https://securetoken.google.com/"+PROD_AUTH_PROJECT ||
          !decoded?.email_verified || !allow.has(decoded.uid)) {
        return res.status(403).json({error:"demo_test_account_only"});
      }
      req.demoUid = decoded.uid;
      return next();
    } catch {
      return res.status(401).json({error:"invalid_token"});
    }
  }
  app.post(DEMO_PATH+"/start", authorized, async (req,res) => {
    if (req.body?.consent !== true) return res.status(400).json({error:"consent_required"});
    const now=Date.now();
    const record=counts.get(req.demoUid) || {until:now+24*3600*1000,count:0};
    if (record.until<now) {record.until=now+24*3600*1000;record.count=0;}
    if (record.count>=MAX_DEMOS_PER_UID) return res.status(429).json({error:"demo_limit_reached"});
    // Reserve quota BEFORE provider call to prevent concurrent session abuse.
    record.count++; counts.set(req.demoUid,record);
    const vendor="demo_"+crypto.randomBytes(12).toString("hex");
    try {
      const session=await startSession({uid:vendor,email:""});
      const url = new URL(String(session.url || ""));
      if (url.protocol !== "https:" ||
          (url.hostname !== "didit.me" && !url.hostname.endsWith(".didit.me")) ||
          !/^[A-Za-z0-9_-]{8,128}$/.test(String(session.sessionId)) ||
          session.workflowId !== SANDBOX_WORKFLOW || session.vendorData !== vendor) {
        return res.status(502).json({error:"unexpected_sandbox_session"});
      }
      const token=makeToken(secret,{v:1,uid:req.demoUid,sessionId:session.sessionId,
        vendor,issued:now,expiry:now+SESSION_LIFETIME_MS});
      return res.status(201).json({url:url.toString(),token,
        notice:"Didit Sandbox simulation only. No production Resident verification is performed."});
    } catch { return res.status(503).json({error:"didit_sandbox_unavailable"}); }
  });
  app.get(DEMO_PATH+"/status", authorized, async (req,res) => {
    const claim=decodeToken(secret,req.query?.token,req.demoUid);
    if (!claim) return res.status(403).json({error:"invalid_demo_session"});
    try {
      const remote=await fetchDecision(claim.sessionId);
      if (String(remote?.session_id||"")!==claim.sessionId ||
          String(remote?.vendor_data||"")!==claim.vendor ||
          String(remote?.workflow_id||"")!==SANDBOX_WORKFLOW ||
          remote?.environment!=="sandbox") {
        return res.status(409).json({error:"demo_session_mismatch"});
      }
      return res.json({result:evaluatePresentationResult(remote),sandbox:true,
        residentStatusUnchanged:true,schoolIdActualImageNotValidated:true});
    } catch { return res.status(503).json({error:"demo_status_unavailable"}); }
  });
}
module.exports={registerPresentationRoutes,presentationReady,makeToken,decodeToken,evaluatePresentationResult};
