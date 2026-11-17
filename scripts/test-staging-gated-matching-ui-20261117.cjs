#!/usr/bin/env node
"use strict";
/**
 * Test that the only changes to existing live-derived UI are additive
 * staging-gated preview lines. No deleted or rewritten existing source lines,
 * Firestore policy edits, backend registration or live dispatch changes.
 */
const assert=require("node:assert/strict");
const cp=require("node:child_process");
const fs=require("node:fs");
const BASE="fa0f39613b22e519b6790ad637319385ec2d5aa5";
const ui=[
 "app/(admin)/admin-cases.tsx",
 "app/(tabs)/volunteer.web.tsx",
 "app/(tabs)/volunteer.tsx",
];
const additions=new Set([
 "components/admin/AutoVolunteerMatchPreview.tsx",
 "lib/automaticVolunteerMatchPreview.ts",
 "scripts/test-staging-gated-matching-ui-20261117.cjs",
 "scripts/test-legacy-module-blobs-20261117.cjs",
 ".github/workflows/validate-staging-gated-matching-ui-20261117.yml",
 "docs/STAGING_GATED_MATCHING_UI_REVIEW_20261117.md",
]);
const original=(path)=>cp.execFileSync("git",["show",BASE+":"+path],{encoding:"utf8"});
function includesAllOriginalLines(path){
 const older=original(path).split("\n"),latest=fs.readFileSync(path,"utf8").split("\n");
 let j=0;
 for(const line of latest)if(line===older[j])j++;
 assert.equal(j,older.length,"Existing code modified or removed in "+path);
}
let checks=0;
for(const path of ui){
 includesAllOriginalLines(path);checks++;
 const newer=fs.readFileSync(path,"utf8");
 assert.match(newer,/automaticVolunteerMatchPreview/);checks++;
 const before=original(path);
 for(const existing of [
  "transitionAssignment",
  "responseAssignments",
  "responding",
  "on_site",
  "completed",
 ]){
  if(!before.includes(existing))continue;
  assert.ok(newer.includes(existing),path+" lost "+existing);checks++;
 }
}
const admin=fs.readFileSync(ui[0],"utf8");
assert.match(admin,/AutoVolunteerMatchPreview/);checks++;
assert.match(admin,/detailTab === "personnel"/);checks++;
assert.match(admin,/approvedVolunteers=\{approvedVolunteers\}/);checks++;
assert.match(admin,/assignments=\{assignments\}/);checks++;
const component=fs.readFileSync("components/admin/AutoVolunteerMatchPreview.tsx","utf8");
assert.match(component,/collection\(db, "responderLocks"\)/);checks++;
assert.match(component,/if \(!AUTO_VOLUNTEER_MATCH_UI_PREVIEW \|\| !authorized\) return/);checks++;
assert.match(component,/setLocks\(undefined\)/);checks++;
assert.ok(!/transaction\.|runTransaction|setDoc|updateDoc|deleteDoc|addDoc/.test(component),
  "Preview must never write Firestore");checks++;
const gate=fs.readFileSync("lib/automaticVolunteerMatchPreview.ts","utf8");
for(const condition of ["usingStagingFirebase","volunserve-volunteer-staging",
 "EXPO_PUBLIC_VOLUNSERVE_AUTO_MATCH_UI_PREVIEW","status: \"disabled\"",
 "staging_only_feature_gate"]){
 assert.ok(gate.includes(condition),"Missing fail-closed condition "+condition);checks++;
}
assert.ok(!gate.includes("isStagingAutoMatchedTask")||
  (fs.readFileSync(ui[1],"utf8").includes("isStagingAutoMatchedTask")&&
   fs.readFileSync(ui[2],"utf8").includes("isStagingAutoMatchedTask")));
checks++;
// Verify exact new/changed paths only; not even a config/rules file touched.
const diff=cp.execFileSync("git",["diff","--name-status","--no-renames",BASE,"HEAD"],{encoding:"utf8"});
const entries=diff.split("\n").filter(Boolean).map(line=>line.split("\t"));
assert.equal(entries.length,ui.length+additions.size);checks++;
for(const [status,path] of entries){
 assert.ok((status==="M" && ui.includes(path))||
   (status==="A" && additions.has(path)),
  "Not an approved additive UI change: "+status+" "+path);checks++;
}
console.log("PASS: "+checks+" UI preview safety assertions; original live-derived UI lines preserved verbatim; no original modules deleted, rules changed, backend started or production release.");
