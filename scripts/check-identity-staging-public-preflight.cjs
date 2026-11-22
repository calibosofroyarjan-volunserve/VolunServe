"use strict";

/**
 * PUBLIC, READ-ONLY Render staging smoke test.
 * No tokens, government IDs, photos, Firebase logins, mutations or signed URLs.
 * This checks services currently deployed, NOT whether the Draft PR was deployed.
 */
const fs = require("node:fs");
const targets = Object.freeze({
  backend: "https://volunserve-backend-staging.onrender.com",
  ai: "https://volunserve-identity-ai-staging.onrender.com",
  web: "https://volunserve-expo-resident-full-staging.onrender.com",
});
function assertIsolatedTarget(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash ||
      !Object.values(targets).includes(url.origin)) {
    throw new Error("Staging preflight refuses unexpected or production URL.");
  }
  return url.origin;
}
async function getPublic(endpoint, expectedType) {
  let failure = "unreachable";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 40000);
      try {
        const response = await fetch(endpoint, {
          signal: controller.signal,
          redirect: "error",
          headers: { Accept: expectedType === "json" ? "application/json" : "text/html" },
        });
        const data = await response.text();
        if (data.length > 1500000) throw new Error("Response exceeds safe inspection size.");
        const json = expectedType === "json" ? JSON.parse(data) : null;
        return { status: response.status, json, html: expectedType === "html" ? data : null };
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      // Do not print service response bodies, tokens, identifiers or headers.
      failure = error?.name === "AbortError" ? "request timed out" : "request failed";
    }
  }
  throw new Error("Read-only staging preflight " + failure);
}

async function main() {
  for (const url of Object.values(targets)) assertIsolatedTarget(url);
  const checks = [];
  const report = (test, result, detail) => {
    checks.push({ test, result, detail });
    process.stdout.write(result + "  " + test + " — " + detail + "\n");
  };
  for (const [name, origin, path, kind] of [
    ["Backend health", targets.backend, "/health", "json"],
    ["AI health", targets.ai, "/health", "json"],
    ["Web landing", targets.web, "/", "html"],
  ]) {
    try {
      const value = await getPublic(origin + path, kind);
      const ok = value.status === 200 &&
        (kind === "html" ? /<html|<div|<script/i.test(value.html || "") : value.json?.ok === true);
      report(name, ok ? "PASS" : "FAIL",
        ok ? "HTTP 200 from named staging host" : "Expected a healthy staging HTTP 200");
      if (name === "Backend health" && value.json) {
        report("Backend AI configured",
          value.json.identityEngine === "volunserve_ai_configured" ? "PASS" : "FAIL",
          value.json.identityEngine === "volunserve_ai_configured" ?
            "Staging backend reports AI URL configured" : "Staging backend does not report configured identity AI");
        report("Backend private storage configured",
          value.json.assistanceEvidenceStorage === "secure_cloudinary_configured" ? "PASS" : "FAIL",
          value.json.assistanceEvidenceStorage === "secure_cloudinary_configured" ?
            "Cloudinary keys present (separate-account isolation STILL UNCONFIRMED)" :
            "Cloudinary credentials missing");
      }
    } catch (error) {
      report(name, "FAIL", error.message);
    }
  }

  try {
    const unauthorized = await getPublic(
      targets.backend + "/api/admin/identity/reviews/syntheticResident123/evidence", "json");
    const blocked = unauthorized.status === 401 || unauthorized.status === 403;
    const notYet = unauthorized.status === 404;
    report("Unauthenticated private photo endpoint",
      blocked ? "PASS" : notYet ? "NOT_DEPLOYED" : "FAIL",
      blocked ? "Anonymous request rejected by staging backend" :
        notYet ? "PR #808 endpoint is not deployed here" :
          "Expected 401/403; must never return an anonymous signed photo");
  } catch (error) {
    report("Unauthenticated private photo endpoint", "FAIL", error.message);
  }

  const requirePr = process.argv.includes("--require-pr808");
  const fail = checks.some((c) => c.result === "FAIL") ||
    (requirePr && checks.some((c) => c.result === "NOT_DEPLOYED"));
  const summary = [
    "## Read-only identity staging preflight",
    "",
    "| Check | Result | Notes |",
    "|---|---|---|",
    ...checks.map((c) => "| " + c.test + " | " + c.result + " | " + c.detail + " |"),
    "",
    "This test uses no users, Firebase credentials, ID images, or biometric samples.",
    "It cannot establish that Cloudinary credentials are isolated, that PR #808 is deployed, or that identity camera flow works.",
  ].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  }
  if (fail) process.exitCode = 1;
}
if (require.main === module) main().catch(() => {
  console.error("FAIL Staging preflight could not run.");
  process.exitCode = 1;
});
module.exports = { assertIsolatedTarget, targets };
