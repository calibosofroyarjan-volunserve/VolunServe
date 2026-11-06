"use strict";

const MAX_APPROVED_BUDGET = 100000000;

function budgetApprovalIsEligible(request, review) {
  // A reviewed case can have zero remaining money because the resident entered
  // no initial cost OR because its original costs were fully covered. A new
  // separately documented item budget is allowed in both cases, once only.
  const gross = Number(review?.verifiedGrossCost ?? 0);
  const existing = Number(review?.confirmedExistingAssistanceAmount ?? 0);
  const uncovered = Number(review?.verifiedUncoveredAmount ?? 0);
  const remaining = Number(request?.remainingAmount ?? 0);
  const valid = value => Number.isFinite(value) && value >= 0 &&
    value <= MAX_APPROVED_BUDGET;
  return valid(gross) && valid(existing) && valid(uncovered) &&
    valid(remaining) && gross >= existing &&
    uncovered <= 0.009 && remaining <= 0.009 &&
    Math.abs((gross - existing) - uncovered) <= 0.01 &&
    !request?.donationCampaignId &&
    !review?.postApprovalBudgetAt &&
    String(request?.status || "verified").toLowerCase() === "verified";
}

function evaluateBudgetInput(input) {
  const gross = Number(input?.approvedGrossCost);
  const alreadyReceived = Number(input?.confirmedExistingAssistanceAmount ?? 0);
  const basis = String(input?.budgetEvidenceNote || "").trim();
  const validCurrency = value => Number.isFinite(value) &&
    value >= 0 && value <= MAX_APPROVED_BUDGET &&
    Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;
  if (!validCurrency(gross) || gross <= 0 || !validCurrency(alreadyReceived) ||
      alreadyReceived > gross) {
    return { ok: false, code: "invalid_approved_donation_budget",
      message: "Enter a valid approved item total and existing assistance amount (PHP)." };
  }
  if (basis.length < 20 || basis.length > 800) {
    return { ok: false, code: "donation_budget_basis_required",
      message: "Describe the needed items, quantities and price estimates (20 to 800 characters)." };
  }
  const shortage = Math.round((gross - alreadyReceived) * 100) / 100;
  if (shortage <= 0) {
    return { ok: false, code: "donation_budget_fully_covered",
      message: "Existing assistance already covers this budget. Nothing remains to fundraise." };
  }
  return {
    ok: true,
    approvedGrossCost: Math.round(gross * 100) / 100,
    confirmedExistingAssistanceAmount: Math.round(alreadyReceived * 100) / 100,
    verifiedUncoveredAmount: shortage,
    budgetEvidenceNote: basis,
  };
}

function combineApprovedBudget(request, review, input) {
  if (!budgetApprovalIsEligible(request, review)) {
    return {ok: false, code: "donation_budget_not_editable",
      message: "This case already has an active campaign, completed assistance, or an approved extra budget."};
  }
  const budget = evaluateBudgetInput(input);
  if (!budget.ok) return budget;
  const previousGrossCost = Number(review?.verifiedGrossCost || 0);
  const previousAssistance = Number(review?.confirmedExistingAssistanceAmount || 0);
  const newTotalCost = Math.round((previousGrossCost + budget.approvedGrossCost) * 100) / 100;
  const newExistingAssistance = Math.round((previousAssistance + budget.confirmedExistingAssistanceAmount) * 100) / 100;
  if (newTotalCost > MAX_APPROVED_BUDGET || newExistingAssistance > MAX_APPROVED_BUDGET) {
    return {ok: false, code: "donation_budget_limit_exceeded",
      message: "The combined approved budget exceeds the allowed limit."};
  }
  return {
    ...budget,
    previousGrossCost,
    previousAssistance,
    updatedGrossCost: newTotalCost,
    updatedExistingAssistance: newExistingAssistance,
  };
}

module.exports = { evaluateBudgetInput, budgetApprovalIsEligible, combineApprovedBudget };
