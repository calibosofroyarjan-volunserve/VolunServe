"use strict";
/**
 * Inspects the REAL combined candidate firebaseAdmin.js startup function
 * with stub Firebase SDK modules. Never creates a Firebase network client.
 * Secrets/IDs are all fake and local; no production or staging records touched.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const base = path.join(__dirname,"backend");
const firebaseAdminSource = fs.readFileSync(path.join(base,"firebaseAdmin.js"),"utf8");
const {assertOriginalAiStagingIsolation} =
  require(path.join(base,"stagingOriginalAiIsolationPolicy.js"));
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
const stagingKey = "local-synthetic-original-ai-private-key-staging-20261125";
const productionKey = "local-synthetic-original-ai-private-key-production-20261125";
const stageCloudinaryKey = "DUMMY-STAGING-API-KEY";
const stageCloudinarySecret = "DUMMY-STAGING-API-SECRET";
const productionCloudinaryKey = "DUMMY-PRODUCTION-API-KEY";
const productionCloudinarySecret = "DUMMY-PRODUCTION-API-SECRET";
const stagingFirebasePrivateKey = "DUMMY-STAGING-FIREBASE-PRIVATE-KEY-NOT-REAL";
const productionFirebasePrivateKey = "DUMMY-PRODUCTION-FIREBASE-PRIVATE-KEY-NOT-REAL";
const fakeServiceAccount = {
  type:"service_account",
  project_id:"demo-safe-staging-project",
  client_email:"firebase-adminsdk-demo@demo-safe-staging-project.iam.gserviceaccount.com",
  private_key:stagingFirebasePrivateKey
};
const baseEnv = {
  RENDER_SERVICE_NAME:"volunserve-backend-staging",
  VOLUNSERVE_DEPLOYMENT_ENV:"staging",
  VOLUNSERVE_STAGING_STRICT:"true",
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify(fakeServiceAccount),
  VOLUNSERVE_STAGING_FIREBASE_PRIVATE_KEY_SHA256:sha(stagingFirebasePrivateKey),
  VOLUNSERVE_PRODUCTION_FIREBASE_PRIVATE_KEY_SHA256:sha(productionFirebasePrivateKey),
  VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:fakeServiceAccount.project_id,
  IDENTITY_AI_SERVICE_URL:"https://volunserve-identity-ai-staging.onrender.com",
  VOLUNSERVE_STAGING_CLOUDINARY_CLOUD_NAME:"demo-isolated-cloud",
  CLOUDINARY_CLOUD_NAME:"demo-isolated-cloud",
  CLOUDINARY_API_KEY:stageCloudinaryKey,
  CLOUDINARY_API_SECRET:stageCloudinarySecret,
  VOLUNSERVE_STAGING_CLOUDINARY_API_KEY_SHA256:sha(stageCloudinaryKey),
  VOLUNSERVE_PRODUCTION_CLOUDINARY_API_KEY_SHA256:sha(productionCloudinaryKey),
  VOLUNSERVE_STAGING_CLOUDINARY_API_SECRET_SHA256:sha(stageCloudinarySecret),
  VOLUNSERVE_PRODUCTION_CLOUDINARY_API_SECRET_SHA256:sha(productionCloudinarySecret),
  IDENTITY_AI_INTERNAL_KEY:stagingKey,
  VOLUNSERVE_STAGING_INTERNAL_KEY_SHA256:sha(stagingKey),
  VOLUNSERVE_PRODUCTION_INTERNAL_KEY_SHA256:sha(productionKey)
};
let passed=0;
function pass(text){passed++;console.log("PASS:",text);}
function execute(extra={},existingApp=null) {
  const env={...baseEnv,...extra};
  let initialization=0, authCalls=0,dbCalls=0;
  const accounts=existingApp?[existingApp]:[];
  const mocks={
    "firebase-admin/app":{
      initializeApp:(options)=>{
        initialization++;
        const projectId=options?.credential?.project_id;
        return {options:{projectId}};
      },
      applicationDefault:()=>({type:"application-default"}),
      cert:serviceAccount=>({project_id:serviceAccount.project_id}),
      getApps:()=>accounts
    },
    "firebase-admin/auth":{getAuth:()=>{authCalls++;return {local:true};}},
    "firebase-admin/firestore":{
      getFirestore:()=>{dbCalls++;return {local:true};},
      FieldValue:{serverTimestamp:()=>0}
    },
    "./stagingOriginalAiIsolationPolicy":{assertOriginalAiStagingIsolation}
  };
  const module={exports:{}};
  const run=()=>vm.runInNewContext(firebaseAdminSource,{
    require(name){
      assert.ok(Object.prototype.hasOwnProperty.call(mocks,name),
        "Forbid unknown library import "+name);
      return mocks[name];
    },
    module,process:{env},console
  },{filename:"firebaseAdmin.guarded.test.cjs",timeout:500});
  try{
    run();
    return {ok:true,initialization,authCalls,dbCalls,app:module.exports.app};
  }catch(e){
    assert.match(String(e.message),/staging isolation blocked/);
    return {ok:false,initialization,authCalls,dbCalls,error:String(e.message)};
  }
}
function blocked(label,env,existingApp=null){
  const result=execute(env,existingApp);
  assert.equal(result.ok,false,"Expected block: "+label);
  assert.equal(result.initialization,0,"Unexpected initialization for "+label);
  assert.equal(result.authCalls,0,"getAuth called before block for "+label);
  assert.equal(result.dbCalls,0,"getFirestore called before block for "+label);
  pass(label);
}
let r=execute();
assert.equal(r.ok,true);
assert.equal(r.initialization,1);
assert.equal(r.authCalls,1);
assert.equal(r.dbCalls,1);
pass("Proper synthetic staging Firebase account initializes only after guard");
blocked("Preinitialized app with correct staging project label is rejected; label cannot attest credential",{},
  {options:{projectId:fakeServiceAccount.project_id}});
blocked("Preinitialized app with correct staging label but production credential is rejected",{},
  {options:{projectId:fakeServiceAccount.project_id,
    credential:{projectId:"volunserve-3aa5b"}}});
blocked("Preinitialized app with correct staging label but opaque credential is rejected",{},
  {options:{projectId:fakeServiceAccount.project_id,
    credential:{type:"application-default"}}});
blocked("Existing Firebase app with production project is rejected",{},
  {options:{projectId:"volunserve-3aa5b"}});
blocked("Existing Firebase app without project ID is rejected",{},
  {options:{}});
blocked("Existing Firebase app with another staging project is rejected",{},
  {options:{projectId:"demo-another-staging-project"}});
blocked("Staging service missing strict flag is rejected",{VOLUNSERVE_STAGING_STRICT:""});
blocked("Staging service missing explicit deployment flag is rejected",{VOLUNSERVE_DEPLOYMENT_ENV:""});
blocked("Staging missing service account is rejected",{FIREBASE_SERVICE_ACCOUNT_JSON:""});
blocked("Staging with declared production Firebase project rejected",{
  VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:"volunserve-3aa5b"
});
blocked("Staging service account pointing to production rejected",{
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:"volunserve-3aa5b"})
});
blocked("Staging Firebase project declaration mismatch rejected",{
  VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:"demo-other-project"
});
blocked("Staging Firebase account missing service_account type is rejected",{
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({...fakeServiceAccount,type:""})
});
blocked("Staging Firebase account email from production project is rejected",{
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
    ...fakeServiceAccount,client_email:"firebase-adminsdk-demo@volunserve-3aa5b.iam.gserviceaccount.com"
  })
});
blocked("Staging Firebase account missing private key is rejected",{
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({...fakeServiceAccount,private_key:""})
});
blocked("Missing staging Firebase private-key fingerprint is rejected",{
  VOLUNSERVE_STAGING_FIREBASE_PRIVATE_KEY_SHA256:""
});
blocked("Missing production Firebase private-key fingerprint is rejected",{
  VOLUNSERVE_PRODUCTION_FIREBASE_PRIVATE_KEY_SHA256:""
});
blocked("Malformed staging Firebase private-key fingerprint is rejected",{
  VOLUNSERVE_STAGING_FIREBASE_PRIVATE_KEY_SHA256:"incorrect"
});
blocked("Staging Firebase private key differs from attested staging private key",{
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
    ...fakeServiceAccount,private_key:"DUMMY-UNATTESTED-FIREBASE-PRIVATE-KEY"
  })
});
blocked("Production Firebase private key relabelled as staging is rejected",{
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
    ...fakeServiceAccount,private_key:productionFirebasePrivateKey
  }),
  VOLUNSERVE_STAGING_FIREBASE_PRIVATE_KEY_SHA256:sha(productionFirebasePrivateKey)
});
blocked("Identical staging and production Firebase private-key fingerprints are rejected",{
  VOLUNSERVE_PRODUCTION_FIREBASE_PRIVATE_KEY_SHA256:sha(stagingFirebasePrivateKey)
});
blocked("Staging Node pointed at production Python rejected",{
  IDENTITY_AI_SERVICE_URL:"https://volunserve-identity-ai.onrender.com"
});
blocked("Staging Node pointed at production Cloudinary rejected",{
  CLOUDINARY_CLOUD_NAME:"netjawtz",
  VOLUNSERVE_STAGING_CLOUDINARY_CLOUD_NAME:"netjawtz"
});
blocked("Staging missing Cloudinary secret rejected",{
  CLOUDINARY_API_SECRET:""
});
blocked("Staging missing internal API key rejected",{
  IDENTITY_AI_INTERNAL_KEY:""
});
blocked("Missing staging Cloudinary API key fingerprint is rejected",{
  VOLUNSERVE_STAGING_CLOUDINARY_API_KEY_SHA256:""
});
blocked("Missing production Cloudinary API key fingerprint is rejected",{
  VOLUNSERVE_PRODUCTION_CLOUDINARY_API_KEY_SHA256:""
});
blocked("Missing staging Cloudinary API secret fingerprint is rejected",{
  VOLUNSERVE_STAGING_CLOUDINARY_API_SECRET_SHA256:""
});
blocked("Missing production Cloudinary API secret fingerprint is rejected",{
  VOLUNSERVE_PRODUCTION_CLOUDINARY_API_SECRET_SHA256:""
});
blocked("Invalid staging Cloudinary key fingerprint is rejected",{
  VOLUNSERVE_STAGING_CLOUDINARY_API_KEY_SHA256:"not-a-sha256"
});
blocked("Invalid production Cloudinary secret fingerprint is rejected",{
  VOLUNSERVE_PRODUCTION_CLOUDINARY_API_SECRET_SHA256:"0".repeat(10)
});
blocked("Staging Cloudinary API key does not match pinned staging fingerprint",{
  CLOUDINARY_API_KEY:"DUMMY-KEY-NOT-MATCHING-APPROVED-STAGE-KEY"
});
blocked("Staging Cloudinary API secret does not match pinned staging fingerprint",{
  CLOUDINARY_API_SECRET:"DUMMY-SECRET-NOT-MATCHING-APPROVED-STAGE-SECRET"
});
blocked("Cloudinary API key reused from production is denied even with stage cloud name",{
  CLOUDINARY_API_KEY:productionCloudinaryKey,
  VOLUNSERVE_STAGING_CLOUDINARY_API_KEY_SHA256:sha(productionCloudinaryKey)
});
blocked("Cloudinary API secret reused from production is denied even with stage cloud name",{
  CLOUDINARY_API_SECRET:productionCloudinarySecret,
  VOLUNSERVE_STAGING_CLOUDINARY_API_SECRET_SHA256:sha(productionCloudinarySecret)
});
blocked("Production Cloudinary key fingerprint equal to staging is denied",{
  VOLUNSERVE_PRODUCTION_CLOUDINARY_API_KEY_SHA256:sha(stageCloudinaryKey)
});
blocked("Production Cloudinary secret fingerprint equal to staging is denied",{
  VOLUNSERVE_PRODUCTION_CLOUDINARY_API_SECRET_SHA256:sha(stageCloudinarySecret)
});

blocked("Staging Cloudinary URL could override selected cloud and credentials",{
  CLOUDINARY_URL:"cloudinary://SYNTHETIC_KEY:SYNTHETIC_SECRET@netjawtz"
});
blocked("Staging implicit Google Application Credentials file is rejected",{
  GOOGLE_APPLICATION_CREDENTIALS:"/synthetic/prod-service-account-not-a-file.json"
});
blocked("Staging implicit FIREBASE_CONFIG override is rejected",{
  FIREBASE_CONFIG:JSON.stringify({projectId:"volunserve-3aa5b"})
});
blocked("Staging conflicting GOOGLE_CLOUD_PROJECT is rejected",{
  GOOGLE_CLOUD_PROJECT:"volunserve-3aa5b"
});
blocked("Staging conflicting GCLOUD_PROJECT is rejected",{
  GCLOUD_PROJECT:"volunserve-3aa5b"
});
blocked("Staging carrying reused production private key fingerprint rejected",{
  VOLUNSERVE_PRODUCTION_INTERNAL_KEY_SHA256:sha(stagingKey)
});
blocked("Staging sharing declared fingerprint but wrong raw key rejected",{
  IDENTITY_AI_INTERNAL_KEY:"some-different-fake-key-with-at-least-32-characters"
});
// Matching optional Google project labels are permitted: this is only
// consistency screening, NOT cryptographic provider account ownership proof.
r=execute({
  GOOGLE_CLOUD_PROJECT:fakeServiceAccount.project_id,
  GCLOUD_PROJECT:fakeServiceAccount.project_id
});
assert.equal(r.ok,true);
assert.equal(r.initialization,1);
pass("Staging tolerates matching optional Google project labels");

// Ensure an unchanged production service does not suddenly require staging
// settings or staging credentials.
r=execute({
  RENDER_SERVICE_NAME:"volunserve-backend",
  VOLUNSERVE_DEPLOYMENT_ENV:"production",
  VOLUNSERVE_STAGING_STRICT:"",
  FIREBASE_SERVICE_ACCOUNT_JSON:""
});
assert.equal(r.ok,true);
assert.equal(r.initialization,1);
pass("Unchanged production startup remains backwards compatible");
r=execute({
  RENDER_SERVICE_NAME:"volunserve-backend",
  VOLUNSERVE_DEPLOYMENT_ENV:"production",
  VOLUNSERVE_STAGING_STRICT:"",
  FIREBASE_SERVICE_ACCOUNT_JSON:""
},{options:{projectId:"volunserve-3aa5b"}});
assert.equal(r.ok,true);
assert.equal(r.initialization,0);
pass("Production Firebase existingApps path unchanged");
r=execute({
  RENDER_SERVICE_NAME:"volunserve-backend",
  VOLUNSERVE_DEPLOYMENT_ENV:"production",
  VOLUNSERVE_STAGING_STRICT:"",
  FIREBASE_SERVICE_ACCOUNT_JSON:"",
  CLOUDINARY_URL:"cloudinary://SYNTHETIC_PROD_KEY:SYNTHETIC_PROD_SECRET@netjawtz",
  GOOGLE_APPLICATION_CREDENTIALS:"/synthetic/production-key-not-a-file.json",
  GOOGLE_CLOUD_PROJECT:"volunserve-3aa5b",
  FIREBASE_CONFIG:JSON.stringify({projectId:"volunserve-3aa5b"})
});
assert.equal(r.ok,true);
assert.equal(r.initialization,1);
pass("Unchanged production permits legacy credential variables with no new startup restrictions");
console.log("SUCCESS:",passed,"startup isolation checks, ZERO SDK calls for unsafe configurations");
