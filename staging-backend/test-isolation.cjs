"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { assertIsolatedConfig, createStagingServer } = require("./server.cjs");
const safe = { VOLUNSERVE_STAGING_API_MODE: "isolated-shell" };

test("server refuses non-staging mode, production identity and credentials", () => {
  assert.throws(() => assertIsolatedConfig({}), /explicit isolated-shell/);
  assert.throws(() => assertIsolatedConfig({ ...safe, FIREBASE_PROJECT_ID: "volunserve-3aa5b" }), /production Firebase/);
  assert.throws(() => assertIsolatedConfig({ ...safe, FIREBASE_SERVICE_ACCOUNT: "{}" }), /credential/);
  assert.throws(() => assertIsolatedConfig({ ...safe, PAYMONGO_SECRET_KEY: "test_placeholder" }), /credential/);
  assert.throws(() => assertIsolatedConfig({ ...safe, GOOGLE_APPLICATION_CREDENTIALS: "/tmp/production.json" }), /credential/);
  assert.throws(() => assertIsolatedConfig({ ...safe, CLOUDINARY_API_SECRET: "secret" }), /credential/);
  assert.throws(() => assertIsolatedConfig({ ...safe, STAGING_ALLOWED_ORIGIN: "https://volunserve.com" }), /only a separately hosted staging origin/);
  assert.throws(() => assertIsolatedConfig({ ...safe, STAGING_ALLOWED_ORIGIN: "https://volunserve-3aa5b.web.app" }), /only a separately hosted staging origin/);
  assert.equal(assertIsolatedConfig({ ...safe, STAGING_ALLOWED_ORIGIN: "https://volunserve-preview.onrender.com" }), "https://volunserve-preview.onrender.com");
});

test("health is read-only; real routes and POST writes fail closed", async () => {
  const server = createStagingServer(safe);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = "http://127.0.0.1:" + server.address().port;
  try {
    let resp = await fetch(url + "/health");
    assert.equal(resp.status, 200);
    assert.deepEqual(await resp.json(), {
      ok: true, app: "VolunServe", mode: "isolated-staging-shell", productionConnected: false
    });
    assert.equal(resp.headers.get("access-control-allow-origin"), null);

    resp = await fetch(url + "/api/staging/readiness");
    assert.equal(resp.status, 200);
    assert.equal((await resp.json()).realLoginReady, false);

    for (const [method, route] of [
      ["POST", "/api/paymongo/checkout-session"],
      ["POST", "/api/identity/verify"],
      ["POST", "/api/assistance/evidence"],
      ["PATCH", "/api/admin/approve"],
      ["GET", "/api/assistance/review"],
      ["GET", "/some-other-path"],
    ]) {
      resp = await fetch(url + route, { method });
      assert.equal(resp.status, 503, method + " " + route);
      assert.equal((await resp.json()).code, "STAGING_NOT_CONFIGURED");
    }
    resp = await fetch(url + "/api/identity/verify", {
      method: "OPTIONS", headers: { origin: "https://volunserve.com" }
    });
    assert.equal(resp.status, 403, "production web origin cannot call staging");
  } finally {
    server.close();
    await once(server, "close");
  }
});
