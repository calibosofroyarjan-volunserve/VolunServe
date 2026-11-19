"use strict";
/**
 * PHASE 13 — UNMOUNTED dedicated-cloud STAGING bootstrap candidate.
 *
 * - NO Firebase initialization on import or preflight failure.
 * - NO networking or listen(), POST, writes, job scheduler, or deployment.
 * - Future externally approved deployment: use ambient workload identity
 *   (applicationDefault) on a BRAND NEW, independently verified project and
 *   Render service. Never use the live or accepted historical staging.
 * - These process flags are defense in depth, NOT attestation of IAM,
 *   project ownership, least privilege, or release approval.
 * - Only the Phase 12 read-only HTTP app can be constructed.
 */
const {
  FORBIDDEN_FIREBASE_PROJECTS,
  PROTECTED_RENDER_SERVICES,
  PROTECTED_BRANCHES
}=require("./autoVolunteerPhase11CloudIsolationGate.cjs");
const {
  getCloudStagingPreviewGate,
  createPhase12IsolatedCloudReadOnlyApp
}=require("./autoVolunteerPhase12IsolatedCloudPreviewAdapter");

const FORBIDDEN=new Set(FORBIDDEN_FIREBASE_PROJECTS);
const EXISTING_SERVICES=new Set(PROTECTED_RENDER_SERVICES);
const KNOWN_BRANCHES=new Set(PROTECTED_BRANCHES);
const safeId=x=>typeof x==="string"&&/^[a-z][a-z0-9-]{5,28}[a-z0-9]$/.test(x)&&
  !x.startsWith("demo-")&&!FORBIDDEN.has(x);
const safeService=x=>typeof x==="string"&&/^srv-[a-z0-9]{12,40}$/.test(x)&&
  !EXISTING_SERVICES.has(x);
const safeBranch=x=>typeof x==="string"&&
  x.startsWith("candidate/auto-volunteer-cloud-")&&x.length<130&&
  /^[a-z0-9][a-z0-9_/-]+$/.test(x)&&!KNOWN_BRANCHES.has(x);
const fail=reason=>Object.freeze({
  allowed:false,reason,readOnly:true,dispatchEnabled:false,
  cloudProjectIndependentlyVerified:false,deployAuthorized:false
});

/**
 * The ONLY allowed startup mode is an explicitly named, isolated staging
 * service with matching service/project labels and no access to standalone
 * production credentials. No cloud calls or Firebase imports in this check.
 */
function inspectPhase13StagingRuntime({env=process.env}={}){
  if(env!==process.env)
    return fail("actual_runtime_environment_required");
  if(env?.VOLUNSERVE_PHASE13_BOOTSTRAP!=="readonly_candidate")
    return fail("bootstrap_off_by_default");
  if(env?.VOLUNSERVE_PHASE13_STAGING_ONLY!=="true")
    return fail("dedicated_staging_only_required");
  if(env?.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH!=="disabled"||
     env?.VOLUNSERVE_PHASE12_CLOUD_PREVIEW!=="enabled"||
     env?.VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW!=="enabled"||
     env?.VOLUNSERVE_PHASE12_MODE!=="new_isolated_read_only")
    return fail("read_only_preview_flags_required");
  const project=env?.VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT;
  if(!safeId(project))
    return fail("new_independent_firebase_project_required");
  if(env?.GCLOUD_PROJECT!==project||
    (env?.GOOGLE_CLOUD_PROJECT&&env.GOOGLE_CLOUD_PROJECT!==project))
    return fail("cloud_project_binding_mismatch");
  if(env?.FIREBASE_AUTH_EMULATOR_HOST||env?.FIRESTORE_EMULATOR_HOST)
    return fail("emulator_runtime_forbidden");
  if(env?.FIREBASE_SERVICE_ACCOUNT_JSON||env?.GOOGLE_APPLICATION_CREDENTIALS||
     env?.GOOGLE_CLOUD_KEYFILE_JSON||env?.GOOGLE_CLOUD_CREDENTIALS)
    return fail("standalone_credentials_forbidden");
  if(!safeService(env?.RENDER_SERVICE_ID)||
     env?.VOLUNSERVE_PHASE13_SERVICE_ID!==env.RENDER_SERVICE_ID)
    return fail("brand_new_render_service_binding_required");
  if(!safeBranch(env?.VOLUNSERVE_PHASE13_STAGING_BRANCH))
    return fail("dedicated_candidate_branch_required");
  // Render does not guarantee a universal env variable that attests to
  // autoDeploy OFF or branch. Source values are NOT external proof.
  return Object.freeze({
    allowed:true,reason:null,readOnly:true,dispatchEnabled:false,
    cloudProjectIndependentlyVerified:false,deployAuthorized:false
  });
}
class Phase13BootstrapRefusal extends Error {
  constructor(code){
    super("Phase 13 dedicated read-only bootstrap refused");
    this.name="Phase13BootstrapRefusal";this.code=code;
  }
}
const reject=code=>{throw new Phase13BootstrapRefusal(code)};

