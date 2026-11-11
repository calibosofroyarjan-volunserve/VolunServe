"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const pinned = process.env.PINNED_MAIN_SHA;
assert.match(pinned || "", /^[0-9a-f]{40}$/);
const git = (...args) => execFileSync("git",args,{encoding:"utf8"}).trimEnd();
const allowed = new Set([
  "app/(admin)/identity-reviews.tsx",
  "app/identity-verification.tsx",
  "app/identity-verification.web.tsx",
  "app/signup.tsx",
  "components/auth/EmailFirstSignup.tsx",
  "components/identity/DocumentScreeningSummary.tsx",
  "lib/firebase.ts",
  "lib/firebaseAuth.ts",
  "lib/identityVerification.ts",
  "firestore.rules",
  "backend/test-firestore-dob-rules.js",
  "scripts/test-identity-camera-cancellation.cjs",
  "scripts/test-identity-staging-endpoint-allowlist.cjs",
  "scripts/test-staging-firebase-release-isolation.cjs",
  "scripts/validate-identity-hosting-release.cjs",
  ".github/workflows/release-identity-hosting-20261112.yml",
]);
const changed = git("diff","--name-only",pinned,"HEAD").split("\n").filter(Boolean);
assert(changed.length >= 8 && changed.every(path => allowed.has(path)),
  "Unexpected non-identity production hosting source change: " +
  changed.filter(path=>!allowed.has(path)).join(", "));
for(const path of ["backend","functions","storage.rules","firebase.json",".firebaserc"]) {
  assert.equal(git("diff","--name-only",pinned,"HEAD","--",path),"",
    "Not allowed to change production "+path+" from Hosting release");
}
const before = execFileSync("git",["show",pinned+":firestore.rules"],{encoding:"utf8"});
const candidate = fs.readFileSync("firestore.rules","utf8");
const oldField = "          'age',\n          'email',\n          'phoneNumber',";
const newField = "          'age',\n          'dateOfBirth',\n          'email',\n          'phoneNumber',";
const anchor = "          'createdAt'\n        ])\n        && request.resource.data.role == 'resident'";
const guarded = [
  "          'createdAt'",
  "        ])",
  "        // DOB is recorded only at signup. Existing profiles may lack it.",
  "        // Standard client profile updates cannot change DOB.",
  "        && (",
  "          !('dateOfBirth' in request.resource.data)",
  "          || (",
  "            request.resource.data.dateOfBirth is string",
  "            && request.resource.data.dateOfBirth.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')",
  "          )",
  "        )",
  "        && request.resource.data.role == 'resident'"
].join("\n");
assert.equal(before.split(oldField).length,2,"Original resident field block changed");
assert.equal(before.split(anchor).length,2,"Original resident create guard changed");
// Always use callbacks: replacement strings containing '$' must NOT expand as JS
// substitution tokens (especially '$\'' which previously duplicated the file).
const expected = before.replace(oldField,()=>newField).replace(anchor,()=>guarded);
assert.equal(candidate, expected,
  "FireStore Rules change must be exactly the optional canonical signup DOB guard.");
const id = fs.readFileSync("lib/identityVerification.ts","utf8");
const firebase = fs.readFileSync("lib/firebase.ts","utf8");
assert(id.includes("/api/identity/document/precheck") &&
       id.includes("X-VolunServe-Document-Precheck-Consent"),
       "No consent-based document precheck in Hosting UI");
assert(firebase.includes("volunserve-3aa5b") &&
       firebase.includes("usingStagingFirebase"),
       "Production vs staging Firebase isolation changed");
console.log("PASS: Hosting release is identity-scoped and preserves production rules.");
console.log("PASS: exact optional DOB-only rules delta, no live backend/functions changes.");
