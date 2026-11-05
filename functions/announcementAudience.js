"use strict";

// Pure matching logic shared by the notification sender and its regression tests.
// Keep this in sync with the Resident announcements page's case-insensitive scope.
function normalizeScope(value) {
  return String(value || "").trim().toLowerCase();
}

function eligibleRecipient(profile, audience) {
  if (!profile || typeof profile !== "object") return false;
  const role = normalizeScope(profile.role);
  if (["admin", "superadmin", "lgu_personnel", "applicant"].includes(role)) {
    return false;
  }
  const approved = profile.status === "approved" ||
    (profile.status === undefined && role !== "applicant");
  const member = profile.residentAccess === true ||
    profile.volunteerAccess === true ||
    role === "resident" || role === "volunteer";
  if (!approved || !member) return false;
  const target = normalizeScope(audience);
  if (target === "all") return true;
  const memberBarangay = normalizeScope(profile.barangay);
  return Boolean(target && memberBarangay && target === memberBarangay);
}

module.exports = {normalizeScope, eligibleRecipient};
