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
const {inspectStagingTestCase,diagnoseSyntheticFixtureFields} = require("./emergencyStagingReadiness");
const {prepareSyntheticCaseForTest} = require("./stagingSyntheticCasePreparation");
const {reconcileAcceptedStagingSupport} = require("./stagingAcceptedSupportReconciliation");
const {getVolunteerOffer,respondToStagingOffer,resetExpiredFixture,
  inspectStagingAssignmentConsistency,CASE_ID,E2E_CASE_ID,titleForCase} =
  require("./stagingVolunteerTask");
const {chooseAllEligibleWave}=require("../functions/emergencyAllEligibleWavePlanner");
const {startBatchOffers,getBatchOffer,respondBatchOffer,batchStatus}
  =require("./stagingBulkVolunteerOffers");
const {advanceBatchWave}=require("./stagingBulkWaveAdvance");
const {retryExpiredBatch002}=require("./staging002ExpiredBulkRetry");
const {summarizeStaging002Eligibility}=require("./staging002EligibilitySummary");
const {fixtureSummary,provisionFixtures}=require("./staging002TestVolunteerProvisioning");
const {verifyStaging002BulkAcceptance}=require("./staging002BulkAcceptanceVerifier");
const {verifyStaging002WaveStop}=require("./staging002WaveStopVerification");
const {createStaging002SchedulerEvidence}=require("./staging002SchedulerEvidence");
const knownSJDMBgy=require("../functions/sjdmBarangays.json");
const {createFreshTestCase,validateFreshTestCase,inspectFreshTestCase,recognized}
  =require("./stagingFreshCase002");

