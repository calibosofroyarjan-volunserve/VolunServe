"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {checkPhase15OidcReview}
  =require("./autoVolunteerPhase15RenderOidcIamPreflight.cjs");
const {inspectPhase13StagingRuntime}
  =require("./autoVolunteerPhase13ReadOnlyCloudBootstrap.cjs");
const {getCloudStagingPreviewGate}
  =require("./autoVolunteerPhase12IsolatedCloudPreviewAdapter.js");

const PROJECT="volunserve-auto-phase15-qa";
const SERVICE="srv-phase15newsrv001";
const WORKSPACE="tea-daofh8v40ujc73f45li0";
const NUMBER="123456789012";
const POOL="phase15-oidc",PROVIDER="render-phase15";
const RESOURCE="projects/"+NUMBER+
  "/locations/global/workloadIdentityPools/"+POOL+"/providers/"+PROVIDER;
const SUBJECT="workspace:"+WORKSPACE+
  ":environment:default:service:"+SERVICE;
function good(){
  return {
    firebaseProjectId:PROJECT,gcpProjectNumber:NUMBER,
    renderServiceId:SERVICE,renderWorkspaceId:WORKSPACE,
    renderEnvironmentId:"default",poolId:POOL,providerId:PROVIDER,
    gcpWorkloadProvider:RESOURCE,
    renderOidcIssuer:"https://oidc.render.com/"+WORKSPACE,
    expectedOidcSubject:SUBJECT,
    credentialDelivery:"render_managed_generated_adc",
    credentialConfig:{
      type:"external_account",audience:"//iam.googleapis.com/"+RESOURCE,
      subject_token_type:"urn:ietf:params:oauth:token-type:jwt",
      token_url:"https://sts.googleapis.com/v1/token",
      credential_source:{file:"/var/lib/render/oidc/demo-generated-token"}
    },
    impersonatedServiceAccountEmail:"",
    iamProposal:{
      member:"principal://iam.googleapis.com/projects/"+NUMBER+
        "/locations/global/workloadIdentityPools/"+POOL+"/subject/"+SUBJECT,
      targetProjectId:PROJECT,
      roles:["roles/datastore.viewer"],
      allowProductionProjectAccess:false,
      allowHistoricalStagingProjectAccess:false
    },
    evidence:{
      renderProOrHigherIndependentlyConfirmed:true,
      renderServiceOwnershipIndependentlyConfirmed:true,
      firebaseProjectOwnershipIndependentlyConfirmed:true,
      workspaceIssuerIndependentlyConfirmed:true,
      renderGeneratedConfigIndependentlyConfirmed:true,
      effectiveIamPolicyIndependentlyAudited:true,
      actualCloudAuthFirestoreCanaryPassed:true,
      productionAndOldStagingDeniedProven:true
    }
  };
}
function blocked(p,reason){
  const result=checkPhase15OidcReview(p);
  assert.equal(result.status,"NO_GO",JSON.stringify(result.blockers));
  assert.ok(result.blockers.includes(reason),
    reason+": "+result.blockers.join(","));
  assert.equal(result.deployAuthorized,false);
  assert.equal(result.dispatchEnabled,false);
}
test("absent, invalid or incomplete metadata: absolutely NO-GO",()=>{
  for(const v of [undefined,null,[],{},true]){
    const r=checkPhase15OidcReview(v);
    assert.equal(r.status,"NO_GO");
    assert.ok(r.blockers.length>=12);
    assert.equal(r.credentialsRead,false);
    assert.equal(r.cloudResourcesCreated,false);
  }
});
test("existing production, accepted historical staging and emulator Firebase project rejected",()=>{
  for(const id of [
    "volunserve-3aa5b","volunserve-volunteer-staging",
    "demo-volunserve-auto-phase4"
  ]){
    const p=good();p.firebaseProjectId=id;
    blocked(p,"brand_new_isolated_firebase_project_required");
  }
});
test("existing production, staging backend, staging UI Render services rejected",()=>{
  for(const id of [
    "srv-daofqomk1f9s73btsg20","srv-dbsglle1egvs73dq7i8g",
    "srv-dbufki67bikc739qfmlg"
  ]){
    const p=good();p.renderServiceId=id;
    blocked(p,"brand_new_render_service_required");
  }
});
test("Render Pro-or-higher must be INDEPENDENTLY established, not guessed from service free plan",()=>{
  const p=good();
  p.evidence.renderProOrHigherIndependentlyConfirmed=false;
  blocked(p,"render_oidc_pro_entitlement_unconfirmed");
});
test("workspace issuer and single-service subject must match exact Render identity",()=>{
  for(const [key,value,code] of [
    ["renderOidcIssuer","https://oidc.render.com/tea-otherworkspace123",
      "render_issuer_workspace_binding_mismatch"],
    ["expectedOidcSubject","workspace:"+WORKSPACE+":*",
      "render_oidc_subject_must_select_one_service"],
    ["expectedOidcSubject","workspace:"+WORKSPACE+
      ":environment:default:service:srv-daofqomk1f9s73btsg20",
      "render_oidc_subject_must_select_one_service"],
    ["renderEnvironmentId","env-bad",
      "render_workspace_environment_format_invalid"]
  ]){
    const p=good();p[key]=value;blocked(p,code);
  }
});
test("dedicated provider uses numeric project number and exact GCP resource",()=>{
  for(const number of ["volunserve-auto-phase15-qa","1","abc",""]){
    const p=good();p.gcpProjectNumber=number;
    blocked(p,"independent_numeric_google_project_number_required");
  }
  const q=good();q.gcpWorkloadProvider="projects/old/locations/global/workloadIdentityPools/x/providers/y";
  blocked(q,"dedicated_google_oidc_provider_binding_missing");
});
test("OIDC external_account ADC must reference exact provider and Google STS",()=>{
  for(const [key,value] of [
    ["type","service_account"],
    ["audience","//iam.googleapis.com/projects/old/locations/global/workloadIdentityPools/x/providers/y"],
    ["token_url","https://attacker.example/token"],
    ["subject_token_type","urn:ietf:params:oauth:token-type:saml2"]
  ]){
    const p=good();p.credentialConfig[key]=value;
    blocked(p,"external_account_sts_audience_mismatch");
  }
});
test("no secret keys, remote/executable credential sources or unknown token format",()=>{
  const a=good();a.credentialConfig.private_key="-----BEGIN PRIVATE KEY-----";
  blocked(a,"long_lived_secret_or_key_not_allowed");
  const b=good();b.credentialConfig.credential_source={
    url:"https://attacker.invalid/file"
  };
  blocked(b,"render_managed_oidc_token_file_source_unverified");
  const c=good();c.credentialConfig.credential_source={
    executable:{command:"echo arbitrary"}
  };
  blocked(c,"render_managed_oidc_token_file_source_unverified");
});
test("managed ADC file origin is not proven by a matching JSON shape",()=>{
  const a=good();
  a.credentialDelivery="manually_uploaded_service_account_key";
  blocked(a,"render_generated_adc_provenance_unconfirmed");
  const b=good();
  b.evidence.renderGeneratedConfigIndependentlyConfirmed=false;
  blocked(b,"render_generated_adc_provenance_unconfirmed");
});
test("IAM principal must bind EXACT single Render service, not a pool or whole workspace",()=>{
  for(const member of [
    "principalSet://iam.googleapis.com/projects/"+NUMBER+
      "/locations/global/workloadIdentityPools/"+POOL+"/*",
    "principal://iam.googleapis.com/projects/"+NUMBER+
      "/locations/global/workloadIdentityPools/"+POOL+
      "/subject/workspace:"+WORKSPACE+":*",
    "allUsers",
    "serviceAccount:production@volunserve-3aa5b.iam.gserviceaccount.com"
  ]){
    const p=good();p.iamProposal.member=member;
    blocked(p,"iam_principal_must_bind_exact_render_service");
  }
});
test("Firestore viewer only; block Owner, Editor, broad write, Firebase Admin, Token Creator",()=>{
  for(const role of [
    "roles/owner","roles/editor","roles/datastore.user",
    "roles/datastore.admin","roles/firebase.admin",
    "roles/iam.serviceAccountTokenCreator"
  ]){
    const p=good();p.iamProposal.roles=[role];
    blocked(p,"reviewed_firestore_read_only_roles_only");
  }
});
test("IAM target must be NEW Firebase project, with zero cross-project permissions",()=>{
  const a=good();a.iamProposal.targetProjectId="volunserve-3aa5b";
  blocked(a,"iam_target_must_be_new_project_only");
  const b=good();b.iamProposal.allowProductionProjectAccess=true;
  blocked(b,"no_cross_project_iam_evidence");
  const c=good();c.iamProposal.allowHistoricalStagingProjectAccess=true;
  blocked(c,"no_cross_project_iam_evidence");
});
test("effective IAM, real cloud Auth revocation and negative access proof required",()=>{
  for(const [key,reason] of [
    ["effectiveIamPolicyIndependentlyAudited",
      "effective_iam_and_auth_revocation_permissions_unverified"],
    ["actualCloudAuthFirestoreCanaryPassed",
      "real_cloud_auth_and_read_only_canary_not_tested"],
    ["productionAndOldStagingDeniedProven",
      "cross_project_denial_tests_missing"]
  ]){
    const p=good();p.evidence[key]=false;blocked(p,reason);
  }
});
test("even self-declared perfect metadata ALWAYS demands human review; NEVER authorizes deploy",()=>{
  const r=checkPhase15OidcReview(good());
  assert.equal(r.status,"HUMAN_REVIEW_REQUIRED",
    JSON.stringify(r.blockers));
  assert.deepEqual(r.blockers,[]);
  assert.equal(r.deployAuthorized,false);
  assert.equal(r.dispatchEnabled,false);
  assert.equal(r.actualIamReadPerformed,false);
  assert.equal(r.credentialsRead,false);
  assert.equal(r.renderOidcSupportedOnProOrHigher,true);
  assert.equal(r.existingPhase12And13CredentialGateNeedsReview,true);
});
test("actual current Phase 12/13 code correctly refuses GOOGLE_APPLICATION_CREDENTIALS even when Render OIDC is enabled",()=>{
  const keys=[
    "VOLUNSERVE_PHASE13_BOOTSTRAP","VOLUNSERVE_PHASE13_STAGING_ONLY",
    "VOLUNSERVE_PHASE13_SERVICE_ID","VOLUNSERVE_PHASE13_STAGING_BRANCH",
    "VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT",
    "VOLUNSERVE_PHASE12_CLOUD_PREVIEW","VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW",
    "VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH","VOLUNSERVE_PHASE12_MODE",
    "RENDER_SERVICE_ID","GCLOUD_PROJECT","GOOGLE_CLOUD_PROJECT",
    "GOOGLE_APPLICATION_CREDENTIALS","GCP_WORKLOAD_IDENTITY_PROVIDER"
  ];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{
    Object.assign(process.env,{
      VOLUNSERVE_PHASE13_BOOTSTRAP:"readonly_candidate",
      VOLUNSERVE_PHASE13_STAGING_ONLY:"true",
      VOLUNSERVE_PHASE13_SERVICE_ID:SERVICE,
      VOLUNSERVE_PHASE13_STAGING_BRANCH:
        "candidate/auto-volunteer-cloud-phase15-new",
      VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT:PROJECT,
      VOLUNSERVE_PHASE12_CLOUD_PREVIEW:"enabled",
      VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW:"enabled",
      VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled",
      VOLUNSERVE_PHASE12_MODE:"new_isolated_read_only",
      RENDER_SERVICE_ID:SERVICE,GCLOUD_PROJECT:PROJECT,
      GOOGLE_CLOUD_PROJECT:PROJECT,
      GOOGLE_APPLICATION_CREDENTIALS:"/render/managed/oidc/adc.json",
      GCP_WORKLOAD_IDENTITY_PROVIDER:RESOURCE
    });
    const gate=inspectPhase13StagingRuntime();
    assert.equal(gate.allowed,false);
    assert.equal(gate.reason,"standalone_credentials_forbidden");
    const db={projectId:PROJECT,collection(){}};
    const auth={app:{options:{projectId:PROJECT}},verifyIdToken(){}};
    const phase12=getCloudStagingPreviewGate({db,authClient:auth});
    assert.equal(phase12.allowed,false);
    assert.ok(phase12.reasons.includes("standalone_service_account_files_not_approved"));
  }finally{
    for(const k of keys){
      if(previous[k]===undefined)delete process.env[k];
      else process.env[k]=previous[k];
    }
  }
});
test("module has zero cloud SDK, IO, scheduler or credential file reads",()=>{
  const source=fs.readFileSync(path.join(__dirname,
    "autoVolunteerPhase15RenderOidcIamPreflight.cjs"),"utf8");
  for(const marker of [
    "require(\"fs\")","readFileSync(", "initializeApp(",
    "firebase deploy", "render deploy", "grantIam(",
    "setInterval(", "runTransaction("
  ])assert.equal(source.includes(marker),false,marker);
});
