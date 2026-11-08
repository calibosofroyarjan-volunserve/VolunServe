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
const afterStaffRefactor=original.slice(0,a)+replacement+original.slice(b);
// The reviewed resident-create reduction removes guards already implied by
// validInitialResidentInputs(): exact validator remains, along with the UID
// equality above it, email verification, phone format and SJDM allowlists.
const repeatedNames=`        && request.resource.data.firstName is string
        && request.resource.data.firstName.size() >= 2
        && request.resource.data.lastName is string
        && request.resource.data.lastName.size() >= 2
`;
const repeatedOther=`        && request.resource.data.phoneNumber is string
        && request.resource.data.phoneNumber.size() >= 11
        && request.resource.data.barangay is string
        && request.resource.data.barangay.size() >= 2
        && request.resource.data.occupationCategory is string
        && request.resource.data.occupationCategory.size() >= 2
        && request.resource.data.uid == uid
`;
const createStart=afterStaffRefactor.indexOf("      allow create: if signedIn()");
const createEnd=afterStaffRefactor.indexOf("      // Staff applications",createStart);
assert(createStart>0&&createEnd>createStart,"Expected basic Resident signup permission");
let createRule=afterStaffRefactor.slice(createStart,createEnd);
assert.equal(createRule.split(repeatedNames).length,2,"Exactly one duplicate name group");
assert.equal(createRule.split(repeatedOther).length,2,"Exactly one duplicate phone/location/uid group");
assert(createRule.includes("&& validInitialResidentInputs()") &&
 createRule.includes("&& request.auth.uid == uid") &&
 createRule.includes("&& request.auth.token.get(\"email_verified\", false) == true"),
 "Actual reviewed validation and identity authorization must remain");
createRule=createRule.replace(repeatedNames,"").replace(repeatedOther,
 "        // Already enforced by validInitialResidentInputs(); uid checked above.\\n".replace("\\n","\n"));
const expected=afterStaffRefactor.slice(0,createStart)+createRule+
 afterStaffRefactor.slice(createEnd);
