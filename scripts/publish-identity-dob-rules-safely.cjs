"use strict";
/**
 * Read-first, fail-closed DOB-only Firebase Rules release.
 * No credentials, OCR values or rules sources printed to job logs.
 */
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {execFileSync}=require("node:child_process");
const {createHash}=require("node:crypto");
const {GoogleAuth}=require("google-auth-library");

const PROJECT="volunserve-3aa5b";
const RELEASE="projects/"+PROJECT+"/releases/cloud.firestore";
const PINNED="1ee67d02906826f49a3edaa54635afcad380c82d";
const BASE="https://firebaserules.googleapis.com/v1";
const source=readFileSync("firestore.rules","utf8");
const baseline=execFileSync("git",["show",PINNED+":firestore.rules"],{encoding:"utf8"});
const mode=process.env.IDENTITY_RULES_MODE||"inspect";
assert(["inspect","publish"].includes(mode));
assert.equal(process.env.PINNED_MAIN_SHA,PINNED);
assert.equal(process.env.EXPO_PUBLIC_VOLUNSERVE_ENV,"production");
assert.equal(process.env.GITHUB_REF_NAME,"release/identity-hosting-live-20261112");
assert.notEqual(source,baseline,"New rules must contain the optional DOB guard.");
assert(source.length<baseline.length+1100,"Unexpected rules expansion.");
const fingerprint=s=>createHash("sha256").update(s).digest("hex").slice(0,16);

async function run(){
 const auth=new GoogleAuth({scopes:["https://www.googleapis.com/auth/cloud-platform"]});
 const client=await auth.getClient();
 const token=await client.getAccessToken();
 if(!token.token)throw Error("No OAuth token for Firebase Rules API.");
 async function api(method,path,body){
  const res=await fetch(BASE+path,{
    method,
    headers:{
      Authorization:"Bearer "+token.token,
      ...(body?{"Content-Type":"application/json"}:{}),
    },
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(30000),
  });
  const raw=await res.text();
  let data;try{data=JSON.parse(raw)}catch{data={}}
  if(!res.ok){
    const error=String(data.error?.message||"API request failed").slice(0,190);
    throw Error("Rules "+method+" HTTP "+res.status+": "+error);
  }
  return data;
 }
 const releasePath="/projects/"+PROJECT+"/releases/cloud.firestore";
 const release=await api("GET",releasePath);
 assert.equal(release.name,RELEASE);
 assert.match(release.rulesetName||"",/^projects\/volunserve-3aa5b\/rulesets\/[a-zA-Z0-9_-]+$/);
 const active=await api("GET","/"+release.rulesetName);
 const files=active.source?.files;
 assert(Array.isArray(files)&&files.length===1,"Unexpected active ruleset file count.");
 const current=files[0]?.content;
 assert.equal(typeof current,"string");
 if(current===source){
  console.log("PASS: Firestore Rules already match DOB-only candidate ("+fingerprint(source)+").");
  return;
 }
 assert.equal(current,baseline,
   "STOP: Active rules "+fingerprint(current)+" differ from pinned main "+fingerprint(baseline)+".");
 console.log("PASS: active Firestore rules exactly match pinned production source. (read-only)");
 if(mode!=="publish")return;
 const created=await api("POST","/projects/"+PROJECT+"/rulesets",{
   source:{files:[{name:"firestore.rules",content:source}],metadata:{services:["cloud.firestore"]}},
 });
 assert.match(created.name||"",/^projects\/volunserve-3aa5b\/rulesets\/[a-zA-Z0-9_-]+$/);
 const unchanged=await api("GET",releasePath);
 assert.equal(unchanged.rulesetName,release.rulesetName,"STOP: another rules release deployed.");
 const patched=await api("PATCH",releasePath,{
   release:{name:RELEASE,rulesetName:created.name},
   updateMask:"rulesetName",
 });
 assert.equal(patched.rulesetName,created.name,"Unexpected PATCH result.");
 const verified=await api("GET",releasePath);
 assert.equal(verified.rulesetName,created.name,"Rules release not updated.");
 const applied=await api("GET","/"+verified.rulesetName);
 assert.equal(applied.source?.files?.length,1);
 assert.equal(applied.source.files[0].content,source,"Wrong rules source in active release.");
 console.log("SUCCESS: DOB-only Firestore Rules release published and verified. SHA256="+fingerprint(source));
}
run().catch(e=>{console.error("SAFE RULES RELEASE BLOCKED:",e.message);process.exitCode=1;});
