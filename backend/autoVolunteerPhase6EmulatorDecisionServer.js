"use strict";
/**
 * PHASE 6 LOCAL FIRESTORE EMULATOR-ONLY WRITE CANDIDATE.
 * NEVER imported by running backend/server.js; NOT a production API.
 * Future production adapter requires separately approved, secured rewrite.
 *
 * A trusted Firebase login middleware supplies ONLY request.firebaseUser.uid.
 * No Volunteer UID from route parameters, request body, or query is trusted.
 * Real Firestore transaction ensures case winner and responder lock are
 * selected atomically, with idempotent notifications and admin audit.
 */
const {FieldValue}=require("firebase-admin/firestore");
const {proposeAutoVolunteerDecision,ASSIGNMENT_MODE}
  =require("./autoVolunteerAtomicDecisionPolicy");
const PROJECT="demo-volunserve-auto-phase4";
const HOST="127.0.0.1:8080";
const INACTIVE=new Set(["declined","cancelled","completed"]);
const validId=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
function emulatorReady(env=process.env){
  // A fabricated injected options object must never unlock real Firestore.
  // Both runtime and caller must be the same actual demo-process environment.
  return env===process.env &&
    process.env.FIRESTORE_EMULATOR_HOST===HOST &&
    env.GCLOUD_PROJECT===PROJECT &&
    (!env.GOOGLE_CLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT===PROJECT) &&
    !env.FIREBASE_SERVICE_ACCOUNT_JSON &&
    env.VOLUNSERVE_AUTO_VOLUNTEER_PHASE6_EMULATOR_WRITE==="enabled" &&
    env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH!=="enabled";
}
const blocked=(reason)=>({status:"blocked",reason,emulatorOnly:true});
function blockIfNotIsolated(env){
  if(!emulatorReady(env))return blocked("isolated_emulator_write_disabled");
  return null;
}
function checkOtherAssignments(snap,thisId){
  // Cap 201 allows detection of >200; NEVER silently truncate the scan.
  if(!snap||!Array.isArray(snap.docs)||
     !Number.isInteger(snap.size)||snap.size!==snap.docs.length||
     snap.docs.length>200)return false;
  return !snap.docs.some(x=>x.id!==thisId &&
    !INACTIVE.has(String(x.data()?.status||"").toLowerCase()));
}
async function decideEmulatedAutomaticOffer({
  db,env=process.env,authenticatedUid,caseId,decision,now=Date.now()
}={}){
  const refusal=blockIfNotIsolated(env);
  if(refusal)return refusal;
  if(!db||typeof db.runTransaction!=="function")return blocked("database_missing");
  if(!validId(authenticatedUid)||!validId(caseId)||
     !["accepted","declined"].includes(decision))
    return blocked("invalid_decision_request");
  const uid=authenticatedUid,aid=caseId+"_"+uid;
  if(!validId(aid))return blocked("assignment_id_too_long");
  const cRef=db.collection("disasterCases").doc(caseId);
  const aRef=db.collection("responseAssignments").doc(aid);
  const uRef=db.collection("users").doc(uid);
  const appRef=db.collection("volunteerApplications").doc(uid);
  const rRef=db.collection("autoVolunteerReservations").doc(uid);
  const lockRef=db.collection("responderLocks").doc(uid);
  const auditRef=db.collection("adminActivityLogs")
    .doc("automatic_phase6_decision_"+aid);
  const residentNoticeRef=db.collection("notifications")
    .doc("automatic_phase6_resident_"+aid);

  return db.runTransaction(async tx=>{
    // ALL transaction reads must happen before ANY writes.
    const [c,a,u,application,reservation,lock,busy]=await Promise.all([
      tx.get(cRef),tx.get(aRef),tx.get(uRef),tx.get(appRef),
      tx.get(rRef),tx.get(lockRef),
      tx.get(db.collection("responseAssignments")
        .where("volunteerId","==",uid).limit(201))
    ]);
    if(!c.exists||!a.exists||!u.exists||!application.exists)
      return blocked("canonical_record_missing");
    const policy=proposeAutoVolunteerDecision({
      env:{VOLUNSERVE_AUTO_VOLUNTEER_DECISION_REVIEW:"enabled",
        VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled"},
      caseData:{...c.data(),id:caseId},
      assignment:{...a.data(),id:aid},
      volunteer:{...u.data(),uid},
      application:application.data(),
      reservation:reservation.exists?reservation.data():null,
      lock:lock.exists?lock.data():null,
      decision,now,
      verifiedNoOtherActiveAssignments:checkOtherAssignments(busy,aid)
    });
    if(policy.status==="already_accepted"||policy.status==="already_declined")
      return {status:policy.status,emulatorOnly:true,changed:false};
    if(policy.status!=="proposed_only")
      return blocked(policy.reason||"decision_not_allowed");

    // Case + offer + responder lock changes form a single atomic commit.
    // No notifications or audit on repeated accepted/declined requests.
    const stamp=FieldValue.serverTimestamp();
    tx.update(aRef,{status:decision,updatedAt:stamp});
    if(decision==="accepted"){
      tx.update(cRef,{
        autoVolunteerAcceptedAssignmentId:aid,
        activeVolunteerSupportAssignmentId:aid,
        activeVolunteerSupportUid:uid,
        updatedAt:stamp
      });
      tx.create(lockRef,{
        responderUid:uid,caseId,assignmentId:aid,
        status:"accepted",updatedAt:stamp
      });
      const reporterUid=c.data()?.reporterUid;
      // Phase 6 test-only, stable doc IDs prevent duplicate notifications.
      // No private reporter data returned to Volunteer request.
      tx.create(residentNoticeRef,{
        userId:reporterUid,caseId,assignmentId:aid,
        type:"resident_response_update",status:"accepted",
        title:"Volunteer accepted emergency response",
        message:"An assigned Volunteer accepted the emergency.",
        read:false,createdAt:stamp
      });
    }else{
      tx.delete(rRef);
    }
    tx.create(auditRef,{
      action:decision==="accepted"?
        "Automatic Volunteer Accepted (emulator)":
        "Automatic Volunteer Declined (emulator)",
      caseId,volunteerUid:uid,assignmentId:aid,
      timestamp:stamp
    });
    return {status:"committed_"+decision,emulatorOnly:true,changed:true};
  },{maxAttempts:7});
}

/**
 * Unmounted Express route prototype. MUST receive real production
 * requireFirebaseUser middleware in a future independently reviewed release.
 * The additional emulator gate prevents accidental production writes.
 */
function registerEmulatorOnlyDecisionRoute(app,{
  db,requireFirebaseUser,env=process.env,clock=()=>Date.now()
}={}){
  if(!app||typeof app.post!=="function"||
     !db||typeof db.runTransaction!=="function"||
     typeof requireFirebaseUser!=="function")
    throw new TypeError("Mandatory auth middleware and database required");
  app.post("/api/volunteer/emergency-auto/offers/:caseId/decision",
    requireFirebaseUser,async(request,response)=>{
      response.set("Cache-Control","no-store, private");
      response.set("Pragma","no-cache");
      if(!emulatorReady(env))
        return response.status(503).json({
          ok:false,status:"blocked",reason:"isolated_emulator_write_disabled"
        });
      const keys=request.body&&typeof request.body==="object"&&
        !Array.isArray(request.body)?Object.keys(request.body):[];
      if(keys.length!==1||keys[0]!=="decision")
        return response.status(400).json({
          ok:false,status:"blocked",reason:"unexpected_request_fields"
        });
      if(!request.firebaseUser?.uid)
        return response.status(401).json({
          ok:false,status:"blocked",reason:"unauthenticated"
        });
      try{
        const result=await decideEmulatedAutomaticOffer({
          db,env,authenticatedUid:request.firebaseUser.uid,
          caseId:request.params?.caseId,decision:request.body.decision,
          now:clock()
        });
        const ok=result.status.startsWith("committed_") ||
          result.status.startsWith("already_");
        // Strict aggregate-only HTTP output: never return candidate UID,
        // name, email, or a serialized Firestore document.
        return response.status(ok?200:409).json({
          ok,status:result.status,reason:result.reason||null,
          emulatorOnly:true,dispatchEnabled:false,
          changed:result.changed===true
        });
      }catch(_error){
        return response.status(503).json({
          ok:false,status:"blocked",reason:"decision_unavailable",
          emulatorOnly:true,dispatchEnabled:false
        });
      }
    });
}
module.exports={decideEmulatedAutomaticOffer,registerEmulatorOnlyDecisionRoute,
  emulatorReady,ASSIGNMENT_MODE};
