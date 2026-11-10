#!/usr/bin/env node
"use strict";
/**
 * Account-OWNER-authorized READ ONLY investigation for Gmail Resident profiles.
 * Output is aggregate counts only. No emails, UIDs, paths or private record
 * values are printed or exported. Does not create, update, delete, or deploy.
 *
 * The existence of a Firestore orphan never authorizes deletion.
 */
const assert=require("node:assert/strict");
const path=require("node:path");
const {createRequire}=require("node:module");
const REPO="calibosofroyarjan-volunserve/VolunServe";
const PROJECT="volunserve-3aa5b";
const MAX_PROFILES=20000;
const MAX_DOCS=12000;
const MAX_DEPTH=8;
const PAGE=200;
const AUTH_PAGE=100;
const ROLES=["resident","volunteer"];

function gmailKey(raw) {
  const s=String(raw||"").trim().toLowerCase(), parts=s.split("@");
  if(parts.length!==2||!parts[0]||
    !["gmail.com","googlemail.com"].includes(parts[1])) return null;
  const local=parts[0].split("+")[0].replace(/\./g,"");
  return local && local.length<=64 ? local+"@gmail.com" : null;
}
function gmailGroups(profiles) {
  const groups=new Map();
  for(const p of profiles){
    const key=gmailKey(p.email);
    if(!key)continue;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p);
  }
  return groups;
}
function findTargetRefs(value, ids, emails, found, depth=0, seen=new Set()){
  if(value==null || depth>20)return;
  if(typeof value==="string"){
    if(ids.has(value))found.add(value);
    const lower=value.trim().toLowerCase();
    if(emails.has(lower))for(const id of emails.get(lower))found.add(id);
    const refs=value.match(/(?:^|\/)users\/([A-Za-z0-9_-]+)(?:$|\/)/g)||[];
    for(const raw of refs){
      const uid=raw.split("/").filter(Boolean)[1];
      if(ids.has(uid))found.add(uid);
    }
    return;
  }
  if(typeof value!=="object"||seen.has(value))return;
  seen.add(value);
  if(typeof value.path==="string")findTargetRefs(value.path,ids,emails,found,depth+1,seen);
  if(["Timestamp","GeoPoint","Bytes","Buffer"].includes(value.constructor?.name))return;
  if(Array.isArray(value)){
    for(const v of value)findTargetRefs(v,ids,emails,found,depth+1,seen);
  } else {
    for(const [k,v] of Object.entries(value)){
      if(k.startsWith("_"))continue;
      findTargetRefs(v,ids,emails,found,depth+1,seen);
    }
  }
}
function classifyRoot(root){
  const lower=root.toLowerCase();
  if(lower.includes("event")||lower.includes("attend"))return "events_and_attendance";
  if(lower.includes("certificat"))return "certificates";
  if(lower.includes("donat")||lower.includes("assist")||lower.includes("campaign"))return "donations_and_assistance";
  if(lower.includes("emergency")||lower.includes("incident")||lower.includes("report"))return "emergency_reports";
  if(lower==="users")return "user_profiles_and_subcollections";
  return "other_records";
}
function selfTest(){
  const sample=[
    {uid:"a",email:"first.last@gmail.com"},
    {uid:"b",email:"firstlast@googlemail.com"},
    {uid:"c",email:"firstlast@yahoo.com"},
    {uid:"d",email:"other@gmail.com"},
  ];
  const g=gmailGroups(sample);
  assert.equal(g.size,2);
  assert.equal(g.get("firstlast@gmail.com").length,2);
  assert.equal(gmailKey("O.T.H.E.R+tag@GMAIL.COM"),"other@gmail.com");
  assert.equal(gmailKey("name@outlook.com"),null);
  const uids=new Set(["a","b"]), emails=new Map([["first.last@gmail.com",new Set(["a"])]]);
  const found=new Set();
  findTargetRefs({actorId:"a",owner:"users/b",contact:"first.last@gmail.com",nested:[{target:"something"}]},uids,emails,found);
  assert.deepEqual([...found].sort(),["a","b"]);
  assert.equal(classifyRoot("communityEvents"),"events_and_attendance");
  assert.equal(classifyRoot("donationCampaigns"),"donations_and_assistance");
  console.log("PASS: offline Gmail collisions and UID/email/reference detection; no production access");
}

