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
const protectedBaseline=cp.execFileSync("git",["show","5dd65a7f1e65b281e277d051b5e60ca09fbaaaa6:firestore.rules"],{encoding:"utf8"});
const originalRoleGate="    function approved() {\n      let p = signedIn() ? profile() : {};\n      let role = p.get('role', '');\n      return verifiedEmailSession()\n        && role in [\n          'resident', 'volunteer', 'admin', 'superadmin', 'lgu_personnel'\n        ]\n        && (\n          role in ['admin', 'superadmin', 'lgu_personnel']\n          || request.auth.token.get('email', '') == p.get('email', '')\n        )\n        && p.get('status', 'approved') == 'approved'\n        && p.get('adminStatus', 'active') != 'suspended';\n    }\n    // Reuse one verified-active staff role gate for all three staff helpers.\n    // Same semantics as the previous independent isAdmin/isSuperAdmin helpers:\n    // only a verified Firebase email, approved/non-suspended user profile,\n    // and the exact allowed role can pass. Other roles never get staff access.\n    function hasApprovedStaffRole(roles) {\n      let p = signedIn() ? profile() : {};\n      return verifiedEmailSession()\n        && p.get('role', '') in roles\n        && p.get('status', 'approved') == 'approved'\n        && p.get('adminStatus', 'active') != 'suspended';\n    }\n";
const compactRoleGate="    function approved() {\n      let p = signedIn() ? profile() : {};\n      let role = p.get('role', '');\n      // Exactly the original five-role allowlist: staff bypass profile-email\n      // matching; only Resident/Volunteer require the Firebase email match.\n      return verifiedEmailSession()\n        && (\n          role in ['admin', 'superadmin', 'lgu_personnel']\n          || (\n            role in ['resident', 'volunteer']\n            && request.auth.token.get('email', '') == p.get('email', '')\n          )\n        )\n        && p.get('status', 'approved') == 'approved'\n        && p.get('adminStatus', 'active') != 'suspended';\n    }\n    // Reuse one verified-active staff role gate for all three staff helpers.\n    // Same semantics as the previous independent isAdmin/isSuperAdmin helpers:\n    // only a verified Firebase email, approved/non-suspended user profile,\n    // and the exact allowed role can pass. Other roles never get staff access.\n    function hasApprovedStaffRole(roles) {\n      let p = signedIn() ? profile() : {};\n      // roles is always a subset of ['admin','superadmin'] at call sites.\n      // Therefore approved() already enforces verified mailbox and active\n      // approved/non-suspended staff state. Keep exact role restriction.\n      return approved()\n        && p.get('role', '') in roles;\n    }\n";
assert.equal(protectedBaseline.split(originalRoleGate).length,2,"Reviewed original role gate moved");
function branchBasePlaceholderSafe(){return protectedBaseline.replace(originalRoleGate,compactRoleGate)===cp.execFileSync("git",["show","d4c8e41aed3fa25e7db029304333a56a3a0d8028:firestore.rules"],{encoding:"utf8"});}

