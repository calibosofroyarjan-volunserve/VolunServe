"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const cases = fs.readFileSync("app/(admin)/admin-cases.tsx","utf8");
const panels = fs.readFileSync("components/admin/EmergencyFiveTabDesign.tsx","utf8");
for(const text of ["ReferenceOverview","ReferenceStatus","ReferenceHistory",
 "ReferenceVolunteerMatching","EmergencyMapButton","caseListPagination",
 "reviewVerification(incident, \"validate\")",
 "reviewVerification(incident, \"reject\")",
 "assignVolunteerToCase(incident, volunteer)",
 "cancelAssignment(savedAssignment)"]) {
  assert(cases.includes(text),"Original functional flow missing: "+text);
}
assert(!cases.includes("manualFallbackOpen") &&
       !cases.includes("setManualFallbackOpen"), "Remove toggle state");
assert(!panels.includes("fallbackStrip") &&
       !panels.includes("Hide fallback") &&
       !panels.includes("Show fallback") &&
       !panels.includes("Admin manual offer fallback"),
       "Remove all visible manual fallback UI");
assert(cases.includes("eligibleVolunteerCount > 0 && volunteerSupportAvailable"),
       "Only show eligible task offer list when available");
assert(cases.includes("dispatchReady &&"), "No task offer controls before validation");
assert(cases.includes("eligibleVolunteerCandidates.length === 0"),
       "Allow empty search results without hiding the search controls");
assert(cases.includes("const eligibleVolunteerCount = approvedVolunteers.filter("),
       "Eligible count must be independent of UI search");
assert(panels.includes("No eligible local Volunteers found"),
       "One clear empty state required for zero-eligible cases");
assert(panels.includes("onCancelAssignment"), "Cancel remains usable for recorded assignments");
assert(!cases.includes("style={styles.personnelActiveSupportHeader}") &&
       !cases.includes("<View style={styles.personnelSupportEmpty}>"),
       "Do not show duplicate assigned-support sections");
assert(panels.includes('kind="danger"'),"Shared emergency map CTA must remain red");
assert(panels.includes("styles.actionDanger") &&
       panels.includes("styles.actionPrimary"), "Blue and red buttons share same base dimensions");
assert(cases.includes("<EmergencyMapButton") &&
       !cases.includes("styles.criticalNavigateButton"),
       "Evidence must use compact shared red map CTA, not full width bar");
assert(panels.includes("headingTextPage") &&
       panels.includes("headingText:") && panels.includes("fieldLabel:"),
       "Unified page/card/body typography missing");
assert(cases.includes("fontSize: 12,\n    fontWeight: \"700\""),
       "Tab labels must use readable standard type size");
assert(!cases.includes('src: "/admin-live-map?caseId="'),
       "No nested full Admin navigation");
assert(cases.includes("pageSize={5}"), "Keep 5 per page");
console.log("PASS: no fallback or duplicate empty state; qualified offer/cancel preserved; compact red map CTA; consistent five-tab typography.");
