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
assert(!nav.includes('label: "LGU Operations"') &&
  nav.includes('labels: ["Resident Identity Reviews"]') &&
  !nav.includes('route: "/(admin)/lgu-attendance"'),
  "Retired LGU Operations must not be available from Admin navigation");
assert(duty.includes("export function LguAttendancePanel()") &&
  duty.includes("export default function LguOperationsWorkspace()") &&
  duty.includes('<Redirect href="/(admin)/admin-cases" />') &&
  !duty.includes("<LguPersonnelPanel />"),
  "Legacy LGU Operations URL must redirect to Admin Emergency Reports; historical functions remain untouched");
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
  cases.includes("hasCurrentSkillMatch") &&
  cases.includes("currentVerification !== \"validated\"") &&
  cases.includes('status: "offered"') &&
  cases.includes('read: false') &&
  cases.includes('volunteer.uid === incident.reporterUid'),
  "Keep atomic, validated, skill/lock-checked assignment with queued Volunteer notifications");
assert(cases.includes('currentVolunteerBarangay !== currentCaseBarangay') &&
  cases.includes("!volunteerSupportAvailable") &&
  cases.includes("!caseOpenForSupport"),
  "Maintain local eligibility and case verification; do not promise unrestricted dispatch");
assert(!cases.includes("pageFive(onDutyPersonnel") &&
  cases.includes("pageFive(volunteerCandidates") &&
  cases.includes("pageFive(activeAssignments") &&
  cases.includes("pageFive(videoEvidence"),
  "Only Volunteer assignment and existing Emergency lists must retain pagination");
assert(cases.includes('["personnel", "Volunteer Assignment"]') &&
  cases.includes("Volunteer Task Assignment") &&
  !cases.includes('onPress={() => void assignLguPersonnelToCase(incident, personnel)}') &&
  !cases.includes('<Text style={styles.personnelCleanTitle}>LGU Primary Responder</Text>') &&
  cases.includes('["accepted", "responding", "on_site"].includes(String(item.status))') &&
  cases.includes("Volunteer Acceptance Required"),
  "Admin Emergency must assign approved Volunteers only; offline offers remain pending until accepted");
console.log("PASS retired LGU Operations UI, Volunteer-only dispatch with offline offers, protected Emergency lists and legacy rule preservation");
