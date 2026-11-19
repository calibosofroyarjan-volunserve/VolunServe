"use strict";
/**
 * Browser test of the actual VolunServe Admin UI, Express API, Firebase Auth and
 * Firestore, all on localhost DEMO emulators. No production accounts or writes.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawn}=require("node:child_process");
const {setTimeout:delay}=require("node:timers/promises");
const {chromium}=require("playwright");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {getAuth}=require("firebase-admin/auth");
const project="demo-volunserve",host="http://127.0.0.1:5000",port=10000;
const authHost=String(process.env.FIREBASE_AUTH_EMULATOR_HOST||"");
const fsHost=String(process.env.FIRESTORE_EMULATOR_HOST||"");
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(authHost) ||
 !/^(127\.0\.0\.1|localhost):\d+$/.test(fsHost) ||
 process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
 process.env.GOOGLE_APPLICATION_CREDENTIALS ||
 String(process.env.GCLOUD_PROJECT)!==project ||
 String(process.env.GOOGLE_CLOUD_PROJECT)!==project)
 throw Error("SAFETY STOP: demo Firebase Auth/Firestore emulators only");
const firebaseSource=fs.readFileSync("lib/firebase.ts","utf8");
const assistanceSource=fs.readFileSync("app/(admin)/assistance-requests.tsx","utf8");
const donationSource=fs.readFileSync("app/(admin)/donation-list.tsx","utf8");
assert(firebaseSource.includes("const ENABLE_LOCAL_TESTING = true;"),"UI build must use LOCAL Firebase only");
for(const [name,source] of [["Assistance",assistanceSource],["Donation",donationSource]]){
 assert(source.includes('http://127.0.0.1:'+port),name+" backend must use localhost");
 assert(!source.includes('https://volunserve.onrender.com'),name+" production backend URL must be absent in temporary test build");
}
const adminApp=initializeApp({projectId:project},"browser-only-qa");
const auth=getAuth(adminApp),db=getFirestore(adminApp);
let proc,logs="",browser;
fs.mkdirSync("demo-browser-artifacts",{recursive:true});
async function awaitBackend(){
 for(let i=0;i<110;i++){
  if(proc.exitCode!==null)throw Error("Local Express exited unexpectedly "+logs.slice(-2000));
  try{
   const r=await fetch("http://127.0.0.1:"+port+"/not-a-real-route",{signal:AbortSignal.timeout(1000)});
   if(r.status===404)return;
  }catch{}
  await delay(250);
 }
 throw Error("Local backend startup timed out: "+logs.slice(-2000));
}
async function main(){
 const adminUid="qa_browser_admin",resUid="qa_browser_resident";
 const pendingId="browser_qa_pending_0001",approvedId="browser_qa_approved_0002";
 const common={
  requesterUid:resUid,requesterName:"Fictional Resident",beneficiaryName:"Fictional Resident",
  requesterAddress:"Private example location",requesterBarangay:"Poblacion",
  contactNumber:"",category:"medical_health",categoryLabel:"Medical / Health",
  estimatedAmount:5000,documents:[],publicCampaignPhotoConsent:true,
  publicCampaignPhotoUrl:"https://example.org/qa-public-consented.jpg",
 };
 let page,exceptions=[];
 try{
  await auth.createUser({uid:adminUid,email:"qa.admin@gmail.com",password:"DemoBrowserPass123!",emailVerified:true});
  await auth.createUser({uid:resUid,email:"qa.resident@gmail.com",password:"DemoBrowserPass123!",emailVerified:true});
  await db.doc("users/"+adminUid).set({role:"admin",status:"approved",adminStatus:"active",
    email:"qa.admin@gmail.com",firstName:"QA",lastName:"Admin"});
  await db.doc("users/"+resUid).set({role:"resident",status:"approved",residentAccess:true,
    email:"qa.resident@gmail.com",firstName:"Fictional",lastName:"Resident"});
  await db.doc("assistanceRequests/"+pendingId).set({...common,requestId:pendingId,
    title:"Browser QA Pending Medical Need",description:"A fictional unverified medical assistance request.",
    status:"pending",verificationStatus:"pending_review",supportDecision:"pending",remainingAmount:0,
    createdAt:new Date("2026-11-19T12:00:00Z")});
  await db.doc("assistanceRequests/"+approvedId).set({...common,requestId:approvedId,
    title:"Browser QA Approved Hospital Aid",
    description:"Fictional resident requests help with verified hospital expenses for this demo only.",
    status:"verified",verificationStatus:"verified",supportDecision:"pending",remainingAmount:0,
    createdAt:new Date("2026-11-19T12:01:00Z")});
  await db.doc("assistanceVerificationReviews/"+approvedId).set({
    requestId:approvedId,requesterUid:resUid,category:"medical_health",
    reviewStatus:"verified",finalDecision:"verified",
    verifiedGrossCost:5000,confirmedExistingAssistanceAmount:1000,
    verifiedUncoveredAmount:4000,costVerificationStatus:"confirmed",
    facilityVerificationStatus:"confirmed",facilityVerificationRequired:true,
    beneficiaryCheckStatus:"confirmed",duplicateCheckStatus:"clear",
    documentConsistencyStatus:"consistent",residencyVerificationStatus:"verified",
    videoVerificationRequired:false,videoVerificationStatus:"not_required",
    siteVisitRequired:false,siteVisitStatus:"not_required",riskFlags:[],
  });
  const env={...process.env,PORT:String(port),NODE_ENV:"test",
   GOOGLE_CLOUD_PROJECT:project,GCLOUD_PROJECT:project,
   ALLOWED_ORIGINS:"http://127.0.0.1:5000,http://localhost:5000",
   FIREBASE_CONFIG:JSON.stringify({projectId:project})};
  delete env.FIREBASE_SERVICE_ACCOUNT_JSON;delete env.GOOGLE_APPLICATION_CREDENTIALS;
  proc=spawn(process.execPath,["backend/server.js"],{cwd:path.resolve(__dirname,".."),
   env,stdio:["ignore","pipe","pipe"]});
  for(const stream of [proc.stdout,proc.stderr])stream.on("data",buffer=>{
   logs+=buffer.toString();if(logs.length>28000)logs=logs.slice(-28000);
  });
  await awaitBackend();
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext({viewport:{width:1440,height:900},
   serviceWorkers:"block",locale:"en-PH"});
  page=await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror",err=>exceptions.push(String(err.message||err).slice(0,600)));
  page.on("dialog",dialog=>void dialog.accept());
  await page.goto(host+"/login",{waitUntil:"domcontentloaded",timeout:45000});
  await page.getByPlaceholder("Email address",{exact:true}).fill("qa.admin@gmail.com");
  await page.getByPlaceholder("Password",{exact:true}).fill("DemoBrowserPass123!");
  await page.getByText("Sign In",{exact:true}).first().click();
  await page.waitForURL(url=>!url.pathname.endsWith("/login"),{timeout:35000});
  console.log("PASS demo Admin signed in through real VolunServe login UI");
  await page.goto(host+"/assistance-requests",{waitUntil:"domcontentloaded",timeout:35000});
  await page.getByText("Assistance Request Queue",{exact:true}).waitFor({state:"visible",timeout:35000});
  await page.getByText("Browser QA Pending Medical Need",{exact:true}).waitFor({state:"visible"});
  await page.getByText("Browser QA Approved Hospital Aid",{exact:true}).waitFor({state:"visible"});
  await page.screenshot({path:"demo-browser-artifacts/admin-assistance-queue.png",fullPage:true});
  console.log("PASS demo Admin sees both fictional requests in real five-per-page queue");
  await page.getByText("Browser QA Pending Medical Need",{exact:true}).first().click();
  await page.getByText("Request Information",{exact:true}).first().waitFor({state:"visible"});
  await page.screenshot({path:"demo-browser-artifacts/reference-request-details.png",fullPage:true});
  await page.getByText("Back to Assistance Requests",{exact:true}).first().click();
  await page.getByText("Assistance Request Queue",{exact:true}).waitFor({state:"visible"});

  await page.getByText("Browser QA Pending Medical Need",{exact:true}).first().click();
  await page.getByText("Request Information",{exact:true}).first().waitFor({state:"visible"});
  await page.getByText("Review & Decision",{exact:true}).first().click();
  await page.getByText("Review Summary",{exact:true}).waitFor({state:"visible"});
  await page.getByText("Approve Request",{exact:true}).click();
  await page.getByText("Confirm Decision",{exact:true}).click();
  await page.getByText("Some checks are incomplete",{exact:true}).waitFor({state:"visible"});
  const unverified=(await db.doc("assistanceRequests/"+pendingId).get()).data();
  assert.notEqual(unverified.verificationStatus,"verified");
  await page.screenshot({path:"demo-browser-artifacts/admin-review-incomplete.png",fullPage:true});
  console.log("PASS incomplete LGU review blocked visibly in actual browser; no false approval");

  await page.getByText("Back to Assistance Requests",{exact:true}).first().click();
  await page.getByText("Assistance Request Queue",{exact:true}).waitFor({state:"visible"});
  await page.getByText("Browser QA Approved Hospital Aid",{exact:true}).first().click();
  await page.getByText("Review & Decision",{exact:true}).first().click();
  await page.getByText("Choose Assistance",{exact:true}).waitFor({state:"visible"});
  await page.getByText("Create Donation Campaign",{exact:true}).click();
  await page.getByText("Campaign Story",{exact:true}).waitFor({state:"visible"});
  await page.getByText("Browser QA Approved Hospital Aid",{exact:true}).first().waitFor({state:"visible"});
  await page.getByPlaceholder("e.g. City Social Welfare Office").fill("QA Public Assistance Office");
  await page.getByPlaceholder("Public office address").fill("Public QA Office, San Jose del Monte");
  await page.screenshot({path:"demo-browser-artifacts/admin-approved-donation-setup.png",fullPage:true});
  await page.getByText("Continue to Publish Campaign",{exact:true}).click();
  await page.waitForURL(url=>url.pathname.includes("donation-list"),{timeout:35000});
  await page.getByText("Publish Donation Campaign",{exact:true}).filter({visible:true}).first().waitFor({state:"visible",timeout:35000});
  await page.screenshot({path:"demo-browser-artifacts/admin-donation-publish-form.png",fullPage:true});
  console.log("PASS approved Assistance navigates to auto-filled Donation publishing UI");
  const updated=(await db.doc("assistanceRequests/"+approvedId).get()).data();
  assert.equal(updated.supportDecision,"donation_support");
  assert.equal(updated.remainingAmount,4000);
  assert.equal(updated.assignedLocationName,"QA Public Assistance Office");
  console.log("PASS Admin browser saved donation support plan and public office in demo Firestore");
  if(exceptions.length)console.log("BROWSER_WARN unhandled exceptions: "+exceptions.join(" | "));
  console.log("PASS complete authenticated demo browser QA; no production users or records touched");
 }catch(err){
  if(page)await page.screenshot({path:"demo-browser-artifacts/FAILED-current-screen.png",fullPage:true}).catch(()=>{});
  console.error("Browser URL: "+(page?.url()||"not launched"));
  console.error("Browser exceptions: "+exceptions.join(" | "));
  console.error("Backend logs: "+logs.slice(-5500));
  throw err;
 }finally{
  if(browser)await browser.close().catch(()=>{});
  if(proc&&proc.exitCode===null){proc.kill("SIGTERM");await delay(250);}
  await deleteApp(adminApp);
 }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
