#!/usr/bin/env node
"use strict";
/**
 * Verifies each optimized Firebase Rules allowlist accepts precisely the same
 * canonical values as the last approved protected source. Never uses credentials
 * or production data. Full Firebase emulator tests remain separate CI gates.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const cp=require("node:child_process");
const BASE="d56ef149f3c1e4bf6fc0789bf11b518a03fa5ff1";
const original=cp.execFileSync("git",["show",BASE+":firestore.rules"],{encoding:"utf8"});
const next=fs.readFileSync("firestore.rules","utf8");

function oldList(field){
 const key=field+" in [",begin=original.indexOf(key);
 assert(begin>=0,"Missing previously deployed allowlist for "+field);
 let depth=1,end=-1;
 for(let j=begin+key.length;j<original.length;j++){
  if(original[j]==="[")depth++;
  if(original[j]==="]"&&--depth===0){end=j;break;}
 }
 assert(end>0);
 const raw=original.slice(begin+key.length,end);
 const values=[...raw.matchAll(/'([^']+)'/g)].map(m=>m[1]);
 assert(values.length>5);
 return values;
}
function newRegex(field){
 const key=field+" is string && "+field+".matches('";
 const begin=next.indexOf(key);
 assert(begin>=0,"Optimized allowlist missing explicit string validation for "+field);
 const end=next.indexOf("')",begin+key.length);
 assert(end>begin);
 return new RegExp(next.slice(begin+key.length,end));
}
let checks=0;
for(const [field,expected] of [
 ["d.barangay",62],["document.documentType",18],["d.occupationCategory",10]
]){
 const values=oldList(field),allowed=new Set(values),re=newRegex(field);
 assert.equal(values.length,expected);
 for(const value of values){
  assert(re.test(value),"Rejected previously allowed value: "+field+"="+value);
  for(const invalid of [" "+value,value+" ",value+".",value.toLowerCase(),
                         value.toUpperCase(),"x"+value,value+"x"]){
   if(!allowed.has(invalid)){
    assert(!re.test(invalid),"Accidentally allowed new value: "+field+"="+invalid);
   }
   checks++;
  }
  checks++;
 }
 for(const invalid of ["","na","invalid","Bad User","undefined"]){
  if(!allowed.has(invalid))assert(!re.test(invalid));
  checks++;
 }
 console.log("PASS "+field+": "+values.length+" original values accepted; malformed variants denied");
}
const roleValues=[undefined,null,"","resident","volunteer","admin","superadmin",
 "lgu_personnel","guest","applicant","random"];
const statuses=[undefined,null,"approved","pending_review","rejected"];
const adminStatuses=[undefined,null,"active","suspended","pending"];
const emails=[undefined,null,"ok@example.com","someoneelse@example.com"];
const verified=[false,true];
const own=(p,k)=>Object.prototype.hasOwnProperty.call(p,k);
const get=(p,k,d)=>own(p,k)?p[k]:d;
function before(p,auth){
 const role=get(p,"role","");
 return auth.verified&&
   ["resident","volunteer","admin","superadmin","lgu_personnel"].includes(role)&&
   (["admin","superadmin","lgu_personnel"].includes(role)||
      (auth.verified&&auth.email===get(p,"email","")))&&
   (get(p,"status",null)==="approved"||(!own(p,"status")&&get(p,"role","applicant")!=="applicant"))&&
   get(p,"adminStatus","active")!=="suspended";
}
function after(p,auth){
 const role=get(p,"role","");
 return auth.verified&&
   ["resident","volunteer","admin","superadmin","lgu_personnel"].includes(role)&&
   (["admin","superadmin","lgu_personnel"].includes(role)||
      auth.email===get(p,"email",""))&&
   get(p,"status","approved")==="approved"&&
   get(p,"adminStatus","active")!=="suspended";
}
for(const role of roleValues)for(const status of statuses)
for(const adminStatus of adminStatuses)for(const email of emails)
for(const tokenEmail of emails)for(const v of verified){
 const p={};
 if(role!==undefined)p.role=role;
 if(status!==undefined)p.status=status;
 if(adminStatus!==undefined)p.adminStatus=adminStatus;
 if(email!==undefined)p.email=email;
 const auth={verified:v,email:tokenEmail};
 assert.equal(after(p,auth),before(p,auth),
   "Changed role permission for "+JSON.stringify({p,auth}));
 checks++;
}
assert(next.includes("function approved()") &&
 next.includes("function hasApprovedStaffRole(roles)") &&
 (next.match(/request\.auth\.token\.get\('email_verified', false\) == true/g)||[]).length >= 2,
 "BLOCKED: verified email protection not in both root role gates");
for(const term of ["match /volunteerInvitations/{invitationId}",
 "function selectedCase()","function selectedVolunteer()",
 "function validInitialResidentInputs()","match /responseAssignments/"]){
 assert(next.includes(term),"Missing published module security policy: "+term);
}
console.log("PASS: "+checks+" exact allowlist/role-equivalence checks; original live permissions preserved in source.");
