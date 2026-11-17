#!/usr/bin/env node
"use strict";

/**
 * READ-ONLY VolunServe source reconciliation audit.
 * Uses the public Hosting release marker as evidence of published revision,
 * not proof of the full running application. No Firebase secrets or writes.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const cp=require("node:child_process");
const EXPECTED="f6139fdae5bce940356a62efc28f8e50935978d6";
const LIVE_URL="https://volunserve.com/volunserve-release.json";
const PROTECTED="origin/live-protected";
const critical=[
  "app/(admin)/admin-cases.tsx",
  "app/(tabs)/volunteer.web.tsx",
  "app/(tabs)/volunteer.tsx",
  "app/login.web.tsx",
  "app/identity-verification.web.tsx",
  "app/(admin)/community-events.tsx",
  "app/(tabs)/community-events.tsx",
  "backend/server.js",
  "firestore.rules",
  "lib/firebase.ts",
  "functions/index.js"
];
const allowedNew=new Set([
  "scripts/audit-live-source-reconciliation-20261117.cjs",
  "docs/VERIFIED_LIVE_SOURCE_RECONCILIATION_20261117.md",
  ".github/workflows/audit-live-source-reconciliation-20261117.yml"
]);
function git(...args){
  return cp.execFileSync("git",args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
}
function statusDiff(a,b){
  const delta=git("diff","--name-status","--no-renames",a,b);
  return delta?delta.split("\n").filter(Boolean).map(line=>{
    const [change,...parts]=line.split("\t");
    return {change,path:parts.join("\t")};
  }):[];
}
function oid(ref,path){
  try{return git("rev-parse",ref+":"+path);}
  catch{return "missing";}
}
function tableLine(name,left,right){
  return "| "+name.replace(/\|/g,"/")+" | "+left.slice(0,12)+" | "+
    right.slice(0,12)+" | "+(left===right?"Same":"Different")+" |";
}
async function run(){
  const head=git("rev-parse","HEAD");
  const expected=git("rev-parse",EXPECTED);
  const protectedTip=git("rev-parse",PROTECTED);
  const paths=statusDiff(expected,head);
  assert.equal(expected,EXPECTED,"Hosting baseline not available in checkout");
  assert.equal(paths.length,allowedNew.size,"Expected exactly the 3 audit-only added files");
  for(const p of paths){
    assert.equal(p.change,"A","BLOCKED: existing served-source file modified or deleted: "+p.path);
    assert.ok(allowedNew.has(p.path),"BLOCKED: unreviewed addition: "+p.path);
  }

  const response=await fetch(LIVE_URL,{
    headers:{"Cache-Control":"no-cache","Accept":"application/json"},
    signal:AbortSignal.timeout(15000),redirect:"error"
  });
  assert.equal(response.status,200,"Live release marker unreadable");
  const marker=await response.json();
  assert.equal(marker.app,"VolunServe","Unexpected published app");
  assert.equal(marker.firebaseProject,"volunserve-3aa5b","Unexpected Firebase project");
  assert.match(String(marker.revision||""),/^[a-f0-9]{40}$/);
  const markerChanged=marker.revision!==EXPECTED;
  const protectedDiff=statusDiff(expected,protectedTip);
  const counts=git("rev-list","--left-right","--count",EXPECTED+"..."+protectedTip)
    .split(/\s+/).map(Number);
  const [markerOnly,protectedOnly]=counts;
  const rows=critical.map(path=>{
    const live=oid(expected,path),protectedBlob=oid(protectedTip,path);
    return {path,live,protectedBlob,different:live!==protectedBlob};
  });
  const mismatch=rows.filter(x=>x.different);
  const groups={};
  for(const row of protectedDiff){
    const major=row.path.split("/")[0];
    groups[major]=(groups[major]||0)+1;
  }
  const summary=[
    "# VolunServe source reconciliation — read-only CI",
    "",
    "- Published marker checked now: "+marker.revision,
    "- Prior Hosting marker baseline: "+EXPECTED,
    "- Current protected branch: "+protectedTip,
    "- Git divergence: "+markerOnly+" published-side versus "+
      protectedOnly+" protected-side commits",
    "- Different paths between source snapshots: "+protectedDiff.length,
    "- Critical paths with different blobs: "+mismatch.length+"/"+rows.length,
    "- Existing live-derived files changed by this audit PR: NONE",
    "- Safety status: "+(markerChanged?
      "BLOCKED: MARKER CHANGED - REBASE REQUIRED":
      "BLOCKED: PROTECTED BRANCH HAS DIVERGED HISTORY"),
    "",
    "## Critical source fingerprints",
    "| Path | Published marker blob | Protected blob | State |",
    "|---|---|---|---|",
    ...rows.map(x=>tableLine(x.path,x.live,x.protectedBlob)),
    "",
    "## Difference inventory",
    ...Object.entries(groups).sort((a,b)=>b[1]-a[1]).map(([k,n])=>"- "+k+": "+n),
    "",
    "This is only a read-only Git and public marker audit. Nothing was deployed,",
    "deleted or changed on live. Production source must be reconciled by reviewed",
    "file-level integration, preserving all existing functional modules."
  ].join("\n");
  console.log(summary);
  if(process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+"\n");
  if(markerChanged){
    console.error("BLOCKED: live Hosting marker changed since pinned snapshot.");
    process.exitCode=1;
  }else{
    console.log("PASS: marker matches pinned snapshot; source drift classified, no existing files modified");
  }
}
run().catch(e=>{console.error("BLOCKED: "+String(e?.message||e));process.exitCode=1});
