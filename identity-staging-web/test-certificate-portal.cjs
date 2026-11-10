"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {execFileSync} = require("node:child_process");

const html = fs.readFileSync("identity-staging-web/certificates.html","utf8");
const js = fs.readFileSync("identity-staging-web/certificates.js","utf8");
const identity = fs.readFileSync("identity-staging-web/index.html","utf8");

for (const source of [html,js]) {
  for (const forbidden of [
    "https://volunserve.onrender.com",
    "volunserve-3aa5b",
    "https://volunserve.com",
    "https://www.volunserve.com",
    "volunserve-identity-ai.onrender.com",
    "api.paymongo.com",
    "api.cloudinary.com",
  ]) assert.ok(!source.includes(forbidden), "Unsafe production target found: " + forbidden);
}
for (const exact of [
  'projectId:"volunserve-auth-staging"',
  'authDomain:"volunserve-auth-staging.firebaseapp.com"',
  'const backend = "https://volunserve-backend-staging.onrender.com"',
  'volunserve-identity-test-staging.onrender.com',
  'STAGING ISOLATION BLOCKED',
  "signInWithEmailAndPassword(auth, email, password)",
  "await getIdToken(currentUser)",
  "isApprovedAdmin(profile)",
  'new URL(backend).hostname !== "volunserve-backend-staging.onrender.com"',
  'await getDoc(doc(db, "publicCertificateVerifications", id))',
  'where("volunteerId", "==", currentUser.uid)',
  '"/api/admin/community-certificates/reconcile"',
  'body: JSON.stringify({eventId, execute})',
  'window.confirm("Issue eligible certificates in STAGING ONLY',
  'safePrintableText(',
]) assert.ok(js.includes(exact), "Required isolated functionality missing: " + exact);
for (const id of [
  "loginForm","email","password","authResult","loadEvents","eventList",
  "eventId","previewSync","issueSync","syncResult","loadCertificates",
  "certificateList","verifyId","verifyButton","verifyResult"
]) assert.ok(html.includes('id="'+id+'"'), "Missing staging certificate UI control: " + id);

assert.ok(identity.includes('href="./certificates.html"'), "Identity staging must link the new test portal");
assert.ok(html.includes('src="./certificates.js"'), "Staging portal JS must be loaded");
assert.ok(!js.includes("getStorage("), "No production/staging storage use needed for certificate test");
assert.doesNotMatch(js, /\b(?:setDoc|addDoc|updateDoc|deleteDoc|runTransaction)\s*\(/,
  "Do not write directly to staging Firestore; only approved certificate backend can issue");
assert.doesNotMatch(js, /\binnerHTML\s*=/, "Never interpret untrusted staging user/event data as HTML");
assert.ok(js.includes("previewedEvent !== eventId"),
  "Require read-only preflight before user initiates a staging issuance action");
assert.ok(js.includes("if (record.verificationStatus !== \"issued\")"),
  "Only issued staging certificates are printable");
assert.match(js, /new Set\(\[\s*"volunserve-identity-test-staging\.onrender\.com"/,
  "Direct staging portal should fail closed on other domains");

execFileSync(process.execPath,["--check","--input-type=module"],{
  input:js, stdio:["pipe","inherit","inherit"]
});
console.log("PASS: staging certificate portal syntax, credentials, Firestore read-only access, backend authorization, and isolation checks.");