/**
 * Firebase Admin SDK injection enables fully offline contract tests:
 * sdk = {
 *   app: {getApps,initializeApp,applicationDefault,deleteApp},
 *   auth: {getAuth}, firestore: {getFirestore}
 * }
 * Real SDK modules are required ONLY after the preflight gate has passed.
 * Caller is responsible for using this ONLY in a separately approved
 * new isolated cloud staging deployment with IAM review.
 */
async function createPhase13ReadOnlyCloudCandidate({
  env=process.env,sdk
}={}){
  const preflight=inspectPhase13StagingRuntime({env});
  if(!preflight.allowed)reject(preflight.reason);
  let deps=sdk;
  if(!deps){
    deps={
      app:require("firebase-admin/app"),
      auth:require("firebase-admin/auth"),
      firestore:require("firebase-admin/firestore")
    };
  }
  if(!deps?.app||!deps.auth||!deps.firestore||
     typeof deps.app.getApps!=="function"||
     typeof deps.app.applicationDefault!=="function"||
     typeof deps.app.initializeApp!=="function"||
     typeof deps.app.deleteApp!=="function"||
     typeof deps.auth.getAuth!=="function"||
     typeof deps.firestore.getFirestore!=="function")
    reject("firebase_admin_sdk_dependency_invalid");
  // This bootstrap must not be mixed with an existing default Production or
  // historical staging Firebase app. A new, isolated service owns ONE app.
  if(deps.app.getApps().length!==0)
    reject("preexisting_firebase_apps_forbidden");
  const project=env.VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT;
  const name="phase13-readonly-"+project;
  let app;
  try{
    app=deps.app.initializeApp({
      credential:deps.app.applicationDefault(),projectId:project
    },name);
    if(!app||app.name!==name||app.options?.projectId!==project)
      reject("initialized_firebase_app_project_mismatch");
    const authClient=deps.auth.getAuth(app);
    const db=deps.firestore.getFirestore(app);
    if(authClient?.app!==app)
      reject("auth_not_bound_to_dedicated_app");
    if(db?.projectId!==project)
      reject("firestore_not_bound_to_dedicated_project");
    const existing=getCloudStagingPreviewGate({db,authClient,env});
    if(!existing.allowed)reject("phase12_read_only_gate_rejected");
    const webApp=createPhase12IsolatedCloudReadOnlyApp({db,authClient,env});
    return Object.freeze({
      httpApp:webApp,
      mode:"isolated-read-only-staging",
      readOnly:true,dispatchEnabled:false,autoSchedulerEnabled:false,
      cloudDeployed:false,cloudIAMAttested:false,
      // No port/listener is ever opened here. The cloud release owner must
      // do an independently reviewed explicit staging deploy.
      async close(){await deps.app.deleteApp(app);}
    });
  }catch(error){
    if(app){
      try{await deps.app.deleteApp(app)}catch(_ignored){}
    }
    if(error instanceof Phase13BootstrapRefusal)throw error;
    // Never put ADC secret contents, Firestore backend errors or a project
    // credential path into a thrown message / application log.
    reject("firebase_admin_candidate_initialization_failed");
  }
}
module.exports={
  inspectPhase13StagingRuntime,
  createPhase13ReadOnlyCloudCandidate,
  Phase13BootstrapRefusal
};
