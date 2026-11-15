"use strict";

/**
 * Render Starter / always-on alternative to Firebase Blaze Functions.
 *
 * WARNING: The existing Render Free plan sleeps when idle. Never enable this
 * worker on a sleeping service or imply it is an official emergency dispatch.
 * Opt-in requires an explicit cutoff timestamp and a reviewed paid-host flag.
 *
 * Firestore is authoritative; no in-memory offer deadlines. The same
 * transactional auto-dispatch engine is shared by the Firebase Functions path.
 */
const {createEngine} = require("../functions/emergencyAutoDispatchCore");
const {FieldValue} = require("./firebaseAdmin");
const {Timestamp} = require("firebase-admin/firestore");

const MAX_DISCOVERY = 80;
const DEFAULT_POLL_MS = 30000;
function parseCutoff(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(raw)) return null;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 120000) return null;
  return timestamp;
}
function renderWorkerConfig(env = process.env) {
  const enabled = env.VOLUNSERVE_AUTO_VOLUNTEER_RENDER_WORKER_ENABLED === "true";
  const paidRuntimeApproved = env.VOLUNSERVE_RENDER_PAID_ALWAYS_ON_CONFIRMED === "true";
  const cutoffMs = parseCutoff(env.VOLUNSERVE_AUTO_VOLUNTEER_CUTOFF_UTC);
  return {
    ready: enabled && paidRuntimeApproved && cutoffMs !== null,
    enabled, paidRuntimeApproved, cutoffMs,
    reasons: [
      !enabled ? "worker_not_enabled" : null,
      !paidRuntimeApproved ? "paid_always_on_runtime_not_confirmed" : null,
      cutoffMs === null ? "valid_activation_cutoff_not_configured" : null,
    ].filter(Boolean),
  };
}
function createRenderAutoDispatchWorker({
  db, logger = console, env = process.env, clock = Date.now, engineFactory = createEngine,
}) {
  const config = renderWorkerConfig(env);
  const engine = engineFactory({db, log:logger, clock, firestore:{FieldValue,Timestamp}});
  let running = false;
  let timer = null;
  async function runOnce() {
    if (!config.ready) return {status:"disabled", reasons:config.reasons};
    if (running) return {status:"already_running"};
    running = true;
    try {
      // Poll all due, ready and pending offers. A declined or accepted task
      // is reconciled even before its timeout expires. Idempotent transactions
      // prevent double-offering across restarts and concurrent workers.
      const sweep = await engine.sweep({pollPending:true});
      const recent = await db.collection("disasterCases")
        .orderBy("validatedAt", "desc").limit(MAX_DISCOVERY).get();
      let eligible = 0, scanned = 0, skipped = 0;
      for (const doc of recent.docs) {
        const data = doc.data() || {};
        const validatedMs = typeof data.validatedAt?.toMillis === "function"
          ? data.validatedAt.toMillis()
          : data.validatedAt instanceof Date ? data.validatedAt.getTime() : NaN;
        if (!Number.isFinite(validatedMs) || validatedMs < config.cutoffMs) continue;
        if (data.verificationStatus !== "validated" ||
            !["validated","assigned","in_progress"].includes(data.status) ||
            data.dispatchBlocked === true) {skipped++; continue;}
        // Historical cases never start unexpectedly. Only a case validated
        // AFTER the reviewed go-live cutoff is eligible for automatic discovery.
        if (!data.incidentBarangay ||
            data.activeVolunteerSupportAssignmentId ||
            data.autoVolunteerDispatch?.state) {skipped++;continue;}
        eligible++;
        try {
          const result = await engine.advanceCase(doc.id);
          if (result.action === "offered") scanned++;
        } catch(error) {
          logger.error("[Volunteer auto-match] discovery failed",{
            caseId:doc.id,reason:String(error?.message || error).slice(0,130),
          });
        }
      }
      return {status:"ok",scanned,eligible,skipped,sweep};
    } finally {running=false;}
  }
  function start({initialDelayMs=20000,intervalMs=DEFAULT_POLL_MS}={}) {
    if (!config.ready) {
      logger.warn("[Volunteer auto-match] NOT RUNNING", config.reasons);
      return {enabled:false,reasons:config.reasons};
    }
    if (timer) return {enabled:true,alreadyStarted:true};
    const boundedMs = Math.max(15000,Math.min(60000,intervalMs));
    const startup = setTimeout(()=>void runOnce().catch(error=>
      logger.error("[Volunteer auto-match] startup check failed",String(error))),initialDelayMs);
    timer = setInterval(()=>void runOnce().catch(error=>
      logger.error("[Volunteer auto-match] polling failed",String(error))),boundedMs);
    timer.unref?.();
    startup.unref?.();
    logger.info("[Volunteer auto-match] monitoring enabled after reviewed cutoff; this is Volunteer-only, never official emergency dispatch");
    return {enabled:true,stop(){
      clearTimeout(startup); clearInterval(timer); timer=null;
    }};
  }
  async function requestStart(caseId) {
    if (!config.ready) throw new Error("Automatic matching is not enabled on an approved always-on runtime");
    return engine.requestAdminStart(caseId);
  }
  async function requestDisable(caseId) {
    if (!config.ready) throw new Error("Automatic matching is not enabled on an approved always-on runtime");
    return engine.disableCase(caseId);
  }
  return {config,runOnce,start,requestStart,requestDisable};
}

module.exports={
  parseCutoff,renderWorkerConfig,createRenderAutoDispatchWorker,
  DEFAULT_POLL_MS,MAX_DISCOVERY,
};
