#!/usr/bin/env node
"use strict";
/**
 * Protected, COMPILE-ONLY validation of the exact live Firestore Rules + three
 * reviewed signup insertions. No releases, rulesets or Firebase data are written.
 * Only run with a trusted GitHub production environment credential on the
 * protected live-protected branch; never on a PR or a staging branch.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const cp = require("node:child_process");
const path = require("node:path");
const {createRequire} = require("node:module");
const reqFns = createRequire(path.resolve(__dirname, "../functions/package.json"));

const REPO = "calibosofroyarjan-volunserve/VolunServe";
const PROJECT = "volunserve-3aa5b";
const PUBLISHED_SITE_SHA = "1a049274a0747257cb31c0deceb21c67661127e6";
const EXPECTED_ACTIVE_SHA = "b4e67103503213bec28671f2dc2ab0440edd4e38a2ffd9d6ad6d2f93ccb9a269";
const EXPECTED_CANDIDATE_SHA = "672379f29797c323242549038ae3e3cc0985739a2c99c074c087ea07c44de13c";
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
const BASE = "https://firebaserules.googleapis.com/v1/";
function replaceExactlyOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, "BLOCKED: unsafe Rules patch anchor");
  return source.replace(before, () => after);
}
function applyReviewedInsertions(source) {
  const helper = [
    "      // STAGED ONLY: new community user profiles accept verified Yahoo or",
    "      // Google-authenticated Gmail, not receive-only shared Gmail inboxes.",
    "      // Existing users, reads, role updates and other modules are unchanged.",
    "      function permittedNewResidentEmail() {",
    "        let e = request.resource.data.email;",
    "        let provider = request.auth.token.get('firebase', {}).get('sign_in_provider', '');",
    "        return e is string && (",
    "          (e.matches('^[^@+]+@(gmail[.]com|googlemail[.]com)$')",
    "            && provider == 'google.com')",
    "          || e.matches('^[^@]+@(yahoo[.]com|yahoo[.]com[.]ph|yahoo[.]co[.]uk)$')",
    "        );",
    "      }",
    "      // The LGU applicant form currently supports Yahoo/password only.",
    "      function permittedNewApplicantEmail() {",
    "        let e = request.resource.data.email;",
    "        return e is string",
    "          && e.matches('^[^@]+@(yahoo[.]com|yahoo[.]com[.]ph|yahoo[.]co[.]uk)$');",
    "      }",
    "",
  ].join("\n");
  let candidate = replaceExactlyOnce(source,
    "      // Firestore creation must enforce the same required inputs as the wizard.",
    helper + "      // Firestore creation must enforce the same required inputs as the wizard.");
  candidate = replaceExactlyOnce(candidate,
    '        && request.auth.token.get("email", "") == request.resource.data.email\n' +
      '        && validInitialResidentInputs()',
    '        && request.auth.token.get("email", "") == request.resource.data.email\n' +
      '        && permittedNewResidentEmail()\n' +
      '        && validInitialResidentInputs()');
  candidate = replaceExactlyOnce(candidate,
    "        && request.auth.token.get('email', '') == request.resource.data.email\n" +
      "        && request.resource.data.keys().hasOnly([",
    "        && request.auth.token.get('email', '') == request.resource.data.email\n" +
      "        && permittedNewApplicantEmail()\n" +
      "        && request.resource.data.keys().hasOnly([");
  return candidate;
}
function selfTest() {
  const fixture = [
    "      // Firestore creation must enforce the same required inputs as the wizard.",
    "        && request.auth.token.get(\"email\", \"\") == request.resource.data.email",
    "        && validInitialResidentInputs()",
    "        && request.auth.token.get('email', '') == request.resource.data.email",
    "        && request.resource.data.keys().hasOnly([",
  ].join("\n");
  const candidate=applyReviewedInsertions(fixture);
  assert(candidate.includes("function permittedNewResidentEmail()"));
  assert(candidate.includes("&& permittedNewResidentEmail()"));
  assert(candidate.includes("&& permittedNewApplicantEmail()"));
  assert.throws(()=>applyReviewedInsertions(candidate), /BLOCKED/);
  assert.equal(Buffer.byteLength(candidate)>Buffer.byteLength(fixture), true);
  console.log("PASS offline: exact three-insertion patch and fail-closed anchors");
}

async function main() {
  if(process.argv.includes("--self-test")) { selfTest(); return; }
  assert.equal(process.argv[2], "--compile-only", "BLOCKED: only --compile-only supported");
  assert.equal(process.env.GITHUB_REPOSITORY, REPO);
  assert.equal(process.env.GITHUB_REF, "refs/heads/live-protected");
  assert.equal(process.env.GITHUB_EVENT_NAME, "workflow_dispatch",
    "BLOCKED: production compile must be manually approved");
  assert.equal(process.env.GITHUB_SHA,
    cp.execFileSync("git", ["rev-parse","HEAD"], {encoding:"utf8"}).trim());
  const current = cp.execFileSync("git", ["ls-remote","--heads","origin","live-protected"],
    {encoding:"utf8"}).trim().split(/\s+/)[0];
  assert.equal(current, process.env.GITHUB_SHA, "BLOCKED: stale protected workflow");
  const {cert} = reqFns("firebase-admin/app");
  const credential = JSON.parse(process.env.VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT || "null");
  assert.equal(credential?.project_id, PROJECT, "BLOCKED: wrong production credential");
  const access = await cert(credential).getAccessToken();
  assert(access.access_token, "BLOCKED: missing read-only token");
  const headers = {Authorization:"Bearer " + access.access_token};
  async function getJson(p) {
    const r=await fetch(BASE+p,{headers,signal:AbortSignal.timeout(25000)});
    assert(r.ok,"BLOCKED: read-only Firebase Rules API HTTP "+r.status);
    return r.json();
  }
  // A stale published Hosting source or changed active Rules invalidates review.
  const site=await fetch("https://volunserve.com/volunserve-release.json",{
    headers:{"Cache-Control":"no-cache"}, signal:AbortSignal.timeout(20000)});
  assert(site.ok,"BLOCKED: cannot read live website marker");
  const marker=await site.json();
  assert.equal(marker.app,"VolunServe");
  assert.equal(marker.firebaseProject,PROJECT);
  assert.equal(marker.revision,PUBLISHED_SITE_SHA,
    "BLOCKED: published Hosting source changed; re-review candidate first");

  const releases=await getJson("projects/"+PROJECT+"/releases?pageSize=100");
  const firestore=(releases.releases||[]).find(r=>r.name==="projects/"+PROJECT+"/releases/cloud.firestore");
  assert(firestore?.rulesetName,"BLOCKED: active Rules release not found");
  const currentRuleset=await getJson(firestore.rulesetName);
  assert.equal(currentRuleset.source?.files?.length,1,
    "BLOCKED: multiple active Rules files; patch has not been reviewed");
  const active=currentRuleset.source.files[0].content;
  assert.equal(sha256(active),EXPECTED_ACTIVE_SHA,
    "BLOCKED: live Rules source changed; do not compile stale candidate");

  const candidate=applyReviewedInsertions(active);
  assert.equal(sha256(candidate),EXPECTED_CANDIDATE_SHA,
    "BLOCKED: candidate differs from exact reviewed PR #405");
  assert(candidate.includes("function blockedTempMailOrgAlias(email)"),
    "BLOCKED: existing temp mail filter missing");
  const bytes=Buffer.byteLength(candidate,"utf8");
  assert(bytes<=256*1024,"BLOCKED: Firestore Rules text exceeds 256 KiB source limit");
  const response=await fetch(BASE+"projects/"+PROJECT+":test",{
    method:"POST",
    headers:{...headers,"Content-Type":"application/json"},
    body:JSON.stringify({
      source:{files:[{name:"firestore.rules",content:candidate}]},
      testSuite:{testCases:[]},
    }),
    signal:AbortSignal.timeout(45000),
  });
  const result=await response.json().catch(()=>({}));
  assert(response.ok,
    "BLOCKED: source-only Firebase projects.test preflight HTTP "+response.status+
    " "+String(result?.error?.message||"").slice(0,220));
  const errors=(result.issues||[]).filter(i=>i.severity==="ERROR");
  assert.equal(errors.length,0,
    "BLOCKED: Firebase Rules API reported compilation/semantic errors: "+
    JSON.stringify(errors.slice(0,3)).slice(0,500));
  console.log(JSON.stringify({
    mode:"PROTECTED_SOURCE_ONLY_COMPILE_NO_DEPLOY",
    project:PROJECT, liveSourceSHA256:EXPECTED_ACTIVE_SHA,
    candidateSHA256:EXPECTED_CANDIDATE_SHA,
    sourceBytes:bytes, sourceLimitBytes:256*1024,
    errors:0, warningCount:(result.issues||[]).filter(i=>i.severity==="WARNING").length,
    productionRulesChanged:false, authDataChanged:false,
    compiledExecutableSizeGuaranteed:false,
    note:"projects.test validates source, but does not guarantee final publish-time 250 KB compiled executable limit.",
  },null,2));
}
main().catch(err=>{console.error(String(err?.message||err));process.exitCode=1;});
