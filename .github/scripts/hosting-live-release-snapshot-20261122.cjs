#!/usr/bin/env node
"use strict";
/* One-time Hosting rollback snapshot. No preview channel or Firebase database access. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const assert=require("node:assert/strict");
const mode=process.argv[2];assert(["snapshot","restore"].includes(mode));
const site=process.env.SITE;assert.equal(site,"volunserve-3aa5b");
const base=process.env.BASE_SHA,source=process.env.SOURCE_SHA;
assert(/^[a-f0-9]{40}$/.test(base||"")&&/^[a-f0-9]{40}$/.test(source||""));
const tmp=process.env.RUNNER_TEMP;
assert(tmp&&path.isAbsolute(tmp));
const snapshotFile=path.join(tmp,"volunserve-mobile-home-live-version-snapshot-20261122.json");
const credentialPath=process.env.GOOGLE_APPLICATION_CREDENTIALS;
assert(credentialPath&&path.isAbsolute(credentialPath));
const sa=JSON.parse(fs.readFileSync(credentialPath,"utf8"));
assert.equal(sa.project_id,site);assert.equal(sa.type,"service_account");
async function accessToken(){
  const now=Math.floor(Date.now()/1000);
  const enc=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned=enc({alg:"RS256",typ:"JWT"})+"."+enc({
    iss:sa.client_email,scope:"https://www.googleapis.com/auth/firebase.hosting",
    aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+1800,
  });
  const signature=crypto.sign("RSA-SHA256",Buffer.from(unsigned),sa.private_key).toString("base64url");
  const response=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+signature}),
    signal:AbortSignal.timeout(20000),
  });
  if(!response.ok)throw Error("OAuth token request failed HTTP "+response.status);
  const payload=await response.json();
  assert(typeof payload.access_token==="string"&&payload.access_token.length>30);
  return payload.access_token;
}
async function api(token,endpoint,method="GET",body){
  const response=await fetch("https://firebasehosting.googleapis.com/v1beta1/"+endpoint,{
    method,headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000),
  });
  if(!response.ok){
    const message=(await response.text()).slice(0,450).replace(/Bearer\s+\S+/g,"Bearer REDACTED");
    throw Error("Firebase Hosting REST "+method+" failed HTTP "+response.status+": "+message);
  }
  return response.json();
}
async function liveRevision(){
  const response=await fetch("https://volunserve.com/volunserve-release.json?hosting_snapshot="+Date.now(),{
    headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000),
  });
  assert(response.ok,"Live release marker unavailable");
  const marker=await response.json();
  assert.equal(marker.app,"VolunServe");assert.equal(marker.firebaseProject,site);
  return marker.revision;
}
async function snapshot(){
  assert.equal(await liveRevision(),base,"BLOCKED production changed before snapshot");
  const token=await accessToken();
  const releaseList=await api(token,"sites/"+site+"/channels/live/releases?pageSize=2");
  const releases=Array.isArray(releaseList.releases)?releaseList.releases:[];
  assert(releases.length,"No existing live release; cannot preserve rollback");
  const latest=releases[0],versionName=latest.version&&latest.version.name;
  assert(/^sites\/volunserve-3aa5b\/versions\/[a-zA-Z0-9_-]+$/.test(versionName||""),
    "Invalid immutable version identifier from live release");
  assert(typeof latest.name==="string"&&latest.name.startsWith("sites/"+site+"/"),
    "Unexpected live Hosting release identifier");
  assert.equal(await liveRevision(),base,"BLOCKED live changed during snapshot");
  fs.writeFileSync(snapshotFile,JSON.stringify({
    site,base,source,versionName,releaseName:latest.name,savedAt:new Date().toISOString()
  })+"\n",{mode:0o600});
  console.log("PASS immutable Firebase Hosting live version recorded for rollback: "+versionName);
  console.log("NO preview channel created; NO changes to Hosting");
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function restore(){
  const snap=JSON.parse(fs.readFileSync(snapshotFile,"utf8"));
  assert.equal(snap.site,site);assert.equal(snap.base,base);assert.equal(snap.source,source);
  assert(/^sites\/volunserve-3aa5b\/versions\/[a-zA-Z0-9_-]+$/.test(snap.versionName));
  let current;
  try{current=await liveRevision();}catch(err){
    console.log("Live marker unreadable after failed deploy; restoring exact saved version");
  }
  if(current===base){console.log("PASS live already serves old version; rollback not needed");return;}
  assert(!current||current===source,
    "BLOCKED: unrelated production revision appeared; manual rollback required");
  const token=await accessToken();
  const release=await api(token,"sites/"+site+"/channels/live/releases?versionName="+encodeURIComponent(snap.versionName),
    "POST",{message:"Automated restore of previous VolunServe Hosting after failed mobile UI release"});
  assert.equal(release.version&&release.version.name,snap.versionName,
    "REST rollback returned unexpected version");
  for(let attempt=1;attempt<=8;attempt++){
    try{if(await liveRevision()===base){console.log("PASS restored exact previous Hosting revision "+base);return;}}catch(err){}
    await sleep(6000);
  }
  throw Error("Rollback request completed but original public revision could not be confirmed");
}
(mode==="snapshot"?snapshot():restore()).catch(err=>{
  console.error("BLOCKED Hosting "+mode+": "+(err&&err.message||String(err)));
  process.exitCode=1;
});
