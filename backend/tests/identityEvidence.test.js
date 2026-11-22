"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readIdentityEvidence, imageFormat, storeIdentityEvidence, destroyIdentityEvidence, privateIdentityEvidenceUrl, purgeRetiredIdentityEvidence } = require("../identityEvidence");
const { v2: cloudinary } = require("cloudinary");
const { Writable } = require("node:stream");

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

test("private upload and temporary preview never publish direct image URLs", async () => {
  const previousUpload = cloudinary.uploader.upload_stream;
  const previousDestroy = cloudinary.uploader.destroy;
  const previousDownload = cloudinary.utils.private_download_url;
  const uploaded = [], deleted = [];
  try {
    cloudinary.uploader.upload_stream = (options, callback) => {
      uploaded.push(options);
      return new Writable({
        write(_chunk, _encoding, done) { done(); },
        final(done) {
          callback(null, { public_id: options.public_id, asset_id: "mock_asset", format: "jpg" });
          done();
        },
      });
    };
    cloudinary.uploader.destroy = async (publicId, options) => {
      deleted.push({ publicId, options });
      return { result: "ok" };
    };
    cloudinary.utils.private_download_url = (publicId, format, options) => {
      assert.equal(options.type, "authenticated");
      assert.equal(options.resource_type, "image");
      assert.equal(format, "jpg");
      assert.ok(options.expires_at > Math.floor(Date.now() / 1000));
      assert.ok(publicId.startsWith("volunserve/identity-review/"));
      return "https://api.cloudinary.com/test/signed";
    };
    const images = await storeIdentityEvidence("mockResident123", {
      front: { buffer: Buffer.from(jpeg()), format: "jpg" },
      back: { buffer: Buffer.from(jpeg()), format: "jpg" },
      selfie: { buffer: Buffer.from(jpeg()), format: "jpg" },
    });
    assert.deepEqual(Object.keys(images).sort(), ["back", "front", "selfie"]);
    assert.equal(uploaded.length, 3);
    for (const options of uploaded) {
      assert.equal(options.type, "authenticated");
      assert.equal(options.overwrite, false);
    }
    for (const stored of Object.values(images)) {
      assert.equal(stored.deliveryType, "authenticated");
      assert.equal(stored.bytes, 404);
      assert.ok(!("url" in stored));
      const preview = privateIdentityEvidenceUrl(stored);
      assert.match(preview.url, /^https:\/\//);
      assert.ok(preview.expiresAt <= Math.floor(Date.now() / 1000) + 300);
    }
    const outcome = await destroyIdentityEvidence(images);
    assert.equal(outcome.length, 3);
    assert.ok(outcome.every((entry) => entry.status === "fulfilled"));
    assert.equal(deleted.length, 3);
    assert.ok(deleted.every((entry) => entry.options.type === "authenticated"));
  } finally {
    cloudinary.uploader.upload_stream = previousUpload;
    cloudinary.uploader.destroy = previousDestroy;
    cloudinary.utils.private_download_url = previousDownload;
  }
});

test("incomplete upload metadata triggers deletion of already-created private assets", async () => {
  const previousUpload = cloudinary.uploader.upload_stream;
  const previousDestroy = cloudinary.uploader.destroy;
  const deleted = [];
  try {
    cloudinary.uploader.upload_stream = (options, callback) => new Writable({
      write(_chunk, _encoding, done) { done(); },
      final(done) {
        // Cloudinary claims the resource exists but omits its asset_id.
        callback(null, { public_id: options.public_id, format: "jpg" });
        done();
      },
    });
    cloudinary.uploader.destroy = async (publicId, options) => {
      deleted.push({ publicId, type: options.type });
      return { result: "ok" };
    };
    await assert.rejects(
      storeIdentityEvidence("mockResident123", {
        front: { buffer: Buffer.from(jpeg()), format: "jpg" },
      }),
      { code: "identity_evidence_upload_failed" },
    );
    assert.equal(deleted.length, 1);
    assert.ok(deleted[0].publicId.endsWith("-front"));
    assert.equal(deleted[0].type, "authenticated");
  } finally {
    cloudinary.uploader.upload_stream = previousUpload;
    cloudinary.uploader.destroy = previousDestroy;
  }
});

test("combined media exceeding safe multipart budget is rejected with a useful error", async () => {
  await assert.rejects(readIdentityEvidence({
    body: Buffer.alloc(19 * 1024 * 1024 + 1),
    headers: { "content-type": "multipart/form-data; boundary=x" },
  }), {
    code: "identity_upload_too_large",
    statusCode: 413,
  });
});
test("individual oversized photos are rejected before a Cloudinary upload", async () => {
  const form = new FormData();
  form.set("idType", "national_id");
  form.set("evidenceConsent", "true");
  const front = Buffer.concat([Buffer.from([255,216,255,224]), Buffer.alloc(6 * 1024 * 1024)]);
  form.set("idDocument", new Blob([front], {type:"image/jpeg"}), "front.jpg");
  form.set("idBack", new Blob([jpeg()], {type:"image/jpeg"}), "back.jpg");
  form.set("selfie", new Blob([jpeg()], {type:"image/jpeg"}), "selfie.jpg");
  const request = new Request("http://localhost/test", { method: "POST", body: form });
  const bytes = Buffer.from(await request.arrayBuffer());
  await assert.rejects(readIdentityEvidence({
    body: bytes,
    headers: { "content-type": request.headers.get("content-type") },
  }), {
    code: "identity_image_size_invalid",
  });
});

test("retired private images stay queued on provider failure and are removed on retry", async () => {
  const prior = cloudinary.uploader.destroy;
  const images = { front: { publicId: "private/mock/old-front" } };
  let shouldFail = true, deletedRecord = false;
  const record = {
    data: () => ({ images }),
    ref: { delete: async () => { deletedRecord = true; } },
  };
  const db = {
    collection: (name) => {
      assert.equal(name, "identityEvidenceRetirements");
      return {
        limit: (count) => {
          assert.equal(count, 25);
          return {
            get: async () => ({ size: 1, docs: [record] }),
          };
        },
      };
    },
  };
  try {
    cloudinary.uploader.destroy = async () => shouldFail
      ? { result: "error" } : { result: "ok" };
    const first = await purgeRetiredIdentityEvidence(db);
    assert.equal(first.purged, 0);
    assert.equal(deletedRecord, false);
    shouldFail = false;
    const second = await purgeRetiredIdentityEvidence(db);
    assert.equal(second.purged, 1);
    assert.equal(deletedRecord, true);
  } finally {
    cloudinary.uploader.destroy = prior;
  }
});


test("Cloudinary timeout after storage is queued for private-image deletion retry", async () => {
  const previousUpload = cloudinary.uploader.upload_stream;
  const previousDestroy = cloudinary.uploader.destroy;
  const seen = [];
  let queued = null;
  try {
    cloudinary.uploader.upload_stream = (options, callback) => new Writable({
      write(_chunk, _encoding, done) { done(); },
      final(done) {
        seen.push(options.public_id);
        callback(new Error("transport timeout after upload"));
        done();
      },
    });
    cloudinary.uploader.destroy = async () => ({ result: "error" });
    await assert.rejects(
      storeIdentityEvidence("testResident123", {
        front: { buffer: Buffer.from(jpeg()), format: "jpg" },
      }, {
        onCleanupFailure: async (images) => { queued = images; },
      }),
      { code: "identity_evidence_upload_failed", statusCode: 503 },
    );
    assert.equal(seen.length, 1);
    assert.ok(queued?.front?.publicId);
    assert.equal(queued.front.publicId, seen[0]);
    assert.ok(queued.front.publicId.endsWith("-front"));
  } finally {
    cloudinary.uploader.upload_stream = previousUpload;
    cloudinary.uploader.destroy = previousDestroy;
  }
});
