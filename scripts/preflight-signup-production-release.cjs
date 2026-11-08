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
function identifySourceCommit(sourceText,filePath,maxRevisions=200) {
  const refs=child.execFileSync("git",["log","--all","--format=%H","--",filePath],
      {encoding:"utf8",maxBuffer:1024*1024}).trim().split("\n").filter(validSha).slice(0,maxRevisions);
  const liveDigest=sha(sourceText);
  for(const ref of refs){
    const result=child.spawnSync("git",["show",ref+":"+filePath],{encoding:"utf8",maxBuffer:2*1024*1024});
    if(result.status===0&&sha(result.stdout)===liveDigest)return ref;
  }
  return null;
}
function websiteFileDrift(liveSha,headSha) {
  if(!validSha(liveSha)||!validSha(headSha))return {status:"INVALID_SHA"};
  // Determine which user-visible screens differ without printing file contents.
  const changed=child.spawnSync("git",["diff","--name-only",liveSha,headSha,"--",
    "app/","components/","constants/","lib/"],{encoding:"utf8",maxBuffer:1024*1024});
  if(changed.status!==0)return {status:"MISSING_GIT_OBJECT"};
  const filenames=changed.stdout.trim().split("\n").filter(Boolean);
  const sensitive=filenames.filter(name=>/signup|login|auth|firebase|guest|_layout/i.test(name));
  return {
    status:"OK",changedFrontendFiles:filenames.length,
    authOrLayoutDrift:sensitive,
    changedPaths:filenames.slice(0,100),
    note:"Inspect and reconcile changes, not a deployment allowlist or proof of behavior",
  };
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
  assert.equal(websiteFileDrift("bad","bad").status,"INVALID_SHA");
  console.log("PASS: production preflight scope and digest helpers");
}
async function main(){
  assert.equal(process.env.GITHUB_REPOSITORY,"calibosofroyarjan-volunserve/VolunServe");
  assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected");
  const head=process.env.GITHUB_SHA;
  assert(validSha(head));
  assert.equal(child.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),head);
  const latestProtected=child.execFileSync("git",["ls-remote","--heads","origin","live-protected"],{encoding:"utf8"}).split(/\s+/)[0];
  assert.equal(latestProtected,head,
    "BLOCKED: this GitHub Actions run is pinned to a stale protected commit; run the latest protected workflow, not a rerun of an older build");
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
    rulesInfo.activeReleaseNames=releases.map(x=>x.name).filter(Boolean).sort();
    rulesInfo.activeReleaseCount=releases.length;
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
        historicalRepoSourceCommit:identifySourceCommit(liveContent,targetFile),
        releaseUpdated:release.updateTime,
      });
    }
  }
  const safeAncestor=isAncestor(marker.revision,head);
  const websiteDrift=websiteFileDrift(marker.revision,head);
  if(rulesInfo.access==="OK"){
    for(const product of ["firestore","storage"]){
      if(!rulesInfo[product]?.length){
        rulesInfo[product+"Status"]="NO_ACTIVE_RELEASE_IDENTIFIED — inspect active releases/bucket before any publish";
      }else{
        rulesInfo[product+"Status"]="SOURCE_READ";
      }
    }
  }
  console.log(JSON.stringify({
    mode:"READ_ONLY",project:PROJECT,websiteRevision:marker.revision,
    protectedHead:head,
    websiteIsAncestorOfProtectedSource:safeAncestor,
    historyStatus:safeAncestor?"DIRECT DESCENDANT":"DIVERGED — no blind full Hosting overwrite",
    websiteDrift,
    firebaseRules:rulesInfo,
    actionsTaken:"NONE — no releases, users, functions or records updated",
  },null,2));
  if(!safeAncestor)process.exitCode=1;
  if(rulesInfo.access!=="OK")process.exitCode=1;
  if(rulesInfo.access==="OK"){
    // A list response alone is insufficient: both currently deployed rule
    // sources must be readable before any rollout can claim verification.
    for(const key of ["firestore","storage"]){
      const entries=rulesInfo[key]||[];
      if(!entries.length || entries.some(item=>item.readStatus||!item.liveSourceHash)){
        console.error("BLOCKED: could not read existing production "+key+" Rules source");
        process.exitCode=1;
      }
    }
    if(rulesInfo.paginationStatus){
      console.error("BLOCKED: incomplete Rules release listing");
      process.exitCode=1;
    }
  }
}
if(require.main===module){
  (process.argv.includes("--self-test")?Promise.resolve().then(selfTest):main())
    .catch(err=>{console.error(String(err?.message||err));process.exitCode=1;});
}
module.exports={classifyRelease,isAncestor,websiteFileDrift,identifySourceCommit};
