#!/usr/bin/env node
"use strict";
/**
 * Protected-branch, read-only production Firestore Rules reconciliation.
 * Reads the active ruleset with an existing GitHub production-environment
 * credential. Does NOT create, update or release any rules, or deploy Hosting.
 * Never prints raw production rules, service-account data or access tokens.
 */
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const {createRequire} = require("node:module");
const {resolve} = require("node:path");
const requireFunctions = createRequire(resolve(__dirname, "../functions/package.json"));
const PROJECT = "volunserve-3aa5b";
const LIVE_HOSTING_BASE = "2cd63d318ecb6b0dfc52706308e05d0b5806d874";
const REVIEWED_RECOVERY = "fdf5c7628c355a277736726de79c7281a4e69dc1";
const RECOVERY_BRANCH = "fix/announcements-carousel-fullbleed-20261114";
const RELEASE_NAME = "projects/" + PROJECT + "/releases/cloud.firestore";
const FIRST = "    match /announcements/{announcementId} {";
const NEXT = "    match /identityVerifications/{uid} {";
const fingerprint = value => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);

function announcementBlock(source) {
  const begin = source.indexOf(FIRST);
  const end = source.indexOf(NEXT, begin + FIRST.length);
  assert(begin >= 0 && end > begin, "BLOCKED: announcement section boundary missing");
  assert(source.indexOf(FIRST, begin + FIRST.length) < 0,
    "BLOCKED: multiple announcement sections");
  assert(source.indexOf(NEXT, end + NEXT.length) < 0,
    "BLOCKED: multiple identity section boundaries");
  return source.slice(begin, end);
}
function assertOnlyAnnouncementPatch(base, candidate) {
  const before = announcementBlock(base);
  const after = announcementBlock(candidate);
  assert.notEqual(before, after, "BLOCKED: no change in announcement permissions");
  assert.equal(candidate, base.replace(before, after),
    "BLOCKED: proposed rules alter modules outside announcements");
  assert(after.includes("approved() && resource.data.audience == 'all'"),
    "BLOCKED: audience guard missing");
  assert(after.includes("request.resource.data.publishAt == request.time"),
    "BLOCKED: immediate publication guard missing");
  return {before, after};
}
function audit(live, base, candidate) {
  const {before, after} = assertOnlyAnnouncementPatch(base, candidate);
  const current = announcementBlock(live);
  assert(current === before || current === after,
    "BLOCKED: active production announcement section differs from both reviewed versions");
  const next = current === after ? live : live.replace(before, after);
  assert.equal(next.replace(after, before), current === after ? live.replace(after, before) : live,
    "BLOCKED: patch reversibility check failed");
  assert.equal(next.slice(0, next.indexOf(FIRST)),
    live.slice(0, live.indexOf(FIRST)), "BLOCKED: unexpected rules prefix change");
  const changed = next !== live;
  return {state: changed ? "REVIEWED_PATCH_NOT_LIVE" : "ALREADY_APPLIED",
    currentRulesHash: fingerprint(live),
    proposedRulesHash: fingerprint(next),
    changesOutsideAnnouncements: false,
    wouldRequireRulesUpdate: changed};
}
function selfTest() {
  const wrap = middle =>
    "service cloud.firestore {\n  match /databases/{database}/documents {\n"
      + FIRST + "\n" + middle + "\n    }\n" + NEXT
      + "\n      allow read: if false;\n    }\n  }\n}\n";
  const base = wrap("allow read: if false;");
  const candidate = wrap("allow read: if approved() && resource.data.audience == 'all';\n"
    + "      allow create: if request.resource.data.publishAt == request.time;");
  assert.equal(audit(base, base, candidate).state, "REVIEWED_PATCH_NOT_LIVE");
  assert.equal(audit(candidate, base, candidate).state, "ALREADY_APPLIED");
  assert.throws(() => audit(wrap("allow read: if true;"), base, candidate), /BLOCKED/);
  assert.throws(() => audit(base, base, candidate.replace("allow read: if false;",
    "allow read: if true;")), /BLOCKED/);
  console.log("PASS: read-only announcement patch proof and drift fail-closed checks");
}
const git = (...args) => cp.execFileSync("git", args,
  {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
async function readOnlyGet(token, path) {
  const resp = await fetch("https://firebaserules.googleapis.com/v1/" + path, {
    method: "GET",
    headers: {Authorization: "Bearer " + token},
    signal: AbortSignal.timeout(15000)
  });
  assert(resp.ok, "BLOCKED: read-only Firestore Rules API GET failed, HTTP " + resp.status);
  return resp.json();
}
async function main() {
  assert.equal(process.env.GITHUB_REPOSITORY, "calibosofroyarjan-volunserve/VolunServe");
  assert.equal(process.env.GITHUB_REF, "refs/heads/live-protected");
  assert.equal(process.env.GITHUB_EVENT_NAME, "push",
    "BLOCKED: protected production credentials are never used for PR or fork runs");

  const markerResponse = await fetch("https://volunserve.com/volunserve-release.json", {
    method: "GET",
    headers: {"Cache-Control": "no-cache"},
    signal: AbortSignal.timeout(15000)
  });
  assert(markerResponse.ok, "BLOCKED: current Hosting revision unavailable");
  const marker = await markerResponse.json();
  assert.equal(marker.app, "VolunServe", "BLOCKED: wrong live app");
  assert.equal(marker.firebaseProject, PROJECT, "BLOCKED: wrong Firebase project");
  assert.equal(marker.revision, LIVE_HOSTING_BASE,
    "BLOCKED: Hosting changed; must audit newly deployed source first");

  const remote = git("ls-remote", "--heads", "origin", RECOVERY_BRANCH)
    .split(/\s+/)[0];
  assert.equal(remote, REVIEWED_RECOVERY,
    "BLOCKED: recovery branch has moved since tested emulator/build");
  const snapshotBranch = "snapshot/hosting-2cd63d-announcements-20261114";
  const snapshotRemote = git("ls-remote", "--heads", "origin", snapshotBranch)
    .split(/\s+/)[0];
  assert.equal(snapshotRemote, LIVE_HOSTING_BASE,
    "BLOCKED: Hosting source snapshot branch unexpectedly moved");
  // Fetch immutable reviewed commits as *data only*, not runnable scripts.
  git("fetch", "--no-tags", "--depth=1", "origin",
    "refs/heads/" + snapshotBranch, "refs/heads/" + RECOVERY_BRANCH);
  const base = git("show", LIVE_HOSTING_BASE + ":firestore.rules");
  const candidate = git("show", REVIEWED_RECOVERY + ":firestore.rules");
  assertOnlyAnnouncementPatch(base, candidate);

  const credential = JSON.parse(
    process.env.VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT || "null");
  assert.equal(credential?.project_id, PROJECT,
    "BLOCKED: protected production read credential missing or wrong project");
  const {cert} = requireFunctions("firebase-admin/app");
  const access = await cert(credential).getAccessToken();
  assert(access.access_token, "BLOCKED: cannot obtain read-only Rules API token");
  const releases = await readOnlyGet(access.access_token,
    "projects/" + PROJECT + "/releases?pageSize=100");
  const release = (releases.releases || []).find(x => x.name === RELEASE_NAME);
  assert(release?.rulesetName, "BLOCKED: active Firestore release unavailable");
  const ruleset = await readOnlyGet(access.access_token, release.rulesetName);
  assert.equal(ruleset.source?.files?.length, 1,
    "BLOCKED: multiple active rules files require manual reconciliation");
  const active = ruleset.source.files[0].content;
  assert.equal(typeof active, "string", "BLOCKED: no active rules source");
  const result = audit(active, base, candidate);
  console.log("PRODUCTION_ANNOUNCEMENT_RULES_AUDIT=" + JSON.stringify({
    project: PROJECT, mode: "READ_ONLY", hostingSource: LIVE_HOSTING_BASE,
    candidate: REVIEWED_RECOVERY, ruleset: release.rulesetName, ...result,
    certificateOrOtherRulesModified: false, rulesPublished: false
  }));
}
if (require.main === module) {
  (process.argv.includes("--self-test") ? Promise.resolve().then(selfTest) : main())
    .catch(error => {
      console.error("ANNOUNCEMENTS_READ_ONLY_AUDIT_BLOCKED: " + error.message);
      process.exitCode = 1;
    });
}
module.exports = {announcementBlock, assertOnlyAnnouncementPatch, audit, selfTest};
