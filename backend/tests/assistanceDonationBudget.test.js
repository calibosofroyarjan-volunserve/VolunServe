"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateBudgetInput, budgetApprovalIsEligible, combineApprovedBudget } = require("../assistanceDonationBudget");

const zeroRequest = {status:"verified",estimatedAmount:0,donationCampaignId:"",remainingAmount:0};
const zeroReview = {costVerificationRequired:false,verifiedGrossCost:0,confirmedExistingAssistanceAmount:0,verifiedUncoveredAmount:0};
const item = {
  approvedGrossCost:"3600.00",
  confirmedExistingAssistanceAmount:"600",
  budgetEvidenceNote:"12 bags of dog food at PHP 300 each, verified against current supplier prices."
};
test("verified zero-estimate case can set one documented new item budget",()=>{
  assert.equal(budgetApprovalIsEligible(zeroRequest,zeroReview),true);
  const r=combineApprovedBudget(zeroRequest,zeroReview,item);
  assert.equal(r.ok,true);
  assert.equal(r.verifiedUncoveredAmount,3000);
  assert.equal(r.updatedGrossCost,3600);
  assert.equal(r.updatedExistingAssistance,600);
});
test("verified positive resident estimate but no approved cost is eligible",()=>{
  const r=combineApprovedBudget({...zeroRequest,estimatedAmount:2500},
    {...zeroReview,costVerificationRequired:true,costVerificationStatus:"confirmed"},item);
  assert.equal(r.ok,true);
});
test("previously fully covered expenses remain in the reviewed totals",()=>{
  const prior={...zeroReview,costVerificationRequired:true,verifiedGrossCost:5000,
    confirmedExistingAssistanceAmount:5000,verifiedUncoveredAmount:0};
  const r=combineApprovedBudget({...zeroRequest,estimatedAmount:5000},prior,item);
  assert.equal(r.ok,true);
  assert.equal(r.previousGrossCost,5000);
  assert.equal(r.previousAssistance,5000);
  assert.equal(r.updatedGrossCost,8600);
  assert.equal(r.updatedExistingAssistance,5600);
  assert.equal(r.verifiedUncoveredAmount,3000);
});
test("cannot inflate an already-uncovered budget or modify active/closed cases",()=>{
  const uncovered={...zeroReview,verifiedGrossCost:5000,confirmedExistingAssistanceAmount:2000,verifiedUncoveredAmount:3000};
  assert.equal(budgetApprovalIsEligible(zeroRequest,uncovered),false);
  const bad=[
    [{...zeroRequest,status:"assistance_provided"},zeroReview],
    [{...zeroRequest,status:"closed"},zeroReview],
    [{...zeroRequest,donationCampaignId:"campaign123"},zeroReview],
    [{...zeroRequest,remainingAmount:100},zeroReview],
    [zeroRequest,{...zeroReview,postApprovalBudgetAt:"previous approval"}],
    [zeroRequest,{...zeroReview,verifiedGrossCost:2000,confirmedExistingAssistanceAmount:2000,verifiedUncoveredAmount:100}],
    [zeroRequest,uncovered],
  ];
  for(const [request,review] of bad) assert.equal(budgetApprovalIsEligible(request,review),false);
});
test("malformed, inflated, covered and unsupported amounts are rejected",()=>{
  const errors=[
    {approvedGrossCost:-1}, {approvedGrossCost:0},{approvedGrossCost:100000001},
    {approvedGrossCost:"not money"},{approvedGrossCost:20.001},
    {confirmedExistingAssistanceAmount:-1},
    {confirmedExistingAssistanceAmount:5000},
    {budgetEvidenceNote:"just dog food"}
  ];
  for(const patch of errors) assert.equal(evaluateBudgetInput({...item,...patch}).ok,false);
  assert.equal(evaluateBudgetInput({...item,approvedGrossCost:1000,confirmedExistingAssistanceAmount:1000}).ok,false);
  assert.equal(combineApprovedBudget(zeroRequest,{...zeroReview,verifiedGrossCost:99999999,confirmedExistingAssistanceAmount:99999999},
    item).ok,false);
});
