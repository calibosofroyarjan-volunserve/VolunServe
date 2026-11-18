"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {test} = require("node:test");

const read = (file) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const volunteer = read("app/(tabs)/community-events.tsx");
const admin = read("app/(admin)/community-attendance.tsx");
const rules = read("firestore.rules");

test("Time In and Time Out still write server timestamps in the existing transaction", () => {
  assert.match(volunteer, /transaction\.update\(participantRef, \{\s*checkedInAt: serverTimestamp\(\)/);
  assert.match(volunteer, /transaction\.update\(participantRef, \{\s*checkedOutAt: serverTimestamp\(\)/);
});
test("Auto verification follows a committed Time Out and authenticates current user", () => {
  const attendance = volunteer.indexOf("const recordSelfAttendance = async");
  const transaction = volunteer.indexOf("await runTransaction(db, async (transaction) =>", attendance);
  const backend = volunteer.indexOf("/api/community-events/attendance/auto-verify", attendance);
  assert.ok(transaction > attendance && backend > transaction);
  assert.match(volunteer, /body: JSON\.stringify\(\{eventId: event\.id\}\)/);
  assert.match(volunteer, /Authorization: `Bearer \$\{token\}`/);
});
test("Failed automatic verification keeps existing Firestore timestamps", () => {
  assert.match(volunteer, /Recorded server timestamps are retained if Render is unavailable/);
  assert.match(volunteer, /const timeout = setTimeout\(\(\) => controller\.abort\(\), 15000\)/);
});
test("Admin still starts and marks event complete manually", () => {
  assert.match(admin, /Mark Event Completed/);
  assert.match(admin, /onPress=\{\(\) => void changeStatus\("completed"\)\}/);
  assert.match(admin, /completedBy: user\.uid/);
});
test("Admin verification remains available for exceptions", () => {
  assert.match(admin, /async function verifyAttendance\(person: Participant\)/);
  assert.match(admin, /attendanceVerifiedBy: user\.uid/);
});
test("Firestone permissions still prohibit participant self-verification", () => {
  assert.match(rules, /An event participant may never mark their own attendance as verified/);
  assert.match(rules, /request\.resource\.data\.attendanceVerified == true/);
});
test("Volunteer no longer promises incorrect hardcoded 30-minute eligibility", () => {
  assert.doesNotMatch(volunteer, /Certificate: \{durationMinutes\(selectedParticipation\)\} \/ 30 min/);
});
