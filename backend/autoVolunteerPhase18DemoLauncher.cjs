"use strict";
/**
 * Fictional, localhost-only demonstration of Automatic Volunteer.
 *
 * IMPORTANT: This entrypoint is deliberately NOT imported by backend/server.js,
 * Render, Firebase Functions, or any production code. It refuses cloud access,
 * requires local Auth+Firestore Emulators, and never reads real emergency data.
 */
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {getAuth}=require("firebase-admin/auth");
const {createPhase10LocalApp}=require("./autoVolunteerPhase10LocalApp");
const {emulatorReady}=require("./autoVolunteerPhase6EmulatorDecisionServer");

const PROJECT="demo-volunserve-auto-phase4";
const PORT=4179,CASE="phase10_case_smoke";
const PASSWORD="LocalFictionalDemoOnly!2026";
const ADMIN="phase10_admin_demo";
const RESIDENT="phase10_resident_demo";
const VOLUNTEERS=[
  {uid:"phase10_volunteer_a_demo",barangay:"Bagong Buhay I",label:"A"},
  {uid:"phase10_volunteer_b_demo",barangay:"Bagong Buhay I",label:"B"},
  {uid:"phase10_volunteer_c_demo",barangay:"Citrus",label:"C"}
];
const email=uid=>uid+"@phase10.example";
function requireIsolatedEnvironment(){
  assert.equal(process.env.GCLOUD_PROJECT,PROJECT,"Wrong demo project");
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,"127.0.0.1:9099");
  assert.equal(process.env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH,"disabled");
  assert.equal(process.env.VOLUNSERVE_AUTO_VOLUNTEER_PHASE6_EMULATOR_WRITE,"enabled");
  assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS,"Cloud credentials prohibited");
  assert.ok(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,"Service account prohibited");
  assert.ok(!process.env.GOOGLE_CLOUD_KEYFILE_JSON,"Cloud credentials prohibited");
  assert.ok(emulatorReady(process.env),"Not inside local emulators");
}
async function seed(db,auth){
  const accounts=[
    {uid:ADMIN,role:"admin",status:"approved",adminStatus:"active"},
    {uid:RESIDENT,role:"resident",status:"approved"},
    ...VOLUNTEERS.map(v=>({
      uid:v.uid,role:"resident",status:"approved",
      volunteerAccess:true,volunteerStatus:"approved",
      identityVerified:true,skills:["First Aid"],barangay:v.barangay,
      fullName:"Fictional Volunteer "+v.label
    }))
  ];
  // Only use Auth Emulator API; a real Firebase Auth connection is impossible
  // under the explicit local HOST and demo PROJECT guard above.
  for(const account of accounts){
    await auth.createUser({
      uid:account.uid,email:email(account.uid),
      password:PASSWORD,emailVerified:true
    });
  }
  const batch=db.batch();
  for(const account of accounts)
    batch.set(db.collection("users").doc(account.uid),account);
  for(const v of VOLUNTEERS){
    batch.set(db.collection("volunteerApplications").doc(v.uid),{
      uid:v.uid,status:"approved",skills:["First Aid"]
    });
  }
  batch.set(db.collection("disasterCases").doc(CASE),{
    id:CASE,reporterUid:RESIDENT,title:"FICTIONAL training scenario only",
    incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],
    status:"pending_review",verificationStatus:"pending",
    dispatchBlocked:false
  });
  await batch.commit();
}

