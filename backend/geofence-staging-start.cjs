"use strict";
// Dedicated hosted QA only; no credentials = no Firebase initialization.
const http=require("node:http");
const project="volunserve-geofencing-staging";
if(process.env.VOLUNSERVE_DEPLOYMENT_ENV!=="staging" ||
 process.env.VOLUNSERVE_STAGING_STRICT!=="true" ||
 process.env.VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID!==project) throw Error("Geofence staging guard");
const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if(!raw){
 http.createServer((req,res)=>{
  res.writeHead(503,{"Content-Type":"application/json","Cache-Control":"no-store"});
  res.end(JSON.stringify({ok:false,mode:"geofence-staging",status:"awaiting_staging_credentials"}));
 }).listen(Number(process.env.PORT||10000),"0.0.0.0");
}else{
 let account;
 try{account=JSON.parse(raw)}catch{throw Error("Invalid staging service account JSON")}
 if(account.project_id!==project)throw Error("Wrong Firebase project: startup blocked");
 require("./server");
}