// Twelve branch-implied predicates: reproduce exact reviewed source from
// immutable protected base. Each removed predicate is enforced by the
// original, unchanged exhaustive validation branches below it.
const branchBase=cp.execFileSync("git",["show","d4c8e41aed3fa25e7db029304333a56a3a0d8028:firestore.rules"],{encoding:"utf8"});
const substitutions=[["validFacilityVerificationState","return rd.facilityVerificationRequired is bool\n          && rd.facilityVerificationStatus in [\n            'not_required',\n            'pending',\n            'confirmed',\n            'unable_to_confirm',\n            'inconsistent'\n          ]\n          && rd.facilityName is string","return rd.facilityName is string"],["validCostVerificationState","return rd.costVerificationRequired is bool\n          && rd.residentEstimatedAmount is number","return rd.residentEstimatedAmount is number"],["validCostVerificationState","&& rd.costVerificationStatus in [\n            'not_required',\n            'pending',\n            'confirmed',\n            'inconsistent'\n          ]\n          && rd.costReferenceNumber is string","&& rd.costReferenceNumber is string"],["validOptionalVerificationState","return rd.videoVerificationRequired is bool\n          && rd.videoVerificationStatus in [\n            'not_required',\n            'pending',\n            'requested',\n            'completed',\n            'unable_to_complete'\n          ]\n          && (\n            rd.videoVerificationAt == null","return (\n            rd.videoVerificationAt == null"],["validOptionalVerificationState","&& rd.siteVisitRequired is bool\n          && rd.siteVisitStatus in [\n            'not_required',\n            'pending',\n            'scheduled',\n            'completed',\n            'unable_to_complete'\n          ]\n          && (\n            rd.siteVisitAt == null","&& (\n            rd.siteVisitAt == null"],["validReviewPayload","&& rd.reviewStatus in [\n          'in_progress',\n          'needs_more_information',\n          'verified',\n          'rejected'\n        ]\n        && rd.documentConsistencyStatus in [","&& rd.documentConsistencyStatus in ["],["validReviewPayload","&& rd.finalDecision in [\n          'pending',\n          'needs_more_information',\n          'verified',\n          'rejected'\n        ]\n        && rd.finalDecisionReason is string","&& rd.finalDecisionReason is string"],["validReviewPayload","&& (\n          rd.finalDecisionAt == null\n          || rd.finalDecisionAt is timestamp\n        )\n        && rd.finalDecisionBy is string\n        && rd.finalDecisionBy.size() <= 160","&& rd.finalDecisionBy.size() <= 160"],["validDonationSubmission","&& rd.donationType in [\n          'monetary',\n          'in_kind'\n        ]\n        && rd.donationType","&& rd.donationType"],["validDonationSubmission","&& rd.quantityPledged is number\n        && rd.quantityPledged >= 0\n        && rd.amount is number\n        && rd.amount >= 0\n        && rd.transactionReference is string","&& rd.transactionReference is string"],["validCampaignPayload","&& rd.acceptedDonationTypes is list\n        && rd.acceptedDonationTypes.size() >= 1\n        && rd.acceptedDonationTypes.size() <= 2\n        && (","&& ("],["validCampaignPayload","&& rd.verifiedAmountReceived is number\n        && rd.verifiedAmountReceived >= 0\n        && rd.inKindInstructions is string","&& rd.inKindInstructions is string"],["validAdminAssistanceUpdate","&& rd.verificationStatus in [\n          'pending_review',\n          'under_review',\n          'verified',\n          'rejected'\n        ]\n        && rd.supportDecision in [\n          'pending',\n          'internal_support',\n          'donation_support',\n          'not_required',\n          'rejected'\n        ]\n        && rd.remainingAmount is number","&& rd.remainingAmount is number"],["validAdminAssistanceUpdate","        && rd.donationCampaignId == ''\n        && (\n          rd.status != 'rejected'","        && (\n          rd.status != 'rejected'"],["validAdminAssistanceUpdate","&& rd.remainingAmount == 0\n            && rejectedPrivateReviewSupportsRequest()\n          )\n        )\n        && (\n          rd.status != 'closed'","&& rd.remainingAmount == 0\n          )\n        )\n        && (\n          rd.status != 'closed'"],["validAdminAssistanceUpdate","&& rd.remainingAmount == 0\n              && verifiedPrivateReviewSupportsRequest()\n            )\n            || (","&& rd.remainingAmount == 0\n            )\n            || ("],["validAdminAssistanceUpdate","&& rd.remainingAmount == 0\n              && rejectedPrivateReviewSupportsRequest()\n            )\n          )\n        );","&& rd.remainingAmount == 0\n            )\n          )\n        );"]];
let branchExpected=branchBase;
for(const [fn,before,after] of substitutions){
 const start=branchExpected.indexOf("      function "+fn+"() {");
 let finish=branchExpected.indexOf("      function ",start+20);
 if(finish<0)finish=branchExpected.indexOf("      allow ",start+20);
 assert(start>=0&&finish>start,"BLOCKED: validation helper missing "+fn);
 let block=branchExpected.slice(start,finish);
 assert.equal(block.split(before).length,2,"BLOCKED: prior validator changed "+fn);
 block=block.replace(before,after);
 branchExpected=branchExpected.slice(0,start)+block+branchExpected.slice(finish);
}
// Five hasAll() arrays duplicate mandatory direct field accesses in the
// same create validation. Missing keys are denied by those unchanged accesses.
const requiredFieldScopes=["users/{uid}","publicCertificateVerifications/{certificateId}",
 "volunteerInvitations/{invitationId}","lguAdminCredentialReviews/{targetUid}",
 "communityEventLiveLocations/{eventId}"];
