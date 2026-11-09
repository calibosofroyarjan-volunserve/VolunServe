/**
 * Gmail ignores dots in the local-part, and gmail.com/googlemail.com address
 * spellings refer to one mailbox. This helper creates an identity key for the
 * Resident *profile* uniqueness claim, not a disposable-email verdict.
 *
 * Firebase Auth can still create a pending UID on Spark; Firestore Rules must
 * atomically enforce this key when the actual Resident profile is created.
 * Other domains (including Yahoo, Outlook and custom domains) are NOT folded.
 */
export function canonicalGmailAlias(email: string): string | null {
  const normalized = String(email || "").trim().toLowerCase();
  const parts = normalized.split("@");
  if (parts.length !== 2 || !parts[0]) return null;
  if (parts[1] !== "gmail.com" && parts[1] !== "googlemail.com") return null;
  const local = parts[0].split("+", 1)[0].replace(/\./g, "");
  if (!local || local.length > 64) return null;
  return local + "@gmail.com";
}