async function runSmoke(base){
  // Actual signed-in Auth Emulator credentials exercise the same local HTML
  // API routes as the Admin and Volunteer demo pages.
  const {initializeApp:clientInit,deleteApp:clientDelete}=require("firebase/app");
  const {getAuth:clientAuth,connectAuthEmulator,
    signInWithEmailAndPassword,getIdToken}=require("firebase/auth");
  const clients=[];
  async function login(uid){
    const client=clientInit({
      apiKey:"demo-not-a-real-key",authDomain:"localhost",projectId:PROJECT
    },"phase18_smoke_"+uid);
    clients.push(client);
    const auth=clientAuth(client);
    connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
    const signed=await signInWithEmailAndPassword(auth,email(uid),PASSWORD);
    return getIdToken(signed.user);
  }
  async function req(path,token,body){
    const headers=token?{Authorization:"Bearer "+token}:{};
    if(body!==undefined)headers["Content-Type"]="application/json";
    const response=await fetch(base+path,{
      method:body===undefined?"GET":"POST",
      headers,body:body===undefined?undefined:JSON.stringify(body)
    });
    return {code:response.status,data:await response.json()};
  }
  try{
    const health=await req("/api/phase10/health");
    assert.equal(health.code,200);
    assert.equal(health.data.localDemoOnly,true);
    assert.equal(health.data.schedulerProcessLocal,true);
    assert.equal(health.data.schedulerAlwaysOn,false);
    const admin=await login(ADMIN);
    const volunteer=await login(VOLUNTEERS[0].uid);
    const approved=await req("/api/phase10/admin/cases/"+CASE+"/approve",admin,{});
    assert.equal(approved.code,200,JSON.stringify(approved.data));
    assert.equal(approved.data.status,"offered");
    assert.equal(approved.data.offered,2);
    const own=await req("/api/phase10/volunteer/cases/"+CASE+"/offer",volunteer);
    assert.equal(own.code,200);
    assert.equal(own.data.status,"offered");
    const accepted=await req("/api/phase10/volunteer/cases/"+CASE+
      "/decision",volunteer,{decision:"accepted"});
    assert.equal(accepted.code,200,JSON.stringify(accepted.data));
    assert.equal(accepted.data.status,"committed_accepted");
    console.log("PASS browser demo smoke: login, Admin approval, two automatic "+
      "offers, Volunteer Accept");
  }finally{
    await Promise.all(clients.map(clientDelete));
  }
}
async function main(){
  requireIsolatedEnvironment();
  const appName="phase18_browser_demo_"+process.pid;
  const adminApp=initializeApp({projectId:PROJECT},appName);
  const db=getFirestore(adminApp),auth=getAuth(adminApp);
  let server=null,localApp=null,closing=false;
  async function shutdown(){
    if(closing)return;
    closing=true;
    localApp?.locals.stopAutoDueWorker?.();
    if(server)await new Promise(resolve=>server.close(()=>resolve()));
    await deleteApp(adminApp);
  }
  process.on("SIGINT",()=>{void shutdown().then(()=>process.exit(0))});
  process.on("SIGTERM",()=>{void shutdown().then(()=>process.exit(0))});
  try{
    await seed(db,auth);
    localApp=createPhase10LocalApp({
      db,authClient:auth,autoDueWorkerEnabled:true,autoDuePollMs:5000
    });
    server=await new Promise((resolve,reject)=>{
      const instance=localApp.listen(PORT,"127.0.0.1",()=>resolve(instance));
      instance.once("error",reject);
    });
    const base="http://127.0.0.1:"+PORT;
    if(process.argv.includes("--smoke")){
      await runSmoke(base);
      await shutdown();
      return;
    }
    console.log("\nLOCAL FICTIONAL AUTO-VOLUNTEER DEMO (NOT LIVE)");
    console.log("Admin:     "+base+"/phase10-admin");
    console.log("Volunteer: "+base+"/phase10-volunteer");
    console.log("Case ID:   "+CASE);
    console.log("Admin:     "+email(ADMIN));
    for(const v of VOLUNTEERS)
      console.log("Volunteer "+v.label+": "+email(v.uid));
    console.log("Password for all fictional accounts: "+PASSWORD);
    console.log("Flow: Admin Sign in > Approve & auto-offer > Volunteer Sign in > Check/Accept");
    console.log("Automatic follow-up only while this local terminal stays running.");
    console.log("Press Ctrl+C to stop. No production database, emergency, or real Volunteer affected.\n");
  }catch(error){
    await shutdown();
    throw error;
  }
}
main().catch(e=>{console.error("LOCAL DEMO FAILED:",e.message);process.exitCode=1});
