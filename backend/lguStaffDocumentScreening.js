"use strict";
/**
 * Internal LGU ID front/back OCR text-consistency triage. This is not government
 * issuer authentication, official identity matching, or an access grant.
 * Only a signed-in approved programmer Super Admin can run it.
 */
const crypto=require("crypto");
const {getStorage}=require("firebase-admin/storage");
const SUPPORTED=new Set(["ph_national_id","ph_drivers_license","ph_passport"]);
const MIME={jpg:"image/jpeg",png:"image/png",webp:"image/webp"};
function safeUid(value){
  const v=String(value||"");
  return /^[A-Za-z0-9_-]{8,128}$/.test(v)?v:"";
}
function docPath(uid,slot,value){
  if(!safeUid(uid)||!["front","back"].includes(slot))return null;
  const match=new RegExp("^lguStaffEvidence/"+uid+"/"+slot+"\\.(jpg|png|webp)$").exec(String(value||""));
  return match?{path:value,mime:MIME[match[1]]}:null;
}
function mediaMime(b){
  if(!Buffer.isBuffer(b)||b.length<16)return "";
  if(b[0]===255&&b[1]===216&&b[2]===255)return "image/jpeg";
  if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WEBP")return "image/webp";
  return "";
}
function fail(status,code,message){
  const error=new Error(message);error.httpStatus=status;error.publicCode=code;throw error;
}
const SIGNALS=new Set([
  "declared_type_text_consistent","declared_type_text_mismatch",
  "document_type_inconclusive","unsupported_document_suspected",
  "ocr_unavailable_or_unreadable","unexpected_passport_back",
  "missing_document_back","unsupported_declared_type"
]);
function mountLguStaffDocumentScreening(app,{db,adminApp,FieldValue,requireFirebaseUser}){
  app.post("/api/lgu-staff/document-screen",requireFirebaseUser,async(req,res)=>{
    let uid="",leaseId="",locked=false;
    const reviewerUid=String(req.firebaseUser?.uid||"");
    try{
      uid=safeUid(req.body?.applicantUid);
      if(!uid)fail(400,"invalid_applicant","Select a valid LGU staff applicant.");
      if(uid===reviewerUid)fail(403,"self_review_denied","You cannot screen your own application.");
      const reviewer=(await db.collection("users").doc(reviewerUid).get()).data()||{};
      if(reviewer.role!=="superadmin"||reviewer.status!=="approved")
        fail(403,"superadmin_only","Only the approved programmer Super Admin may run document screening.");
      const applicant=(await db.collection("users").doc(uid).get()).data()||{};
      if(applicant.role!=="applicant"||applicant.status!=="pending_review")
        fail(409,"not_pending","Applicant is no longer pending review.");
      const docSnap=await db.collection("lguApplicantEvidence").doc(uid).get();
      const evidence=docSnap.data()||{};
      if(!docSnap.exists||!SUPPORTED.has(evidence.idType)||
        evidence.reviewStatus!=="pending_manual_review"||
        evidence.officialOfficeStatus!=="unconfirmed")
        fail(409,"evidence_incomplete","No valid private LGU applicant submission is available.");
      const front=docPath(uid,"front",evidence.front);
      const back=evidence.idType==="ph_passport"?null:docPath(uid,"back",evidence.back);
      if(!front||(evidence.idType!=="ph_passport"&&!back)||
        (evidence.idType==="ph_passport"&&evidence.back!==""))
        fail(409,"invalid_document_paths","Required private ID front/back evidence paths are invalid.");
      const aiBase=String(process.env.IDENTITY_AI_SERVICE_URL||"").trim().replace(/\/+$/,"");
      const secret=String(process.env.IDENTITY_AI_INTERNAL_KEY||"").trim();
      const bucketName=String(process.env.LGU_STAFF_STORAGE_BUCKET||process.env.FIREBASE_STORAGE_BUCKET||"").trim();
      if(!aiBase||!secret||!bucketName)
        fail(503,"ocr_not_configured","Private ID OCR service or evidence bucket is not configured.");
      if(!aiBase.startsWith("https://")&&
        !(process.env.NODE_ENV!=="production"&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(aiBase)))
        fail(503,"unsafe_ai_transport","Internal OCR requires secure transport.");
      const bucket=getStorage(adminApp).bucket(bucketName);
      const selected=[front,...(back?[back]:[])];
      const media=await Promise.all(selected.map(async(item)=>{
        const file=bucket.file(item.path);
        const [meta]=await file.getMetadata();
        const size=Number(meta.size);
        if(!Number.isFinite(size)||size<1024||size>4194304||
          meta.contentType!==item.mime||
          meta.metadata?.purpose!=="lgu_staff_manual_review" ||
          meta.metadata?.idType!==evidence.idType)
          fail(409,"document_integrity_failed","Private document failed integrity validation.");
        const [bytes]=await file.download();
        if(bytes.length!==size||mediaMime(bytes)!==item.mime)
          fail(409,"document_image_invalid","ID image format did not match its private metadata.");
        return {bytes,mime:item.mime};
      }));
      const record=db.collection("lguApplicantDocumentScreenings").doc(uid);
      leaseId=crypto.randomUUID();
      await db.runTransaction(async tx=>{
        const snap=await tx.get(record);
        const prior=snap.data()||{};
        const attempts=Math.max(0,Number(prior.attemptCount)||0);
        if(attempts>=3)fail(429,"ocr_attempt_limit","OCR screening attempt limit reached. Human review required.");
        if(prior.status==="processing"&&Date.now()-Number(prior.leaseAtMs||0)<180000)
          fail(409,"ocr_in_progress","Another document screening is in progress.");
        tx.set(record,{
          uid,attemptCount:attempts+1,status:"processing",reviewerUid,
          leaseId,leaseAtMs:Date.now(),
          decision:"manual_review_required",documentAuthenticityVerified:false,
          lastAttemptAt:FieldValue.serverTimestamp(),
        },{merge:true});
      });
      locked=true;
      const form=new FormData();
      form.set("idType",evidence.idType);
      form.set("frontDocument",new Blob([media[0].bytes],{type:media[0].mime}),"front.jpg");
      if(back)form.set("backDocument",new Blob([media[1].bytes],{type:media[1].mime}),"back.jpg");
      const base=aiBase.endsWith("/verify")?aiBase.slice(0,-7):aiBase;
      const response=await fetch(base+"/lgu-id-ocr",{
        method:"POST",
        headers:{"X-VolunServe-Internal-Key":secret,"X-VolunServe-User-Id":uid},
        body:form,signal:AbortSignal.timeout(55000),
      });
      const raw=await response.json().catch(()=>({}));
      if(!response.ok)fail(502,"ocr_service_failed","Private government ID OCR is unavailable; use manual review.");
      const signal=SIGNALS.has(raw.documentTypeSignal)?
        raw.documentTypeSignal:"document_type_inconclusive";
      await record.set({
        uid,status:"manual_review_required",reviewerUid,
        documentTypeSignal:signal,ocrEngineAvailable:raw.ocrEngineAvailable===true,
        decision:"manual_review_required",documentAuthenticityVerified:false,
        issuerVerificationImplemented:false,
        screenedAt:FieldValue.serverTimestamp(),
        leaseId:FieldValue.delete(),leaseAtMs:FieldValue.delete(),
      },{merge:true});
      return res.json({
        ok:true,documentTypeSignal:signal,
        ocrEngineAvailable:raw.ocrEngineAvailable===true,
        decision:"manual_review_required",documentAuthenticityVerified:false,
        issuerVerificationImplemented:false,
        message:"OCR checks document type only; actual government ID validity, applicant identity and LGU appointment still require independent human confirmation.",
      });
    }catch(e){
      if(locked&&uid)try{
        const record=db.collection("lguApplicantDocumentScreenings").doc(uid);
        await db.runTransaction(async tx=>{
          const snap=await tx.get(record);
          if(snap.data()?.leaseId===leaseId)tx.update(record,{
            status:"manual_review_required",decision:"manual_review_required",
            documentAuthenticityVerified:false,errorCode:"ocr_unavailable",
            leaseId:FieldValue.delete(),leaseAtMs:FieldValue.delete(),
          });
        });
      }catch{/* No PII in logs */}
      return res.status(e.httpStatus||503).json({
        ok:false,error:e.publicCode||"ocr_unavailable",
        message:e.httpStatus?e.message:"OCR screening could not complete; manual review required.",
        decision:"manual_review_required",
      });
    }
  });
}
module.exports={mountLguStaffDocumentScreening,safeUid,docPath,mediaMime};