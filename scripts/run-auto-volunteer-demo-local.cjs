"use strict";
/**
 * One-command LOCAL demo launcher (Windows, macOS, Linux):
 *   node scripts/run-auto-volunteer-demo-local.cjs
 *   node scripts/run-auto-volunteer-demo-local.cjs --smoke
 *
 * Never invokes production Firebase CLI commands; only auth/firestore
 * emulators in an explicit fictional demo project. No deployment capability.
 */
const {spawn}=require("node:child_process");
const fs=require("node:fs");
const path=require("node:path");
const PROJECT="demo-volunserve-auto-phase4";
const root=path.resolve(__dirname,"..");
const firebaseCli=path.join(root,"node_modules","firebase-tools","lib","bin","firebase.js");

function assertSafeEnvironment(env){
  for(const key of [
    "FIREBASE_SERVICE_ACCOUNT_JSON","GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_CLOUD_KEYFILE_JSON"
  ]){
    if(env[key])throw Error("Refusing local demo while "+key+" exists");
  }
  for(const key of ["GCLOUD_PROJECT","GOOGLE_CLOUD_PROJECT"]){
    if(env[key]&&env[key]!==PROJECT)
      throw Error("Wrong cloud project in "+key+"; local demo refused");
  }
  if(env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST)
    throw Error("Clear inherited emulator hosts before starting the isolated demo");
  if(env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH==="enabled")
    throw Error("Production dispatch flag must never be enabled for this demo");
  if(!fs.existsSync(firebaseCli))
    throw Error("firebase-tools not installed; run npm ci in project root first");
}
function main(){
  assertSafeEnvironment(process.env);
  const smoke=process.argv.includes("--smoke");
  const env={
    ...process.env,
    GCLOUD_PROJECT:PROJECT,GOOGLE_CLOUD_PROJECT:PROJECT,
    VOLUNSERVE_AUTO_VOLUNTEER_PHASE6_EMULATOR_WRITE:"enabled",
    VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled",
    FIREBASE_CLI_DISABLE_TELEMETRY:"1"
  };
  const script=smoke?
    "node backend/autoVolunteerPhase18DemoLauncher.cjs --smoke":
    "node backend/autoVolunteerPhase18DemoLauncher.cjs";
  const child=spawn(process.execPath,[
    firebaseCli,"emulators:exec","--project",PROJECT,
    "--only","auth,firestore",script
  ],{cwd:root,env,stdio:"inherit",windowsHide:false});
  child.once("error",e=>{
    console.error("Could not start demo emulators:",e.message);
    process.exitCode=1;
  });
  child.once("exit",(code,signal)=>{
    process.exitCode=typeof code==="number"?code:signal?1:0;
  });
  for(const sig of ["SIGINT","SIGTERM"]){
    process.on(sig,()=>child.kill(sig));
  }
}
try{main()}catch(e){console.error("SAFE LOCAL DEMO REFUSED:",e.message);process.exitCode=1}
