"use strict";
const assert = require("node:assert/strict");

const WEB = "https://volunserve-consolidated-pc-mobile-review.onrender.com";
const API = "https://volunserve-backend-staging.onrender.com";
const SYNC = API + "/api/admin/community-certificates/reconcile";

for (const origin of [WEB, API]) {
  assert.equal(new URL(origin).protocol, "https:");
  assert.ok(new URL(origin).hostname.endsWith(".onrender.com"));
  assert.ok(!origin.includes("volunserve.com"));
  assert.ok(origin !== "https://volunserve.onrender.com");
}

async function http(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      // Node 22 fetch. Never follow redirects to different hosts.
      return await fetch(url, {
        ...options,
        redirect: "manual",
        signal: AbortSignal.timeout(45000),
        headers: {
          "Cache-Control": "no-cache",
          ...(options.headers || {}),
        },
      });
    } catch (error) {
      lastError = error;
      console.warn("Staging network attempt", attempt, "failed:", error.message);
      if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  throw lastError;
}

(async () => {
  const home = await http(WEB + "/");
  assert.equal(home.status, 200, "Staging website home must return 200");
  assert.match(home.headers.get("content-type") || "", /text\/html/i);
  const html = await home.text();
  assert.match(html, /<html/i);
  assert.doesNotMatch(home.headers.get("location") || "", /volunserve\.com/i);
  console.log("PASS 1: Staging web homepage responds without a production redirect");

  const attendance = await http(WEB + "/community-attendance");
  assert.equal(attendance.status, 200, "Staging Admin Attendance route must return 200");
  assert.match(attendance.headers.get("content-type") || "", /text\/html/i);
  console.log("PASS 2: Staging Admin Attendance route is reachable");

  // Browser CORS preflight, no authorization token and no data changes.
  const preflight = await http(SYNC, {
    method: "OPTIONS",
    headers: {
      Origin: WEB,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  assert.ok([200, 204].includes(preflight.status),
    "Certificate API CORS preflight must pass");
  assert.equal(preflight.headers.get("access-control-allow-origin"), WEB);
  const methods = preflight.headers.get("access-control-allow-methods") || "";
  assert.match(methods, /POST/i);
  const allowedHeaders = preflight.headers.get("access-control-allow-headers") || "";
  assert.match(allowedHeaders, /authorization/i);
  console.log("PASS 3: Exact staging website origin is allowed for certificate sync CORS");

  // Auth is missing on purpose: verify the endpoint refuses an issuance request.
  // The middleware must reject before any Firestore transaction is reached.
  const denied = await http(SYNC, {
    method: "POST",
    headers: {
      Origin: WEB,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ eventId: "demo-smoke-readonly", execute: true }),
  });
  assert.equal(denied.status, 401, "Unauthenticated certificate issuance must be denied");
  assert.equal(denied.headers.get("access-control-allow-origin"), WEB);
  const result = await denied.json();
  assert.equal(result.error, "unauthenticated");
  console.log("PASS 4: Certificate reconciliation rejects anonymous issuance (401)");

  console.log("PASS: staging public non-mutating certificate smoke checks completed");
})().catch(error => {
  console.error("FAIL: staging smoke check", error);
  process.exitCode = 1;
});
