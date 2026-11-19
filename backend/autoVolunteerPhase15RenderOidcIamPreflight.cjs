"use strict";
/**
 * PHASE 15 — OFFLINE Render -> Google Cloud OIDC / IAM REVIEW CONTRACT.
 *
 * NO token reads, cloud calls, identity verification, IAM grants or deploy.
 * All values are UNTRUSTED review metadata; "plausible" is NOT an attestation.
 * Official Render docs: GCP managed OIDC requires Pro workspace or higher;
 * Render sets GOOGLE_APPLICATION_CREDENTIALS to a generated external_account
 * file, so Phases 12/13 must be separately reviewed for compatibility.
 */
const {
  FORBIDDEN_FIREBASE_PROJECTS,PROTECTED_RENDER_SERVICES
}=require("./autoVolunteerPhase11CloudIsolationGate.cjs");

const FORBIDDEN=new Set(FORBIDDEN_FIREBASE_PROJECTS);
const PROTECTED=new Set(PROTECTED_RENDER_SERVICES);
const SAFE_ROLES=new Set(["roles/datastore.viewer"]);
const valid=x=>typeof x==="string"&&x.length>0&&x.length<=180;
const firebaseProject=x=>valid(x)&&
  /^[a-z][a-z0-9-]{5,28}[a-z0-9]$/.test(x)&&
  !x.startsWith("demo-")&&!FORBIDDEN.has(x);
const renderId=x=>valid(x)&&/^srv-[a-z0-9]{12,40}$/.test(x)&&
  !PROTECTED.has(x);
const workspaceId=x=>valid(x)&&/^tea-[a-z0-9]{12,40}$/.test(x);
const envId=x=>x==="default"||
  (valid(x)&&/^evm-[a-z0-9]{12,40}$/.test(x));
const googleNumber=x=>valid(x)&&/^[1-9][0-9]{5,15}$/.test(x);
const poolId=x=>valid(x)&&/^[a-z][a-z0-9-]{3,30}[a-z0-9]$/.test(x);
const providerId=x=>valid(x)&&/^[a-z][a-z0-9-]{3,30}[a-z0-9]$/.test(x);
const asObject=x=>x&&typeof x==="object"&&!Array.isArray(x)?x:{};

