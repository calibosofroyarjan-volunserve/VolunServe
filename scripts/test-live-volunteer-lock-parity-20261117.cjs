"use strict";
// Production-review static guard. This does not authenticate users or send tasks.
const assert=require("node:assert/strict");
const fs=require("node:fs");

for(const path of ["app/(tabs)/volunteer.web.tsx","app/(tabs)/volunteer.tsx"]){
  const source=fs.readFileSync(path,"utf8");
  const scope=source.slice(source.indexOf("transitionAssignment = async"));
  const key='const responderLockRef = doc(db, "responderLocks", user.uid)';
  assert.equal(scope.split(key).length-1,1,path+" should contain one lock in task transitions");
  const lock=scope.indexOf(key);
  const read=scope.indexOf("await transaction.get(responderLockRef)",lock);
  const assignmentWrite=scope.indexOf("transaction.update(",read);
  assert.ok(lock>0 && read>lock && assignmentWrite>read,
    path+" must read responder lock before writing assignment");
  assert.ok(scope.includes('if (next === "accepted" && recordedLock)'),
    path+" must refuse second accepted response");
  assert.ok(scope.includes('transaction.set(responderLockRef,'),
    path+" must create responder lock in same Firebase transaction");
  assert.ok(scope.includes('transaction.update(responderLockRef,'),
    path+" must synchronize status during response");
  assert.ok(scope.includes('transaction.delete(responderLockRef)'),
    path+" must release lock after completed task");
  assert.ok(scope.includes("transaction.set(") && scope.includes('"resident_response_update"'),
    path+" must retain resident notification when task changes");
  assert.ok(scope.includes('"volunteerFieldReports"'),
    path+" must retain the volunteer field-report workflow");
}
const rules=fs.readFileSync("firestore.rules","utf8");
const assStart=rules.indexOf("match /responseAssignments/{assignmentId}");
const lockStart=rules.indexOf("match /responderLocks/{uid}");
assert.ok(assStart>0 && lockStart>0);
const assignment=rules.slice(assStart,rules.indexOf("match /",assStart+10));
const lock=rules.slice(lockStart,rules.indexOf("match /",lockStart+10));
// This code-only PR retains the EXACT current approved live rules.
// Security strengthening is separated into DRAFT #573 pending policy approval.
assert.match(assignment,/function validVolunteerResponseFields\\(\\)/);
assert.match(assignment,/validVolunteerResponseFields\\(\\)/);
assert.match(lock,/lockTargetsMatch\\('accepted'\\)/);
assert.ok(!rules.includes("function validAutoMatchingResponderLock()"),
  "New Firestore permission change belongs exclusively to draft rules PR #573");
console.log("PASS: web + Android atomic responder lock lifecycle; current live Firestore Rules preserved; security review isolated in PR #573");
