#!/usr/bin/env node
"use strict";
/** Offline, exhaustive source relocation proof; no network/production access. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const cp=require("node:child_process");
const BASE="2acf2b951741820277d721340074e0c999f42ce2";
const before=cp.execFileSync("git",["show",BASE+":firestore.rules"],{encoding:"utf8"});
const after=fs.readFileSync("firestore.rules","utf8");
const helpers=["isSuperAdmin","isAdminOrSuperAdmin"];
const starts=[...before.matchAll(/^    match\s+\/.*\{\s*$/gm)]
 .map(m=>({index:m.index,end:m.index+m[0].length,name:m[0].trim()}));
assert.equal(starts.length,54,"expected known 54 published collection match blocks");
const root=before.slice(0,starts[0].index);
const copies={};
for(const name of helpers){
 const start=root.search(new RegExp("^    function "+name+"\\(\\) \\{","m"));
 assert(start>=0,"Missing original root function "+name);
 const end=root.indexOf("\n    }\n",start);
 assert(end>start,"Missing original function closing brace "+name);
 copies[name]=root.slice(start,end+"\n    }\n".length);
 assert(copies[name].includes("verifiedEmailSession()"));
}
const usages={};
for(const name of helpers){
 const regex=new RegExp("\\b"+name+"\\s*\\(");
 usages[name]=starts.filter((m,i)=>{
  const end=i===starts.length-1?before.lastIndexOf("\n  }\n}"):starts[i+1].index;
  return regex.test(before.slice(m.end,end));
 });
 assert(usages[name].length>0);
}
let result=before;
for(const name of helpers){
 assert.equal(result.split(copies[name]).length,2,"Root original declaration unique");
 result=result.replace(copies[name],"");
}
let changedBlocks=0;
for(const match of starts){
 const defs=helpers.filter(name=>usages[name].some(c=>c.name===match.name));
 if(!defs.length)continue;
 const header="    "+match.name;
 assert(result.includes(header));
 const inserted=defs.map(name=>copies[name]
    .split("\n").map(line=>line?"  "+line:line).join("\n"))
   .join("\n");
 result=result.replace(header,header+"\n"+inserted.trimEnd()+"\n");
 changedBlocks++;
}
assert.equal(result,after,"Refactor must preserve EVERY non-function byte from protected original");
const top=after.slice(0,after.indexOf("    match /"));
for(const name of helpers){
 assert(!new RegExp("\\bfunction "+name+"\\(").test(top),
  name+" wrongly remains a root-wide inherited helper");
 assert.equal([...after.matchAll(new RegExp("\\bfunction "+name+"\\(","g"))].length,
  usages[name].length,name+" must appear only where called");
}
for(const name of ["approved","isAdmin","hasResidentAccess","hasVolunteerAccess",
 "isVolunteer","isResident"]){
 assert(top.includes("function "+name+"("),
  "Other shared authentication helpers must remain available");
}
console.log(JSON.stringify({status:"PASS",mode:"SOURCE_ONLY",unchangedOtherRuleBytes:true,
 matches:starts.length,localizedBlocks:changedBlocks,
 copiedUnmodifiedFunctions:helpers.map(name=>({
  name,collections:usages[name].length
 })),
 note:"Firebase emulator tests provide role/permission behavior verification. No live changes."
},null,2));
