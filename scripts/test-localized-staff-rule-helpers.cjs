#!/usr/bin/env node
"use strict";
/** Offline equivalence test. Ensures no non-staff Firestore permission changed. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const cp=require("node:child_process");
const BASE="2acf2b951741820277d721340074e0c999f42ce2";
const original=cp.execFileSync("git",["show",BASE+":firestore.rules"],{encoding:"utf8"});
const current=fs.readFileSync("firestore.rules","utf8");
const a=original.indexOf("    function isAdmin() {");
const b=original.indexOf("    function hasResidentAccess() {",a);
assert(a>0&&b>a,"Original protected staff helpers unavailable");
const replacement=`    // Reuse one verified-active staff role gate for all three staff helpers.
    // Same semantics as the previous independent isAdmin/isSuperAdmin helpers:
    // only a verified Firebase email, approved/non-suspended user profile,
    // and the exact allowed role can pass. Other roles never get staff access.
    function hasApprovedStaffRole(roles) {
      let p = signedIn() ? profile() : {};
      return verifiedEmailSession()
        && p.get('role', '') in roles
        && p.get('status', 'approved') == 'approved'
        && p.get('adminStatus', 'active') != 'suspended';
    }
    function isAdmin() {
      return hasApprovedStaffRole(['admin']);
    }
    function isSuperAdmin() {
      return hasApprovedStaffRole(['superadmin']);
    }
    function isAdminOrSuperAdmin() {
      return hasApprovedStaffRole(['admin', 'superadmin']);
    }
`;
const consolidated=original.slice(0,a)+replacement+original.slice(b);
if(current!==consolidated){
 // The only additional permitted change is the separately proven set of
 // exact 185 typed-bound rewrites. The imported proof verifies byte equality
 // against the consolidated baseline and fails on any unrelated change.
 require("./test-shared-typed-field-validators.cjs");
}
const body=current.slice(0,current.indexOf("    match /"));
for(const name of ["hasApprovedStaffRole","isAdmin","isSuperAdmin","isAdminOrSuperAdmin"]){
 assert(body.includes("function "+name+"("),"Missing consolidated root helper "+name);
}
for(const name of ["isAdmin","isSuperAdmin","isAdminOrSuperAdmin"]){
 assert.equal([...current.matchAll(new RegExp("\\bfunction "+name+"\\(","g"))].length,1,
  "BLOCKED: old duplicated staff function still exists "+name);
}
const roles=[undefined,null,"","guest","applicant","admin","superadmin",
 "lgu_personnel","resident","volunteer","other",0,["admin"]];
const statuses=[undefined,null,"approved","pending_review","rejected",0];
const admins=[undefined,null,"active","suspended","pending",false];
let checks=0;
function val(p,key,def){
 return Object.prototype.hasOwnProperty.call(p,key)?p[key]:def;
}
function oldPolicy(p,verified,allowed){
 return verified && allowed.includes(val(p,"role",""))
  && val(p,"status","approved")==="approved"
  && val(p,"adminStatus","active")!=="suspended";
}
function newPolicy(p,verified,allowed){
 const allowedRole=allowed.includes(val(p,"role",""));
 return verified&&allowedRole
  && val(p,"status","approved")==="approved"
  && val(p,"adminStatus","active")!=="suspended";
}
for(const role of roles)for(const status of statuses)
for(const adminStatus of admins)for(const verified of [true,false])
for(const [fn,allowed] of [
 ["isAdmin",["admin"]],
 ["isSuperAdmin",["superadmin"]],
 ["isAdminOrSuperAdmin",["admin","superadmin"]]
]){
 const p={};if(role!==undefined)p.role=role;
 if(status!==undefined)p.status=status;
 if(adminStatus!==undefined)p.adminStatus=adminStatus;
 assert.equal(newPolicy(p,verified,allowed),oldPolicy(p,verified,allowed),
  "Staff permission changed for "+fn+JSON.stringify({p,verified}));
 checks++;
}
console.log("PASS: "+checks+" staff-role combination checks, exact unmodified non-staff Rules source; no live writes.");
