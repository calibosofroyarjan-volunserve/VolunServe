/**
 * VolunServe registration email policy.
 *
 * New-registration Gmail/Yahoo allowlist + maintained disposable denylist, checked before creation
 * of a new Firebase Auth UID. A subdomain of a blocked domain is blocked too.
 * Firebase verified email ownership is a separate requirement.
 * Unknown/new throwaway providers cannot be guaranteed to be detected without
 * additional trusted pre-registration email-risk infrastructure.
 */
import { GENERATED_DISPOSABLE_EMAIL_DOMAINS } from "./disposableEmailDomains.generated";

/**
 * Additional temp-mail.org provider-associated delivery domains publicly
 * reported by Check-Mail (reviewed 2026-11-10). These are domains after @,
 * NOT the temp-mail.org website URL. Keep subdomains scoped: e.g.
 * mail.sc2hub.com does not imply sc2hub.com is disposable.
 * The provider rotates domains; this remains a finite snapshot, not a
 * guarantee against unknown/new throwaway mail providers.
 * Source: https://check-mail.org/disposable-provider/temp-mailorg
 */
export const TEMP_MAIL_ORG_PUBLIC_ALIASES = [
  "adujudi01.info",
  "avtomaty-online.cc",
  "baimengshu.com",
  "bankwen.com",
  "berkshireonstage.com",
  "boffweb.com",
  "crackclue.com",
  "crystalfact.info",
  "ctd.nl8.eu",
  "digeros.com",
  "doisongtinhduc.xyz",
  "dragontranslation.net",
  "drtall.com",
  "emailgeneratorai.cc",
  "ghostmailz.club",
  "ghostmailz.online",
  "ghostmailz.store",
  "gmail.shagni.com",
  "huanqiu6.cc",
  "huicuiguan.com",
  "indonesiacentral.info",
  "javafs.com",
  "jjwxb.com",
  "jlmmarine.com",
  "kxdyy.com",
  "livetogelhk.info",
  "luontaisterveys.info",
  "macsnipe.com",
  "mail.chosenx.com",
  "mail.gianes.com",
  "mail.sc2hub.com",
  "mailer.pics",
  "mmamemories.com",
  "mpmail.top",
  "nmwxb.com",
  "prejuge.com",
  "prestigegroupnet.com",
  "sofabazar.com",
  "spicylog.com",
  "stebie.com",
  "tobiquegaming-license.com",
  "ttbtt.com",
  "wandera.top",
  "wbcom.info",
  "wencuigu.com",
  "wxfwb.com",
  "yesrox.com",
  "yyqzw.com",
  "zymapi.top",
] as const;

export const KNOWN_DISPOSABLE_EMAIL_DOMAINS = new Set([
  // User-observed temporary-mail domain on the public Signup page (2026-11-11).
  // All new .co registrations are rejected separately below (including this domain).
  "en2ch.com", "en2ch.co", "ruutukf.co", "emailkeep.com", "mailinator.com", "yopmail.com", "guerrillamail.com", "guerrillamailblock.com",
  "sharklasers.com", "10minutemail.com", "temp-mail.org", "tempmail.com",
  "tempmail.net", "trashmail.com", "dispostable.com", "getnada.com",
  "maildrop.cc", "minuteinbox.com", "mohmal.com", "emailondeck.com",
  "throwawaymail.com", "mailnesia.com", "fakeinbox.com", "tempmailo.com",
  ...TEMP_MAIL_ORG_PUBLIC_ALIASES,
  ...GENERATED_DISPOSABLE_EMAIL_DOMAINS,
]);

/**
 * Suggest corrections for common misspellings of known consumer providers.
 * Exact-domain matching protects legitimate country-code and private domains,
 * for example yahoo.co.uk and yahoo.com.ph. Final .co TLDs are blocked at signup.
 * Rejected domains are hints/heuristics, not proof of mailbox validity.
 */
export const KNOWN_PROVIDER_TYPO_CORRECTIONS: Readonly<Record<string, string>> = Object.freeze({
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
});

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

// New registration is limited to the exact official Gmail and Yahoo domains.
// Avoid suffix/substring matching (gmail.com.evil.example must never pass).
export const REGISTRATION_ALLOWED_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.com.ph", "yahoo.co.uk",
]);

// SmailPro offers receive-only access to genuine Gmail inboxes. A verification
// link does not prove control of the underlying Google account. New Gmail
// resident registrations therefore require authenticated Google OAuth.
export const GMAIL_GOOGLE_OAUTH_REQUIRED_MESSAGE =
  "For new Gmail registrations, choose Continue with Google to verify account ownership. A verification email alone is insufficient.";
export function requiresGoogleOAuthForRegistration(email: string): boolean {
  const parts = String(email || "").trim().toLowerCase().split("@");
  return parts.length === 2 && (parts[1] === "gmail.com" || parts[1] === "googlemail.com");
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
  // are recognized; .co is intentionally blocked by the registration policy below.
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

  // Gmail +tags are aliases of the same mailbox. Disallow alias-tag signup
  // to reduce easy duplicate registrations, but never label ordinary Gmail
  // addresses as disposable without evidence.
  if ((domain === "gmail.com" || domain === "googlemail.com") && local.includes("+")) {
    return "Gmail +tag aliases are not accepted. Enter your main Gmail address without the +tag.";
  }
  // High-confidence impersonation: gmail.com.attacker.example is not Gmail.
  if (/^(?:gmail|googlemail)\.com\./.test(domain)) {
    return "This is not an official Gmail domain. Use your real @gmail.com address.";
  }
  // Explicit VolunServe registration policy: all final .co domains are banned,
  // even if the address is otherwise legitimate. Do not block .co.ph or .co.uk.
  // This is a signup-only restriction; existing accounts are not locked out.
  if (domain.endsWith(".co")) {
    return "Email addresses ending in .co are not accepted. Use another permanent email address.";
  }
  const suggestedProvider = KNOWN_PROVIDER_TYPO_CORRECTIONS[domain];
  if (suggestedProvider) {
    return `Check your email domain. Did you mean @${suggestedProvider}? Please correct it to continue.`;
  }
  if (isKnownDisposableEmail(value)) {
    return "Temporary email addresses are not accepted. Use a permanent email address.";
  }
  if (!REGISTRATION_ALLOWED_EMAIL_DOMAINS.has(domain)) {
    return "Only Gmail and Yahoo email addresses are accepted for new VolunServe registrations.";
  }
  return null;
}
