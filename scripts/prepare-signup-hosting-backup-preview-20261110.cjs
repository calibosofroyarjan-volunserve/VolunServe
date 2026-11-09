#!/usr/bin/env node
"use strict";
/**
 * SAFETY SCOPE: preflight and verification ONLY. This script never performs
 * Hosting/Rules/Auth/Firestore writes; version-clone and preview deployment
 * occur in a separately scoped GitHub Actions workflow and NEVER target live.
 * Run only in a protected GitHub production job using existing SA.
 */
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {createRequire} = require("node:module");
const reqFns = createRequire(path.resolve(__dirname,"../functions/package.json"));

const PROJECT="volunserve-3aa5b";
const LIVE_SHA="681c65eba80ea7ef8733a6b1e6047ea1c2a722ea";
const LIVE_RULES_SHA256="5ba976566ef62d8997d6b7209bc7696b3744861f2b0538a28f068abaee413fe7";
const WEB_SHA="44cfe41429f91d35d383bf3846fb6fd2f7e7df44";
const RULES_SHA="508b58b6ce888810c081dc6bfe38c237629d96d8";
const RULES_BLOB="a40954b7d8716e3953483a7ca39dd9e03f7b4e9a";
const BACKUP="signup-live-backup-20261110";
const PREVIEW="signup-web-review-20261110";
const digest=content=>crypto.createHash("sha256").update(content).digest("hex");
const runGit=(cwd,...args)=>cp.execFileSync("git",["-C",cwd,...args],{encoding:"utf8"}).trim();

const channelPath=ch=>"https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/channels/"+ch;
const markerPath="https://volunserve.com/volunserve-release.json";

async function get(url,token) {
  const headers=token?{Authorization:"Bearer "+token}:{"Cache-Control":"no-cache"};
  const r=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
  const data=await r.json().catch(()=>null);
  return {ok:r.ok,status:r.status,data};
}
function version(channel) {
  return channel?.release?.version?.name||null;
}
function previewOrigin(channel) {
  const u=String(channel?.url||"");
  assert(/^https:\/\/volunserve-3aa5b--[a-z0-9-]+\.web\.app\/?$/.test(u),
    "BLOCKED: untrusted Firebase preview channel URL");
  return new URL(u);
}
function sameVersion(a,b) {
  return !!version(a)&&version(a)===version(b);
}
function reportState(state) {
  return {
    mode:"HOSTING_BACKUP_AND_PREVIEW_ONLY",
    liveMarkerRevision:state.liveMarker?.revision,
    verifiedRulesBaseline:state.rulesHash===LIVE_RULES_SHA256,
    liveHostingVersion:version(state.live),
    backupExists:state.backup.ok,
    backupMatchesLive:state.backup.ok&&sameVersion(state.backup.data,state.live),
    previewExists:state.preview.ok,
    noProductionWritesByVerifier:true
  };
}

