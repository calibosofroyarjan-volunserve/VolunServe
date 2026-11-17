#!/usr/bin/env node
"use strict";
// Baseline-compatible regression: verify important published live-source blobs
// remain EXACTLY unchanged. Does not modify or read user records.
const assert=require("node:assert/strict");
const cp=require("node:child_process");
const BASE="fa0f39613b22e519b6790ad637319385ec2d5aa5";
const paths=[
  "app/(tabs)/_layout.tsx",
  "app/login.web.tsx",
  "app/signup.web.tsx",
  "app/(tabs)/community-events.tsx",
  "app/(tabs)/certificate.tsx",
  "app/(tabs)/donation.tsx",
  "app/(tabs)/disaster-response.tsx",
  "app/(admin)/community-events.tsx",
  "app/(admin)/command-center.tsx",
  "backend/server.js",
  "firestore.rules",
  "storage.rules",
  "lib/firebase.ts",
  "functions/index.js"
];
function objectId(reference,path){
 return cp.execFileSync("git",["rev-parse",reference+":"+path],{encoding:"utf8"}).trim();
}
let checked=0;
for(const path of paths){
 const before=objectId(BASE,path);
 const current=objectId("HEAD",path);
 assert.equal(current,before,"BLOCKED: protected live feature changed: "+path);
 checked++;
}
console.log("PASS: "+checked+" previously deployed source modules are byte-identical, including login/signup, maps, Events, Certificates, Donations, Firebase Rules, Functions, Hosting config and backend.");
