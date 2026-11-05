"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const read = path => fs.readFileSync(path, "utf8");
const baseline = "e2f5017ed849869139010ba4d434a66daa447344";
const allowed = new Set([
  "app/(admin)/_layout.tsx",
  "app/(admin)/admin-cases.tsx",
  "app/(lgu)/_layout.tsx",
  "app/(tabs)/disaster-response.tsx",
  "app/(tabs)/volunteer.tsx",
  "app/(tabs)/volunteer.web.tsx",
  "components/DisasterResponse.native.tsx",
  "components/DisasterResponse.web.tsx",
  "components/tabs/MapTracking.native.tsx",
  "components/tabs/MapTracking.web.tsx",
  "components/tabs/ResponseFlow.web.tsx",
  "lib/emergencyTaskStatus.ts",
  "scripts/test-emergency-volunteer-live-20261106.cjs",
  ".github/workflows/validate-emergency-volunteer-live-20261106.yml",
  ".github/workflows/release-emergency-volunteer-hosting-only-20261106.yml",
  "scripts/test-clean-emergency-report-header.cjs",
  "scripts/test-isolated-emergency-volunteer-release.cjs",
  "scripts/test-emergency-map-volunteer-privacy.cjs",
]);
test("all changes remain scoped to the exact live baseline", () => {
  const names = execFileSync("git", ["diff", "--name-only", baseline + "..HEAD"], {encoding:"utf8"}).trim().split("\n").filter(Boolean);
  assert.ok(names.length > 0, "No changes");
  for (const name of names) assert.ok(allowed.has(name), "Unexpected production file changed: " + name);
  for (const protectedFile of ["firestore.rules","firebase.json","lib/firebaseAuth.ts","app/login.tsx","app/login.web.tsx","app/signup.tsx","app/signup.web.tsx","app/(superadmin)/index.tsx","app/(tabs)/notifications.tsx","app/(admin)/assistance-requests.tsx"]) {
    assert.ok(!names.includes(protectedFile), "Protected file was modified: " + protectedFile);
  }
});

test("Resident photos and a real GPS pin remain mandatory on web and native", () => {
  for (const [path, evidence] of [
    ["components/DisasterResponse.web.tsx", "photoFiles.length === 0"],
    ["components/DisasterResponse.native.tsx", "photos.length === 0"],
  ]) {
    const text = read(path);
    assert.match(text, /if \(!pin\)/);
    assert.ok(text.includes(evidence), "Missing evidence validation in " + path);
  }
});

test("Admin directly coordinates approved Volunteers and verifies completion", () => {
  const a = read("app/(admin)/admin-cases.tsx");
  for (const token of [
    "const assignVolunteerToCase = async",
    "currentVerification !== \"validated\"",
    "volunteer.uid === incident.reporterUid",
    "responderLockSnapshot.exists()",
    "const confirmVolunteerCompletion = async",
    'fieldSnapshot.data().reportStatus !== "reviewed"',
    "Volunteer Completion Reports",
    "Confirm Volunteer Completion",
    "emergencyTaskStatusLabel",
    'pageFive(activeAssignments, activeAssignmentPage)',
    "doc(collection(db, \"notifications\"))",
  ]) assert.ok(a.includes(token), "Missing Admin coordination guard " + token);
  assert.ok(!a.includes("<Text style={styles.personnelCleanTitle}>LGU Primary Responder</Text>"));
  const sidebar = read("app/(admin)/_layout.tsx");
  assert.ok(sidebar.includes('item.label !== "LGU Operations"'));
  const retired = read("app/(lgu)/_layout.tsx");
  assert.ok(retired.includes("former responder workspace is no longer part"));
});

test("Web tracking never requires LGU Personnel and shows opt-in GPS with last update", () => {
  const web = read("components/tabs/MapTracking.web.tsx");
  for (const token of ["residentActiveVolunteerPins","adminFocusedVolunteerPin","Last Volunteer GPS update","VOLUNTEER GPS LIVE","residentCaseStatus","No valid in-city GPS coordinate is saved"]) {
    assert.ok(web.includes(token), token);
  }
  assert.match(web, /const residentShareCanPublish =\s*isResidentMode &&\s*!!residentShareAssignment/);
  assert.match(web, /incidents:\s*mapIncidentCases.map/);
  const flow = read("components/tabs/ResponseFlow.web.tsx");
  assert.match(flow, /const activeStates = \["responding", "on_site"\]/);
  assert.match(flow, /deleteDoc\(locationRef\)/);
});

test("Native tracking only reads assigned Volunteer GPS; sharing is opt-in and cleared", () => {
  const native = read("components/tabs/MapTracking.native.tsx");
  for (const token of ["trackedVolunteerCaseIds","volunteerGpsConsent","Share GPS for This Task","Stop GPS Sharing","deleteDoc(gpsRef)","responseLocations","responseAssignments"]) {
    assert.ok(native.includes(token), "Missing native tracking " + token);
  }
  assert.ok(!native.includes("visibleLguVehiclePins"), "Old LGU responder pin is still used");
  const statuses = read("lib/emergencyTaskStatus.ts");
  for (const state of ["Pending","Approved","Assigned","In Progress","Completed","Rejected"]) assert.ok(statuses.includes('"' + state + '"'));
});


test("Admin may assign any approved Volunteer throughout SJDM regardless of barangay", () => {
  const src = read("app/(admin)/admin-cases.tsx");
  const eligibility = src.slice(
    src.indexOf("const volunteerEligibilityForCase = ("),
    src.indexOf("const reviewVerification = async", src.indexOf("const volunteerEligibilityForCase = ("))
  );
  assert.ok(eligibility.includes("return approvedVolunteers"), "Use approved Volunteer roster");
  assert.ok(eligibility.includes("skillMatchCount"), "Keep safety and skill suitability checks");
  assert.ok(eligibility.includes("busyOnAnotherCase"), "Do not double-assign active Volunteers");
  assert.ok(eligibility.includes("reporterIsVolunteer"), "Do not self-assign a resident report");
  assert.ok(!eligibility.includes("aLocal") && !eligibility.includes("bLocal"),
    "Do not give preferential assignment ranking based on home barangay");
  assert.ok(!eligibility.includes('reason: "Emergency case barangay is missing"'),
    "Do not block assignments because a case barangay string is missing");
  assert.ok(!eligibility.includes("volunteer.barangay.toLowerCase().includes(search)"),
    "Volunteer search is by name and skills, not home barangay");
  const assignStart = src.indexOf("const assignVolunteerToCase = async");
  const cancelStart = src.indexOf("const cancelAssignment = async", assignStart);
  const assign = src.slice(assignStart, cancelStart);
  assert.ok(assign.includes("currentVerification !== \"validated\""),
    "Admin validation remains required for citywide assignment");
  assert.ok(assign.includes("responderLockSnapshot.exists()"),
    "Busy Volunteer lock remains enforced");
  assert.ok(!assign.includes("currentCaseBarangay"),
    "The assignment transaction cannot depend on case or Volunteer barangay");
  assert.ok(src.includes("Approved Volunteer · Citywide SJDM assignments"),
    "Roster must clearly show citywide participation instead of Volunteer barangay");
  assert.ok(src.includes("INCIDENT BARANGAY"),
    "Keep the incident's own location for mapping and records");
});
