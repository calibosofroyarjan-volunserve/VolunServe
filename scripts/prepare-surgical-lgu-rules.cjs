"use strict";
/**
 * Apply LGU staff rules to the EXACT audited live Firebase Rules snapshot.
 * This deliberately does NOT replace production with the repository firestore.rules,
 * which differs in many unrelated modules. It fails closed on any unexpected shape.
 *
 * Inputs: live snapshot path, candidate output path.
 * Historical reviewed fragments are extracted from the last audited hardening base,
 * and additions are restricted to /users/{uid} and /lguAdminCredentialReviews.
 */
const fs=require("node:fs");
const cp=require("node:child_process");
const crypto=require("node:crypto");
const assert=require("node:assert/strict");
const livePath=process.argv[2],outPath=process.argv[3];
if(!livePath||!outPath)throw Error("Usage node prepare-surgical-lgu-rules.cjs <live.rules> <patched.rules>");
const original=fs.readFileSync(livePath,"utf8");
const LIVE_SHA="67fb37a13603b172c9a9c8bea6037fb75243907dd8a98bd18d90466681816db0";
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
assert.equal(sha(original),LIVE_SHA,"Live rules diverged from audited source; RELEASE BLOCKED");
const hardened=cp.execFileSync("git",["show","4520b201c9f6e86f810d2b7c3c1377c158ac424e:firestore.rules"],{encoding:"utf8"});
let target=original;
const onlyOnce=(str,phrase,description)=>{
 const count=str.split(phrase).length-1;
 assert.equal(count,1,"Unexpected "+description+": expected 1 anchor, got "+count);
};
const slice=(text,start,end)=>{
 onlyOnce(text,start,"historical start "+start.slice(0,65));
 const p=text.indexOf(start);
 const q=text.indexOf(end,p+start.length);
 assert(q>p,"Missing historical end "+end.slice(0,60));
 return text.slice(p,q);
};
// 1) Extract the independently audited, time-locked human review function.
const verifyFn=slice(hardened,
"      // A role grant is only valid with a same-commit, reviewed LGU credential record.",
"      allow create: if signedIn()");
const usersCreate="      allow create: if signedIn()";
onlyOnce(target,"      function volunteerApplicationAfter()","live user's volunteer function");
const usersFunctionEnd="      allow create: if signedIn()";
const usersStart=target.indexOf("    match /users/{uid} {");
assert(usersStart>=0,"Live /users rule missing");
const functionStart=target.indexOf("      function volunteerApplicationAfter()",usersStart);
const residentCreate=target.indexOf(usersFunctionEnd,functionStart);
assert(residentCreate>functionStart && residentCreate-functionStart<450,"Unexpected resident create placement");
target=target.slice(0,residentCreate)+verifyFn+target.slice(residentCreate);
// 2) Exactly one new applicant-only create clause; resident and legacy workflows remain untouched.
// Compact but still exact-schema, unprivileged applicant-only create rule.
// Only the authenticated email owner can submit; status and privileges are fixed.
const createStaff=`      allow create: if signedIn()
        && request.auth.uid == uid
        && request.auth.token.get('email', '') == request.resource.data.email
        && request.resource.data.keys().hasOnly([
          'uid','email','fullName','age','phoneNumber','role','status',
          'residentAccess','volunteerAccess','region','province','city',
          'barangay','lguOffice','lguPosition','appointmentReference','createdAt'
        ])
        && request.resource.data.keys().hasAll([
          'uid','email','fullName','role','status','residentAccess',
          'volunteerAccess','lguOffice','lguPosition','appointmentReference','createdAt'
        ])
        && request.resource.data.uid == uid
        && request.resource.data.role == 'applicant'
        && request.resource.data.status == 'pending_review'
        && request.resource.data.residentAccess == false
        && request.resource.data.volunteerAccess == false
        && request.resource.data.province == 'Bulacan'
        && request.resource.data.city == 'City of San Jose del Monte'
        && request.resource.data.createdAt == request.time;
`;
onlyOnce(target,"      allow create: if isSuperAdmin()","live Super Admin user creation");
target=target.replace("      allow create: if isSuperAdmin()",createStaff+"      allow create: if isSuperAdmin()");
// 3) Independent Super Admin-only pending approval, with a fresh review in the same write batch.
const guardedGrant=`      // New LGU STAFF workflow: pending -> approved Admin only after a fresh
      // independent Super Admin credential review in the SAME atomic batch.
      allow update: if isSuperAdmin()
        && resource.data.role == 'applicant'
        && resource.data.status == 'pending_review'
        && ('lguOffice' in resource.data)
        && request.resource.data.role == 'admin'
        && request.resource.data.status == 'approved'
        && request.resource.data.adminStatus == 'active'
        && hasFreshLguCredentialReview()
        && request.resource.data.adminCreatedBy == request.auth.uid
        && request.resource.data.adminUpdatedBy == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'previousRole','previousPrimaryRole','role','adminStatus','status',
          'adminCreatedAt','adminCreatedBy','adminUpdatedAt','adminUpdatedBy'
        ]);
`;
const reject=`      // New LGU STAFF workflow: Super Admin review may reject pending staff.
      // No role elevation, applicant data deletion, or resident/volunteer privileges.
      allow update: if isSuperAdmin()
        && resource.data.role == 'applicant'
        && resource.data.status == 'pending_review'
        && ('lguOffice' in resource.data)
        && request.resource.data.status == 'rejected'
        && request.resource.data.reviewedBy == request.auth.uid
        && request.resource.data.reviewedAt == request.time
        && request.resource.data.rejectedReason is string
        && request.resource.data.rejectedReason.size() >= 10
        && request.resource.data.rejectedReason.size() <= 300
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'status','reviewedAt','reviewedBy','rejectedReason'
        ]);
`;
const superAdminUpdate="      allow update: if isSuperAdmin()";
onlyOnce(target,superAdminUpdate,"live Super Admin update permission");
target=target.replace(superAdminUpdate,guardedGrant+reject+superAdminUpdate);
// 4) Deny operational LGU Admin from reviewing LGU STAFF applications
// while preserving existing resident and volunteer application paths.
// The deployed Admin applicant rule has slightly different indentation than
// the latest source. Match it by syntax, never by a speculative literal string.
const adminApplicantRegex=/([ \t]*allow update: if isAdmin\(\)\r?\n[ \t]*&& resource\.data\.role == 'applicant'\r?\n)([ \t]*&& request\.resource\.data)/g;
const matches=[...target.matchAll(adminApplicantRegex)];
assert.equal(matches.length,1,"BLOCKED: cannot uniquely identify production LGU Admin applicant-update clause");
const newline=target.includes("\r\n")?"\r\n":"\n";
const lguStaffGuard="        && !('lguOffice' in resource.data)"+newline;
target=target.replace(adminApplicantRegex,(_,head,tail)=>head+lguStaffGuard+tail);
console.log("PASS current LGU Admin applicant handler now excludes LGU STAFF profiles");
// 5) Extract the audited private review-record validation block. Never store ID files here.
// Confidential reviewer-written reference metadata. Review requires an approved
// Super Admin and a same-commit verifiedAt timestamp; not client-controlled proof.
const reviewMatch=`    match /lguAdminCredentialReviews/{targetUid} {
      allow read: if isSuperAdmin();
      allow create: if isSuperAdmin()
        && request.auth.uid != targetUid
        && request.resource.data.keys().hasOnly([
          'targetUid','accountEmail','reviewStatus','office','position',
          'credentialReference','verificationMethod','verifiedBy','verifiedAt'
        ])
        && request.resource.data.targetUid == targetUid
        && request.resource.data.reviewStatus == 'verified'
        && request.resource.data.accountEmail is string
        && request.resource.data.office is string
        && request.resource.data.position is string
        && request.resource.data.credentialReference is string
        && request.resource.data.verificationMethod is string
        && request.resource.data.verifiedBy == request.auth.uid
        && request.resource.data.verifiedAt == request.time;
      allow update, delete: if false;
    }
`;
onlyOnce(target,"    match /adminLogs/{logId}","live Admin audit log rule");
if(target.includes("match /lguAdminCredentialReviews/"))throw Error("Review match already exists unexpectedly");
target=target.replace("    match /adminLogs/{logId}",reviewMatch+"    match /adminLogs/{logId}");
// Assert we did not modify any unrelated rule line.
// After removing exactly the five inserted blocks and one restricted condition,
// normalized output must match the exact deployed rules snapshot byte-for-byte.
let reversed=target
 .replace(verifyFn,"")
 .replace(createStaff,"")
 .replace(guardedGrant,"")
 .replace(reject,"")
 .replace(lguStaffGuard,"")
 .replace(reviewMatch,"");
assert.equal(reversed,original,"Surgical patch altered unrelated live rules");
assert(target.length>original.length+3000,"Expected reviewed LGU rules were not added");
fs.writeFileSync(outPath,target);
console.log("PASS: original live rule fingerprint",LIVE_SHA);
console.log("PASS: audit-only LGU staff signup, verified approval, rejection and confidential review rules added");
console.log("PASS: every unrelated live rule and module preserved byte-for-byte");
console.log("CANDIDATE_SHA256",sha(target));
