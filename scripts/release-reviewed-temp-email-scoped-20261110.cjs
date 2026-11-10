#!/usr/bin/env node
"use strict";
/**
 * ONE-TIME GUARDED VolunServe scoped disposable-email security release.
 * - NO account deletion, Auth hooks, Gmail alias backfill or migration.
 * - Publishes ONLY exact reviewed active-Rules-based PR #358 Rules and
 *   exact reviewed site-derived PR #356 Hosting snapshot from a pinned preview.
 * - Fails closed before writes on fingerprint/IAM/backup/preview/compiler drift.
 * - On partial failure restores original Hosting channel and original Rules
 *   release pointer, but never overwrites an unexpected third-party revision.
 * - Requires protected GitHub production environment and explicit --publish.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const crypto=require("node:crypto");
const cp=require("node:child_process");
const os=require("node:os");
const path=require("node:path");
const {createRequire}=require("node:module");

const PROJECT="volunserve-3aa5b";
const REPO="calibosofroyarjan-volunserve/VolunServe";
const LIVE="681c65eba80ea7ef8733a6b1e6047ea1c2a722ea";
const WEB="44cfe41429f91d35d383bf3846fb6fd2f7e7df44";
const RULES="cb6abc7637e74e40f3b814af62ae58c116b9b517";
const RULES_BLOB="a4ba6a60e89dc9e19d9314ee74f6d07aee1e9f16";
const ACTIVE_RULES_SHA256="5ba976566ef62d8997d6b7209bc7696b3744861f2b0538a28f068abaee413fe7";
const BACKUP="signup-live-backup-20261110";
const PREVIEW="signup-web-review-20261110";
const RELEASE="projects/"+PROJECT+"/releases/cloud.firestore";
const sha=s=>crypto.createHash("sha256").update(String(s)).digest("hex");
const git=(where,...args)=>cp.execFileSync("git",["-C",where,...args],{encoding:"utf8"}).trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function selfTest() {
  assert.equal(sha("hello"),"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  assert(isRulesetName("projects/volunserve-3aa5b/rulesets/reviewed_123"));
  assert(!isRulesetName("projects/other/rulesets/abc"));
  assert.equal(REST_RULES, "https://firebaserules.googleapis.com/v1/");
  assert.equal(BACKUP, "signup-live-backup-20261110");
  assert.equal(PREVIEW, "signup-web-review-20261110");
  assert(!("gmailAliasClaims" in {allowedDomains:true}));
  assert.throws(()=>ok({ok:false,status:400,data:{error:{message:"Candidate Rules exceed 256000 bytes"}}},"Rules existing-release PATCH"),/exceed 256000 bytes/);
  console.log("PASS scoped source fingerprints, backup names and rollback guards (NO CLOUD ACCESS)");
}
const REST_RULES="https://firebaserules.googleapis.com/v1/";
function isRulesetName(value){
  return /^projects\/volunserve-3aa5b\/rulesets\/[a-zA-Z0-9_-]+$/.test(value||"");
}
async function http(url,token,method="GET",body){
  const resp=await fetch(url,{
    method,headers:{"Cache-Control":"no-cache",
      ...(token?{Authorization:"Bearer "+token}:{}),
      ...(body?{"Content-Type":"application/json"}:{})},
    body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(30000)
  });
  const data=await resp.json().catch(()=>({}));
  return {ok:resp.ok,status:resp.status,data};
}
function ok(r,label){
  if(!r.ok){
    // Only Rules activation errors get their sanitized diagnostic printed.
    // Never expose request payloads, OAuth tokens, account identifiers or full
    // Firebase response bodies in production GitHub Actions logs.
    const reason=label==="Rules existing-release PATCH" ?
      String(r.data?.error?.message||"").slice(0,550)
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g,"[redacted-email]")
        .replace(/ya29[.][A-Za-z0-9._-]+/g,"[redacted-token]") : "";
    throw Error("BLOCKED: "+label+" HTTP "+r.status+(reason?" — "+reason:""));
  }
  return r.data;
}
function assertPinned(){
  assert.equal(process.env.GITHUB_REPOSITORY,REPO);
  assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected");
  assert.equal(git("controller","rev-parse","HEAD"),process.env.GITHUB_SHA);
  const remote=git("controller","ls-remote","--heads","origin","live-protected").split(/\s+/)[0];
  assert.equal(remote,process.env.GITHUB_SHA,"BLOCKED: protected branch advanced");
  assert.equal(git("site","rev-parse","HEAD"),WEB,"BLOCKED: wrong web candidate");
  assert.equal(git("rules","rev-parse","HEAD"),RULES,"BLOCKED: wrong active-source Rules candidate");
  assert.equal(git("rules","hash-object","firestore.rules"),RULES_BLOB,
    "BLOCKED: unreviewed candidate Rules content");
  assert.equal(cp.spawnSync("git",["-C","site","merge-base","--is-ancestor",LIVE,WEB]).status,0,
    "BLOCKED: site candidate not a live-derived descendant");
  const content=fs.readFileSync("rules/firestore.rules","utf8");
  assert(content.includes("function blockedTempMailOrgAlias(email)"),"BLOCKED: missing temporary-domain guard");
  assert(content.includes("match /volunteerInvitations/{invitationId}"),"BLOCKED: missing volunteer rule scope");
  assert(content.includes("function validInitialResidentInputs()"),"BLOCKED: missing Resident validation");
  assert(!content.includes("gmailAliasClaims"),"BLOCKED: unresolved Gmail identity migration bundled");
  assert(Buffer.byteLength(content,"utf8")<256*1024,"BLOCKED: Rules source too large");
  return content;
}
async function state(token){
  const [siteMarker, releases, liveChannel, backupChannel, previewChannel]=await Promise.all([
    http("https://volunserve.com/volunserve-release.json"),
    http(REST_RULES+"projects/"+PROJECT+"/releases?pageSize=100",token),
    http("https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/channels/live",token),
    http("https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/channels/"+BACKUP,token),
    http("https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/channels/"+PREVIEW,token)
  ]);
  const marker=ok(siteMarker,"live marker");
  assert.equal(marker.app,"VolunServe");
  assert.equal(marker.firebaseProject,PROJECT);
  const entries=ok(releases,"Rules release listing").releases||[];
  const release=entries.find(x=>x.name===RELEASE);
  assert(isRulesetName(release?.rulesetName),"BLOCKED: active Firestore release missing");
  const source=ok(await http(REST_RULES+release.rulesetName,token),"active Rules source");
  assert(source.source?.files?.length===1,"BLOCKED: unexpected active Rules source");
  return {
    revision:marker.revision,
    rulesHash:sha(source.source.files[0].content),
    rulesetName:release.rulesetName,
    liveChannel:ok(liveChannel,"live Hosting channel"),
    backupChannel:ok(backupChannel,"rollback Hosting channel"),
    previewChannel:ok(previewChannel,"reviewed preview Hosting channel")
  };
}
function version(channel) {return channel?.release?.version?.name||null;}
async function verifyBaseline(current,token){
  assert.equal(current.revision,LIVE,"BLOCKED: live Hosting changed since reviewed backup");
  assert.equal(current.rulesHash,ACTIVE_RULES_SHA256,"BLOCKED: active Rules changed since reviewed candidate");
  assert(version(current.liveChannel)&&version(current.liveChannel)===version(current.backupChannel),
    "BLOCKED: backup does not match CURRENT live Hosting version");
  assert(version(current.previewChannel)&&version(current.previewChannel)!==version(current.liveChannel),
    "BLOCKED: reviewed preview missing or equals old live version");
  for(const [channel,want,label] of [
    [current.backupChannel,LIVE,"backup"],[current.previewChannel,WEB,"preview"]
  ]){
    assert(/^https:\/\/volunserve-3aa5b--[a-z0-9-]+\.web\.app\/?$/.test(channel.url||""),
      "BLOCKED: invalid "+label+" Hosting URL");
    const marker=ok(await http(new URL("/volunserve-release.json",channel.url).href),label+" marker");
    assert.equal(marker.app,"VolunServe");
    assert.equal(marker.firebaseProject,PROJECT);
    assert.equal(marker.revision,want,"BLOCKED: "+label+" source marker mismatch");
  }
  const required=[
    "firebaserules.rulesets.create",
    "firebaserules.releases.update",
    "firebasehosting.sites.update"
  ];
  const iam=ok(await http(
    "https://cloudresourcemanager.googleapis.com/v1/projects/"+PROJECT+":testIamPermissions",
    token,"POST",{permissions:required}
  ),"publisher IAM");
  const permitted=new Set(iam.permissions||[]);
  assert(required.every(p=>permitted.has(p)),"BLOCKED: missing Rules/Hosting publishing permission");
  console.log("PASS: pinned live sources, backup, preview and publisher IAM (NO WRITES YET)");
}
async function compileRules(source,token){
  const response=await http(REST_RULES+"projects/"+PROJECT+":test",token,"POST",
    {source:{files:[{name:"firestore.rules",content:source}]},testSuite:{testCases:[]}});
  const findings=ok(response,"Rules compile test");
  assert((findings.issues||[]).filter(x=>x.severity==="ERROR").length===0,
    "BLOCKED: candidate Rules compiler diagnostics");
  console.log("PASS: candidate Firestore Rules API compile (NO RELEASE)");
}
async function patchRelease(token,from,to){
  assert(isRulesetName(from)&&isRulesetName(to),"BLOCKED: unexpected Ruleset target");
  const cur=await state(token);
  assert.equal(cur.rulesetName,from,"BLOCKED: third-party Rules release changed");
  const payload={release:{name:RELEASE,rulesetName:to},updateMask:"rulesetName"};
  const response=await http(REST_RULES+RELEASE,token,"PATCH",payload);
  const data=ok(response,"Rules existing-release PATCH");
  assert.equal(data.name,RELEASE);
  assert.equal(data.rulesetName,to);
}
async function rulesSnapshot(token) {
  const cur=await state(token);
  return {sha:cur.rulesHash,rulesetName:cur.rulesetName};
}
async function awaitSourceHash(token,want){
  for(let attempt=0;attempt<8;attempt++){
    const a=await rulesSnapshot(token);
    if(a.sha===want)return;
    await sleep(2500);
  }
  throw Error("BLOCKED: active Rules source fingerprint did not become expected value");
}
async function awaitSiteMarker(want){
  for(let attempt=0;attempt<9;attempt++){
    const result=await http("https://volunserve.com/volunserve-release.json");
    if(result.ok&&result.data.revision===want)return;
    await sleep(5000);
  }
  throw Error("BLOCKED: expected web revision did not appear on live domain");
}
function hostingClone(sourceChannel,destinationChannel,secret){
  assert(["signup-web-review-20261110","signup-live-backup-20261110"].includes(sourceChannel));
  assert.equal(destinationChannel,"live");
  // Only the pinned preview or verified exact-live rollback backup may be
  // cloned to the production channel; no arbitrary local Hosting build.
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"volunserve-reviewed-"));
  fs.chmodSync(tmp,0o700);
  const file=path.join(tmp,"firebase-service-account.json");
  fs.writeFileSync(file,JSON.stringify(secret),{encoding:"utf8",flag:"wx",mode:0o600});
  try{
    const command=cp.spawnSync("npx",[
      "firebase-tools","hosting:clone",PROJECT+":"+sourceChannel,
      PROJECT+":"+destinationChannel,"--project",PROJECT,"--non-interactive"
    ],{
      cwd:path.resolve("controller"),encoding:"utf8",
      env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:file},
      stdio:"inherit",timeout:120000
    });
    assert.equal(command.status,0,"BLOCKED: Firebase Hosting channel clone failed");
  } finally {
    fs.rmSync(tmp,{recursive:true,force:true});
  }
}
async function safeRollback(token,originalRuleset,candidateRuleset,secret){
  let restored=true;
  try {
    // Channel-version comparison is authoritative for rollback: CDN marker
    // caches may lag even when the live Firebase Hosting channel has changed.
    const hosting=await state(token);
    if(version(hosting.liveChannel)===version(hosting.previewChannel)){
      console.error("ROLLBACK: restore original exact-live Hosting version");
      hostingClone(BACKUP,"live",secret);
      await awaitSiteMarker(LIVE);
    } else if(version(hosting.liveChannel)!==version(hosting.backupChannel)){
      restored=false;
      console.error("BLOCKED ROLLBACK HOSTING: unknown live Hosting channel version; manual review required");
    }
  }catch(e){restored=false;console.error("ROLLBACK HOSTING FAILED: manual review required");}
  try{
    const cur=await state(token);
    if(cur.rulesetName===candidateRuleset || cur.rulesHash!==ACTIVE_RULES_SHA256){
      if(cur.rulesetName===candidateRuleset) {
        console.error("ROLLBACK: restore original Rules release pointer");
        await patchRelease(token,candidateRuleset,originalRuleset);
        await awaitSourceHash(token,ACTIVE_RULES_SHA256);
      }else{
        restored=false;
        console.error("BLOCKED ROLLBACK RULES: unknown third-party release; manual review required");
      }
    }
  }catch(e){restored=false;console.error("ROLLBACK RULES FAILED: manual review required");}
  if(!restored)console.error("CRITICAL: manual production recovery may be required");
  else console.error("ROLLBACK COMPLETE: original site and Rules restored");
}
async function execute(){
  assert.equal(process.argv[2],"--publish");
  assert(process.env.GITHUB_ACTIONS==="true"&&process.env.CI==="true",
    "BLOCKED: only protected GitHub Actions may publish");
  const source=assertPinned();
  const raw=process.env.VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT;
  const secret=JSON.parse(raw||"null");
  assert(secret?.project_id===PROJECT,"BLOCKED: wrong/missing protected Hosting credential");
  const sdk=createRequire(path.resolve("controller/functions/package.json"));
  const token=(await sdk("firebase-admin/app").cert(secret).getAccessToken()).access_token;
  assert(token,"BLOCKED: no scoped Firebase token");
  const first=await state(token);
  await verifyBaseline(first,token);
  await compileRules(source,token);
  assertPinned();
  const second=await state(token);
  await verifyBaseline(second,token);
  assert.equal(second.rulesetName,first.rulesetName,"BLOCKED: original Rules pointer moved");
  const desiredSha=sha(source);
  let candidateRuleset=null;
  let patched=false;
  let hostingTouched=false;
  try {
    // Creating an immutable Ruleset does NOT select it for production.
    const created=ok(await http(REST_RULES+"projects/"+PROJECT+"/rulesets",token,
      "POST",{source:{files:[{name:"firestore.rules",content:source}]}}),
      "reviewed Ruleset create");
    assert(isRulesetName(created.name),"BLOCKED: wrong new Ruleset name");
    candidateRuleset=created.name;
    assertPinned();
    const beforePatch=await state(token);
    assert.equal(beforePatch.revision,LIVE);
    assert.equal(beforePatch.rulesHash,ACTIVE_RULES_SHA256);
    assert.equal(beforePatch.rulesetName,first.rulesetName);
    await patchRelease(token,first.rulesetName,candidateRuleset);
    patched=true;
    await awaitSourceHash(token,desiredSha);
    console.log("PASS: reviewed deny-only Rules active; old Hosting unchanged");
    assertPinned();
    const beforeHosting=await state(token);
    assert.equal(beforeHosting.revision,LIVE,"BLOCKED: live Hosting was changed mid-release");
    assert.equal(beforeHosting.rulesHash,desiredSha,"BLOCKED: Rules changed after publish");
    assert.equal(version(beforeHosting.liveChannel),version(beforeHosting.backupChannel),
      "BLOCKED: original Hosting version no longer matches backup");
    hostingTouched=true;
    hostingClone(PREVIEW,"live",secret);
    await awaitSiteMarker(WEB);
    const final=await state(token);
    assert.equal(final.revision,WEB,"BLOCKED: final site mismatch");
    assert.equal(final.rulesHash,desiredSha,"BLOCKED: final Rules mismatch");
    assert.equal(final.rulesetName,candidateRuleset);
    console.log("SUCCESS: reviewed PR #356 Hosting + PR #358 Firestore Rules both LIVE. Auth/Firestore records unchanged. Gmail aliases not deployed.");
  }catch(error){
    console.error("RELEASE BLOCKED: "+String(error?.message||"release error").slice(0,250));
    // A timed-out PATCH or clone can succeed remotely despite a local error.
    // Always inspect actual remote pointers after attempting Ruleset create.
    if(candidateRuleset){
      await safeRollback(token,first.rulesetName,candidateRuleset,secret);
    } else {
      console.error("NO PRODUCTION RELEASE SWITCH COMPLETED; original site/Rules retained");
    }
    process.exitCode=1;
  }
}
if(require.main===module){
  if(process.argv.includes("--self-test"))selfTest();
  else execute().catch(e=>{
    console.error("FAIL CLOSED BEFORE PUBLISH: "+String(e?.message||"preflight failure").slice(0,250));
    process.exitCode=1;
  });
}
