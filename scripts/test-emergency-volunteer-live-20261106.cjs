"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const read = path => fs.readFileSync(path, "utf8");
const baseline = "2b596300a2c4e0c12793bae106017d372b69abdd";
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
  "components/volunteer/VolunteerInvitationInbox.tsx",
  "components/admin/EmergencyIncidentMap.web.tsx",
  "components/admin/EmergencyIncidentMap.native.tsx",
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
    "status: \"offered\"",
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
  assert.ok(!eligibility.includes("busyOnAnotherCase"), "Pending offers must be possible even when another task is active");
  assert.ok(eligibility.includes("reporterIsVolunteer"), "Do not self-assign a resident report");
  assert.ok(!eligibility.includes("aLocal") && !eligibility.includes("bLocal"),
    "Do not give preferential assignment ranking based on home barangay");
  assert.ok(!eligibility.includes("normalizeBarangay(volunteer.barangay)"),
    "Volunteer residence cannot be compared with incident barangay");
  assert.ok(eligibility.includes("Record the incident barangay for the completion report"),
    "Keep incident-area documentation separate from Volunteer residence");
  assert.ok(!eligibility.includes("volunteer.barangay.toLowerCase().includes(search)"),
    "Volunteer search is by name and skills, not home barangay");
  const assignStart = src.indexOf("const assignVolunteerToCase = async");
  const cancelStart = src.indexOf("const cancelAssignment = async", assignStart);
  const assign = src.slice(assignStart, cancelStart);
  assert.ok(assign.includes("currentVerification !== \"validated\""),
    "Admin validation remains required for citywide assignment");
  assert.ok(!assign.includes("responderLockSnapshot.exists()") &&
    !assign.includes("activeCount >= 1"),
    "Pending task offers must not be blocked by another task or a prior offer");
  assert.ok(!assign.includes("currentVolunteerBarangay") &&
    !assign.includes("volunteerBarangay"),
    "The assignment transaction must not restrict the Volunteer home barangay");
  assert.ok(assign.includes("Record the incident barangay for completion documents"),
    "Preserve the incident's own location documentation");
  assert.ok(src.includes("Approved Volunteer · Citywide SJDM assignments"),
    "Roster must clearly show citywide participation instead of Volunteer barangay");
  assert.ok(src.includes("INCIDENT BARANGAY"),
    "Keep the incident's own location for mapping and records");
});

test("New Emergency Tasks contains photo-rich assigned cards and inline earlier invitations", () => {
  const admin = read("app/(admin)/admin-cases.tsx");
  const web = read("app/(tabs)/volunteer.web.tsx");
  const native = read("app/(tabs)/volunteer.tsx");
  const legacy = read("components/volunteer/VolunteerInvitationInbox.tsx");

  // A validated Admin action is sufficient to offer a task; Volunteer accepts
  // or declines only after the actual assignment exists.
  assert.ok(admin.includes("onPress={() => assignVolunteerToCase(incident, volunteer)}"));
  assert.ok(admin.includes('"Send Task Offer"'));
  assert.ok(!admin.includes("inviteVolunteerToCase(incident, volunteer)"));
  assert.ok(!admin.includes('currentInvite?.status === "accepted"'));
  assert.ok(admin.includes('status: "offered"'));
  assert.ok(admin.includes('type: "response_assignment"'));

  for (const source of [web, native]) {
    assert.ok(source.includes('onPendingCountChange={setLegacyPendingCount}'),
      "Older invitations must contribute to New tab count");
    assert.ok(source.includes('assignedCaseIds={caseIds}'),
      "Hide earlier invitations when Admin already assigned the same case");
    assert.ok(source.includes('visible={filter === "new" || filter === "all"}'),
      "Earlier invitations must be rendered inside New/All only");
    assert.ok(!source.includes("<VolunteerInvitationInbox />"),
      "Never show the redundant standalone invitation panel");
    assert.ok(source.includes('collection(db, "responseAssignments")'),
      "Assigned tasks must remain connected to Firestore");
    assert.ok(source.includes('"offered"'),
      "New tasks must include actual Admin offers");
  }
  assert.ok(web.includes("<IncidentMedia incident={incident} />"),
    "Desktop task cards must display incident image from case evidence");
  assert.ok(native.includes("firstIncidentImage(") &&
    native.includes("incident?.attachments"),
    "Mobile tasks must display uploaded resident incident photos");
  assert.ok(legacy.includes('collection(db, "volunteerInvitations")'),
    "Existing pending invitations remain accessible, never deleted");
  assert.ok(legacy.includes('status === "invited"') &&
    legacy.includes('updateDoc(doc(db, "volunteerInvitations"'),
    "Earlier requests remain actionable without changing Firestore rules");
  assert.ok(legacy.includes("Photo available after assignment"),
    "Do not fabricate a photo for legacy invitations without case access");
  assert.ok(legacy.includes("!assigned.has(invitation.caseId)"),
    "Avoid duplicate invitation/assignment cards for one incident");
  assert.ok(!legacy.includes('doc(db, "disasterCases",'),
    "Do not bypass assigned-Volunteer-only incident evidence access");
});

