"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

// Only invoked after emulator tests and production-baseline CI guards pass.
// Updating the existing named release requires PATCH, not releases.create.
// Fail CLOSED if the live source differs from exact reviewed baseline rules.
const project = "volunserve-3aa5b";
const root = "https://firebaserules.googleapis.com/v1/projects/" + project;
const releaseName = "projects/" + project + "/releases/cloud.firestore";
const baseSha = process.env.BASE_SHA;
function sha256(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
function must(cond, message) { if (!cond) throw Error(message); }

async function getGoogleAccessToken(sa) {
  must(sa?.type === "service_account" && sa.project_id === project, "Wrong Firebase service account");
  const now = Math.floor(Date.now() / 1000);
  const enc = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = enc({alg:"RS256",typ:"JWT"}) + "." + enc({
    iss:sa.client_email, scope:"https://www.googleapis.com/auth/cloud-platform",
    aud:sa.token_uri, iat:now, exp:now+3000,
  });
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), sa.private_key).toString("base64url");
  const tokenRequest = await fetch(sa.token_uri, {
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:unsigned+"."+signature,
    }),
    signal:AbortSignal.timeout(15000),
  });
  const response = await tokenRequest.json();
  if(!tokenRequest.ok || typeof response.access_token !== "string") {
    throw Error("Google OAuth service-account token could not be obtained: HTTP " + tokenRequest.status);
  }
  return response.access_token;
}
async function api(url, token, opts={}) {
  const response = await fetch(url, {
    ...opts, headers:{"authorization":"Bearer "+token,"content-type":"application/json"},
    signal:AbortSignal.timeout(30000),
  });
  let result;
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok) throw Error("Firebase Rules API returned HTTP " + response.status +
    " for " + (opts.method || "GET") + " " + url.replace(root,"[project]") +
    "; code=" + String(result.error?.status || "unknown"));
  return result;
}
function extractSource(ruleset) {
  const files = ruleset?.source?.files;
  must(Array.isArray(files) && files.length === 1,
    "Active production ruleset contains unexpected files. STOP.");
  must(typeof files[0].content === "string",
    "Active production rules source not readable. STOP.");
  return files[0].content;
}
async function main() {
  must(/^[a-f0-9]{40}$/.test(baseSha || ""), "Expected exact pinned live SHA.");
  const baseline = execFileSync("git", ["show", baseSha + ":firestore.rules"], {encoding:"utf8"});
  const candidate = fs.readFileSync("firestore.rules","utf8");
  must(baseline !== candidate && candidate.includes("match /volunteerInvitations/{invitationId}"),
    "Candidate invitations rules missing; no publish.");
  const token = await getGoogleAccessToken(JSON.parse(process.env.FIREBASE_SA || "{}"));
  const releasePath = root+"/releases/cloud.firestore";
  const current = await api(releasePath,token);
  must(current.name === releaseName &&
    /^projects\/volunserve-3aa5b\/rulesets\/[a-zA-Z0-9-]+$/.test(current.rulesetName || ""),
    "Cannot verify the active Firestore release.");
  const currentRuleset = await api(
    "https://firebaserules.googleapis.com/v1/"+current.rulesetName,token);
  const liveSource = extractSource(currentRuleset);
  // The project has newer LIVE rules than GitHub. Preserve those byte-for-byte,
  // adding ONLY the reviewed new invitation match block from our local diff.
  const anchor = "    match /responseAssignments/{assignmentId} {";
  const additionStart = "    // An invitation is a consent/availability request only, never a dispatch.";
  const pos = candidate.indexOf(additionStart);
  const anchorPos = candidate.indexOf(anchor, pos);
  must(pos >= 0 && anchorPos > pos && candidate.indexOf(anchor) === anchorPos,
    "Invitation addition must occur only before responseAssignments. STOP.");
  const addition = candidate.slice(pos, anchorPos);
  must(candidate.replace(addition, "").trimEnd() === baseline.trimEnd(),
    "Local rules changed beyond a single invitation match. STOP.");
  must(liveSource.includes("function isAdmin()") &&
      liveSource.includes("function hasVolunteerAccess()"),
    "Live rules missing expected authorization helpers. STOP.");
  must(!liveSource.includes("match /volunteerInvitations/") &&
      liveSource.indexOf(anchor) >= 0 &&
      liveSource.indexOf(anchor) === liveSource.lastIndexOf(anchor),
    "Live rules already define invitations or target match is ambiguous. STOP.");
  const mergedSource = liveSource.replace(anchor, addition + anchor);
  must(mergedSource.replace(addition,"") === liveSource,
    "Existing live Rules source was modified beyond invitation addition. STOP.");
  console.log("PASS: production rules differ from Git baseline, but ALL existing live text " +
    "is preserved exactly; only the new invitation match is appended.");
  console.log("Unmodified production source fingerprint: " + sha256(liveSource).slice(0,12));
  const newRuleset = await api(root+"/rulesets",token,{
    method:"POST",
    body:JSON.stringify({source:{files:[{name:"firestore.rules",content:mergedSource}]}}),
  });
  must(/^projects\/volunserve-3aa5b\/rulesets\/[a-zA-Z0-9-]+$/.test(newRuleset.name||""),
    "No valid new Firebase Ruleset returned. No release update.");
  // Fail closed if another actor updated production rules during this attempt.
  const latestBeforePatch = await api(releasePath, token);
  must(latestBeforePatch.rulesetName === current.rulesetName,
    "Production rules changed concurrently. Do not overwrite.");
  const updated = await api(releasePath,token,{
    method:"PATCH",
    body:JSON.stringify({
      release:{name:releaseName,rulesetName:newRuleset.name},
      updateMask:"rulesetName",
    }),
  });
  must(updated.rulesetName === newRuleset.name, "Firebase Rules release PATCH mismatch.");
  const verified = await api(releasePath,token);
  must(verified.rulesetName === newRuleset.name, "Firebase active rules release could not be verified.");
  const activeNewRules = await api("https://firebaserules.googleapis.com/v1/"+newRuleset.name,token);
  must(extractSource(activeNewRules).trimEnd() === mergedSource.trimEnd(),
    "Firebase active Ruleset does not match exact live-plus-invitation overlay.");
  console.log("PASS: existing cloud.firestore release updated and exact new ruleset verified. " +
    "No Firestore records, Functions, Hosting or other Firebase service changed in this step.");
}
main().catch(error => { console.error(String(error?.message || error)); process.exitCode=1; });
