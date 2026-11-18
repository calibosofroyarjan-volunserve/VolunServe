"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.resolve(__dirname,"..",name),"utf8");
const volunteer = read("app/(tabs)/community-events.tsx");
const admin = read("app/(admin)/community-attendance.tsx");
const rules = read("firestore.rules");

test("Time Out commits to Firestore before triggering secure server verification",()=>{
  const commit = volunteer.indexOf("await runTransaction(db, async (transaction) =>");
  const verification = volunteer.indexOf("/api/community-events/attendance/auto-verify");
  assert.ok(commit > 0 && verification > commit);
  assert.match(volunteer,/body: JSON\.stringify\(\{ eventId: event\.id \}\)/);
  assert.match(volunteer,/Authorization: `Bearer \$\{token\}`/);
});
test("Admin remains responsible for manually completing the event",()=>{
  assert.match(admin,/Mark Event Completed/);
  assert.match(admin,/onPress=\{\(\) => void changeStatus\("completed"\)\}/);
  assert.match(admin,/completedBy: user\.uid/);
});
test("Existing manual Admin verification fallback remains",()=>{
  assert.match(admin,/async function verifyAttendance\(person: Participant\)/);
  assert.match(admin,/attendanceVerifiedBy: user\.uid/);
});
test("Volunteers still cannot self-verify directly in Firestore",()=>{
  assert.match(rules,/An event participant may never mark their own attendance as verified/);
  assert.match(rules,/request\.resource\.data\.attendanceVerified == true/);
});
