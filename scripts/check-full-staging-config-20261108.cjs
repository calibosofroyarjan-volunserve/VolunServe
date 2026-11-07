"use strict";
// Firebase Full Staging prebuild contract. Pure local validation, NO network or cloud reads.
// This standalone script does not wire the app or deploy any resources.
const assert = require("node:assert/strict");
const EXPECTED = Object.freeze({
  projectId: "volunserve-full-staging",
  authDomain: "volunserve-full-staging.firebaseapp.com",
  storageBucket: "volunserve-full-staging.firebasestorage.app",
  messagingSenderId: "429213950126",
  appId: "1:429213950126:web:955dbf575697826b674d3f",
});
const DISABLED_BACKEND="https://volunserve-staging-disabled.invalid";
const INERT_BACKEND="https://volunserve-staging-api-shell.onrender.com";
const forbidden=[
  "FIREBASE_SERVICE_ACCOUNT","FIREBASE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS","PAYMONGO_SECRET_KEY",
  "PAYMONGO_WEBHOOK_SECRET","CLOUDINARY_API_SECRET",
  "FIREBASE_TOKEN"
];
function validate(env) {
  assert.equal(env.EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE,"1",
    "BLOCKED: staging build mode must be 1");
  for(const key of forbidden) assert.ok(!env[key],
    "BLOCKED: do not inject cloud/private credentials into staging web build: "+key);
  assert.ok(/^AIza[A-Za-z0-9_-]{20,}$/.test(env.EXPO_PUBLIC_STAGING_FIREBASE_API_KEY||""),
    "BLOCKED: missing/malformed Firebase Web API key");
  const pairs=[
    ["projectId","EXPO_PUBLIC_STAGING_FIREBASE_PROJECT_ID"],
    ["authDomain","EXPO_PUBLIC_STAGING_FIREBASE_AUTH_DOMAIN"],
    ["storageBucket","EXPO_PUBLIC_STAGING_FIREBASE_STORAGE_BUCKET"],
    ["messagingSenderId","EXPO_PUBLIC_STAGING_FIREBASE_SENDER_ID"],
    ["appId","EXPO_PUBLIC_STAGING_FIREBASE_APP_ID"]
  ];
  for(const [name,key] of pairs) assert.equal(env[key],EXPECTED[name],
    "BLOCKED: wrong staging Firebase "+name);
  const backend=env.EXPO_PUBLIC_STAGING_BACKEND_URL||DISABLED_BACKEND;
  assert.ok(backend===DISABLED_BACKEND||backend===INERT_BACKEND,
    "BLOCKED: stage must use a disabled or strictly inert staging backend, never live Render");
  assert.ok(!Object.entries(env).some(([k,v])=>k.startsWith("EXPO_PUBLIC_")&&
    typeof v==="string"&&(
      v.includes("volunserve-3aa5b")||
      v.includes("https://volunserve.onrender.com")||
      v.includes("https://volunserve.com")
    )), "BLOCKED: production Firebase or backend injected through public env");
  return {projectId:EXPECTED.projectId,backendMode:backend===DISABLED_BACKEND?"disabled":"inert-shell"};
}
function fakeEnvironment() {
 return {
   EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE:"1",
   EXPO_PUBLIC_STAGING_FIREBASE_API_KEY:"AIzaThisIsAPublicTestPlaceholderNotARealKey",
   EXPO_PUBLIC_STAGING_FIREBASE_PROJECT_ID:EXPECTED.projectId,
   EXPO_PUBLIC_STAGING_FIREBASE_AUTH_DOMAIN:EXPECTED.authDomain,
   EXPO_PUBLIC_STAGING_FIREBASE_STORAGE_BUCKET:EXPECTED.storageBucket,
   EXPO_PUBLIC_STAGING_FIREBASE_SENDER_ID:EXPECTED.messagingSenderId,
   EXPO_PUBLIC_STAGING_FIREBASE_APP_ID:EXPECTED.appId,
   EXPO_PUBLIC_STAGING_BACKEND_URL:DISABLED_BACKEND
 };
}
function selfTest() {
  const base=fakeEnvironment();
  assert.equal(validate(base).projectId,EXPECTED.projectId);
  const invalid=[
    ["mode",{EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE:"0"}],
    ["live Firebase",{EXPO_PUBLIC_STAGING_FIREBASE_PROJECT_ID:"volunserve-3aa5b"}],
    ["live auth",{EXPO_PUBLIC_STAGING_FIREBASE_AUTH_DOMAIN:"volunserve-3aa5b.firebaseapp.com"}],
    ["live storage",{EXPO_PUBLIC_STAGING_FIREBASE_STORAGE_BUCKET:"volunserve-3aa5b.firebasestorage.app"}],
    ["wrong sender",{EXPO_PUBLIC_STAGING_FIREBASE_SENDER_ID:"233201250762"}],
    ["wrong app",{EXPO_PUBLIC_STAGING_FIREBASE_APP_ID:"1:233201250762:web:c50ff914c6107b1f68df33"}],
    ["prod Render",{EXPO_PUBLIC_STAGING_BACKEND_URL:"https://volunserve.onrender.com"}],
    ["malformed API key",{EXPO_PUBLIC_STAGING_FIREBASE_API_KEY:"invalid"}],
    ["privileged service account",{GOOGLE_APPLICATION_CREDENTIALS:"/tmp/key.json"}],
    ["payment secret",{PAYMONGO_SECRET_KEY:"fake-should-be-rejected"}],
    ["hidden public prod URL",{EXPO_PUBLIC_TEST_URL:"https://volunserve.com"}]
  ];
  for(const [label,change] of invalid)
    assert.throws(()=>validate({...base,...change}),/BLOCKED:/,
      "Stage guard must reject "+label);
  assert.equal(validate({...base,EXPO_PUBLIC_STAGING_BACKEND_URL:INERT_BACKEND}).backendMode,"inert-shell");
  console.log("PASS full-staging env contract: correct registered Firebase project, 11 unsafe cases denied, inactive/inert backend only.");
  console.log("NO external requests, credentials, builds or deployments.");
}
if(require.main===module) {
  try {
    if(process.argv.includes("--self-test")) selfTest();
    else if(process.argv.includes("--check")) {
      const out=validate(process.env);
      console.log("PASS staging-only build env:",out.projectId,"backend:",out.backendMode);
    } else throw Error("Usage: node scripts/check-full-staging-config-20261108.cjs --self-test | --check");
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
module.exports={validate,EXPECTED};
