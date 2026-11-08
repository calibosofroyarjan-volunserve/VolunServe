#!/usr/bin/env node
"use strict";
/** Read ONLY public policy structure; never logs entire rules or credentials. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const crypto=require("node:crypto");
const {createRequire}=require("node:module");
const {resolve}=require("node:path");
const requireFunctions=createRequire(resolve(__dirname,"../functions/package.json"));
const PROJECT="volunserve-3aa5b";
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const names=(s,re)=>[...new Set([...s.matchAll(re)].map(m=>m[1]))].sort();
function structuralDelta(live,candidate){
 const functions=s=>names(s,/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g);
 const matches=s=>names(s,/\bmatch\s+([^\s{]+)\s*\{/g);
 const allows=s=>names(s,/\ballow\s+([^:]+):/g);
 const liveFunctions=functions(live),newFunctions=functions(candidate);
 const liveMatches=matches(live),newMatches=matches(candidate);
 return {
  liveLines:live.split("\n").length,targetLines:candidate.split("\n").length,
  liveHash:sha(live),targetHash:sha(candidate),identical:live===candidate,
  liveFunctions:liveFunctions.length,targetFunctions:newFunctions.length,
  removedFunctionNames:liveFunctions.filter(x=>!newFunctions.includes(x)),
  addedFunctionNames:newFunctions.filter(x=>!liveFunctions.includes(x)),
  liveMatchPaths:liveMatches.length,targetMatchPaths:newMatches.length,
  removedMatchPaths:liveMatches.filter(x=>!newMatches.includes(x)),
  addedMatchPaths:newMatches.filter(x=>!liveMatches.includes(x)),
  liveAllowPatterns:allows(live).length,targetAllowPatterns:allows(candidate).length,
  caution:"Identical names and paths do NOT prove identical permissions or existing-module compatibility",
 };
}
function selfTest(){
 const a='service cloud.firestore { match /databases/{database}/documents { match /users/{uid} { function old() {return true;} allow read: if true; } } }';
 const b='service cloud.firestore { match /databases/{database}/documents { match /users/{uid} { function newer() {return true;} allow read: if false; } } }';
 const d=structuralDelta(a,b);
 assert.deepEqual(d.removedFunctionNames,["old"]);assert.deepEqual(d.addedFunctionNames,["newer"]);
 assert.deepEqual(d.removedMatchPaths,[]);
 console.log("PASS: structural Rules inventory, scoped read only");
}
async function main(){
 assert.equal(process.env.GITHUB_REPOSITORY,"calibosofroyarjan-volunserve/VolunServe");
 assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected");
 const {cert}=requireFunctions("firebase-admin/app");
 const credential=JSON.parse(process.env.VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT||"null");
 assert.equal(credential?.project_id,PROJECT,"Wrong protected production service credential");
 const t=await cert(credential).getAccessToken();
 async function read(path){
  const r=await fetch("https://firebaserules.googleapis.com/v1/"+path,{
   headers:{Authorization:"Bearer "+t.access_token},signal:AbortSignal.timeout(15000)});
  assert(r.ok,"GET-only Rules API failed, HTTP "+r.status);
  return r.json();
 }
 const releases=await read("projects/"+PROJECT+"/releases?pageSize=100");
 const active=(releases.releases||[]).find(x=>x.name==="projects/"+PROJECT+"/releases/cloud.firestore");
 assert(active?.rulesetName,"No current Firestore Rules release; cannot reconcile");
 const full=await read(active.rulesetName);
 assert(full.source?.files?.length===1,
   "Rules source had multiple files; manual merged-source review required");
 const actual=full.source.files[0].content;
 const candidate=fs.readFileSync("firestore.rules","utf8");
 const result=structuralDelta(actual,candidate);
 console.log(JSON.stringify({
  project:PROJECT,mode:"READ_ONLY",liveRelease:active.name,liveReleaseTime:active.updateTime,
  ...result,
  rulesPublish:"NOT ATTEMPTED",
  note:"This is a structural inventory only; review changed permission logic before applying",
 },null,2));
 if(result.removedFunctionNames.length||result.removedMatchPaths.length){
  console.error("BLOCKED: target removes live Rules functions or match paths");
  process.exitCode=1;
 }
}
if(require.main===module){
 (process.argv.includes("--self-test")?Promise.resolve().then(selfTest):main())
   .catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={structuralDelta};
