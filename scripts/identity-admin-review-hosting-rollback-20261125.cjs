#!/usr/bin/env node
/**
 * Exact Firebase Hosting restore reference: no preview-channel creation.
 * "capture" and "check" are READ ONLY. "rollback" is the only write,
 * performed solely after a failed guarded Hosting deployment.
 * Never prints access tokens, private keys, or service-account JSON.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
// Load the OAuth client only when contacting Hosting; offline selftests need no dependencies.

const SITE = "volunserve-3aa5b";
const BEFORE_SHA = "38a570cb6c300c5ef0fa5958264d77db2bcb181d";
const API = "https://firebasehosting.googleapis.com/v1beta1";
const ROOT = "sites/" + SITE;
const DEST = process.argv[3];

function selectLiveRelease(releases) {
  const live = releases.filter(item =>
    typeof item?.name === "string" &&
    item.name.startsWith(ROOT + "/releases/") &&
    /^sites\/volunserve-3aa5b\/versions\/[A-Za-z0-9_-]+$/.test(item?.version?.name || "") &&
    !Number.isNaN(Date.parse(item.releaseTime || "")));
  live.sort((a,b)=>Date.parse(b.releaseTime)-Date.parse(a.releaseTime));
  if(!live.length)throw Error("BLOCKED: No immutable LIVE Hosting release/version available for rollback");
  return live[0];
}
async function token() {
  assert(fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || ""),
    "BLOCKED: missing existing production Hosting service-account file");
  const credentials = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,"utf8"));
  assert(credentials.type === "service_account" && credentials.project_id === SITE &&
    credentials.private_key && credentials.client_email,
    "BLOCKED: Hosting service account not for pinned production project");
  const {GoogleAuth} = require("google-auth-library");
  const auth = new GoogleAuth({scopes:["https://www.googleapis.com/auth/firebase.hosting"]});
  const client = await auth.getClient();
  const value = await client.getAccessToken();
  assert(value?.token, "BLOCKED: cannot obtain authorized Firebase Hosting token");
  return value.token;
}
async function api(t, method, relative, body) {
  assert(relative.startsWith("/sites/"+SITE+"/") && !relative.includes(".."),
    "BLOCKED: invalid Firebase Hosting API resource");
  const response = await fetch(API+relative,{
    method,signal:AbortSignal.timeout(22000),
    headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  if(!response.ok)throw Error("BLOCKED: Firebase Hosting REST "+method+" HTTP "+response.status+
    " (no credentials or response bodies logged)");
  return response.json();
}
async function listLive(t) {
  const releases = [];
  let next;
  for(let page=0;page<12;page++){
    const suffix = "/sites/"+SITE+"/releases?pageSize=100"+
      (next?"&pageToken="+encodeURIComponent(next):"");
    const data = await api(t,"GET",suffix);
    releases.push(...(Array.isArray(data.releases)?data.releases:[]));
    next=data.nextPageToken;
    if(!next)break;
  }
  return selectLiveRelease(releases);
}
async function currentWebRevision() {
  const response = await fetch("https://volunserve.com/volunserve-release.json",{
    signal:AbortSignal.timeout(15000),
    headers:{"Cache-Control":"no-cache"},redirect:"error"
  });
  if(!response.ok)throw Error("BLOCKED: current live Hosting revision inaccessible");
  const d=await response.json();
  assert(d?.app==="VolunServe" && d?.firebaseProject===SITE &&
    /^[0-9a-f]{40}$/.test(d.revision||""),
    "BLOCKED: invalid live Hosting release revision");
  return d.revision;
}
function readPin() {
  assert(DEST && fs.existsSync(DEST),"BLOCKED: pinned original Hosting rollback reference missing");
  const data=JSON.parse(fs.readFileSync(DEST,"utf8"));
  assert(data.site===SITE && data.sourceRevision===BEFORE_SHA &&
    /^sites\/volunserve-3aa5b\/releases\/[A-Za-z0-9_-]+$/.test(data.releaseName||"") &&
    /^sites\/volunserve-3aa5b\/versions\/[A-Za-z0-9_-]+$/.test(data.versionName||""),
    "BLOCKED: unsafe/wrong rollback reference");
  return data;
}
async function main(){
  const mode=process.argv[2];
  if(mode==="selftest"){
    const mock=[
      {name:ROOT+"/channels/x/releases/preview",releaseTime:"2026-11-26T00:00:00Z",version:{name:ROOT+"/versions/preview"}},
      {name:ROOT+"/releases/old",releaseTime:"2026-11-22T00:00:00Z",version:{name:ROOT+"/versions/old"}},
      {name:ROOT+"/releases/new",releaseTime:"2026-11-25T00:00:00Z",version:{name:ROOT+"/versions/new"}}
    ];
    assert.equal(selectLiveRelease(mock).version.name,ROOT+"/versions/new");
    assert.throws(()=>selectLiveRelease(mock.slice(0,1)),/No immutable LIVE/);
    console.log("PASS: immutable LIVE release selection ignores preview channels");
    return;
  }
  assert(["capture","check","rollback"].includes(mode),
    "Usage: capture|check|rollback <runner-temp-pin-json-path>");
  const t=await token();
  if(mode==="capture"){
    assert((await currentWebRevision())===BEFORE_SHA,
      "BLOCKED: published Hosting revision changed; do not capture outdated release");
    const live=await listLive(t);
    const pin={site:SITE,sourceRevision:BEFORE_SHA,releaseName:live.name,
      versionName:live.version.name,releaseTime:live.releaseTime};
    assert(DEST && path.resolve(DEST).startsWith(path.resolve(process.env.RUNNER_TEMP||"/tmp")+path.sep),
      "BLOCKED: must store rollback pin only in temporary runner directory");
    fs.writeFileSync(DEST,JSON.stringify(pin)+"\n",{mode:0o600,flag:"wx"});
    console.log("EXACT_HOSTING_ROLLBACK_REFERENCE_PINNED",pin.releaseName,pin.versionName);
    return;
  }
  const pin=readPin();
  const now=await listLive(t);
  if(mode==="check"){
    assert(now.name===pin.releaseName && now.version.name===pin.versionName,
      "BLOCKED: Hosting updated since rollback capture; release race detected");
    assert((await currentWebRevision())===BEFORE_SHA,
      "BLOCKED: served Hosting revision changed since rollback capture");
    console.log("PASS: pinned old LIVE Hosting version still active; safe to publish next revision");
    return;
  }
  // "rollback": restore exact PREVIOUS immutable version, not a rebuilt approximation.
  if(now.version.name===pin.versionName){
    console.log("NO_ROLLBACK_REQUIRED: exact prior immutable Hosting version is still live");
    return;
  }
  const restored=await api(t,"POST","/sites/"+SITE+"/releases?versionName="+
    encodeURIComponent(pin.versionName),{
      message:"Restore pinned VolunServe Hosting before Admin review feedback patch "+BEFORE_SHA.slice(0,12)
    });
  assert(restored?.version?.name===pin.versionName,
    "CRITICAL: Firebase accepted rollback but returned unexpected version; manual inspection required");
  console.log("ROLLBACK_API_ACCEPTED: restored exact immutable Firebase Hosting version");
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