if(process.argv.includes("--self-test"))selfTest();
else main().catch(e=>{
  // SDK errors can contain personal identifiers. Never print raw error text.
  const code=String(e?.code||"audit_failed").replace(/[^a-z0-9_/-]/gi,"").slice(0,64);
  console.error("BLOCKED: read-only reference audit incomplete; code="+code);
  process.exitCode=1;
});

async function main(){
  assert.equal(process.env.GITHUB_REPOSITORY,REPO);
  assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected");
  assert(!process.env.FIREBASE_AUTH_EMULATOR_HOST&&!process.env.FIRESTORE_EMULATOR_HOST);
  const raw=process.env.VOLUNSERVE_PRODUCTION_AUDIT_CREDENTIAL;
  assert(raw && raw.length>30);
  const creds=JSON.parse(raw);
  assert.equal(creds.project_id,PROJECT);
  const sdk=createRequire(path.resolve(__dirname,"../functions/package.json"));
  const {initializeApp,cert,deleteApp}=sdk("firebase-admin/app");
  const {getAuth}=sdk("firebase-admin/auth");
  const {getFirestore,FieldPath}=sdk("firebase-admin/firestore");
  const app=initializeApp({projectId:PROJECT,credential:cert(creds)});
  try {
    const auth=getAuth(app),db=getFirestore(app);
    let last=null;
    const profiles=[];
    while(true){
      let q=db.collection("users").where("role","in",ROLES)
        .orderBy(FieldPath.documentId()).select("email","role","status").limit(PAGE);
      if(last)q=q.startAfter(last);
      const batch=await q.get();
      for(const doc of batch.docs){
        const d=doc.data();
        assert(ROLES.includes(d.role));
        profiles.push({uid:doc.id,email:String(d.email||""),role:d.role,status:d.status});
        assert(profiles.length<=MAX_PROFILES);
      }
      if(batch.size<PAGE)break;
      last=batch.docs[batch.docs.length-1];
    }
    const groups=gmailGroups(profiles), targets=[...groups.values()].flat();
    const gmailIds=[...new Set(targets.map(p=>p.uid))];
    assert(gmailIds.length===targets.length,"Multiple query records for one UID");
    const ids=new Set(gmailIds);
    const emails=new Map();
    for(const p of targets){
      const e=p.email.trim().toLowerCase();
      if(!emails.has(e))emails.set(e,new Set());
      emails.get(e).add(p.uid);
    }
    const authInfo=new Map();
    for(let i=0;i<gmailIds.length;i+=AUTH_PAGE){
      const page=await auth.getUsers(gmailIds.slice(i,i+AUTH_PAGE).map(uid=>({uid})));
      for(const record of page.users){
        authInfo.set(record.uid,{
          canonical:gmailKey(record.email),
          verified:record.emailVerified===true,
          disabled:record.disabled===true,
        });
      }
    }
    const orphanIds=new Set(gmailIds.filter(uid=>!authInfo.has(uid)));
    const duplicates=[...groups.entries()].filter(([,g])=>new Set(g.map(p=>p.uid)).size>1);
    // Read cross-collection references without collecting record contents.
    const references=new Map();
    const nestedOwnerIds=new Set();
    const hitsByType={events_and_attendance:0,certificates:0,
      donations_and_assistance:0,emergency_reports:0,
      user_profiles_and_subcollections:0,other_records:0};
    let scannedDocs=0,rootCollectionsScanned=0;
    async function scanCollection(ref,root,depth=0){
      assert(depth<=MAX_DEPTH,"Exceeded bounded nested history scan depth");
      // Cap all reads including user's nested records and reference docs.
      let cursor=null;
      while(true){
        let q=ref.orderBy(FieldPath.documentId()).limit(PAGE);
        if(cursor)q=q.startAfter(cursor);
        const page=await q.get();
        for(const doc of page.docs){
          scannedDocs++;
          assert(scannedDocs<=MAX_DOCS,"Review with smaller scoped partitions before scanning further");
          const segments=doc.ref.path.split("/");
          for(const id of orphanIds){
            if(segments.includes(id) && segments[0]==="users" && segments.length>2)
              nestedOwnerIds.add(id);
          }
          // Each target users/{uid} profile references itself by definition;
          // omit only that self-document, still scan its subcollections.
          const self=segments.length===2 && segments[0]==="users" && ids.has(doc.id);
          if(!self){
            const found=new Set();
            if(ids.has(doc.id))found.add(doc.id); // e.g. volunteerApplications/{uid}
            findTargetRefs(doc.data(),ids,emails,found);
            if(found.size){
              hitsByType[classifyRoot(root)]++;
              for(const uid of found)references.set(uid,(references.get(uid)||0)+1);
            }
          }
          const children=await doc.ref.listCollections();
          if(children.length && depth>=MAX_DEPTH)
            throw new Error("Nested history scan depth exceeded");
          for(const child of children)await scanCollection(child,root,depth+1);
        }
        if(page.size<PAGE)break;
        cursor=page.docs[page.docs.length-1];
      }
    }
    const roots=await db.listCollections();
    assert(roots.length<=300,"Root collection count exceeds audit cap");
    for(const root of roots){
      rootCollectionsScanned++;
      await scanCollection(root,root.id);
    }
    const authMissingWithReferences=[...orphanIds].filter(id=>references.has(id));
    const authMissingWithNestedRecords=[...orphanIds].filter(id=>nestedOwnerIds.has(id));
    const groupsWithReferences=duplicates.filter(([,g])=>g.some(p=>references.has(p.uid)));
    const groupsWithAuth=duplicates.filter(([,g])=>g.some(p=>authInfo.has(p.uid)));
    const summary={
      mode:"READ_ONLY_GMAIL_ORPHAN_HISTORY_INVESTIGATION",
      project:PROJECT,
      communityProfilesReviewed:profiles.length,
      gmailProfiles:targets.length,
      distinctGmailMailboxKeys:groups.size,
      duplicateGmailGroups:duplicates.length,
      affectedDuplicateProfiles:duplicates.reduce((n,[,g])=>n+g.length,0),
      duplicateGroupsWithHistoryReferences:groupsWithReferences.length,
      duplicateGroupsWithAnyMatchingAuth:groupsWithAuth.length,
      gmailProfilesWithMatchingAuth:authInfo.size,
      gmailProfilesWithoutMatchingAuth:orphanIds.size,
      missingAuthProfilesWithHistoryReferences:authMissingWithReferences.length,
      missingAuthProfilesWithNestedRecords:authMissingWithNestedRecords.length,
      missingAuthProfilesWithoutDetectedHistory:[...orphanIds].filter(id=>!references.has(id)&&!nestedOwnerIds.has(id)).length,
      historyRecordsScanned:scannedDocs,
      rootCollectionsScanned,
      recordsReferencingTargetsByCategory:hitsByType,
      privateEmailsOrUidsPrinted:false,
      productionWrites:"NONE",
      disposition:"MANUAL_ACCOUNT_OWNERSHIP_AND_REFERENCE_REVIEW_REQUIRED; NO AUTOMATED_DELETION_OR_BACKFILL"
    };
    console.log(JSON.stringify(summary,null,2));
    if(duplicates.length||orphanIds.size)process.exitCode=2;
  } finally {await deleteApp(app);}
}
