"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const {execFileSync}=require("node:child_process");
const html=fs.readFileSync("identity-staging-web/admin-reviews.html","utf8");
const js=fs.readFileSync("identity-staging-web/admin-reviews.js","utf8");
const guards=fs.readFileSync("identity-staging-web/admin-review-guards.mjs","utf8");
const home=fs.readFileSync("identity-staging-web/index.html","utf8");
for(const name of ["admin-reviews.js","admin-review-guards.mjs"]){
  assert(fs.existsSync("identity-staging-web/"+name),"Missing "+name);
}
for(const required of [
  'id="login"','id="logoutButton"','id="queue"','id="decisionForm"',
  'id="verify"','id="retry"','id="attestation"','id="filter"',
  'id="method"','id="notes"','id="pageCount"',
  'id="workspace"','class="hidden"','src="./admin-reviews.js"',
  "STAGING ONLY", "staging ID/selfie uploads remain disabled",
]){
  assert(html.includes(required),"Missing stage review guard "+required);
}
for(const required of [
  'const SITE = "volunserve-identity-test-staging.onrender.com"',
  'config.projectId === "volunserve-full-staging"',
  'const BACKEND = "https://volunserve-backend-staging.onrender.com"',
  'inMemoryPersistence','await setPersistence(auth,inMemoryPersistence)',
  "getIdToken(true)","Authorization:","Bearer ","credentials:\"omit\"",
  "onAuthStateChanged","clearPrivateState()","body.items",
  "/api/admin/identity/reviews","encodeURIComponent(item.uid)",
  '"POST"',"canVerify","canRequireRetry","window.confirm",
  "document.createElement","textContent","replaceChildren",
  "preserveNotice","loadReviews({preserveNotice:true})",
  "Staging operational Admin access confirmed",
]){
  assert(js.includes(required),"Missing authenticated staging control: "+required);
}
for(const forbidden of [
  "https://volunserve.onrender.com",
  "https://volunserve.com",
  "volunserve-3aa5b",
  "private_key",
  "firebase-admin",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "navigator.sendBeacon",
  ".innerHTML",
  "uploadBytes",
  "document.cookie",
  "getUserMedia",
]){
  assert(!js.includes(forbidden),"Unsafe Admin preview code: "+forbidden);
  assert(!html.includes(forbidden),"Unsafe Admin preview HTML: "+forbidden);
}
assert(home.includes('href="./admin-reviews.html"'),"Staging homepage must link to Admin review page");
assert(guards.includes("review?.status === \"pending\""));
assert(guards.indexOf('review?.manualReviewDecision === "retry_required"') <
       guards.indexOf('review?.status === "pending"'),
       "Final Retry decision must not be masked by stale pending record");
assert(guards.includes("passportMrzBirthDateCheck"));
assert(guards.includes("warningCodes.length > 0"));
assert(guards.includes("backSideScreened !== true"));
assert(guards.includes("attested === true"));
assert(guards.includes("MAX" )===false,"Unexpected global decision bypass guard");
execFileSync(process.execPath,["--check","--input-type=module"],{
  input:js,stdio:["pipe","inherit","inherit"],
});
execFileSync(process.execPath,["--test","identity-staging-web/test-admin-review-guards.mjs"],{
  stdio:"inherit",
});
console.log("PASS: authenticated Admin review stage page and client-side guard tests (NO DEPLOY).");
