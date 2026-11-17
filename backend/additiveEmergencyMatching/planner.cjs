"use strict";
// ADD-ONLY, READ-ONLY review copy from the isolated staging matcher.
// No Firebase reads/writes, notifications, external requests or task offers.
// This file is deliberately NOT registered in live backend or frontend.

/**
 * Pure, side-effect-free matching planner for staged emergency Volunteer offers.
 * No notification, Firestore write, task acceptance, map tracking, or dispatch
 * happens in this module. A protected server worker must perform the
 * transactions and validate its inputs again before any real offer is sent.
 */

const LIVE_ASSIGNMENTS = new Set(["offered", "accepted", "responding", "on_site"]);
const TERMINAL_CASES = new Set(["resolved", "closed", "rejected", "cancelled"]);

function normalizeBarangay(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim().toLowerCase()
    .replace(/^brgy\.?\s*|^barangay\s*/i, "")
    .replace(/[.,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function list(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  return [];
}
function normalizedSkills(value) {
  return list(value).map((x) => x.toLowerCase());
}
function result(code, message, wave = 0) {
  return { eligible: code === "eligible", code, reason: message, wave };
}
function validateVolunteer(caseData, volunteer, options = {}) {
  const app = volunteer.application || {};
  const user = volunteer.user || {};
  const uid = String(volunteer.uid || app.uid || app.userId || app.volunteerId || "").trim();
    const status = String(caseData.status || "").trim().toLowerCase();
  const verification = String(caseData.verificationStatus || "").trim().toLowerCase();

  if (verification !== "validated" || !["validated", "assigned", "in_progress"].includes(status) ||
      caseData.dispatchBlocked === true || TERMINAL_CASES.has(status)) {
    return result("case_locked", "Admin must validate an open Emergency Report before sending Volunteer offers");
  }
  if (!uid) return result("missing_uid", "Volunteer application has no linked user ID");
  if (uid === String(caseData.reporterUid || "").trim()) {
    return result("own_report", "The reporting Resident cannot respond to their own case");
  }
  if (String(app.status || "").toLowerCase() !== "approved") {
    return result("not_approved", "Volunteer application is not approved");
  }
  const role = String(user.role || "").toLowerCase();
  if (role !== "resident" && role !== "volunteer") {
    return result("admin_role", "An Admin account cannot be offered a Volunteer task");
  }
  const accountStatus = String(user.status || "").toLowerCase();
  if (accountStatus !== "approved") {
    return result("blocked_account", "Volunteer account is disabled, suspended or rejected");
  }
  if (user.volunteerAccess !== true || String(user.volunteerStatus || "").toLowerCase() !== "approved") {
    return result("revoked", "Volunteer access has been revoked or rejected");
  }
  if (user.identityVerified !== true && String(user.identityStatus || "").toLowerCase() !== "verified") {
    return result("identity_rejected", "Volunteer identity verification is rejected or failed");
  }

  const allowed = new Set(list(options.knownBarangays).map(normalizeBarangay).filter(Boolean));
  const caseBarangay = normalizeBarangay(
    caseData.incidentBarangay || caseData.emergencyBarangay || caseData.barangay);
  const volunteerBarangay = normalizeBarangay(user.barangay || user.addressBarangay);
  if (!allowed.size || !caseBarangay || !allowed.has(caseBarangay)) {
    return result("invalid_incident_barangay", "Incident barangay is not confirmed within SJDM");
  }
  if (!volunteerBarangay || !allowed.has(volunteerBarangay)) {
    return result("invalid_volunteer_barangay", "Volunteer current barangay is not confirmed within SJDM");
  }

  if ((options.activeAssignments || []).some((assignment) =>
    String(assignment.volunteerId || "") === uid &&
    LIVE_ASSIGNMENTS.has(String(assignment.status || "").toLowerCase()))) {
    return result("busy", "Volunteer has an active or pending emergency task");
  }

  const required = normalizedSkills(caseData.requiredSkills)
    .filter((skill) => !skill.includes("general volunteer"));
  const offeredSkills = normalizedSkills([
    ...list(user.skills),
    ...list(user.volunteerSkills),
    ...list(app.skills),
    ...list(app.volunteerSkills),
  ]);
  if (required.length && !required.some((requiredSkill) =>
    offeredSkills.some((skill) => skill === requiredSkill ||
      skill.includes(requiredSkill) || requiredSkill.includes(skill)))) {
    return result("skill_mismatch", "Verified skills do not match this Emergency Report");
  }

  if (volunteerBarangay === caseBarangay) {
    return result("eligible", "Eligible for Wave 1 — same barangay", 1);
  }
  const neighbors = options.neighborsByBarangay || {};
  const rawNeighborList = neighbors[caseBarangay] ||
    Object.entries(neighbors).find(([key]) => normalizeBarangay(key) === caseBarangay)?.[1];
  // Do not invent adjacency: Wave 2 only exists when a verified adjacency list is configured.
  if (rawNeighborList && list(rawNeighborList).map(normalizeBarangay).includes(volunteerBarangay)) {
    return result("eligible", "Eligible for Wave 2 — verified neighboring barangay", 2);
  }
  return result("eligible", "Eligible for Wave 3 — SJDM citywide", 3);
}

function planVolunteerWaves(caseData, volunteers, options = {}) {
  const caseBarangay = normalizeBarangay(
    caseData.incidentBarangay || caseData.emergencyBarangay || caseData.barangay);
  const neighbors = options.neighborsByBarangay || {};
  const wave2Config = Object.entries(neighbors).some(([key, values]) =>
    normalizeBarangay(key) === caseBarangay && Array.isArray(values));
  const reviewed = (volunteers || []).map((person) => {
    const eligibility = validateVolunteer(caseData, person, options);
    return {
      uid: String(person.uid || person.application?.uid || person.application?.userId || "").trim(),
      name: String(person.user?.fullName || person.application?.fullName || "Volunteer").trim(),
      barangay: String(person.user?.barangay || person.user?.addressBarangay || "").trim(),
      ...eligibility,
    };
  });
  const seen = new Set();
  const waves = { 1: [], 2: [], 3: [] };
  reviewed.filter((row) => row.eligible && row.uid).sort((a, b) =>
    a.wave - b.wave || a.uid.localeCompare(b.uid)).forEach((row) => {
    if (seen.has(row.uid)) return;
    seen.add(row.uid);
    waves[row.wave].push(row);
  });
  return {
    caseId: String(caseData.id || ""),
    caseBarangay,
    caseReady: String(caseData.verificationStatus || "") === "validated" &&
      ["validated", "assigned", "in_progress"].includes(String(caseData.status || "")) &&
      caseData.dispatchBlocked !== true,
    requiresOfficialEscalation: ["critical", "high"].includes(String(caseData.severity || "")),
    wave2Configured: wave2Config,
    reviewed,
    waves,
    counts: {
      reviewed: reviewed.length,
      eligible: reviewed.filter((v) => v.eligible).length,
      wave1: waves[1].length,
      wave2: waves[2].length,
      wave3: waves[3].length,
      excluded: reviewed.filter((v) => !v.eligible).length,
    },
  };
}

function recommendNextWave(plan, state = {}) {
  if (!plan.caseReady) return { action: "stop", reason: "case_not_verified" };
  if (state.activeResponse === true) return { action: "stop", reason: "already_accepted" };
  if (state.pendingOffer === true) return { action: "wait", reason: "await_volunteer_acceptance" };
  if (state.expiredOfferNotReleased === true) return { action: "stop", reason: "release_previous_offer_first" };
  const completed = new Set((state.completedWaves || []).map(Number));
  const attempted = new Set((state.attemptedVolunteerIds || []).map(String));
  for (const wave of [1, 2, 3]) {
    if (completed.has(wave)) continue;
    // A missing reviewed adjacency map must never create fake "nearby"
    // matches. Safely skip Wave 2 and continue the documented SJDM-wide
    // fallback, where Volunteers still explicitly choose to accept.
    if (wave === 2 && !plan.wave2Configured) {
      completed.add(2);
      continue;
    }
    const candidate = (plan.waves[wave] || []).find((person) => !attempted.has(person.uid));
    if (candidate) return { action: "offer", wave, volunteerId: candidate.uid };
    completed.add(wave);
  }
  return { action: "admin_review", reason: "no_eligible_volunteer_accepted" };
}
module.exports = { normalizeBarangay, validateVolunteer, planVolunteerWaves, recommendNextWave };
