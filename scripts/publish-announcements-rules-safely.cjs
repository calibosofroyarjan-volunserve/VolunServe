"use strict";
/* Fail-closed, announcement-block-only Firestore Rules API release.
 * Requires cloud-platform ADC credentials. INSPECT by default, never deploys
 * unless ANNOUNCEMENTS_RULES_MODE=publish. Leaves unrelated active rules intact.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const cp = require("node:child_process");
const { GoogleAuth } = require("google-auth-library");
const { createHash } = require("node:crypto");
const PROJECT = "volunserve-3aa5b";
const BASE = "2cd63d318ecb6b0dfc52706308e05d0b5806d874";
const RELEASE = "projects/" + PROJECT + "/releases/cloud.firestore";
const API = "https://firebaserules.googleapis.com/v1";
const MODE = process.env.ANNOUNCEMENTS_RULES_MODE || "inspect";
assert(["inspect", "publish"].includes(MODE), "Unsupported rules mode");
const START = "    match /announcements/{announcementId} {";
const END = "    match /identityVerifications/{uid} {";
function block(s) {
  const i = s.indexOf(START), j = s.indexOf(END, i);
  assert(i >= 0 && j > i && s.indexOf(START, i + 1) === -1,
    "Unexpected announcement rules boundary");
  return s.slice(i, j);
}
const oldSource = cp.execFileSync("git", ["show", BASE + ":firestore.rules"], { encoding: "utf8" });
const candidate = fs.readFileSync("firestore.rules", "utf8");
const before = block(oldSource), after = block(candidate);
assert.notEqual(before, after);
assert.equal(candidate, oldSource.replace(before, after),
  "STOP: hotfix changes rules outside announcement section");
assert(after.includes("approved() && resource.data.audience == 'all'"));
assert(after.includes("allow create: if isAdmin()"));
assert(after.includes("request.resource.data.publishAt == request.time"));
const digest = x => createHash("sha256").update(x).digest("hex").slice(0, 16);
async function run() {
  // Never inspect or publish production rules against an outdated Hosting UI.
  // Re-run at action time, not only when the PR was opened. Read-only request.
  const hostingResponse = await fetch("https://volunserve.com/volunserve-release.json", {
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(15000)
  });
  assert(hostingResponse.ok, "STOP: current live Hosting release marker unavailable");
  const hostingRelease = await hostingResponse.json();
  assert.equal(hostingRelease.app, "VolunServe", "STOP: wrong live app");
  assert.equal(hostingRelease.firebaseProject, PROJECT, "STOP: wrong live Firebase project");
  assert.equal(hostingRelease.revision, BASE,
    "STOP: live Hosting changed; reconcile announcement hotfix from current production before any rules publish");
  console.log("PASS: current Hosting revision matches verified production base " + BASE.slice(0, 12));
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const c = await auth.getClient();
  const token = await c.getAccessToken();
  assert(token.token, "Firebase Rules API credentials unavailable");
  async function req(method, path, body) {
    const resp = await fetch(API + path, {
      method,
      headers: { Authorization: "Bearer " + token.token,
        ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000)
    });
    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    if (!resp.ok) throw Error("Rules API " + method + " " + resp.status +
      ": " + String(data.error?.message || "").slice(0, 200));
    return data;
  }
  const activeRelease = await req("GET", "/" + RELEASE);
  assert.equal(activeRelease.name, RELEASE);
  assert.match(activeRelease.rulesetName,
    /^projects\/volunserve-3aa5b\/rulesets\/[A-Za-z0-9_-]+$/);
  const activeRuleset = await req("GET", "/" + activeRelease.rulesetName);
  assert.equal(activeRuleset.source?.files?.length, 1,
    "STOP: unexpected active Firestore ruleset file count");
  const active = activeRuleset.source.files[0].content;
  assert.equal(typeof active, "string");
  if (block(active) === after) {
    console.log("PASS: announcement rules already applied; no release needed.");
    return;
  }
  assert.equal(block(active), before,
    "STOP: live announcement section has changed since verified base");
  const next = active.replace(before, after);
  assert.equal(next.replace(after, before), active,
    "STOP: attempted change outside announcements");
  console.log("PASS: unrelated active rules remain unchanged. Current: " + digest(active));
  console.log("Candidate: " + digest(next));
  console.log("PREVIOUS_RULESET=" + activeRelease.rulesetName);
  if (MODE !== "publish") return;
  const created = await req("POST", "/projects/" + PROJECT + "/rulesets", {
    source: { files: [{ name: activeRuleset.source.files[0].name || "firestore.rules", content: next }] }
  });
  assert.match(created.name,
    /^projects\/volunserve-3aa5b\/rulesets\/[A-Za-z0-9_-]+$/);
  const unchanged = await req("GET", "/" + RELEASE);
  assert.equal(unchanged.rulesetName, activeRelease.rulesetName,
    "STOP: active rules release changed before update");
  const currentRules = await req("GET", "/" + unchanged.rulesetName);
  assert.equal(currentRules.source?.files?.[0]?.content, active,
    "STOP: rules changed during release preparation");
  const updated = await req("PATCH", "/" + RELEASE, {
    release: { name: RELEASE, rulesetName: created.name },
    updateMask: "rulesetName"
  });
  assert.equal(updated.rulesetName, created.name, "Rules release mismatch");
  const verify = await req("GET", "/" + created.name);
  const latest = await req("GET", "/" + RELEASE);
  assert.equal(latest.rulesetName, created.name);
  assert.equal(verify.source?.files?.[0]?.content, next);
  console.log("SUCCESS: only announcements rules released; rollback ruleset: " +
    activeRelease.rulesetName);
}
run().catch(e => {
  console.error("ANNOUNCEMENTS RULES RELEASE BLOCKED: " + e.message);
  process.exitCode = 1;
});
