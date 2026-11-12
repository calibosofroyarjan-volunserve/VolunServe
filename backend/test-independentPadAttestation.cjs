"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const {verifyIndependentPadAttestation:verify}=require("./independentPadAttestation");

const {privateKey,publicKey}=crypto.generateKeyPairSync("ed25519");
const pem=publicKey.export({format:"pem",type:"spki"}).toString();
const uid="synthetic-staging-account";
const requestId="independent-staging-request-123";
const media=Buffer.from("synthetic multipart fixture, NOT a human image");
const issuer="independent-pad-provider-stage";
const now=1762970000000;
const hash=s=>crypto.createHash("sha256").update(s).digest("hex");
const body=(override={})=>({
  version:1,issuer,decision:"live",uidHash:hash(uid),requestId,
  multipartSha256:hash(media),issuedAtMs:now-1000,expiresAtMs:now+60000,
  ...override
});
function signed(payload=body()){
  const raw=Buffer.from(JSON.stringify(payload),"utf8");
  return {
    payloadB64url:raw.toString("base64url"),
    signatureB64url:crypto.sign(null,raw,privateKey).toString("base64url"),
  };
}
const args=(override={})=>({
  evidence:signed(),publicKeyPem:pem,expectedIssuer:issuer,
  expectedUid:uid,expectedRequestId:requestId,multipartBytes:media,
  nowMs:now,...override
});

test("Fail closed without an independent PAD provider or evidence",()=>{
  assert.deepEqual(verify(args({publicKeyPem:""})),{status:"not_validated",reason:"provider_unconfigured"});
  assert.deepEqual(verify(args({expectedIssuer:""})),{status:"not_validated",reason:"provider_unconfigured"});
  assert.deepEqual(verify(args({evidence:null})),{status:"not_validated",reason:"evidence_missing"});
  assert.notEqual(verify(args({evidence:{livenessImplemented:true,livenessScore:1}})).status,"provider_attested");
});

test("Signed, fresh, exact UID/request/media attestation is authenticated but NOT certified liveness",()=>{
  const result=verify(args());
  assert.equal(result.status,"provider_attested");
  assert.equal(result.reason,"signed_provider_claim_unvalidated");
  assert.equal(result.padValidated,undefined,"Never claim a PAD certification or verified identity");
});

test("Signed replay-attack decision is treated as spoof detection only",()=>{
  const result=verify(args({evidence:signed(body({decision:"attack"}))}));
  assert.equal(result.status,"spoof_detected");
  assert.equal(result.reason,"provider_rejected");
});

test("Reject tampered signatures and any attempt to transfer evidence across accounts or frames",()=>{
  const cases=[
    {evidence:signed(body({decision:"live",requestId:"other"}))},
    {expectedUid:"other-resident"},
    {expectedRequestId:"another-request"},
    {multipartBytes:Buffer.from("different, untrusted selfie")},
    {expectedIssuer:"fake-provider"},
    {evidence:signed(body({expiresAtMs:now-1}))},
    {evidence:signed(body({issuedAtMs:now+12000}))},
    {evidence:signed(body({expiresAtMs:now+150000}))},
    {evidence:signed(body({version:2}))},
    {evidence:signed(body({uidHash:"a".repeat(64)}))},
    {evidence:signed(body({decision:"verified"}))},
    {evidence:{payloadB64url:signed().payloadB64url,signatureB64url:"a".repeat(86)}},
    {evidence:{payloadB64url:"!invalid!",signatureB64url:"a".repeat(86)}},
  ];
  for(const change of cases){
    const result=verify(args(change));
    assert.notEqual(result.status,"provider_attested",JSON.stringify(Object.keys(change)));
  }
});

test("A valid signature from an unrelated key is rejected",()=>{
  const other=crypto.generateKeyPairSync("ed25519");
  const result=verify(args({publicKeyPem:other.publicKey.export({format:"pem",type:"spki"}).toString()}));
  assert.equal(result.status,"not_validated");
  assert.equal(result.reason,"invalid_signature");
});

test("Verification routes hard-block media and do not trust AI liveness claims",()=>{
  const source=fs.readFileSync("backend/server.js","utf8");
  assert.match(source,/const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false/);
  assert.match(source,/requireStagingIdentityMediaApproval,\s*express\.raw/);
  const begin=source.indexOf('"/api/identity/verify"');
  const end=source.indexOf("function identityAdminTimestampIso",begin);
  assert.ok(begin>0 && end>begin);
  const route=source.slice(begin,end);
  assert.match(route,/verifyIndependentPadAttestation\(\{/);
  assert.match(route,/expectedUid: uid/);
  assert.match(route,/expectedRequestId: requestId/);
  assert.match(route,/request.identityPadRequestId = requestId/);
  assert.match(source,/headers\["X-VolunServe-PAD-Request-Id"\] = request.identityPadRequestId/);
  assert.match(source,/headers\["X-VolunServe-PAD-Multipart-SHA256"\]/);
  assert.match(route,/multipartBytes: request\.body/);
  assert.match(route,/const livenessScore = null;/);
  assert.match(route,/padValidated: false/);
  assert.match(route,/identityVerified: false/);
  assert.doesNotMatch(route,/identityVerified: true/);
  assert.match(route,/const decision = pad\.status === "spoof_detected"/);
});
