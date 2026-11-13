/**
 * Fail-closed, client-side reconciliation of an authenticated Node ID OCR
 * precheck response. An upstream "pass" or "review" label is NOT enough:
 * disagreeing/missing OCR evidence must never advance to a selfie.
 *
 * This is a UI navigation guard, not government ID authentication. The
 * backend is still authoritative and staging real-ID uploads stay HTTP 423.
 */
type PrecheckObject = Record<string, unknown>;

export function resolveIdentityPrecheckOutcome(
  selectedType: string,
  serverOutcome: unknown,
  screening: unknown,
): "pass" | "review" | "retry" {
  if (!screening || typeof screening !== "object" || Array.isArray(screening)) {
    return "retry";
  }
  const s = screening as PrecheckObject;
  if (s.declaredIdType !== selectedType) return "retry";
  if (!Array.isArray(s.warningCodes) ||
      !s.warningCodes.every((code) => typeof code === "string")) {
    return "retry";
  }
  const warnings = s.warningCodes as string[];

  if (serverOutcome === "pass" &&
      s.status === "text_consistent_unverified" &&
      s.detectedIdType === selectedType &&
      warnings.length === 0 &&
      s.imageQualityStatus === "adequate" &&
      s.profileBirthDateCheck !== "possible_conflict" &&
      s.passportMrzBirthDateCheck !== "possible_conflict" &&
      s.passportMrzCheck !== "checksum_inconsistent_or_ocr_error" &&
      s.passportMrzCheck !== "multiple_candidates" &&
      (selectedType === "passport" ||
        (s.backSideProvided === true &&
         s.backSideScreened === true &&
         s.backImageQualityStatus === "adequate"))) {
    return "pass";
  }

  // The only non-pass route into selfie capture is an explicit, narrow
  // National ID blurry-rescan case, for an independent human review.
  const blurWarningAllowlist = new Set([
    "low_document_image_quality",
    "document_type_not_recognized",
    "document_front_type_inconclusive",
    "document_back_ocr_inconclusive",
  ]);
  if (serverOutcome === "review" &&
      selectedType === "national_id" &&
      (s.status === "inconclusive" ||
       s.status === "text_consistent_unverified") &&
      (s.detectedIdType === null ||
       s.detectedIdType === "national_id") &&
      s.imageQualityStatus === "low" &&
      warnings.includes("low_document_image_quality") &&
      warnings.every((code) => blurWarningAllowlist.has(code))) {
    return "review";
  }
  return "retry";
}
