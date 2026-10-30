"use strict";

/**
 * Single source of truth for server-side LGU operational authorization.
 * The persisted Firebase users/{uid}.role is canonical (not primaryRole or
 * activeMode). A role title by itself does not authorize a pending account.
 * Historical records without a status field are accepted only for an
 * already-provisioned admin role, matching the pre-existing Firestore
 * admin permission rule; explicit pending/rejected/suspended never pass.
 */
function getProfileRole(profile) {
  return String(profile?.role || "").trim().toLowerCase();
}
function isApprovedAccount(profile) {
  if (!profile || typeof profile !== "object") return false;
  const status = profile.status;
  if (status !== undefined && status !== null) {
    return String(status).trim().toLowerCase() === "approved";
  }
  // Never grant privileges based on primaryRole or requestedRole.
  return !Object.prototype.hasOwnProperty.call(profile, "status") &&
    ["admin", "superadmin"].includes(getProfileRole(profile));
}
function isOperationalAdminProfile(profile) {
  return isApprovedAccount(profile) &&
    getProfileRole(profile) === "admin" &&
    String(profile?.adminStatus || "").trim().toLowerCase() !== "suspended";
}
function isAdminOrSuperAdminProfile(profile) {
  return isApprovedAccount(profile) &&
    (getProfileRole(profile) === "superadmin" ||
      isOperationalAdminProfile(profile));
}
module.exports = {
  getProfileRole, isApprovedAccount,
  isOperationalAdminProfile, isAdminOrSuperAdminProfile,
};