// Only changes already reviewed in this PR are reconstructible here. No
// arbitrary permission predicates, collections, or allow methods may drift.
function optimizedRules(input) {
 let result=input;
 const banned="&& !(p.role in ['admin', 'superadmin', 'lgu_personnel', 'applicant'])";
 assert.equal(result.split(banned).length,3,"Expected exactly two role deny guards");
 result=result.split(banned).join("&& p.role in ['resident', 'volunteer']");
 const a=result.indexOf("      function validResidentAssistanceCreate()");
 const b=result.indexOf("      function validAdminLocationState()",a);
 assert(a>0&&b>a);
 let create=result.slice(a,b);
 const k=create.indexOf("        && rd.requestGroup in [");
 const z=create.indexOf("        && validAssistanceCategoryPair()",k);
 assert(k>0&&z>k&&create.slice(k,z).includes("'other_community_assistance'"));
 create=create.slice(0,k)+"        // Both enums are enforced by the category-pair validator below.\n".replace("\n","\n")+create.slice(z);
 result=result.slice(0,a)+create+result.slice(b);
 const i=result.indexOf("      function validAdminAssistanceUpdate()");
 const j=result.indexOf("        && rd.status in [",i);
 assert(i>0&&j>i);
 let part=result.slice(i,j);
 const fields=part.match(/\.hasOnly\(\[([\s\S]*?)\]\)/)[1];
 let count=0;
 part=part.replace(/\n        && rd\.(\w+)\s*== resource\.data\.\1/g,(full,key)=>{
  assert(!fields.includes("'"+key+"'"),"Mutable Assistance key removed "+key);
  count++;return "";
 });
 assert.equal(count,20,"Exactly twenty immutable Assistance comparisons removed");
 result=result.slice(0,i)+part+result.slice(j);
 const x=result.indexOf("    match /barangayReliefAllocations/{allocationId}");
 const y=result.indexOf("    match /",x+8);
 assert(x>0&&y>x);
 let allocation=result.slice(x,y);
 const u=allocation.indexOf("      allow update: if isAdmin()");
 const v=allocation.indexOf("        && request.resource.data.updatedBy",u);
 assert(u>0&&v>u);
 const whitelist=allocation.slice(v).match(/\.hasOnly\(\[([\s\S]*?)\]\)/)[1];
 let chunk=allocation.slice(u,v),countAlloc=0;
 chunk=chunk.replace(/\n        && request\.resource\.data\.(\w+)\s*== resource\.data\.\1/g,(full,key)=>{
  assert(!whitelist.includes("'"+key+"'"),"Mutable Allocation key removed "+key);
  countAlloc++;return "";
 });
 assert.equal(countAlloc,10,"Exactly ten immutable Allocation comparisons removed");
 allocation=allocation.slice(0,u)+chunk+allocation.slice(v);
 result=result.slice(0,x)+allocation+result.slice(y);
 // Reconstruct exact caching of repeated read functions within same match.
 for(const [fn,deps] of [
  ["incomingVolunteerIsApproved",["incomingVolunteerProfile"]],
  ["validInventoryReservation",["allocationInventoryBefore","allocationInventoryAfter"]],
  ["validCompletedInventoryReconciliation",["allocationInventoryBefore","allocationInventoryAfter"]],
  ["validCancelledInventoryReconciliation",["allocationInventoryBefore","allocationInventoryAfter"]]
 ]){
  const start=result.indexOf("      function "+fn+"() {");
  const end=result.indexOf("      }",start);
  assert(start>0&&end>start,"Reviewed helper missing "+fn);
  let content=result.slice(start,end+7);
  const variable={incomingVolunteerProfile:"volunteer",
   allocationInventoryBefore:"inventoryBefore",allocationInventoryAfter:"inventoryAfter"};
  for(const name of deps){
   assert(content.split(name+"()").length>=3,"Must cache repeated reads of "+name);
   content=content.replaceAll(name+"()",variable[name]);
  }
  const defs=deps.map(name=>"        let "+variable[name]+" = "+name+"();").join("\n");
  content=content.replace("      function "+fn+"() {\n",
   "      function "+fn+"() {\n"+defs+"\n");
  result=result.slice(0,start)+content+result.slice(end+7);
 }
 // One loaded proposal snapshot replaces twenty-seven identical getAfter reads
 // while preserving every allow-create condition in original order.
 const es=result.indexOf("    match /communityEvents/{eventId} {");
 const ee=result.indexOf("    match /",es+8);
 assert(es>0&&ee>es);
 let eventRules=result.slice(es,ee);
 const first=eventRules.indexOf("        && proposalAfter().status == 'approved'");
 const last=eventRules.indexOf("        && request.resource.data.proposerName == proposalAfter().proposerName;",first);
 assert(first>0&&last>first);
 const tailEnd=last+"        && request.resource.data.proposerName == proposalAfter().proposerName;".length;
 const tailOriginal=eventRules.slice(first,tailEnd);
 assert.equal((tailOriginal.match(/proposalAfter\(\)/g)||[]).length,27);
 const tail=tailOriginal.replaceAll("proposalAfter()","proposal")
  .replace(/^        && proposal\.status/,"        return proposal.status");
 const helper="      // Keep approved proposal state loaded once for the entire guarded creation.\n"+
  "      function validApprovedProposalCopy() {\n"+
  "        let proposal = proposalAfter();\n"+tail+"\n      }\n\n";
 const insert=eventRules.indexOf("      // The query on the client");
 assert(insert>=0&&insert<first);
 eventRules=eventRules.slice(0,first)+"        && validApprovedProposalCopy();"+eventRules.slice(tailEnd);
 eventRules=eventRules.slice(0,insert)+helper+eventRules.slice(insert);
 result=result.slice(0,es)+eventRules+result.slice(ee);
 return result;
}
const optimized=optimizedRules(expected);
// Re-prove exactly the already-merged first refactor against its frozen Git SHA.
// The second reviewed candidate is separately immutable-pinned by Git blob SHA;
// Firebase emulators then exercise its *actual* permission semantics.
const mergedRules=cp.execFileSync("git",["show",
 "f25ce81ce951d86fa7fe692c4be056c898810981:firestore.rules"],{encoding:"utf8"});
