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
  "short review": "Simple Request Review",
  "documents shortcut": "View documents (",
  "resident shortcut": "View resident",
  "actual document check": "documentConsistencyStatus",
  "actual duplicate check": "duplicateCheckStatus",
  "actual beneficiary check": "beneficiaryCheckStatus",
  "actual residency check": "residencyVerificationStatus",
  "facility required": "needsFacilityVerification(request.category)",
  "independent facility method": "facilityVerificationMethod",
  "verified gross cost": "verifiedGrossCost",
  "existing assistance": "confirmedExistingAssistanceAmount",
  "reject reason": "validateAssistanceReason(actionType, note)",
  "save button": 'label="Save Review"',
  "verify button": 'label="Verify Need"',
  "more info action": "Request more info",
  "reject action": "Reject request",
  "extra checks intentionally hidden": "Additional verification (special cases only)",
  "visual error messaging": "ReviewValidationHint",
  "residency evidence": "How was the address checked?",
  "backend review precondition": "Start Review",
})) assert(ui.includes(value), "Missing: "+label);
for (const val of [
  "onSave={saveVerificationDraft}",
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
assert(src.includes("setSimpleReviewMode(true);") && src.includes("setReviewDraft(null);"), "No stale review state between residents");
assert(!/persistPrivateReview\("verify"[^\n]*\)/.test(ui), "Compact form must never bypass original server review");
assert(src.includes('setSavingAction("verify")') && src.includes('setSavingAction("reject")'), "Guarded backend operations retained");
assert(src.includes("confirmAdminAction(") && src.includes("reviewReadyForVerification(reviewDraft)"), "Final decisions must remain checked and confirmed");
console.log("PASS simple LGU review UI, real evidence fields, secure decision button wiring, validation, and advanced-only controls");
