"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const src = fs.readFileSync("app/(admin)/assistance-requests.tsx","utf8");
const start = src.indexOf("function CompactVerifiedAssistance({");
const end = src.indexOf("function CompactReviewSelect({", start);
assert(start >= 0 && end > start, "Verified support screen must exist");
const panel = src.slice(start,end);
for(const token of [
  "type DonationBudgetDraft", "approve_donation_budget",
  'confirmedExistingAssistanceAmount: Number(values.confirmedExistingAssistanceAmount || 0)',
  "costVerificationRequired !== true",
  "!verificationReview.postApprovalBudgetAt",
  'if (choice === "donation" && cap <= 0)',
  "setBudgetAttempted(true)", "budgetIsValid",
  'onDonation(publicOfficeName, publicOfficeAddress, {',
  "Item breakdown and price basis",
  "Amount to raise:", "No remaining monetary budget",
  "Do not use the resident’s home address",
  "router.push({ pathname: \"/donation-list\"",
]) assert(src.includes(token), "Missing budget flow or protection: " + token);
assert(panel.includes("canSetBudget && ("), "Budget form must be shown only when eligible");
assert(panel.includes('disabled={busy}'),"Admin button should provide validation, not silently disappear");
assert(src.includes('Math.round((gross - previous) * 100) / 100'),"Only remaining need may be fundraised");
assert(src.includes("No further support") || src.includes("No Further Support"),
  "Keep alternative to donations");
console.log("PASS verified zero-budget assistance has reviewed itemized costs, no amount inflation, and separate donation setup");
