#!/usr/bin/env node
"use strict";
// Synthetic, emulator-only regression coverage for shared Assistance Review
// create/update gates. No production credentials and no production data.
const fs=require("node:fs");
const path=require("node:path");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const firebase=require("firebase/compat/app");
require("firebase/compat/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error("Run using Firestore emulator only");
const projectId="demo-volunserve-review-gates";
const adminId="review-admin";
const residentId="review-resident";
const requestId="review-emulator-01";
const stamp=()=>firebase.firestore.Timestamp.now();
async function main(){
 const env=await initializeTestEnvironment({
   projectId,firestore:{rules:fs.readFileSync(path.join(__dirname,"../firestore.rules"),"utf8")}
 });
 try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
   await ctx.firestore().doc("users/"+adminId).set({
    role:"admin",status:"approved",adminStatus:"active",email:adminId+"@gmail.com"
   });
   await ctx.firestore().doc("users/"+residentId).set({
    role:"resident",status:"approved",activeMode:"resident",residentAccess:true,
    email:residentId+"@gmail.com"
   });
   await ctx.firestore().doc("assistanceRequests/"+requestId).set({
     requestId,requesterUid:residentId,category:"disaster_recovery",estimatedAmount:0
   });
  });
  const admin=env.authenticatedContext(adminId,{email:adminId+"@gmail.com",email_verified:true}).firestore();
  const resident=env.authenticatedContext(residentId,{email:residentId+"@gmail.com",email_verified:true}).firestore();
  const pending={
   requestId,requesterUid:residentId,category:"disaster_recovery",
   reviewStatus:"in_progress",documentConsistencyStatus:"pending",documentConsistencyNotes:"",
   duplicateCheckStatus:"pending",duplicateRequestIds:[],duplicateCheckNotes:"",
   beneficiaryCheckStatus:"pending",beneficiaryCheckNotes:"",
   facilityVerificationRequired:false,facilityVerificationStatus:"not_required",
   facilityName:"",facilityType:"",facilityDepartment:"",professionalName:"",
   facilityReferenceNumber:"",facilityVerificationMethod:"not_applicable",facilityVerifiedWith:"",
   facilityVerifiedAt:null,facilityNotes:"",
   costVerificationRequired:false,residentEstimatedAmount:0,verifiedGrossCost:0,
   confirmedExistingAssistanceAmount:0,verifiedUncoveredAmount:0,
   costVerificationStatus:"not_required",costReferenceNumber:"",costNotes:"",
   residencyVerificationStatus:"pending",residencyVerificationMethod:"not_applicable",
   privateAddressSnapshot:"",privateLatitude:null,privateLongitude:null,
   locationVerifiedAt:null,locationVerifiedBy:"",residencyNotes:"",
   videoVerificationRequired:false,videoVerificationStatus:"not_required",
   videoVerificationAt:null,videoVerificationNotes:"",
   siteVisitRequired:false,siteVisitStatus:"not_required",siteVisitAt:null,
   siteVisitBy:"",siteVisitNotes:"",
   riskFlags:[],internalNotes:"",finalDecision:"pending",finalDecisionReason:"",
   finalDecisionAt:null,finalDecisionBy:"",createdAt:stamp(),createdBy:adminId,
   updatedAt:stamp(),updatedBy:adminId
  };
  const ref=admin.doc("assistanceVerificationReviews/"+requestId);
  await assertFails(resident.doc("assistanceVerificationReviews/"+requestId).set(pending));
  await assertSucceeds(ref.set(pending));
  console.log("PASS: approved Admin can create pending Assistance Review; Resident blocked");
  await assertSucceeds(ref.update({
   documentConsistencyNotes:"Reviewed preliminary documents",
   updatedAt:stamp(),updatedBy:adminId
  }));
  console.log("PASS: approved Admin can update pending review without changing identity");
  await assertFails(ref.update({requesterUid:"someone-else",updatedAt:stamp(),updatedBy:adminId}));
  await assertFails(ref.update({finalDecision:"verified",reviewStatus:"verified",
    finalDecisionAt:stamp(),finalDecisionBy:adminId,updatedAt:stamp(),updatedBy:adminId}));
  console.log("PASS: immutable owner and unverified approval remain blocked");
 }finally{await env.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
