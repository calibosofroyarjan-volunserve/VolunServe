"use strict";
/**
 * Read-only production-source contract checks.
 * No Firebase credentials, Hosting deployments, login, data writes, or network.
 * Run on the candidate descended from the observed Hosting release marker.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const BASE = "eef240c29940cc2772c4467a5f7649ae8938b141";
const SCREEN = "app/(tabs)/community-events.tsx";
const ROSTER = "components/volunteers/CommunityEventRoster.tsx";
const QA_SCRIPT = "scripts/test-community-events-production-ui-qa.cjs";
const QA_WORKFLOW = ".github/workflows/qa-community-events-production-ui-no-deploy-20261121.yml";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const read = path => fs.readFileSync(path, "utf8");
const current = read(SCREEN);
const roster = read(ROSTER);
const baseline = git("show", `${BASE}:${SCREEN}`);
const assertHas = (body, text) => assert.ok(body.includes(text), `Missing expected source feature: ${text}`);
function functionBody(body, marker) {
  const begin = body.indexOf(marker);
  assert.ok(begin >= 0, `Missing function: ${marker}`);
  const end = body.indexOf("\n  };", begin);
  assert.ok(end > begin, `Unable to isolate function: ${marker}`);
  return body.slice(begin, end + 5);
}

test("QA branch is a direct descendant of observed Hosting source", () => {
  git("merge-base", "--is-ancestor", BASE, "HEAD");
  assert.equal(git("merge-base", BASE, "HEAD"), BASE);
});

test("Only the two event frontend files and QA-only files differ", () => {
  const touched = git("diff", "--name-status", "--no-renames", BASE, "HEAD").split("\n")
    .filter(Boolean)
    .map(line => line.split("\t"));
  const expected = new Map([
    [SCREEN, "M"], [ROSTER, "M"], [QA_SCRIPT, "A"], [QA_WORKFLOW, "A"],
  ]);
  assert.equal(touched.length, expected.size, "Unexpected file count; fail closed");
  for (const [status, path] of touched) {
    assert.equal(expected.get(path), status, `Unreviewed file/status: ${status} ${path}`);
  }
  for (const critical of ["backend/", "functions/", "identity-ai/", "firestore.rules", "storage.rules", "firebase.json", "app.json", "package.json", "package-lock.json", "lib/firebaseAuth.ts"]) {
    assert.ok(!touched.some(([,path]) => path === critical || (critical.endsWith("/") && path.startsWith(critical))), `Protected dependency changed: ${critical}`);
  }
});

test("Production RSVP and self attendance transaction function bodies remain identical", () => {
  for (const marker of ["  const respondToEvent =", "  const recordSelfAttendance ="]) {
    assert.equal(functionBody(current, marker), functionBody(baseline, marker),
      `Blocked change to live transaction function ${marker}`);
  }
});

test("Production-only proposal word limits, errors, and form review are preserved", () => {
  for (const marker of ["PROPOSAL_WORD_LIMITS", "ProposalWordFeedback", "proposalWordError",
    "setProposalAttempted", "showWordErrors", "community-proposal-title",
    "community-proposal-volunteerTasks"]) {
    assertHas(current, marker);
  }
});

test("Volunteer status filters and accurate upcoming schedule semantics are present", () => {
  for (const marker of ['label: "Upcoming"', 'label: "Ongoing"', 'label: "Finished"',
    'eventListFilter === "upcoming" ? event.status === "upcoming" && !eventScheduleHasPassed(event)',
    'still marked Ongoing by Admin', 'event.status === "active"']) {
    assertHas(current, marker);
  }
});

test("Pagination is five per page, bounded, and preserves event count", () => {
  for (const marker of ["const pageSize = 5;", "const visiblePageCount = Math.min(totalEventPages, 5);",
    'displayEvents.slice((eventPage - 1) * pageSize, eventPage * pageSize)',
    "Previous", "Next", "Showing"]) {
    assertHas(current, marker);
  }
});

test("Newest First sorts by publication timestamp, not latest scheduled date", () => {
  assertHas(current, "const aPublished = getTime(a.createdAt);");
  assertHas(current, "const bPublished = getTime(b.createdAt);");
  assertHas(current, "return bPublished - aPublished;");
  assertHas(current, 'dateSort === "soonest" ? byDate : -byDate');
});

test("Joined volunteers remain read-only, scoped to chosen event, with public profile preview", () => {
  for (const marker of ["CommunityEventAvatarPreview", "eventId={selectedRosterEvent.id}",
    "eventTitle={selectedRosterEvent.title}", "setParticipantsModalEventId(event.id)",
    "const selectedEvent =", "myAttendanceEvents[0]"]) assertHas(current, marker);
  for (const marker of ["View Profile", "const API_URL =",
    "/api/community-events/", "getIdToken()", "Public participant profile preview"]) {
    assertHas(roster, marker);
  }
  assert.ok(!roster.includes("runTransaction("), "Roster must not write attendance");
  assert.ok(!roster.includes("setDoc("), "Roster must not write user records");
});

test("Existing backend read-only roster route and auth guard are untouched", () => {
  assert.equal(git("diff", "--name-only", BASE, "HEAD", "--", "backend/communityEventRoster.js"), "");
  const backend = read("backend/communityEventRoster.js");
  for (const marker of ["requireFirebaseUser", 'volunteerStatus !== "approved"',
    'viewer?.activeMode !== "volunteer"', "isApprovedAccount(viewer)",
    "publicationStatus", "return res.json"]) assertHas(backend, marker);
});

test("QA workflow is no-deploy and cannot access production secrets", () => {
  const workflow = read(QA_WORKFLOW);
  for (const forbidden of ["firebase deploy", "action-hosting-deploy", "secrets.", "environment: production",
    "hosting:clone", "trigger-deploy"]) {
    assert.ok(!workflow.includes(forbidden), `QA workflow contains forbidden action: ${forbidden}`);
  }
});