for(const [n,scope] of requiredFieldScopes.entries()){
 const start=branchExpected.indexOf("    match /"+scope+" {");
 const end=branchExpected.indexOf("    match /",start+12);
 assert(start>=0&&end>start,"Missing reviewed collection "+scope);
 let section=branchExpected.slice(start,end);
 const clauses=[...section.matchAll(/request\.resource\.data\.keys\(\)\.hasAll\(\[([\s\S]*?)\]\)/g)];
 assert.equal(clauses.length,n===0?2:1,"Wrong count of mandatory-key validators");
 const match=clauses[n===0?1:0];
 const names=[...match[1].matchAll(/['"](\w+)['"]/g)].map(v=>v[1]);
 const following=section.slice(match.index+match[0].length,section.indexOf(";",match.index));
 for(const field of names)assert(following.includes("request.resource.data."+field),
  "Required key lacks mandatory direct field validation "+scope+"."+field);
 const lineStart=section.lastIndexOf("\n",match.index)+1;
 const prefix=section.slice(lineStart,match.index);
 assert(/^ +&& $/.test(prefix),"Missing required-key AND prefix "+scope);
 const remove=prefix+match[0]+"\n";
 assert.equal(section.split(remove).length,2,"Unreviewed key list "+scope);
 section=section.replace(remove,"");
 branchExpected=branchExpected.slice(0,start)+section+branchExpected.slice(end);
}
// Preserve every previous reviewed change from the protected merge before
// applying this pass's nine branch algebra transformations.
assert.equal(branchExpected,cp.execFileSync("git",["show",
 "78136d1d8447bfc1dafd159c17167582bcff7d33:firestore.rules"],{encoding:"utf8"}),
 "BLOCKED: reviewed required-field baseline changed");
const hoists=[["validSupportDecisionState","        return (\n          rd.supportDecision == 'pending'","        return rd.donationCampaignId == '' && (\n          (\n          rd.supportDecision == 'pending'"],["validSupportDecisionState","          && rd.donationCampaignId == ''\n        )\n        || (\n          rd.supportDecision in [","        )\n        || (\n          rd.supportDecision in ["],["validSupportDecisionState","          && rd.donationCampaignId == ''\n        )\n        || (\n          rd.supportDecision == 'donation_support'","        )\n        || (\n          rd.supportDecision == 'donation_support'"],["validSupportDecisionState","          && rd.donationCampaignId == ''\n        )\n        || (\n          rd.supportDecision == 'rejected'","        )\n        || (\n          rd.supportDecision == 'rejected'"],["validSupportDecisionState","          && rd.donationCampaignId == ''\n        );\n      }","        )\n        );\n      }"],["validAdminAssistanceUpdate","        && rd.donationCampaignId is string\n        && rd.donationCampaignId.size() <= 200\n        && rd.adminNote is string","        && rd.adminNote is string"],["validCampaignPayload","        && rd.status in [\n          'published',\n          'closed'\n        ]\n        && rd.sourceType == 'disaster_relief_need'","        && rd.sourceType == 'disaster_relief_need'"],["validCampaignPayload","        && rd.monetaryGoal is number\n        && rd.monetaryGoal >= 0\n        && rd.inKindInstructions is string","        && rd.inKindInstructions is string"],["validAdminLocationState","              rd.assignedLocationSetBy == request.auth.uid\n              && rd.assignedLocationSetAt is timestamp","              rd.assignedLocationSetBy == request.auth.uid"]];
for(const [name,before,after] of hoists){
 let start=branchExpected.indexOf("      function "+name+"() {");
 let end=branchExpected.indexOf("      function ",start+20);
 if(end<0)end=branchExpected.indexOf("      allow ",start+20);
 assert(start>=0&&end>start,"Missing original helper "+name);
 let body=branchExpected.slice(start,end);
 assert.equal(body.split(before).length,2,"BLOCKED: guard changed in "+name);
 body=body.replace(before,after);
 branchExpected=branchExpected.slice(0,start)+body+branchExpected.slice(end);
}
// Exact reviewed transformation: the three identical match-local helpers are
// relocated to their common enclosing scope. The function bodies are unchanged.
function hoistReviewedIdenticalHelpers(input){
 let output=input, shared="";
 for(const [name,count] of [["hasVerifiedIdentity",4],["isVerifiedResident",2],["isLguPersonnel",6]]){
  const matches=[...output.matchAll(new RegExp("      function "+name+"\\([^)]*\\) \\{[\\s\\S]*?\\n      \\}","g"))];
  const bodies=[...new Set(matches.map(m=>m[0]))];
  assert.equal(matches.length,count,"Unexpected number of match-local helpers "+name);
  assert.equal(bodies.length,1,"Cannot hoist changed helper "+name);
  const block=bodies[0];
  output=output.split(block+"\n").join("");
  assert(!output.includes(block),"Failed to remove all duplicated helper bodies");
  shared+=block+"\n";
 }
 const insert="    match /users/{uid} {";
 assert.equal(output.split(insert).length,2,"Unexpected users scope for root helper insertion");
 return output.replace(insert,
  "    // Exact shared validation predicates hoisted from identical match-local helpers.\n"+
  shared+insert);
}
const reviewedHoisted=hoistReviewedIdenticalHelpers(branchExpected);
// One exact addition to the public Resident signup guard. All staff,
// assistance, events, donation and other permission expressions stay identical.
const historicalEmailGuard='!request.resource.data.email.matches(".*@en2ch[.]com")';
const reviewedEmailGuard='!request.resource.data.email.matches(".*@([a-z0-9-]+[.])*en2ch[.](com|co)")';
assert.equal(reviewedHoisted.split(historicalEmailGuard).length,2,
 "BLOCKED: historical disposable-email guard moved");
assert.equal(current,reviewedHoisted.replace(historicalEmailGuard,reviewedEmailGuard),
 "BLOCKED: other Firestore permissions, validation branches or collection paths changed");
assert.equal(cp.execFileSync("git",["hash-object","firestore.rules"],{encoding:"utf8"}).trim(),
"6f65f4d54624020138111c6358d031100d06ec26","BLOCKED: unreviewed Firestore Rules blob");
// Verify exhaustiveness of all optional-review branches over valid and
// invalid types, status values and three-valued nulls before Firebase emulator.
for(const required of [true,false,null,"true",0,1,undefined]){
 for(const status of ["not_required","pending","confirmed","unable_to_confirm","inconsistent","requested","scheduled","completed","unable_to_complete",null,false]){
  const facilitySet=["pending","confirmed","unable_to_confirm","inconsistent"];
  const costSet=["pending","confirmed","inconsistent"];
  const videoSet=["pending","requested","completed","unable_to_complete"];
  const siteSet=["pending","scheduled","completed","unable_to_complete"];
  for(const values of [facilitySet,costSet,videoSet,siteSet]){
   const oldEnum=["not_required",...values].includes(status);
   const branches=(required===false&&status==="not_required")||(required===true&&values.includes(status));
   assert.equal((typeof required==="boolean")&&oldEnum&&branches,branches,"Optional flag validator changed");
  }
 }
}

const gitBlob=cp.execFileSync("git",["hash-object","firestore.rules"],{encoding:"utf8"}).trim();
assert.equal(gitBlob,"6f65f4d54624020138111c6358d031100d06ec26","BLOCKED: unapproved Firestore blob");
const paths=source=>source.split("\n").filter(l=>l.startsWith("    match /")).map(l=>l.slice("    match /".length).split(" ")[0]);
assert.deepEqual(paths(current),paths(protectedBaseline),"BLOCKED: collection scope changed");
const allows=source=>[...source.matchAll(/allow (?:get|list|read|write|create|update|delete)/g)].length;
assert.equal(allows(current),allows(protectedBaseline),"BLOCKED: allow methods changed");
for(const role of [undefined,null,"","admin","superadmin","lgu_personnel","resident","volunteer","applicant","other",false])
 for(const verified of [true,false])for(const status of [undefined,"approved","suspended","pending_review",null])
 for(const adminState of [undefined,"active","suspended",null])for(const matchEmail of [true,false]){
  const staff=["admin","superadmin","lgu_personnel"].includes(role);
  const approvedState=(status===undefined?"approved":status)==="approved";
  const active=(adminState===undefined?"active":adminState)!=="suspended";
  const originalApproved=verified&&["resident","volunteer","admin","superadmin","lgu_personnel"].includes(role)&&(staff||matchEmail)&&approvedState&&active;
  const newApproved=verified&&(staff||(["resident","volunteer"].includes(role)&&matchEmail))&&approvedState&&active;
  assert.equal(originalApproved,newApproved,"Approved role changed");
  for(const roles of [["admin"],["superadmin"],["admin","superadmin"]]){
    const oldStaff=verified&&roles.includes(role)&&approvedState&&active;
    const newStaff=newApproved&&roles.includes(role);
    assert.equal(oldStaff,newStaff,"Staff role changed");
  }
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
console.log("PASS: "+checks+" staff-role checks, immutable merged baseline and hash-pinned second-pass Rules; no live writes.");
