"use strict";
// VolunServe staging: explicit manual reviewer attestation for independent ID review.
// This does NOT validate a signature or provide an issuer API connection.
const METHODS=Object.freeze({
 national_id:new Set(["psa_national_id_qr_check"]),
 drivers_license:new Set(["in_person_lgu_validation","official_document_check"]),
 passport:new Set(["in_person_lgu_validation","official_document_check"]),
 umid:new Set(["in_person_lgu_validation","official_document_check"]),
 prc_id:new Set(["in_person_lgu_validation","official_document_check"]),
});
function reviewIssuerEvidence({declaredType,validationMethod,confirmed,notes}={}){
 const methods=METHODS[declaredType];
 if(!methods)return {ok:false,message:"Unsupported ID type. Please require a new scan."};
 if(!methods.has(validationMethod)){
  return {ok:false,message:declaredType==="national_id"
   ?"For National ID, select the PSA National ID Check method after independently checking the QR result."
   :"Select a permitted independent document review method for this government ID."};
 }
 if(confirmed!==true)return {ok:false,message:"Confirm you independently completed the selected official or in-person document check."};
 const text=String(notes||"").trim();
 if(text.length<10)return {ok:false,message:"Add at least 10 characters describing the independent check, without recording ID numbers or other sensitive details."};
 if(text.length>1000)return {ok:false,message:"Review notes are too long."};
 return {ok:true,issuerAuthenticityAutomaticallyVerified:false,independentAdminCheckAttested:true};
}
module.exports={reviewIssuerEvidence};
