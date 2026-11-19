"use strict";
const assert=require("node:assert/strict");
const cp=require("node:child_process");
const fs=require("node:fs");
const ts=require("typescript");

const base="d89b225b98500e7b4fbffd8424ce9296aea4d2cc";
const file="app/(admin)/assistance-requests.tsx";
const oldText=cp.execFileSync("git",["show",base+":"+file],{encoding:"utf8"});
const candidate=fs.readFileSync(file,"utf8");
const changed=cp.execFileSync("git",["diff","--name-only",base,"HEAD","--","app","components","lib","services","utils","functions","firestore.rules","storage.rules","firebase.json"],{encoding:"utf8"}).trim().split("\n").filter(Boolean);
assert.deepEqual(changed,[file],"Release candidate must change only Assistance Requests runtime source");

const parse=text=>{
  const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.equal(sf.parseDiagnostics.length,0,"TSX syntax error");
  return sf;
};
const old=parse(oldText),now=parse(candidate);
function getInitializer(sf,name){
  const found=[];
  function visit(node){
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text===name&&node.initializer)found.push(node.initializer.getText(sf));
    ts.forEachChild(node,visit);
  }
  visit(sf);
  assert.equal(found.length,1,"Expected one protected function: "+name);
  return found[0];
}
const protectedHandlers=[
"updateRequest","startReview","saveVerificationDraft","verifyNeed",
"rejectRequest","requestMoreInformation","saveResourceAssessment",
"markAssistanceProvided","saveOfficialLocation","clearOfficialLocation",
"saveAndContinueDonation"
];
for(const name of protectedHandlers){
  assert.equal(getInitializer(now,name),getInitializer(old,name),"Production handler changed: "+name);
}
for(const token of ["Assistance Requests","REQUEST CASE","SUBMITTED","Review Summary","Decision",
"Choose Assistance","Publish Donation Campaign","Campaign Summary","pageSize={5}"]){
  assert(candidate.includes(token),"Expected reference layout or pagination missing: "+token);
}
assert(candidate.includes("request.title ||"),"Title must come from resident request");
assert(candidate.includes("request.description ||"),"Story must come from resident request");
console.log("PASS: 11 actual deployed assistance handlers unchanged");
console.log("PASS: only Assistance Requests frontend file differs from exact deployed SHA");
console.log("PASS: four reference design areas, request-derived content, five-row pagination");
console.log("NO DEPLOY");
