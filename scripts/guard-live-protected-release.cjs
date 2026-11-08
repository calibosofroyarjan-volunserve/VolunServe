#!/usr/bin/env node
"use strict";
/*
 * Live-first, FAIL-CLOSED Firebase Hosting-only release guard.
 * Never deploys; rejects stale main, unknown file changes, destructive changes,
 * and any unverified live Hosting revision.
 */
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const INITIAL_LIVE = "e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4";
const LOCKED_POLICY_COMMIT = "2c6757c57ff2f7cf3c584a346cfcd02aac1ceac0";
const LIVE_URL = "https://volunserve.com/volunserve-release.json";
const REQUIRED_REF = "refs/heads/live-protected";
// Pin reviewed Hosting-only automation as release POLICY, not application code.
// Introduced after LOCKED_POLICY_COMMIT, so it has a separate exact blob check.
const AUTO_HOSTING_POLICY = ".github/workflows/auto-publish-protected-live-hosting.yml";
const AUTO_HOSTING_POLICY_BLOB = "528be167478b07dd6aba4e31c62f75b5a4b23474";
const FROZEN = [
"deploy-verified-dialog-hotfix.yml",
"emergency-facility-scoped-production.yml",
"provision-announcements-index-manual.yml",
"release-admin-navigation-20261106.yml",
"release-community-volunteer-roster-20261106.yml",
"release-donation-checkout-20261106.yml",
"release-firestore-rules-only-safe.yml",
"release-live-announcement-validation-20261106.yml",
"release-notification-bell-live-20261106.yml",
"release-reconciled-admin-live-20261106.yml",
"release-remove-lgu-emergency-live-20261106.yml",
"release-unified-login-signup-20261106.yml",
"release-volunteer-attendance-hours-20261106.yml",
"release-volunteer-certificates-from-live-20261106.yml",
"release-volunteer-event-join-20261106.yml",
"release-volunteer-time-buttons-after-emergency-20261106.yml"
].map(p => ".github/workflows/" + p);
const POLICY = [
...FROZEN,
".github/workflows/validate-community-events-permissions.yml",
".github/workflows/release-live-protected-hosting.yml",
".github/workflows/verify-live-protected-source.yml",
"scripts/guard-live-protected-release.cjs",
AUTO_HOSTING_POLICY,
"docs/LIVE_PROTECTED_DEPLOYMENT.md"
];
const POLICY_SET = new Set(POLICY);
function git(...args) {
  return cp.execFileSync("git", args, {encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
}
function sha(s) { assert.match(s || "", /^[a-f0-9]{40}$/, "BLOCKED: expected full 40-char Git SHA"); return s; }
function ancestor(a,b) {
  try { git("merge-base","--is-ancestor",a,b);return true; } catch {return false;}
}
function verifyCurrentProtectedBranch(candidate, remoteHead) {
  sha(candidate);
  sha(remoteHead);
  assert.equal(remoteHead,candidate,
    "BLOCKED: newer live-protected commit exists; refusing a stale queued release");
}
function changed(base, head) {
  const out=git("diff","--name-status","--no-renames",base,head);
  return out ? out.split("\n").map(s=>{const [status,path]=s.split("\t");return {status,path};}) : [];
}
function validate({live,candidate,expected,branch,approved,changes,ancestral,hasInitial}) {
  sha(live);sha(candidate);sha(expected);
  assert.equal(live,expected,"BLOCKED: live changed since operator verified it");
  assert.equal(branch,REQUIRED_REF,"BLOCKED: outdated main or unapproved branch");
  assert.ok(ancestral,"BLOCKED: candidate DOES NOT descend from current live revision");
  assert.ok(hasInitial,"BLOCKED: candidate is unrelated to verified initial live baseline");
  assert.ok(Array.isArray(approved) && approved.length>0,"BLOCKED: no approved application files");
  assert.ok(new Set(approved).size===approved.length,"BLOCKED: duplicate approved file");
  assert.ok(approved.every(p=>typeof p==="string" && p.length>0 && !p.startsWith("/") &&
    !p.includes("..") && !p.includes("\\") && !POLICY_SET.has(p)),"BLOCKED: invalid or policy file approval");
  const critical=/^(backend|functions|identity-ai|\.github|\.firebase)\//;
  const criticalFile=/^(firebase\.json|\.firebaserc|firestore\.rules|firestore\.indexes\.json|storage\.rules|package(-lock)?\.json|app\.json|\.env[^/]*)$/;
  assert.ok(!approved.some(p=>critical.test(p)||criticalFile.test(p)),
    "BLOCKED: backend, Firebase, credentials, dependencies or workflow edits need separate release");
  assert.ok(changes.every(({status})=>status==="A"||status==="M"),
    "BLOCKED: deleted, renamed, or type-changed file");
  const appChanged=changes.filter(x=>!POLICY_SET.has(x.path)).map(x=>x.path).sort();
  assert.deepEqual(appChanged,[...approved].sort(),"BLOCKED: changed application files differ from explicit approval");
  assert.ok(changes.every(x=>POLICY_SET.has(x.path) || !(critical.test(x.path)||criticalFile.test(x.path))),
    "BLOCKED: unreviewed critical file change");
}
function checkPolicyFiles() {
  assert.ok(ancestor(LOCKED_POLICY_COMMIT, git("rev-parse","HEAD")),
    "BLOCKED: release has not descended from verified live-protected safety checkpoint");
  assert.equal(git("rev-parse", "HEAD:"+AUTO_HOSTING_POLICY), AUTO_HOSTING_POLICY_BLOB,
    "BLOCKED: auto Hosting workflow changed since reviewed policy; separate release review required");
  for (const path of POLICY.filter(p=>p!=="scripts/guard-live-protected-release.cjs" && p!==AUTO_HOSTING_POLICY)) {
    assert.equal(git("rev-parse", "HEAD:"+path), git("rev-parse", LOCKED_POLICY_COMMIT+":"+path),
      "BLOCKED: frozen production safety policy file changed: "+path);
  }
  for (const path of FROZEN) {
    const value=fs.readFileSync(path,"utf8");
    assert.ok(value.includes("if: \${{ false }}"),"BLOCKED: historic release unfrozen: "+path);
    assert.ok(!/firebase deploy|action-hosting-deploy|secrets\.|gcloud|render\.com\/deploy/i.test(value),
      "BLOCKED: historic release contains production action/credential: "+path);
  }
  const valid=fs.readFileSync(".github/workflows/validate-community-events-permissions.yml","utf8");
  assert.ok(!/secrets\.|firebase deploy|action-hosting-deploy/i.test(valid),
    "BLOCKED: community validation unexpectedly has deployment access");
  const release=fs.readFileSync(".github/workflows/release-live-protected-hosting.yml","utf8");
  assert.ok(release.includes("workflow_dispatch:") &&
    release.includes("environment: production") &&
    release.includes("secrets.VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT") &&
    !release.includes("secrets.FIREBASE_SERVICE_ACCOUNT_VOLUNSERVE_3AA5B"),
    "BLOCKED: release policy is missing production-only credentials or manual control");
}
async function check() {
  const candidate=sha(process.env.CANDIDATE_SHA || process.env.GITHUB_SHA);
  const expected=sha(process.env.EXPECTED_LIVE_SHA);
  const approved=JSON.parse(process.env.APPROVED_FILES || "[]");
  assert.equal(process.env.GITHUB_SHA,candidate,"BLOCKED: runner is not building exact expected candidate");
  assert.equal(process.env.GITHUB_REF,REQUIRED_REF,"BLOCKED: release must come from live-protected, not main");
  assert.equal(process.env.GITHUB_REPOSITORY,"calibosofroyarjan-volunserve/VolunServe",
    "BLOCKED: not the approved VolunServe repository");
  const abort=AbortSignal.timeout(12000);
  const resp=await fetch(LIVE_URL,{headers:{"Cache-Control":"no-cache","Accept":"application/json"},signal:abort,redirect:"error"});
  assert.ok(resp.ok,"BLOCKED: failed to read production Hosting release marker");
  const marker=await resp.json();
  assert.equal(marker.app,"VolunServe","BLOCKED: release marker application mismatch");
  assert.equal(marker.firebaseProject,"volunserve-3aa5b","BLOCKED: wrong Firebase project");
  const live=sha(marker.revision);
  assert.equal(git("rev-parse",candidate),candidate,"BLOCKED: unknown candidate");
  // Do not publish an older queued commit if the approved source branch advanced.
  // This read-only remote check is intentionally fail-closed.
  const remoteHead=git("ls-remote","--heads","origin","live-protected").trim().split(/\s+/)[0];
  verifyCurrentProtectedBranch(candidate,remoteHead);
  assert.equal(git("rev-parse",live),live,"BLOCKED: live commit missing from full Git checkout");
  assert.equal(git("rev-parse",INITIAL_LIVE),INITIAL_LIVE,"BLOCKED: initial live revision missing");
  const changes=changed(live,candidate);
  validate({live,candidate,expected,branch:process.env.GITHUB_REF,approved,changes,
    ancestral:ancestor(live,candidate),hasInitial:ancestor(INITIAL_LIVE,candidate)});
  checkPolicyFiles();
  console.log("PASS: exact current production SHA verified: "+live);
  console.log("PASS: candidate descends from live and is NOT outdated main");
  console.log("PASS: all 16 historic production actions frozen");
  console.log("PASS: only expressly approved application changes: "+approved.join(", "));
  console.log("READ ONLY: release gate did not deploy anything");
}
function selfTest() {
  const a="a".repeat(40),b="b".repeat(40);
  const base={live:a,candidate:b,expected:a,branch:REQUIRED_REF,approved:["app/login.web.tsx"],
    changes:[{status:"M",path:"app/login.web.tsx"},
    {status:"M",path:".github/workflows/release-live-protected-hosting.yml"}],
    ancestral:true,hasInitial:true};
  validate(base);
  verifyCurrentProtectedBranch(b,b);
  assert.throws(()=>verifyCurrentProtectedBranch(b,a),
    /BLOCKED: newer live-protected commit exists/);
  for (const patch of [
    {branch:"refs/heads/main"},
    {ancestral:false},{hasInitial:false},{expected:b},
    {approved:["app/signup.tsx"]},{approved:[]},{approved:["backend/server.js"]},
    {approved:["firebase.json"]},{approved:[".github/workflows/other.yml"]},
    {approved:[AUTO_HOSTING_POLICY]},
    {changes:[{status:"D",path:"app/login.web.tsx"}]},
    {changes:[{status:"M",path:"app/login.web.tsx"},{status:"M",path:"backend/server.js"}]},
    {changes:[{status:"M",path:"app/login.web.tsx"},{status:"M",path:".github/workflows/unknown.yml"}]},
    {changes:[{status:"M",path:"app/login.web.tsx"},{status:"M",path:"firestore.rules"}]}
  ]) assert.throws(()=>validate({...base,...patch}),/BLOCKED:/);
  checkPolicyFiles();
  console.log("PASS: blocks outdated main, changed queued branch head, stale source, unsafe modules, unapproved files, deletion");
}
if(require.main===module){
 (process.argv.includes("--self-test")?Promise.resolve().then(selfTest):
  process.argv.includes("--check")?check():Promise.reject(Error("Specify --self-test or --check")))
  .catch(e=>{console.error(e.message);process.exitCode=1});
}
