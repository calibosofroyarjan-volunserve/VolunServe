#!/usr/bin/env node
"use strict";
/*
 * PUBLIC READ-ONLY PROBE. Reads only published release metadata.
 * No Firebase Admin client, credentials, Rules changes, Auth, writes, or deploys.
 */
const assert=require("node:assert/strict");
const child=require("node:child_process");
const PROJECT="volunserve-3aa5b";
const URLS=[
  ["canonical","https://volunserve.com/volunserve-release.json"],
  ["www","https://www.volunserve.com/volunserve-release.json"],
  ["firebase-hosting","https://volunserve-3aa5b.web.app/volunserve-release.json"],
];
function validSha(value){return typeof value==="string"&&/^[0-9a-f]{40}$/.test(value);}
function checkMarker(doc){
  assert(doc && typeof doc==="object" && !Array.isArray(doc),"Missing/invalid marker JSON");
  assert.equal(doc.app,"VolunServe","Unexpected website/application");
  assert.equal(doc.firebaseProject,PROJECT,"Unexpected Firebase project");
  assert(validSha(doc.revision),"Missing/invalid 40-digit live Git revision");
  return {revision:doc.revision,builtAt:typeof doc.builtAt==="string"?doc.builtAt:null};
}
function git(...args) {
  const ret=child.spawnSync("git",args,{encoding:"utf8",timeout:15000});
  if(ret.status!==0)throw Error("Git source ancestry lookup failed: "+args[0]);
  return ret.stdout.trim();
}
function ancestor(a,b){
  return child.spawnSync("git",["merge-base","--is-ancestor",a,b],{timeout:15000}).status===0;
}
async function fetchPublic(name,url){
  try {
    const response=await fetch(url,{
      method:"GET",redirect:"follow",signal:AbortSignal.timeout(15000),
      headers:{Accept:"application/json","Cache-Control":"no-cache"}
    });
    if(!response.ok)return {host:name,http:response.status,valid:false,error:"Release marker not served"};
    const type=response.headers.get("content-type")||"";
    // Limit untrusted public content. We need only a small revision marker.
    const raw=await response.text();
    if(raw.length>4096)return {host:name,http:response.status,valid:false,error:"Oversized release marker"};
    let parsed;
    try {parsed=JSON.parse(raw);} catch {return {host:name,http:response.status,contentType:type,valid:false,error:"Not a JSON marker"};}
    try {
      const result=checkMarker(parsed);
      return {host:name,http:response.status,contentType:type,valid:true,...result};
    } catch (err) {
      return {host:name,http:response.status,contentType:type,valid:false,error:String(err.message).slice(0,180)};
    }
  }catch(err){return {host:name,valid:false,error:err?.name==="TimeoutError"?"Timed out":"Network/TLS/DNS failure: "+String(err?.cause?.code||err?.code||err?.name||"unknown")};}
}
function selfTest(){
  assert.deepEqual(checkMarker({app:"VolunServe",firebaseProject:PROJECT,revision:"a".repeat(40)}).revision,"a".repeat(40));
  assert.throws(()=>checkMarker({app:"VolunServe",firebaseProject:"wrong",revision:"a".repeat(40)}));
  assert.throws(()=>checkMarker({app:"VolunServe",firebaseProject:PROJECT,revision:"abc"}));
  console.log("PASS: marker validation unit tests; no network or credentials used");
}
async function main(){
  assert.equal(process.env.GITHUB_REPOSITORY,"calibosofroyarjan-volunserve/VolunServe");
  const results=await Promise.all(URLS.map(([name,url])=>fetchPublic(name,url)));
  const live=results.find(x=>x.host==="canonical");
  const protectedSha=git("rev-parse","origin/live-protected");
  let drift=null;
  if(live?.valid){
    const sourceExists=child.spawnSync("git",["cat-file","-e",live.revision+"^{commit}"]).status===0;
    drift={publicRevision:live.revision,protectedHead:protectedSha,exactMatch:live.revision===protectedSha,
      revisionInGitHistory:sourceExists,
      publicRevisionAncestorOfProtected:sourceExists&&ancestor(live.revision,protectedSha)};
    if(sourceExists){
      drift.changedFrontendPathsSincePublished=git("diff","--name-only",live.revision,protectedSha,
        "--","app/","components/","constants/","lib/").split("\n").filter(Boolean).slice(0,100);
    }
  }
  const revisions=[...new Set(results.filter(x=>x.valid).map(x=>x.revision))];
  const mismatch=revisions.length>1;
  console.log(JSON.stringify({
    mode:"READ_ONLY_PUBLIC",
    sources:results,
    protectedHead:protectedSha,
    siteAndMirrorRevisionsDiffer:mismatch,
    websiteDrift:drift,
    firebaseRulesStatus:"NOT_CHECKED — active production Rules require authorized read access",
    actionsTaken:"NONE — public HTTP GET only; no deploy, Auth, data writes or secrets",
  },null,2));
  // False positive protection: the canonical domain itself must return a
  // verified marker, and any accessible Firebase mirror must agree with it.
  if(!live?.valid || mismatch || !drift?.revisionInGitHistory || !drift?.publicRevisionAncestorOfProtected){
    console.error("BLOCKED: canonical Hosting release revision not reliably verified");
    process.exitCode=1;
  } else console.log("PASS: canonical live Hosting marker verified and is an ancestor of protected source");
}
if(require.main===module) {
  (process.argv.includes("--self-test")?Promise.resolve().then(selfTest):main())
   .catch(err=>{console.error("BLOCKED: "+String(err.message||err));process.exitCode=1;});
}
module.exports={validSha,checkMarker};