function makeApp({authClient = auth, firestore = db, worker, env = process.env} = {}) {
  const app = express();
  // OFF unless specifically enabled for the fixed, fictional E2E 002.
  const bulk002Enabled=env.VOLUNSERVE_STAGING_E2E_002_BULK==="enabled";
  // Isolated opt-in: automatically fan out to ALL eligible volunteers only
  // after the approved Admin validates the fixed fictional case 002.
  // This is disabled by default and cannot dispatch a real emergency.
  const bulk002OnValidation=bulk002Enabled &&
    env.VOLUNSERVE_STAGING_E2E_002_AUTO_AFTER_VALIDATION==="enabled";
  const matcher = worker || createRenderAutoDispatchWorker({db: firestore, env});
  // One-time, read-only connectivity probe on isolated staging only.
  // Never reads user data, creates accounts, changes Firestore or enables offers.
  // Does not block HTTP startup if Firebase is temporarily unavailable.
  const stagingServiceAccountMatches = verifiedStagingProject(env);
  // OFF by default; fixed fictional 002 only, on the isolated staging Firebase.
  // Render Free may sleep: this is a staging QA timer, not 24/7 dispatch.
  const autoWaves002=stagingServiceAccountMatches&&bulk002OnValidation&&
    env.VOLUNSERVE_STAGING_E2E_002_AUTO_WAVES==="enabled";
  const schedulerEvidence=createStaging002SchedulerEvidence(autoWaves002);
  if(autoWaves002){
    let schedulerTickInFlight=false;
    let lastLoggedStatus=null;
    const timer=setInterval(()=>{
      // Avoid concurrent wave advances on a slow/sleeping Free staging worker.
      if(schedulerTickInFlight)return;
      schedulerTickInFlight=true;
      void advanceBatchWave(firestore).then(result=>{
        const status=schedulerEvidence.record(result);
        // Only status codes: never log UIDs, assignments or account details.
        if(["supported","offered","exhausted"].includes(status) &&
          status!==lastLoggedStatus)
          console.info("[staging-002-waves] automatic scheduler completed:",status);
        lastLoggedStatus=status;
      }).catch(error=>{
        schedulerEvidence.record("error");
        console.warn("[staging-002-waves] retryable reconciliation failure",
          String(error?.code||"unknown").slice(0,60));
      }).finally(()=>{schedulerTickInFlight=false;});
    },20000);
    timer.unref?.();
  }
  let stagingFirestoreReadStatus = stagingServiceAccountMatches ? "checking" : "not_configured";
  let stagingTestCaseReadiness = {status:stagingServiceAccountMatches?"checking":"not_configured"};
  if (stagingServiceAccountMatches) {
    void Promise.resolve()
      .then(() => firestore.collection("systemSettings").doc("emergencyVolunteerMatching").get())
      .then(() => {
        stagingFirestoreReadStatus = "verified";
        console.info("[staging-readiness] isolated Firestore read succeeded");
        return inspectStagingTestCase(firestore).then(async result=>{
          stagingTestCaseReadiness = result;
          console.info("[staging-readiness] synthetic fixture preflight:",result.status,result.reason);
          // Only the fixed fictional fixture. Log missing field NAMES (never values
          // or user IDs) to the private staging service logs for authorized QA.
          if (result.reason === "invalid_test_case_fields") {
            const dummy = await firestore.collection("disasterCases").doc(CASE_ID).get();
            const fields = diagnoseSyntheticFixtureFields(dummy.exists ? dummy.data() : null);
            console.info("[staging-readiness] invalid dummy field names:",
              fields.join(",") || "none");
            const fixture = dummy.exists ? dummy.data() : null;
            if (fixture?.title === "TEST ONLY - Dummy Emergency") {
              const category=["reported","validated","assigned","in_progress",
                "resolved","closed"].includes(fixture.status)?fixture.status:"other";
              console.info("[staging-readiness] fictional case status category:",
                category,"hasAssignmentMarker:",Boolean(
                  fixture.activeVolunteerSupportAssignmentId ||
                  fixture.autoVolunteerDispatch?.state));
              if (fixture.activeVolunteerSupportAssignmentId ||
                  fixture.autoVolunteerDispatch?.state) {
                // Read-only private staging diagnostics: status/boolean values
                // only, never Volunteer IDs, personal data or tokens.
                const check=await inspectStagingAssignmentConsistency(firestore);
                console.info("[staging-readiness] existing fictional assignment:",
                  "checkStatus:",String(check.status||"unknown"),
                  "session:",String(check.sessionStatus||"unknown"),
                  "assignment:",String(check.assignmentStatus||"unknown"),
                  "acceptedVerified:",check.fullAcceptanceVerified===true);
                // Status-only quality checks for the ONE recognized fictional
                // case, with no identities, values, or assignment IDs logged.
                const flags=["initialOfferNotificationPresent",
                  "acceptedResponderLockCorrect","acceptedCaseStatusCorrect",
                  "acceptedResidentNotificationPresent","adminAuditPresent",
                  "reservationPresent"];
                console.info("[staging-readiness] fictional acceptance flags:",
                  flags.map(key=>key+"="+(check[key]===true?"yes":"no")).join(" "));
              }
            }
          }
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
  // Separate read-only Expo web review deployed from PR #576, NEVER the live site.
  const REVIEW_WEB_ORIGIN = "https://volunserve-auto-volunteer-ui-staging.onrender.com";
  const allowedOrigins = new Set([SAME_ORIGIN_STAGING, REVIEW_WEB_ORIGIN,
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
      response.locals.stagingAdminUid=decoded.uid;
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
      const token=/^Bearer (\S+)$/i.exec(bearer)?.[1];
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
      const caseId=String(_request.query?.caseId || CASE_ID);
      if(!titleForCase(caseId))return response.status(403).json({ok:false,error:"only_fixed_staging_cases_allowed"});
      const task=await getVolunteerOffer(firestore,response.locals.stagingVolunteerUid,Date.now(),caseId);
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
      const caseId=String(request.body?.caseId || CASE_ID);
      if(!titleForCase(caseId))return response.status(403).json({ok:false,error:"only_fixed_staging_cases_allowed"});
      if(!["accepted","declined"].includes(decision))
        return response.status(400).json({ok:false,error:"invalid_decision"});
      try{
        const outcome=await respondToStagingOffer(
          firestore,response.locals.stagingVolunteerUid,decision,Date.now(),caseId);
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
  // Fresh, authenticated diagnostic for the ONLY fictional staging case.
  // Unlike startup /health, this reflects edits made after server startup.
  // Return field NAMES only; never expose user IDs or the raw report payload.
  app.get("/api/admin/emergency-auto/preflight",requireStagingAdmin,async(_request,response)=>{
    if(!stagingServiceAccountMatches)
      return response.status(503).json({ok:false,error:"isolated_staging_not_configured"});
    try {
      const readiness=await inspectStagingTestCase(firestore);
      let invalidFields=[];
      if(readiness.reason==="invalid_test_case_fields"){
        const fixture=await firestore.collection("disasterCases").doc(CASE_ID).get();
        if(fixture.exists)invalidFields=diagnoseSyntheticFixtureFields(fixture.data());
      }
      response.set("Cache-Control","no-store");
      response.json({ok:true,...readiness,invalidFields});
    }catch(error){
      console.warn("Staging fixture preflight unavailable",
        String(error?.code||"unknown").slice(0,70));
      response.status(503).json({ok:false,error:"staging_preflight_unavailable"});
    }
  });
  // Requires approved staging Admin and explicitly enabled isolated Firebase.
  // Never use this on live reports. No offer or notification is sent here.
  app.post("/api/admin/emergency-auto/prepare-test-status",
    requireStagingAdmin,requireActivation,async(_request,response)=>{
      if(!stagingServiceAccountMatches)
        return response.status(503).json({ok:false,error:"isolated_staging_not_configured"});
      try{
        const result=await prepareSyntheticCaseForTest(firestore);
        response.set("Cache-Control","no-store");
        response.status(result.status==="blocked"?409:200)
          .json({ok:result.status!=="blocked",...result});
      }catch(error){
        console.warn("Synthetic case status preparation unavailable",
          String(error?.code||"unknown").slice(0,70));
        response.status(503).json({ok:false,error:"test_status_preparation_unavailable"});
      }
    });
  // One fictional case only. Authenticated, read-only diagnostics; no
  // UIDs, user details or payloads from actual Emergency Reports are returned.
  app.get("/api/admin/emergency-auto/verify-test",requireStagingAdmin,async(_request,response)=>{
    if(!stagingServiceAccountMatches)
      return response.status(503).json({ok:false,error:"isolated_staging_not_configured"});
    try{
      const caseId=String(_request.query?.caseId || CASE_ID);
      if(!titleForCase(caseId))return response.status(403).json({ok:false,error:"only_fixed_staging_cases_allowed"});
      const review=await inspectStagingAssignmentConsistency(firestore,caseId);
      response.set("Cache-Control","no-store");
      response.json({ok:true,...review});
    }catch(error){
      console.warn("Isolated test assignment review unavailable",String(error?.code||"unknown").slice(0,70));
      response.status(503).json({ok:false,error:"test_verification_unavailable"});
    }
  });

  // An explicit staging Admin action. Never runs automatically at startup.
  // It adds late, truthfully labelled support records only after full accepted
  // task ownership/lock/reservation checks; it never replays an acceptance.
  app.post("/api/admin/emergency-auto/reconcile-accepted-test",
    requireStagingAdmin,requireActivation,async(request,response)=>{
      if(!stagingServiceAccountMatches)
        return response.status(503).json({ok:false,error:"isolated_staging_not_configured"});
      if(request.body?.caseId!==CASE_ID ||
         request.body?.confirmLateReconciliation!==true)
        return response.status(400).json({ok:false,error:"explicit_dummy_reconciliation_confirmation_required"});
      try {
        const outcome=await reconcileAcceptedStagingSupport(
          firestore,response.locals.stagingAdminUid);
        response.set("Cache-Control","no-store");
        response.status(outcome.status==="blocked"?409:200)
          .json({ok:outcome.status!=="blocked",...outcome});
      }catch(error){
        console.warn("Isolated late acceptance QA reconciliation unavailable",
          String(error?.code||"unknown").slice(0,70));
        response.status(503).json({ok:false,error:"staging_reconciliation_unavailable"});
      }
    });
  // Transactional all-eligible task offers; feature-gated, staging-only.
  // Does not run automatically on server startup or on real reports.
  app.post("/api/admin/emergency-auto/e2e-002/bulk-send",
    requireStagingAdmin,requireActivation,async(request,response)=>{
      if(!stagingServiceAccountMatches||!bulk002Enabled)
        return response.status(503).json({ok:false,error:"isolated_bulk_staging_disabled"});
      if(request.body?.caseId!==E2E_CASE_ID||
         request.body?.confirmAllEligibleTestOffers!==true)
        return response.status(400).json({ok:false,error:"explicit_bulk_test_confirmation_required"});
      try{
        const result=await startBatchOffers(firestore,response.locals.stagingAdminUid);
        response.set("Cache-Control","no-store");
        response.status(result.status==="blocked"?409:200).json({
          ok:result.status!=="blocked",...result});
      }catch(error){
        console.warn("Staging bulk offers unavailable",String(error?.code||"unknown").slice(0,60));
        response.status(503).json({ok:false,error:"bulk_send_unavailable"});
      }
    });
  // Explicit Admin retry is useful when a Free staging instance was asleep
  // during the 3-minute offer deadline. No real-case requests are accepted.
  // Separate TEST-ONLY expired batch retry. Not the legacy single-offer
  // reissue path; explicitly confirmed by approved staging Admin only.
  app.post("/api/admin/emergency-auto/e2e-002/bulk-reissue",
    requireStagingAdmin,requireActivation,async(request,response)=>{
      if(!stagingServiceAccountMatches||!bulk002Enabled)
        return response.status(503).json({ok:false,error:"isolated_bulk_staging_disabled"});
      if(request.body?.caseId!==E2E_CASE_ID ||
        request.body?.confirmExpiredBulkRetry!==true)
        return response.status(400).json({ok:false,error:"explicit_bulk_retry_confirmation_required"});
      try{
        const result=await retryExpiredBatch002(
          firestore,response.locals.stagingAdminUid);
        response.set("Cache-Control","no-store");
        response.status(result.status==="blocked"?409:200)
          .json({ok:result.status!=="blocked",...result});
      }catch(error){
        console.warn("Fixed fictional expired bulk retry unavailable",
          String(error?.code||"unknown").slice(0,60));
        response.status(503).json({ok:false,error:"staging_bulk_retry_unavailable"});
      }
    });
  app.post("/api/admin/emergency-auto/e2e-002/bulk-reconcile",
    requireStagingAdmin,requireActivation,async(request,response)=>{
      if(!autoWaves002||request.body?.caseId!==E2E_CASE_ID)
        return response.status(503).json({ok:false,error:"staging_wave_reconcile_disabled"});
      try{
        const result=await advanceBatchWave(firestore);
        response.set("Cache-Control","no-store");
        response.status(result.status==="blocked"?409:200)
          .json({ok:result.status!=="blocked",...result});
      }catch(error){
        console.warn("[staging-002-waves] Admin retry failed",
          String(error?.code||"unknown").slice(0,60));
        response.status(503).json({ok:false,error:"wave_reconcile_unavailable"});
      }
    });
  app.get("/api/admin/emergency-auto/e2e-002/bulk-status",
    requireStagingAdmin,async(_request,response)=>{
      if(!stagingServiceAccountMatches||!bulk002Enabled)
        return response.status(503).json({ok:false,error:"isolated_bulk_staging_disabled"});
      try{
        response.set("Cache-Control","no-store");
        response.json({ok:true,...await batchStatus(firestore)});
      }catch(error){
        response.status(503).json({ok:false,error:"bulk_status_unavailable"});
      }
    });
  // Read-only independent verification for BATCH 002. Legacy 001/002
  // single-task verifier does not inspect this batch model.
  app.get("/api/admin/emergency-auto/e2e-002/bulk-verify-acceptance",
    requireStagingAdmin,async(_request,response)=>{
      if(!stagingServiceAccountMatches||!bulk002Enabled)
        return response.status(503).json({ok:false,error:"isolated_bulk_staging_disabled"});
      try{
        const result=await verifyStaging002BulkAcceptance(firestore);
        response.set("Cache-Control","no-store");
        response.status(result.status==="blocked"?409:200)
          .json({ok:result.status!=="blocked",...result});
      }catch(error){
        console.warn("Staging fictional 002 bulk verification unavailable",
          String(error?.code||"unknown").slice(0,55));
        response.status(503).json({ok:false,error:"staging_bulk_acceptance_verification_unavailable"});
      }
    });
  // Authenticated, aggregate-only wave-stop readout. DOES NOT execute
  // the wave-advance worker or change any accepted offer/lock.
  app.get("/api/admin/emergency-auto/e2e-002/bulk-wave-stop",
    requireStagingAdmin,async(_request,response)=>{
      if(!stagingServiceAccountMatches||!bulk002Enabled)
        return response.status(503).json({ok:false,error:"isolated_bulk_staging_disabled"});
      try{
        const result=await verifyStaging002WaveStop(firestore,
          {timerConfigured:autoWaves002});
        // Heartbeat is ONLY actual completed scheduled calls in THIS process.
        // Do not label a read-only snapshot as proof of an executed timer.
        const heartbeat=schedulerEvidence.snapshot();
        const guardObserved=heartbeat.schedulerLastResult==="supported" &&
          result.waveStopGuardConfirmed===true &&
          result.observedAfterOtherOffersExpired===true &&
          result.noLaterWaveObserved===true &&
          result.acceptanceEvidenceVerified===true;
        response.set("Cache-Control","no-store");
        response.status(result.status==="blocked"?409:200)
          .json({ok:result.status!=="blocked",...result,...heartbeat,
            schedulerStopObservedThisProcess:guardObserved});
      }catch(error){
        console.warn("[staging-002-waves] read-only stop check failed",
          String(error?.code||"unknown").slice(0,60));
        response.status(503).json({ok:false,error:"wave_stop_check_unavailable"});
      }
    });
  app.get("/api/staging/volunteer/e2e-002/bulk-task",
    requireStagingVolunteer,async(_request,response)=>{
      if(!stagingServiceAccountMatches||!bulk002Enabled)
        return response.status(503).json({ok:false,error:"isolated_bulk_staging_disabled"});
      try{
        response.set("Cache-Control","no-store");
        response.json({ok:true,...await getBatchOffer(
          firestore,response.locals.stagingVolunteerUid)});
      }catch(error){
        response.status(503).json({ok:false,error:"bulk_task_unavailable"});
      }
    });
  app.post("/api/staging/volunteer/e2e-002/bulk-respond",
    requireStagingVolunteer,requireActivation,async(request,response)=>{
      if(!stagingServiceAccountMatches||!bulk002Enabled)
        return response.status(503).json({ok:false,error:"isolated_bulk_staging_disabled"});
      const decision=request.body?.decision;
      if(!["accepted","declined"].includes(decision))
        return response.status(400).json({ok:false,error:"invalid_decision"});
      try{
        const result=await respondBatchOffer(firestore,
          response.locals.stagingVolunteerUid,decision);
        let automaticWave={status:"disabled"};
        if(result.status==="declined"&&autoWaves002){
          try{
            automaticWave=await advanceBatchWave(firestore);
          }catch(error){
            console.warn("[staging-002-waves] persisted decline; automatic transition deferred",
              String(error?.code||"unknown").slice(0,60));
            automaticWave={status:"pending_retry"};
          }
        }
        response.set("Cache-Control","no-store");
        response.status(result.status==="blocked"?409:200)
          .json({ok:result.status!=="blocked",...result,
            ...(autoWaves002?{automaticWave}:{})});
      }catch(error){
        console.warn("Staging bulk response failed",String(error?.code||"unknown").slice(0,60));
        response.status(409).json({ok:false,error:"bulk_response_conflict"});
      }
    });
  // Read-only staging Admin preview of ALL eligible Volunteers in the first
  // available wave. Does NOT create assignments or notifications. Counts only.
  app.get("/api/admin/emergency-auto/e2e-002/bulk-preview",
    requireStagingAdmin,async(_request,response)=>{
      if(!stagingServiceAccountMatches)
        return response.status(503).json({ok:false,error:"isolated_staging_not_configured"});
      try {
        const caseSnap=await firestore.collection("disasterCases").doc(E2E_CASE_ID).get();
        if(!caseSnap.exists||!recognized(caseSnap.data()))
          return response.status(409).json({ok:false,error:"fictional_002_not_created"});
        const c={id:E2E_CASE_ID,...caseSnap.data()};
        const [apps,busy,existing,config]=await Promise.all([
          firestore.collection("volunteerApplications").where("status","==","approved").limit(201).get(),
          firestore.collection("responseAssignments")
            .where("status","in",["offered","accepted","responding","on_site"]).limit(201).get(),
          firestore.collection("responseAssignments").where("caseId","==",E2E_CASE_ID).limit(201).get(),
          firestore.collection("systemSettings").doc("emergencyVolunteerMatching").get()
        ]);
        if(apps.size>200||busy.size>200||existing.size>200)
          return response.status(409).json({ok:false,error:"audited_staging_pool_limit"});
        const roster=await Promise.all(apps.docs.map(async d=>{
          const application=d.data()||{};
          const uid=String(application.uid||application.userId||application.volunteerId||d.id);
          if(!/^[A-Za-z0-9_-]{1,160}$/.test(uid))return null;
          const u=await firestore.collection("users").doc(uid).get();
          return {uid,application,user:u.exists?u.data()||{}:{}};
        }));
        // Never pretend a barangay is nearby unless an approved SJDM-only
        // adjacency configuration exists and ALL entries are known SJDM areas.
        let neighbors={};
        const settings=config.exists?config.data()||{}:{};
        if(settings.enabled===true&&settings.approved===true&&
          settings.neighborsByBarangay&&typeof settings.neighborsByBarangay==="object"){
          const known=new Set(knownSJDMBgy.map(v=>String(v).toLowerCase()));
          const entries=Object.entries(settings.neighborsByBarangay);
          if(entries.every(([name,values])=>known.has(String(name).toLowerCase())&&
            Array.isArray(values)&&values.every(v=>known.has(String(v).toLowerCase()))))
            neighbors=Object.fromEntries(entries);
        }
        const outcome=chooseAllEligibleWave(c,roster.filter(Boolean),{
          knownBarangays:knownSJDMBgy,neighborsByBarangay:neighbors,
          activeAssignments:busy.docs.map(d=>d.data()),
          existingAssignments:existing.docs.map(d=>d.data())
        });
        response.set("Cache-Control","no-store");
        response.json({ok:true,status:outcome.action,wave:outcome.wave,
          eligibleInSelectedWave:outcome.volunteers.length,
          count:outcome.counts||{},willSendOffers:false,
          note:"Read-only preview. No Volunteer offers sent; multi-offer transactions and acceptance checks still required."});
      }catch(error){
        console.warn("Isolated 002 bulk readiness failed",String(error?.code||"unknown").slice(0,65));
        response.status(503).json({ok:false,error:"bulk_preview_unavailable"});
      }
    });
  // NEW separate fictional E2E 002. This does not create staging accounts,
  // touch 001, or activate autonomous emergency dispatch. Every write requires
  // an approved staging Admin with explicit consent.
  app.get("/api/admin/emergency-auto/e2e-002/preflight",requireStagingAdmin,
    async(_request,response)=>{
      if(!stagingServiceAccountMatches)
        return response.status(503).json({ok:false,error:"isolated_staging_not_configured"});
      try{
        const data=await inspectFreshTestCase(firestore);
        response.set("Cache-Control","no-store");
        response.json({ok:true,...data,caseId:E2E_CASE_ID});
      }catch(error){
        console.warn("Fresh staging test readiness unavailable",String(error?.code||"unknown").slice(0,65));
        response.status(503).json({ok:false,error:"e2e_002_preflight_unavailable"});
      }
    });
  // Read-only eligibility diagnosis for ONE fictional staging case only.
  // Authenticated approved staging Admin; never returns volunteer identities.
  app.get("/api/admin/emergency-auto/e2e-002/eligibility-summary",
    requireStagingAdmin,async(_request,response)=>{
      if(!stagingServiceAccountMatches)
        return response.status(503).json({ok:false,error:"isolated_staging_not_configured"});
      try{
        const result=await summarizeStaging002Eligibility(firestore);
        response.set("Cache-Control","no-store");
        response.status(result.status==="blocked"?409:200)
          .json({ok:result.status!=="blocked",...result});
      }catch(error){
        console.warn("Fictional staging 002 aggregate diagnosis failed",
          String(error?.code||"unknown").slice(0,60));
        response.status(503).json({ok:false,error:"staging_eligibility_summary_unavailable"});
      }
    });
  // Exact THREE synthetic staging Volunteers only; never accepts arbitrary
  // user identifiers, emails or case IDs. POST requires verified staging Admin.
  app.get("/api/admin/emergency-auto/e2e-002/test-volunteers",
    requireStagingAdmin,async(_request,response)=>{
      if(!stagingServiceAccountMatches)
        return response.status(503).json({ok:false,error:"isolated_staging_not_configured"});
      try{
        const result=await fixtureSummary({db:firestore,authClient,env});
        response.set("Cache-Control","no-store");
        response.status(result.status==="blocked"?409:200)
          .json({ok:result.status!=="blocked",...result});
      }catch(error){
        console.warn("Staging 002 test Volunteer status unavailable",
          String(error?.code||"unknown").slice(0,60));
        response.status(503).json({ok:false,error:"test_volunteer_fixture_status_unavailable"});
      }
    });
  app.post("/api/admin/emergency-auto/e2e-002/test-volunteers",
    requireStagingAdmin,requireActivation,async(request,response)=>{
      if(!stagingServiceAccountMatches)
        return response.status(503).json({ok:false,error:"isolated_staging_not_configured"});
      if(request.body?.caseId!==E2E_CASE_ID ||
         request.body?.confirmFictionalTestUsers!==true)
        return response.status(400).json({ok:false,error:"explicit_fictional_test_confirmation_required"});
      try{
        const result=await provisionFixtures({
          db:firestore,authClient,env,
          adminUid:response.locals.stagingAdminUid,
          passwords:request.body?.passwords
        });
        response.set("Cache-Control","no-store");
        response.status(result.status==="blocked"?409:200)
          .json({ok:result.status!=="blocked",...result});
      }catch(error){
        // Never log passwords, requests or user records.
        console.warn("Staging 002 test Volunteer setup unavailable",
          String(error?.code||"unknown").slice(0,60));
        response.status(503).json({ok:false,error:"test_volunteer_fixture_setup_unavailable"});
      }
    });
  function explicitFreshAction(action){
    return async(request,response)=>{
      if(request.body?.caseId!==E2E_CASE_ID ||
         request.body?.confirmFictionalTest!==true)
        return response.status(400).json({ok:false,error:"explicit_e2e_002_confirmation_required"});
      try{
        const result=await (action==="create"?
          createFreshTestCase(firestore,response.locals.stagingAdminUid):
          validateFreshTestCase(firestore,response.locals.stagingAdminUid));
        // A successful approved Admin validation is the ONLY trigger.
        // Retrying "already_validated" does not silently send new offers.
        // Never hide a successful validation if offer creation fails: report
        // the failed matching separately so the Admin knows it needs review.
        let automaticOffers={status:"disabled"};
        if(action==="validate" && result.status==="validated" &&
          bulk002OnValidation && stagingServiceAccountMatches){
          try{
            automaticOffers=await startBatchOffers(
              firestore,response.locals.stagingAdminUid);
          }catch(error){
            console.warn("Isolated 002 automatic fanout needs review",
              String(error?.code||"unknown").slice(0,70));
            automaticOffers={status:"blocked",reason:"staging_batch_offer_unavailable"};
          }
        }
        response.set("Cache-Control","no-store");
        response.status(result.status==="blocked"?409:200)
          .json({ok:result.status!=="blocked",...result,
            ...(action==="validate"?{automaticOffers}: {})});
      }catch(error){
        console.warn("Fresh staging 002 setup unavailable",
          String(error?.code||"unknown").slice(0,65));
        response.status(503).json({ok:false,error:"e2e_002_setup_unavailable"});
      }
    };
  }
  app.post("/api/admin/emergency-auto/e2e-002/create",
    requireStagingAdmin,requireActivation,explicitFreshAction("create"));
  app.post("/api/admin/emergency-auto/e2e-002/validate",
    requireStagingAdmin,requireActivation,explicitFreshAction("validate"));
  // Only TWO exact fictional case IDs. Never accept arbitrary report IDs.
  async function requireSyntheticFixture(request,response,next){
    const caseId=String(request.body?.caseId || "");
    if(!titleForCase(caseId)){
      return response.status(403).json({ok:false,error:"only_fixed_staging_test_case_allowed"});
    }
    try {
      const doc=await firestore.collection("disasterCases").doc(caseId).get();
      const data=doc.exists?doc.data():null;
      if(!data || data.title!==titleForCase(caseId) ||
         (caseId===E2E_CASE_ID && !recognized(data)) ||
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
  // Separate 002 reissue: only after expiry/decline, never accepted.
  app.post("/api/admin/emergency-auto/e2e-002/reissue",
    requireStagingAdmin,requireActivation,requireSyntheticFixture,
    async(request,response)=>{
      if(request.body?.caseId!==E2E_CASE_ID ||
         request.body?.confirmReissue!==true)
        return response.status(400).json({ok:false,error:"explicit_test_reissue_required"});
      try{
        const cleared=await resetExpiredFixture(firestore,Date.now(),E2E_CASE_ID);
        if(!["ready","reset"].includes(cleared.status))
          return response.status(409).json({ok:false,error:cleared.status});
        const result=await matcher.requestStart(E2E_CASE_ID);
        response.json({ok:true,...result,caseId:E2E_CASE_ID});
      }catch(error){
        console.warn("Fresh staging 002 reissue failed",String(error?.code||"unknown").slice(0,65));
        response.status(409).json({ok:false,error:"e2e_002_reissue_review_required"});
      }
    });
  app.post("/api/admin/emergency-auto/start",requireStagingAdmin,requireActivation,
    (request,response,next)=>{
      if(bulk002Enabled&&request.body?.caseId===E2E_CASE_ID)
        return response.status(409).json({ok:false,error:"use_isolated_bulk_test_endpoint"});
      next();
    },requireSyntheticFixture,action("start"));
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
