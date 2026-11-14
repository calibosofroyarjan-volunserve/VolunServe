"use strict";
/**
 * Authorized staging operator only, read-only Firebase Auth + Firestore check:
 *
 *   VOLUNSERVE_STAGING_STRICT=1 VOLUNSERVE_DEPLOYMENT_ENV=staging \
 *     FIREBASE_SERVICE_ACCOUNT_JSON=<from-approved-secret-manager> \
 *     node backend/scripts/check-staging-admin-account.cjs --email=account@example.org
 *
 * No IDENTITY_AI_* variables are required for account readiness checks.
 * This is NOT a login shortcut, user invitation, role grant or Admin approval.
 * NEVER paste a Firebase service-account key, access token, password, UID,
 * or real applicant's ID/selfie into ChatGPT, tickets or GitHub.
 */
const {
  assertStagingAccessOnly, classifyStagingAdminAccess,
} = require("../stagingAdminAccessPreflight");

const args=process.argv.slice(2);
const emailArgs=args.filter(x=>/^--email=/.test(x));
if(args.length!==1 || emailArgs.length!==1){
  console.error("USAGE: node backend/scripts/check-staging-admin-account.cjs --email=<staging-account-email>");
  process.exit(2);
}
const email=emailArgs[0].slice(8).trim().toLowerCase();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254){
  console.error("STAGING_ADMIN_PREFLIGHT_BLOCKED: invalid email input");
  process.exit(2);
}

async function main(){
  // Strict project flags, matching service-account project and no emulators:
  // all checked BEFORE importing the SDK, initializing Firebase or accessing
  // any real user. This prevents silent production/Google ADC fallbacks.
  const projectId=assertStagingAccessOnly(process.env);
  // A full backend import would demand the AI private key and network config
  // just to ask whether a staging Admin can log in. A separate named,
  // explicitly scoped app avoids that unnecessary dependency.
  const {initializeApp,cert,deleteApp}=require("firebase-admin/app");
  const {getAuth}=require("firebase-admin/auth");
  const {getFirestore}=require("firebase-admin/firestore");
  let app;
  try {
    const secret=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if(secret.project_id!==projectId){
      throw Error("STAGING_ADMIN_PREFLIGHT_BLOCKED: SDK project mismatch");
    }
    if(typeof secret.private_key==="string"){
      secret.private_key=secret.private_key.replace(/\\n/g,"\n");
    }
    app=initializeApp({
      credential:cert(secret), projectId,
    },"volunserve-staging-admin-access-preflight");
    if(app.options.projectId!==projectId){
      throw Error("STAGING_ADMIN_PREFLIGHT_BLOCKED: SDK project mismatch");
    }
    const auth=getAuth(app),db=getFirestore(app);
    let account;
    try{
      account=await auth.getUserByEmail(email);
    }catch(error){
      if(error?.code==="auth/user-not-found"){
        console.log("STAGING_ADMIN_ACCESS=AUTH_ACCOUNT_NOT_FOUND");
        return;
      }
      throw Error("STAGING_ADMIN_PREFLIGHT_BLOCKED: Auth lookup unavailable");
    }
    const doc=await db.collection("users").doc(account.uid).get();
    const profile=doc.exists?{...(doc.data()||{}),uid:doc.id}:null;
    // Print only a fixed diagnostic code. Never log identities, keys, token,
    // Firestore profile fields, Firebase response bodies or stack traces.
    console.log("STAGING_ADMIN_ACCESS="+classifyStagingAdminAccess(account,profile));
  }finally{
    if(app)await deleteApp(app);
  }
}

main().catch(error=>{
  const message=String(error?.message||"");
  if(message.startsWith("STAGING_ADMIN_PREFLIGHT_BLOCKED:")){
    console.error(message);
  }else{
    console.error("STAGING_ADMIN_PREFLIGHT_BLOCKED: staging Auth/profile check unavailable");
  }
  process.exitCode=1;
});
