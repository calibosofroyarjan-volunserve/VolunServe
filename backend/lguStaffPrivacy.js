"use strict";
/**
 * Restricted LGU applicant withdrawal and private evidence erasure.
 * No scheduled deletes or active production purge are enabled by default.
 * This removes identity evidence ONLY, not the applicant's Auth/profile.
 */
const {getStorage}=require("firebase-admin/storage");
const crypto=require("node:crypto");
const UID=/^[A-Za-z0-9_-]{8,128}$/;
const ALLOWED_FILE=/^(front|back|selfie|lgu_proof)\.(jpg|png|webp)$/;
const MAX_FILES=12;
function safeUid(value){const s=typeof value==="string"?value:"";return UID.test(s)?s:"";}
function fail(code,message,status){const e=new Error(message);e.code=code;e.status=status;throw e;}
function safeResult(error){return {ok:false,error:error.code||"privacy_operation_unavailable",
  message:error.status?error.message:"Private evidence operation could not be completed."};}
function mountLguStaffPrivacy(app,{db,adminApp,FieldValue,requireFirebaseUser}){
  app.post("/api/lgu-staff/privacy/request-withdrawal",requireFirebaseUser,async(req,res)=>{
    const uid=safeUid(req.firebaseUser?.uid);
    if(!uid)return res.status(401).json({ok:false,error:"unauthenticated"});
    try{
      const result=await db.runTransaction(async tx=>{
        const userRef=db.collection("users").doc(uid);
        const requestRef=db.collection("lguApplicantPrivacyRequests").doc(uid);
        const [userSnap,requestSnap]=await Promise.all([tx.get(userRef),tx.get(requestRef)]);
        const user=userSnap.data()||{};
        if(user.role!=="applicant"||!["pending_review","rejected"].includes(user.status))
          fail("not_applicant","Only an unapproved LGU applicant may withdraw their application.",403);
        if(requestSnap.exists)return {status:"requested"};
        tx.update(userRef,{status:"rejected"}); // Immediately blocks Storage creation and Admin promotion.
        tx.create(requestRef,{uid,status:"requested",reason:"applicant_withdrawal",
          requestedAt:FieldValue.serverTimestamp()});
        return {status:"requested"};
      });
      return res.json({ok:true,...result,message:
        "LGU application withdrawn. Private evidence removal has been requested; the account profile is not deleted."});
    }catch(e){return res.status(e.status||503).json(safeResult(e));}
  });

  app.post("/api/lgu-staff/privacy/purge-evidence",requireFirebaseUser,async(req,res)=>{
    const actor=safeUid(req.firebaseUser?.uid);
    const uid=safeUid(req.body?.applicantUid);
    try{
      if(!actor||!uid)fail("invalid_request","An authenticated reviewer and target applicant are required.",400);
      if(actor===uid)fail("self_review_denied","Reviewers cannot approve their own erasure.",403);
      if(req.body?.confirmation!=="PURGE_LGU_EVIDENCE")
        fail("confirmation_required","Explicit evidence erasure confirmation is required.",400);
      const reviewer=(await db.collection("users").doc(actor).get()).data()||{};
      if(reviewer.role!=="superadmin"||reviewer.status!=="approved")
        fail("superadmin_only","Only approved programmer Super Admin can purge evidence.",403);
      // Always default deny; no production erasure without separate operational signoff.
      if(process.env.LGU_STAFF_EVIDENCE_PURGE_ENABLED!=="true")
        fail("purge_disabled","Private evidence erasure is disabled pending security release approval.",503);
      const bucketName=String(process.env.LGU_STAFF_STORAGE_BUCKET||
        process.env.FIREBASE_STORAGE_BUCKET||"").trim();
      if(!bucketName)fail("bucket_unconfigured","Private evidence bucket is not configured.",503);
      const requestRef=db.collection("lguApplicantPrivacyRequests").doc(uid);
      const userRef=db.collection("users").doc(uid);
      const leaseId=crypto.randomUUID();
      await db.runTransaction(async tx=>{
        const [userSnap,requestSnap]=await Promise.all([tx.get(userRef),tx.get(requestRef)]);
        const u=userSnap.data()||{};
        const p=requestSnap.data()||{};
        if(u.role!=="applicant"||u.status!=="rejected"||
           !requestSnap.exists||p.uid!==uid||
           !["requested","purge_failed"].includes(p.status))
          fail("not_eligible","Applicant withdrawal and rejection must precede evidence erasure.",409);
        tx.update(requestRef,{
          status:"purging",leaseId,startedAt:FieldValue.serverTimestamp(),
          executorUid:actor,
        });
      });
      try{
        const bucket=getStorage(adminApp).bucket(bucketName);
        const prefix="lguStaffEvidence/"+uid+"/";
        const [files]=await bucket.getFiles({prefix,maxResults:MAX_FILES+1});
        // Fail closed if files are unrecognized or listing is incomplete.
        if(files.length>MAX_FILES||files.some(f=>
          !f.name.startsWith(prefix)||!ALLOWED_FILE.test(f.name.slice(prefix.length))))
          fail("unexpected_evidence_files","Protected evidence inventory requires manual reconciliation.",409);
        // Do not delete metadata until every actual Storage deletion succeeds.
        for(const file of files){
          await file.delete({ignoreNotFound:true});
        }
        const evidenceRef=db.collection("lguApplicantEvidence").doc(uid);
        const faceRef=db.collection("lguApplicantFaceScreenings").doc(uid);
        const ocrRef=db.collection("lguApplicantDocumentScreenings").doc(uid);
        const auditRef=db.collection("lguApplicantPrivacyAudits").doc();
        const batch=db.batch();
        batch.delete(evidenceRef);batch.delete(faceRef);batch.delete(ocrRef);
        batch.update(requestRef,{
          status:"completed",leaseId:FieldValue.delete(),
          completedAt:FieldValue.serverTimestamp(),
          purgedFileCount:files.length,
        });
        batch.create(auditRef,{action:"lgu_applicant_evidence_purged",
          targetUid:uid,reviewerUid:actor,objectCount:files.length,
          happenedAt:FieldValue.serverTimestamp()});
        await batch.commit();
        return res.json({ok:true,status:"completed",deletedObjects:files.length,
          message:"Restricted evidence removed; applicant Auth/profile remains for separate retention review."});
      }catch(error){
        try{
          await db.runTransaction(async tx=>{
            const snap=await tx.get(requestRef);
            if(snap.data()?.leaseId===leaseId){
              tx.update(requestRef,{status:"purge_failed",
                leaseId:FieldValue.delete(),
                retryRequired:true,
                lastAttemptAt:FieldValue.serverTimestamp()});
            }
          });
        }catch{/* Do not log applicant data. */}
        throw error;
      }
    }catch(e){return res.status(e.status||503).json(safeResult(e));}
  });
}
module.exports={mountLguStaffPrivacy,safeUid,MAX_FILES};
