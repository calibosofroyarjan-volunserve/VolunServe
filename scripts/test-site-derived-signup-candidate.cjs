#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const cp=require("node:child_process");
const BASE="f7bc8d12d8e926365175afb5288f2adf214025a5";
const changed=cp.execFileSync("git",["diff","--name-only",BASE,"HEAD"],{encoding:"utf8"})
 .trim().split("\n").filter(Boolean);
const allowed=new Set([
 "app/_layout.tsx","app/public/_layout.tsx","app/login.web.tsx","app/login.tsx",
 "app/admin-request.tsx","components/auth/EmailFirstSignup.tsx",
 "components/guest/GuestWorkspace.tsx","lib/firebaseAuth.ts",
 "lib/registrationEmailPolicy.ts","lib/requireCompleteResidentRegistration.ts",
 "lib/signupRegistration.ts","lib/userFacingError.ts","lib/verificationCooldown.ts",
 "scripts/test-site-derived-signup-candidate.cjs",
 ".github/workflows/validate-site-derived-signup-candidate.yml",
]);
assert(changed.length>0);
for(const p of changed) assert(allowed.has(p),"BLOCKED: unrelated published-website file modified: "+p);
for(const protectedPrefix of ["app/(admin)/","app/(superadmin)/","app/(tabs)/",
  "functions/","backend/","firebase.json","firestore.rules","storage.rules",
  "constants/","package.json","package-lock.json"]){
 assert(!changed.some(p=>p===protectedPrefix||p.startsWith(protectedPrefix)),
    "BLOCKED: protected deployed module/security/dependency changed: "+protectedPrefix);
}
for(const p of ["app/login.web.tsx","app/login.tsx","app/admin-request.tsx",
  "components/auth/EmailFirstSignup.tsx","components/guest/GuestWorkspace.tsx"]){
 const text=fs.readFileSync(p,"utf8");
 assert(text.includes("volunserveTypography as vsType"),"BLOCKED: lost published typography: "+p);
 assert(text.includes("vsType.size."),"BLOCKED: lost original font sizes: "+p);
}
const read=p=>fs.readFileSync(p,"utf8");
const root=read("app/_layout.tsx");
const signup=read("components/auth/EmailFirstSignup.tsx");
const auth=read("lib/firebaseAuth.ts");
const reg=read("lib/signupRegistration.ts");
const guest=read("app/public/_layout.tsx");
assert(root.includes("!authUser.emailVerified || !communityEmailMatches"));
assert(signup.includes("getResidentRegistrationFieldErrors"));
assert(signup.includes("verificationCooldownSeconds"));
assert(signup.includes("googleOnlyAccount"));
assert(auth.includes("requireCompleteResidentRegistration(data)"));
assert(auth.includes("getRegistrationEmailError(submittedEmail)"));
assert(reg.includes("getRegistrationEmailError(normalized)"));
assert(guest.includes("onAuthStateChanged(auth"));
assert(guest.includes("signOut(auth"));
assert(read("app/login.web.tsx").includes('signOut(auth).then(() => router.replace("/public"))'));
assert(read("app/login.tsx").includes('firebaseSignOut(auth).then(() => router.replace("/public"))'));
console.log(JSON.stringify({
 mode:"SOURCE_ONLY — NO DEPLOY",
 baseline:BASE,
 changedFiles:changed,
 protectedAdminVolunteerAndSystemFilesChanged:0,
 publishedBrandedTypography:"PRESERVED",
 verifiedSignupAndGuestGuards:"PRESENT",
 pending:"Verify compatibility with actual deployed Firestore Rules and complete live auth test before production release"
},null,2));
