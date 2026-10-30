"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");
const emergency = read("app/(admin)/admin-cases.tsx");
const nav = read("app/(admin)/_layout.tsx");
const retiredRelief = read("app/(admin)/relief-operations.tsx");
const required = [
  ["Approved Volunteer applications", "approvedApplications"],
  ["Approved Volunteer application status", 'String(data.status || "").toLowerCase() === "approved"'],
  ["Offline independent roster", "return !isReporter && skillSearchMatch;"],
  ["Volunteer name search", "volunteer.fullName.toLowerCase().includes(search)"],
  ["Offline support offer label", "Offline · can receive offer"],
  ["Volunteer assignment view", "Volunteer Assignment Center"],
  ["Spacious roster cards", "styles.volunteerRosterCard"],
  ["Visible Volunteer action", "Offer Support"],
  ["Five-row roster pagination", "pageFive(volunteerCandidates, volunteerPage)"],
  ["Five-row assignment pagination", "pageFive(activeAssignments, activeAssignmentPage)"],
  ["New notification per offer", 'doc(collection(db, "notifications"))'],
  ["Atomic assignment", "runTransaction(db, async (transaction)"],
  ["Busy responder guard", "responderLockSnapshot.exists()"],
  ["Verified case before offer", 'currentVerification !== "validated"'],
  ["No self-assignment", "volunteer.uid === incident.reporterUid"],
  ["Single active support guard", "activeCount >= 1"],
  ["Suspended accounts blocked", '"suspended"'],
  ["Revoked Volunteer blocked", '"revoked"'],
  ["Volunteer must accept", "Volunteers accept before responding"],
  ["Embedded emergency map preserved", 'detailTab === "map"'],
  ["Case details retained", "setSelectedCaseId(item.id)"],
  ["Evidence retained", "pageFive(imageEvidence, photoPage)"],
];
for (const [name, token] of required) {
  assert(emergency.includes(token), "Missing protected flow: " + name);
}
assert(!emergency.includes("<Text style={styles.personnelCleanTitle}>On-Duty LGU Personnel</Text>") &&
  !emergency.includes("<Text style={styles.personnelCleanTitle}>LGU Primary Responder</Text>"),
  "Remove on-screen LGU personnel dispatch controls only");
assert(!nav.includes('label: "Relief Operations"') &&
  nav.includes('labels: ["Emergency Reports", "Assistance Requests"]') &&
  nav.includes('label: "Emergency Reports"') &&
  nav.includes('label: "Assistance Requests"') &&
  retiredRelief.includes('<Redirect href="/(admin)/command-center" />'),
  "Retired Relief Operations must disappear from nav and old URLs must redirect");
console.log("PASS: isolated Emergency Reports UI, offline approved Volunteer offers, security guards, response/map/pagination preservation, retired Relief redirect");
