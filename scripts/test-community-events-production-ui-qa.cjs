"use strict";
/**
 * Read-only production-source contract checks.
 * Read-only GitHub API comparisons only. No Firebase credentials, Hosting deployments, login, or data writes.
 * Run on the candidate descended from the observed Hosting release marker.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const BASE = "eef240c29940cc2772c4467a5f7649ae8938b141";
const SCREEN = "app/(tabs)/community-events.tsx";
const ROSTER = "components/volunteers/CommunityEventRoster.tsx";
const QA_SCRIPT = "scripts/test-community-events-production-ui-qa.cjs";
const QA_WORKFLOW = ".github/workflows/qa-community-events-production-ui-no-deploy-20261121.yml";
const read = path => fs.readFileSync(path, "utf8");
const current = read(SCREEN);
const roster = read(ROSTER);
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const HEAD = process.env.GITHUB_SHA || process.env.SOURCE_SHA;
const REPO = "calibosofroyarjan-volunserve/VolunServe";
assert.ok(GH_TOKEN && /^[0-9a-f]{40}$/.test(HEAD || ""), "Pinned SHA and read-only GitHub token are required.");
async function githubApi(route) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/${route}`, {
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json",
      "User-Agent": "VolunServe-Read-Only-QA" },
    signal: AbortSignal.timeout(25000),
  });
  assert.ok(response.ok, `GitHub read-only source verification failed: ${route}, HTTP ${response.status}`);
  return response.json();
}
let comparisonPromise = null, baselinePromise = null;
const comparison = () => comparisonPromise ||= githubApi(`compare/${BASE}...${HEAD}`);
const baselineSource = () => baselinePromise ||= githubApi(`contents/${SCREEN}?ref=${BASE}`)
  .then(file => {
    assert.equal(file.encoding, "base64");
    return Buffer.from(file.content.replaceAll("\\n", ""), "base64").toString("utf8");
  });
const assertHas = (body, text) => assert.ok(body.includes(text), `Missing expected source feature: ${text}`);
function functionBody(body, marker) {
  const begin = body.indexOf(marker);
  assert.ok(begin >= 0, `Missing function: ${marker}`);
  const end = body.indexOf("\n  };", begin);
  assert.ok(end > begin, `Unable to isolate function: ${marker}`);
  return body.slice(begin, end + 5);
}

test("QA branch is a direct descendant of observed Hosting source", async () => {
  const result = await comparison();
  assert.equal(result.status, "ahead", "Candidate must descend from production marker");
  assert.equal(result.behind_by, 0);
  assert.equal(result.base_commit.sha, BASE);
  assert.equal(result.commits.at(-1)?.sha, HEAD, "Comparison head differs from QA commit");
});

test("Only two frontend files and QA-only fixtures/workflow differ from production", async () => {
  const result = await comparison();
  const allowed = new Map([
    [SCREEN, "modified"], [ROSTER, "modified"],
    [QA_SCRIPT, "added"], [QA_WORKFLOW, "added"],
    ["scripts/test-community-events-rules-production-qa.cjs", "added"],
    ["scripts/test-admin-volunteer-firestore-production-qa.cjs", "added"],
    ["scripts/qa-community-events-preview-fixture.cjs", "added"],
    ["scripts/qa-community-events-browser.cjs", "added"],
  ]);
  assert.equal(result.files?.length, allowed.size, "Unexpected source file count");
  for (const item of result.files) {
    assert.equal(allowed.get(item.filename), item.status,
      `Blocked unreviewed file/status: ${item.status} ${item.filename}`);
  }
  for (const critical of ["backend/", "functions/", "identity-ai/", "firestore.rules",
    "storage.rules", "firebase.json", "app.json", "package.json", "package-lock.json",
    "lib/firebaseAuth.ts"]) {
    assert.ok(!result.files.some(({ filename }) =>
      filename === critical || (critical.endsWith("/") && filename.startsWith(critical))),
      `Protected dependency changed: ${critical}`);
  }
});

test("Production RSVP and self attendance transaction bodies remain unchanged", async () => {
  const baseline = await baselineSource();
  for (const marker of ["  const respondToEvent =", "  const recordSelfAttendance ="]) {
    assert.equal(functionBody(current, marker), functionBody(baseline, marker),
      `Production core transaction changed: ${marker}`);
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
  // The strict source comparison above prohibits backend changes.
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
