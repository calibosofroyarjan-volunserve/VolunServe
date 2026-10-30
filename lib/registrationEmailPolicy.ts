/**
 * VolunServe registration email policy.
 *
 * Built-in denylist + DNS-validated maintained list, checked before creation
 * of a new Firebase Auth UID. A subdomain of a blocked domain is blocked too.
 * Firebase verified email ownership is a separate requirement.
 * Unknown/new throwaway providers cannot be guaranteed to be detected without
 * additional trusted pre-registration email-risk infrastructure.
 */
import { GENERATED_DISPOSABLE_EMAIL_DOMAINS } from "./disposableEmailDomains.generated";

export const KNOWN_DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com", "yopmail.com", "guerrillamail.com", "guerrillamailblock.com",
  "sharklasers.com", "10minutemail.com", "temp-mail.org", "tempmail.com",
  "tempmail.net", "trashmail.com", "dispostable.com", "getnada.com",
  "maildrop.cc", "minuteinbox.com", "mohmal.com", "emailondeck.com",
  "throwawaymail.com", "mailnesia.com", "fakeinbox.com", "tempmailo.com",
  ...GENERATED_DISPOSABLE_EMAIL_DOMAINS,
]);

export function isKnownDisposableEmail(email: string): boolean {
  const value = String(email || "").trim().toLowerCase();
  // Refuse malformed input in the caller's syntax/email validation.
  if (value.length > 320) return false;
  const parts = value.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const domain = parts[1].replace(/\.$/, "");
  if (!/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(domain)) return false;
  // Domains like demo.sub.mailinator.com must not bypass the main denylist.
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i += 1) {
    if (KNOWN_DISPOSABLE_EMAIL_DOMAINS.has(labels.slice(i).join("."))) return true;
  }
  return false;
}
