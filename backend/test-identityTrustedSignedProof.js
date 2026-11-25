"use strict";

const {test}=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {verifyTrustedSignedProof,createTrustedSignedValidators}=
  require("./identityTrustedSignedProof");
const {assessAutomaticIdentityApproval}=
  require("./identityAutoApprovalGateway");
const uid="syntheticResident123";
const verificationId="syntheticVerify123";
const requestId="syntheticRequest123";
const issuerName="SyntheticIssuerService";
const padName="SyntheticLivenessService";
const issuerKeyId="issuer_key_2026";
const padKeyId="pad_key_2026";
const nowSeconds=Math.floor(Date.now()/1000);
const nowMs=nowSeconds*1000;
const issuer=crypto.generateKeyPairSync("ed25519");
const pad=crypto.generateKeyPairSync("ed25519");
const keyPem=k=>k.publicKey.export({type:"spki",format:"pem"});
const B64=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
function proof(kind,modifications={},key){
  const spec=kind==="issuer"
    ? {name:issuerName,keyId:issuerKeyId,proofKind:"trusted_independent_issuer",
        successField:"documentGenuine",signer:issuer.privateKey}
    : {name:padName,keyId:padKeyId,proofKind:"validated_presentation_attack_detection",
        successField:"livePersonConfirmed",signer:pad.privateKey};
  const p={
    iss:spec.name,aud:"volunserve-trusted-identity-v1",sub:uid,
    verificationId,requestId,documentType:"national_id",proofType:kind,proofKind:spec.proofKind,
    jti:"syntheticSignedProof123",iat:nowSeconds-3,exp:nowSeconds+90,
    [spec.successField]:true,...modifications,
  };
  const h={alg:"EdDSA",typ:"JWT",kid:spec.keyId};
  const data=B64(h)+"."+B64(p);
  return data+"."+crypto.sign(null,Buffer.from(data),key||spec.signer).toString("base64url");
}
const params=(kind,token,overrides={})=>({
  token,provider:kind,
  keyPem:keyPem(kind==="issuer"?issuer:pad),
  expectedIssuer:kind==="issuer"?issuerName:padName,
  expectedKeyId:kind==="issuer"?issuerKeyId:padKeyId,
  uid,verificationId,requestId,documentType:"national_id",nowMs,...overrides
});
const screening={
  status:"text_consistent_unverified",
  declaredIdType:"national_id",detectedIdType:"national_id",
  imageQualityStatus:"adequate",profileNameCheck:"possible_match",
  profileBirthDateCheck:"possible_match",backSideScreened:true,warningCodes:[]
};
const face={
  result:"match",algorithmValidated:true,
  calibrationValidated:true,samePersonAssertion:true,verificationId
};
const attempt={uid,verificationId,freshCapture:true,consentedEvidenceAvailable:true};
function validators(overrides={}){
  return createTrustedSignedValidators({
    issuerToken:proof("issuer"),padToken:proof("pad"),
    uid,verificationId,requestId,documentType:"national_id",issuerKeyPem:keyPem(issuer),
    padKeyPem:keyPem(pad),issuerName,padName,
    issuerKeyId,padKeyId,nowMs,...overrides
  });
}
test("independent signed issuer and PAD proofs pass with authentic signatures and matching request",async()=>{
  const out=await assessAutomaticIdentityApproval({screening,face,attempt,...validators()});
  assert.equal(out.eligible,true);
  assert.equal(out.decision,"auto_verified");
  assert.equal(out.reason,"all_independent_proofs_validated");
  assert.match(out.trustedProofReplayKeys.issuer,/^[a-f0-9]{64}$/);
  assert.match(out.trustedProofReplayKeys.pad,/^[a-f0-9]{64}$/);
  assert.notEqual(out.trustedProofReplayKeys.issuer,out.trustedProofReplayKeys.pad);
});
test("reissued proof with same issuer JWT ID has same one-time receipt across different requests",()=>{
  const original=verifyTrustedSignedProof(params("issuer",proof("issuer")));
  const otherRequest="differentRequest123";
  const revised=verifyTrustedSignedProof(params(
    "issuer",proof("issuer",{requestId:otherRequest}),
    {requestId:otherRequest}
  ));
  assert.equal(original.trustedProofReplayKey,revised.trustedProofReplayKey);
});
test("issuer and PAD proof hashes differ even if provider JWT IDs are identical",()=>{
  const issuerReceipt=verifyTrustedSignedProof(params("issuer",proof("issuer")));
  const padReceipt=verifyTrustedSignedProof(params("pad",proof("pad")));
  assert.notEqual(issuerReceipt.trustedProofReplayKey,padReceipt.trustedProofReplayKey);
});
test("missing provider proof causes pending, not auto verified",async()=>{
  const v=validators({issuerToken:undefined});
  const out=await assessAutomaticIdentityApproval({screening,face,attempt,...v});
  assert.equal(out.eligible,false);
  assert.equal(out.reason,"independent_provider_validation_failed");
});
test("distinct trust roots mandatory",()=>{
  assert.throws(()=>validators({padKeyPem:keyPem(issuer)}),/issuer_pad_must_use_distinct_trust_roots/);
});
test("wrong pinned key cannot accept another provider signature",()=>{
  const inToken=proof("issuer");
  assert.throws(()=>verifyTrustedSignedProof(params("issuer",inToken,{keyPem:keyPem(pad)})),
    /independent_provider_proof_unverified/);
});
test("tampered claim cannot pass even with a valid format",()=>{
  const src=proof("issuer").split(".");
  const payload=JSON.parse(Buffer.from(src[1],"base64url").toString());
  payload.documentGenuine=false;
  src[1]=B64(payload);
  assert.throws(()=>verifyTrustedSignedProof(params("issuer",src.join("."))),
    /independent_provider_proof_unverified/);
});
test("do not permit a signed PAD assertion to stand in for issuer authenticity",()=>{
  assert.throws(()=>verifyTrustedSignedProof(params("issuer",proof("pad"),{
    keyPem:keyPem(pad),expectedIssuer:padName,expectedKeyId:padKeyId
  })),/independent_provider_proof_unverified/);
});
test("a spoofed algorithm header cannot downgrade signature verification",()=>{
  const chunks=proof("issuer").split(".");
  chunks[0]=B64({alg:"none",typ:"JWT",kid:issuerKeyId});
  assert.throws(()=>verifyTrustedSignedProof(params("issuer",chunks.join("."))),
    /independent_provider_proof_unverified/);
});
test("untrusted JKU/JWK header cannot replace pinned key",()=>{
  const chunks=proof("issuer").split(".");
  chunks[0]=B64({alg:"EdDSA",typ:"JWT",kid:issuerKeyId,
    jku:"https://attacker.invalid/jwks"});
  assert.throws(()=>verifyTrustedSignedProof(params("issuer",chunks.join("."))),
    /independent_provider_proof_unverified/);
});
function badClaim(name,kind,patch){
  test(name,()=>{
    const t=proof(kind,patch);
    assert.throws(()=>verifyTrustedSignedProof(params(kind,t)),
      /independent_provider_proof_unverified/);
  });
}
badClaim("user from another account cannot be verified","issuer",{sub:"differentResident123"});
badClaim("previous verification cannot be replayed","issuer",{verificationId:"previousVerification123"});
badClaim("previous camera capture nonce cannot be replayed","issuer",{requestId:"previousRequest123"});
badClaim("wrong audience rejected","issuer",{aud:"another-app"});
badClaim("National ID proof cannot authorize an unrelated ID type","issuer",{documentType:"passport"});
badClaim("unsupported proof kind rejected","issuer",{proofKind:"self_reported"});
badClaim("issuer attestation must actually confirm genuine ID","issuer",{documentGenuine:false});
badClaim("PAD must explicitly confirm live person","pad",{livePersonConfirmed:false});
badClaim("expired proof rejected","pad",{iat:nowSeconds-200,exp:nowSeconds-10});
badClaim("future-dated proof rejected","issuer",{iat:nowSeconds+50,exp:nowSeconds+90});
badClaim("proof longer than max TTL rejected","issuer",{iat:nowSeconds-1,exp:nowSeconds+500});
badClaim("missing unique proof ID rejected","issuer",{jti:""});
test("registered wrong issuer returns pending, cannot trust signature alone",async()=>{
  const v=validators({issuerName:"NotApprovedIssuerName"});
  const out=await assessAutomaticIdentityApproval({screening,face,attempt,...v});
  assert.equal(out.eligible,false);
});
test("invalid request ID blocks validator construction",()=>{
  assert.throws(()=>validators({requestId:"../path"}),/independent_provider_configuration_missing/);
});
test("a provider proof is not a substitute for an uncalibrated face matcher",async()=>{
  const result=await assessAutomaticIdentityApproval({
    screening,face:{...face,calibrationValidated:false},attempt,...validators()
  });
  assert.equal(result.eligible,false);
});
test("no real PSA or PAD accounts, endpoints, or credentials used",()=>{
  const src=require("node:fs").readFileSync("backend/identityTrustedSignedProof.js","utf8");
  assert(src.includes("This is NOT the PSA API"));
  assert(!src.includes("PRIVATE KEY-----"));
  assert(!src.includes("verify.philsys.gov.ph"));
  assert(!src.includes("everify.gov.ph/check"));
});
