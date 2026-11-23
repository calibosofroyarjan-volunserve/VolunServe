"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const { Firestore, FieldValue } = require("@google-cloud/firestore");
const { registerDiditIdentityRoutes, canonicalizeJson } = require("../diditIdentityRoutes");

test("Sandbox resident workflow through HTTP, signed webhooks and Firestore", {
  skip: process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080",
}, async t => {
  const db = new Firestore({ projectId: "demo-volunserve" });
  const prefix = crypto.randomUUID();
  const uid = name => prefix + "-" + name;
  const residents = ["approve", "review", "decline", "expire", "school", "mixed", "denied", "legacy"];
  const workflow = "9fd6c419-790b-45bf-be09-4892216eb155";
  Object.assign(process.env, { DIDIT_WORKFLOW_ID: workflow, DIDIT_ENVIRONMENT: "sandbox",
    DIDIT_INTEGRATION_ENABLED: "true", DIDIT_API_KEY: "unit-test", DIDIT_WEBHOOK_SECRET: prefix,
    DIDIT_TEST_UIDS: residents.filter(x => x !== "denied").map(uid).join(",") });
  const app = express();
  app.use(express.json());
  // Inject an authenticated principal; production uses requireFirebaseUser.
  registerDiditIdentityRoutes(app, { db, FieldValue, requireFirebaseUser(req, res, next) {
    if (!residents.includes(req.headers.resident)) return res.sendStatus(401);
    req.firebaseUser = { uid: uid(req.headers.resident) };
    next();
  } });
  const sessions = new Map();
  const approvedCheck = [{ status: "Approved" }];
  const network = global.fetch;
  t.mock.method(global, "fetch", async (url, options) => {
    assert.ok(String(url).startsWith("https://verification.didit.me/v3/session/"));
    assert.equal(options.headers["x-api-key"], "unit-test");
    if (options.method === "POST") {
      const body = JSON.parse(options.body);
      const id = crypto.randomUUID();
      const session = { session_id: id, vendor_data: body.vendor_data, workflow_id: body.workflow_id,
        session_kind: "user", environment: "sandbox", status: "Not Started",
        session_url: "https://verify.didit.me/" + id, face_matches: approvedCheck,
        liveness_checks: approvedCheck, id_verifications: [{ ...approvedCheck[0],
          issuing_state: "PHL", document_type: "Identity Card", document_subtype: "UMID card" }] };
      sessions.set(id, session);
      return Response.json({ ...session, url: session.session_url });
    }
    return Response.json(sessions.get(String(url).split("/").at(-3)));
  });
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.terminate(); });
  const base = "http://127.0.0.1:" + server.address().port + "/api/identity/didit/";
  const call = (name, route, method = "POST") => network(base + route, { method, headers: { resident: name } });
  const profile = name => db.doc("users/" + uid(name));
  const entry = name => db.doc("identityVerifications/" + uid(name));
  for (const name of residents) await profile(name).set({ role: "resident", status: "approved", identityVerified: false });
  async function start(name) {
    const response = await call(name, "start");
    assert.equal(response.status, 201);
    return sessions.get((await response.json()).sessionId);
  }
  function notify(session, signed = true) {
    const payload = { timestamp: Math.floor(Date.now()/1000), webhook_type: "status.updated", vendor_data: session.vendor_data, session_id: session.session_id };
    const sig = crypto.createHmac("sha256", prefix).update(JSON.stringify(canonicalizeJson(payload))).digest("hex");
    return network(base + "webhook", { method: "POST", headers: { "Content-Type": "application/json",
      "x-timestamp": String(payload.timestamp), "x-signature-v2": signed ? sig : "invalid" },
      body: JSON.stringify(payload) });
  }
  await t.test("authenticated test residents only; preserve legacy evidence", async () => {
    assert.equal((await call("unknown", "start")).status, 401);
    assert.equal((await call("denied", "start")).status, 403);
    await entry("legacy").set({ evidence: "existing" });
    assert.equal((await call("legacy", "start")).status, 409);
    assert.deepEqual((await entry("legacy").get()).data(), { evidence: "existing" });
  });
  await t.test("Approved; verify sandbox resident and ignore duplicate delivery", async () => {
    const session = await start("approve");
    assert.equal((await (await call("approve", "start")).json()).sessionId, session.session_id);
    session.status = "Approved";
    assert.equal((await notify(session, false)).status, 401);
    assert.equal((await notify(session)).status, 200);
    const before = await entry("approve").get();
    assert.equal((await notify(session)).status, 200);
    assert.ok(before.updateTime.isEqual((await entry("approve").get()).updateTime));
    assert.equal((await profile("approve").get()).data().identityVerified, true);
  });
  await t.test("Declined; count each session once and route third failure to Admin", async () => {
    for (let i=1; i<=3; i++) {
      const session = await start("decline");
      session.status = "Declined";
      await notify(session);
      await notify(session);
      const state = (await entry("decline").get()).data();
      assert.equal(state.diditFailedAttempts, i);
      assert.equal(state.requiresManualReview, i === 3);
    }
    assert.equal((await call("decline", "start")).status, 409);
  });
  await t.test("In Review and failed liveness cannot verify", async () => {
    const session = await start("review");
    session.status = "In Review";
    await notify(session);
    assert.equal((await entry("review").get()).data().requiresManualReview, true);
    session.status = "Approved";
    session.liveness_checks = [{status:"Declined"}];
    await notify(session);
    assert.equal((await profile("review").get()).data().identityVerified, false);
  });
  await t.test("School ID is declined even in an approved ID card family", async () => {
    const session = await start("school");
    session.status = "Approved";
    session.id_verifications[0].document_subtype = "School ID";
    await notify(session);
    assert.equal((await entry("school").get()).data().status, "failed");
  });
  await t.test("expired session can retry; environment mismatch blocks approval", async () => {
    const session = await start("expire");
    session.status = "Expired";
    assert.equal((await (await call("expire","sync","GET")).json()).identityStatus,"failed");
    assert.notEqual((await start("expire")).session_id, session.session_id);
    const mixed = await start("mixed");
    mixed.status = "Approved";
    mixed.environment = "live";
    assert.equal((await notify(mixed)).status,409);
    assert.equal((await profile("mixed").get()).data().identityVerified,false);
  });
});
