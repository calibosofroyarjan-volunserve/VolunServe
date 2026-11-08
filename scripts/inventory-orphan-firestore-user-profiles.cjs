#!/usr/bin/env node
"use strict";
/**
 * VolunServe production Firestore users ORPHAN INVENTORY — READ ONLY.
 *
 * Observes active Firebase Authentication UIDs, then enumerates Firestore
 * users/{uid} root documents with no matching Auth user. Does NOT delete,
 * edit, export private records, or affect any other collections.
 *
 * This read-only inventory is required before a separately reviewed cleanup.
 * Old documents may still be referenced by event/certificate/donation history:
 * NEVER infer that a missing Auth UID makes deletion safe for those records.
 */
const assert = require("node:assert/strict");
const {createRequire} = require("node:module");
const path = require("node:path");
const requireFns = createRequire(path.resolve(__dirname,"../functions/package.json"));
const PROJECT = "volunserve-3aa5b";

function classifyProfileIds(authIds, profileIds) {
  const a = new Set(authIds), p = new Set(profileIds);
  return {
    authCount:a.size,profileCount:p.size,
    protectedCount:[...p].filter(id=>a.has(id)).length,
    orphanCount:[...p].filter(id=>!a.has(id)).length,
    missingProfileCount:[...a].filter(id=>!p.has(id)).length,
  };
}
function selfTest() {
  assert.deepEqual(classifyProfileIds(["marilyn","caliboso","devin"],[
    "marilyn","caliboso","devin","old-1","old-2"
  ]),{authCount:3,profileCount:5,protectedCount:3,orphanCount:2,missingProfileCount:0});
  assert.deepEqual(classifyProfileIds(["a","b"],["b","old"]),{
    authCount:2,profileCount:2,protectedCount:1,orphanCount:1,missingProfileCount:1});
  assert.deepEqual(classifyProfileIds([],[]),{
    authCount:0,profileCount:0,protectedCount:0,orphanCount:0,missingProfileCount:0});
  console.log("PASS: orphan profile ID accounting (synthetic only)");
}
function sdkCheck(){
  assert.equal(typeof requireFns("firebase-admin/app").initializeApp,"function");
  assert.equal(typeof requireFns("firebase-admin/auth").getAuth,"function");
  assert.equal(typeof requireFns("firebase-admin/firestore").getFirestore,"function");
  console.log("PASS: scoped Firebase Admin SDK imports");
}
async function inventory(){
  assert.equal(process.env.GITHUB_REPOSITORY,
    "calibosofroyarjan-volunserve/VolunServe",
    "BLOCKED: wrong repository");
  assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected",
    "BLOCKED: inventory must use approved protected branch");
  assert(!process.env.FIREBASE_AUTH_EMULATOR_HOST &&
    !process.env.FIRESTORE_EMULATOR_HOST,
    "BLOCKED: production-only inventory must not target emulators");
  const json=process.env.VOLUNSERVE_PRODUCTION_AUDIT_CREDENTIAL;
  assert(json,"BLOCKED: production read-only audit credential absent");
  const cred=JSON.parse(json);
  assert.equal(cred.project_id,PROJECT,"BLOCKED: wrong Firebase project");
  const {initializeApp,cert}=requireFns("firebase-admin/app");
  const {getAuth}=requireFns("firebase-admin/auth");
  const {getFirestore}=requireFns("firebase-admin/firestore");
  const app=initializeApp({credential:cert(cred),projectId:PROJECT});
  const auth=getAuth(app), db=getFirestore(app);

  const markerResp=await fetch("https://volunserve.com/volunserve-release.json",{
    headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000)});
  assert(markerResp.ok,"BLOCKED: cannot verify production revision");
  const marker=await markerResp.json();
  assert.equal(marker.app,"VolunServe","BLOCKED: wrong site");
  assert.equal(marker.firebaseProject,PROJECT,"BLOCKED: wrong live project");
  assert.match(marker.revision||"",/^[0-9a-f]{40}$/);

  const authIds=[];
  let token;
  do {
    const page=await auth.listUsers(1000,token);
    authIds.push(...page.users.map(u=>u.uid));
    token=page.pageToken;
  } while(token);
  assert(authIds.length>0,"BLOCKED: Auth users empty or unavailable");
  const userDocs=await db.collection("users").get();
  const ids=userDocs.docs.map(d=>d.id);
  const protectedSet=new Set(authIds);
  const stats=classifyProfileIds(authIds,ids);
  let orphanWithSubcollections=0;
  let orphanWithoutSubcollections=0;
  let orphanSubcollectionCount=0;
  for(const doc of userDocs.docs){
    if(protectedSet.has(doc.id))continue;
    // listCollections does not mutate anything. Subcollections survive parent
    // deletion, so identify these as extra-risk and never auto-delete.
    const nested=await doc.ref.listCollections();
    if(nested.length>0){orphanWithSubcollections++;orphanSubcollectionCount+=nested.length;}
    else orphanWithoutSubcollections++;
  }
  assert.equal(orphanWithoutSubcollections+orphanWithSubcollections,stats.orphanCount);
  console.log(JSON.stringify({
    project:PROJECT,liveRevision:marker.revision,mode:"READ_ONLY",
    ...stats,
    orphanWithSubcollections,orphanWithoutSubcollections,
    orphanSubcollectionCount,
    otherCollections:"NOT SCANNED OR ALTERED",
    deletionEligible:"NONE — cross-collection dependencies/backup not yet checked",
  },null,2));
  console.log("READ ONLY: no Firestore/Auth records were changed or deleted");
}
if(require.main===module){
  (process.argv.includes("--self-test")?Promise.resolve().then(selfTest):
   process.argv.includes("--sdk-check")?Promise.resolve().then(sdkCheck):
   inventory()).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={classifyProfileIds};
