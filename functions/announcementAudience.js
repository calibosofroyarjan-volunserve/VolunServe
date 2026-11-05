"use strict";

// Match the Resident announcements page's case-insensitive scope.
/**
 * Normalize an announcement audience or account barangay.
 * @param {*} value Raw scope value.
 * @return {string} A trimmed, lowercase scope.
 */
function normalizeScope(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Check whether an account may receive a private announcement alert.
 * @param {Object} profile Authenticated account profile.
 * @param {string} audience Authorized announcement audience.
 * @return {boolean} Whether this profile can receive the alert.
 */
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
