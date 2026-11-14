"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  EXPECTED_PROJECT, assertStagingAccessOnly, classifyStagingAdminAccess,
} = require("./stagingAdminAccessPreflight");

const account = {
  uid: "staging_admin_fixture_001",
  email: "fictional.admin@example.invalid",
  disabled: false,
  emailVerified: true,
};
const profile = {
  uid: account.uid, email: account.email,
  role: "admin", status: "approved", adminStatus: "active",
};
const goodEnv = () => ({
  VOLUNSERVE_STAGING_STRICT: "1",
  VOLUNSERVE_DEPLOYMENT_ENV: "staging",
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account", project_id: EXPECTED_PROJECT,
    client_email: "fictional@" + EXPECTED_PROJECT + ".iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nFAKE UNIT TEST ONLY\n-----END PRIVATE KEY-----",
  }),
});

test("full-staging account check passes only for separate explicit staging credentials", () => {
  assert.equal(assertStagingAccessOnly(goodEnv()),EXPECTED_PROJECT);
  for(const project of ["volunserve-3aa5b","volunserve-auth-staging","other-project"]) {
    const env=goodEnv(), secret=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    secret.project_id=project;
    env.FIREBASE_SERVICE_ACCOUNT_JSON=JSON.stringify(secret);
    assert.throws(()=>assertStagingAccessOnly(env),/STAGING_ADMIN_PREFLIGHT_BLOCKED/);
  }
});
test("no secret, invalid project, emulator or missing staging flags fail closed", () => {
  const variants=[
    {FIREBASE_SERVICE_ACCOUNT_JSON: ""},
    {FIREBASE_SERVICE_ACCOUNT_JSON: "{oops"},
    {VOLUNSERVE_STAGING_STRICT:"0"},
    {VOLUNSERVE_DEPLOYMENT_ENV:"production"},
    {FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9099"},
    {FIRESTORE_EMULATOR_HOST:"127.0.0.1:8080"},
    {GCLOUD_PROJECT:"volunserve-3aa5b"},
    {GOOGLE_CLOUD_PROJECT:"volunserve-3aa5b"},
  ];
  for(const v of variants) {
    assert.throws(()=>assertStagingAccessOnly({...goodEnv(),...v}),/STAGING_ADMIN_PREFLIGHT_BLOCKED/);
  }
  const wrongEmail=goodEnv(), secret=JSON.parse(wrongEmail.FIREBASE_SERVICE_ACCOUNT_JSON);
  secret.client_email="owner@volunserve-3aa5b.iam.gserviceaccount.com";
  wrongEmail.FIREBASE_SERVICE_ACCOUNT_JSON=JSON.stringify(secret);
  assert.throws(()=>assertStagingAccessOnly(wrongEmail),/STAGING_ADMIN_PREFLIGHT_BLOCKED/);
});
test("approved operational staging Admin with verified Auth can sign in", () => {
  assert.equal(classifyStagingAdminAccess(account,profile),"READY_FOR_STAGING_ADMIN_SIGN_IN");
  assert.equal(classifyStagingAdminAccess({...account,email:"FICTIONAL.ADMIN@example.invalid"},profile),
    "READY_FOR_STAGING_ADMIN_SIGN_IN");
});
test("missing Auth, disabled account and unverified email are each distinguishable", () => {
  assert.equal(classifyStagingAdminAccess(null,profile),"AUTH_ACCOUNT_NOT_FOUND");
  assert.equal(classifyStagingAdminAccess({...account,disabled:true},profile),"AUTH_ACCOUNT_DISABLED");
  assert.equal(classifyStagingAdminAccess({...account,emailVerified:false},profile),"AUTH_EMAIL_NOT_VERIFIED");
});
test("missing Firestore profile or mismatched authenticated identity fails closed", () => {
  assert.equal(classifyStagingAdminAccess(account,null),"STAGING_PROFILE_MISSING");
  assert.equal(classifyStagingAdminAccess(account,{...profile,uid:"someone_else"}),"AUTH_PROFILE_UID_MISMATCH");
  assert.equal(classifyStagingAdminAccess(account,{...profile,email:"other@example.invalid"}),"AUTH_PROFILE_EMAIL_MISMATCH");
});
test("unapproved, suspended, non-Admin and requested-role claims cannot pass", () => {
  assert.equal(classifyStagingAdminAccess(account,{...profile,role:"resident",requestedRole:"admin"}),"ROLE_NOT_ADMIN");
  assert.equal(classifyStagingAdminAccess(account,{...profile,role:"superadmin"}),"ROLE_NOT_ADMIN");
  assert.equal(classifyStagingAdminAccess(account,{...profile,status:"pending"}),"ADMIN_NOT_APPROVED");
  assert.equal(classifyStagingAdminAccess(account,{...profile,status:"rejected"}),"ADMIN_NOT_APPROVED");
  assert.equal(classifyStagingAdminAccess(account,{...profile,adminStatus:"suspended"}),"ADMIN_SUSPENDED");
});
test("operator CLI is read-only, does not create users, modify roles or expose an API", () => {
  const src=fs.readFileSync("backend/scripts/check-staging-admin-account.cjs","utf8");
  assert(!src.includes('require("../firebaseAdmin")'));
  assert(src.indexOf("assertStagingAccessOnly(process.env)") <
    src.indexOf('require("firebase-admin/app")'));
  assert(src.includes('getAuth(app)'));
  assert(src.includes('getFirestore(app)'));
  assert(src.includes("await deleteApp(app)"));
  assert(!src.includes("process.env.IDENTITY_AI_INTERNAL_KEY"));
  assert(!src.includes("process.env.IDENTITY_AI_SERVICE_URL"));
  for(const forbidden of [
    "createUser(", "updateUser(", "deleteUser(", ".update(", ".set(", ".create(",
    "setCustomUserClaims(", "generatePasswordResetLink(", "express()", "app.post(",
  ]) {
    assert.equal(src.includes(forbidden),false,"forbidden write or endpoint: "+forbidden);
  }
  assert(src.includes('db.collection("users").doc(account.uid).get()'));
  assert(src.includes("getUserByEmail(email)"));
  assert(!src.includes("console.log(email)"));
});
