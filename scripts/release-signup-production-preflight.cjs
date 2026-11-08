#!/usr/bin/env node
"use strict";
/*
 * One-time protected VolunServe Signup release integrity gate.
 * Status/preflight modes are read-only. --publish-rules and --restore-rules
 * explicitly update only the existing cloud.firestore Rules release via PATCH.
 * NEVER creates a duplicate Firestore release or touches records/Auth/Storage.
 */
const assert=require("node:assert/strict");
const {createRequire}=require("node:module");
const {resolve}=require("node:path");
const fs=require("node:fs");
const cp=require("node:child_process");
const crypto=require("node:crypto");
const reqFns=createRequire(resolve(__dirname,"../functions/package.json"));
const PROJECT="volunserve-3aa5b";
const APPROVED_SOURCE="7d14e438b34501ecfd872f1eb4244b5c225c779f";
const EXPECTED_SITE="f7bc8d12d8e926365175afb5288f2adf214025a5";
const EXPECTED_RULES_HASH="33ee467017becf62d47932e899d113560ebbb19da4d47cb221a2eb04b1eedefb";
const releaseName="projects/"+PROJECT+"/releases/cloud.firestore";
const sha=s=>crypto.createHash("sha256").update(String(s)).digest("hex");
const clean=x=>String(x||"").trim();
async function get(url,token){
 const headers=token?{Authorization:"Bearer "+token}:{"cache-control":"no-cache"};
 const res=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
 assert(res.ok,"BLOCKED: GET "+new URL(url).pathname+" returned HTTP "+res.status);
 return res.json();
}
async function currentState(token) {
 const [marker,releases]=await Promise.all([
  get("https://volunserve.com/volunserve-release.json"),
  get("https://firebaserules.googleapis.com/v1/projects/"+PROJECT+"/releases?pageSize=100",token)
 ]);
 assert.equal(marker.app,"VolunServe");
 assert.equal(marker.firebaseProject,PROJECT);
 const active=(releases.releases||[]).find(x=>x.name===releaseName);
 assert(active?.rulesetName,"BLOCKED: expected current default Firestore ruleset missing");
 const rules=await get("https://firebaserules.googleapis.com/v1/"+active.rulesetName,token);
 assert.equal(rules.source?.files?.length,1,"BLOCKED: deployed Rules source is not a single file");
 return {marker,activeRuleset:active.rulesetName,rulesHash:sha(rules.source.files[0].content),
  rulesSource:rules.source.files[0].content};
}
const rulesApiRoot="https://firebaserules.googleapis.com/v1/";
function backupPath() {
 const p=process.env.ORIGINAL_RULES_PATH;
 assert(p&&process.env.RUNNER_TEMP&&p.startsWith(process.env.RUNNER_TEMP+"/"),
  "BLOCKED: original Rules backup must be inside protected runner temp");
 return p;
}
function readOriginalBackup() {
 const original=fs.readFileSync(backupPath(),"utf8");
 const meta=JSON.parse(fs.readFileSync(backupPath()+".metadata.json","utf8"));
 assert.equal(meta.hash,EXPECTED_RULES_HASH,"BLOCKED: original backup hash mismatch");
 assert.equal(sha(original),meta.hash,"BLOCKED: saved source does not match original");
 assert.match(meta.rulesetName,/^projects\/volunserve-3aa5b\/rulesets\/[A-Za-z0-9_-]+$/);
 return meta;
}
async function rulesWrite(method,path,token,body) {
 const res=await fetch(rulesApiRoot+path,{
  method,headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify(body),signal:AbortSignal.timeout(25000)
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok){
  const detail=String(data?.error?.message||"no detail").slice(0,350);
  throw Error("BLOCKED: existing-release Firebase Rules API "+method+" HTTP "+res.status+": "+detail);
 }
 return data;
}
async function patchExistingRelease(token,rulesetName) {
 assert.match(rulesetName,/^projects\/volunserve-3aa5b\/rulesets\/[A-Za-z0-9_-]+$/);
 const result=await rulesWrite("PATCH",releaseName+"?updateMask=rulesetName",token,{
  release:{name:releaseName,rulesetName},updateMask:"rulesetName"
 });
 assert.equal(result.name,releaseName,"BLOCKED: Firebase Rules PATCH returned wrong release");
 assert.equal(result.rulesetName,rulesetName,"BLOCKED: PATCH did not select expected ruleset");
}
async function selfPermissions(token){
 const perms=[
  "firebaserules.rulesets.create",
  "firebaserules.releases.update",
  "firebasehosting.sites.update",
 ];
 const url="https://cloudresourcemanager.googleapis.com/v1/projects/"+PROJECT+":testIamPermissions";
 const res=await fetch(url,{
  method:"POST",
  headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify({permissions:perms}),
  signal:AbortSignal.timeout(20000)
 });
 assert(res.ok,"BLOCKED: cannot verify publishing IAM permissions, HTTP "+res.status);
 const json=await res.json();
 const have=new Set(json.permissions||[]);
 const missing=perms.filter(p=>!have.has(p));
 console.log("IAM PERMISSION CHECK "+JSON.stringify({checked:perms,missing}));
 assert.equal(missing.length,0,
  "BLOCKED: missing production Rules/Hosting publisher permissions (read-only Viewer is insufficient)");
}
async function main() {
 const mode=process.argv[2]||"--check";
 assert(["--check","--backup-rules","--publish-rules","--restore-rules","--after-rules","--verify"].includes(mode),"Unknown mode");
 assert.equal(process.env.GITHUB_REPOSITORY,
  "calibosofroyarjan-volunserve/VolunServe");
 assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected",
  "BLOCKED: release orchestration must be from protected live branch");
 const remote=cp.execFileSync("git",["ls-remote","--heads","origin","live-protected"],
  {encoding:"utf8"}).split(/\s+/)[0];
 assert.equal(remote,process.env.GITHUB_SHA,
  "BLOCKED: protected release orchestrator has newer commits");
 const candidate=cp.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 assert.equal(candidate,APPROVED_SOURCE,"BLOCKED: source is not tested immutable signup candidate");
 const sourceBranch=cp.execFileSync("git",[
  "ls-remote","--heads","origin","release/signup-preserve-published-site-20261109"],
  {encoding:"utf8"}).split(/\s+/)[0];
 assert.equal(sourceBranch,APPROVED_SOURCE,"BLOCKED: reviewed signup branch moved");
 const ancestry=cp.spawnSync("git",["merge-base","--is-ancestor",EXPECTED_SITE,candidate]);
 assert.equal(ancestry.status,0,"BLOCKED: candidate not derived from published website");
 const project=JSON.parse(process.env.VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT||"null");
 assert.equal(project?.project_id,PROJECT,"BLOCKED: wrong or missing protected Firebase service account");
 const token=(await reqFns("firebase-admin/app").cert(project).getAccessToken()).access_token;
 const state=await currentState(token);
 const expectedCandidateRulesHash=sha(fs.readFileSync("firestore.rules","utf8"));
 if(mode==="--check") {
  assert.equal(state.marker.revision,EXPECTED_SITE,
   "BLOCKED: live Hosting revision changed — do not overwrite");
  assert.equal(state.rulesHash,EXPECTED_RULES_HASH,
   "BLOCKED: live Firestore Rules changed — do not overwrite");
  await selfPermissions(token);
  console.log("PASS: production source, IAM and current live Rules/Hosting baselines");
 } else if(mode==="--backup-rules"){
  assert.equal(state.marker.revision,EXPECTED_SITE,"BLOCKED: website changed before Rules backup");
  assert.equal(state.rulesHash,EXPECTED_RULES_HASH,"BLOCKED: Rules changed before backup");
  const destination=backupPath();
  fs.writeFileSync(destination,state.rulesSource,{encoding:"utf8",mode:0o600,flag:"wx"});
  fs.writeFileSync(destination+".metadata.json",JSON.stringify({
    rulesetName:state.activeRuleset,hash:state.rulesHash,
    revision:state.marker.revision
  }),{encoding:"utf8",mode:0o600,flag:"wx"});
  console.log("PASS: exact current live Rules source and Ruleset ID backed up to ephemeral runner");
 } else if(mode==="--publish-rules"){
  // Never attempt to CREATE another cloud.firestore release. Firebase CLI's
  // updateOrCreateRelease() incorrectly falls back to POST when PATCH fails,
  // producing HTTP 409 for the existing default release.
  const saved=readOriginalBackup();
  assert.equal(saved.rulesetName,state.activeRuleset,"BLOCKED: original release pointer changed");
  assert.equal(state.rulesHash,EXPECTED_RULES_HASH,"BLOCKED: Firestore Rules changed before publish");
  assert.equal(state.marker.revision,EXPECTED_SITE,"BLOCKED: Hosting changed before Rules publish");
  const rulesSource=fs.readFileSync("firestore.rules","utf8");
  assert.equal(sha(rulesSource),expectedCandidateRulesHash);
  const ruleset=await rulesWrite("POST","projects/"+PROJECT+"/rulesets",token,{
    source:{files:[{name:"firestore.rules",content:rulesSource}]}
  });
  assert.match(ruleset.name||"",/^projects\/volunserve-3aa5b\/rulesets\/[A-Za-z0-9_-]+$/);
  console.log("PASS: candidate Ruleset uploaded without updating active production rules");
  await patchExistingRelease(token,ruleset.name);
  console.log("PASS: explicit PATCH of existing Firestore Rules release accepted; verify live hash next");
 } else if(mode==="--restore-rules"){
  const saved=readOriginalBackup();
  if(state.rulesHash===EXPECTED_RULES_HASH){
    console.log("PASS: original production Rules already live — no rollback write required");
  }else{
    assert.equal(state.rulesHash,expectedCandidateRulesHash,
      "BLOCKED: unexpected third-party Rules revision; refusing to overwrite");
    await patchExistingRelease(token,saved.rulesetName);
    const restored=await currentState(token);
    assert.equal(restored.rulesHash,EXPECTED_RULES_HASH,
      "BLOCKED: cannot verify original production Firestore Rules restored");
    console.log("PASS: original Firestore Rules release restored via explicit PATCH");
  }
 } else if(mode==="--after-rules"){
  assert.equal(state.marker.revision,EXPECTED_SITE,
   "BLOCKED: live Hosting changed while Rules published");
  assert.equal(state.rulesHash,expectedCandidateRulesHash,
   "BLOCKED: candidate Firestore Rules NOT verified live — do not publish Hosting");
  console.log("PASS: candidate Rules verified; existing website has not been overwritten");
 } else {
  assert.equal(state.marker.revision,APPROVED_SOURCE,
   "BLOCKED: production Hosting does not serve reviewed signup candidate");
  assert.equal(state.rulesHash,expectedCandidateRulesHash,
   "BLOCKED: production Rules do not match tested signup policy");
  console.log("PASS: production Hosting and Firestore Rules both serve tested signup candidate");
 }
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
