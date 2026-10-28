/** Known disposable email providers. Defense-in-depth only: this is NOT a
 * comprehensive disposable-email or email-ownership verification system.
 * Firebase email verification is still required for confirmed ownership.
 */
export const KNOWN_DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com","yopmail.com","guerrillamail.com","guerrillamailblock.com",
  "sharklasers.com","10minutemail.com","temp-mail.org","tempmail.com",
  "tempmail.net","trashmail.com","dispostable.com","getnada.com",
  "maildrop.cc","minuteinbox.com","mohmal.com","emailondeck.com",
  "throwawaymail.com","mailnesia.com","fakeinbox.com","tempmailo.com",
]);

export function isKnownDisposableEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return false;
  const domain = normalized.slice(at + 1).replace(/\.$/, "");
  return KNOWN_DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