test("Busy approved Volunteers can receive offers; Accept remains one-active-mission-at-a-time", () => {
  const admin=read("app/(admin)/admin-cases.tsx");
  const begin=admin.indexOf("const volunteerEligibilityForCase = (");
  const end=admin.indexOf("const reviewVerification = async",begin);
  const eligible=admin.slice(begin,end);
  const assign=admin.slice(admin.indexOf("const assignVolunteerToCase = async"),admin.indexOf("const cancelAssignment = async"));
  assert.ok(!eligible.includes('Busy on another active emergency'));
  assert.ok(!eligible.includes('busyOnAnotherCase'));
  assert.ok(!assign.includes('responderLockSnapshot.exists()'));
  assert.ok(!assign.includes('activeCount >= 1'));
  assert.ok(!admin.includes('!volunteerSupportAvailable || !caseOpenForSupport'));
  assert.ok(admin.includes('Send Task Offer'));
  assert.ok(admin.includes('status: "offered"'));
  for (const path of ["app/(tabs)/volunteer.web.tsx","app/(tabs)/volunteer.tsx"]) {
    const task=read(path);
    assert.ok(task.includes('next === "accepted" && responderLockSnapshot?.exists()'),
      "Accept must atomically block a second active mission in "+path);
    assert.ok(task.includes('transaction.set(responderLockRef, {'),
      "Accept must create the Volunteer lock in "+path);
    assert.ok(task.includes('transaction.delete(responderLockRef)'),
      "Completion must release the Volunteer lock in "+path);
    assert.ok(task.includes('transaction.update(') && task.includes('"declined"'),
      "Keep real Accept/Decline status transitions in "+path);
  }
});

test("Admin Map & Route contains only incident map, no nested Admin sidebar", () => {
  const admin=read("app/(admin)/admin-cases.tsx");
  const map=read("components/admin/EmergencyIncidentMap.web.tsx");
  const native=read("components/admin/EmergencyIncidentMap.native.tsx");
  assert.ok(admin.includes('<EmergencyIncidentMap'));
  assert.ok(admin.includes('Open Full Live Map'));
  assert.ok(!admin.includes('src: "/admin-live-map?caseId="'),
    "Never embed the entire Admin shell in a frame");
  assert.ok(map.includes('srcDoc:MAP_HTML') &&
    map.includes('https://tiles.openfreemap.org/styles/liberty'));
  assert.ok(map.includes('doc(db, "responseLocations", String(item.volunteerId))'));
  assert.ok(map.includes('["responding","on_site"]'));
  assert.ok(map.includes('String(data.assignmentId||"") !== item.id'));
  assert.ok(map.includes('clock-p.updatedAt<120000'));
  assert.ok(native.includes("Open Full Live Map"));
});
