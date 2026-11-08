#!/usr/bin/env node
"use strict";
/**
 * READ ONLY: Production Firebase Auth/Firestore compatibility audit.
 * Never mutates Auth users, Firestore documents, Rules, Functions or Hosting.
 * Prints ONLY aggregate counts, never UID, email, user names or document data.
 */
const assert = require("node:assert/strict");

const PROJECT_ID = "volunserve-3aa5b";
const STAFF_ROLES = new Set(["admin", "superadmin", "lgu_personnel"]);
const COMMUNITY_ROLES = new Set(["resident", "volunteer"]);

function auditOne(authUser, profile, counters) {
  counters.authUsers++;
  if (!profile) {
    counters.authOnly++;
    return;
  }
  const role = String(profile.role || "").trim().toLowerCase();
  if (role === "guest") counters.legacyGuest++;
  if (role === "applicant") counters.pendingApplicant++;
  const isStaff = STAFF_ROLES.has(role);
  const isCommunity = COMMUNITY_ROLES.has(role);
  // Legacy role profiles without status were treated as approved by the
  // existing application. Count them, too, to avoid missing a lockout.
  const approved = profile.status === "approved" ||
    (profile.status == null && (isStaff || isCommunity));
  if (!approved) return;
  const verified = authUser.emailVerified === true;
  if (isStaff) {
    counters.approvedStaff++;
    if (!verified) counters.unverifiedStaff++;
  }
  if (isCommunity) {
    counters.approvedCommunity++;
    if (!verified) counters.unverifiedCommunity++;
  }
  if (isStaff || isCommunity) {
    const authMail = String(authUser.email || "").trim().toLowerCase();
    const profileMail = String(profile.email || "").trim().toLowerCase();
    if (!authMail || !profileMail || authMail !== profileMail) {
      counters.approvedEmailMismatch++;
    }
  }
}
function emptyCounters() {
  return {
    authUsers: 0, authOnly: 0, approvedStaff: 0,
    unverifiedStaff: 0, approvedCommunity: 0,
    unverifiedCommunity: 0, approvedEmailMismatch: 0,
    legacyGuest: 0, pendingApplicant: 0,
  };
}
function blockers(c) {
  return c.unverifiedStaff + c.unverifiedCommunity + c.approvedEmailMismatch;
}
function selfTest() {
  const c = emptyCounters();
  auditOne({emailVerified:true,email:"staff@example.org"}, {role:"admin",email:"staff@example.org"},c);
  auditOne({emailVerified:false,email:"staff2@example.org"}, {role:"superadmin",email:"staff2@example.org"},c);
  auditOne({emailVerified:false,email:"user@example.org"}, {role:"resident",status:"approved",email:"user@example.org"},c);
  auditOne({emailVerified:true,email:"volunteer@example.org"}, {role:"volunteer",status:"approved",email:"wrong@example.org"},c);
  auditOne({emailVerified:false,email:"pending@example.org"}, null,c);
  auditOne({emailVerified:false,email:"guest@example.org"}, {role:"guest",status:"approved"},c);
  auditOne({emailVerified:false,email:"old@example.org"}, {role:"resident",email:"old@example.org"},c);
  assert.equal(c.authUsers,7);
  assert.equal(c.authOnly,1);
  assert.equal(c.approvedStaff,2);
  assert.equal(c.unverifiedStaff,1);
  assert.equal(c.approvedCommunity,3);
  assert.equal(c.unverifiedCommunity,2);
  assert.equal(c.approvedEmailMismatch,1);
  assert.equal(c.legacyGuest,1);
  assert.equal(blockers(c),4);
  assert.equal(blockers(emptyCounters()),0);
  console.log("PASS: production account audit classification (synthetic only)");
}
async function main() {
  assert.equal(process.env.GITHUB_REPOSITORY,
    "calibosofroyarjan-volunserve/VolunServe",
    "BLOCKED: unexpected repository");
  assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected",
    "BLOCKED: production audit must run on protected source branch");
  assert(!process.env.FIREBASE_AUTH_EMULATOR_HOST,
    "BLOCKED: emulator is not production");

  const raw = process.env.VOLUNSERVE_PRODUCTION_AUDIT_CREDENTIAL;
  assert(raw, "BLOCKED: missing production audit credential");
  const credentials = JSON.parse(raw);
  assert.equal(credentials.project_id,PROJECT_ID,
    "BLOCKED: Firebase credential project mismatch");

  const {initializeApp,cert} = require("../functions/node_modules/firebase-admin/app");
  const {getAuth} = require("../functions/node_modules/firebase-admin/auth");
  const {getFirestore} = require("../functions/node_modules/firebase-admin/firestore");
  const app = initializeApp({credential:cert(credentials),projectId:PROJECT_ID});
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  const markerResponse = await fetch("https://volunserve.com/volunserve-release.json",
    {headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000)});
  assert(markerResponse.ok, "BLOCKED: production release marker unavailable");
  const marker = await markerResponse.json();
  assert.equal(marker.app,"VolunServe","BLOCKED: wrong production marker");
  assert.equal(marker.firebaseProject,PROJECT_ID,"BLOCKED: wrong live Firebase project");
  assert.match(marker.revision || "",/^[0-9a-f]{40}$/,"BLOCKED: invalid live revision");

  const counts = emptyCounters();
  let pageToken;
  do {
    const page = await auth.listUsers(1000,pageToken);
    for (let i=0;i<page.users.length;i+=100) {
      const users = page.users.slice(i,i+100);
      const refs = users.map(u=>firestore.doc("users/"+u.uid));
      const snapshots = await firestore.getAll(...refs);
      users.forEach((user,index)=>{
        auditOne(user,snapshots[index].exists?snapshots[index].data():null,counts);
      });
    }
    pageToken=page.pageToken;
  } while(pageToken);

  // Aggregate-only output. No PII, no credentials, no UID or individual records.
  console.log(JSON.stringify({project:PROJECT_ID,liveRevision:marker.revision,counts},null,2));
  assert.equal(blockers(counts),0,
    "BLOCKED: approved legacy users could lose access after strict email-verification rules; fix existing accounts safely before rollout");
  console.log("PASS: approved Auth/Firestore profiles compatible with verified-email rollout");
}
if (require.main===module) {
  (process.argv.includes("--self-test") ? Promise.resolve().then(selfTest) : main())
    .catch(err=>{console.error(err.message);process.exitCode=1;});
}
module.exports = {auditOne,emptyCounters,blockers};
