"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"volunserve-hybrid-identity-offline.html"),"utf8");
test("standalone demo is consistently labeled fictional and no-user-data",()=>{
  assert(html.startsWith("<!DOCTYPE html>"));
  for(const label of ["SIMULATION ONLY","FICTIONAL DATA","No camera","No Firebase login","not actual identity verification","No account state was changed"]) assert(html.includes(label),label);
  assert(!/<script\s+src\s*=/.test(html));
  assert(!/<link\s+[^>]*href\s*=/.test(html));
});
test("fictional demo has five supported government IDs and three final decisions",()=>{
  for(const id of ["national_id","passport","drivers_license","umid","prc_id"]) assert(html.includes('key:"'+id+'"'));
  for(const code of ["verified","retry_required","rejected"]) assert(html.includes(String.fromCharCode(34)+code+String.fromCharCode(34)),code);
  for(const phase of ["page1","page2","page3","page4"]) assert(html.includes('id="'+phase+'"'));
});
test("isolated inline script parses and cannot call camera, auth, network or storage",()=>{
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  const js=scripts[0][1];
  new vm.Script(js,{filename:"fictional-offline-demo.js"});
  for(const pattern of [
    /\bfetch\s*\(/,/\bXMLHttpRequest\b/,/\bWebSocket\s*\(/,
    /\bgetUserMedia\s*\(/,/\blocalStorage\s*\./,/\bsessionStorage\s*\./,
    /\bindexedDB\s*\./,/\bdocument\.cookie\b/,
    /\bFirebaseAuth\b/,/\bsetCustomUserClaims\s*\(/,
  ]) assert(!pattern.test(js),"forbidden operation "+pattern);
});