function checkPhase15OidcReview(input={}){
  const p=asObject(input),e=asObject(p.evidence),
    config=asObject(p.credentialConfig),policy=asObject(p.iamProposal);
  const blockers=[];
  const requireProof=(condition,code)=>{if(!condition)blockers.push(code)};
  const project=p.firebaseProjectId,number=p.gcpProjectNumber;
  const service=p.renderServiceId,workspace=p.renderWorkspaceId;
  const environment=p.renderEnvironmentId,pool=p.poolId,provider=p.providerId;
  const resource="projects/"+String(number||"")+
    "/locations/global/workloadIdentityPools/"+String(pool||"")+
    "/providers/"+String(provider||"");
  const subject="workspace:"+String(workspace||"")+
    ":environment:"+String(environment||"")+
    ":service:"+String(service||"");

  requireProof(firebaseProject(project),
    "brand_new_isolated_firebase_project_required");
  requireProof(googleNumber(number),
    "independent_numeric_google_project_number_required");
  requireProof(renderId(service),
    "brand_new_render_service_required");
  requireProof(workspaceId(workspace)&&envId(environment),
    "render_workspace_environment_format_invalid");
  requireProof(e.renderProOrHigherIndependentlyConfirmed===true,
    "render_oidc_pro_entitlement_unconfirmed");
  requireProof(e.renderServiceOwnershipIndependentlyConfirmed===true,
    "render_service_ownership_unconfirmed");
  requireProof(e.firebaseProjectOwnershipIndependentlyConfirmed===true,
    "firebase_project_ownership_unconfirmed");
  requireProof(e.workspaceIssuerIndependentlyConfirmed===true,
    "render_workspace_issuer_unconfirmed");

  requireProof(poolId(pool)&&providerId(provider)&&
    p.gcpWorkloadProvider===resource,
    "dedicated_google_oidc_provider_binding_missing");
  requireProof(p.renderOidcIssuer==="https://oidc.render.com/"+workspace,
    "render_issuer_workspace_binding_mismatch");
  requireProof(valid(subject)&&!subject.includes("*")&&
    p.expectedOidcSubject===subject,
    "render_oidc_subject_must_select_one_service");

  // A Render-managed ADC config is NOT a service-account private key.
  // Never commit actual credential configs or tokens to this repository.
  requireProof(p.credentialDelivery==="render_managed_generated_adc"&&
    e.renderGeneratedConfigIndependentlyConfirmed===true,
    "render_generated_adc_provenance_unconfirmed");
  requireProof(config.type==="external_account"&&
    config.audience==="//iam.googleapis.com/"+resource&&
    config.subject_token_type==="urn:ietf:params:oauth:token-type:jwt"&&
    config.token_url==="https://sts.googleapis.com/v1/token",
    "external_account_sts_audience_mismatch");
  const credential=asObject(config.credential_source);
  requireProof(valid(credential.file)&&
    !credential.url&&!credential.executable&&!credential.environment_id,
    "render_managed_oidc_token_file_source_unverified");
  requireProof(!config.private_key&&!config.private_key_id&&
    !config.refresh_token&&!config.client_secret,
    "long_lived_secret_or_key_not_allowed");
  const intendedEmail=p.impersonatedServiceAccountEmail||"";
  if(intendedEmail){
    // This review supports DIRECT federated read-only access only.
    // Service-account impersonation requires separate review of the exact
    // iam.workloadIdentityUser binding and target service account roles.
    requireProof(false,"service_account_impersonation_requires_separate_iam_review");
    const emailOk=valid(intendedEmail)&&
      intendedEmail.endsWith("@"+String(project||"")+
        ".iam.gserviceaccount.com")&&
      /^[a-z][a-z0-9-]{4,28}[a-z0-9]@/.test(intendedEmail);
    requireProof(emailOk,
      "impersonated_service_account_outside_new_project");
    const expectedUrl="https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"+
      intendedEmail+":generateAccessToken";
    requireProof(config.service_account_impersonation_url===expectedUrl,
      "credential_impersonation_url_mismatch");
  }else{
    requireProof(!config.service_account_impersonation_url,
      "unapproved_service_account_impersonation");
  }
  // Exact individual Render service principal, not whole workspace/pool.
  const expectedPrincipal="principal://iam.googleapis.com/projects/"+
    String(number||"")+"/locations/global/workloadIdentityPools/"+
    String(pool||"")+"/subject/"+subject;
  requireProof(policy.member===expectedPrincipal,
    "iam_principal_must_bind_exact_render_service");
  requireProof(policy.targetProjectId===project,
    "iam_target_must_be_new_project_only");
  const roles=Array.isArray(policy.roles)?policy.roles:[];
  requireProof(roles.length>0&&
    roles.every(x=>SAFE_ROLES.has(x)),
    "reviewed_firestore_read_only_roles_only");
  requireProof(policy.allowProductionProjectAccess===false&&
    policy.allowHistoricalStagingProjectAccess===false,
    "no_cross_project_iam_evidence");

  // roles/datastore.viewer covers Firestore reads, NOT automatically
  // Firebase Auth checkRevoked user lookup or effective org IAM denies.
  // A static proposal can NEVER grant cloud deployment authorization.
  requireProof(e.effectiveIamPolicyIndependentlyAudited===true,
    "effective_iam_and_auth_revocation_permissions_unverified");
  requireProof(e.actualCloudAuthFirestoreCanaryPassed===true,
    "real_cloud_auth_and_read_only_canary_not_tested");
  requireProof(e.productionAndOldStagingDeniedProven===true,
    "cross_project_denial_tests_missing");
  return Object.freeze({
    status:blockers.length?"NO_GO":"HUMAN_REVIEW_REQUIRED",
    blockers:Object.freeze(blockers),
    renderOidcSupportedOnProOrHigher:true,
    existingPhase12And13CredentialGateNeedsReview:true,
    cloudResourcesCreated:false,actualIamReadPerformed:false,
    credentialsRead:false,deployAuthorized:false,dispatchEnabled:false,
    note:"Self-declared metadata cannot attest IAM, credential provenance, hosting plan or project ownership."
  });
}
module.exports={checkPhase15OidcReview};
