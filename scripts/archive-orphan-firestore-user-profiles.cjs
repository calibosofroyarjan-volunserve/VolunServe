#!/usr/bin/env node
"use strict";
/**
 * VolunServe orphan Firestore user-profile cleanup, with read-only planning,
 * dependency scan, immutable operator review hash, and atomic Firestore backup.
 *
 * Scope: users/{uid} only, where uid has NO live Firebase Auth account.
 * Backups: archivedOrphanUserProfiles20261108/{uid}, transactionally with delete.
 * Never deletes Auth users, other collections, or profiles of active Auth users.
 * Requires an explicitly authenticated PROJECT OWNER in Google Cloud Shell.
 * Do NOT run with the GitHub READ-ONLY production audit credential.
 */
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {createRequire}=require("node:module");
const path=require("node:path");
const reqFns=createRequire(path.resolve(__dirname,"../functions/package.json"));
const {initializeApp,applicationDefault}=reqFns("firebase-admin/app");
const {getAuth}=reqFns("firebase-admin/auth");
const {getFirestore,FieldValue}=reqFns("firebase-admin/firestore");
const PROJECT="volunserve-3aa5b";
const ARCHIVE="archivedOrphanUserProfiles20261108";
const MAX_RECORDS=12000;

function findUidReferences(value,orphanIds,found,depth=0,seen=new Set()){
  if(value==null || depth>20) return;
  if(typeof value==="string"){
    if(orphanIds.has(value))found.add(value);
    const m=value.match(/(?:^|\/)users\/([A-Za-z0-9_-]+)(?:$|\/)/);
    if(m && orphanIds.has(m[1]))found.add(m[1]);
    return;
  }
  if(typeof value!=="object" || seen.has(value))return;
  seen.add(value);
  if(typeof value.path==="string")findUidReferences(value.path,orphanIds,found,depth+1,seen);
  if(value.constructor?.name==="Timestamp"||value.constructor?.name==="GeoPoint"||
      value.constructor?.name==="Bytes"||value.constructor?.name==="Buffer")return;
  if(Array.isArray(value)){
    for(const v of value)findUidReferences(v,orphanIds,found,depth+1,seen);
  }else{
    for(const [k,v] of Object.entries(value)){
      if(k.startsWith("_"))continue;
      findUidReferences(v,orphanIds,found,depth+1,seen);
    }
  }
}

