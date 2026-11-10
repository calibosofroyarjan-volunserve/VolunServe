"use strict";
/**
 * Verification of PRECISE, previously reviewed Firebase Rules helper
 * localization; all permission expressions and all match paths untouched.
 * Test only; never connects to production Firebase.
 */
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const cp=require("node:child_process");
const sha256=s=>crypto.createHash("sha256").update(s).digest("hex");
const git=(...args)=>cp.execFileSync("git",args,{encoding:"utf8"}).trim();

const originalCommit="1d244dc31ecd997497dfa15df7b4b6acef996b5c";
const originalHash="672379f29797c323242549038ae3e3cc0985739a2c99c074c087ea07c44de13c";
const optimizedHash="f35b59d4c7cca0b16b72cd5c4c86fb9671ea044cea28efbd997b4553109dbcd1";
const original=cp.execFileSync("git",["show",originalCommit+":firestore.rules"],{encoding:"utf8"});
const optimized=fs.readFileSync("firestore.rules","utf8");
assert.equal(sha256(original),originalHash,"BLOCKED: reviewed PR #405 source changed");
assert.equal(sha256(optimized),optimizedHash,"BLOCKED: optimized file changed without review");
assert.equal(git("merge-base",originalCommit,"HEAD"),originalCommit,
  "BLOCKED: candidate does not descend from approved live-derived PR #405");

const nameTargets={
  isVerifiedResident:["volunteerApplications/{uid}","assistanceRequests/{requestId}"],
  hasVerifiedIdentity:["users/{uid}","volunteerApplications/{uid}",
    "assistanceRequests/{requestId}","responseAssignments/{assignmentId}"],
  isLguPersonnel:["lguDutyStatus/{uid}","lguAttendance/{attendanceId}",
    "lguAssignments/{assignmentId}","disasterCases/{caseId}",
    "lguResponseLocations/{caseId}","residentResponseLocations/{uid}"]
};
function rootBlock(s,name){
  const re=new RegExp("^      function "+name+"\\([^\\n]*\\) \\{","m");
  const m=re.exec(s);
  assert(m,"BLOCKED: required original root helper missing "+name);
  const start=m.index,open=s.indexOf("{",start);let depth=0,end=-1;
  for(let i=open;i<s.length;i++){
    if(s[i]==="{")depth++;
    if(s[i]==="}"&&--depth===0){end=i+1;break;}
  }
  assert(end>start,"BLOCKED: failed to extract "+name);
  const body=s.slice(start,end);
  assert.equal(s.split(body+"\n").length,2,"BLOCKED: original helper not unique");
  return body;
}
const blocks={};
for(const name of Object.keys(nameTargets)) blocks[name]=rootBlock(original,name);
let expected=original;
for(const name of ["hasVerifiedIdentity","isVerifiedResident","isLguPersonnel"]){
  expected=expected.replace(blocks[name]+"\n","");
}
const oldComment="    // Exact shared validation predicates hoisted from identical match-local helpers.\n";
assert.equal(expected.split(oldComment).length,2);
expected=expected.replace(oldComment,"");
for(const [name,paths] of Object.entries(nameTargets)){
  for(const path of paths){
    const marker="    match /"+path+" {";
    assert.equal(expected.split(marker).length,2,"BLOCKED: expected match exactly once "+path);
    expected=expected.replace(marker,()=>marker+"\n"+blocks[name]);
  }
}
assert.equal(optimized,expected,
  "BLOCKED: arbitrary Rules changes detected; ONLY exact function-scope moves are allowed");
const root=optimized.slice(0,optimized.indexOf("    match /users/{uid} {"));
for(const name of Object.keys(nameTargets)){
  assert(!root.includes("function "+name+"("),"BLOCKED: inherited helper not actually localized");
}
assert(optimized.includes("function blockedTempMailOrgAlias(email)"));
assert(optimized.includes("&& !blockedTempMailOrgAlias(request.resource.data.email)"));
assert(optimized.includes("&& permittedNewResidentEmail()"));
assert(optimized.includes("&& permittedNewApplicantEmail()"));
assert(optimized.includes("match /volunteerInvitations/{invitationId}"));

const allowedFiles=new Set([
 "firestore.rules",
 "scripts/test-resident-field-validation.cjs",
 "scripts/test-lgu-admin-rules.cjs",
 "scripts/test-live-emergency-map-rules.cjs",
 "scripts/test-localized-live-rules-provenance-20261111.cjs",
 ".github/workflows/verify-localized-live-rules-no-deploy-20261111.yml",
]);
const changed=git("diff","--name-status","--no-renames",originalCommit,"HEAD")
 .split("\n").filter(Boolean).map(row=>row.split("\t"));
assert.equal(changed.length,allowedFiles.size,"BLOCKED: wrong scoped diff size");
for(const [status,path] of changed){
  assert(["A","M"].includes(status),"BLOCKED: destructive file change");
  assert(allowedFiles.has(path),"BLOCKED: unreviewed file "+path);
}
console.log("PASS: previous LIVE-derived candidate hash "+originalHash);
console.log("PASS: reviewed optimized candidate hash "+optimizedHash);
console.log("PASS: only THREE original helper bodies moved to 12 scoped match blocks");
console.log("PASS: identical rule predicates, all existing match blocks, temp-email filter, and signup gates");
console.log("PASS: no unrelated source, backend, functions or deployment workflow edits");
console.log("NO DEPLOY: compiled executable size remains unverified until approved production compile validation");
