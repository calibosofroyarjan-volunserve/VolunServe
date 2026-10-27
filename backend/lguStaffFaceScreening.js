"use strict";
/**
 * Optional private AI-assisted LGU staff portrait-to-selfie comparison.
 * This is NOT identity approval, liveness, OCR or document authenticity.
 * Only authorized programmer Super Admin may initiate an assessment.
 */
const crypto = require("crypto");
const { getStorage } = require("firebase-admin/storage");
const ALLOWED = Object.freeze({
  ph_national_id:"national_id",
  ph_drivers_license:"drivers_license",
  ph_passport:"passport",
});
const TYPES = Object.freeze({jpg:"image/jpeg",png:"image/png",webp:"image/webp"});
function safeUid(value) {
  const v=String(value||"");
  return /^[A-Za-z0-9_-]{8,128}$/.test(v)?v:"";
}
function evidenceFile(uid,slot,value) {
  if(!safeUid(uid)||!["front","selfie"].includes(slot))return null;
  const pattern=new RegExp("^lguStaffEvidence/"+uid+"/"+slot+"\\.(jpg|png|webp)$");
  const hit=pattern.exec(String(value||""));
  return hit?{path:value,mime:TYPES[hit[1]]}:null;
}
function mediaMime(bytes) {
  if(!Buffer.isBuffer(bytes)||bytes.length<16)return "";
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP")return "image/webp";
  return "";
}
/**
 * The existing Python engine returns decision="manual_review" and status="pending"
 * even for above-threshold similarity. It never returns identity "verified".
 * Only surface an *informational* face-geometry signal if the actual returned
 * score meets the engine-provided threshold and inputs are well-formed.
 */
function similaritySignal(decision,score,threshold,status) {
  const valid = decision==="manual_review" && status==="pending"
    && typeof score==="number" && Number.isFinite(score)
    && typeof threshold==="number" && Number.isFinite(threshold)
    && score>=0 && score<=1 && threshold>0 && threshold<=1;
  return valid && score>=threshold
    ?"similarity_signal_present":"inconclusive_manual_review";
}
/**
 * The trusted Python service MUST return its actual informational FaceMesh
 * contract, including the selected ID type and both quality checks. A
 * malformed, stale or mismatched response is NEVER a positive match.
 * This is not an authenticity or liveness check.
 */
