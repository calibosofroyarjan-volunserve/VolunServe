#!/usr/bin/env node
"use strict";
/**
 * VolunServe production release provenance gate. READ ONLY.
 * Never publishes, modifies Firebase, or starts a Render deployment.
 *
 * Usage: node scripts/guard-live-deploy-provenance-20261108.cjs --self-test
 *        APPROVED_FILES='["app/(tabs)/_layout.tsx"]' \
 *        CANDIDATE_SHA=<40-hex-commit> \
 *        node scripts/guard-live-deploy-provenance-20261108.cjs --check
 *
 * Requires a working Git checkout, history containing live revision, and
 * HTTPS access to the live release manifest.
 */
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const LIVE_URL = "https://volunserve.com/volunserve-release.json";
function git(...args) {
 return cp.execFileSync("git", args, {encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
}
function revision(value) {
 assert.match(value || "", /^[a-f0-9]{40}$/, "BLOCKED: invalid SHA");
 return value;
}
function changedPaths(base, head) {
 return git("diff","--name-only","--no-renames",base,head).split("\n").filter(Boolean).sort();
}
function review({live, candidate, allowed, files, descends, status}) {
 revision(live); revision(candidate);
 assert.ok(descends, "BLOCKED: candidate does not descend from exact deployed live revision");
 assert.ok(allowed.length > 0, "BLOCKED: empty approved change manifest");
 assert.ok(new Set(allowed).size === allowed.length,"BLOCKED: duplicate approved file");
 assert.ok(allowed.every(p=>typeof p==="string"&&p.length>0&&!p.startsWith("/")&&!p.includes("..")),
   "BLOCKED: unsafe path in approval manifest");
 const dangerous = /(^|\/)(firebase\.json|\.firebaserc|firestore\.rules|storage\.rules|\.env[^/]*|package-lock\.json)$|^(backend|functions|identity-ai|\.github\/workflows)\//;
 assert.ok(!files.some(p=>dangerous.test(p)), "BLOCKED: config, rules, backend or deploy workflows need a separate reviewed release gate");
 assert.ok(status.every(s=>s[0]==="M"||s[0]==="A"), "BLOCKED: delete, rename, type change or untracked status");
 assert.deepEqual(files, [...allowed].sort(),
   "BLOCKED: source changes are not exactly the approved files");
 return {live, candidate, files};
}
async function check() {
 const candidate=revision(process.env.CANDIDATE_SHA || "");
 const allowed=JSON.parse(process.env.APPROVED_FILES || "[]");
 assert.ok(Array.isArray(allowed),"BLOCKED: APPROVED_FILES must be JSON array");
 const controller=new AbortController();
 const id=setTimeout(()=>controller.abort(),12000);
 let response;
 try {
  response=await fetch(LIVE_URL,{signal:controller.signal,redirect:"error",headers:{"Cache-Control":"no-cache"}});
 } finally {clearTimeout(id);}
 assert.ok(response.ok,"BLOCKED: cannot verify exact live release manifest");
 const release=await response.json();
 assert.equal(release.app,"VolunServe","BLOCKED: unexpected application");
 assert.equal(release.firebaseProject,"volunserve-3aa5b","BLOCKED: unexpected Firebase project");
 const live=revision(release.revision);
 assert.equal(git("rev-parse",candidate),candidate,"BLOCKED: unknown candidate commit");
 assert.equal(git("rev-parse",live),live,"BLOCKED: live commit missing; fetch history first");
 let descends=false;
 try {git("merge-base","--is-ancestor",live,candidate);descends=true;} catch {}
 const files=changedPaths(live,candidate);
 const names=git("diff","--name-status","--no-renames",live,candidate)
  .split("\n").filter(Boolean).map(s=>s.split("\t")[0]);
 const result=review({live,candidate,allowed,files,descends,status:names});
 console.log("PASS: source candidate is a descendant of EXACT live website revision.");
 console.log("PASS: only explicitly approved files changed:", result.files.join(", "));
 console.log("READ ONLY: No deployment was performed.");
}
function selfTest() {
 const a="a".repeat(40),b="b".repeat(40);
 const base={live:a,candidate:b,allowed:["app/(tabs)/_layout.tsx"],files:["app/(tabs)/_layout.tsx"],descends:true,status:["M"]};
 assert.equal(review(base).live,a);
 for(const bad of [
  {descends:false}, {files:["app/login.tsx"]}, {status:["D"]},
  {files:["firebase.json"],allowed:["firebase.json"]},
  {files:["backend/server.js"],allowed:["backend/server.js"]},
  {files:[".github/workflows/deploy.yml"],allowed:[".github/workflows/deploy.yml"]},
  {allowed:[]},
 ]) assert.throws(()=>review({...base,...bad}),/BLOCKED:/);
 console.log("PASS: live revision gate rejects stale ancestry, unapproved edits, deletion and critical config paths.");
}
if (require.main===module) {
 (process.argv.includes("--self-test") ? Promise.resolve().then(selfTest) :
  process.argv.includes("--check") ? check() :
  Promise.reject(Error("Use --self-test or --check")))
  .catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={review};
