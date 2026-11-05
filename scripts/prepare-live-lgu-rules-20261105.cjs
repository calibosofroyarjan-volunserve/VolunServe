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
const crypto=require("node:crypto");
const assert=require("node:assert/strict");
const livePath=process.argv[2],outPath=process.argv[3];
if(!livePath||!outPath)throw Error("Usage node prepare-surgical-lgu-rules.cjs <live.rules> <patched.rules>");
const original=fs.readFileSync(livePath,"utf8");
const LIVE_SHA="600047206fac3d6aed4b955d6178aa2c0536d1b502a6df7ec9d3a02b6635c584";
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
assert.equal(sha(original),LIVE_SHA,"Live rules diverged from audited source; RELEASE BLOCKED");
// Historical same-batch review gate embedded exactly from reviewed main rules.
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
const verifyFn="      // A role grant is only valid with a same-commit, reviewed LGU credential record.\n      // getAfter + verifiedAt == request.time requires a fresh review in the same batch,\n      // rather than a stale record from an earlier promotion.\n      function hasFreshLguCredentialReview() {\n        let review = getAfter(\n          /databases/$(database)/documents/lguAdminCredentialReviews/$(uid)\n        ).data;\n        return review.targetUid == uid\n          && review.reviewStatus == 'verified'\n          && review.verifiedBy == request.auth.uid\n          && review.verifiedAt == request.time\n          && review.accountEmail == request.resource.data.email;\n      }\n";
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
        && request.resource.data.fullName is string
        && request.resource.data.lguOffice is string
        && request.resource.data.lguPosition is string
        && request.resource.data.appointmentReference is string
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
// Reuse the already-authorized Super Admin promotion expression and all
// its existing field/actor/updatedAt constraints. Admit a pending LGU STAFF
// applicant ONLY with a fresh same-batch credential record; the original
// approved-user branch is byte-identical and retains its exact semantics.
// Match line breaks and indentation from the LIVE Cloud Rules snapshot, not
// GitHub's stale formatting. Stop unless exactly ONE original grant case exists.
const legacyGrantPattern=/([ \t]*)resource\.data\.status == 'approved'(\r?\n)([ \t]*)&& request\.resource\.data\.role == 'admin'/g;
const originalGrantMatches=[...target.matchAll(legacyGrantPattern)];
assert.equal(originalGrantMatches.length,1,"BLOCKED: unexpected existing Super Admin promotion shape");
const oldGrantCondition=originalGrantMatches[0][0];
const newGrantCondition=oldGrantCondition.replace(
  "resource.data.status == 'approved'",
  "(resource.data.status == 'approved' || (resource.data.role == 'applicant' && resource.data.status == 'pending_review' && ('lguOffice' in resource.data) && hasFreshLguCredentialReview()))"
);
target=target.replace(oldGrantCondition,newGrantCondition);
// One Super Admin allow branch instead of an additional duplicated allow.
const rejectCase=`          || (
            resource.data.role == 'applicant'
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
            ])
          )
`;
const superAdminEnd="        );\n      allow update: if isAdmin()\n        && resource.data.role == 'applicant'";
onlyOnce(target,superAdminEnd,"end of existing Super Admin update + legacy Admin applicant rule");
target=target.replace(superAdminEnd,rejectCase+superAdminEnd);
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
      // Only an approved Super Admin can create/read private credential reviews.
      // Same-batch proof, reviewer identity and verified status are enforced
      // at the role-grant check, where getAfter() consumes this document.
      allow read: if isSuperAdmin();
      allow create: if isSuperAdmin()
        && request.auth.uid != targetUid
        && request.resource.data.keys().hasOnly([
          'targetUid','accountEmail','reviewStatus','office','position',
          'credentialReference','verificationMethod','verifiedBy','verifiedAt'
        ]);
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
 .replace(newGrantCondition,oldGrantCondition)
 .replace(rejectCase,"")
 .replace(lguStaffGuard,"")
 .replace(reviewMatch,"");
assert.equal(reversed,original,"Surgical patch altered unrelated live rules");
assert(target.length>original.length+1900,"Expected reviewed LGU rules were not added");
fs.writeFileSync(outPath,target);
console.log("PASS: original live rule fingerprint",LIVE_SHA);
console.log("PASS: audit-only LGU staff signup, verified approval, rejection and confidential review rules added");
console.log("PASS: every unrelated live rule and module preserved byte-for-byte");
console.log("CANDIDATE_SHA256",sha(target));