function candidatesForCleanup(authIds,firestoreIds,referenced,withSubcollections){
  const auth=new Set(authIds);
  return [...new Set(firestoreIds)].filter(id=>
    !auth.has(id)&&!referenced.has(id)&&!withSubcollections.has(id)).sort();
}
function selfTest(){
  const refs=new Set(), orphan=new Set(["old01","old02","old03"]);
  findUidReferences({createdBy:"old01",records:[{ref:"users/old02"}]},orphan,refs);
  assert.deepEqual([...refs].sort(),["old01","old02"]);
  assert.deepEqual(candidatesForCleanup(["a","b","c"],["a","b","c","old01","old02","old03"],
    refs,new Set()),["old03"]);
  assert.deepEqual(candidatesForCleanup(["a"],["a"],new Set(),new Set()),[]);
  console.log("PASS: protected account exclusion, deep cross-collection UID checks, safe candidate selection");
}
function option(key){
  const a=process.argv.find(v=>v.startsWith("--"+key+"="));
  return a?a.slice(key.length+3):null;
}
async function run(){
  assert(!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    !/VOLUNSERVE_PRODUCTION_READONLY_SERVICE_ACCOUNT/.test(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    "BLOCKED: do not try cleanup using the audit secret");
  assert(!process.env.FIREBASE_AUTH_EMULATOR_HOST&&!process.env.FIRESTORE_EMULATOR_HOST,
    "BLOCKED: wrong Firebase target");
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT||PROJECT,
    PROJECT,"BLOCKED: Cloud project does not match");
  const apply=process.argv.includes("--apply");
  assert(!process.argv.includes("--delete-all"),"BLOCKED: unsupported broad deletion");
  if(apply){
    assert(option("hash") && /^[a-f0-9]{64}$/.test(option("hash")),
      "BLOCKED: --apply requires 64-hex --hash from a fresh --plan");
    assert(option("count")!==null && /^\d+$/.test(option("count")),
      "BLOCKED: --apply requires --count from a fresh --plan");
    assert.equal(option("confirm"),"ARCHIVE_ORPHAN_USER_PROFILES",
      "BLOCKED: explicit --confirm=ARCHIVE_ORPHAN_USER_PROFILES required");
  }
  const markerResp=await fetch("https://volunserve.com/volunserve-release.json",{
    headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000)});
  assert(markerResp.ok,"BLOCKED: production live marker unavailable");
  const live=await markerResp.json();
  assert.equal(live.app,"VolunServe");
  assert.equal(live.firebaseProject,PROJECT);
  assert.match(live.revision||"",/^[a-f0-9]{40}$/);

  const app=initializeApp({credential:applicationDefault(),projectId:PROJECT});
  const auth=getAuth(app),db=getFirestore(app);
  const authUsers=[];let token;
  do {
    const page=await auth.listUsers(1000,token);
    authUsers.push(...page.users);
    token=page.pageToken;
  }while(token);
  const activeIds=new Set(authUsers.map(u=>u.uid));
  assert.equal(activeIds.size,3,
    "BLOCKED: active Auth user count changed; expected exactly 3 protected accounts");

  const users=await db.collection("users").get();
  const orphan=users.docs.filter(doc=>!activeIds.has(doc.id));
  assert.equal(users.size,activeIds.size+orphan.length,
    "BLOCKED: some remaining Auth UIDs have no Firestore profile; review first");
  const orphanIds=new Set(orphan.map(doc=>doc.id));

  // Scan all root collections and nested records. If a UID is referenced
  // anywhere, keep that user profile instead of breaking historical data.
  const referenced=new Set(),subcollections=new Set();
  let scanned=0;
  const roots=await db.listCollections();
  async function scanCollection(ref){
    const page=await ref.get();
    scanned+=page.size;
    assert(scanned<=MAX_RECORDS,
      "BLOCKED: too many records for bounded dependency audit; no cleanup");
    for(const doc of page.docs){
      const found=new Set();
      findUidReferences(doc.data(),orphanIds,found);
      for(const id of found)referenced.add(id);
      const children=await doc.ref.listCollections();
      for(const child of children)await scanCollection(child);
    }
  }
  for(const root of roots){
    if(root.id==="users"||root.id===ARCHIVE)continue;
    await scanCollection(root);
  }
  for(const doc of orphan){
    const children=await doc.ref.listCollections();
    if(children.length)subcollections.add(doc.id);
  }
  const candidates=candidatesForCleanup(activeIds,
    users.docs.map(d=>d.id),referenced,subcollections);
  const hash=crypto.createHash("sha256").update(JSON.stringify({
    project:PROJECT,revision:live.revision,
    auth:[...activeIds].sort(),
    candidates,
    orphan:[...orphanIds].sort(),
    referenced:[...referenced].sort(),
    scanned,
  })).digest("hex");
  console.log(JSON.stringify({
    project:PROJECT,mode:apply?"REVIEWED_ARCHIVE_AND_DELETE":"READ_ONLY_PLAN",
    activeAuthProfiles:activeIds.size,
    orphanProfiles:orphan.length,
    orphanReferencedElsewhere:referenced.size,
    orphanWithSubcollections:subcollections.size,
    safeArchiveAndRemoveCandidates:candidates.length,
    scannedOtherRecords:scanned,
    backupCollection:ARCHIVE,
    reviewHash:hash,
    note:"No active user, other collection, event, donation or certificate will be deleted",
  },null,2));
  if(!apply){
    console.log("READ ONLY PLAN: no Firestore or Auth records changed.");
    console.log("To apply, use --apply --count="+candidates.length+
      " --hash="+hash+" --confirm=ARCHIVE_ORPHAN_USER_PROFILES");
    return;
  }
  assert.equal(Number(option("count")),candidates.length,
    "BLOCKED: candidate count changed since approval");
  assert.equal(option("hash"),hash,
    "BLOCKED: candidate identity/references changed since preview; re-plan");
  assert(candidates.length>0&&candidates.length<=100,
    "BLOCKED: unexpected candidate count");

  // Recheck active UIDs before ANY write.
  const checkUsers=await auth.listUsers(1000);
  assert(!checkUsers.pageToken,"BLOCKED: unexpected Auth pagination");
  assert.deepEqual(checkUsers.users.map(u=>u.uid).sort(),[...activeIds].sort(),
    "BLOCKED: active Auth accounts changed while preparing cleanup");

  // Copy full original Firestore-typed data into a dedicated archive collection,
  // then delete the exact source snapshot. All operations in one atomic batch.
  const docsById=new Map(orphan.map(d=>[d.id,d]));
  const batch=db.batch();
  for(const id of candidates){
    const original=docsById.get(id);
    assert(original&&original.exists);
    const backup=db.collection(ARCHIVE).doc(id);
    const existing=await backup.get();
    assert(!existing.exists,"BLOCKED: backup entry already exists");
    batch.set(backup,{
      originalData:original.data(),
      originalPath:original.ref.path,
      archivedAt:FieldValue.serverTimestamp(),
      liveRevision:live.revision,
    });
    batch.delete(original.ref,{lastUpdateTime:original.updateTime});
  }
  await batch.commit();
  console.log("SUCCESS: "+candidates.length+
    " unreferenced orphan profiles archived atomically and removed from users; no other collections or Auth users altered");
}
if(require.main===module){
  (process.argv.includes("--self-test")?Promise.resolve().then(selfTest):run())
    .catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={findUidReferences,candidatesForCleanup};
