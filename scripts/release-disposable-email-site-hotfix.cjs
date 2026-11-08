#!/usr/bin/env node
"use strict";
/**
 * One-time guarded live-site-derived disposable-mail Signup release.
 * Full code and Hosting changes are restricted to a frozen approved site SHA.
 * Modes are read-only except --publish-rules and --restore-rules.
 * No user-record, Auth UID, Storage, functions, or Render writes.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const cp=require("node:child_process");
const crypto=require("node:crypto");
const {createRequire}=require("node:module");
const req=createRequire(path.resolve(__dirname,"../functions/package.json"));
const PROJECT="volunserve-3aa5b";
const SITE_BASE="7d14e438b34501ecfd872f1eb4244b5c225c779f";
const SITE_CANDIDATE="681c65eba80ea7ef8733a6b1e6047ea1c2a722ea";
const PREVIOUS_RULES_COMMIT="de2fac77d54c4cb0def3092c3fe4569404353d0e";
const RULES_CANDIDATE_BLOB="6f65f4d54624020138111c6358d031100d06ec26";
const BACKUP="signup-reviewed-preview-20261109";
const PREVIEW="signup-en2ch-preview-20261109";
const ROOT=path.resolve(__dirname,"..");
const SITE=path.resolve(ROOT,"../site");
const SHA=s=>crypto.createHash("sha256").update(s).digest("hex");
const git=(cwd,...args)=>cp.execFileSync("git",args,{cwd,encoding:"utf8"}).trim();
const read=(p)=>fs.readFileSync(p,"utf8");
const projectUrl="https://firebaserules.googleapis.com/v1/";
const releaseName="projects/"+PROJECT+"/releases/cloud.firestore";
const oldRules=()=>cp.execFileSync("git",["show",PREVIOUS_RULES_COMMIT+":firestore.rules"],{cwd:ROOT,encoding:"utf8"});
const newRules=()=>read(path.join(ROOT,"firestore.rules"));
const backupFile=()=>path.join(process.env.RUNNER_TEMP||"/not-authorized","volunserve-en2ch-original-ruleset.json");
async function http(url,options={}){
 const r=await fetch(url,{...options,signal:AbortSignal.timeout(22000)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error("BLOCKED: Firebase/Hosting API HTTP "+r.status+" at "+new URL(url).pathname+
  ": "+String(data.error?.message||"no detail").slice(0,250));
 return data;
}
async function token(){
 const {cert}=req("firebase-admin/app");
 const credential=JSON.parse(process.env.VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT||"null");
 assert.equal(credential?.project_id,PROJECT,"Wrong protected Firebase credential");
 return (await cert(credential).getAccessToken()).access_token;
}
async function readRules(t){
 const releases=await http(projectUrl+"projects/"+PROJECT+"/releases?pageSize=100",
  {headers:{Authorization:"Bearer "+t}});
 const active=(releases.releases||[]).find(r=>r.name===releaseName);
 assert(active?.rulesetName,"BLOCKED: expected existing Firestore Rules release missing");
 const ruleset=await http(projectUrl+active.rulesetName,{headers:{Authorization:"Bearer "+t}});
 assert.equal(ruleset.source?.files?.length,1,"BLOCKED: multiple Rules files need manual review");
 return {name:active.rulesetName,source:ruleset.source.files[0].content};
}
async function patch(t,rulesetName){
 assert.match(rulesetName,/^projects\/volunserve-3aa5b\/rulesets\/[A-Za-z0-9_-]+$/);
 const data=await http(projectUrl+releaseName,{
  method:"PATCH",headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"},
  body:JSON.stringify({release:{name:releaseName,rulesetName},updateMask:"rulesetName"})
 });
 assert.equal(data.name,releaseName);
 assert.equal(data.rulesetName,rulesetName);
}
async function marker(url){
 const result=await http(url,{headers:{"Cache-Control":"no-cache"}});
 assert.equal(result.app,"VolunServe");
 assert.equal(result.firebaseProject,PROJECT);
 return result;
}
function approvedSiteDiff(){
 assert.equal(git(SITE,"rev-parse","HEAD"),SITE_CANDIDATE);
 assert.equal(git(ROOT,"hash-object","firestore.rules"),RULES_CANDIDATE_BLOB);
 cp.execFileSync("git",["merge-base","--is-ancestor",SITE_BASE,SITE_CANDIDATE],{cwd:SITE});
 const changed=git(SITE,"diff","--name-status","--no-renames",SITE_BASE,SITE_CANDIDATE)
  .split("\n").filter(Boolean).sort();
 const approved=[
  "M\tcomponents/auth/EmailFirstSignup.tsx",
  "M\tlib/registrationEmailPolicy.ts",
  "M\tlib/signupRegistration.ts",
  "M\tscripts/test-signup-prod.cjs",
 ].sort();
 assert.deepEqual(changed,approved,"BLOCKED: site-derived candidate changed unrelated published UI");
 for(const file of ["lib/registrationEmailPolicy.ts","lib/signupRegistration.ts"]){
  assert.equal(read(path.join(SITE,file)),read(path.join(ROOT,file)),
   "BLOCKED: published policy not identical to reviewed protected code "+file);
 }
 // The published signup component has its own approved visual typography.
 // Only its session guard may differ from the frozen published component.
 const original=cp.execFileSync("git",["show",SITE_BASE+":components/auth/EmailFirstSignup.tsx"],
  {cwd:SITE,encoding:"utf8"});
 const before="      setCompletedProfile(false);\n      setSignedInUser(user);\n      if (!user) { setStep(1); setChecking(false); return; }\n      try {";
 const replacement="      setCompletedProfile(false);\n"+
  "      // Do not resume a pending Auth UID with a newly blocked disposable domain.\n"+
  "      const blockedEmail = user ? getRegistrationEmailError(user.email || \"\") : null;\n"+
  "      if (blockedEmail && user) {\n"+
  "        setSignedInUser(null);\n        setStep(1);\n        setError(blockedEmail);\n"+
  "        setChecking(false);\n        if (auth.currentUser?.uid === user.uid) {\n"+
  "          void signOut(auth).catch(() => {\n"+
  "            // Never expose this unapproved account in the signup wizard.\n"+
  "          });\n        }\n        return;\n      }\n"+
  "      setSignedInUser(user);\n      if (!user) { setStep(1); setChecking(false); return; }\n      try {";
 assert.equal(original.split(before).length,2,"BLOCKED: frozen Signup session flow shifted");
 assert.equal(read(path.join(SITE,"components/auth/EmailFirstSignup.tsx")),
  original.replace(before,replacement),"BLOCKED: published Signup UI changed beyond session deny");
 const policy=read(path.join(SITE,"lib/registrationEmailPolicy.ts"));
 assert(policy.includes('"en2ch.com", "en2ch.co"'),"BLOCKED: required disposable domains absent");
 const rules=newRules();
 assert(rules.includes('!request.resource.data.email.matches(".*@([a-z0-9-]+[.])*en2ch[.](com|co)")'),
  "BLOCKED: Firestore direct SDK prevention missing");
}
async function verifyRepo(){
 assert.equal(process.env.GITHUB_REPOSITORY,"calibosofroyarjan-volunserve/VolunServe");
 assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected");
 assert.equal(git(ROOT,"rev-parse","HEAD"),process.env.GITHUB_SHA);
 assert.equal(git(ROOT,"ls-remote","--heads","origin","live-protected").split(/\s+/)[0],
  process.env.GITHUB_SHA,"BLOCKED: protected source is stale");
 approvedSiteDiff();
}
async function verifyExistingBackup(t){
 const base="https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/channels/";
 const [backup,live]=await Promise.all([
  http(base+BACKUP,{headers:{Authorization:"Bearer "+t}}),
  http(base+"live",{headers:{Authorization:"Bearer "+t}})
 ]);
 assert(backup.release?.version?.name && live.release?.version?.name,
  "BLOCKED: current or reviewed existing Hosting version missing");
 assert.equal(backup.release.version.name,live.release.version.name,
  "BLOCKED: existing reviewed Signup version is not the exact live backup");
 const bm=await marker(new URL("/volunserve-release.json",backup.url).href);
 assert.equal(bm.revision,SITE_BASE,
  "BLOCKED: existing reviewed backup marker does not match the current live website");
 console.log("PASS: existing immutable Signup preview equals current production Hosting version");
}
async function main(){
 const mode=process.argv[2]||"--self-test";
 assert(["--self-test","--check-source","--preflight","--verify-backup","--publish-rules",
  "--verify","--restore-rules"].includes(mode),"Unknown mode");
 if(mode==="--self-test"){
  assert.equal(BACKUP,"signup-reviewed-preview-20261109");
  assert.equal(PREVIEW,"signup-en2ch-preview-20261109");
  assert.equal(SITE_CANDIDATE.length,40);
  console.log("PASS: controlled site-derived hotfix constants");
  return;
 }
 if(mode==="--check-source") {
  approvedSiteDiff();
  console.log("PASS: frozen production UI unchanged beyond reviewed site-derived hotfix");
  return;
 }
 await verifyRepo();
 const t=await token();
 const rules=await readRules(t);
 if(mode==="--preflight"||mode==="--verify-backup"){
  const m=await marker("https://volunserve.com/volunserve-release.json");
  assert.equal(m.revision,SITE_BASE,"BLOCKED: live Hosting has drifted");
  assert.equal(rules.source,oldRules(),"BLOCKED: active production Rules have drifted");
  if(mode==="--verify-backup") await verifyExistingBackup(t);
  console.log("PASS: exact original live Hosting and Firestore Rules are preserved");
  return;
 }
 if(mode==="--publish-rules"){
  assert.equal(rules.source,oldRules(),"BLOCKED: production Rules changed before activation");
  assert(fs.existsSync(process.env.RUNNER_TEMP||""),"BLOCKED: unsafe runner backup location");
  fs.writeFileSync(backupFile(),JSON.stringify({name:rules.name,hash:SHA(rules.source)}));
  const created=await http(projectUrl+"projects/"+PROJECT+"/rulesets",{
    method:"POST",headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"},
    body:JSON.stringify({source:{files:[{name:"firestore.rules",content:newRules()}]}})
  });
  assert.match(created.name||"",/^projects\/volunserve-3aa5b\/rulesets\/[A-Za-z0-9_-]+$/);
  await patch(t,created.name);
  assert.equal((await readRules(t)).source,newRules(),"BLOCKED: activated Rules content differs");
  console.log("PASS: exact reviewed Firestore email guard activated");
  return;
 }
 if(mode==="--restore-rules"){
  const metadata=JSON.parse(read(backupFile()));
  assert.equal(metadata.hash,SHA(oldRules()),"BLOCKED: saved backup differs from immutable original");
  if(rules.source===oldRules()){console.log("PASS: original Rules already active");return;}
  assert.equal(rules.source,newRules(),"BLOCKED: cannot restore unknown external Rules change");
  await patch(t,metadata.name);
  assert.equal((await readRules(t)).source,oldRules(),"BLOCKED: Rules restoration not verified");
  console.log("PASS: original Firestore Rules restored");
  return;
 }
 if(mode==="--verify"){
  const m=await marker("https://volunserve.com/volunserve-release.json");
  assert.equal(m.revision,SITE_CANDIDATE,"BLOCKED: live site not exact reviewed source");
  assert.equal(rules.source,newRules(),"BLOCKED: production Firestore Rules not reviewed candidate");
  console.log("SUCCESS: exact reviewed disposable email Signup patch and Firestore guard live");
 }
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