assert.equal(mergedRules,optimized,
 "BLOCKED: protected pass-one source is not the reviewed baseline");
// Guarded compiler optimization, no other permission changes permitted.
const frozenPassTwo=cp.execFileSync("git",["show","5dd65a7f1e65b281e277d051b5e60ca09fbaaaa6:firestore.rules"],{encoding:"utf8"});
const oldReviewAllow="      allow create: if isAdmin()\n        && validReviewPayload()\n        && request.resource.data.reviewStatus == 'in_progress'\n        && request.resource.data.finalDecision == 'pending'\n        && request.resource.data.finalDecisionReason == ''\n        && request.resource.data.finalDecisionAt == null\n        && request.resource.data.finalDecisionBy == ''\n        && request.resource.data.createdBy == request.auth.uid\n        && validFinalDecisionState();\n      allow update: if isAdmin()\n        && resource.data.finalDecision in [\n          'pending',\n          'needs_more_information'\n        ]\n        && request.resource.data.requestId == resource.data.requestId\n        && request.resource.data.requesterUid == resource.data.requesterUid\n        && request.resource.data.category == resource.data.category\n        && request.resource.data.createdAt == resource.data.createdAt\n        && request.resource.data.createdBy == resource.data.createdBy\n        && validReviewPayload()\n        && validFinalDecisionState();\n";
const sharedReviewAllow="      // Shared validations are compiled once; the method-specific gates below\n      // reproduce the original create and update conditions without overlap.\n      allow create, update: if isAdmin()\n        && validReviewPayload()\n        && validFinalDecisionState()\n        && (\n          (\n            request.method == 'create'\n            && request.resource.data.reviewStatus == 'in_progress'\n            && request.resource.data.finalDecision == 'pending'\n            && request.resource.data.finalDecisionReason == ''\n            && request.resource.data.finalDecisionAt == null\n            && request.resource.data.finalDecisionBy == ''\n            && request.resource.data.createdBy == request.auth.uid\n          )\n          ||\n          (\n            request.method == 'update'\n            && resource.data.finalDecision in [\n              'pending',\n              'needs_more_information'\n            ]\n            && request.resource.data.requestId == resource.data.requestId\n            && request.resource.data.requesterUid == resource.data.requesterUid\n            && request.resource.data.category == resource.data.category\n            && request.resource.data.createdAt == resource.data.createdAt\n            && request.resource.data.createdBy == resource.data.createdBy\n          )\n        );\n";
assert.equal(frozenPassTwo.split(oldReviewAllow).length,2,"Original staff-assisted review gates unexpectedly changed");
const expectedOptimized=frozenPassTwo.replace(oldReviewAllow,sharedReviewAllow);
assert.equal(current,expectedOptimized,"BLOCKED: outside reviewed create/update Rules permission gates changed");
assert(current.includes("request.method == 'create'") && current.includes("request.method == 'update'"),"BLOCKED: create/update operation gates missing");
const actualGitBlob=cp.execFileSync("git",["hash-object","firestore.rules"],{encoding:"utf8"}).trim();
assert.equal(actualGitBlob,"afd5adca77292d01e6aeab13465736aa2f6882f4","BLOCKED: optimized Rules blob differs from approved revision");
const paths=text=>[...text.matchAll(/^    match \\/(.+) \\{/gm)].map(m=>m[1]);
assert.deepEqual(paths(current),paths(frozenPassTwo),"BLOCKED: an original Firestore match was changed");
const statements=text=>[...text.matchAll(/\\ballow (?:get|list|read|write|create|update|delete)/g)].length;
assert.equal(statements(current),statements(frozenPassTwo)-1,"BLOCKED: unrelated allow methods were changed");
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
console.log("PASS: "+checks+" staff-role checks, immutable merged baseline and hash-pinned second-pass Rules; no live writes.");
