"use strict";

/**
 * ISOLATED staging endpoint for a Free Render preview.
 *
 * Unlike backend/server.js, this server never starts certificates, donations,
 * payments, identity processing, production maintenance jobs, or background
 * emergency matching. It is not an emergency-services dispatcher.
 * It fails closed unless the operator configured a separate, non-production
 * Firebase Admin service account and a matching staging project ID.
 */
const express = require("express");
const cors = require("cors");
const path = require("node:path");
const {planVolunteerWaves} = require("../functions/emergencyVolunteerWavePlanner");
const knownBarangays = require("../functions/sjdmBarangays.json");
const {auth, db} = require("./firebaseAdmin");
const {isOperationalAdminProfile} = require("./adminAccess");
const {createRenderAutoDispatchWorker,verifiedStagingProject} = require("./emergencyAutoDispatchWorker");
const {inspectStagingTestCase} = require("./emergencyStagingReadiness");
const {getVolunteerOffer,respondToStagingOffer,resetExpiredFixture,CASE_ID} =
  require("./stagingVolunteerTask");

function makeApp({authClient = auth, firestore = db, worker, env = process.env} = {}) {
  const app = express();
  const matcher = worker || createRenderAutoDispatchWorker({db: firestore, env});
  // One-time, read-only connectivity probe on isolated staging only.
  // Never reads user data, creates accounts, changes Firestore or enables offers.
  // Does not block HTTP startup if Firebase is temporarily unavailable.
  const stagingServiceAccountMatches = verifiedStagingProject(env);
  let stagingFirestoreReadStatus = stagingServiceAccountMatches ? "checking" : "not_configured";
  let stagingTestCaseReadiness = {status:stagingServiceAccountMatches?"checking":"not_configured"};
  if (stagingServiceAccountMatches) {
    void Promise.resolve()
      .then(() => firestore.collection("systemSettings").doc("emergencyVolunteerMatching").get())
      .then(() => {
        stagingFirestoreReadStatus = "verified";
        console.info("[staging-readiness] isolated Firestore read succeeded");
        return inspectStagingTestCase(firestore).then(result=>{
          stagingTestCaseReadiness = result;
          console.info("[staging-readiness] synthetic fixture preflight:",result.status,result.reason);
        }).catch(error=>{
          stagingTestCaseReadiness = {status:"unavailable"};
          console.warn("[staging-readiness] synthetic fixture check unavailable",
            String(error?.code || "unknown").slice(0,60));
        });
      })
      .catch(error => {
        stagingFirestoreReadStatus = "unavailable";
        stagingTestCaseReadiness = {status:"unavailable"};
        // Error code only, never output service account, document or private data.
        console.warn("[staging-readiness] isolated Firestore read unavailable",
          String(error?.code || "unknown").slice(0,80));
      });
  }
  // Browser POSTs from /staging-login include an Origin header, even when
  // same-origin. Without this exact origin they hit staging_request_blocked.
  // Explicit allowlisting preserves the cross-origin deny-by-default policy.
  const SAME_ORIGIN_STAGING = "https://volunserve-emergency-match-staging-free.onrender.com";
  const allowedOrigins = new Set([SAME_ORIGIN_STAGING,
    ...String(env.VOLUNSERVE_AUTO_VOLUNTEER_STAGING_ALLOWED_ORIGINS || "")
      .split(",").map(x => x.trim()).filter(x => /^https:\/\/[a-z0-9.-]+$/i.test(x))]);
  app.disable("x-powered-by");
  app.use(cors({
    origin(origin, next) {
      if (!origin || allowedOrigins.has(origin)) return next(null, true);
      return next(new Error("Origin is not allowed for isolated staging."));
    },
    methods:["GET","POST","OPTIONS"],
    allowedHeaders:["Authorization","Content-Type"],
  }));
  app.use(express.json({limit:"4kb"}));

  app.get("/health", (_request, response) => response.json({
    ok:true, service:"volunserve-emergency-matching-staging",
    workerMode:"admin_on_demand_only",
    matchingEnabled:matcher.config.onDemandReady === true,
    backgroundMatchingEnabled:false,
    officialEmergencyDispatch:false,
    stagingServiceAccountMatches,
    stagingFirestoreReadStatus,
    stagingTestCaseReadiness,
  }));

  // Passwords go only to Firebase Auth over HTTPS from the browser.
  // The server never receives passwords, stores tokens, or dispatches tasks here.
  app.get("/staging-login", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.set("X-Robots-Tag", "noindex, nofollow");
    response.set("X-Frame-Options", "DENY");
    response.sendFile(path.join(__dirname, "stagingAdminLogin.html"));
  });

  app.get("/staging-volunteer", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.set("X-Robots-Tag", "noindex, nofollow");
    response.set("X-Frame-Options", "DENY");
    response.sendFile(path.join(__dirname, "stagingVolunteerLogin.html"));
  });

  // SAFE DEMONSTRATION: pure planner, all data synthetic. Never calls Firebase,
  // writes Firestore, sends notifications or accesses real user identities.
  app.get("/demo", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.set("X-Robots-Tag", "noindex, nofollow");
    response.sendFile(path.join(__dirname, "emergencyMatchingDemo.html"));
  });
  app.get("/demo-data", (_request, response) => {
    const incident={id:"DEMO-CASE-001",title:"Synthetic flooding report",
      status:"validated",verificationStatus:"validated",dispatchBlocked:false,
      reporterUid:"fictional-resident",incidentBarangay:"Bagong Buhay I",
      severity:"medium",requiredSkills:["First Aid"]};
    const volunteer=(id,barangay,identityVerified=true)=>({
      uid:id,
      user:{role:"volunteer",status:"approved",volunteerAccess:true,
        volunteerStatus:"approved",identityVerified,barangay,
        fullName:"Volunteer "+id+" (Test)",skills:["First Aid"]},
      application:{uid:id,status:"approved",skills:["First Aid"]},
    });
    const roster=[volunteer("A","Bagong Buhay I"),
      volunteer("B","Bagong Buhay I"),volunteer("C","Francisco Homes-Narra"),
      volunteer("D","Bagong Buhay II",false)];
    // No Wave 2 neighbors are declared. We never invent geographic adjacency.
    const plan=planVolunteerWaves(incident,roster,{
      knownBarangays,neighborsByBarangay:{},activeAssignments:[],
    });
    response.set("Cache-Control", "no-store");
    response.json({mode:"synthetic",caseTitle:incident.title,
      caseBarangay:incident.incidentBarangay,reviewed:plan.reviewed,
      counts:plan.counts,wave2Configured:false,doesNotSendOffers:true});
  });

  async function requireStagingAdmin(request, response, next) {
    try {
      const bearer = String(request.headers.authorization || "");
      const token = /^Bearer (\S+)$/i.exec(bearer)?.[1];
      if (!token) return response.status(401).json({ok:false,error:"sign_in_required"});
      // verifyIdToken checks issuer, audience, expiry and revocation.
      const decoded = await authClient.verifyIdToken(token,true);
      if (!decoded?.uid || !/^[A-Za-z0-9_-]{1,160}$/.test(decoded.uid)) {
        return response.status(401).json({ok:false,error:"invalid_account"});
      }
      const profileSnap = await firestore.collection("users").doc(decoded.uid).get();
      if (!profileSnap.exists || !isOperationalAdminProfile(profileSnap.data())) {
        return response.status(403).json({ok:false,error:"approved_admin_required"});
      }
      next();
    } catch (error) {
      // Do not log Firebase token, document, or credentials.
      console.warn("Staging emergency Admin authentication rejected:", String(error?.code || "unknown"));
      response.status(401).json({ok:false,error:"invalid_admin_session"});
    }
  }
  async function requireStagingVolunteer(request,response,next){
    if(!stagingServiceAccountMatches)
      return response.status(503).json({ok:false,error:"isolated_staging_not_configured"});
    try {
      const bearer=String(request.headers.authorization||"");
      const token=/^Bearer (\\S+)$/i.exec(bearer)?.[1];
      if(!token)return response.status(401).json({ok:false,error:"sign_in_required"});
      const decoded=await authClient.verifyIdToken(token,true);
      if(!decoded?.uid || !/^[A-Za-z0-9_-]{1,160}$/.test(decoded.uid))
        return response.status(401).json({ok:false,error:"invalid_account"});
      const [user,application]=await Promise.all([
        firestore.collection("users").doc(decoded.uid).get(),
        firestore.collection("volunteerApplications").doc(decoded.uid).get()
      ]);
      const profile=user.exists?user.data()||{}:{};
      const volunteer=application.exists?application.data()||{}:{};
      if(profile.role!=="volunteer" || profile.status!=="approved" ||
         profile.volunteerStatus!=="approved" ||
         profile.volunteerAccess!==true || profile.identityVerified!==true ||
         volunteer.status!=="approved" ||
         (volunteer.uid && volunteer.uid!==decoded.uid)){
        return response.status(403).json({ok:false,error:"approved_test_volunteer_required"});
      }
      response.locals.stagingVolunteerUid=decoded.uid;
      next();
    } catch(error){
      console.warn("Staging Volunteer auth rejected:",String(error?.code||"unknown").slice(0,80));
      response.status(401).json({ok:false,error:"invalid_volunteer_session"});
    }
  }
  app.get("/api/staging/volunteer/task",requireStagingVolunteer,async(_request,response)=>{
    try {
      const task=await getVolunteerOffer(firestore,response.locals.stagingVolunteerUid);
      response.set("Cache-Control","no-store");
      response.json({ok:true,...task});
    }catch(error){
      console.warn("Staging task read unavailable:",String(error?.code||"unknown").slice(0,80));
      response.status(503).json({ok:false,error:"staging_task_unavailable"});
    }
  });
  app.post("/api/staging/volunteer/respond",requireStagingVolunteer,requireActivation,
    async(request,response)=>{
      const decision=request.body?.decision;
      if(!["accepted","declined"].includes(decision))
        return response.status(400).json({ok:false,error:"invalid_decision"});
      try{
        const outcome=await respondToStagingOffer(
          firestore,response.locals.stagingVolunteerUid,decision);
        response.status(["accepted","declined","already_accepted","already_declined"].includes(outcome.status)?200:409)
          .json({ok:outcome.status===decision,...outcome});
      }catch(error){
        console.warn("Staging Volunteer decision failed:",String(error?.code||"unknown").slice(0,80));
        response.status(409).json({ok:false,error:"staging_response_conflict"});
      }
    });
  function requireActivation(_req, res, next) {
    if (matcher.config.onDemandReady) return next();
    res.status(503).json({ok:false,error:"isolated_staging_not_configured",
      message:"Configure an approved isolated staging Firebase project. No Volunteer offers were sent."});
  }
  app.get("/api/admin/emergency-auto/status", requireStagingAdmin, (_request,response) => {
    response.json({ok:true,activationReady:matcher.config.onDemandReady === true,
      onDemandEnabled:matcher.config.onDemandReady === true,
      workerEnabled:false,workerMode:"staging_admin_on_demand_only"});
  });
  // Free preview activation is deliberately restricted to a SINGLE fictional
  // staging fixture; never permit a generic Admin to submit an arbitrary case.
  async function requireSyntheticFixture(request,response,next){
    if(String(request.body?.caseId || "")!=="STAGING_TEST_001"){
      return response.status(403).json({ok:false,error:"only_fixed_staging_test_case_allowed"});
    }
    try {
      const doc=await firestore.collection("disasterCases").doc("STAGING_TEST_001").get();
      const data=doc.exists?doc.data():null;
      if(!data || data.title!=="TEST ONLY - Dummy Emergency" ||
         data.verificationStatus!=="validated" ||
         !["validated","assigned","in_progress"].includes(data.status) ||
         data.dispatchBlocked === true ||
         !Array.isArray(data.requiredSkills) ||
         !data.reporterUid || !data.validatedBy ||
         data.reporterUid===data.validatedBy){
        return response.status(409).json({ok:false,error:"staging_test_case_not_ready"});
      }
      return next();
    } catch(error){
      console.warn("Staging-only case verification unavailable:",String(error?.code||"unknown").slice(0,80));
      return response.status(503).json({ok:false,error:"staging_test_case_read_unavailable"});
    }
  }
  function action(method) {
    return async (request,response) => {
      const caseId = String(request.body?.caseId || "").trim();
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(caseId)) {
        return response.status(400).json({ok:false,error:"invalid_case_id"});
      }
      try {
        const result=await (method==="start" ? matcher.requestStart(caseId) :
          matcher.requestDisable(caseId));
        response.json({ok:true,...result});
      } catch(error) {
        // Never expose raw Firestore errors, private details, or service keys.
        console.error("Staging Volunteer matching operation failed:",String(error?.code || error?.name || "unknown"));
        response.status(409).json({ok:false,error:"matching_review_required",
          message:"Matching could not complete. Review the case and coordinate manually."});
      }
    };
  }
  app.post("/api/admin/emergency-auto/reissue-test",
    requireStagingAdmin,requireActivation,requireSyntheticFixture,async(_request,response)=>{
      try {
        const cleared=await resetExpiredFixture(firestore);
        if(!["ready","reset"].includes(cleared.status))
          return response.status(409).json({ok:false,error:cleared.status});
        const r=await matcher.requestStart(CASE_ID);
        response.json({ok:true,...r,caseId:CASE_ID});
      }catch(error){
        console.warn("Staging fixture reissue failed:",String(error?.code||"unknown").slice(0,80));
        response.status(409).json({ok:false,error:"reissue_review_required"});
      }
    });
  app.post("/api/admin/emergency-auto/start",requireStagingAdmin,requireActivation,requireSyntheticFixture,action("start"));
  app.post("/api/admin/emergency-auto/disable",requireStagingAdmin,requireActivation,requireSyntheticFixture,action("disable"));
  app.use((error, _request, response, _next) => {
    if (error?.type === "entity.too.large") return response.status(413).json({ok:false,error:"payload_too_large"});
    response.status(403).json({ok:false,error:"staging_request_blocked"});
  });
  return app;
}
if (require.main === module) {
  const app = makeApp();
  const port=Number(process.env.PORT || 10000);
  app.listen(port,"0.0.0.0",()=>{
    console.info("Isolated Free staging Volunteer matching API listening");
  });
}
module.exports={makeApp};
