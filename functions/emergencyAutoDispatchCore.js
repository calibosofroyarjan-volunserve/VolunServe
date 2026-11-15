"use strict";

const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { planVolunteerWaves, recommendNextWave } = require("./emergencyVolunteerWavePlanner");
const knownBarangays = require("./sjdmBarangays.json");

const OPEN_STATUSES = new Set(["validated", "assigned", "in_progress"]);
const RESPONSE_ACTIVE = new Set(["offered", "accepted", "responding", "on_site"]);
const RESPONSE_ACCEPTED = new Set(["accepted", "responding", "on_site", "completed"]);
const RESPONSE_TERMINAL = new Set(["declined", "cancelled"]);
const INTERVAL_MS = 3 * 60 * 1000;
const MAX_APPLICATIONS = 200;

function str(value) { return String(value || "").trim(); }
function nowTimestamp(nowMs) { return Timestamp.fromMillis(nowMs); }
function cleanCase(caseId, caseData) { return { id: caseId, ...caseData }; }
function validCase(incident) {
  return incident.verificationStatus === "validated" &&
    OPEN_STATUSES.has(incident.status) && incident.dispatchBlocked !== true;
}
function autoStatus(state, wave, attemptedCount, note) {
  return { state, wave: Number(wave || 0), attemptedCount, note, updatedAt: FieldValue.serverTimestamp() };
}
function validAdjacencyConfig(config, all) {
  if (!config || config.approved !== true || config.enabled !== true ||
      !config.neighborsByBarangay || typeof config.neighborsByBarangay !== "object") return null;
  const normalize = require("./emergencyVolunteerWavePlanner").normalizeBarangay;
  const known = new Set(all.map(normalize));
  const canonical = {};
  for (const [key, values] of Object.entries(config.neighborsByBarangay)) {
    const name = normalize(key);
    if (!known.has(name) || !Array.isArray(values)) return null;
    const neighbors = values.map(normalize);
    if (neighbors.some((x) => !known.has(x) || x === name)) return null;
    canonical[name] = [...new Set(neighbors)];
  }
  return canonical;
}
function getStorage(db, caseId) {
  return {
    caseRef: db.collection("disasterCases").doc(caseId),
    stateRef: db.collection("emergencyAutoDispatch").doc(caseId),
  };
}
async function fetchRoster(db) {
  const snapshot = await db.collection("volunteerApplications")
    .where("status", "==", "approved").limit(MAX_APPLICATIONS + 1).get();
  if (snapshot.size > MAX_APPLICATIONS) {
    throw new Error("Approved Volunteer pool exceeded the audited matching limit");
  }
  const applications = new Map();
  for (const doc of snapshot.docs) {
    const app = doc.data() || {};
    const uid = str(app.uid || app.userId || app.volunteerId || doc.id);
    if (!uid || uid.includes("/")) continue;
    if (!applications.has(uid)) applications.set(uid, app);
  }
  const roster = await Promise.all([...applications.entries()].map(async ([uid, application]) => {
    const snap = await db.collection("users").doc(uid).get();
    return { uid, application, user: snap.exists ? (snap.data() || {}) : {} };
  }));
  return roster;
}
function notification(docRef, to, caseId, assignmentId, title, message) {
  return {
    ref: docRef, data: {
      userId: to, audience: "volunteer", type: "response_assignment",
      caseId, assignmentId, title, message, read: false,
      createdAt: FieldValue.serverTimestamp(),
    },
  };
}
function createEngine({ db, clock = Date.now, log = console }) {
  async function updateStateOnly(caseId, state, reason, wave = 0, attempted = []) {
    const { stateRef, caseRef } = getStorage(db, caseId);
    await db.runTransaction(async (tx) => {
      const [incidentSnap, statusSnap] = await Promise.all([
        tx.get(caseRef), tx.get(stateRef),
      ]);
      if (!incidentSnap.exists) return;
      if (statusSnap.exists && ["accepted", "responding", "completed"].includes(statusSnap.data().status)) return;
      const previous = statusSnap.exists ? statusSnap.data() : {};
      const nextAttempted = [...new Set([...(previous.attemptedVolunteerIds || []), ...attempted])];
      tx.set(stateRef, {
        status: state, reason, wave, caseId,
        attemptedVolunteerIds: nextAttempted,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.update(caseRef, { autoVolunteerDispatch: autoStatus(state, wave, nextAttempted.length, reason) });
      if (state === "needs_admin") {
        const adminUid = str(incidentSnap.data().validatedBy);
        if (adminUid) {
          const ref = db.collection("notifications").doc("auto_escalation_" + caseId);
          tx.set(ref, {
            userId: adminUid, audience: "admin", type: "emergency_dispatch_escalation",
            caseId, title: "Volunteer matching requires Admin review",
            message: "No qualified Volunteer accepted, or a verified nearby-barangay plan is missing. Contact official emergency services when appropriate.",
            read: false, createdAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      }
    });
  }

  async function reconcileOffer(caseId) {
    const { caseRef, stateRef } = getStorage(db, caseId);
    const stateSnap = await stateRef.get();
    const state = stateSnap.data() || {};
    if (state.status !== "waiting" || !state.assignmentId) return "ready";
    const assignmentRef = db.collection("responseAssignments").doc(state.assignmentId);
    const reservationRef = state.volunteerId ?
      db.collection("autoVolunteerReservations").doc(state.volunteerId) : null;
    let outcome = "ready";
    await db.runTransaction(async (tx) => {
      const refs = [caseRef, stateRef, assignmentRef, ...(reservationRef ? [reservationRef] : [])];
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      const [caseSnapshot, currentStateSnapshot, assignmentSnapshot] = snapshots;
      const reservationSnapshot = reservationRef ? snapshots[3] : null;
      if (!caseSnapshot.exists || !currentStateSnapshot.exists) { outcome = "gone"; return; }
      const current = currentStateSnapshot.data();
      if (current.status !== "waiting" || current.assignmentId !== state.assignmentId) {
        outcome = "changed"; return;
      }
      const incident = caseSnapshot.data();
      const assignmentStatus = assignmentSnapshot.exists ?
        str(assignmentSnapshot.data().status) : "missing";
      if (RESPONSE_ACCEPTED.has(assignmentStatus)) {
        tx.update(stateRef, { status: "accepted", reason: "volunteer_accepted",
          updatedAt: FieldValue.serverTimestamp() });
        tx.update(caseRef, {
          autoVolunteerDispatch: autoStatus("accepted", current.wave, (current.attemptedVolunteerIds || []).length,
            "Volunteer accepted the offer"),
        });
        outcome = "accepted"; return;
      }
      const expired = Number(current.expiresAtMs || 0) <= clock();
      if (assignmentStatus === "offered" && !expired && validCase(incident)) {
        outcome = "waiting"; return;
      }
      if (assignmentStatus === "offered") {
        tx.update(assignmentRef, {
          status: "cancelled", updatedAt: FieldValue.serverTimestamp(),
        });
      }
      const attempted = [...new Set([...(current.attemptedVolunteerIds || []), str(current.volunteerId)])];
      tx.update(stateRef, {
        status: "ready", reason: expired ? "offer_timed_out" : "offer_declined_or_cancelled",
        attemptedVolunteerIds: attempted, assignmentId: null, volunteerId: null,
        expiresAtMs: null, updatedAt: FieldValue.serverTimestamp(),
      });
      if (reservationRef && reservationSnapshot?.exists &&
          reservationSnapshot.data()?.assignmentId === current.assignmentId) {
        tx.delete(reservationRef);
      }
      const patch = {
        autoVolunteerDispatch: autoStatus("ready", current.wave, attempted.length, "Matching next qualified Volunteer"),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (incident.activeVolunteerSupportAssignmentId === current.assignmentId) {
        patch.activeVolunteerSupportAssignmentId = "";
        patch.activeVolunteerSupportName = "";
        patch.activeVolunteerSupportUid = "";
      }
      tx.update(caseRef, patch);
      outcome = validCase(incident) ? "ready" : "closed";
    });
    return outcome;
  }

  async function advanceCase(caseId) {
    if (!caseId || typeof caseId !== "string" || caseId.includes("/")) return { action: "invalid_case" };
    const { caseRef, stateRef } = getStorage(db, caseId);
    const caseSnapshot = await caseRef.get();
    if (!caseSnapshot.exists) return { action: "missing_case" };
    const incident = cleanCase(caseId, caseSnapshot.data() || {});
    if (!validCase(incident)) {
      const stateSnap = await stateRef.get();
      if (stateSnap.exists && stateSnap.data().status === "waiting") {
        await reconcileOffer(caseId);
      }
      return { action: "stop", reason: "not_validated_or_not_open" };
    }
    const result = await reconcileOffer(caseId);
    if (result === "accepted" || result === "waiting") return { action: result };
    const stateSnap = await stateRef.get();
    const existingState = stateSnap.exists ? stateSnap.data() : {};
    if (["needs_admin", "accepted", "completed", "disabled"].includes(existingState.status)) {
      return { action: "stop", reason: existingState.status };
    }
    const configSnap = await db.collection("systemSettings").doc("emergencyVolunteerMatching").get();
    const neighbors = validAdjacencyConfig(configSnap.exists ? configSnap.data() : null, knownBarangays);
    const roster = await fetchRoster(db);
    // Respect every existing manual or automatic active assignment on this case.
    const currentAssignmentsSnap = await db.collection("responseAssignments")
      .where("caseId", "==", caseId).limit(MAX_APPLICATIONS + 1).get();
    if (currentAssignmentsSnap.size > MAX_APPLICATIONS) {
      await updateStateOnly(caseId, "needs_admin", "Too many case assignments to review safely");
      return { action: "admin_review" };
    }
    const existingAssignments = currentAssignmentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (existingAssignments.some((a) => RESPONSE_ACTIVE.has(str(a.status)))) {
      await updateStateOnly(caseId, "needs_admin", "An existing manual or automatic Volunteer offer is active");
      return { action: "admin_review", reason: "existing_active_offer" };
    }
    const busySnap = await db.collection("responseAssignments")
      .where("status", "in", [...RESPONSE_ACTIVE]).limit(200).get();
    if (busySnap.size >= 200) {
      await updateStateOnly(caseId, "needs_admin", "Too many simultaneous Volunteer assignments to audit safely");
      return { action: "admin_review", reason: "busy_pool_limit" };
    }
    const busy = busySnap.docs.map((d) => d.data());
    const plan = planVolunteerWaves(incident, roster, {
      knownBarangays, neighborsByBarangay: neighbors || {}, activeAssignments: busy,
    });
    const attemptedVolunteerIds = [
      ...(existingState.attemptedVolunteerIds || []),
      ...existingAssignments.filter((a) => RESPONSE_TERMINAL.has(str(a.status)))
        .map((a) => str(a.volunteerId)),
    ];
    // Do not claim Wave 2 proximity without an independently verified adjacency map.
    const recommendation = recommendNextWave(plan, {
      attemptedVolunteerIds,
      completedWaves: existingState.completedWaves || [],
    });
    if (recommendation.action !== "offer") {
      const reason = recommendation.reason || "no_eligible_candidates";
      await updateStateOnly(caseId, "needs_admin", reason, recommendation.wave || 0, attemptedVolunteerIds);
      return { action: "admin_review", reason };
    }
    const uid = recommendation.volunteerId;
    const candidate = roster.find((v) => v.uid === uid);
    if (!candidate) return { action: "retry", reason: "volunteer_disappeared" };
    const assignmentId = caseId + "_" + uid;
    const assignmentRef = db.collection("responseAssignments").doc(assignmentId);
    const userRef = db.collection("users").doc(uid);
    const reserveRef = db.collection("autoVolunteerReservations").doc(uid);
    const lockRef = db.collection("responderLocks").doc(uid);
    const applicationSnap = (await db.collection("volunteerApplications")
      .where("status", "==", "approved").limit(MAX_APPLICATIONS + 1).get()).docs
      .find((d) => str(d.data().uid || d.data().userId || d.data().volunteerId || d.id) === uid);
    if (!applicationSnap) return { action: "retry", reason: "application_no_longer_approved" };
    let committed = false;
    await db.runTransaction(async (tx) => {
      const [currentCaseSnap, statusSnap, assignmentSnap, userSnap, appSnap, reservationSnap, lockSnap] =
        await Promise.all([caseRef, stateRef, assignmentRef, userRef, applicationSnap.ref, reserveRef, lockRef]
          .map((ref) => tx.get(ref)));
      if (!currentCaseSnap.exists || !userSnap.exists || !appSnap.exists) return;
      const liveCase = cleanCase(caseId, currentCaseSnap.data());
      const currentState = statusSnap.exists ? statusSnap.data() : {};
      if (!validCase(liveCase) || ["waiting", "accepted", "needs_admin", "completed"].includes(currentState.status)) return;
      if (currentState.assignmentId || liveCase.activeVolunteerSupportAssignmentId) {
        // Never race an existing manual task offer or another instance of this worker.
        return;
      }
      if (assignmentSnap.exists || reservationSnap.exists || lockSnap.exists) return;
      const revalidation = planVolunteerWaves(liveCase, [{
        uid, application: appSnap.data(), user: userSnap.data(),
      }], { knownBarangays, neighborsByBarangay: neighbors || {}, activeAssignments: busy });
      const stillEligible = revalidation.reviewed[0];
      if (!stillEligible?.eligible || stillEligible.wave !== recommendation.wave) return;
      const nowMs = clock();
      const expiresAtMs = nowMs + INTERVAL_MS;
      const nextAttempted = [...new Set([...(currentState.attemptedVolunteerIds || []), ...attemptedVolunteerIds])];
      const caseTitle = str(liveCase.title).slice(0, 120) || "Emergency Report";
      const volunteerName = str(userSnap.data().fullName || candidate.application.fullName ||
        candidate.name || "Volunteer").slice(0, 120);
      tx.create(reserveRef, {
        caseId, assignmentId, uid, expiresAt: nowTimestamp(expiresAtMs),
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(assignmentRef, {
        caseId, volunteerId: uid, volunteerName, caseTitle, status: "offered",
        createdBy: "automatic_matching_engine",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(db.collection("notifications").doc("auto_response_" + assignmentId), notification(
        null, uid, caseId, assignmentId, "Emergency Volunteer task offer",
        "An approved emergency support task is available. Open Volunteer Tasks to accept or decline.").data);
      const patch = {
        activeVolunteerSupportUid: uid, activeVolunteerSupportName: volunteerName,
        activeVolunteerSupportAssignmentId: assignmentId,
        autoVolunteerDispatch: autoStatus("waiting", recommendation.wave, nextAttempted.length + 1,
          "Volunteer offer sent, awaiting acceptance"),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (liveCase.status === "validated") {
        patch.status = "assigned";
        patch.assignedAt = FieldValue.serverTimestamp();
      }
      tx.update(caseRef, patch);
      tx.set(stateRef, {
        caseId, status: "waiting", reason: "awaiting_acceptance",
        assignmentId, volunteerId: uid, wave: recommendation.wave,
        expiresAtMs, attemptedVolunteerIds: nextAttempted,
        updatedAt: FieldValue.serverTimestamp(),
        startedAt: currentState.startedAt || FieldValue.serverTimestamp(),
      }, { merge: true });
      committed = true;
    });
    if (!committed) {
      log.warn("Auto Volunteer candidate not committed due to concurrent change", {caseId});
      return { action: "retry", reason: "concurrent_update" };
    }
    return { action: "offered", wave: recommendation.wave, uid };
  }

  async function finalizeAccepted(caseId, assignmentId) {
    const { stateRef, caseRef } = getStorage(db, caseId);
    const assignmentRef = db.collection("responseAssignments").doc(assignmentId);
    const stateSnap = await stateRef.get();
    const uid = str(stateSnap.data()?.volunteerId);
    if (!uid || stateSnap.data()?.assignmentId !== assignmentId) return;
    const reserveRef = db.collection("autoVolunteerReservations").doc(uid);
    await db.runTransaction(async (tx) => {
      const [sessionSnap, caseSnap, assignmentSnap, reserveSnap] = await Promise.all([
        stateRef, caseRef, assignmentRef, reserveRef,
      ].map((ref) => tx.get(ref)));
      if (!sessionSnap.exists || !caseSnap.exists || !assignmentSnap.exists) return;
      const session = sessionSnap.data();
      if (session.assignmentId !== assignmentId ||
          !["accepted", "waiting"].includes(session.status)) return;
      const status = str(assignmentSnap.data().status);
      if (!["responding", "on_site", "completed", "cancelled"].includes(status)) return;
      const completed = status === "completed";
      const cancelled = status === "cancelled";
      const newStatus = completed ? "completed" : cancelled ? "needs_admin" : "accepted";
      const explanation = completed ? "Volunteer completed support; awaiting case review" :
        cancelled ? "Accepted response was cancelled; Admin must review" :
        status === "on_site" ? "Volunteer marked on-site arrival" :
        "Volunteer started responding";
      tx.update(stateRef, {
        status: newStatus, reason: explanation, updatedAt: FieldValue.serverTimestamp(),
      });
      const incident = caseSnap.data();
      const casePatch = {
        autoVolunteerDispatch: autoStatus(newStatus, session.wave,
          (session.attemptedVolunteerIds || []).length, explanation),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if ((completed || cancelled) &&
          incident.activeVolunteerSupportAssignmentId === assignmentId) {
        casePatch.activeVolunteerSupportUid = "";
        casePatch.activeVolunteerSupportName = "";
        casePatch.activeVolunteerSupportAssignmentId = "";
      }
      tx.update(caseRef, casePatch);
      if ((completed || cancelled) && reserveSnap.exists &&
          reserveSnap.data().assignmentId === assignmentId) tx.delete(reserveRef);
    });
  }

  async function onAssignmentChanged(assignmentId, previous, next) {
    if (previous.status === next.status || !next.caseId) return;
    const stateRef = db.collection("emergencyAutoDispatch").doc(next.caseId);
    const state = (await stateRef.get()).data() || {};
    if (state.assignmentId !== assignmentId) return;
    if (state.status === "waiting" && RESPONSE_ACCEPTED.has(str(next.status))) {
      await reconcileOffer(next.caseId);
    }
    if (["responding", "on_site", "completed", "cancelled"].includes(str(next.status))) {
      await finalizeAccepted(next.caseId, assignmentId);
      return;
    }
    if (state.status === "waiting" && RESPONSE_TERMINAL.has(str(next.status))) {
      await reconcileOffer(next.caseId);
      await advanceCase(next.caseId);
    }
  }

  async function sweep() {
    const waiting = await db.collection("emergencyAutoDispatch")
      .where("status", "==", "waiting").limit(80).get();
    const due = waiting.docs.filter((doc) => Number(doc.data().expiresAtMs || 0) <= clock());
    const ready = await db.collection("emergencyAutoDispatch")
      .where("status", "==", "ready").limit(40).get();
    const accepted = await db.collection("emergencyAutoDispatch")
      .where("status", "==", "accepted").limit(40).get();
    for (const doc of [...due, ...ready.docs]) {
      try { await advanceCase(doc.id); } catch (error) {
        log.error("Emergency Volunteer automatic retry failed", { caseId: doc.id, error: String(error) });
      }
    }
    for (const doc of accepted.docs) {
      if (!doc.data().assignmentId) continue;
      try { await finalizeAccepted(doc.id, doc.data().assignmentId); } catch (error) {
        log.error("Emergency Volunteer accepted-state reconciliation failed",
          {caseId: doc.id, error: String(error)});
      }
    }
    return { scanned: waiting.size + ready.size + accepted.size, due: due.length + ready.size };
  }

  return { advanceCase, reconcileOffer, onAssignmentChanged, finalizeAccepted, sweep };
}
module.exports = { createEngine, validAdjacencyConfig, validCase, INTERVAL_MS };