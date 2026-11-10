#!/usr/bin/env node
"use strict";
/**
 * READ-ONLY VolunServe Spark Signup production release readiness.
 * Never deploys, creates a Ruleset, changes an Auth user, writes Firestore,
 * or modifies Hosting channels. Firebase Rules projects.test runs an empty
 * testSuite and does not touch production Firestore data or active Rules.
 *
 * POST-BLOCKED RELEASE RECHECK 2026-11-10: confirms original website and
 * Firestore Rules remained active after the scoped release HTTP 400 stop.
 * Source provenance: exact currently published Hosting ancestor, exact
 * currently deployed Firestore Rules hash, and two independently reviewed
 * candidate commits. Run only with protected GitHub production credentials.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const cp = require("node:child_process");
const path = require("node:path");
const {createRequire} = require("node:module");
const reqFns = createRequire(path.resolve(__dirname,"../functions/package.json"));

const PROJECT = "volunserve-3aa5b";
const EXPECTED_LIVE_SITE = "681c65eba80ea7ef8733a6b1e6047ea1c2a722ea";
const EXPECTED_ACTIVE_RULES_SHA256 = "5ba976566ef62d8997d6b7209bc7696b3744861f2b0538a28f068abaee413fe7";
const CANDIDATE_SITE = "44cfe41429f91d35d383bf3846fb6fd2f7e7df44";
const CANDIDATE_RULES = "77ba8efed9d60aebb01fabd68bd49662039a0ea1";
const CANDIDATE_RULES_BLOB = "ca25271c0ea9e2d14d39c1204ec1ad53745d6a65";
const RELEASE = "projects/" + PROJECT + "/releases/cloud.firestore";
const BACKUP_CHANNEL = "signup-live-backup-20261110";
const PREVIEW_CHANNEL = "signup-web-review-20261110";
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");
const git = (cwd,...args) => cp.execFileSync("git",["-C",cwd,...args],{encoding:"utf8"}).trim();
const codeSha = s => /^[a-f0-9]{40}$/.test(s||"");

function verifyPinnedFiles() {
  assert.equal(git("site","rev-parse","HEAD"),CANDIDATE_SITE,"BLOCKED: website candidate SHA mismatch");
  assert.equal(git("rules","rev-parse","HEAD"),CANDIDATE_RULES,"BLOCKED: rules candidate SHA mismatch");
  assert.equal(git("rules","hash-object","firestore.rules"),CANDIDATE_RULES_BLOB,"BLOCKED: unreviewed Rules content");
  assert(codeSha(EXPECTED_LIVE_SITE)&&codeSha(CANDIDATE_SITE)&&codeSha(CANDIDATE_RULES));
  const siteSource=fs.readFileSync("site/scripts/test-site-derived-signup-candidate.cjs","utf8");
  const rules=fs.readFileSync("rules/firestore.rules","utf8");
  assert(siteSource.includes("BLOCKED: unrelated published-website file modified"),"BLOCKED: site-preservation gate missing");
  assert(rules.includes("function blockedTempMailOrgAlias(email)"),"BLOCKED: reviewed provider guard missing");
  assert(rules.includes("function validInitialResidentInputs()"),"BLOCKED: resident validation missing");
  assert(rules.includes("match /volunteerInvitations/{invitationId}"),"BLOCKED: volunteer invitations rule missing");
  assert(!rules.includes("gmailAliasClaims"),"BLOCKED: unresolved Gmail alias migration must not be bundled");
  // Only the independently reviewed and CI-tested source commits are allowed.
  console.log("PASS: immutable source candidates and reviewed Security Rules blob");
}

async function request(url,token,options={}) {
  const {method="GET",body}=options;
  const headers={"Cache-Control":"no-cache"};
  if(token)headers.Authorization="Bearer "+token;
  if(body)headers["Content-Type"]="application/json";
  const res=await fetch(url,{
    method,headers,body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(30000)
  });
  const data=await res.json().catch(()=>({}));
  return {status:res.status,ok:res.ok,data};
}

function summarizeChannel(channel) {
  return {
    version:channel?.release?.version?.name||null,
    url:typeof channel?.url==="string"?channel.url:null
  };
}
function sameRelease(live,backup) {
  const a=summarizeChannel(live),b=summarizeChannel(backup);
  return !!a.version && !!b.version && a.version===b.version;
}
function noRuleCompilerErrors(result) {
  return (result?.issues||[]).filter(x=>x.severity==="ERROR").length===0;
}

async function main() {
  if(process.argv.includes("--self-test")){
    assert(sameRelease({release:{version:{name:"v1"}}},{release:{version:{name:"v1"}}}));
    assert(!sameRelease({release:{version:{name:"v1"}}},{release:{version:{name:"v2"}}}));
    assert(!sameRelease({release:{}},{release:{version:{name:"v1"}}}));
    assert(noRuleCompilerErrors({issues:[]}));
    assert(!noRuleCompilerErrors({issues:[{severity:"ERROR"}]}));
    console.log("PASS: read-only release comparison and compiler-diagnostic helpers");
    return;
  }
  assert.equal(process.env.GITHUB_REPOSITORY,"calibosofroyarjan-volunserve/VolunServe");
  assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected");
  assert.equal(git("controller","rev-parse","HEAD"),process.env.GITHUB_SHA);
  const latest=git("controller","ls-remote","--heads","origin","live-protected").split(/\s+/)[0];
  assert.equal(latest,process.env.GITHUB_SHA,"BLOCKED: protected source advanced after workflow started");
  verifyPinnedFiles();
  const credential=JSON.parse(process.env.VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT||"null");
  assert(credential?.project_id===PROJECT,"BLOCKED: missing or incorrect protected production credential");
  const {cert}=reqFns("firebase-admin/app");
  const token=(await cert(credential).getAccessToken()).access_token;
  assert(token,"BLOCKED: production credential could not access token");
  const [markerResult,releasesResult,liveChannel,backupChannel,previewChannel,identityResult]=
   await Promise.all([
    request("https://volunserve.com/volunserve-release.json"),
    request("https://firebaserules.googleapis.com/v1/projects/"+PROJECT+"/releases?pageSize=100",token),
    request("https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/channels/live",token),
    request("https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/channels/"+BACKUP_CHANNEL,token),
    request("https://firebasehosting.googleapis.com/v1beta1/sites/"+PROJECT+"/channels/"+PREVIEW_CHANNEL,token),
    request("https://identitytoolkit.googleapis.com/admin/v2/projects/"+PROJECT+"/config",token)
   ]);
  assert(markerResult.ok,"BLOCKED: live Hosting marker inaccessible HTTP "+markerResult.status);
  const marker=markerResult.data;
  assert.equal(marker.app,"VolunServe");
  assert.equal(marker.firebaseProject,PROJECT);
  const sitePinned=marker.revision===EXPECTED_LIVE_SITE;
  assert(releasesResult.ok,"BLOCKED: active Rules cannot be read HTTP "+releasesResult.status);
  const release=(releasesResult.data.releases||[]).find(x=>x.name===RELEASE);
  assert(release?.rulesetName,"BLOCKED: active cloud.firestore Rules release missing");
  const ruleResult=await request("https://firebaserules.googleapis.com/v1/"+release.rulesetName,token);
  assert(ruleResult.ok&&ruleResult.data.source?.files?.length===1,"BLOCKED: production Rules source cannot be verified");
  const activeHash=sha(ruleResult.data.source.files[0].content);
  const rulesPinned=activeHash===EXPECTED_ACTIVE_RULES_SHA256;
  const backupSame=liveChannel.ok&&backupChannel.ok&&sameRelease(liveChannel.data,backupChannel.data);
  let backupMarkerMatch=false;
  if(backupSame&&typeof backupChannel.data?.url==="string"&&
      /^https:\/\/volunserve-3aa5b--[a-z0-9-]+\.web\.app\/?$/.test(backupChannel.data.url)){
    const backupMarker=await request(new URL("/volunserve-release.json",backupChannel.data.url).href);
    backupMarkerMatch=backupMarker.ok&&backupMarker.data?.revision===EXPECTED_LIVE_SITE;
  }
  let previewMarkerMatch=false;
  if(previewChannel.ok&&typeof previewChannel.data?.url==="string"&&
      /^https:\/\/volunserve-3aa5b--[a-z0-9-]+\.web\.app\/?$/.test(previewChannel.data.url)){
    const previewMarker=await request(new URL("/volunserve-release.json",previewChannel.data.url).href);
    previewMarkerMatch=previewMarker.ok&&previewMarker.data?.revision===CANDIDATE_SITE;
  }
  const candidateSource=fs.readFileSync("rules/firestore.rules","utf8");
  const compile=await request("https://firebaserules.googleapis.com/v1/projects/"+PROJECT+":test",token,{
    method:"POST",body:{source:{files:[{name:"firestore.rules",content:candidateSource}]},testSuite:{testCases:[]}}
  });
  const compilerOkay=compile.ok&&noRuleCompilerErrors(compile.data);
  // Read-only diagnosis of Firebase's compiled executable limit. The
  // projects.test endpoint checks syntax, whereas release activation also
  // validates backend executable limits. The existing executable is never
  // printed; only its byte length is reported.
  const executable=await request(
    "https://firebaserules.googleapis.com/v1/"+RELEASE+":getExecutable"+
    "?executableVersion=FIREBASE_RULES_EXECUTABLE_V2",token
  );
  const activeExecutableBytes=executable.ok && typeof executable.data.executable==="string"
    ?Buffer.from(executable.data.executable,"base64").byteLength:null;
  // Find whether the rejected publisher created an immutable candidate Ruleset
  // without activating it. Bounded metadata and full-source reads only;
  // no production change and no source contents in Actions logs.
  const recentRulesets=await request(
    "https://firebaserules.googleapis.com/v1/projects/"+PROJECT+"/rulesets?pageSize=20",token
  );
  let matchingUnreleasedCandidateCount=0;
  if(recentRulesets.ok){
    const recent=(recentRulesets.data.rulesets||[]).slice(0,20);
    const inspected=await Promise.all(recent.map(item=>request(
      "https://firebaserules.googleapis.com/v1/"+item.name,token
    )));
    matchingUnreleasedCandidateCount=inspected.filter(item=>
      item.ok && item.data.source?.files?.length===1 &&
      sha(item.data.source.files[0].content)===sha(candidateSource)
    ).length;
  }

  const triggers=identityResult.data?.blockingFunctions?.triggers||{};
  const authHooksActive=!!triggers.beforeCreate?.functionUri && !!triggers.beforeSignIn?.functionUri;
  // READ ONLY publisher IAM test. This does not grant any IAM role or release
  // any Rules/Hosting version. Missing permissions must BLOCK any publish.
  const publisherPermissions=[
    "firebaserules.rulesets.create",
    "firebaserules.releases.update",
    "firebasehosting.sites.update"
  ];
  const iam=await request(
    "https://cloudresourcemanager.googleapis.com/v1/projects/"+PROJECT+":testIamPermissions",
    token,{method:"POST",body:{permissions:publisherPermissions}}
  );
  const permitted=new Set(iam.data?.permissions||[]);
  const missingPublisherPermissions=publisherPermissions.filter(p=>!permitted.has(p));
  // The previous release failed with HTTP 400 at 2026-11-10T05:28Z.
  // Inspect ONLY admin activity audit entries for that narrow time window.
  // This endpoint is read-only. Avoid printing principal, IP, request/response
  // content, email, rule source or any other audit-log payload.
  const auditLogs=await request("https://logging.googleapis.com/v2/entries:list",token,{
    method:"POST",body:{
      resourceNames:["projects/"+PROJECT],
      filter:'timestamp>="2026-11-10T05:27:30Z" AND timestamp<="2026-11-10T05:30:30Z" AND protoPayload.serviceName="firebaserules.googleapis.com"',
      orderBy:"timestamp desc",pageSize:50
    }
  });
  const matching=(auditLogs.data?.entries||[]).filter(entry=>
    /UpdateRelease|Patch|releases/i.test(entry.protoPayload?.methodName||"") &&
    entry.protoPayload?.status?.code
  );
  const genericErrorTypes=matching.slice(0,5).map(entry=>{
    const message=String(entry.protoPayload?.status?.message||"");
    const kind=/size|too large|exceed|limit/i.test(message)?"SIZE_LIMIT":
      /permission|unauthorized|denied/i.test(message)?"PERMISSION":
      /invalid|field|argument/i.test(message)?"INVALID_REQUEST":
      /compile|expression|ruleset/i.test(message)?"RULES_VALIDATION":
      "OTHER_UNCLASSIFIED";
    return {statusCode:entry.protoPayload.status.code,kind,
      safeMessagePrefix:message.slice(0,180).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g,"[email]").replace(/ya29[.][A-Za-z0-9._-]+/g,"[token]")};
  });
  const findings={
    mode:"READ_ONLY_SPARK_RELEASE_PREFLIGHT",
    project:PROJECT,
    siteRevision:marker.revision,
    siteMatchesPublishedBaseline:sitePinned,
    activeFirestoreRulesMatchVerifiedBaseline:rulesPinned,
    activeFirestoreRulesHash:activeHash,
    selectedCandidateWebRevision:CANDIDATE_SITE,
    selectedCandidateRulesRevision:CANDIDATE_RULES,
    compiler:{httpStatus:compile.status,passed:compilerOkay,errorCount:(compile.data?.issues||[]).filter(x=>x.severity==="ERROR").length},
    activationLogAudit:{httpStatus:auditLogs.status,matchedFailures:matching.length,errors:genericErrorTypes,readOnly:true},
    activationDiagnostics:{
      existingExecutableHttpStatus:executable.status,
      existingCompiledRulesBytes:activeExecutableBytes,
      knownCompiledLimitBytes:256000,
      recentRulesetsListHttpStatus:recentRulesets.status,
      matchingCandidateRulesetsCreatedButNotActivated:matchingUnreleasedCandidateCount,
      scope:"READ ONLY; no Rules release or Hosting changes"
    },
    hostingBackup:{liveHttpStatus:liveChannel.status,backupHttpStatus:backupChannel.status,
      pointsToCurrentLiveVersion:backupSame,fingerprintMatchesCurrentLive:backupMarkerMatch},
    hostingPreview:{httpStatus:previewChannel.status,fingerprintMatchesCurrentCandidate:previewMarkerMatch},
    publisherIam:{httpStatus:iam.status,hasAllRequired:iam.ok&&missingPublisherPermissions.length===0,missingPermissions:missingPublisherPermissions},
    identityBlocking:{access:identityResult.ok?"OK":"HTTP "+identityResult.status,
      beforeCreateAndSignInActive:authHooksActive,
      note:"Spark fallback cannot prevent arbitrary direct Firebase Auth SDK creation"},
    storagePolicy:"NOT CHECKED — no Storage change in this release",
    productionWrites:"NONE"
  };
  console.log(JSON.stringify(findings,null,2));
  // Stale/missing preview is not a release failure for *audit*, but it is a
  // hard blocker for reusing the old deployment workflow's clone step.
  for(const [ok,reason] of [
   [sitePinned,"Live website baseline changed"],
   [rulesPinned,"Active Firestore Rules baseline changed"],
   [compilerOkay,"Firebase production Rules compiler rejected candidate"],
   [backupSame&&backupMarkerMatch,"No matching verified Hosting rollback backup"],
   [previewMarkerMatch,"No exact preview channel for the current web candidate"],
   [iam.ok&&missingPublisherPermissions.length===0,"Production service account lacks one or more Rules/Hosting publish IAM permissions"]
  ])if(!ok){console.error("BLOCKED: "+reason+"; do not run historical publisher");process.exitCode=1;}
}
main().catch(e=>{console.error(String(e?.message||e));process.exitCode=1;});
