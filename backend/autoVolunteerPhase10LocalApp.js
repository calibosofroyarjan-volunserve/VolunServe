"use strict";
/**
 * PHASE 10: Local-only Admin + Volunteer application integration harness.
 *
 * This module does NOT import into backend/server.js, does not open a port,
 * and cannot run outside the real demo Firestore + Auth Emulator process.
 * It NEVER reads or writes production/staging Firebase, or the fixed
 * STAGING_E2E_002 accepted-responder test history.
 */
const express=require("express");
const path=require("node:path");
const {emulatorReady}=require("./autoVolunteerPhase6EmulatorDecisionServer");
const {reconcileEmulatedAutomaticWave}
  =require("./autoVolunteerPhase7WaveWorkerEmulator");
const {decideEmulatedAutomaticOffer}
  =require("./autoVolunteerPhase6EmulatorDecisionServer");
const {cancelEmulatedPendingWave}
  =require("./autoVolunteerPhase9SafeCancelEmulator");
const {runPhase9DemoDueScan}
  =require("./autoVolunteerPhase9DueScanEmulator");
const {isOperationalAdminProfile}=require("./adminAccess");
const PROJECT="demo-volunserve-auto-phase4",MAX=200;
const validCase=x=>typeof x==="string"&&
  /^phase10_[a-zA-Z0-9_-]{1,86}$/.test(x);
