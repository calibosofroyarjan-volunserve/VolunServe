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

/** Return a clear, user-facing registration error, or null when acceptable.
 * Known-domain filtering is a client UX check; Firebase security rules and
 * trusted server enforcement are separate protections.
 */
export function getRegistrationEmailError(email: string): string | null {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return "Email address is required. Enter an email you can verify.";
  // Validate complete domain labels instead of accepting malformed names
  // such as name@gmail..com or name@-gmail.com. Valid country-code TLDs
  // (including .co) remain allowed for independent providers.
  const parts = value.split("@");
  const local = parts[0] || "";
  const domain = parts[1] || "";
  const domainFormat = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
  if (
    value.length > 254 ||
    parts.length !== 2 ||
    local.length > 64 ||
    !/^[a-z0-9.!#$%&'*+\/?^_`{|}~-]+$/i.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !domainFormat.test(domain)
  ) {
    return "Enter a complete, valid email address, for example name@example.com.";
  }

  // Popular provider typos: exact DOMAIN matches only. Never deny an
  // unrelated, legitimate .co domain or an international provider domain
  // such as yahoo.co.uk. This list is intentionally conservative.
  const knownProviderTypos: Record<string, string> = {
    // Gmail
    "gmail.co": "gmail.com", "gmail.cm": "gmail.com",
    "gmail.con": "gmail.com", "gmail.comm": "gmail.com",
    "gmail.om": "gmail.com", "gmai.com": "gmail.com",
    "gmial.com": "gmail.com", "gamil.com": "gmail.com",
    "gmaill.com": "gmail.com", "gmail.cmo": "gmail.com",
    // Yahoo
    "yahoo.co": "yahoo.com", "yahoo.cm": "yahoo.com",
    "yahoo.con": "yahoo.com", "yahoo.comm": "yahoo.com",
    "yahoo.om": "yahoo.com", "yaho.com": "yahoo.com",
    "yhoo.com": "yahoo.com", "yhaoo.com": "yahoo.com",
    "yahho.com": "yahoo.com", "yahoo.cmo": "yahoo.com",
    // Outlook
    "outlook.co": "outlook.com", "outlook.cm": "outlook.com",
    "outlook.con": "outlook.com", "outlook.comm": "outlook.com",
    "outlook.om": "outlook.com", "outlok.com": "outlook.com",
    "outllook.com": "outlook.com", "outloook.com": "outlook.com",
    "outlook.cmo": "outlook.com",
    // Hotmail / Microsoft
    "hotmail.co": "hotmail.com", "hotmail.cm": "hotmail.com",
    "hotmail.con": "hotmail.com", "hotmail.comm": "hotmail.com",
    "hotmai.com": "hotmail.com", "hotmial.com": "hotmail.com",
    "hotmal.com": "hotmail.com", "hotmail.cmo": "hotmail.com",
    // iCloud and Proton
    "icloud.co": "icloud.com", "icloud.con": "icloud.com",
    "iclod.com": "icloud.com", "icoud.com": "icloud.com",
    "protonmail.co": "protonmail.com", "protonmail.con": "protonmail.com",
    "protonmai.com": "protonmail.com",
  };
  const suggestedProvider = knownProviderTypos[domain];
  if (suggestedProvider) {
    return `Check your email domain. Did you mean @${suggestedProvider}? Please correct it to continue.`;
  }
  if (isKnownDisposableEmail(value)) {
    return "Temporary email addresses are not accepted. Use a permanent email address.";
  }
  return null;
}
