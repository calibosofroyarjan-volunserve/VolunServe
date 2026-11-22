"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const get = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("only authenticated operational Admins may request signed identity pictures", () => {
  const api = get("backend/server.js");
  assert.match(api, /"\/api\/admin\/identity\/reviews\/:uid\/evidence",\s*requireFirebaseUser,\s*requireOperationalAdmin,/);
  const handler = get("backend/identityEvidenceReviewHandler.js");
  assert.match(api, /createProtectedIdentityEvidenceHandler/);
  assert.match(handler, /privateIdentityEvidenceUrl\(data\.images\[side\]\)/);
  assert.match(handler, /identity_evidence_viewed/);
  assert.match(handler, /current\.verificationId !== data\.verificationId/);
  assert.match(handler, /expiryMs <= Date\.now\(\)/);
});
test("Admin decision requires unexpired matching images, not merely AI score", () => {
  const api = get("backend/server.js");
  assert.match(api, /identity_evidence_required/);
  assert.match(api, /!evidence\.images\?\.front/);
  assert.match(api, /!evidence\.images\?\.selfie/);
  assert.match(api, /evidence\.idType === "national_id" && !evidence\.images\?\.back/);
  assert.match(api, /evidence\.verificationId !== verification\.verificationId/);
});
test("Resident submission includes back of National ID and explicit evidence consent", () => {
  const lib = get("lib/identityVerification.ts");
  assert.match(lib, /input\.idType === "national_id" && !input\.idBack/);
  assert.match(lib, /appendMedia\(formData, "idBack", input\.idBack\)/);
  assert.match(lib, /formData\.append\("evidenceConsent", "true"\)/);
  for (const file of ["app/identity-verification.web.tsx", "app/identity-verification.tsx"]) {
    const client = get(file);
    assert.ok(client.includes("idBack"), file);
  }
});
test("Admin sees 3 original photos, side-by-side face review and image quality notices", () => {
  const reviewer = get("components/identity/AdminIdentityEvidence.tsx");
  const page = get("app/(admin)/identity-reviews.tsx");
  for (const label of ["National ID — Front", "National ID — Back", "Live Selfie"]) {
    assert.ok(reviewer.includes(label), label);
  }
  assert.match(reviewer, /Face Matching Review/);
  assert.match(reviewer, /ID Front — Portrait Reference/);
  assert.match(reviewer, /Captured Live Selfie/);
  assert.match(reviewer, /setExpanded\(null\)/);
  assert.match(reviewer, /Secure image links expired/);
  assert.match(page, /Image Quality Screening/);
  assert.match(page, /idImageQualityScore/);
  assert.match(page, /selfieQualityScore/);
  assert.match(page, /AdminIdentityEvidence uid=\{item\.uid\}/);
});
test("Identity evidence collection is not exposed by Firestore client rules", () => {
  const rules = get("firestore.rules");
  assert.ok(!rules.includes("match /identityEvidence/{"), "No client read rule permitted for private Admin evidence collection");
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
});

test("private image previews never carry over between Residents or submissions", () => {
  const reviewer = get("components/identity/AdminIdentityEvidence.tsx");
  const page = get("app/(admin)/identity-reviews.tsx");
  assert.match(reviewer, /loadedEvidence\?\.uid === uid/);
  assert.match(reviewer, /loadedEvidence\?\.verificationId === \(verificationId \|\| ""\)/);
  assert.match(reviewer, /body\.verificationId !== verificationId/);
  assert.match(reviewer, /expanded\.uid === uid/);
  assert.match(reviewer, /expanded\.verificationId === \(verificationId \|\| ""\)/);
  assert.match(page, /verificationId=\{item\.verificationId\}/);
});

test("Approve requires loaded protected images and an explicit signed-in Admin attestation", () => {
  const viewer = get("components/identity/AdminIdentityEvidence.tsx");
  const page = get("app/(admin)/identity-reviews.tsx");
  const backend = get("backend/server.js");
  const handler = get("backend/identityEvidenceReviewHandler.js");
  assert.match(viewer, /onEvidenceStateChange/);
  assert.match(viewer, /onLoad=\{/);
  assert.match(viewer, /loadedImageUrls\.includes/);
  assert.match(viewer, /requiredSides\.every/);
  assert.match(page, /I reviewed the submitted identity images/);
  assert.match(page, /evidenceAcknowledged/);
  assert.match(page, /imagesReviewed: action === "verify"/);
  assert.match(backend, /request\.body\?\.imagesReviewed !== true/);
  assert.match(backend, /identity_evidence_review_required/);
  assert.match(handler, /idType: cleanText\(data\.idType/);
});
test("mobile review focuses on selected Resident and has Back to Queue", () => {
  const page = get("app/(admin)/identity-reviews.tsx");
  assert.match(page, /mobileDetail = !wide && !!selected/);
  assert.match(page, /Back to identity verification queue/);
  assert.match(page, /!mobileDetail \? <View style=\{\[styles\.queue/);
  assert.match(page, /detailPanelCompact/);
});
