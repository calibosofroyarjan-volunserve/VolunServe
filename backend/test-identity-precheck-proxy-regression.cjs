"use strict";
/** No-network unit tests for the EXACT Express proxy registered by server.js.
 * Uses synthetic Buffer data and a temporary VM app, not real Firebase/Render.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("backend/server.js", "utf8");
const start = source.indexOf("// OCR-only preflight.");
const end = source.indexOf('app.post(\n  "/api/identity/verify"', start);
assert(start >= 0 && end > start, "Expected protected OCR route before existing face-verify route");
const code = [
  "const IDENTITY_PRECHECK_DELAY_MS = 6000;",
  "const identityPrecheckLastByUser = new Map();",
  source.slice(start, end),
].join("\n");

function screening(overrides = {}) {
  return {
    status: "text_consistent_unverified",
    declaredIdType: "national_id",
    detectedIdType: "national_id",
    warningCodes: [],
    backSideProvided: true,
    backSideScreened: true,
    ...overrides,
  };
}

function createSandbox({ aiReply = { outcome: "pass", documentScreening: screening() }, upstreamStatus = 200, endpoint = "https://private-qa.invalid/verify" } = {}) {
  const calls = [];
  const routes = [];
  const authGuard = function requireFirebaseUser() {};
  const rawGuard = function rawMultipart() {};
  const sandbox = {
    app: { post: (...args) => routes.push(args) },
    requireFirebaseUser: authGuard,
    express: { raw: options => {
      calls.push({ type: "raw", options });
      return rawGuard;
    } },
    IDENTITY_UPLOAD_LIMIT: "32mb",
    getIdentityAiEndpoint: () => endpoint,
    getIdentityAiHeaders: req => ({
      "Content-Type": req.headers["content-type"],
      "X-VolunServe-User-Id": req.firebaseUser.uid,
    }),
    normalizeIdDocumentScreening: value => screening(value),
    AbortSignal: { timeout: ms => ({ ms }) },
    Buffer,
    Map,
    Date,
    Math,
    String,
    console: { warn: () => {} },
    fetch: async (uri, options) => {
      calls.push({ type: "fetch", uri, options });
      return { ok: upstreamStatus >= 200 && upstreamStatus < 300, status: upstreamStatus, json: async () => aiReply };
    },
  };
  vm.runInNewContext(code, sandbox, { filename: "isolated-ocr-proxy-from-backend-server.js" });
  assert.equal(routes.length, 1);
  const [path, middleware, parser, handler] = routes[0];
  assert.equal(path, "/api/identity/document/precheck");
  assert.equal(middleware, authGuard, "Firebase auth middleware must remain mandatory");
  assert.equal(parser, rawGuard);
  assert.equal(calls[0].options.limit, "32mb", "Three <=10MB private images require 32MB multipart limit");

  async function call({ uid = "fake-resident-123", body = Buffer.from("synthetic form data"), contentType = "multipart/form-data; boundary=fake" } = {}) {
    const output = { status: 200, headers: {}, body: null };
    const req = { firebaseUser: uid ? { uid } : {}, body, headers: { "content-type": contentType } };
    const res = {
      set(key, value) { output.headers[key] = value; return this; },
      status(status) { output.status = status; return this; },
      json(data) { output.body = data; return this; },
    };
    await handler(req, res);
    return output;
  }
  return { call, calls };
}

test("precheck relays ONLY to private /document/precheck and returns sanitized pass", async () => {
  const x = createSandbox();
  const result = await x.call();
  assert.equal(result.status, 200);
  assert.equal(result.body.outcome, "pass");
  assert.equal(result.headers["Cache-Control"], "no-store");
  const sent = x.calls.filter(c => c.type === "fetch");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].uri, "https://private-qa.invalid/document/precheck");
  assert.equal(sent[0].options.method, "POST");
  assert.equal(sent[0].options.headers["X-VolunServe-User-Id"], "fake-resident-123");
  assert.equal(sent[0].options.body.toString(), "synthetic form data");
  assert.equal(sent[0].options.signal.ms, 45000);
});

test("explicit School ID can NEVER yield pass even from a malicious upstream pass verdict", async () => {
  const x = createSandbox({ aiReply: {
    outcome: "pass",
    documentScreening: screening({ status: "mismatch", warningCodes: ["non_government_id_detected"] }),
  } });
  const result = await x.call();
  assert.equal(result.body.outcome, "rejected");
  assert.equal(result.body.documentScreening.warningCodes[0], "non_government_id_detected");
});

test("upstream pass must not bypass missing back screening", async () => {
  for (const value of [
    screening({ backSideProvided: false }),
    screening({ backSideScreened: false }),
    screening({ status: "inconclusive" }),
    screening({ detectedIdType: "drivers_license" }),
    screening({ warningCodes: ["ocr_unavailable"] }),
  ]) {
    const x = createSandbox({ aiReply: { outcome: "pass", documentScreening: value } });
    const result = await x.call();
    assert.equal(result.body.outcome, "retry");
  }
});

test("duplicate requests by same UID are throttled before AI invocation", async () => {
  const x = createSandbox();
  const first = await x.call();
  const second = await x.call();
  const separateUser = await x.call({ uid: "different-synthetic-user" });
  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(second.headers["Retry-After"], "6");
  assert.equal(separateUser.status, 200);
  assert.equal(x.calls.filter(c => c.type === "fetch").length, 2);
});

test("unauthenticated or malformed requests fail closed without private AI requests", async () => {
  for (const input of [{ uid: "" }, { body: Buffer.alloc(0) }, { contentType: "text/plain" }]) {
    const x = createSandbox();
    const result = await x.call(input);
    assert.equal(result.status, input.uid === "" && input.body === undefined ? 401 : 400);
    assert.equal(x.calls.filter(c => c.type === "fetch").length, 0);
  }
});

test("private AI endpoint unavailable or non-200 response never authorizes selfie", async () => {
  const broken = createSandbox({ endpoint: "" });
  const unavailable = await broken.call();
  assert.equal(unavailable.status, 503);
  assert.equal(broken.calls.filter(c => c.type === "fetch").length, 0);
  const upstream = createSandbox({ upstreamStatus: 503 });
  const response = await upstream.call();
  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
});
