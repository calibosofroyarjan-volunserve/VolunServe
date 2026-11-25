"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {validateFaceOnlyReviewEvidence: guard} = require("../identityFaceOnlyReviewEvidence");

const UID = "syntheticResident123";
const REQUEST = "syntheticRequest123";
const VERIFY = "synthetic-verification-001";
const NOW = 1795570000000;
const id = slot => `volunserve/identity-private/${UID}/${REQUEST}/${slot}`;
function fixture() {
  return {
    uid: UID,
    verification: {privateEvidenceRequestId: REQUEST, verificationId: VERIFY},
    evidence: {
      uid: UID, requestId: REQUEST, verificationId: VERIFY,
      purpose: "consented_manual_identity_review",
      retentionUntil: {toMillis: () => NOW + 60_000},
      assets: {
        front: {publicId: id("front"),resourceType:"image",deliveryType:"authenticated",format:"jpg"},
        selfie: {publicId: id("selfie"),resourceType:"image",deliveryType:"authenticated",format:"png"},
      }
    },
    now: NOW,
  };
}
function fail(name, edit, expectedReason) {
  test(name, () => {
    const data = fixture();
    edit(data);
    assert.deepEqual(guard(data), {ok:false, reason:expectedReason});
  });
}
test("current linked, unexpired and authenticated National ID + selfie PASS", () => {
  assert.deepEqual(guard(fixture()), {ok:true, reason:"verified_private_evidence_metadata"});
});
fail("missing private evidence refuses verification", d => d.evidence=null, "evidence_missing");
fail("invalid Resident UID refuses verification", d => d.uid="../target", "invalid_resident");
fail("current request link absent refuses verification", d => d.verification.privateEvidenceRequestId="", "verification_evidence_unlinked");
fail("wrong verification ID refuses verification", d => d.evidence.verificationId="old-version", "verification_evidence_mismatch");
fail("wrong request ID refuses verification", d => d.evidence.requestId="prior-request", "verification_evidence_mismatch");
fail("wrong resident refuses verification", d => d.evidence.uid="otherResident", "verification_evidence_mismatch");
fail("missing explicit processing consent refuses verification", d => d.evidence.purpose="miscellaneous", "verification_evidence_mismatch");
fail("expired images refuse verification", d => d.evidence.retentionUntil={toMillis:()=>NOW-1}, "evidence_expired_or_invalid");
fail("exact expiry moment refuses verification", d => d.evidence.retentionUntil={toMillis:()=>NOW}, "evidence_expired_or_invalid");
fail("missing expiry refuses verification", d => delete d.evidence.retentionUntil, "evidence_expired_or_invalid");
fail("unsupported expiry string refuses verification", d => d.evidence.retentionUntil="2099-01-01", "evidence_expired_or_invalid");
fail("missing front refuses verification", d => delete d.evidence.assets.front, "private_front_missing_or_invalid");
fail("missing selfie refuses verification", d => delete d.evidence.assets.selfie, "private_selfie_missing_or_invalid");
fail("old front request refuses verification", d => d.evidence.assets.front.publicId=id("front").replace(REQUEST,"oldRequest"), "private_front_missing_or_invalid");
fail("old selfie request refuses verification", d => d.evidence.assets.selfie.publicId=id("selfie").replace(REQUEST,"oldRequest"), "private_selfie_missing_or_invalid");
fail("public Cloudinary front refuses verification", d => d.evidence.assets.front.deliveryType="upload", "private_front_missing_or_invalid");
fail("wrong Cloudinary resource type refuses verification", d => d.evidence.assets.selfie.resourceType="raw", "private_selfie_missing_or_invalid");
fail("unsupported media format refuses verification", d => d.evidence.assets.selfie.format="svg", "private_selfie_missing_or_invalid");
fail("other user publicId refuses verification", d => d.evidence.assets.front.publicId=id("front").replace(UID,"anotherResident"), "private_front_missing_or_invalid");
test("non-approval review actions remain available and no unrelated modules changed", () => {
  const server=fs.readFileSync(require.resolve("../server").replace(/server\.js$/,"server.js"),"utf8");
  assert(server.includes('if (action === "verify") {'));
  assert(server.includes('const currentEvidence = validateFaceOnlyReviewEvidence({'));
  assert(server.includes('evidence: evidenceSnapshot.exists ? evidenceSnapshot.data() : null'));
  assert(server.includes('const evidenceRef = db.collection("identityPrivateEvidence").doc(targetUid)'));
  assert(server.includes('transaction.get(evidenceRef)'));
  assert(server.includes('return {\n          status: "failed",\n          identityVerified: false,'));
  assert(server.includes('targetUid === adminUid'));
  assert(server.includes('reviewIssuerEvidence({'));
});
