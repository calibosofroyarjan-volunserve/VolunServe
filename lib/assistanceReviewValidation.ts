/**
 * Frontend guidance for LGU assistance review.
 *
 * Backend /api/admin/assistance/requests/:id/review remains authoritative.
 * Partial drafts are allowed; impossible values and inconsistent amounts
 * are flagged even when a draft is saved.
 */
export type AssistanceReviewStage = "checks" | "costs" | "residency" | "decision" | "support";

export type AssistanceValidationIssue = {
  field: string;
  stage: AssistanceReviewStage;
  message: string;
};

export type AssistanceReviewInputs = {
  documentConsistencyStatus: string;
  duplicateCheckStatus: string;
  beneficiaryCheckStatus: string;
  facilityVerificationRequired: boolean;
  facilityVerificationStatus: string;
  facilityName: string;
  facilityVerificationMethod: string;
  costVerificationRequired: boolean;
  costVerificationStatus: string;
  verifiedGrossCost: string;
  confirmedExistingAssistanceAmount: string;
  residencyVerificationStatus: string;
  residencyVerificationMethod: string;
  privateAddressSnapshot: string;
  videoVerificationRequired: boolean;
  videoVerificationStatus: string;
  siteVisitRequired: boolean;
  siteVisitStatus: string;
  riskFlags: string;
};

export type AssistanceValidationMode = "draft" | "verify";

const MAX_COST = 100000000;
const safeText = (value: unknown) => String(value ?? "").trim();
const moneyFormat = /^\d+(?:\.\d{1,2})?$/;

function validateMoney(
  raw: string,
  field: string,
  label: string,
  required: boolean,
): AssistanceValidationIssue | null {
  const value = safeText(raw);
  if (!value) {
    return required ? {
      field, stage: "costs", message: `${label} is required.`,
    } : null;
  }
  if (!moneyFormat.test(value)) {
    return { field, stage: "costs", message: `${label} must be a valid peso amount with up to 2 decimals.` };
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_COST) {
    return { field, stage: "costs", message: `${label} must be between ₱0 and ₱100,000,000.` };
  }
  return null;
}

