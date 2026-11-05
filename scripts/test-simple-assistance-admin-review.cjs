"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const src = fs.readFileSync("app/(admin)/assistance-requests.tsx", "utf8");
const from = src.indexOf("function CompactAssistanceReview({");
const to = src.indexOf("function DecisionTab({", from);
assert(from >= 0 && to > from, "Compact LGU Review component must render");
const ui = src.slice(from, to);
const route = src.slice(src.indexOf("  const renderDecisionRail = () => {"), src.indexOf("  const renderDetailChrome = () => {"));
for (const [label, value] of Object.entries({
  "short review": "Review Request",
  "documents shortcut": "Documents (",
  "resident shortcut": "Resident details",
  "actual document check": "documentConsistencyStatus",
  "actual duplicate check": "duplicateCheckStatus",
  "actual beneficiary check": "beneficiaryCheckStatus",
  "actual residency check": "residencyVerificationStatus",
  "facility required": "needsFacilityVerification(request.category)",
  "independent facility method": "facilityVerificationMethod",
  "verified gross cost": "verifiedGrossCost",
  "existing assistance": "confirmedExistingAssistanceAmount",
  "reject reason": "validateAssistanceReason(actionType, note)",
  "professional inline dropdown": "CompactReviewSelect",
  "verify button": 'label="Verify Request"',
  "more info action": "Ask for more information",
  "reject action": "Reject request",
  "extra checks intentionally hidden": "Other checks (only when needed)",
  "visual error messaging": "ReviewValidationHint",
  "residency evidence": "What proof confirmed the address?",
  "backend review precondition": "Begin Review",
})) assert(ui.includes(value), "Missing: "+label);
for (const val of [
  "onVerify={verifyNeed}",
  "onMoreInfo={requestMoreInformation}",
  "onReject={rejectRequest}",
  "onStartReview={startReview}",
  "onDocuments={() => setReviewTab(\"evidence\")}",
  "onResident={() => setReviewTab(\"resident\")}",
  "onAdditional={() => {setSimpleReviewMode(false)",
  '<DecisionTab',
]) assert(route.includes(val), "Review action not wired to original secure operation: " + val);
assert(route.indexOf("<CompactAssistanceReview") < route.indexOf("<DecisionTab"), "Compact review should render by default");
assert(!ui.includes('label="Save Review"'), "No redundant Save button in main review");
assert(!route.includes("onSave={saveVerificationDraft}"), "Compact review must submit through decisions, not an extra save action");
const dropdowns = ui.split("<CompactReviewSelect").length - 1;
assert.equal(dropdowns, 4, "Use four clean inline dropdowns instead of full-screen selection modals");
assert(ui.includes('Your review is recorded when you submit a decision.'), "Explain submission without save");
assert(ui.includes("validated") === false || ui.includes("Verify Request"), "Keep simple user-facing wording");

assert(src.includes("setSimpleReviewMode(true);") && src.includes("setReviewDraft(null);"), "No stale review state between residents");
assert(!/persistPrivateReview\("verify"[^\n]*\)/.test(ui), "Compact form must never bypass original server review");
assert(src.includes('setSavingAction("verify")') && src.includes('setSavingAction("reject")'), "Guarded backend operations retained");
assert(src.includes("confirmAdminAction(") && src.includes("reviewReadyForVerification(reviewDraft)"), "Final decisions must remain checked and confirmed");
console.log("PASS simple LGU review UI, real evidence fields, secure decision button wiring, validation, and advanced-only controls");
