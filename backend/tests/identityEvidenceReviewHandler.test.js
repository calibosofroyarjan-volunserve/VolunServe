"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createProtectedIdentityEvidenceHandler } = require("../identityEvidenceReviewHandler");

const UID = "testResident1234";
function harness(overrides = {}) {
  const logs = [];
  let urlsSigned = 0;
  const images = {
    front: { publicId: "mock/front", deliveryType: "authenticated" },
    back: { publicId: "mock/back", deliveryType: "authenticated" },
    selfie: { publicId: "mock/selfie", deliveryType: "authenticated" },
  };
  const evidence = {
    verificationId: "review_20261122",
    idType: "national_id",
    consentToPrivateAdminReview: true,
    expiresAt: { toMillis: () => Date.now() + 60000 },
    images,
    ...overrides.evidence,
  };
  const verification = {
    verificationId: "review_20261122",
    ...overrides.verification,
  };
  const db = {
    collection: (name) => {
      if (name === "adminActivityLogs") {
        return { add: async (value) => {
          if (overrides.auditFailure) throw new Error("audit database offline PRIVATE_SECRET_TEST_ONLY");
          logs.push(value);
        }};
      }
      if (!["identityEvidence", "identityVerifications"].includes(name)) {
        throw new Error("Unexpected collection " + name);
      }
      return { doc: (id) => ({
        get: async () => {
          assert.equal(id, UID);
          const value = name === "identityEvidence" ? evidence : verification;
          return { exists: !overrides.missing?.includes(name), data: () => value };
        },
      }) };
    },
  };
  const handler = createProtectedIdentityEvidenceHandler({
    db,
    FieldValue: { serverTimestamp: () => "server-time" },
    configureCloudinary: () => {},
    privateIdentityEvidenceUrl: (image) => {
      urlsSigned++;
      return { url: "https://private.example.test/" + image.publicId, expiresAt: 300 };
    },
    cleanText: (v, max) => String(v || "").slice(0, max),
    makeHttpError: (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code }),
  });
  const req = { firebaseUser: { uid: "adminActor123" }, params: { uid: UID } };
  const res = {
    headers: {},
    statusCode: 0,
    payload: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
  };
  return {
    handler, req, res, logs,
    get signedCount() { return urlsSigned; },
    async invoke() { await handler(req, res); return res; },
  };
}
test("unauthed actor gets 401 and no signed private links", async () => {
  const h = harness();
  h.req.firebaseUser = null;
  const res = await h.invoke();
  assert.equal(res.statusCode, 401);
  assert.equal(h.signedCount, 0);
  assert.equal(h.logs.length, 0);
});
test("different submission ID gets 404, not old protected images", async () => {
  const h = harness({ verification: { verificationId: "newer-review" } });
  assert.equal((await h.invoke()).statusCode, 404);
  assert.equal(h.signedCount, 0);
  assert.equal(h.logs.length, 0);
});
test("expired evidence gets 410, not private images", async () => {
  const h = harness({ evidence: { expiresAt: { toMillis: () => Date.now() - 1 } } });
  assert.equal((await h.invoke()).statusCode, 410);
  assert.equal(h.signedCount, 0);
});
test("National ID back photo is required for protected review", async () => {
  const h = harness({ evidence: { images: {
    front: { publicId: "front" }, selfie: { publicId: "selfie" },
  }}});
  const response = await h.invoke();
  assert.equal(response.statusCode, 404);
  assert.equal(response.payload.error, "identity_evidence_incomplete");
  assert.equal(h.signedCount, 0);
});
test("consent is required before any private photo URL is signed", async () => {
  const h = harness({ evidence: { consentToPrivateAdminReview: false } });
  assert.equal((await h.invoke()).statusCode, 404);
  assert.equal(h.signedCount, 0);
});
test("missing Firestore evidence is never interpreted as existing", async () => {
  const h = harness({ missing: ["identityEvidence"] });
  assert.equal((await h.invoke()).statusCode, 404);
  assert.equal(h.signedCount, 0);
});
test("valid matching record returns 3 signed photos and saves audit", async () => {
  const h = harness();
  const response = await h.invoke();
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.deepEqual(Object.keys(response.payload.images).sort(), ["back","front","selfie"]);
  assert.equal(response.payload.verificationId, "review_20261122");
  assert.equal(h.signedCount, 3);
  assert.equal(h.logs.length, 1);
  assert.equal(h.logs[0].action, "identity_evidence_viewed");
  assert.equal(h.logs[0].actorUid, "adminActor123");
  assert.equal(h.logs[0].targetUid, UID);
  assert.ok(!JSON.stringify(h.logs[0]).includes("private.example"));
  assert.equal(response.headers["Cache-Control"], "private, no-store, max-age=0");
});
test("audit failure must prevent release of protected ID links", async () => {
  const h = harness({ auditFailure: true });
  const res = await h.invoke();
  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.ok, false);
  assert.ok(!JSON.stringify(res.payload).includes("private.example"));
  assert.ok(!JSON.stringify(res.payload).includes("PRIVATE_SECRET_TEST_ONLY"));
  assert.equal(res.payload.message, "Unable to view private identity photos. Please retry or contact an administrator.");
});
