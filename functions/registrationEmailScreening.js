"use strict";
// Maintained snapshot generated from lib/disposableEmailDomains.generated.ts.
// It reduces known throwaway-email abuse but cannot detect every new provider
// or distinguish a short-lived REAL Gmail inbox from ordinary Gmail.
const fs = require("node:fs");
const path = require("node:path");
const providerTypos = require("./providerTypoDomains.json");

const domains = new Set(
  fs.readFileSync(path.join(__dirname, "disposable-email-domains.txt"), "utf8")
    .split(/\r?\n/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);
for (const extra of [
  "en2ch.com", "en2ch.co", "emailkeep.com", "mailinator.com", "yopmail.com", "guerrillamail.com",
  "guerrillamailblock.com", "sharklasers.com", "10minutemail.com",
  "temp-mail.org", "tempmail.com", "tempmail.net", "trashmail.com",
  "dispostable.com", "getnada.com", "maildrop.cc", "minuteinbox.com",
  "mohmal.com", "emailondeck.com", "throwawaymail.com",
  "mailnesia.com", "fakeinbox.com", "tempmailo.com",
]) domains.add(extra);

const EMAIL_FORMAT = /^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
function classifyRegistrationEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_FORMAT.test(normalized)) {
    return {allowed: false, reason: "invalid"};
  }
  const at = normalized.lastIndexOf("@");
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  // Block Gmail +tags, which point to the same underlying inbox and are
  // often used to register many accounts. Ordinary Gmail stays accepted.
  if ((domain === "gmail.com" || domain === "googlemail.com") && local.includes("+")) {
    return {allowed: false, reason: "gmail_alias"};
  }
  // gmail.com.some-other-site.example is not Gmail. Share the frontend
  // high-confidence impersonation policy; real Gmail accounts stay allowed.
  if (/^(?:gmail|googlemail)\.com\./.test(domain)) {
    return {allowed: false, reason: "gmail_impersonation"};
  }
  // The client warns on these Gmail-looking typos. Trusted Auth blocking
  // must enforce the same exact-domain policy, even against direct SDK calls.
  if (Object.prototype.hasOwnProperty.call(providerTypos, domain)) {
    return {allowed: false, reason: "provider_typo"};
  }
  const pieces = domain.split(".");
  for (let i = 0; i < pieces.length - 1; i += 1) {
    if (domains.has(pieces.slice(i).join("."))) {
      return {allowed: false, reason: "disposable"};
    }
  }
  return {allowed: true, reason: "accepted"};
}
module.exports = {classifyRegistrationEmail};
