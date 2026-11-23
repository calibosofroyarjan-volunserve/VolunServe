"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = path => fs.readFileSync(path, "utf8");

const safeDraft = read("lib/emergencyPublicAdvisory.ts");
const auto = read("lib/publishVerifiedCommunityAdvisory.ts");
const admin = read("app/(admin)/admin-cases.tsx");
const announcements = read("app/(admin)/create-announcement.tsx");

// Full report stays private; any public warning is a short anonymous template.
assert(safeDraft.includes('source.verificationStatus === "validated"'));
assert(safeDraft.includes('"validated", "assigned", "in_progress"'));
assert(safeDraft.includes("SJDM_BARANGAYS.find"));
assert(safeDraft.includes("adminConfirmedBarangay"));
assert(!safeDraft.includes("source.reporterBarangay"));
for(const field of ["reporterName","reporterEmail","reporterUid","latitude","longitude","attachments","contactNumber","photoUrl","details"]) {
  assert(!safeDraft.includes("source." + field), "Unsafe private case data in public draft: " + field);
  assert(!auto.includes("current." + field), "Unsafe private case data in publisher: " + field);
}

// One-click Validate Report triggers optional automatic publication for verified
// wider-impact HIGH or CRITICAL cases; no Create Public Advisory UI on case.
assert(admin.includes('reviewVerification(incident, "validate")'));
assert(admin.includes('Automatically publish a public advisory when I validate'));
assert(admin.includes('["high", "critical"].includes(incident.severity)'));
assert(admin.includes("publicImpactConfirmed[incident.id] === true"));
assert(admin.includes("safePublicAdvisoryBarangay(verifiedIncidentBarangay)"));
assert(admin.includes("basePatch.incidentBarangay = verifiedIncidentBarangay"));
assert(!admin.includes("data.barangay ||\n              data.reporterBarangay"));

assert(admin.includes("publishVerifiedCommunityAdvisory({"));
assert(!admin.includes("Create Public Advisory in Announcements"));
assert(!admin.includes('collection(db, "announcements")'));
assert(admin.indexOf("const publication = await publishVerifiedCommunityAdvisory(") >
  admin.indexOf("await runTransaction(db, async (transaction) => {"));
assert(admin.includes("Case validated, but the public advisory was NOT published"),
  "Announce failure must not invalidate private Emergency Report");

// Independent posting transaction must check live case status & severity,
// record PRIVATE link for idempotence, and use the ALREADY AUTHORIZED
// announcements schema with no case id/photos/coordinates.
assert(auto.includes('doc(db, "disasterCases", args.caseId)'));
assert(auto.includes('doc(collection(db, "announcements"))'));
assert(auto.includes('["high", "critical"].includes(String(current.severity || ""))'));
assert(auto.includes("buildPublicEmergencyAdvisory(current, barangay)"));
assert(auto.includes('typeof current.publicAdvisoryId === "string"'));
assert(auto.includes("transaction.set(noticeRef, {"));
assert(auto.includes("transaction.update(privateCaseRef, {"));
assert(auto.includes("publicAdvisoryId: noticeRef.id"));
for(const field of ['title: draft.title','message: draft.message','audience: "all"','priority: "urgent"','publishAt: serverTimestamp()','linkUrl: ""','imageUrl: ""','createdBy: args.adminUid']) {
  assert(auto.includes(field),"Missing authorized public announcement field: "+field);
}
assert(!auto.includes("caseId: args.caseId"), "Do not publish private case ID in public post");
assert(!auto.includes("reporterBarangay"), "Must not infer incident location from reporter residence");

// Existing manually-authored Admin Announcements still works for unrelated updates.
assert(announcements.includes("onPress={handleSubmit}"));
assert(announcements.includes('collection(db, "announcements")'));
assert(announcements.includes("safePublicAdvisoryBarangay(advisoryBarangay)"));
console.log("PASS: Admin Validate -> eligible public-impact advisory auto-published with privacy guards; original report private");