const block=(res,code,reason)=>res.status(code).json({
  ok:false,status:"blocked",reason,emulatorOnly:true,dispatchEnabled:false
});
function ready(db,auth,env){
  return env===process.env&&emulatorReady(env)&&
    env.FIREBASE_AUTH_EMULATOR_HOST==="127.0.0.1:9099"&&
    db?.projectId===PROJECT&&typeof db.runTransaction==="function"&&
    typeof auth?.verifyIdToken==="function";
}
function createPhase10LocalApp({db,authClient,env=process.env,
  clock=()=>Date.now()}={}){
  if(!ready(db,authClient,env))
    throw Error("Phase 10 refuses non-demo Auth/Firestore environment");
  const app=express();
  app.disable("x-powered-by");
  app.use(express.json({limit:"4kb"}));
  app.use((_req,res,next)=>{
    res.set("Cache-Control","no-store, private");
    res.set("X-Content-Type-Options","nosniff");
    return next();
  });
  app.get("/phase10-admin",(_req,res)=>
    res.sendFile(path.join(__dirname,"phase10LocalAdmin.html")));
  app.get("/phase10-volunteer",(_req,res)=>
    res.sendFile(path.join(__dirname,"phase10LocalVolunteer.html")));
  app.get("/api/phase10/health",(_req,res)=>res.json({
    ok:true,localDemoOnly:true,dispatchEnabled:false,
    workerMode:"explicit_admin_demo_tick",schedulerAlwaysOn:false
  }));
  async function requireVerifiedDemoUser(req,res,next){
    const match=/^Bearer ([^\s]+)$/.exec(
      String(req.headers.authorization||""));
    if(!match)return block(res,401,"firebase_sign_in_required");
    try{
      // Real Firebase AUTH EMULATOR token verified server-side; no uid
      // supplied in a browser body, query or route is authoritative.
      const decoded=await authClient.verifyIdToken(match[1],true);
      if(!decoded.uid||decoded.email_verified!==true)
        return block(res,403,"verified_email_required");
      const snap=await db.collection("users").doc(decoded.uid).get();
      if(!snap.exists)return block(res,403,"approved_profile_required");
      req.demoUser={uid:decoded.uid,profile:snap.data()||{}};
      return next();
    }catch(_error){return block(res,401,"invalid_firebase_token")}
  }
  function requireAdmin(req,res,next){
    return isOperationalAdminProfile(req.demoUser?.profile)?
      next():block(res,403,"approved_operational_admin_required");
  }
  function requireVolunteer(req,res,next){
    const p=req.demoUser?.profile||{};
    if(!["resident","volunteer"].includes(p.role)||
      p.status!=="approved"||p.volunteerAccess!==true||
      p.volunteerStatus!=="approved"||
      !(p.identityVerified===true||p.identityStatus==="verified"))
      return block(res,403,"approved_verified_volunteer_required");
    return next();
  }
  function requireCase(req,res,next){
    if(!validCase(req.params?.caseId))
      return block(res,400,"fictional_phase10_cases_only");
    return next();
  }
  function expectFields(req,res,keys){
    const b=req.body;
    if(!b||typeof b!=="object"||Array.isArray(b)||
      Object.keys(b).length!==keys.length||
      keys.some(k=>!Object.prototype.hasOwnProperty.call(b,k))){
      block(res,400,"unexpected_request_fields");
      return false;
    }
    return true;
  }
  const adminPath="/api/phase10/admin/cases/:caseId";
  app.get(adminPath,requireVerifiedDemoUser,requireAdmin,requireCase,
    async(req,res)=>{
      try{
        const id=req.params.caseId;
        const [c,b,a]=await Promise.all([
          db.collection("disasterCases").doc(id).get(),
          db.collection("emergencyAutoDispatchBatches").doc(id).get(),
          db.collection("responseAssignments").where("caseId","==",id)
            .limit(MAX+1).get()
        ]);
        if(!c.exists)return block(res,404,"fictional_case_not_found");
        if(a.size>MAX)return block(res,409,"case_offer_limit_exceeded");
        const counts={offered:0,accepted:0,declined:0,expired:0,
          cancelled:0,responding:0,on_site:0,completed:0};
        for(const item of a.docs){
          const status=String(item.data()?.status||"").toLowerCase();
          if(Object.prototype.hasOwnProperty.call(counts,status))
            counts[status]++;
        }
        const batch=b.exists?b.data()||{}:{};
        // Never expose Volunteer IDs, names, email, GPS or assignment IDs.
        return res.json({ok:true,emulatorOnly:true,dispatchEnabled:false,
          status:"read_only",
          caseStatus:String(c.data()?.status||"unknown"),
          batchStatus:String(batch.status||"not_started"),
          wave:Number.isInteger(batch.wave)?batch.wave:0,
          expiresAtMs:Number.isSafeInteger(batch.expiresAtMs)?
            batch.expiresAtMs:null,
          counts,acceptedResponderPresent:
            typeof c.data()?.autoVolunteerAcceptedAssignmentId==="string"&&
            c.data().autoVolunteerAcceptedAssignmentId.length>0});
      }catch(_e){return block(res,503,"preview_unavailable")}
    });
  app.post(adminPath+"/start",requireVerifiedDemoUser,requireAdmin,
    requireCase,async(req,res)=>{
      if(!expectFields(req,res,[]))return;
      try{
        const result=await reconcileEmulatedAutomaticWave({
          db,env,caseId:req.params.caseId,now:clock()
        });
        const ok=["offered","waiting","supported","exhausted"].includes(result.status);
        return res.status(ok?200:409).json({ok,status:result.status,
          reason:result.reason||null,wave:result.wave||0,
          offered:result.offered||0,emulatorOnly:true,dispatchEnabled:false});
      }catch(_e){return block(res,503,"demo_start_unavailable")}
    });
  app.post(adminPath+"/cancel",requireVerifiedDemoUser,requireAdmin,
    requireCase,async(req,res)=>{
      if(!expectFields(req,res,["reason"]))return;
      try{
        const result=await cancelEmulatedPendingWave({
          db,env,caseId:req.params.caseId,
          authenticatedAdminUid:req.demoUser.uid,
          reason:req.body.reason,now:clock()
        });
        const ok=["cancelled","already_cancelled"].includes(result.status);
        return res.status(ok?200:409).json({ok,status:result.status,
          reason:result.reason||null,changed:result.changed===true,
          cancelledOffers:ok?result.cancelledOffers||0:0,
          emulatorOnly:true,dispatchEnabled:false});
      }catch(_e){return block(res,503,"demo_cancel_unavailable")}
    });
  app.post("/api/phase10/admin/due-scan",requireVerifiedDemoUser,
    requireAdmin,async(req,res)=>{
      if(!expectFields(req,res,[]))return;
      const result=await runPhase9DemoDueScan({
        db,env,now:clock(),maxJobs:10
      });
      const ok=result.status==="scanned";
      return res.status(ok?200:409).json({ok,status:result.status,
        reason:result.reason||null,inspected:result.inspected||0,
        due:result.due||0,executed:result.executed||0,
        deferred:result.deferred||0,outcomes:result.outcomes||{},
        emulatorOnly:true,dispatchEnabled:false});
    });
  const volunteerPath="/api/phase10/volunteer/cases/:caseId";
  app.get(volunteerPath+"/offer",requireVerifiedDemoUser,
    requireVolunteer,requireCase,async(req,res)=>{
      const uid=req.demoUser.uid;
      try{
        const appDoc=await db.collection("volunteerApplications").doc(uid).get();
        if(!appDoc.exists||String(appDoc.data()?.status||"").toLowerCase()!=="approved")
          return block(res,403,"volunteer_application_not_approved");
        const snap=await db.collection("responseAssignments")
          .doc(req.params.caseId+"_"+uid).get();
        if(!snap.exists)return res.json({ok:true,status:"no_offer",
          emulatorOnly:true,dispatchEnabled:false});
        const data=snap.data()||{};
        if(data.caseId!==req.params.caseId||data.volunteerId!==uid||
          data.offerMode!=="automatic_wave_proposed")
          return block(res,409,"offer_not_owned");
        return res.json({ok:true,status:String(data.status||"unknown"),
          wave:Number.isInteger(data.wave)?data.wave:0,
          expiresAtMs:Number.isSafeInteger(data.expiresAtMs)?
            data.expiresAtMs:null,
          emulatorOnly:true,dispatchEnabled:false});
      }catch(_e){return block(res,503,"volunteer_offer_unavailable")}
    });
  app.post(volunteerPath+"/decision",requireVerifiedDemoUser,
    requireVolunteer,requireCase,async(req,res)=>{
      if(!expectFields(req,res,["decision"]))return;
      if(!["accepted","declined"].includes(req.body.decision))
        return block(res,400,"invalid_decision");
      try{
        const result=await decideEmulatedAutomaticOffer({
          db,env,caseId:req.params.caseId,authenticatedUid:req.demoUser.uid,
          decision:req.body.decision,now:clock()
        });
        const ok=result.status==="committed_accepted"||
          result.status==="committed_declined"||
          result.status==="already_accepted"||
          result.status==="already_declined";
        return res.status(ok?200:409).json({ok,status:result.status,
          reason:result.reason||null,changed:result.changed===true,
          emulatorOnly:true,dispatchEnabled:false});
      }catch(_e){return block(res,503,"volunteer_decision_unavailable")}
    });
  return app;
}
module.exports={createPhase10LocalApp};
