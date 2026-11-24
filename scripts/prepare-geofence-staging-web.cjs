"use strict";
// This script runs only in the dedicated geofencing QA build checkout.
const fs=require("node:fs");
const path=require("node:path");
const expected={
 EXPO_PUBLIC_VOLUNSERVE_ENV:"staging",
 EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET:"staging",
 EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:"volunserve-geofencing-staging",
 EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_AUTH_DOMAIN:"volunserve-geofencing-staging.firebaseapp.com",
 EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_STORAGE_BUCKET:"volunserve-geofencing-staging.firebasestorage.app",
 EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_MESSAGING_SENDER_ID:"593139038478",
 EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_APP_ID:"1:593139038478:web:732dcc8113d87791dd3f5f",
 EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL:"https://volunserve-geofencing-backend-staging.onrender.com",
 EXPO_PUBLIC_VOLUNSERVE_BACKEND_URL:"https://volunserve-geofencing-backend-staging.onrender.com"
};
for(const [k,v] of Object.entries(expected))if(process.env[k]!==v)throw Error("Geofence QA invalid environment: "+k);
if(!/^AIza[\w-]{30,}$/.test(process.env.EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_API_KEY||""))throw Error("Missing dedicated public Firebase API key");
if(process.env.RENDER==="true" && (process.env.RENDER_SERVICE_NAME!=="volunserve-geofencing-web-staging" || process.env.RENDER_GIT_BRANCH!=="qa/geofence-full-staging-web-20261124"))throw Error("Wrong Render QA target");
const mappings=[
 ["volunserve-backend-staging.onrender.com","volunserve-geofencing-backend-staging.onrender.com"],
 ["volunserve-full-staging","volunserve-geofencing-staging"],
 ["429213950126","593139038478"],
 ["955dbf575697826b674d3f","732dcc8113d87791dd3f5f"]
];
function rewrite(file){
 let s=fs.readFileSync(file,"utf8"),out=s;
 for(const [from,to] of mappings)out=out.split(from).join(to);
 if(file==="lib/firebase.ts"){
   const marker="  const stage = stagingConfig!;";
   if(out.split(marker).length!==2)throw Error("Firebase guard missing");
   out=out.replace(marker,marker+'\n  if (stage.projectId !== "volunserve-geofencing-staging" || stage.appId !== "1:593139038478:web:732dcc8113d87791dd3f5f" || stage.messagingSenderId !== "593139038478") throw new Error("Geofence QA Firebase project mismatch");');
 }
 if(out!==s)fs.writeFileSync(file,out);
}
function scan(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())scan(p);else if(/\.(ts|tsx|js|jsx)$/.test(p))rewrite(p);}}
for(const dir of ["app","lib","components","constants"])scan(dir);
rewrite("scripts/check-expo-resident-staging-release.cjs");
require("./check-expo-resident-staging-release.cjs");
console.log("Geofence QA source bound to dedicated Firebase project and backend. No deployment to existing sites.");
