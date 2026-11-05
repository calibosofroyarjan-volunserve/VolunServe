"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateBudgetInput, budgetApprovalIsEligible } = require("../assistanceDonationBudget");

const baselineRequest = { estimatedAmount: 0, donationCampaignId: "" };
const baselineReview = { costVerificationRequired: false, verifiedGrossCost: 0, verifiedUncoveredAmount: 0 };
test("verified non-monetary need can receive a separate itemized budget", () => {
  assert.equal(budgetApprovalIsEligible(baselineRequest, baselineReview), true);
  const result = evaluateBudgetInput({
    approvedGrossCost: "3600.00",
    confirmedExistingAssistanceAmount: "600",
    budgetEvidenceNote: "12 bags of dog food at PHP 300 each; verified current supplier price.",
  });
  assert.equal(result.ok, true);
  assert.equal(result.verifiedUncoveredAmount, 3000);
});
test("cannot overwrite original monetary review or an active donation campaign", () => {
  assert.equal(budgetApprovalIsEligible({estimatedAmount: 2500},baselineReview), false);
  assert.equal(budgetApprovalIsEligible(baselineRequest,{...baselineReview,costVerificationRequired:true}),false);
  assert.equal(budgetApprovalIsEligible({...baselineRequest,donationCampaignId:"campaign123"},baselineReview),false);
  assert.equal(budgetApprovalIsEligible(baselineRequest,{...baselineReview,postApprovalBudgetAt:"already-approved"}),false);
});
test("prevents negative, inflated, non-currency and unsupported budgets", () => {
  const base = {approvedGrossCost: 1500, confirmedExistingAssistanceAmount: 0,
    budgetEvidenceNote: "Ten food packs at PHP 150 each based on local prices."};
  for (const patch of [
    {approvedGrossCost: -1},{approvedGrossCost: 0},{approvedGrossCost: 100000001},
    {approvedGrossCost: "not money"}, {approvedGrossCost: 20.001},
    {confirmedExistingAssistanceAmount: -1},{confirmedExistingAssistanceAmount: 2000},
    {budgetEvidenceNote: "dog food"}
  ]) assert.equal(evaluateBudgetInput({...base,...patch}).ok,false);
});
test("does not open a campaign when need is already fully covered",()=>{
  assert.equal(evaluateBudgetInput({
    approvedGrossCost: 1200,
    confirmedExistingAssistanceAmount: 1200,
    budgetEvidenceNote: "Four pet food packs at PHP 300 each confirmed by the supplier."
  }).ok,false);
});
