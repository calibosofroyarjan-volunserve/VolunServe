"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const rules=fs.readFileSync("firestore.rules","utf8");
assert(rules.includes("match /responderLocks/{uid}"),
  "Existing Firestore lock rules are required");
assert(rules.includes("&& lockTargetsMatch('accepted')"),
  "Volunteer lock creation must atomically match accepted assignment");
for(const path of ["app/(tabs)/volunteer.web.tsx","app/(tabs)/volunteer.tsx"]) {
  const s=fs.readFileSync(path,"utf8");
  const lock=s.indexOf('const responderLockRef = doc(db, "responderLocks", user.uid)');
  const read=s.indexOf('await transaction.get(responderLockRef)',lock);
  const assignmentWrite=s.indexOf("transaction.update(",read);
  assert(lock>=0 && read>lock && assignmentWrite>read,
    path+" must read responder lock before changing task");
  assert(s.includes('if (next === "accepted" && recordedLock)'),
    path+" must block double acceptance");
  assert(s.includes('if (next === "accepted") {') &&
    s.includes('transaction.set(responderLockRef,'),
    path+" must acquire lock when accepting");
  assert(s.includes('next === "responding" || next === "on_site"') &&
    s.includes('transaction.update(responderLockRef,'),
    path+" must maintain lock after starting response");
  assert(s.includes('next === "completed" && recordedLock') &&
    s.includes('transaction.delete(responderLockRef)'),
    path+" must release lock on completed task");
}
const engine=fs.readFileSync("functions/emergencyAutoDispatchCore.js","utf8");
assert(engine.includes('db.collection("autoVolunteerReservations").doc(uid)') &&
  engine.includes('db.collection("responderLocks").doc(uid)'),
  "Automatic offers must check both reservation and accepted-response locks");
assert(engine.includes("tx.create(reserveRef"),"Automatic offers must reserve atomically");
assert(engine.includes("if (RESPONSE_ACCEPTED.has(assignmentStatus))"),
  "Accepted offer cannot time out");
console.log("PASS: web and Android task acceptance use responder locks; automatic offers preserve idempotent reservations.");
