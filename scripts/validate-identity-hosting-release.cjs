"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");

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
  "scripts/publish-identity-dob-rules-safely.cjs",
  ".github/workflows/release-identity-hosting-20261112.yml",
]);
const changed = git("diff","--name-only",pinned,"HEAD").split("\n").filter(Boolean);
assert(changed.length >= 8 && changed.every(path => allowed.has(path)),
  "Unexpected non-identity production hosting source change: " +
  changed.filter(path=>!allowed.has(path)).join(", "));
for(const path of ["functions","storage.rules","firebase.json",".firebaserc"]) {
  assert.equal(git("diff","--name-only",pinned,"HEAD","--",path),"",
    "Not allowed to change production "+path+" from Hosting release");
}
const backendChanged = git("diff","--name-only",pinned,"HEAD","--","backend")
  .split("\n").filter(Boolean);
assert(backendChanged.every(file=>file==="backend/test-firestore-dob-rules.js"),
  "Production backend source must remain untouched by the Hosting release");
// Production Rules differ from the old Hosting main branch. Reconstruct
// precisely the active Rules source reviewed on 2026-11-11, not main's copy.
const reviewed = execFileSync("git",["show",
  "origin/review/exact-active-firebase-rules-security-20261111:firestore.rules"],{encoding:"utf8"});
const start="      // STAGED ONLY: new community user profiles accept verified Yahoo or";
const stop="      // Firestore creation must enforce the same required inputs as the wizard.";
const first=reviewed.indexOf(start),last=reviewed.indexOf(stop);
assert(first>0&&last>first&&reviewed.indexOf(start,first+1)<0);
let before=reviewed.slice(0,first)+reviewed.slice(last);
for(const line of [
  "        && permittedNewResidentEmail()\\n",
  "        && permittedNewApplicantEmail()\\n",
]){
  assert.equal(before.split(line).length,2,"Reviewed helper changed.");
  before=before.replace(line,"");
}
const activeFingerprint=crypto.createHash("sha256").update(before).digest("hex");
assert.equal(activeFingerprint,
  "b4e67103503213bec28671f2dc2ab0440edd4e38a2ffd9d6ad6d2f93ccb9a269",
  "Reviewed Rules provenance differs from the verified active release.");
const candidate = fs.readFileSync("firestore.rules","utf8");
const oldField = "          'age',\\n          'email',\\n          'phoneNumber',";
const newField = "          'age',\\n          'dateOfBirth',\\n          'email',\\n          'phoneNumber',";
const anchor = "          'createdAt'\\n        ])\\n        && request.resource.data.role == 'resident'";
const guarded = [
  "          'createdAt'",
  "        ])",
  "        // New signup only; legacy profiles may lack exact birth date.",
  "        // Standard resident profile updates cannot edit this field.",
  "        && (",
  "          !('dateOfBirth' in request.resource.data)",
  "          || (",
  "            request.resource.data.dateOfBirth is string",
  "            && request.resource.data.dateOfBirth.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')",
  "          )",
  "        )",
  "        && request.resource.data.role == 'resident'"
].join("\\n");
assert.equal(before.split(oldField).length,2,"Active resident field block changed");
assert.equal(before.split(anchor).length,2,"Active resident create guard changed");
const expected = before.replace(oldField,()=>newField).replace(anchor,()=>guarded);
if(candidate!==expected)throw Error(
  "Security stop: candidate must equal verified active Rules + exact optional DOB guard."
);
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
