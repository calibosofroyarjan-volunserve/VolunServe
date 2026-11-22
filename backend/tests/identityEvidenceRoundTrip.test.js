"use strict";
// Synthetic-only integration test: real multipart bytes -> private Cloudinary
// metadata -> protected Admin evidence handler. No network, Firebase account,
// personal image, government ID, or facial-biometric sample is used.
const test = require("node:test");
const assert = require("node:assert/strict");
const { Writable } = require("node:stream");
const zlib = require("node:zlib");
const { v2: cloudinary } = require("cloudinary");
const { readIdentityEvidence, storeIdentityEvidence } = require("../identityEvidence");
const { createProtectedIdentityEvidenceHandler } = require("../identityEvidenceReviewHandler");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const header = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header, data])));
  return Buffer.concat([length, header, data, crc]);
}
function syntheticPng(seed) {
  const width = 48, height = 48;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8-bit channel
  header[9] = 2; // RGB, no alpha
  const rows = [];
  for (let y = 0; y < height; y++) {
    const pixels = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const offset = 1 + 3 * x;
      pixels[offset] = (x * (seed + 2) + y * 7) % 256;
      pixels[offset + 1] = (y * (seed + 3) + x * 11) % 256;
      pixels[offset + 2] = ((x ^ y) * (seed + 17)) % 256;
    }
    rows.push(pixels);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function multipart() {
  const form = new FormData();
  form.set("idType", "national_id");
  form.set("evidenceConsent", "true");
  for (const [field, seed] of [["idDocument", 2], ["idBack", 7], ["selfie", 12]]) {
    form.set(field, new Blob([syntheticPng(seed)], { type: "image/png" }), field + ".png");
  }
  const request = new Request("http://localhost/verify", { method: "POST", body: form });
  return {
    body: Buffer.from(await request.arrayBuffer()),
    headers: { "content-type": request.headers.get("content-type") },
  };
}

test("synthetic front/back/selfie round trip reaches authorized audited Admin viewer", async () => {
  const uploadOriginal = cloudinary.uploader.upload_stream;
  const downloadOriginal = cloudinary.utils.private_download_url;
  const stored = {};
  const audit = [];
  try {
    cloudinary.uploader.upload_stream = (options, callback) => {
      assert.equal(options.type, "authenticated");
      assert.equal(options.resource_type, "image");
      assert.equal(options.overwrite, false);
      const buffers = [];
      return new Writable({
        write(chunk, _encoding, done) { buffers.push(chunk); done(); },
        final(done) {
          stored[options.public_id] = Buffer.concat(buffers);
          callback(null, {
            public_id: options.public_id,
            asset_id: "synthetic-" + Object.keys(stored).length,
            format: "png",
          });
          done();
        },
      });
    };
    cloudinary.utils.private_download_url = (publicId, format, options) => {
      assert.equal(format, "png");
      assert.equal(options.type, "authenticated");
      assert.equal(options.resource_type, "image");
      assert.ok(options.expires_at > Date.now() / 1000);
      return "https://synthetic.test/" + encodeURIComponent(publicId);
    };
    const upload = await readIdentityEvidence(await multipart());
    assert.equal(upload.idType, "national_id");
    assert.notDeepEqual(upload.images.front.buffer, upload.images.back.buffer);
    for (const side of ["front", "back", "selfie"]) {
      assert.equal(upload.images[side].format, "png");
      assert.ok(upload.images[side].buffer.length > 200);
    }

    const images = await storeIdentityEvidence("syntheticResident123", upload.images);
    assert.equal(Object.keys(stored).length, 3);
    assert.equal(Object.keys(images).length, 3);
    assert.ok(Object.values(images).every((value) =>
      value.deliveryType === "authenticated" && !("url" in value)));
    for (const side of ["front", "back", "selfie"]) {
      assert.deepEqual(stored[images[side].publicId], upload.images[side].buffer);
    }

    const verificationId = "syntheticVerification123";
    const evidence = {
      verificationId,
      idType: "national_id",
      consentToPrivateAdminReview: true,
      images,
      expiresAt: { toMillis: () => Date.now() + 100000 },
    };
    const db = {
      collection: (collection) => {
        if (collection === "adminActivityLogs") {
          return { add: async (event) => { audit.push(event); } };
        }
        return { doc: (uid) => {
          assert.equal(uid, "syntheticResident123");
          return { get: async () => ({
            exists: true,
            data: () => collection === "identityEvidence" ? evidence :
              { verificationId },
          }) };
        } };
      },
    };
    const handler = createProtectedIdentityEvidenceHandler({
      db,
      FieldValue: { serverTimestamp: () => "now" },
      configureCloudinary: () => {},
      privateIdentityEvidenceUrl: (image) => ({
        url: cloudinary.utils.private_download_url(image.publicId, image.format, {
          resource_type: "image",
          type: "authenticated",
          expires_at: Math.floor(Date.now() / 1000) + 300,
        }),
        expiresAt: Math.floor(Date.now() / 1000) + 300,
      }),
      cleanText: (x, length) => String(x || "").slice(0, length),
      makeHttpError: (statusCode, code, message) => Object.assign(
        new Error(message), { statusCode, code },
      ),
    });
    const response = {
      headers: {}, statusCode: 0, value: null,
      set(key, val) { this.headers[key] = val; return this; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.value = value; return this; },
    };
    await handler({
      firebaseUser: { uid: "syntheticAdmin456" },
      params: { uid: "syntheticResident123" },
    }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(Object.keys(response.value.images).sort(), ["back", "front", "selfie"]);
    assert.equal(response.value.verificationId, verificationId);
    assert.equal(response.value.idType, "national_id");
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actorUid, "syntheticAdmin456");
    assert.ok(!JSON.stringify(audit).includes("synthetic.test"));
    assert.equal(response.headers["Cache-Control"], "private, no-store, max-age=0");
  } finally {
    cloudinary.uploader.upload_stream = uploadOriginal;
    cloudinary.utils.private_download_url = downloadOriginal;
  }
});
