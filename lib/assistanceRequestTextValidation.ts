/**
 * Clear, word-based validation for Resident Assistance Request content.
 *
 * This is UI guidance and a client submit guard; the server continues to
 * authorize and validate all requests independently.
 */
export const ASSISTANCE_TITLE_MIN_WORDS = 4;
export const ASSISTANCE_TITLE_MAX_WORDS = 20;
export const ASSISTANCE_DESCRIPTION_MIN_WORDS = 20;
export const ASSISTANCE_DESCRIPTION_MAX_WORDS = 300;

export type AssistanceTextField = "title" | "description";

export function assistanceWords(input: string): string[] {
  // Count meaningful word tokens instead of counting whitespace or punctuation.
  return String(input || "").match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
}

export function assistanceWordCount(input: string): number {
  return assistanceWords(input).length;
}

export function assistanceTextError(
  input: string,
  field: AssistanceTextField,
): string {
  const words = assistanceWords(input);
  const count = words.length;
  const title = field === "title";
  const min = title ? ASSISTANCE_TITLE_MIN_WORDS : ASSISTANCE_DESCRIPTION_MIN_WORDS;
  const max = title ? ASSISTANCE_TITLE_MAX_WORDS : ASSISTANCE_DESCRIPTION_MAX_WORDS;
  const label = title ? "title" : "description";

  if (count < min) {
    return `Use at least ${min} words for the ${label} (currently ${count}).`;
  }
  if (count > max) {
    return `Keep the ${label} to ${max} words or fewer (currently ${count}).`;
  }

  // A long sequence of the same term is not a useful request description.
  const unique = new Set(words.map((word) => word.toLocaleLowerCase("en")));
  if (unique.size < (title ? 2 : 5)) {
    return title
      ? "Write a clear title using different words."
      : "Describe the actual need in your own words, not repeated text.";
  }
  if (!words.some((word) => /\p{L}/u.test(word))) {
    return `Use words, not only numbers, in the ${label}.`;
  }
  return "";
}
