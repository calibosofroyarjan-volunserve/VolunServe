#!/usr/bin/env node
"use strict";
/**
 * PHASE 11 no-network, read-only source audit.
 *
 * GitHub Actions extracts the OTHER staging branch to a temporary file using
 * "git show". This script NEVER connects to Firebase/Render, never invokes
 * deploy, and does not read .env or service account credentials.
 */
const fs=require("node:fs");
const path=require("node:path");
const {
  assessPhase11CloudStaging,assessPhase11SourceBaseline
}=require("../backend/autoVolunteerPhase11CloudIsolationGate.cjs");
const root=path.resolve(__dirname,"..");
function source(relative){
  const p=path.join(root,relative);
  return fs.readFileSync(p,"utf8");
}
const i=process.argv.indexOf("--staging-source");
let stagingServer="";
if(i>=0){
  const raw=process.argv[i+1];
  if(!raw||raw.startsWith("--"))throw Error("Expected a read-only staging source file path.");
  const filename=path.resolve(raw);
  const st=fs.statSync(filename);
  if(!st.isFile()||st.size>1024*1024)
    throw Error("Staging review source file is missing or too large.");
  stagingServer=fs.readFileSync(filename,"utf8");
}
const baseline=assessPhase11SourceBaseline({
  localApp:source("backend/autoVolunteerPhase10LocalApp.js"),
  liveServer:source("backend/server.js"),
  firebaseConfig:source("firebase.json"),
  stagingServer
});
// No independent cloud project/service evidence has been established by this
// read-only job. The output MUST remain NO-GO even if source audit passes.
const proposed=assessPhase11CloudStaging({});
const result={
  phase:"11",
  sourceBaseline:baseline.status,
  sourceFailures:baseline.failures,
  cloudDeploymentReadiness:proposed.status,
  stagingDeploymentAuthorized:false,
  productionDispatchAllowed:false,
  productionFirebaseUnchanged:true,
  existingAcceptedStagingNotModified:true,
  externalCloudCallsMade:false,
  cloudBlockers:proposed.blockers
};
process.stdout.write(JSON.stringify(result,null,2)+"\n");
if(baseline.status!=="SOURCE_BASELINE_CHECK_PASSED")
  process.exitCode=2;
if(proposed.status!=="NO_GO"||proposed.stagingDeploymentAuthorized)
  process.exitCode=3;