function hasExpectedPythonContract(raw,expectedIdType) {
  return !!raw && typeof raw==="object" &&
    raw.ok===true &&
    raw.status==="pending" &&
    raw.decision==="manual_review" &&
    raw.engine==="mediapipe-landmark-1to1-v1" &&
    raw.idType===expectedIdType &&
    raw.livenessImplemented===false &&
    [raw.idImageQualityScore,raw.selfieQualityScore].every(
      value=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=1
    );
}
function fail(status,code,message) {
  const e=new Error(message);e.httpStatus=status;e.publicCode=code;throw e;
}
function mountLguStaffFaceScreening(app,{db,adminApp,FieldValue,requireFirebaseUser}) {
  app.post("/api/lgu-staff/face-screen",requireFirebaseUser,async(req,res)=>{
    let uid="",leaseId="",locked=false;
    const reviewerUid=String(req.firebaseUser?.uid||"");
    try {
      uid=safeUid(req.body?.applicantUid);
      if(!uid)fail(400,"invalid_applicant","Select a valid staff applicant.");
      if(uid===reviewerUid)fail(403,"reviewer_must_be_distinct","The applicant cannot review their own identity.");
      const reviewer=(await db.collection("users").doc(reviewerUid).get()).data()||{};
      if(reviewer.role!=="superadmin"||reviewer.status!=="approved")
        fail(403,"superadmin_only","Only the active programmer Super Admin may request face comparison.");
      const applicant=(await db.collection("users").doc(uid).get()).data()||{};
      if(applicant.role!=="applicant"||applicant.status!=="pending_review")
        fail(409,"not_pending","The selected account is not a pending LGU applicant.");
      const docSnap=await db.collection("lguApplicantEvidence").doc(uid).get();
      const evidence=docSnap.data()||{};
      if(!docSnap.exists||!Object.hasOwn(ALLOWED,evidence.idType)||
        evidence.reviewStatus!=="pending_manual_review"||
        evidence.aiStatus!=="not_run"||evidence.officialOfficeStatus!=="unconfirmed")
        fail(409,"evidence_incomplete","Required restricted applicant evidence is not ready.");
      const front=evidenceFile(uid,"front",evidence.front);
      const selfie=evidenceFile(uid,"selfie",evidence.selfie);
      if(!front||!selfie)fail(409,"invalid_media_paths","Protected ID and selfie media paths are invalid.");
      const bucketName=String(process.env.LGU_STAFF_STORAGE_BUCKET||process.env.FIREBASE_STORAGE_BUCKET||"").trim();
      const aiBase=String(process.env.IDENTITY_AI_SERVICE_URL||"").trim().replace(/\/+$/,"");
      const key=String(process.env.IDENTITY_AI_INTERNAL_KEY||"").trim();
      if(!bucketName||!aiBase||!key)
        fail(503,"screening_unavailable","Private Storage and AI service must be configured for screening.");
      if(!aiBase.startsWith("https://")&&
        !(process.env.NODE_ENV!=="production"&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(aiBase)))
        fail(503,"insecure_ai_transport","A secure internal AI endpoint is required.");
      const bucket=getStorage(adminApp).bucket(bucketName);
      const media=await Promise.all([front,selfie].map(async(item)=>{
        const f=bucket.file(item.path);
        const [metadata]=await f.getMetadata();
        const size=Number(metadata.size);
        if(!Number.isFinite(size)||size<1024||size>4194304||
          metadata.contentType!==item.mime||
          metadata.metadata?.purpose!=="lgu_staff_manual_review" ||
          metadata.metadata?.idType!==evidence.idType)
          fail(409,"media_integrity_failed","Private applicant media failed the integrity check.");
        const [bytes]=await f.download();
        if(bytes.length!==size||mediaMime(bytes)!==item.mime)
          fail(409,"invalid_media_bytes","The private applicant image type is invalid.");
        return {bytes,mime:item.mime};
      }));
      const screenRef=db.collection("lguApplicantFaceScreenings").doc(uid);
      leaseId=crypto.randomUUID();
      await db.runTransaction(async tx=>{
        const snap=await tx.get(screenRef);
        const prev=snap.data()||{};
        const tries=Math.max(0,Number(prev.attemptCount)||0);
        if(tries>=3)fail(429,"attempt_limit","Screening attempt limit reached. Manual review required.");
        if(prev.status==="processing"&&Date.now()-Number(prev.leaseAtMs||0)<180000)
          fail(409,"already_processing","Another private face screen is in progress.");
        tx.set(screenRef,{
          uid,attemptCount:tries+1,status:"processing",reviewerUid,
          leaseId,leaseAtMs:Date.now(),
          identityDecision:"manual_review_required",
          livenessImplemented:false,documentAuthenticityVerified:false,
          lastAttemptAt:FieldValue.serverTimestamp(),
        },{merge:true});
      });
      locked=true;
      const form=new FormData();
      form.set("idType",ALLOWED[evidence.idType]);
      form.set("idDocument",new Blob([media[0].bytes],{type:media[0].mime}),"front.jpg");
      form.set("selfie",new Blob([media[1].bytes],{type:media[1].mime}),"selfie.jpg");
      const endpoint=aiBase.endsWith("/verify")?aiBase:aiBase+"/verify";
      const response=await fetch(endpoint,{
        method:"POST",
        headers:{"X-VolunServe-Internal-Key":key,"X-VolunServe-User-Id":uid},
        body:form,signal:AbortSignal.timeout(55000),
      });
      const raw=await response.json().catch(()=>({}));
      if(!response.ok)fail(502,"ai_engine_error","AI face comparison failed. Use manual review.");
      const score=typeof raw.matchScore==="number"&&Number.isFinite(raw.matchScore)&&
        raw.matchScore>=0&&raw.matchScore<=1?raw.matchScore:null;
      const threshold=typeof raw.matchThreshold==="number" &&
        Number.isFinite(raw.matchThreshold) && raw.matchThreshold>0 &&
        raw.matchThreshold<=1 ? raw.matchThreshold:null;
      // A numeric score without an intact Python engine contract is not a
      // trusted match. Fail closed to manual review, never self-approve.
      const signal=hasExpectedPythonContract(raw,ALLOWED[evidence.idType])
        ? similaritySignal(raw.decision,score,threshold,raw.status)
        : "inconclusive_manual_review";
      await screenRef.set({
        uid,status:"manual_review_required",reviewerUid,
        faceSimilaritySignal:signal,faceSimilarityScore:score,
        engine:"existing_landmark_similarity_v1",
        livenessImplemented:false,documentAuthenticityVerified:false,
        identityDecision:"manual_review_required",
        screenedAt:FieldValue.serverTimestamp(),
        leaseId:FieldValue.delete(),leaseAtMs:FieldValue.delete(),
      },{merge:true});
      return res.json({
        ok:true,faceSimilaritySignal:signal,
        livenessImplemented:false,documentAuthenticityVerified:false,
        identityDecision:"manual_review_required",
        message:"Informational face similarity only. ID authenticity, active liveness and official LGU employment are NOT verified.",
      });
    } catch(e) {
      if(locked&&uid){
        try{
          const ref=db.collection("lguApplicantFaceScreenings").doc(uid);
          await db.runTransaction(async tx=>{
            const snap=await tx.get(ref);
            if(snap.data()?.leaseId===leaseId)tx.update(ref,{
              status:"manual_review_required",identityDecision:"manual_review_required",
              livenessImplemented:false,documentAuthenticityVerified:false,
              errorCode:"screening_unavailable",
              leaseId:FieldValue.delete(),leaseAtMs:FieldValue.delete(),
            });
          });
        }catch{ /* no private evidence in logs */ }
      }
      return res.status(e.httpStatus||503).json({
        ok:false,error:e.publicCode||"screening_unavailable",
        message:e.httpStatus?e.message:"Face screening was not completed; manual review is still required.",
        identityDecision:"manual_review_required",
      });
    }
  });
}
module.exports={mountLguStaffFaceScreening,safeUid,evidenceFile,mediaMime,similaritySignal,hasExpectedPythonContract};