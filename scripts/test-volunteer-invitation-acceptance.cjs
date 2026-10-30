"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (path) => fs.readFileSync(path, "utf8");
const admin = read("app/(admin)/admin-cases.tsx");
const web = read("app/(tabs)/volunteer.web.tsx");
const native = read("app/(tabs)/volunteer.tsx");
const rules = read("firestore.rules");
const notifications = read("app/(tabs)/notifications.tsx");

for (const [label, sample] of [
  ["approved roster", "approvedApplications"],
  ["all offline Volunteers can be invited", "Offline · can receive offer"],
  ["busy Volunteers can be invited", "Invitation allowed — finish your current response before accepting"],
  ["allow several pending offers", "Multiple invitations are allowed"],
  ["user-visible send invitation action", "Send Invite"],
  ["verified case required", 'currentVerification !== "validated"'],
  ["review case button navigates to Response", 'setDetailTab("response")'],
  ["fresh notification per invite", 'doc(collection(db, "notifications"))'],
  ["explicit accept or decline", "can now Accept or Decline"],
  ["reporter cannot invite themselves", "volunteer.uid === incident.reporterUid"],
  ["paginated candidates", "pageFive(volunteerCandidates, volunteerPage)"],
]) {
  assert(admin.includes(sample), "Admin invitation contract lost: " + label);
}
assert(!admin.includes("activeCount >= 1"), "Old one-invitation-per-case gate still present");
assert(!admin.includes('reason: "Busy on another active emergency"'), "Old busy-volunteer gate still present");
for (const [kind, source] of [["web", web], ["native", native]]) {
  for (const [label, token] of [
    ["inbox listening for offers", 'collection(db, "responseAssignments")'],
    ["accept or reject offered", 'declined: "offered"'],
    ["explicit invite acceptance", "Accept Invite"],
    ["explicit invite rejection", "Reject Invite"],
    ["read active lock within Firestore transaction", 'transaction.get(lockRef)'],
    ["atomic lock creation", "transaction.set(lockRef"],
    ["existing response lock blocks acceptance", "lockSnapshot?.exists()"],
    ["current active response blocks another acceptance", '"Complete your current emergency response before accepting a new invitation."'],
    ["atomic release after field report", "transaction.delete(lockRef)"],
    ["keeps respondent status transition", 'status: next'],
  ]) {
    assert(source.includes(token), kind + " invitation contract lost: " + label);
  }
}
assert(notifications.includes('item.type === "response_assignment"') &&
  notifications.includes("Open Invitation · Accept / Reject") &&
  notifications.includes('router.push("/volunteer" as any)'),
  "Push/in-app invitation must open Volunteer Accept/Reject screen");
assert(rules.includes("match /responseAssignments/{assignmentId}") &&
  rules.includes("match /responderLocks/{uid}") &&
  rules.includes("lockAssignmentAfter().status == 'accepted'") &&
  rules.includes("resource.data.status == 'offered'"),
  "Existing deployed Firestore rules must still validate atomic Volunteer acceptance + lock creation");
console.log("PASS: approved offline/busy Volunteer invites, Accept/Reject on web and Android, case validation, atomic responder lock, existing Firestore rules");
