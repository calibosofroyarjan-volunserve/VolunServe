"use strict";
const crypto = require("node:crypto");
const {isFullStagingRuntime}=require("./stagingFirebaseIsolation");
const {getProfileRole,isApprovedAccount}=require("./adminAccess");

// In-person LGU review is a different workflow, not AI face matching.
// It accepts only two small JSON fields and never requests/receives any ID
// image, selfie, facial template or passport/ID number.
const MANUAL_CHANNEL="lgu_in_person_no_media";
const SUPPORTED_IDS=new Set([
  "national_id","drivers_license","passport","umid","prc_id",
]);
const MIN_REQUEST_INTERVAL_MS=10*60*1000;

function manualReviewInput(body){
  if(!body || Array.isArray(body) || typeof body!=="object" ||
     Object.keys(body).sort().join(",")!=="consent,idType") {
    return {error:"invalid_manual_review_fields"};
  }
  if(body.consent!==true) return {error:"manual_review_consent_required"};
  if(!SUPPORTED_IDS.has(body.idType)) return {error:"unsupported_government_id"};
  return {idType:body.idType};
}

function installManualIdentityReviewRoutes({
  app,db,auth,FieldValue,requireFirebaseUser,
  runtimeEnvironment=process.env,
}) {
  if(!app||!db||!auth||!FieldValue||!requireFirebaseUser)
    throw new Error("Missing protected manual identity route dependencies");

  app.post("/api/identity/manual-review-request",requireFirebaseUser,
    async(req,res)=>{
      res.set("Cache-Control","private, no-store, max-age=0");
      // Never make this privileged or a production shortcut even if this
      // staging source is accidentally copied into a live branch.
      if(!isFullStagingRuntime(runtimeEnvironment) ||
         auth.app?.options?.projectId!=="volunserve-full-staging") {
        return res.status(404).json({
          error:"manual_review_not_available",
          message:"Manual identity request is not available in this environment.",
        });
      }
      const validation=manualReviewInput(req.body);
      if(validation.error) return res.status(400).json({
        error:validation.error,
        message:"Select one of the five government IDs and consent to an in-person LGU review. Do not upload ID or selfie data.",
      });
      const uid=req.firebaseUser?.uid;
      if(typeof uid!=="string"|| !/^[A-Za-z0-9_-]{8,200}$/.test(uid))
        return res.status(401).json({error:"unauthenticated",
          message:"Sign in with a verified staging Resident account."});
      const userRef=db.collection("users").doc(uid);
      const verificationRef=db.collection("identityVerifications").doc(uid);
      const requestId="manual_"+crypto.randomUUID().replace(/-/g,"");
      try{
        const result=await db.runTransaction(async tx=>{
          const [userSnap,verificationSnap]=await Promise.all([
            tx.get(userRef),tx.get(verificationRef),
          ]);
          if(!userSnap.exists) return {code:404,error:"profile_not_found"};
          const profile=userSnap.data()||{};
          if(!["resident","volunteer"].includes(getProfileRole(profile)) ||
             profile.residentAccess!==true || !isApprovedAccount(profile)) {
            return {code:403,error:"resident_account_required"};
          }
          if(profile.identityVerified===true || profile.identityStatus==="verified")
            return {code:409,error:"identity_already_verified"};
          const previous=verificationSnap.exists?verificationSnap.data()||{}:{};
          if(previous.status==="pending"&&previous.requiresManualReview===true)
            return {code:409,error:"identity_review_already_pending"};
          if(previous.processingRequestId)
            return {code:409,error:"identity_ai_processing_in_progress"};

          const last=previous.lastManualRequestAt?.toMillis?.()||0;
          const now=Date.now();
          if(last && now-last<MIN_REQUEST_INTERVAL_MS &&
             previous.manualReviewDecision!=="retry_required")
            return {code:429,error:"manual_review_request_cooldown"};

          // Clear old AI/OCR cues: an in-person review without any media must
          // not inherit stale match scores or document screening from earlier.
          tx.set(verificationRef,{
            uid,
            verificationId:requestId,
            verificationMethod:"manual_lgu_in_person_no_media",
            manualReviewChannel:MANUAL_CHANNEL,
            manualIdType:validation.idType,
            manualRequestConsentAt:FieldValue.serverTimestamp(),
            lastManualRequestAt:FieldValue.serverTimestamp(),
            lastSubmissionAt:FieldValue.serverTimestamp(),
            createdAt:previous.createdAt||FieldValue.serverTimestamp(),
            updatedAt:FieldValue.serverTimestamp(),
            status:"pending",
            aiDecision:"manual_review",
            requiresManualReview:true,
            message:"In-person LGU document and face review requested. No ID/selfie images were collected or analyzed by AI.",
            matchScore:FieldValue.delete(),
            livenessScore:FieldValue.delete(),
            documentScreening:FieldValue.delete(),
            padStatus:"not_validated",
            padValidated:false,
            processingRequestId:FieldValue.delete(),
            processingStartedAt:FieldValue.delete(),
            manualReviewDecision:FieldValue.delete(),
            manualValidationMethod:FieldValue.delete(),
            manualReviewNotes:FieldValue.delete(),
            reviewedAt:FieldValue.delete(),
            reviewedBy:FieldValue.delete(),
            reviewedByName:FieldValue.delete(),
            decision:FieldValue.delete(),
          },{merge:true});
          tx.set(userRef,{
            identityStatus:"pending",
            identityVerified:false,
            identityVerificationMethod:"manual_lgu_in_person_no_media",
            identityFailureReason:FieldValue.delete(),
            updatedAt:FieldValue.serverTimestamp(),
          },{merge:true});
          return {code:201,ok:true,status:"pending",decision:"manual_review",
            verificationId:requestId,identityVerified:false,
            manualReviewChannel:MANUAL_CHANNEL,
            message:"Your request is pending an in-person LGU review. Bring the original government ID. No images were uploaded and no AI face match or liveness check was performed."};
        });
        const {code,...body}=result;
        return res.status(code).json(body);
      }catch(error){
        console.warn("Manual identity request failed: internal_failure");
        return res.status(500).json({error:"manual_review_request_failed",
          message:"Unable to request manual identity review. Please try again."});
      }
    });
}
module.exports={
  MANUAL_CHANNEL,SUPPORTED_IDS,MIN_REQUEST_INTERVAL_MS,
  manualReviewInput,installManualIdentityReviewRoutes,
};
