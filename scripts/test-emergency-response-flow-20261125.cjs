"use strict";

// Contract and algorithm tests for the isolated manual Emergency Response flow.
// No Firebase credentials, production resources, network, or deployments used.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const read = (path) => fs.readFileSync(path, "utf8");
const admin = read("app/(admin)/admin-cases.tsx");
const nativeTasks = read("app/(tabs)/volunteer.tsx");
const webTasks = read("app/(tabs)/volunteer.web.tsx");
const responseFlow = read("components/tabs/ResponseFlow.web.tsx");
const nativeMap = read("components/tabs/MapTracking.native.tsx");
const webMap = read("components/tabs/MapTracking.web.tsx");
const residentCases = read("app/(tabs)/my-cases.tsx");
const rules = read("firestore.rules");
const reportWeb = read("components/DisasterResponse.web.tsx");
const reportNative = read("components/DisasterResponse.native.tsx");

const helperCode = ts.transpileModule(read("lib/emergencyArrival.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const target = { exports: {} };
vm.runInNewContext(helperCode, {exports: target.exports, module: target, Date, Math, Number});
const {emergencyArrivalAssessment, emergencyDistanceMeters} = target.exports;

test("manual Admin review, task offer, and eligibility are retained", () => {
  assert.match(reportWeb, /pending_verification/);
  assert.match(reportNative, /pending_verification/);
  assert.match(admin, /onPress=\{\(\) => assignVolunteerToCase\(incident, volunteer\)\}/);
  assert.match(admin, /currentVerification !== "validated"/);
  assert.match(admin, /responseAssignments/);
  assert.match(admin, /type: "response_assignment"/);
  assert.doesNotMatch(admin, /Record the incident barangay for completion documents/);
  assert.doesNotMatch(admin, /INCIDENT BARANGAY/);
});

test("both Volunteer Tasks surfaces preserve manual Accept, Decline, Start, On Site", () => {
  for (const source of [nativeTasks, webTasks]) {
    for (const transition of [
      'accepted: "offered"', 'declined: "offered"',
      'responding: "accepted"', 'on_site: "responding"', 'completed: "on_site"',
    ]) assert.ok(source.includes(transition), transition);
    assert.match(source, /Mark Task Complete/);
    assert.doesNotMatch(source, /Submit Field Report & Complete|Hide Field Report/);
    assert.doesNotMatch(source, /"volunteerFieldReports"/);
    assert.match(source, /residentConfirmationStatus = "pending"/);
    assert.match(source, /!caseId \|\| !caseData/);
    assert.doesNotMatch(source, /caseData\.reporterBarangay/);
  }
});

test("Volunteer web mission shares case-specific GPS only while responding", () => {
  assert.match(responseFlow, /doc\(db, "responseLocations", uid\)/);
  assert.match(responseFlow, /activeStates\.includes\(mission\.status\)/);
  assert.match(responseFlow, /await setDoc\(locationRef, payload\)/);
  assert.match(responseFlow, /then\(\(\) => deleteDoc\(locationRef\)\)/);
  assert.match(responseFlow, /Mark Task Complete/);
  assert.doesNotMatch(responseFlow, /MissionCompletionForm|Submit Contribution & Complete/);
  assert.match(responseFlow, /emergencyArrivalAssessment/);
  assert.match(webMap, /useResponseFlow/);
});

test("native mission GPS uses the protected responseLocations collection", () => {
  assert.match(nativeMap, /where\("volunteerId", "==", CURRENT_USER_ID\)/);
  assert.match(nativeMap, /"responseLocations", CURRENT_USER_ID/);
  assert.match(nativeMap, /\["responding", "on_site"\]\.includes\(String\(item\.status\)\)/);
  assert.match(nativeMap, /activeEmergencyTaskRef\.current/);
  assert.match(nativeMap, /Mark On Site in Volunteer Tasks/);
  assert.match(nativeMap, /emergencyArrivalAssessment/);
  assert.match(rules, /match \/responseLocations\/\{uid\}/);
  assert.match(rules, /linkedAssignmentForWrite\(\)\.status in/);
});

test("Resident assistance confirmation and Admin resolution preserve independent checks", () => {
  for (const choice of ['"fully_helped"', '"partially_helped"', '"not_helped"']) {
    assert.ok(residentCases.includes(choice), choice);
  }
  assert.match(residentCases, /"assistanceConfirmations"/);
  assert.match(residentCases, /"verifiedContributions"/);
  assert.match(residentCases, /"responseDisputes"/);
  const start = admin.indexOf("const confirmVolunteerCompletion");
  const end = admin.indexOf("const reviewVolunteerFieldReport", start);
  const confirm = admin.slice(start, end);
  assert.match(confirm, /"resident_confirmed"/);
  assert.match(confirm, /"fully_helped"/);
  assert.match(confirm, /status: "resolved"/);
  assert.doesNotMatch(confirm, /fieldSnapshot|volunteerFieldReports|reportStatus/);
  assert.match(admin, /confirmVolunteerCompletion\(incident, completed\)/);
});

test("100m indicator requires a fresh, accurate location; does not prove service", () => {
  const destination = {latitude: 14.813, longitude: 121.045};
  const now = 1_800_000_000_000;
  const point = (latitude, accuracy = 10, timestamp = now) =>
    ({latitude, longitude: destination.longitude, accuracy, timestamp});
  const near = emergencyArrivalAssessment(point(14.8137), destination, now);
  assert.equal(near.status, "near");
  assert.equal(near.within100Meters, true);
  assert.ok(near.distanceMeters > 65 && near.distanceMeters < 95);
  const far = emergencyArrivalAssessment(point(14.816), destination, now);
  assert.equal(far.status, "en_route");
  assert.equal(far.within100Meters, false);
  assert.equal(emergencyArrivalAssessment(point(14.8137, 80), destination, now).status, "low_accuracy");
  assert.equal(emergencyArrivalAssessment(point(14.8137, 10, now - 35000), destination, now).status, "stale");
  assert.equal(emergencyArrivalAssessment(null, destination, now).status, "unavailable");
  assert.equal(emergencyArrivalAssessment(point(14.8137), null, now).status, "unavailable");
  assert.ok(Number.isNaN(emergencyDistanceMeters({latitude: 999,longitude: 1}, destination)));
});
