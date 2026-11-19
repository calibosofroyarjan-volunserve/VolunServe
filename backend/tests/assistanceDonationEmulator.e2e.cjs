"use strict";
// Complete real Express + Firebase emulator test. Never touch production.
const assert=require("node:assert/strict");
const {spawn}=require("node:child_process");
const {setTimeout:delay}=require("node:timers/promises");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore}=require("firebase-admin/firestore");

const project="demo-volunserve",authHost=String(process.env.FIREBASE_AUTH_EMULATOR_HOST||"");
const firestoreHost=String(process.env.FIRESTORE_EMULATOR_HOST||"");
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(authHost)||
   !/^(127\.0\.0\.1|localhost):\d+$/.test(firestoreHost)||
   process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS||
   (process.env.GCLOUD_PROJECT&&process.env.GCLOUD_PROJECT!==project)||
   (process.env.GOOGLE_CLOUD_PROJECT&&process.env.GOOGLE_CLOUD_PROJECT!==project))
  throw Error("SAFETY STOP: local DEMO Auth/Firestore emulators only, no production credentials");
const app=initializeApp({projectId:project},"assistance-e2e-demo");
const auth=getAuth(app),db=getFirestore(app),port=19873,base="http://127.0.0.1:"+port;
const uid="test-lgu-admin",residentUid="test-resident-user",nonadminUid="test-non-admin";
const req1="e2e_medical_00001",req2="e2e_medical_00002";
let server,logs="";
const log=(line)=>process.stdout.write(line+"\n");
async function post(endpoint,token,body){
 const resp=await fetch(base+endpoint,{method:"POST",headers:{
  "Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},
  body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 return {status:resp.status,data:await resp.json().catch(()=>({}))};
}
function expect(result,status,code){
 assert.equal(result.status,status,"Expected HTTP "+status+", got "+result.status+" "+JSON.stringify(result.data));
 if(code)assert.equal(result.data.error,code,JSON.stringify(result.data));
 return result.data;
}
async function authToken(email,password){
 const r=await fetch("http://"+authHost+"/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({email,password,returnSecureToken:true}),signal:AbortSignal.timeout(10000)});
 const data=await r.json();
 assert.equal(r.status,200,"Auth emulator login failed "+JSON.stringify(data));
 return data.idToken;
}
async function waitForServer(){
 for(let i=0;i<95;i++){
  if(server.exitCode!==null)throw Error("Backend exited early: "+logs.slice(-3500));
  try{
   const r=await fetch(base+"/never-a-real-route",{signal:AbortSignal.timeout(1000)});
   if([200,401,404].includes(r.status))return;
  }catch{}
  await delay(350);
 }
 throw Error("Backend did not start: "+logs.slice(-3500));
}
const requestSeed=(id)=>({
 requestId:id,requesterUid:residentUid,requesterName:"Demo Test Resident",
 requesterAddress:"Private Test Home",requesterBarangay:"Poblacion",
 category:"medical_health",categoryLabel:"Medical / Health",
 title:"Hospital Assistance for Community Resident",
 description:"A resident has documented hospital expenses and needs assistance.",
 estimatedAmount:5000,status:"pending",verificationStatus:"pending_review",
 supportDecision:"pending",remainingAmount:0,
 publicCampaignPhotoConsent:true,
 publicCampaignPhotoUrl:"https://example.org/fictitious-consented-photo.jpg",
 preferredAssistanceTypes:["monetary"],
});
const review={
 documentConsistencyStatus:"consistent",documentConsistencyNotes:"Demo documents inspected",
 duplicateCheckStatus:"clear",duplicateRequestIds:[],duplicateCheckNotes:"No demo duplicate",
 beneficiaryCheckStatus:"confirmed",beneficiaryCheckNotes:"Fictional profile checked",
 facilityVerificationRequired:true,facilityVerificationStatus:"confirmed",
 facilityName:"Example Public Hospital",facilityVerificationMethod:"official_record",
 facilityVerifiedWith:"Fictitious hospital record",facilityNotes:"Test hospital evidence",
 costVerificationRequired:true,verifiedGrossCost:5000,
 confirmedExistingAssistanceAmount:1000,costVerificationStatus:"confirmed",
 costNotes:"Verified test bill",residencyVerificationStatus:"verified",
 residencyVerificationMethod:"profile_address",privateAddressSnapshot:"Private Test Home",
 videoVerificationRequired:true,videoVerificationStatus:"pending",
 siteVisitRequired:false,siteVisitStatus:"not_required",
 riskFlags:["unresolved test evidence"],internalNotes:"Review not finished",
};
const campaignBody=(id,goal)=>({
 sourceType:"community_assistance_request",sourceId:id,
 title:"Hospital Assistance for Community Resident",
 description:"A verified community request for treatment support and related expenses.",
 publicStory:"A verified community resident requires support for documented hospital costs and recovery.",
 publicIncidentType:"Medical / Health",publicSeverity:"LGU verified need",
 acceptedDonationTypes:["monetary"],monetaryGoal:goal,
 officialChannelLabel:"Sandbox LGU Demo Channel",
 officialChannelInstructions:"Use only fictional example payments in this isolated emulator.",
 publicLocationLabel:"Poblacion, San Jose del Monte, Bulacan",
 handoffLocationName:"Public LGU Demo Assistance Office",
 handoffAddress:"Public Test City Hall Office, San Jose del Monte",
 publicPhotoUrls:["https://example.org/fictitious-consented-photo.jpg"],
});
async function main(){
 try{
  await Promise.all([
   auth.createUser({uid,email:"test.admin@example.org",password:"DemoTestPass123!",emailVerified:true}),
   auth.createUser({uid:nonadminUid,email:"test.nonadmin@example.org",password:"DemoTestPass123!",emailVerified:true}),
   auth.createUser({uid:residentUid,email:"test.resident@example.org",password:"DemoTestPass123!",emailVerified:true}),
  ]);
  await Promise.all([
   db.doc("users/"+uid).set({role:"admin",status:"approved",adminStatus:"active",email:"test.admin@example.org"}),
   db.doc("users/"+nonadminUid).set({role:"resident",status:"approved",email:"test.nonadmin@example.org",residentAccess:true}),
   db.doc("users/"+residentUid).set({role:"resident",status:"approved",email:"test.resident@example.org",residentAccess:true}),
   db.doc("assistanceRequests/"+req1).set(requestSeed(req1)),
   db.doc("assistanceRequests/"+req2).set(requestSeed(req2)),
  ]);
  const env={...process.env,PORT:String(port),GOOGLE_CLOUD_PROJECT:project,
   GCLOUD_PROJECT:project,FIREBASE_CONFIG:JSON.stringify({projectId:project}),NODE_ENV:"test"};
  delete env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
  server=spawn(process.execPath,["backend/server.js"],{
   cwd:require("node:path").resolve(__dirname,"../.."),
   env,stdio:["ignore","pipe","pipe"]});
  for(const stream of [server.stdout,server.stderr])stream.on("data",b=>{
   logs+=b.toString();if(logs.length>30000)logs=logs.slice(-30000);
  });
  await waitForServer();
  const admin=await authToken("test.admin@example.org","DemoTestPass123!");
  const nonadmin=await authToken("test.nonadmin@example.org","DemoTestPass123!");
  const r1="/api/admin/assistance/requests/"+req1,r2="/api/admin/assistance/requests/"+req2;

  expect(await post(r1+"/start-review",null,{}),401,"unauthenticated");
  expect(await post(r1+"/start-review",nonadmin,{}),403,"operational_admin_required");
  expect(await post(r1+"/operation",admin,{action:"resource_assessment",supportDecision:"donation_support",remainingAmount:4000}),409,"assistance_review_not_found");
  const started=expect(await post(r1+"/start-review",admin,{}),200);
  assert.equal(started.status,"under_review");
  log("PASS unauthorized users blocked; Admin begins protected review");
  expect(await post(r1+"/review",admin,{action:"verify",review}),409,"private_verification_incomplete");
  const saved=expect(await post(r1+"/review",admin,{action:"save_progress",review}),200);
  assert.equal(saved.reviewStatus,"in_progress");
  const pending=(await db.doc("assistanceVerificationReviews/"+req1).get()).data();
  assert.equal(pending.videoVerificationRequired,true);
  assert.deepEqual(pending.riskFlags,["unresolved test evidence"]);
  log("PASS pending video/risk blocks approval; draft persists");
  const finalReview={...review,videoVerificationStatus:"completed",
   videoVerificationNotes:"Demo video review completed",riskFlags:[],
   internalNotes:"Risk flag resolved following fictional cross-check."};
  const verified=expect(await post(r1+"/review",admin,{action:"verify",review:finalReview}),200);
  assert.equal(verified.verificationStatus,"verified");
  const approved=(await db.doc("assistanceRequests/"+req1).get()).data();
  const privateReview=(await db.doc("assistanceVerificationReviews/"+req1).get()).data();
  assert.equal(approved.status,"verified");
  assert.equal(privateReview.finalDecision,"verified");
  assert.equal(privateReview.verifiedUncoveredAmount,4000);
  log("PASS approval persists protected LGU review, amount and request status");
  expect(await post(r1+"/operation",admin,{action:"resource_assessment",supportDecision:"donation_support",remainingAmount:5000}),
   400,"remaining_amount_exceeds_verified_need");
  expect(await post(r1+"/operation",admin,{action:"resource_assessment",supportDecision:"donation_support",remainingAmount:4000}),200);
  expect(await post(r1+"/operation",admin,{action:"save_location",assignedLocationType:"lgu_office",
   assignedLocationName:"Public LGU Demo Assistance Office",
   assignedLocationAddress:"Public Test City Hall Office, San Jose del Monte"}),200);
  log("PASS verified donation cap, support plan and public LGU address");
  const body=campaignBody(req1,4000);
  expect(await post("/api/admin/donations/campaigns",admin,{...body,monetaryGoal:4500}),400,"funding_goal_must_match_verified_shortage");
  await db.doc("assistanceRequests/"+req1).update({publicCampaignPhotoConsent:false});
  expect(await post("/api/admin/donations/campaigns",admin,body),409,"resident_public_campaign_photo_required");
  await db.doc("assistanceRequests/"+req1).update({publicCampaignPhotoConsent:true});
  const published=expect(await post("/api/admin/donations/campaigns",admin,body),201);
  assert.equal(published.sourceType,"community_assistance_request");
  assert.equal(published.monetaryGoal,4000);
  const campaign=(await db.doc("donationCampaigns/"+published.campaignId).get()).data();
  assert.equal(campaign.status,"published");
  assert.equal(campaign.sourceAssistanceRequestId,req1);
  assert.equal(campaign.publicStory,body.publicStory);
  const linked=(await db.doc("assistanceRequests/"+req1).get()).data();
  assert.equal(linked.donationCampaignId,published.campaignId);
  expect(await post("/api/admin/donations/campaigns",admin,body),409,"campaign_already_active");
  const matches=await db.collection("donationCampaigns").where("sourceAssistanceRequestId","==",req1).get();
  assert.equal(matches.size,1);
  log("PASS photo consent and goal required; linked publication atomic; duplicate rejected");

  expect(await post(r2+"/start-review",admin,{}),200);
  const more=expect(await post(r2+"/review",admin,{action:"more_information",review,
   decisionReason:"Please supply clearer supporting evidence for the demo."}),200);
  assert.equal(more.reviewStatus,"needs_more_information");
  const rejected=expect(await post(r2+"/review",admin,{action:"reject",review,
   decisionReason:"Test evidence could not be independently confirmed."}),200);
  assert.equal(rejected.verificationStatus,"rejected");
  expect(await post(r2+"/review",admin,{action:"verify",review:finalReview}),409,"assistance_review_locked");
  const all=(await db.collection("donationCampaigns").get());
  assert.equal(all.size,1);
  log("PASS more-info/rejection routes and terminal lock; only one demo campaign");
  log("PASS complete authenticated Express + Firebase emulator workflow; ZERO production writes");
 }finally{
  if(server && server.exitCode===null){server.kill("SIGTERM");await delay(300);}
  await deleteApp(app);
 }
}
main().catch(e=>{console.error(e.stack||e);console.error("Backend log tail:\n"+logs.slice(-6000));process.exitCode=1;});
