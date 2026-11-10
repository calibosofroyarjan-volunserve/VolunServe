#!/usr/bin/env node
"use strict";
// Offline-only: prove the replacement accepts precisely the same ASCII URLs.
const fs=require("node:fs");
const assert=require("node:assert/strict");
const prefix="https://volunserve.onrender.com/api/assistance/evidence/evidence_";
const suffix="/access";
assert.equal(prefix.length+suffix.length,72);
const old=/^https:\/\/volunserve[.]onrender[.]com\/api\/assistance\/evidence\/evidence_[A-Za-z0-9]+\/access$/;
const replacement=/^https:\/\/volunserve[.]onrender[.]com\/api\/assistance\/evidence\/evidence_[A-Za-z0-9]{1,428}\/access$/;
const acceptOld=x=>typeof x==="string"&&x.length>=40&&x.length<=500&&old.test(x);
const acceptNew=x=>typeof x==="string"&&replacement.test(x);
const ids=[0,1,2,20,100,426,427,428,429,430,500,1000].map(n=>"A".repeat(n));
for(const id of ids)for(const url of [
  prefix+id+suffix,
  prefix+id+"."+suffix,
  prefix+id+"/access/extra",
  prefix+id+" "+suffix,
  prefix+id+"é"+suffix,
  prefix+id+"_"+suffix,
  prefix.toUpperCase()+id+suffix,
  "http://volunserve.onrender.com/api/assistance/evidence/evidence_"+id+suffix,
]){
  assert.equal(acceptNew(url),acceptOld(url),"Unexpected boundary difference for input length "+url.length);
}
for(const other of [undefined,null,false,{},[],19,"",prefix+suffix]){
  assert.equal(acceptNew(other),acceptOld(other),"Type or missing ID changed");
}
assert(acceptNew(prefix+"A"+suffix));
assert(acceptNew(prefix+"A".repeat(428)+suffix));
assert(!acceptNew(prefix+"A".repeat(429)+suffix));
assert.equal((prefix+"A".repeat(428)+suffix).length,500);
const source=fs.readFileSync("firestore.rules","utf8");
assert(source.includes("evidence_[A-Za-z0-9]{1,428}/access$"),"Rules do not use bounded URL regex");
assert(!source.includes("document.url.size() >= 40"),"Old redundant URL minimum still active");
assert(!source.includes("document.url.size() <= 500"),"Old redundant URL maximum still active");
console.log("PASS: assistance evidence URL old/new boundary equivalence (73..500 chars, ASCII-only), no production writes");
