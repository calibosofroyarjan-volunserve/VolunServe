"use strict";
/** Source-only regression: restores historical routes, never a replacement AI. */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const { test } = require("node:test");

const node = fs.readFileSync("backend/server.js", "utf8");
const python = fs.readFileSync("identity-ai/main.py", "utf8");
const evidence = fs.readFileSync("backend/identityPrivateEvidence.js", "utf8");

function functionCode(source, name) {
  const begin = source.indexOf("def " + name + "(");
  assert(begin >= 0, "Missing original Python function " + name);
  const possibleEnds = [
    source.indexOf("\ndef ", begin + 1),
    source.indexOf("\nasync def ", begin + 1),
    source.indexOf("\n@app.", begin + 1),
  ].filter(x => x > begin);
  return source.slice(begin, possibleEnds.length ? Math.min(...possibleEnds) : undefined).trim();
}
test("Original 1:1 MediaPipe face matching function remains byte-for-byte from protected live source", () => {
  const original = cp.execFileSync("git", [
    "show", "origin/live-protected:identity-ai/main.py",
  ], { encoding: "utf8" });
  assert.equal(functionCode(python, "run_face_verification"),
    functionCode(original, "run_face_verification"));
});

test("The two original deployed frontend paths are authenticated on restored Node gateway", () => {
  assert(node.includes('["/api/identity/document/precheck", "/api/identity/document/precheck-with-evidence"]'));
  assert(node.includes('["/api/identity/verify", "/api/identity/verify-with-evidence"]'));
  assert(node.includes('request.path === "/api/identity/document/precheck-with-evidence"'));
  assert(node.includes('request.path === "/api/identity/verify-with-evidence"'));
  assert(node.includes('"X-VolunServe-Document-Precheck-Consent"'));
  assert(node.includes("requireFirebaseUser"));
  assert(node.includes("identityEvidenceConsent"));
});
test("Original private AI precheck only forwards ID evidence, no selfie/face attempt", () => {
  const start = python.indexOf("async def document_precheck(");
  const end = python.indexOf('@app.post(\n    "/verify"', start);
  assert(start >= 0 && end > start);
  const route = python.slice(start, end);
  assert(route.includes("require_internal_backend("));
  assert(route.includes("validate_forwarded_user("));
  assert(route.includes('form.get("idBackDocument")'));
  assert(route.includes('form.get("selfie") is not None'));
  assert(!route.includes("run_face_verification"));
  assert(!route.includes("identityVerified"));
});
test("School/employee IDs, unreadable back and weak evidence never auto-verify", () => {
  assert(python.includes("screening_ready_for_face_comparison("));
  assert(python.includes("blurry_national_id_claim_needs_review("));
  assert(node.includes("enforceSelectedIdDecision("));
  assert(node.includes("identityVerified: false"));
  assert(node.includes("reviewIssuerEvidence("));
  assert(node.includes("selectedIdRecognized("));
});
test("Admin review media is authenticated, private and time-limited", () => {
  assert(node.includes('"/api/admin/identity/reviews/:uid/evidence"'));
  assert(node.includes("requireOperationalAdmin"));
  assert(evidence.includes('type: "authenticated"'));
  assert(evidence.includes("RETENTION_DAYS = 30"));
  assert(evidence.includes("URL_LIFETIME_SECONDS = 180"));
  assert(node.includes("purgeExpiredIdentityEvidence("));
  assert(!evidence.includes("public_id: 'public'"));
});
