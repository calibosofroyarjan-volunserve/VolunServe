#!/usr/bin/env node
"use strict";

/**
 * VolunServe private owner-review dossier (READ-ONLY Firebase).
 *
 * Run interactively by an authorized project owner on their own Cloud Shell.
 * NEVER run in GitHub Actions, print contents to CI logs, or commit the output.
 * Output is private LOCAL JSON (mode 0600 under a fresh mode-0700 directory).
 * No Auth/Firestore updates, deletion, claim backfill or merge functionality.
 *
 * An orphan profile with historical links must be PRESERVED. No automated
 * "legitimate owner" determination is possible from email text alone.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {createRequire} = require("node:module");

const PROJECT = "volunserve-3aa5b";
const ROLES = ["resident","volunteer"];
const MAX_PROFILES = 20000;
const MAX_SCANNED = 12000;
const MAX_DEPTH = 8;
const PAGE = 200;
const HISTORY_SAMPLES = 12;

function canonicalGmail(raw) {
  const value = String(raw || "").trim().toLowerCase(), parts = value.split("@");
  if(parts.length !== 2 || !parts[0] ||
     !["gmail.com","googlemail.com"].includes(parts[1])) return null;
  const local = parts[0].split("+")[0].replace(/\./g,"");
  return local && local.length <= 64 ? local + "@gmail.com" : null;
}
function groupProfiles(profiles) {
  const groups = new Map();
  for(const profile of profiles) {
    const canonical = canonicalGmail(profile.email);
    if(!canonical) continue;
    if(!groups.has(canonical)) groups.set(canonical, []);
    groups.get(canonical).push(profile);
  }
  return groups;
}
function refsIn(value, targetIds, byEmail, found, depth=0, seen=new Set()) {
  if(value == null || depth > 20) return;
  if(typeof value === "string") {
    if(targetIds.has(value)) found.add(value);
    const e = value.trim().toLowerCase();
    if(byEmail.has(e)) for(const uid of byEmail.get(e)) found.add(uid);
    for(const match of value.matchAll(/(?:^|\/)users\/([A-Za-z0-9_-]+)(?=$|\/)/g)) {
      if(targetIds.has(match[1])) found.add(match[1]);
    }
    return;
  }
  if(typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if(typeof value.path === "string") refsIn(value.path,targetIds,byEmail,found,depth+1,seen);
  if(["Timestamp","GeoPoint","Bytes","Buffer"].includes(value.constructor?.name)) return;
  const nested = Array.isArray(value) ? value : Object.entries(value)
    .filter(([key])=>!key.startsWith("_")).map(([,val])=>val);
  for(const child of nested) refsIn(child,targetIds,byEmail,found,depth+1,seen);
}
function categoryFor(root) {
  const id = root.toLowerCase();
  if(id.includes("event") || id.includes("attend")) return "events_attendance";
  if(id.includes("certificat")) return "certificates";
  if(id.includes("donat") || id.includes("assist") || id.includes("campaign")) return "donations_assistance";
  if(id.includes("emergency") || id.includes("incident") || id.includes("report")) return "emergency_reports";
  if(id === "users") return "user_profiles";
  return "other";
}
function selfTest() {
  const list = [
    {uid:"1",email:"a.b@gmail.com"},
    {uid:"2",email:"ab@googlemail.com"},
    {uid:"3",email:"ab@yahoo.com"},
    {uid:"4",email:"other@gmail.com"}
  ];
  assert.equal(canonicalGmail("A.B+promo@GMAIL.COM"),"ab@gmail.com");
  assert.equal(canonicalGmail("ab@outlook.com"),null);
  assert.equal(canonicalGmail("something@gmail.com.attacker.test"),null);
  assert.equal(groupProfiles(list).get("ab@gmail.com").length,2);
  const ids = new Set(["1","2"]), byEmail=new Map([["a.b@gmail.com",new Set(["1"])]]);
  const found=new Set();
  refsIn({reporter:"1",userPath:"users/2",extra:[{email:"a.b@gmail.com"}]},ids,byEmail,found);
  assert.deepEqual([...found].sort(),["1","2"]);
  assert.equal(categoryFor("communityEvents"),"events_attendance");
  assert.equal(categoryFor("donationCampaigns"),"donations_assistance");
  console.log("PASS: local-only reviewer data shapes, Gmail collisions, read-only history detection");
}
function arg(name) {
  const option=process.argv.find(x=>x.startsWith("--"+name+"="));
  return option ? option.slice(name.length+3) : null;
}
async function main() {
  // Refuse to put private identities in GitHub Actions logs or artifacts.
  assert(!process.env.GITHUB_ACTIONS && !process.env.CI,
    "Private report cannot run inside CI");
  assert(process.argv.includes("--confirm-private-owner-review"),
    "Owner-only flag required");
  assert(!process.env.VOLUNSERVE_PRODUCTION_AUDIT_CREDENTIAL,
    "Do not put private report contents into read-only GitHub CI secrets");
  assert(!process.env.FIREBASE_AUTH_EMULATOR_HOST &&
    !process.env.FIRESTORE_EMULATOR_HOST);
  assert(!process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT === PROJECT, "Wrong GCP project");
  const dir=arg("output-dir");
  assert(dir && path.isAbsolute(dir),"Provide absolute --output-dir outside the repository");
  const resolved=path.resolve(dir), workspace=fs.realpathSync(process.cwd());
  assert(resolved!==workspace && !resolved.startsWith(workspace+path.sep),
    "Private report must not be stored in the repository");
  assert(!fs.existsSync(resolved),"Choose a NEW private output directory");
  assert(path.dirname(resolved)!=="/","Do not write near filesystem root");
  assert(!resolved.startsWith(path.join(os.tmpdir(),"gha-")),
    "Use local owner workspace, not runner temp");
  const sdk=createRequire(path.resolve(__dirname,"../functions/package.json"));
  const {initializeApp,applicationDefault,deleteApp}=sdk("firebase-admin/app");
  const {getAuth}=sdk("firebase-admin/auth");
  const {getFirestore,FieldPath}=sdk("firebase-admin/firestore");
  const app=initializeApp({credential:applicationDefault(),projectId:PROJECT});
  try {
    const db=getFirestore(app),auth=getAuth(app);
    const profiles=[];
    let last=null;
    while(true) {
      let query=db.collection("users").where("role","in",ROLES)
        .orderBy(FieldPath.documentId()).select("email","fullName","role","status").limit(PAGE);
      if(last) query=query.startAfter(last);
      const page=await query.get();
      for(const doc of page.docs) {
        const data=doc.data();
        profiles.push({
          uid:doc.id,
          email:String(data.email||""),
          displayName:String(data.fullName||"").slice(0,160),
          role:data.role,profileStatus:data.status??null,
        });
        assert(profiles.length<=MAX_PROFILES, "Profile limit reached");
      }
      if(page.size<PAGE) break;
      last=page.docs[page.docs.length-1];
    }
    const groups=groupProfiles(profiles),gmail=[...groups.values()].flat();
    const ids=[...new Set(gmail.map(p=>p.uid))];
    assert(ids.length===gmail.length,"Duplicate UID rows");
    const idSet=new Set(ids), emailLookup=new Map();
    for(const p of gmail){
      const email=p.email.trim().toLowerCase();
      if(!emailLookup.has(email)) emailLookup.set(email,new Set());
      emailLookup.get(email).add(p.uid);
    }
    const authMap=new Map();
    for(let i=0;i<ids.length;i+=100){
      const resp=await auth.getUsers(ids.slice(i,i+100).map(uid=>({uid})));
      for(const item of resp.users){
        authMap.set(item.uid,{
          email:item.email||null,
          emailVerified:item.emailVerified,
          disabled:item.disabled,
          providerIds:item.providerData.map(p=>p.providerId),
          createdAt:item.metadata?.creationTime||null,
          lastSignInAt:item.metadata?.lastSignInTime||null,
        });
      }
    }
    const linkMap=new Map(ids.map(uid=>[uid,{
      total:0, categories:{}, samplePaths:[], hasNestedUserRecords:false,
    }]));
    let scanned=0;
    async function scan(ref,root,depth=0){
      assert(depth<=MAX_DEPTH,"History nesting exceeds supported bound");
      let lastSnap=null;
      while(true){
        let q=ref.orderBy(FieldPath.documentId()).limit(PAGE);
        if(lastSnap) q=q.startAfter(lastSnap);
        const page=await q.get();
        for(const doc of page.docs){
          scanned++;
          assert(scanned<=MAX_SCANNED,"More than 12,000 records; report not complete");
          const segments=doc.ref.path.split("/");
          if(segments[0]==="users" && segments.length>2 && idSet.has(segments[1])){
            linkMap.get(segments[1]).hasNestedUserRecords=true;
          }
          const found=new Set();
          // A collection document can be keyed by UID, e.g. volunteerApplications/{uid}.
          if(idSet.has(doc.id)) found.add(doc.id);
          refsIn(doc.data(),idSet,emailLookup,found);
          // Do not count a user's own profile as an external dependency.
          if(segments.length===2 && root==="users" && idSet.has(doc.id)) found.delete(doc.id);
          for(const uid of found){
            const link=linkMap.get(uid);
            link.total++;
            const category=categoryFor(root);
            link.categories[category]=(link.categories[category]||0)+1;
            if(link.samplePaths.length<HISTORY_SAMPLES) link.samplePaths.push(doc.ref.path);
          }
          const children=await doc.ref.listCollections();
          assert(!(children.length && depth>=MAX_DEPTH),
            "Nested history incomplete; manual partition needed");
          for(const child of children) await scan(child,root,depth+1);
        }
        if(page.size<PAGE) break;
        lastSnap=page.docs[page.docs.length-1];
      }
    }
    const roots=await db.listCollections();
    assert(roots.length<=300,"Root collection cap reached");
    for(const root of roots) await scan(root,root.id);
    const accountRow = p => {
      const authState=authMap.get(p.uid)||null;
      return {
        uid:p.uid,
        profileEmail:p.email,
        displayName:p.displayName,
        role:p.role,
        profileStatus:p.profileStatus,
        authRecord:authState,
        authState:authState ? "AUTH_UID_PRESENT" : "AUTH_UID_MISSING",
        history:linkMap.get(p.uid),
        reviewerDecision:"PENDING_PROOF_OF_ACCOUNT_OWNERSHIP",
        manualActionsOnly:true,
      };
    };
    const duplicateGroups=[...groups].filter(([,group])=>group.length>1)
      .map(([key,group])=>({
        canonicalMailbox:key,
        entries:group.map(accountRow),
        reviewInstruction:"Verify original account ownership privately. Preserve all historical references; do not select winner automatically.",
      }));
    const orphanProfiles=gmail.filter(p=>!authMap.has(p.uid)).map(accountRow);
    const report={
      purpose:"PRIVATE_ACCOUNT_OWNERSHIP_AND_HISTORICAL_RECORD_REVIEW_ONLY",
      projectId:PROJECT,
      generatedAt:new Date().toISOString(),
      coverage:{rootCollections:roots.length,historyDocuments:scanned,
        communityProfiles:profiles.length,gmailProfiles:gmail.length,
        duplicateGroups:duplicateGroups.length,orphanProfiles:orphanProfiles.length},
      duplicateGroups,
      orphanProfiles,
      instructions:[
        "KEEP this private file outside GitHub, public chats and shared drives.",
        "Verify identity with authorized owner through existing trusted contact channels and evidence; matching email spelling alone is not ownership proof.",
        "Review each entry's linked historical documents before any remediation. These paths may be possible references, not verified legal ownership.",
        "Never delete, merge, reactivate, reassign or backfill claims automatically. Require separately reviewed and approved remediation with rollback.",
      ],
      operation:"FIREBASE_READ_ONLY",
    };
    // Local private file only, created after all reads pass; no partial report.
    fs.mkdirSync(resolved,{recursive:false,mode:0o700});
    fs.chmodSync(resolved,0o700);
    const output=path.join(resolved,"gmail-ownership-review.PRIVATE.json");
    fs.writeFileSync(output,JSON.stringify(report,null,2),{encoding:"utf8",flag:"wx",mode:0o600});
    console.log("PRIVATE owner review generated locally; "+gmail.length+
      " Gmail profiles, "+duplicateGroups.length+" collisions, "+
      orphanProfiles.length+" missing Auth UIDs; "+
      scanned+" records scanned. No Firebase writes.");
    console.log("Local file (do not share publicly): "+output);
  } finally {
    await deleteApp(app);
  }
}
if(require.main===module){
  if(process.argv.includes("--self-test")) selfTest();
  else main().catch(e=>{
    // Never expose SDK errors containing sensitive identifiers/paths.
    console.error("Private review blocked/incomplete. Recheck local permissions and query limits.");
    process.exitCode=1;
  });
}
module.exports={canonicalGmail,groupProfiles,refsIn,categoryFor};
