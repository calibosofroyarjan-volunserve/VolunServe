"use strict";
// Tests the exact, pinned deployed-source snapshots for UI and Python AI
// against the scoped Node candidate. No credentials, real ID images or network.
const fs=require("node:fs");
const assert=require("node:assert/strict");
const path=require("node:path");
const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const base="backend/";
const web=".integration-audit/web/";
const ai=".integration-audit/ai/";
function check(source,parts,label) {
 for(const marker of parts)assert.ok(source.includes(marker),label+" missing "+marker);
}
const node=read(base+"server.js");
const gate=read(base+"selectedIdPolicy.js");
const issuer=read(base+"identityIssuerReviewPolicy.js");
const client=read(web+"lib/identityVerification.ts");
const browser=read(web+"app/identity-verification.web.tsx");
const native=read(web+"app/identity-verification.tsx");
const rules=read(web+"firestore.rules");
const python=read(ai+"identity-ai/main.py");
const ids=["national_id","drivers_license","passport","umid","prc_id"];

check(node,['"/api/identity/document/precheck"','"/api/identity/verify"','"/api/identity/status"',
 '"/api/admin/identity/reviews"','"/api/admin/identity/reviews/:uid/decision"',
 'requireFirebaseUser','requireOperationalAdmin','reviewIssuerEvidence(',
 'identityDocumentPrecheckThrottle','identityAttemptOutcome(',
 'enforceSelectedIdDecision(', 'identityExpectedName',
 'identityDocumentPrecheckThrottle','volunserve_ai','identityVerificationAttempts'],
 "Node");
check(client,['precheckIdentityDocument','submitIdentityVerification','getIdentityVerificationStatus',
 '/api/identity/document/precheck','/api/identity/verify','/api/identity/status',
 'X-VolunServe-Document-Precheck-Consent', 'idBackDocument', 'getAuthenticatedUser()'],
 "Web/native shared API client");
check(browser,['precheckIdentityDocument(', 'checkIdentityEngineReady(',
  'getIdentityVerificationStatus','documentConsent','idBackDocument','selfie',
  'Movement prompt completed (not proof of liveness)'], "Browser UI");
check(native,['precheckIdentityDocument(', 'checkIdentityEngineReady(',
  'idBackDocument','selfie','Face Scan'], "Native UI");
check(rules,["match /users/{uid}", "identityVerified == false",
 "identityStatus == 'basic'", "identityStatus == 'pending'",
 "function isVerifiedResident()"], "Hosting Firestore rules");
check(python,['@app.post(','"/verify"','"/document/precheck"',
 'require_internal_backend(', 'get_match_threshold(', 'face_mesh_engine_ready()',
 'run_face_verification(', 'issuerAuthenticityStatus', 'presentationAttackStatus'],
 "Deployed Python AI");
check(gate,['function enforceSelectedIdDecision(', 'manual_review','selectedIdRecognized'], "Backend allowlist");
check(issuer,['reviewIssuerEvidence','independentAdminCheckAttested','issuerAuthenticityAutomaticallyVerified:false'], "Issuer evidence");
for(const id of ids){
 assert.ok(gate.includes(id), "Backend missing ID "+id);
 assert.ok(python.includes(id), "AI missing ID "+id);
 assert.ok(client.includes(id), "Client missing ID "+id);
}
const verify=node.slice(node.indexOf('"/api/identity/verify"'),node.indexOf('"/api/admin/identity/reviews"'));
assert.ok(verify.length>5000,"Node submit route not found");
assert.ok(!/identityVerified:\s*true/.test(verify),"CRITICAL: AI submit route can write Verified Resident");
assert.ok(/identityVerified:\s*false/.test(verify),"AI result must remain unverified");
assert.ok(verify.includes('enforceSelectedIdDecision('),"Missing AI decision fail-closed policy");
assert.ok(!/livenessImplemented:\s*True/.test(python),"Python falsely claims liveness");
assert.ok(python.includes('"livenessImplemented": False'),"Python must not claim validated PAD");
assert.ok(python.includes('"idDocumentAuthenticityVerified": False'),"Python must not claim verified issuer authenticity");
console.log("PASS: deployed Python AI ↔ scoped Node gateway ↔ released web/native UI ↔ Firestore rules");
console.log("PASS: five allowed ID types, document precheck, Admin/manual-review-only status");
console.log("INFO: no real-camera, production authentication, PAD or issuer certification was performed");
