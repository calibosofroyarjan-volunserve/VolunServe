/**
 * Login-only hints. Never reject an existing account because of a typo
 * suggestion or a disposable/unknown domain: verification belongs to Signup.
 */
export function getLoginEmailError(input: string): string | null {
  const email = input.trim();
  if (!email) return "Enter your email address.";
  if (email.length > 254 || /\s/.test(email) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.endsWith(".")) {
    return "Enter a complete email address, for example name@example.com.";
  }
  return null;
}

const COMMON_DOMAIN_TYPOS: Readonly<Record<string, string>> = {
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
};

/** A gentle correction only, never an authorization or sign-in block. */
export function getLoginEmailSuggestion(input: string): string | null {
  if (getLoginEmailError(input)) return null;
  const domain = input.trim().toLowerCase().split("@")[1];
  const suggestion = COMMON_DOMAIN_TYPOS[domain];
  return suggestion ? `Check your email domain. Did you mean @${suggestion}?` : null;
}