export function validateAssistanceReview(
  review: AssistanceReviewInputs,
  mode: AssistanceValidationMode,
  category?: string,
): AssistanceValidationIssue[] {
  const issues: AssistanceValidationIssue[] = [];
  const add = (field: string, stage: AssistanceReviewStage, message: string) => {
    issues.push({ field, stage, message });
  };
  const requiredFacility = [
    "medical_health",
    "surgery_treatment",
    "cancer_serious_illness",
    "animal_pet_welfare",
  ].includes(String(category || ""));
  const facilityActive = requiredFacility || review.facilityVerificationRequired;
  if (mode === "verify") {
    if (review.documentConsistencyStatus !== "consistent")
      add("documentConsistencyStatus", "checks", "Confirm the supporting documents are consistent.");
    if (review.duplicateCheckStatus !== "clear")
      add("duplicateCheckStatus", "checks", "Check the request history and confirm there is no duplicate.");
    if (review.beneficiaryCheckStatus !== "confirmed")
      add("beneficiaryCheckStatus", "checks", "Confirm the beneficiary identity or relationship.");
    if (review.residencyVerificationStatus !== "verified")
      add("residencyVerificationStatus", "residency", "Verify the Resident's address using evidence, not the map alone.");
    if (facilityActive && review.facilityVerificationStatus !== "confirmed")
      add("facilityVerificationStatus", "costs", "Confirm the facility using an independent source.");
    if (review.costVerificationRequired && review.costVerificationStatus !== "confirmed")
      add("costVerificationStatus", "costs", "Confirm the amount using an official bill or other reliable basis.");
    if (review.videoVerificationRequired && review.videoVerificationStatus !== "completed")
      add("videoVerificationStatus", "residency", "Complete the required video verification, or remove the escalation if it is not needed.");
    if (review.siteVisitRequired && review.siteVisitStatus !== "completed")
      add("siteVisitStatus", "residency", "Complete the required site visit, or remove the escalation if it is not needed.");
    if (safeText(review.riskFlags))
      add("riskFlags", "decision", "Resolve outstanding risk flags before verifying this need.");
  }

  // The backend requires a named facility and independent verification
  // method whenever the facility is marked confirmed, including drafts.
  if (facilityActive && review.facilityVerificationStatus === "confirmed") {
    if (safeText(review.facilityName).length < 2)
      add("facilityName", "costs", "Enter the official facility name (at least 2 characters).");
    if (!["official_phone", "official_email", "official_record", "in_person", "other"]
      .includes(review.facilityVerificationMethod))
      add("facilityVerificationMethod", "costs", "Choose how the facility was independently verified.");
  }

  if (review.costVerificationRequired) {
    const gross = safeText(review.verifiedGrossCost);
    const existing = safeText(review.confirmedExistingAssistanceAmount);
    for (const issue of [
      validateMoney(gross, "verifiedGrossCost", "Verified gross cost", mode === "verify" || review.costVerificationStatus === "confirmed"),
      validateMoney(existing, "confirmedExistingAssistanceAmount", "Existing assistance", false),
    ]) if (issue) issues.push(issue);

    if (!issues.some(x => x.field === "verifiedGrossCost") &&
        !issues.some(x => x.field === "confirmedExistingAssistanceAmount") &&
        gross && existing && Number(existing) > Number(gross)) {
      add("confirmedExistingAssistanceAmount", "costs", "Existing assistance cannot exceed the verified gross cost.");
    }
    if (review.costVerificationStatus === "confirmed" && (!gross || Number(gross) <= 0))
      if (!issues.some(x => x.field === "verifiedGrossCost"))
        add("verifiedGrossCost", "costs", "A confirmed verified cost must be greater than ₱0.");
  }

  if (review.residencyVerificationStatus === "verified") {
    if (!review.residencyVerificationMethod || review.residencyVerificationMethod === "not_applicable")
      add("residencyVerificationMethod", "residency", "Choose the evidence or method used to verify residency.");
    // Backend does not require a full street address, but we encourage
    // admins to flag cases with insufficient evidence before verifying.
    if (mode === "verify" && safeText(review.privateAddressSnapshot).length < 3)
      add("privateAddressSnapshot", "residency", "Check the declared address and supporting residency evidence.");
  }

  return issues;
}

export function validateAssistanceReason(
  action: "more_information" | "reject",
  text: string,
): string {
  const value = safeText(text);
  if (action === "reject" && value.length < 3)
    return "Enter a clear, evidence-based rejection reason (at least 3 characters).";
  if (action === "more_information" && value.length < 10)
    return "Explain what information or evidence is missing (at least 10 characters).";
  return "";
}

export function validateAssistanceSupport(
  choice: string, remaining: string, cap: number,
): AssistanceValidationIssue[] {
  const issues: AssistanceValidationIssue[] = [];
  if (!["internal_support", "donation_support", "not_required"].includes(choice)) {
    issues.push({ field: "supportDecision", stage: "support", message: "Select how this verified need will be supported." });
  }
  if (choice === "donation_support") {
    const issue = validateMoney(remaining, "remainingAmount", "Remaining unmet amount", true);
    if (issue) issues.push({ ...issue, stage: "support" });
    else if (Number(remaining) <= 0)
      issues.push({ field: "remainingAmount", stage: "support", message: "The remaining unmet amount must be greater than ₱0." });
    else if (Number(remaining) > cap)
      issues.push({ field: "remainingAmount", stage: "support", message: "Donation support cannot exceed the verified uncovered amount." });
  }
  return issues;
}

export function validateAssistanceLocation(
  locationType: string, name: string, address: string,
): AssistanceValidationIssue[] {
  const issues: AssistanceValidationIssue[] = [];
  if (!locationType)
    issues.push({ field: "locationType", stage: "support", message: "Select an official public location type." });
  if (safeText(name).length < 3)
    issues.push({ field: "locationName", stage: "support", message: "Enter an official location name (at least 3 characters)." });
  if (safeText(address).length < 5)
    issues.push({ field: "locationAddress", stage: "support", message: "Enter a complete public service address (at least 5 characters)." });
  return issues;
}
