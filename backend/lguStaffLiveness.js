"use strict";
/**
 * AWS Rekognition Face Liveness session controller for LGU applicants.
 * Feature is deliberately OFF by default. No image bytes/scores returned,
 * logged or stored. A positive signal NEVER grants Admin access.
 */
const crypto=require("node:crypto");
const UID=/^[a-zA-Z0-9_-]{8,128}$/;
const MAX_ATTEMPTS=3;
const SESSION_MS=2*60*1000;
function secureUid(value){return typeof value==="string"&&UID.test(value)?value:"";}
function httpError(status,code){const e=new Error(code);e.status=status;e.code=code;throw e;}
function validSessionId(s){return typeof s==="string"&&/^[a-zA-Z0-9-]{20,100}$/.test(s);}
function noSecrets(e){return {ok:false,error:e.code||"liveness_temporarily_unavailable"};}
function sdkClient(region){
  const {RekognitionClient,CreateFaceLivenessSessionCommand,GetFaceLivenessSessionResultsCommand}=
    require("@aws-sdk/client-rekognition");
  const client=new RekognitionClient({region,maxAttempts:2});
  return {
    create:async token=>{
      const r=await client.send(new CreateFaceLivenessSessionCommand({ClientRequestToken:token}));
      return r.SessionId;
    },
    results:async sessionId=>{
      const r=await client.send(new GetFaceLivenessSessionResultsCommand({SessionId:sessionId}));
      return {status:r.Status,confidence:r.Confidence};
    },
  };
}
function mountLguStaffLiveness(app,{db,FieldValue,requireFirebaseUser,providerFactory=sdkClient,now=()=>Date.now()}){
  async function verifyApplicant(req){
    const uid=secureUid(req.firebaseUser?.uid);
    if(!uid)httpError(401,"unauthenticated");
    if(req.firebaseUser?.email_verified!==true)
      httpError(403,"verified_email_required");
    const [account,evidence,privacy,release]=await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("lguApplicantEvidence").doc(uid).get(),
      db.collection("lguApplicantPrivacyRequests").doc(uid).get(),
      db.collection("lguIdentityIntake").doc("release").get(),
    ]);
    const a=account.data()||{},e=evidence.data()||{};
    if(a.role!=="applicant"||a.status!=="pending_review"||
      !evidence.exists||e.uid!==uid||e.reviewStatus!=="pending_manual_review"||
      !["ph_national_id","ph_passport","ph_drivers_license"].includes(e.idType)||
      typeof e.consentVersion!=="string"||privacy.exists)
      httpError(403,"applicant_review_unavailable");
    if(!release.exists||release.data()?.enabled!==true)
      httpError(503,"biometric_intake_not_released");
    return uid;
  }
  const enabled=()=>process.env.LGU_STAFF_ACTIVE_LIVENESS_ENABLED==="true" &&
    /^[a-z]{2}-[a-z]+-\d$/.test(process.env.AWS_REKOGNITION_REGION||"");
  const client=()=>{
    if(!enabled())httpError(503,"active_liveness_not_configured");
    return providerFactory(process.env.AWS_REKOGNITION_REGION);
  };
  app.post("/api/lgu-staff/liveness/start",requireFirebaseUser,async(req,res)=>{
    let uid="",lease="";
    try{
      const sdk=client();uid=await verifyApplicant(req);
      lease=crypto.randomUUID();
      const ref=db.collection("lguApplicantLivenessSessions").doc(uid),t=now();
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref),s=snap.data()||{};
        if(s.state==="creating"&&s.expiresAtMs>t)
          httpError(409,"liveness_session_in_progress");
        if(s.state==="ready"&&s.expiresAtMs>t)
          httpError(409,"liveness_session_already_issued");
        if(s.state==="completed"&&s.signal==="live_presence_signal_present")
          httpError(409,"liveness_review_already_recorded");
        if((s.attempts||0)>=MAX_ATTEMPTS)httpError(429,"manual_review_required");
        tx.set(ref,{uid,attempts:(s.attempts||0)+1,state:"creating",lease,
          expiresAtMs:t+SESSION_MS,createdAt:FieldValue.serverTimestamp()},{merge:true});
      });
      let sessionId;
      try{sessionId=await sdk.create(lease);}catch{
        await db.runTransaction(async tx=>{
          const s=await tx.get(ref);if(s.data()?.lease===lease)
            tx.update(ref,{state:"unavailable",lease:FieldValue.delete(),sessionId:FieldValue.delete()});
        });
        httpError(503,"liveness_provider_unavailable");
      }
      if(!validSessionId(sessionId))httpError(502,"invalid_provider_session");
      // If applicant withdrew during AWS session creation, reject without
      // exposing the new session ID to the client.
      await verifyApplicant(req);
      await db.runTransaction(async tx=>{
        const s=await tx.get(ref);
        if(s.data()?.lease!==lease||s.data()?.expiresAtMs<=now())
          httpError(409,"liveness_session_expired");
        tx.update(ref,{state:"ready",sessionId,lease:FieldValue.delete()});
      });
      return res.json({ok:true,sessionId,region:process.env.AWS_REKOGNITION_REGION,
        expiresInSeconds:120,status:"camera_challenge_required"});
    }catch(e){return res.status(e.status||503).json(noSecrets(e));}
  });
  app.post("/api/lgu-staff/liveness/result",requireFirebaseUser,async(req,res)=>{
    try{
      const sdk=client(),uid=await verifyApplicant(req);
      const ref=db.collection("lguApplicantLivenessSessions").doc(uid);
      const snap=await ref.get(),s=snap.data()||{};
      if(s.state!=="ready"||!validSessionId(s.sessionId))
        httpError(409,"liveness_session_not_ready");
      if(s.expiresAtMs<=now())httpError(409,"liveness_session_expired");
      if(req.body?.sessionId!==s.sessionId)
        httpError(403,"liveness_session_mismatch");
      let result;
      try{result=await sdk.results(s.sessionId);}
      catch{httpError(503,"liveness_provider_unavailable");}
      if(result.status!=="SUCCEEDED"){
        if(result.status==="IN_PROGRESS"||result.status==="CREATED"){
          return res.json({ok:true,status:"checking_live_presence"});
        }
        if(!["FAILED","EXPIRED"].includes(result.status))
          httpError(502,"invalid_provider_result");
      }
      // Confidence stays server-side only. Absence/invalid scores never pass.
      const threshold=Number(process.env.LGU_STAFF_LIVENESS_MIN_CONFIDENCE);
      if(!Number.isFinite(threshold)||threshold<1||threshold>100)
        httpError(503,"liveness_threshold_not_approved");
      const signal=result.status==="SUCCEEDED" &&
        typeof result.confidence==="number"&&
        Number.isFinite(result.confidence)&&result.confidence>=threshold &&
        result.confidence<=100
          ?"live_presence_signal_present":"manual_review_required";
      await db.runTransaction(async tx=>{
        const current=await tx.get(ref),doc=current.data()||{};
        if(doc.state!=="ready"||doc.sessionId!==s.sessionId||
           doc.expiresAtMs<=now())httpError(409,"liveness_session_expired");
        tx.update(ref,{state:"completed",signal,
          sessionId:FieldValue.delete(),
          reviewedAt:FieldValue.serverTimestamp()});
      });
      return res.json({ok:true,status:signal==="live_presence_signal_present"
        ?"live_presence_checked":"manual_review_required",
        identityDecision:"manual_review_required",
        documentAuthenticityVerified:false,
        adminAccessGranted:false});
    }catch(e){return res.status(e.status||503).json(noSecrets(e));}
  });
}
module.exports={mountLguStaffLiveness,secureUid,validSessionId,MAX_ATTEMPTS};
