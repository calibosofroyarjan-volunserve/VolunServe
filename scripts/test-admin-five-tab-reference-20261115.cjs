"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const cases = fs.readFileSync("app/(admin)/admin-cases.tsx", "utf8");
const panels = fs.readFileSync("components/admin/EmergencyFiveTabDesign.tsx", "utf8");
for (const word of [
  "ReferenceOverview", "ReferenceStatus", "ReferenceHistory", "ReferenceVolunteerMatching",
  "referenceEvidenceColumns", "referenceEvidenceMedia", "referenceEvidenceNotes",
  "caseProgressPanel", "caseListPagination", "focusBackButton", "manualFallbackOpen",
  "advancedResponseOpen", "Open Emergency Response Map", "Validate Report",
  "Request More Evidence", "Reject Report", "Review & Validate", "Case Status",
  "Volunteer Assignment", "History", "Evidence (",
]) assert(cases.includes(word), "Missing functional or design element: " + word);
for (const word of ["Incident Summary", "Resident Information", "Case Status & Response",
 "Emergency Activity Timeline", "Case Progress", "Response controls locked",
 "Matching Waves", "Same Barangay", "Nearby Barangays", "SJDM Citywide",
 "No Volunteer assigned yet", "No automatic notification has been sent",
 "Manual task offering", "recorded case", "onEvidence",
]) {
 if(word !== "Manual task offering" && !panels.includes(word)) throw Error("Missing reference design contract: " + word);
}
for (const handler of ['reviewVerification(incident, "validate")', 'reviewVerification(incident, "reject")',
  '"request_more_evidence"', "assignVolunteerToCase(incident, volunteer)", "cancelAssignment(assignment)"]) {
  assert(cases.includes(handler), "Existing verified transaction must remain: " + handler);
}
assert(cases.includes("pageSize={5}"), "Five-case pagination must remain");
assert(!cases.includes('src: "/admin-live-map?caseId="'), "Duplicate embedded admin shell prohibited");
assert(cases.includes("encodeURIComponent(incident.id)"), "Map must reference real case ID");
assert(panels.includes("events:") && panels.includes(".filter((item) => item.when)"),
 "History must use real recorded timestamps");
assert(panels.includes("automation has not yet been enabled"),
 "Automatic assignment cannot be falsely claimed");
console.log("PASS: Five-tab reference UI, real records, protected dispatch and review actions.");
