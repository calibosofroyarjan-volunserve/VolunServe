"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {reviewIssuerEvidence}=require("./identityIssuerReviewPolicy");
test("National ID cannot be approved on OCR/face score without PSA review",()=>{
 for(const method of ["","official_document_check","in_person_lgu_validation","barangay_lgu_record_check"]){
  const r=reviewIssuerEvidence({declaredType:"national_id",validationMethod:method,confirmed:true,notes:"Independently checked using official source"});
  assert.equal(r.ok,false);
 }
});
test("National ID requires an explicit admin attestation and privacy-safe notes",()=>{
 const args={declaredType:"national_id",validationMethod:"psa_national_id_qr_check",notes:"PSA QR result independently reviewed, holder present"};
 assert.equal(reviewIssuerEvidence({...args,confirmed:false}).ok,false);
 assert.equal(reviewIssuerEvidence({...args,confirmed:true,notes:"short"}).ok,false);
 const r=reviewIssuerEvidence({...args,confirmed:true});
 assert.equal(r.ok,true);
 assert.equal(r.issuerAuthenticityAutomaticallyVerified,false);
 assert.equal(r.independentAdminCheckAttested,true);
});
test("Other IDs cannot use PSA National ID review method",()=>{
 for(const id of ["drivers_license","passport","umid","prc_id"]){
  assert.equal(reviewIssuerEvidence({declaredType:id,validationMethod:"psa_national_id_qr_check",confirmed:true,notes:"Validated manually and checked full document"}).ok,false);
  assert.equal(reviewIssuerEvidence({declaredType:id,validationMethod:"in_person_lgu_validation",confirmed:true,notes:"In-person independent review performed"}).ok,true);
 }
});
test("unsupported ID type cannot pass admin attestation",()=>{
 assert.equal(reviewIssuerEvidence({declaredType:"school_id",validationMethod:"in_person_lgu_validation",confirmed:true,notes:"In-person review"}).ok,false);
});
test("missing attestation cannot pass for any supported ID",()=>{
 for(const declaredType of ["national_id","drivers_license","passport","umid","prc_id"]){
  assert.equal(reviewIssuerEvidence({declaredType,validationMethod:declaredType==="national_id"?"psa_national_id_qr_check":"official_document_check",confirmed:false,notes:"Independent government document review"}).ok,false);
 }
});
