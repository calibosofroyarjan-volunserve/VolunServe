"use strict";
const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {isVerifiedFirebaseToken, isCompletedVolunServeProfile} = require("../verifiedFirebaseToken");

test("unverified or missing email denied for all Firebase providers", () => {
  for(const token of [
    null, {}, {uid:"pending"},
    {uid:"pending",email:"user@gmail.com"},
    {uid:"pending",email:"user@gmail.com",email_verified:false},
    {uid:"pending",email_verified:true},
    {uid:"pending",email:"invalid",email_verified:true},
    {uid:"",email:"user@gmail.com",email_verified:true},
  ]) assert.equal(isVerifiedFirebaseToken(token),false,JSON.stringify(token));
});
test("verified email/password or verified Google UID can proceed to role-based API authorization", () => {
  for(const provider of ["password", "google.com"]) {
    assert.equal(isVerifiedFirebaseToken({
      uid:"valid-firebase-user",email:"person@gmail.com",email_verified:true,
      firebase:{sign_in_provider:provider},
    }),true);
  }
});
test("verified Firebase Auth-only, Guest, and pending LGU applicant are NOT completed service accounts", () => {
  for(const profile of [null,{}, {role:"guest",status:"approved"},
    {role:"resident",status:"pending"}, {role:"resident"},
    {role:"applicant",status:"pending_review"}, {role:"admin",status:"suspended"},
    {role:"admin",status:"approved",adminStatus:"suspended"}]) {
    assert.equal(isCompletedVolunServeProfile(profile),false,JSON.stringify(profile));
  }
  for(const p of [
    {role:"resident",status:"approved"},
    {role:"volunteer",status:"approved"},
    {role:"admin",status:"approved"},
    {role:"superadmin",status:"approved"},
    {role:"lgu_personnel",status:"approved"},
    {role:"admin"},
  ]) assert.equal(isCompletedVolunServeProfile(p),true,JSON.stringify(p));
});
test("Render middleware refuses pending signup UID before using Admin SDK data", () => {
  const server=fs.readFileSync(path.join(__dirname,"../server.js"),"utf8");
  assert(server.includes('require("./verifiedFirebaseToken")'));
  const middleware=server.slice(server.indexOf("async function requireFirebaseUser("),server.indexOf("function makeHttpError("));
  assert(middleware.includes("auth.verifyIdToken("));
  assert(middleware.includes("isVerifiedFirebaseToken(decodedToken)"));
  assert(middleware.indexOf("isVerifiedFirebaseToken(decodedToken)") < middleware.indexOf("request.firebaseUser ="));
  assert(middleware.includes("email_not_verified"));
  assert(middleware.includes("isCompletedVolunServeProfile(storedProfile)"));
  assert(middleware.includes('error: "registration_incomplete"'));
  assert(middleware.indexOf("isCompletedVolunServeProfile(storedProfile)") < middleware.indexOf("request.firebaseUser ="));
});
