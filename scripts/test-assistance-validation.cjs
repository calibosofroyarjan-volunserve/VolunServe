"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const fileName = "lib/assistanceReviewValidation.ts";
const source = fs.readFileSync(fileName, "utf8");
const transpiled = ts.transpileModule(source, {
  fileName,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(transpiled.diagnostics?.length || 0, 0);
const moduleObj = { exports: {} };
new Function("module", "exports", transpiled.outputText)(moduleObj, moduleObj.exports);
const {
  validateAssistanceReview,
  validateAssistanceReason,
  validateAssistanceSupport,
  validateAssistanceLocation,
} = moduleObj.exports;
const reviewed = {
  documentConsistencyStatus: "consistent",
  duplicateCheckStatus: "clear",
  beneficiaryCheckStatus: "confirmed",
  facilityVerificationRequired: true,
  facilityVerificationStatus: "confirmed",
  facilityName: "SJDM Medical Center",
  facilityVerificationMethod: "official_record",
  costVerificationRequired: true,
  costVerificationStatus: "confirmed",
  verifiedGrossCost: "1200.00",
  confirmedExistingAssistanceAmount: "200",
  residencyVerificationStatus: "verified",
  residencyVerificationMethod: "barangay_confirmation",
  privateAddressSnapshot: "San Jose del Monte, Bulacan",
  videoVerificationRequired: false,
  videoVerificationStatus: "not_required",
  siteVisitRequired: false,
  siteVisitStatus: "not_required",
  riskFlags: "",
};
const validate = (patch, mode = "verify", category = "medical_health") =>
  validateAssistanceReview({ ...reviewed, ...patch }, mode, category);
const field = (issues, name) => issues.some(issue => issue.field === name);
assert.deepEqual(validate({}), [], "Fully reviewed medical request should pass");
assert(field(validate({ documentConsistencyStatus: "pending" }), "documentConsistencyStatus"));
assert(field(validate({ duplicateCheckStatus: "confirmed_duplicate" }), "duplicateCheckStatus"));
assert(field(validate({ beneficiaryCheckStatus: "pending" }), "beneficiaryCheckStatus"));
assert(field(validate({ residencyVerificationStatus: "pending" }), "residencyVerificationStatus"));
assert(field(validate({ facilityVerificationStatus: "pending" }), "facilityVerificationStatus"));
assert(field(validate({ costVerificationStatus: "pending" }), "costVerificationStatus"));
assert(field(validate({ videoVerificationRequired: true, videoVerificationStatus: "requested" }), "videoVerificationStatus"));
assert(field(validate({ siteVisitRequired: true, siteVisitStatus: "scheduled" }), "siteVisitStatus"));
assert(field(validate({ riskFlags: "Cannot verify hospital document" }), "riskFlags"));
assert(field(validate({ facilityName: "" }, "draft"), "facilityName"));
assert(field(validate({ facilityVerificationMethod: "not_applicable" }, "draft"), "facilityVerificationMethod"));
assert(field(validate({ verifiedGrossCost: "1..2" }, "draft"), "verifiedGrossCost"));
assert(field(validate({ verifiedGrossCost: "100000000.01" }, "draft"), "verifiedGrossCost"));
assert(field(validate({ verifiedGrossCost: "-10" }, "draft"), "verifiedGrossCost"));
assert(field(validate({ verifiedGrossCost: "0" }, "draft"), "verifiedGrossCost"));
assert(field(validate({ confirmedExistingAssistanceAmount: "1200.01" }, "draft"), "confirmedExistingAssistanceAmount"));
assert(field(validate({ confirmedExistingAssistanceAmount: "abc" }, "draft"), "confirmedExistingAssistanceAmount"));
assert(field(validate({ residencyVerificationMethod: "not_applicable" }, "draft"), "residencyVerificationMethod"));
assert(field(validate({ privateAddressSnapshot: "" }), "privateAddressSnapshot"));
const pending = {
  ...reviewed,
  documentConsistencyStatus: "pending",
  duplicateCheckStatus: "pending",
  beneficiaryCheckStatus: "pending",
  facilityVerificationStatus: "pending",
  facilityName: "",
  facilityVerificationMethod: "not_applicable",
  costVerificationStatus: "pending",
  verifiedGrossCost: "",
  confirmedExistingAssistanceAmount: "",
  residencyVerificationStatus: "pending",
};
assert.deepEqual(validateAssistanceReview(pending, "draft", "medical_health"), [],
  "Partial drafts must remain editable without forcing every required final check");
assert(validateAssistanceReview(pending, "verify", "medical_health").length >= 5,
  "Verify must identify missing reviews with required fields");
assert.equal(validateAssistanceReason("more_information", "missing"), "Explain what information or evidence is missing (at least 10 characters).");
assert.equal(validateAssistanceReason("more_information", "Please provide a bill"), "");
assert.equal(validateAssistanceReason("reject", ""), "Enter a clear, evidence-based rejection reason (at least 3 characters).");
assert.equal(validateAssistanceReason("reject", "Proof does not match"), "");
assert(field(validateAssistanceSupport("pending", "", 1000), "supportDecision"));
assert(field(validateAssistanceSupport("donation_support", "", 1000), "remainingAmount"));
assert(field(validateAssistanceSupport("donation_support", "0", 1000), "remainingAmount"));
assert(field(validateAssistanceSupport("donation_support", "1001", 1000), "remainingAmount"));
assert(field(validateAssistanceSupport("donation_support", "12.345", 1000), "remainingAmount"));
assert.deepEqual(validateAssistanceSupport("donation_support", "500", 1000), []);
assert.deepEqual(validateAssistanceSupport("internal_support", "", 1000), []);
assert.equal(validateAssistanceLocation("", "A", "SJ").length, 3);
assert.deepEqual(validateAssistanceLocation("barangay_hall", "Barangay Hall", "SJDM Bulacan"), []);
const ui = fs.readFileSync("app/(admin)/assistance-requests.tsx", "utf8");
for (const text of [
  "assistanceRequiredAsterisk",
  "assistanceFieldInvalid",
  "assistanceValidationSummary",
  "ReviewValidationHint",
  'validationIntent === "verify"',
  "setReasonAttempt",
  "validateAssistanceSupport",
  "validateAssistanceLocation",
  "setValidationIntent",
  "validateAssistanceReview(reviewDraft, \"verify\"",
]) assert(ui.includes(text), "Missing inline Admin validation integration: " + text);
console.log("PASS conditional red Assistance form validations, partial drafts, numeric limits, review gates, required notes, support and public locations");