async function fetchState(token) {
  const [marker,live,backup,preview,releases]=await Promise.all([
    get(markerPath),
    get(channelPath("live"),token),
    get(channelPath(BACKUP),token),
    get(channelPath(PREVIEW),token),
    get("https://firebaserules.googleapis.com/v1/projects/"+PROJECT+"/releases?pageSize=100",token)
  ]);
  assert(marker.ok&&marker.data?.app==="VolunServe"&&marker.data?.firebaseProject===PROJECT,
    "BLOCKED: unverified public Hosting marker");
  assert(live.ok&&version(live.data),"BLOCKED: live Hosting channel version cannot be read");
  assert(releases.ok,"BLOCKED: cannot inspect deployed Firestore Rules");
  const release=(releases.data.releases||[]).find(x=>x.name==="projects/"+PROJECT+"/releases/cloud.firestore");
  assert(release?.rulesetName,"BLOCKED: active default Firestore Rules release not present");
  const source=await get("https://firebaserules.googleapis.com/v1/"+release.rulesetName,token);
  assert(source.ok&&source.data?.source?.files?.length===1,"BLOCKED: production Rules source unreadable");
  const rulesHash=digest(source.data.source.files[0].content);
  return {liveMarker:marker.data,live:live.data,backup,preview,rulesHash};
}
async function verifyPublicMarker(channel,revision) {
  const origin=previewOrigin(channel);
  const r=await get(new URL("/volunserve-release.json",origin).href);
  assert(r.ok&&r.data?.app==="VolunServe"&&r.data?.firebaseProject===PROJECT&&r.data?.revision===revision,
    "BLOCKED: Hosting channel does not serve the exact expected source revision");
}
function assertBaseline(state) {
  assert.equal(state.liveMarker.revision,LIVE_SHA,
    "BLOCKED: live site SHA changed; never clone/prepare from an unexpected version");
  assert.equal(state.rulesHash,LIVE_RULES_SHA256,
    "BLOCKED: currently deployed Firestore Rules changed");
}
function verifyFiles() {
  assert.equal(runGit("site","rev-parse","HEAD"),WEB_SHA,"BLOCKED: site candidate changed");
  assert.equal(runGit("rules","rev-parse","HEAD"),RULES_SHA,"BLOCKED: reviewed Rules candidate changed");
  assert.equal(runGit("rules","hash-object","firestore.rules"),RULES_BLOB,
    "BLOCKED: Rules candidate content changed");
  const app=JSON.parse(fs.readFileSync("site/firebase.json","utf8"));
  assert.equal(app.hosting?.public,"dist","BLOCKED: preview would publish wrong directory");
  assert.deepEqual(app.hosting.rewrites,[{source:"**/Ionicons*.ttf",destination:"/fonts/Ionicons.ttf"}],
    "BLOCKED: preview hosting configuration includes unrelated rewrites");
  assert(fs.existsSync("site/dist/volunserve-release.json"),
    "BLOCKED: preview build missing audited source marker");
  const marker=JSON.parse(fs.readFileSync("site/dist/volunserve-release.json","utf8"));
  assert.equal(marker.revision,WEB_SHA,"BLOCKED: preview dist has stale revision");
}
async function main() {
  const mode=process.argv[2]||"--preflight";
  assert(["--self-test","--preflight","--backup-verified","--preview-verified"].includes(mode));
  if(mode==="--self-test") {
    assert(sameVersion({release:{version:{name:"v1"}}},{release:{version:{name:"v1"}}}));
    assert(!sameVersion({release:{version:{name:"v1"}}},{release:{version:{name:"v2"}}}));
    assert(!sameVersion({},{release:{version:{name:"v1"}}}));
    assert.equal(digest("abc"),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    console.log("PASS: backup/version source tests (read-only helpers)");
    return;
  }
  assert.equal(process.env.GITHUB_REPOSITORY,"calibosofroyarjan-volunserve/VolunServe");
  assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected");
  assert.equal(runGit("controller","rev-parse","HEAD"),process.env.GITHUB_SHA);
  const latest=runGit("controller","ls-remote","--heads","origin","live-protected").split(/\s+/)[0];
  assert.equal(latest,process.env.GITHUB_SHA,
    "BLOCKED: an unexpected protected branch release candidate has superseded this run");
  verifyFiles();
  const credential=JSON.parse(process.env.VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT||"null");
  assert.equal(credential?.project_id,PROJECT,"BLOCKED: missing/mismatched GitHub environment key");
  const {cert}=reqFns("firebase-admin/app");
  const token=(await cert(credential).getAccessToken()).access_token;
  assert(token,"BLOCKED: cannot use existing GitHub production credential");
  const state=await fetchState(token);
  assertBaseline(state);
  console.log(JSON.stringify(reportState(state),null,2));
  if(mode==="--preflight") {
    // We intentionally use new, dedicated channel names so old historical
    // backups/previews are never overwritten.
    assert(state.backup.status===404,
      "BLOCKED: dedicated backup channel already exists; verify it before proceeding");
    assert(state.preview.status===404,
      "BLOCKED: dedicated preview channel already exists; do not overwrite another version");
    console.log("PASS: live baseline verified, dedicated channels do not exist; safe to create backup first");
    return;
  }
  assert(state.backup.ok&&sameVersion(state.live,state.backup.data),
    "BLOCKED: backup is not exactly the currently deployed live Hosting version");
  await verifyPublicMarker(state.backup.data,LIVE_SHA);
  if(mode==="--backup-verified") {
    assert(state.preview.status===404,
      "BLOCKED: separate preview already exists before approved preview deploy");
    console.log("PASS: exact source and immutable live-version backup validated");
    return;
  }
  assert(state.preview.ok&&version(state.preview.data),
    "BLOCKED: expected reviewed preview channel does not exist");
  assert.notEqual(version(state.preview.data),version(state.live),
    "BLOCKED: preview still points to live Hosting release");
  await verifyPublicMarker(state.preview.data,WEB_SHA);
  const url=previewOrigin(state.preview.data);
  for(const route of ["/login","/signup"]){
    const response=await fetch(new URL(route,url).href,{
      headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(20000)
    });
    assert(response.ok,"BLOCKED: reviewed preview route "+route+" not accessible HTTP "+response.status);
  }
  console.log(JSON.stringify({
    mode:"PREVIEW_VERIFIED_NO_LIVE_CHANGE",
    previewUrl:url.href,
    deployedPreviewRevision:WEB_SHA,
    backupSourceRevision:LIVE_SHA,
    activeFirestoreRulesUnchanged:true,
    liveWebsiteUnchanged:true,
    productionDataWrites:"NONE_BY_THIS_WORKFLOW"
  },null,2));
  console.log("PASS: reviewed preview routes and matching live-version rollback channel");
}
main().catch(e=>{console.error(String(e?.message||e));process.exitCode=1;});
