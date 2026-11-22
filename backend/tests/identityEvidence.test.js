"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readIdentityEvidence, imageFormat } = require("../identityEvidence");

function jpeg() { return new Uint8Array(Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.alloc(400, 42)])); }
function uploadRequest({ withBack = true, consent = true, idType = "national_id", badFormat = false } = {}) {
  const form = new FormData();
  form.set("idType", idType);
  if (consent) form.set("evidenceConsent", "true");
  const binary = badFormat ? new Uint8Array(404) : jpeg();
  form.set("idDocument", new Blob([binary], { type: "image/jpeg" }), "front.jpg");
  if (withBack) form.set("idBack", new Blob([jpeg()], { type: "image/jpeg" }), "back.jpg");
  form.set("selfie", new Blob([jpeg()], { type: "image/jpeg" }), "selfie.jpg");
  const request = new Request("http://localhost/test", { method: "POST", body: form });
  return request.arrayBuffer().then((buffer) => ({
    body: Buffer.from(buffer),
    headers: { "content-type": request.headers.get("content-type") },
  }));
}
test("National ID requires front back and selfie with consent", async () => {
  const media = await readIdentityEvidence(await uploadRequest());
  assert.equal(media.idType, "national_id");
  assert.equal(media.images.front.format, "jpg");
  assert.equal(media.images.back.format, "jpg");
  assert.equal(media.images.selfie.format, "jpg");
});
test("missing National ID back is rejected", async () => {
  await assert.rejects(readIdentityEvidence(await uploadRequest({ withBack: false })), {
    code: "identity_image_missing",
  });
});
test("private storage consent is mandatory", async () => {
  await assert.rejects(readIdentityEvidence(await uploadRequest({ consent: false })), {
    code: "identity_evidence_consent_required",
  });
});
test("image extension and MIME cannot disguise unsupported file bytes", async () => {
  await assert.rejects(readIdentityEvidence(await uploadRequest({ badFormat: true })), {
    code: "identity_image_type_invalid",
  });
});
test("other legacy government ID types do not require a back photo", async () => {
  const media = await readIdentityEvidence(await uploadRequest({ withBack: false, idType: "passport" }));
  assert.equal(media.images.back, null);
});
test("file magic detects PNG and WebP but rejects random bytes", () => {
  assert.equal(imageFormat(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0])), "png");
  assert.equal(imageFormat(Buffer.from("RIFF0000WEBP0000")), "webp");
  assert.equal(imageFormat(Buffer.alloc(40)), "");
});
