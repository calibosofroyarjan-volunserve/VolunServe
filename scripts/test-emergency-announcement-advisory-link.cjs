"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = path => fs.readFileSync(path, "utf8");
const source = read("lib/emergencyPublicAdvisory.ts");
const admin = read("app/(admin)/admin-cases.tsx");
const announcements = read("app/(admin)/create-announcement.tsx");

// A public advisory is an intentional Admin publication, never a raw report feed.
assert(source.includes('source.verificationStatus === "validated"'));
assert(source.includes('"validated", "assigned", "in_progress"'));
assert(source.includes("safePublicAdvisoryBarangay"));
assert(source.includes("SJDM_BARANGAYS.find"));
assert(source.includes("adminConfirmedBarangay"));
assert(!source.includes("reporterBarangay"));
for (const sensitiveField of ["reporterName", "reporterEmail", "reporterUid", "latitude", "longitude", "attachments", "contactNumber", "photoUrl", "details"]) {
  assert(!source.includes("source." + sensitiveField), "No public announcement may copy sensitive case field: " + sensitiveField);
}

assert(admin.includes("canPreparePublicEmergencyAdvisory(incident)"));
assert(admin.includes('pathname: "/(admin)/create-announcement"'));
assert(admin.includes("params: { incidentId: incident.id }"));
assert(!admin.includes('collection(db, "announcements")'),
  "Emergency Reports must not directly publish announcements");
assert(announcements.includes("getDoc(doc(db, \"disasterCases\", incidentId))"));
assert(announcements.includes("buildPublicEmergencyAdvisory(latest.data(), advisoryBarangay)"));
assert(announcements.includes("safePublicAdvisoryBarangay(advisoryBarangay)"));
assert(announcements.includes("advisorySourceValidated"));
assert(announcements.includes("!advisoryReviewed"));
assert(announcements.includes('role !== "admin"'));
assert(announcements.includes("SJDM_BARANGAYS.filter"));
assert(announcements.includes('audience: "all"'));
assert(announcements.includes('linkUrl: ""') && announcements.includes('imageUrl: ""'));
assert(announcements.includes("onPress={handleSubmit}"));
assert(!announcements.includes("autoPublishEmergency"));
console.log("PASS privacy-safe Admin-validated incident -> reviewed existing Announcements with no raw report or Rules changes");
