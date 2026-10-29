"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");
const engine = read("identity-ai/main.py");
const document = read("identity-ai/document_screening.py");
const backend = read("backend/server.js");
const shared = read("lib/identityVerification.ts");
const web = read("app/identity-verification.web.tsx");
const native = read("app/identity-verification.tsx");
const lgu = read("app/(admin)/identity-reviews.tsx");
const summary = read("components/identity/DocumentScreeningSummary.tsx");

assert(engine.includes("pytesseract.image_to_string") &&
  engine.includes("assess_document_text") &&
  engine.includes('"/verify"') &&
  engine.includes('"documentScreening": document_screening'),
  "Python service must do actual OCR screening for the existing face comparison endpoint");
assert(document.includes('"authenticityVerified": False') &&
  document.includes('"livenessVerified": False') &&
  document.includes('"manualReviewRequired": True') &&
  !document.includes('return {"verified": True}'),
  "OCR keyword recognition cannot authenticate a document or a living person");
assert(backend.includes("normalizeIdDocumentScreening") &&
  backend.includes("documentScreening,") &&
  backend.includes('const rawDecision = normalizeAiDecision') &&
  backend.includes('documentScreening.authenticityVerified !== true') &&
  backend.includes('aiResult?.livenessImplemented !== true'),
  "Node must preserve sanitized screening for the LGU and prevent unsupported automatic verification");
assert(backend.includes('identityVerificationAttempts') &&
  backend.includes('requiresManualReview: result.requiresManualReview') &&
  backend.includes('requireOperationalAdmin'),
  "Original audited manual review and attempt protections must remain in place");
assert(shared.includes("parseDocumentScreening") &&
  shared.includes("documentScreening: parseDocumentScreening(body?.documentScreening)") &&
  shared.includes("documentScreeningLabel"),
  "Use one typed, privacy-safe response parser in both app platforms");
for (const page of [web, native]) {
  assert(page.includes('<DocumentScreeningSummary screening={documentScreening} />') &&
    page.includes('documentScreening: result.documentScreening') &&
    page.includes('documentScreening={statusResult?.documentScreening}'),
    "Both Resident web and mobile must display the same screening results");
}
assert(lgu.includes('<DocumentScreeningSummary screening={item.documentScreening} />') &&
  lgu.includes('DocumentScreening') &&
  lgu.includes("LGU Validation"),
  "LGU review must see the SAME assessment before independently verifying identity");
assert(summary.includes("authenticity") && !summary.includes("ID image") &&
  summary.includes("Independent LGU verification is required."),
  "Shared display must avoid false issuance claims or exposed ID scans");
console.log("PASS unified Resident/LGU ID-document assessment, face comparison, safe metadata and manual review");
