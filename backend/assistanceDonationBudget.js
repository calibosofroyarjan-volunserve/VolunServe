"use strict";

const MAX_APPROVED_BUDGET = 100000000;

function budgetApprovalIsEligible(request, review) {
  return Number(request?.estimatedAmount || 0) === 0 &&
    Number(review?.verifiedGrossCost || 0) === 0 &&
    Number(review?.verifiedUncoveredAmount || 0) === 0 &&
    review?.costVerificationRequired !== true &&
    !request?.donationCampaignId &&
    !review?.postApprovalBudgetAt;
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

module.exports = { evaluateBudgetInput, budgetApprovalIsEligible };
