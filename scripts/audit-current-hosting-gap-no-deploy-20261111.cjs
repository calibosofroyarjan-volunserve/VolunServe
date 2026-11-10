#!/usr/bin/env node
"use strict";
/**
 * Read-only release-gap report. This is NOT a permission to merge, deploy
 * or waive the existing protected Hosting source-vs-live gate.
 */
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");

const EXPECTED_PUBLISHED_SHA="1a049274a0747257cb31c0deceb21c67661127e6";
const EXPECTED_PROTECTED_SHA="28a7a7490fb90b1205c963b474fc817f07312b03";
const EXPECTED_PROJECT="volunserve-3aa5b";
const EXPECTED_FILES = new Set([
  ".github/workflows/verify-reconciled-hosting-source-no-deploy-20261111.yml",
  "functions/registrationEmailScreening.js",
  "lib/registrationEmailPolicy.ts",
  "scripts/test-signup-abuse-controls.cjs",
  "scripts/test-signup-prod.cjs"
]);
const SKIPPED_RUNTIME_FILES = new Set([
  ".github/workflows/verify-reconciled-hosting-source-no-deploy-20261111.yml",
  "functions/registrationEmailScreening.js"
]);
const git=(...args)=>cp.execFileSync("git",args,{encoding:"utf8"}).trim();
const approvedCriticalPaths=[
  "backend/server.js", "backend/lguCredentialRoutes.js",
  "firestore.rules", "storage.rules", "firebase.json", ".firebaserc",
  "functions/index.js", "functions/registrationBlocking.js",
  "functions/package.json", "package.json", "package-lock.json",
  "app.json", "lib/firebase.ts", "scripts/guard-live-protected-release.cjs",
  ".github/workflows/release-live-protected-hosting.yml",
  ".github/workflows/auto-publish-protected-live-hosting.yml"
];
async function audit(){
  // Check only, no branch or deployed release mutation.
  assert.equal(git("merge-base",EXPECTED_PUBLISHED_SHA,EXPECTED_PROTECTED_SHA),
    EXPECTED_PUBLISHED_SHA,
    "BLOCKED: protected source does not descend from current published source");
  const diffs=git("diff","--name-status","--no-renames",
    EXPECTED_PUBLISHED_SHA,EXPECTED_PROTECTED_SHA).split("\n")
      .filter(Boolean).map(s=>s.split("\t"));
  assert.equal(diffs.length,EXPECTED_FILES.size,
    "BLOCKED: unexpected protected source change count");
  for(const [status,p] of diffs){
    assert(["A","M"].includes(status),"BLOCKED: destructive change detected");
    assert(EXPECTED_FILES.has(p),"BLOCKED: unreviewed protected-only change "+p);
  }
  for(const p of approvedCriticalPaths){
    assert.equal(git("rev-parse",EXPECTED_PUBLISHED_SHA+":"+p),
      git("rev-parse",EXPECTED_PROTECTED_SHA+":"+p),
      "BLOCKED: production critical source changed "+p);
  }
  const candidatePolicy=git("show",EXPECTED_PROTECTED_SHA+":lib/registrationEmailPolicy.ts");
  const deployedPolicy=git("show",EXPECTED_PUBLISHED_SHA+":lib/registrationEmailPolicy.ts");
  assert(candidatePolicy.includes('"ruutukf.co"'),
    "BLOCKED: expected protected-only temporary mailbox guard disappeared");
  assert(!deployedPolicy.includes('"ruutukf.co"'),
    "BLOCKED: temporary mailbox guard is already in published source; review drift again");

  const response=await fetch("https://volunserve.com/volunserve-release.json",{
    headers:{"Cache-Control":"no-cache"},
    signal:AbortSignal.timeout(20000)
  });
  assert.equal(response.status,200,"BLOCKED: live Hosting release marker unavailable");
  const marker=await response.json();
  assert.equal(marker.app,"VolunServe");
  assert.equal(marker.firebaseProject,EXPECTED_PROJECT);
  assert.equal(marker.revision,EXPECTED_PUBLISHED_SHA,
    "BLOCKED: active published source moved; repeat reconciliation first");

  console.log(JSON.stringify({
    audit:"READ_ONLY_HOSTING_RELEASE_RECONCILIATION",
    status:"AUDITED_BUT_NOT_DEPLOYABLE",
    published:EXPECTED_PUBLISHED_SHA,
    protected:EXPECTED_PROTECTED_SHA,
    protectedAheadOfPublished:true,
    reviewedChanges:diffs.map(([status,path])=>({
      status,path,hostingOnlyCandidate:!SKIPPED_RUNTIME_FILES.has(path)
    })),
    criticalRuntimeOrProductionPolicyChanged:false,
    productionHostingChanged:false,
    firebaseRulesChanged:false,
    reason:"Full protected source contains one staged Firebase Functions file and one CI workflow delta. Existing protected release guard must still block a Hosting-only deployment of those files. Do not bypass guard; split and review release source.",
    next:"Review a site-derived Hosting-only candidate and a separate trusted no-deploy Firebase compiler workflow. Never merge/release the entire protected history without explicit file-level approval."
  },null,2));
}
if(require.main===module){
  audit().catch(e=>{console.error(String(e?.message||e));process.exitCode=1});
}
