"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");

const file = fs.readFileSync("app/(admin)/assistance-requests.tsx", "utf8");
const validation = fs.readFileSync("lib/assistanceReviewValidation.ts", "utf8");
const backend = fs.readFileSync("backend/server.js", "utf8");
const begin = file.indexOf("function CompactAssistanceReview({");
const end = file.indexOf("function DecisionTab({", begin);
assert(begin >= 0 && end > begin, "The compact assistance review must exist");
const compact = file.slice(begin, end);

for (const text of [
  "View Documents", "Resident Information",
  "Verify the essentials", "Residency checked through",
  "Hospital, clinic, or assistance provider", "Confirmed amount (PHP)",
  "Approve Request", "Reject Request", "Request more information instead",
]) assert(compact.includes(text), "Expected simple review control missing: " + text);

assert(!compact.includes("CompactReviewSelect"), "No pending-status dropdowns in the simple review");
assert(!/Google|Search Address|AssistanceLocationMap|MapView/.test(compact),
  "No map or address lookup should appear in the simple review");
assert(!compact.includes('label="Start Review"'),
  "The Admin should not need a separate Start Review button");
assert(file.includes("const ensurePrivateReviewStarted = async () =>"),
  "Start review must be performed behind the scenes");
const fromStart = file.slice(file.indexOf("const ensurePrivateReviewStarted = async () =>"));
for (const action of ['"more_information"', '"verify"', '"reject"']) {
  const at = fromStart.indexOf("await ensurePrivateReviewStarted();", 0);
  assert(at !== -1, "Missing protected-review start for " + action);
}
assert((file.match(/await ensurePrivateReviewStarted\(\);/g) || []).length >= 4,
  "Start review is required for verify, reject, and more information");
assert(compact.includes("Confirm only what you have checked."),
  "Do not silently mark uninspected evidence as confirmed");
assert(compact.includes('onReviewChange("documentConsistencyStatus"') &&
  compact.includes('onReviewChange("duplicateCheckStatus"') &&
  compact.includes('onReviewChange("beneficiaryCheckStatus"') &&
  compact.includes('onReviewChange("residencyVerificationStatus"'),
  "All mandatory backend status fields must still be set from explicit Admin actions");
assert(validation.includes("validateAssistanceReview") &&
  backend.includes("private_verification_incomplete") &&
  backend.includes("requireOperationalAdmin"),
  "Keep server authorization and evidence checks intact");
assert(file.includes("CompactVerifiedAssistance") && file.includes("continueToDonationCampaign"),
  "Preserve approved-request donation and support workflow");
console.log("PASS assistance one-screen review: no maps/dropdowns, protected decisions, unchanged donation handoff");
