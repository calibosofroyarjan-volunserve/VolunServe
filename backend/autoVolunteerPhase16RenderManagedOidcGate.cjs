"use strict";
/**
 * PHASE 16: narrow, OFF-by-default Render-managed Google ADC compatibility
 * for an isolated READ-ONLY candidate. No Firebase initialization, IAM,
 * cloud calls, service-account access, OIDC token reading or deployment.
 *
 * Shape validation does NOT prove that Render issued the file, that a GCP
 * provider trusts its token, that effective IAM is restricted, or that the
 * Render workspace has Pro+ managed OIDC. These require independent audit.
 *
 * Reading an untrusted external_account config is intentionally limited to
 * a small non-symlink local file, with NO exec/URL token sources permitted.
 * Never output source filenames, JSON contents or tokens to clients/logs.
 */
const fs=require("node:fs");
const path=require("node:path");

const PROVIDER=/^projects\/[1-9][0-9]{5,15}\/locations\/global\/workloadIdentityPools\/[a-z][a-z0-9-]{3,30}[a-z0-9]\/providers\/[a-z][a-z0-9-]{3,30}[a-z0-9]$/;
const MAX_CONFIG=16384;
const MAX_TOKEN_SIZE=8192;
const blocked=reason=>Object.freeze({
  allowed:false,reason,readOnly:true,dispatchEnabled:false,
  provenRenderOrigin:false,provenCloudIam:false
});
function ownedSafeFile(filename,maxBytes,needNonempty){
  if(typeof filename!=="string"||filename.length<2||
     filename.length>1024||filename.includes("\0")||
     !path.isAbsolute(filename))return null;
  let fd;
  let transfer=false;
  try{
    const normalized=path.normalize(filename);
    if(normalized!==filename||
       fs.realpathSync(filename)!==normalized)return null;
    // O_NOFOLLOW avoids opening a final-component symlink. Explicit
    // realpath equality above also rules out symlinked parent components.
    fd=fs.openSync(filename,fs.constants.O_RDONLY|
      (fs.constants.O_NOFOLLOW||0));
    const st=fs.fstatSync(fd);
    if(!st.isFile()||st.size>maxBytes||
      (needNonempty&&st.size===0)||(st.mode&0o022)!==0)
      return null;
    if(typeof process.getuid==="function"&&
      st.uid!==process.getuid()&&st.uid!==0)return null;
    transfer=true;
    return {fd,bytes:st.size};
  }catch(_e){return null}
  finally{
    // Never leak a descriptor on a failed stat/mode/owner check.
    if(!transfer&&fd!==undefined){
      try{fs.closeSync(fd)}catch(_e){}
    }
  }
}
function readSafeConfig(filename){
  const handle=ownedSafeFile(filename,MAX_CONFIG,true);
  if(!handle)return null;
  try{
    const raw=fs.readFileSync(handle.fd,{encoding:"utf8"});
    if(Buffer.byteLength(raw,"utf8")!==handle.bytes)return null;
    const parsed=JSON.parse(raw);
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?
      parsed:null;
  }catch(_e){return null}
  finally{try{fs.closeSync(handle.fd)}catch(_e){}}
}
function inspectPhase16RenderManagedOidc({
  env=process.env
}={}){
  if(env!==process.env)
    return blocked("actual_runtime_environment_required");
  if(env?.VOLUNSERVE_PHASE16_RENDER_OIDC_MODE!=="schema_review_only"||
    env?.VOLUNSERVE_PHASE16_DIRECT_FEDERATION_ONLY!=="true")
    return blocked("managed_oidc_off_by_default");
  if(env?.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH!=="disabled"||
    env?.VOLUNSERVE_PHASE12_MODE!=="new_isolated_read_only"||
    env?.VOLUNSERVE_PHASE14_ALLOW_WRITES==="enabled")
    return blocked("read_only_mode_required");
  if(env?.FIREBASE_SERVICE_ACCOUNT_JSON||
    env?.GOOGLE_CLOUD_KEYFILE_JSON||
    env?.GOOGLE_CLOUD_CREDENTIALS||
    env?.GCP_SERVICE_ACCOUNT_EMAIL)
    return blocked("private_key_or_impersonation_forbidden");
  if(env?.FIRESTORE_EMULATOR_HOST||env?.FIREBASE_AUTH_EMULATOR_HOST)
    return blocked("no_emulator_oidc_mix");
  const provider=env?.GCP_WORKLOAD_IDENTITY_PROVIDER;
  if(typeof provider!=="string"||!PROVIDER.test(provider)||
     env?.VOLUNSERVE_PHASE16_EXPECTED_WIF_PROVIDER!==provider)
    return blocked("dedicated_wif_provider_pin_mismatch");

  const filepath=env?.GOOGLE_APPLICATION_CREDENTIALS;
  const config=readSafeConfig(filepath);
  if(!config)return blocked("adc_config_unreadable_or_unsafe");
  if(config.type!=="external_account"||
    config.audience!=="//iam.googleapis.com/"+provider||
    config.subject_token_type!=="urn:ietf:params:oauth:token-type:jwt"||
    config.token_url!=="https://sts.googleapis.com/v1/token")
    return blocked("invalid_external_account_provider_or_sts");
  if(config.service_account_impersonation_url||
    config.private_key||config.private_key_id||
    config.refresh_token||config.client_secret||
    config.credential_source?.url||
    config.credential_source?.executable||
    config.credential_source?.environment_id||
    config.credential_source?.headers||
    config.workforce_pool_user_project||
    config.quota_project_id)
    return blocked("unapproved_secret_source_or_impersonation");
  const source=config.credential_source;
  if(!source||typeof source!=="object"||Array.isArray(source)||
    Object.keys(source).some(x=>!["file","format"].includes(x))||
    (source.format&&(
      typeof source.format!=="object"||
      source.format.type!=="text"||
      Object.keys(source.format).some(x=>x!=="type")
    )))
    return blocked("local_token_source_only");
  // Do not read, decode, log or cache Render's actual OIDC token.
  const token=ownedSafeFile(source.file,MAX_TOKEN_SIZE,true);
  if(!token)return blocked("unsafe_or_missing_local_oidc_token_source");
  try{fs.closeSync(token.fd)}catch(_e){}
  // Check that the app, user-provided project and Google ADC runtime
  // project labels agree. These remain self-declared runtime assertions.
  const project=env?.VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT;
  if(typeof project!=="string"||
    env?.GCLOUD_PROJECT!==project||
    (env?.GOOGLE_CLOUD_PROJECT&&env.GOOGLE_CLOUD_PROJECT!==project))
    return blocked("firebase_project_binding_mismatch");

  return Object.freeze({
    allowed:true,reason:null,readOnly:true,dispatchEnabled:false,
    mode:"render_external_account_config_shape_only",
    provenRenderOrigin:false,provenCloudIam:false,
    automaticDispatchAuthorized:false,
    note:"File shape alone does not attest Render provenance, OIDC issuer/sub, GCP IAM or release approval."
  });
}
module.exports={inspectPhase16RenderManagedOidc};
