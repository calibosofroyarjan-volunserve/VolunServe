"use strict";

/**
 * VolunServe isolated, inert staging API shell.
 * Does NOT import production backend code, Firebase Admin, PayMongo, or Cloudinary.
 * All operational routes return 503 until a truly separate Firebase staging
 * project and staging-only credentials are provisioned and reviewed.
 */
const http = require("node:http");

const LIVE_PROJECT = "volunserve-3aa5b";
const BLOCKED_CREDENTIAL_KEYS = [
  "PAYMONGO_SECRET_KEY", "PAYMONGO_WEBHOOK_SECRET",
  "FIREBASE_SERVICE_ACCOUNT", "FIREBASE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS", "CLOUDINARY_API_SECRET",
];

function assertIsolatedConfig(env = process.env) {
  if (env.VOLUNSERVE_STAGING_API_MODE !== "isolated-shell") {
    throw Error("STAGING BLOCKED: explicit isolated-shell mode required");
  }
  for (const name of BLOCKED_CREDENTIAL_KEYS) {
    if (env[name]) {
      throw Error("STAGING BLOCKED: sensitive credential is not allowed in the inert staging shell: " + name);
    }
  }
  const project = String(env.FIREBASE_PROJECT_ID || "").toLowerCase();
  if (project === LIVE_PROJECT || project.includes(LIVE_PROJECT)) {
    throw Error("STAGING BLOCKED: cannot use production Firebase ID");
  }
  const origin = (env.STAGING_ALLOWED_ORIGIN || "").trim();
  if (origin) {
    let url;
    try { url = new URL(origin); } catch { throw Error("STAGING BLOCKED: invalid CORS origin"); }
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash ||
        !/(staging|preview|sandbox|test)/.test(url.hostname) ||
        url.hostname.includes(LIVE_PROJECT) ||
        url.hostname === "volunserve.com" || url.hostname.endsWith(".volunserve.com")) {
      throw Error("STAGING BLOCKED: only a separately hosted staging origin is allowed");
    }
    return url.origin;
  }
  return null; // default no browser CORS access
}

function createStagingServer(env = process.env) {
  const allowedOrigin = assertIsolatedConfig(env);
  return http.createServer((request, response) => {
    const requestedOrigin = request.headers.origin || "";
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("content-security-policy", "default-src 'none'");
    if (allowedOrigin && requestedOrigin === allowedOrigin) {
      response.setHeader("access-control-allow-origin", allowedOrigin);
      response.setHeader("vary", "origin");
      response.setHeader("access-control-allow-methods", "GET, OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");
    }
    const route = String(request.url || "/").split("?")[0];
    const send = (status, body) => {
      response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(body));
    };
    if (request.method === "OPTIONS") {
      if (!allowedOrigin || requestedOrigin !== allowedOrigin) {
        send(403, { ok: false, reason: "not_allowed" });
      } else response.writeHead(204).end();
      return;
    }
    if (request.method === "GET" && route === "/health") {
      send(200, { ok: true, app: "VolunServe", mode: "isolated-staging-shell", productionConnected: false });
      return;
    }
    if (request.method === "GET" && route === "/api/staging/readiness") {
      send(200, {
        ok: true, mode: "isolated-staging-shell",
        stagingFirebaseConnected: false,
        realLoginReady: false,
        formsAndPaymentsReady: false,
        note: "No production service or account is connected.",
      });
      return;
    }
    send(503, {
      ok: false,
      code: "STAGING_NOT_CONFIGURED",
      message: "Operation disabled until isolated Firebase and nonproduction services are configured.",
    });
  });
}

if (require.main === module) {
  const server = createStagingServer();
  const port = Number(process.env.PORT || 10000);
  server.listen(port, "0.0.0.0", () => {
    console.log("VolunServe inert staging shell on port " + port + " (no production data access)");
  });
}

module.exports = { assertIsolatedConfig, createStagingServer };
