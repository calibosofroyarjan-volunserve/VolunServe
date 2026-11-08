#!/usr/bin/env node
"use strict";
/**
 * READ-ONLY trusted VolunServe production Signup release preflight.
 * Credentials: the existing GitHub `production` environment Hosting key.
 * Fetches only release metadata/source, computes hashes; never publishes
 * Rules/Functions/Hosting or writes Firestore/Auth.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const crypto=require("node:crypto");
const child=require("node:child_process");
const {createRequire}=require("node:module");
const path=require("node:path");
const reqFns=createRequire(path.resolve(__dirname,"../functions/package.json"));
const PROJECT="volunserve-3aa5b";
const BASE="https://firebaserules.googleapis.com/v1";
const sha=text=>crypto.createHash("sha256").update(String(text)).digest("hex");
const validSha=x=>/^[a-f0-9]{40}$/.test(x||"");
function isAncestor(base,head) {
  if(!validSha(base)||!validSha(head))return false;
  return child.spawnSync("git",["merge-base","--is-ancestor",base,head]).status===0;
}
function classifyRelease(name){
  if(/\/releases\/cloud\.firestore(?:\/|$)/.test(name))return "firestore";
  if(/\/releases\/firebase\.storage(?:\/|$)/.test(name))return "storage";
  return null;
}
function selfTest(){
  assert.equal(classifyRelease("projects/a/releases/cloud.firestore"),"firestore");
  assert.equal(classifyRelease("projects/a/releases/firebase.storage/a.appspot.com"),"storage");
  assert.equal(classifyRelease("projects/a/releases/unrelated"),null);
  assert.equal(sha("a"),sha("a"));assert.notEqual(sha("a"),sha("b"));
  console.log("PASS: production preflight scope and digest helpers");
}
async function main(){
  assert.equal(process.env.GITHUB_REPOSITORY,"calibosofroyarjan-volunserve/VolunServe");
  assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected");
  const head=process.env.GITHUB_SHA;
  assert(validSha(head));
  assert.equal(child.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),head);
  assert.equal(child.execFileSync("git",["ls-remote","--heads","origin","live-protected"],{encoding:"utf8"}).split(/\s+/)[0],head);
  assert(!process.env.FIRESTORE_EMULATOR_HOST&&!process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const credential=JSON.parse(process.env.VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT||"null");
  assert(credential&&credential.project_id===PROJECT,"BLOCKED: no matching production Hosting environment key");
  const {cert}=reqFns("firebase-admin/app");
  const token=await cert(credential).getAccessToken();
  assert(token.access_token);
  const authHeader={Authorization:"Bearer "+token.access_token};
  const markerResponse=await fetch("https://volunserve.com/volunserve-release.json",{
    headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000)});
  assert(markerResponse.ok,"BLOCKED: production Hosting marker inaccessible");
  const marker=await markerResponse.json();
  assert.equal(marker.app,"VolunServe");
  assert.equal(marker.firebaseProject,PROJECT);
  assert(validSha(marker.revision),"BLOCKED: invalid live marker");
  // Fetch live Security Rules with only GET methods and without printing sources.
  async function getJson(url){
    const response=await fetch(url,{headers:authHeader,signal:AbortSignal.timeout(15000)});
    if(!response.ok)return {errorStatus:response.status};
    return response.json();
  }
  const rulesInfo={};
  const list=await getJson(BASE+"/projects/"+PROJECT+"/releases?pageSize=100");
  if(list.errorStatus){
    rulesInfo.access="HTTP "+list.errorStatus+" — no Rules read access via existing Hosting credential";
  }else{
    rulesInfo.access="OK";
    const releases=[...(list.releases||[])];
    let page=list.nextPageToken;
    for(let i=0;page&&i<10;i++){
      const extra=await getJson(BASE+"/projects/"+PROJECT+
        "/releases?pageSize=100&pageToken="+encodeURIComponent(page));
      if(extra.errorStatus){rulesInfo.paginationStatus=extra.errorStatus;break;}
      releases.push(...(extra.releases||[]));page=extra.nextPageToken;
    }
    for(const release of releases){
      const type=classifyRelease(release.name||"");
      if(!type||!release.rulesetName)continue;
      const ruleset=await getJson(BASE+"/"+release.rulesetName);
      if(ruleset.errorStatus){
        (rulesInfo[type] ||= []).push({readStatus:ruleset.errorStatus});continue;
      }
      const texts=(ruleset.source?.files||[]).map(x=>String(x.content||""));
      const liveContent=texts.join("\n");
      const targetFile=type==="firestore"?"firestore.rules":"storage.rules";
      const target=fs.readFileSync(targetFile,"utf8");
      (rulesInfo[type] ||= []).push({
        liveSourceHash:sha(liveContent),
        targetSourceHash:sha(target),
        identical: texts.length===1&&liveContent===target,
        releaseUpdated:release.updateTime,
      });
    }
  }
  const safeAncestor=isAncestor(marker.revision,head);
  console.log(JSON.stringify({
    mode:"READ_ONLY",project:PROJECT,websiteRevision:marker.revision,
    protectedHead:head,
    websiteIsAncestorOfProtectedSource:safeAncestor,
    historyStatus:safeAncestor?"DIRECT DESCENDANT":"DIVERGED — no blind full Hosting overwrite",
    firebaseRules:rulesInfo,
    actionsTaken:"NONE — no releases, users, functions or records updated",
  },null,2));
  if(!safeAncestor)process.exitCode=1;
  if(rulesInfo.access!=="OK")process.exitCode=1;
}
if(require.main===module){
  (process.argv.includes("--self-test")?Promise.resolve().then(selfTest):main())
    .catch(err=>{console.error(String(err?.message||err));process.exitCode=1;});
}
module.exports={classifyRelease,isAncestor};
