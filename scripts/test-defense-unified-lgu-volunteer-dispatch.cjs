"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");
const nav = read("app/(admin)/_layout.tsx");
const command = read("app/(admin)/command-center.tsx");
const cases = read("app/(admin)/admin-cases.tsx");
const duty = read("app/(admin)/lgu-attendance.tsx");
const staff = read("app/(admin)/lgu-members.tsx");
for (const removed of ['label: "LGU Personnel"', 'label: "LGU Attendance"']) {
  assert(!nav.includes(removed), "Redundant LGU sidebar item: " + removed);
}
assert(nav.includes('label: "LGU Operations"') &&
  nav.includes('labels: ["Resident Identity Reviews", "LGU Operations"]') &&
  nav.includes('route: "/(admin)/lgu-attendance"'),
  "Personnel and Attendance must share one authorized LGU destination");
assert(duty.includes("export function LguAttendancePanel()") &&
  duty.includes("export default function LguOperationsWorkspace()") &&
  duty.includes("<LguPersonnelPanel />") &&
  duty.includes("<LguAttendancePanel />") &&
  duty.includes('title: "Duty & Attendance"') &&
  duty.includes('title: "Personnel Accounts"'),
  "One LGU Operations workspace must retain both duty tracking and staff management");
assert(staff.includes("export function LguPersonnelPanel()") &&
  staff.includes('href="/(admin)/lgu-attendance?section=personnel"') &&
  staff.includes("/api/admin/lgu/personnel"),
  "Previous LGU personnel URL must redirect without losing authorized staff CRUD");
assert(duty.includes("/api/admin/lgu/attendance?limit=200") &&
  duty.includes("pagedHistoryRows") && duty.includes("pagedDutyRows"),
  "Do not lose independent five-row time in/out and staff duty paging");
assert(nav.includes("overflowY: \"scroll\"") &&
  nav.includes("scrollbarWidth: \"thin\"") &&
  nav.includes("showsVerticalScrollIndicator={true}") &&
  command.includes('scrollbarWidth: "thin"') &&
  command.includes('showsVerticalScrollIndicator={true}'),
  "Sidebar and desktop command view must expose the vertical scroll affordance");
assert(cases.includes('scrollbarWidth: "thin"') &&
  cases.includes('showsVerticalScrollIndicator={true}'),
  "Emergency case workspace must visibly scroll as needed");
assert(!cases.includes("Google Maps ↗") &&
  !cases.includes("https://www.google.com/maps/search/") &&
  cases.includes("Open Live Map") &&
  cases.includes('detailTab === "map"'),
  "Retire external Google Maps button but keep secure embedded Emergency Live Map");
assert(cases.includes("approvedApplications") &&
  cases.includes('String(data.status || "").toLowerCase() === "approved"') &&
  cases.includes("visibleApprovedVolunteers"),
  "Candidate pool must only be sourced from approved applications");
assert(cases.includes("return !isReporter && skillSearchMatch && availabilityMatch;") &&
  !cases.includes('reason: "Currently unavailable / off duty"') &&
  cases.includes("offline ? \"Offline · offer allowed\"") &&
  cases.includes('pageFive(volunteerCandidates, volunteerPage)'),
  "All approved Volunteers must be visible and offline status must not prohibit offers");
assert(cases.includes("runTransaction(db, async (transaction)") &&
  cases.includes("responderLockSnapshot.exists()") &&
  cases.includes('currentVerification !== "validated"') &&
  cases.includes('status: "offered"') &&
  cases.includes('read: false') &&
  cases.includes('volunteer.uid === incident.reporterUid') &&
  cases.includes('doc(collection(db, "notifications"))'),
  "Keep atomic, validated, conflict-checked offers and a fresh notification for every offer/re-offer");
assert(!cases.includes("hasCurrentSkillMatch") &&
  !cases.includes('currentVolunteerBarangay !== currentCaseBarangay') &&
  cases.includes("!volunteerSupportAvailable") &&
  cases.includes("!caseOpenForSupport") &&
  cases.includes("Skill mismatch — LGU must review safe support duties"),
  "Show approved cross-barangay and skill-mismatched candidates, warn LGU, and retain case validation");
assert(!cases.includes("On-Duty LGU Personnel") &&
  !cases.includes('>LGU Primary Responder</Text>') &&
  cases.includes('["personnel", "Volunteer Assignments"]') &&
  cases.includes("pageFive(volunteerCandidates") &&
  cases.includes("pageFive(activeAssignments") &&
  cases.includes("pageFive(videoEvidence"),
  "Remove LGU personnel assignment UI while preserving paginated Volunteer and evidence records");
console.log("PASS unified LGU sidebar & duty page, visible scrollbars, secure live map, offline Volunteer offers and all Emergency records");
