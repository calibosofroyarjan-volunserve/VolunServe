"use strict";
/**
 * READ ONLY - fixed fictional E2E_002 staging Admin browser sign-in diagnostic.
 * Reports whether the exact original case validator has really verified email
 * and whether a valid Admin Firebase session can read the Admin's own profile
 * through the CURRENT live staging Firestore Security Rules.
 *
 * No password inputs, account updates, Rules releases or production access.
 * Short-lived ID tokens are never logged.
 */
const fs=require("node:fs");
const path=require("node:path");
const {createRequire}=require("node:module");
const PROJECT="volunserve-volunteer-staging";
const CASE="STAGING_E2E_002";
const EMAIL="calibosofroyarjan@gmail.com";
const API_KEY="AIzaSyCGS-VySgPPEcqgKH0tBqQCZX_YYhJFuuM";
const stop=message=>{throw Error("STAGING DIAGNOSTIC STOPPED: "+message);};
function args(argv){
  let file="";
  for(let i=0;i<argv.length;i++){
    if(argv[i]==="--key-file"&&argv[i+1]&&!file){file=argv[++i];continue;}
    stop("Unexpected input, only --key-file allowed (no --apply, no writes)");
  }
  if(!file)stop('Usage: node scripts/qa-staging-admin-postverification-login-check-20261123.cjs --key-file "STAGING_JSON"');
  return path.resolve(file);
}
async function query(url,options){
  let response;
  try{
    response=await fetch(url,{...options,signal:AbortSignal.timeout(45000)});
  }catch(e){stop("Staging Firebase network request failed ("+String(e?.code||"network_unavailable")+")");}
  let data;
  try{data=await response.json();}catch{data=null;}
  return {status:response.status,ok:response.ok,data};
}
async function main(){
  const keyFile=args(process.argv.slice(2));
  if(!fs.existsSync(keyFile)||!fs.statSync(keyFile).isFile())
    stop("Isolated Firebase staging service account file not found");
  const credential=JSON.parse(fs.readFileSync(keyFile,"utf8"));
  if(credential.type!=="service_account"||credential.project_id!==PROJECT||
     !String(credential.client_email||"").endsWith("@"+PROJECT+".iam.gserviceaccount.com")||
     !String(credential.private_key||"").includes("BEGIN PRIVATE KEY"))
    stop("Wrong service account, only exact isolated staging Firebase is allowed");
  const req=createRequire(path.resolve(__dirname,"../backend/package.json"));
  const {initializeApp,deleteApp,cert}=req("firebase-admin/app");
  const {getAuth}=req("firebase-admin/auth");
  const {getFirestore}=req("firebase-admin/firestore");
  const app=initializeApp({credential:cert(credential),projectId:PROJECT},
    "qa-staging-admin-after-email-link-"+process.pid);
  try{
    const auth=getAuth(app),db=getFirestore(app);
    const caseSnap=await db.collection("disasterCases").doc(CASE).get();
    if(!caseSnap.exists||caseSnap.data()?.testOnly!==true||
       caseSnap.data()?.source!=="staging_synthetic_e2e"||
       caseSnap.data()?.testCategory!=="staging_synthetic_volunteer_e2e_002")
      stop("Original isolated fictional case missing");
    const uid=String(caseSnap.data().validatedBy||"");
    if(!/^[A-Za-z0-9_-]{1,160}$/.test(uid))
      stop("Original validator not found");
    const [account,profileSnap]=await Promise.all([
      auth.getUser(uid),db.collection("users").doc(uid).get()
    ]);
    const p=profileSnap.data()||{};
    if(!profileSnap.exists||account.email?.toLowerCase()!==EMAIL||
       account.disabled||p.role!=="admin"||
       (p.status!=null&&p.status!=="approved")||p.adminStatus==="suspended")
      stop("Admin must be exactly the original approved, enabled staging validator");
    console.log("PASS 1/3: approved staging Admin identity and correct Gmail account");
    if(account.emailVerified!==true){
      console.log("BLOCKER: staging Firebase Auth emailVerified=FALSE");
      console.log("The email link has not verified THIS staging account yet.");
      console.log("Check the Firebase verification result page, not just whether Gmail message was opened.");
      return;
    }
    console.log("PASS 2/3: Firebase staging Admin emailVerified=TRUE");
    // A fresh ID token must carry email_verified so the Firestore rules
    // evaluate the same identity data as the real web SDK.
    const custom=await auth.createCustomToken(uid);
    const signIn=await query("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key="+API_KEY,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({token:custom,returnSecureToken:true})
    });
    if(!signIn.ok||!signIn.data?.idToken)
      stop("Unable to mint short-lived isolated staging test session (HTTP "+signIn.status+")");
    const decoded=await auth.verifyIdToken(signIn.data.idToken,true);
    if(decoded.uid!==uid||decoded.aud!==PROJECT||
       decoded.iss!=="https://securetoken.google.com/"+PROJECT)
      stop("Firebase test session mismatch; never cross project boundary");
    if(decoded.email_verified!==true){
      console.log("BLOCKER: new Firebase staging ID token still lacks email_verified=TRUE");
      console.log("Try a new browser session after Firebase Auth state propagation.");
      return;
    }
    const profileRead=await query(
      "https://firestore.googleapis.com/v1/projects/"+PROJECT+
      "/databases/(default)/documents/users/"+uid,
      {headers:{Authorization:"Bearer "+signIn.data.idToken,"Cache-Control":"no-store"}}
    );
    if(profileRead.status===403){
      console.log("BLOCKER: staging Admin Firestore self-profile READ DENIED (HTTP 403).");
      console.log("Email is verified. Existing staging Firestore Rules require a narrow review/fix.");
      return;
    }
    if(!profileRead.ok)
      stop("Staging Firestore self-profile read failed (HTTP "+profileRead.status+")");
    if(!String(profileRead.data?.name||"").endsWith("/users/"+uid))
      stop("Firestore returned an unexpected profile path");
    console.log("PASS 3/3: signed-in staging Admin can read own profile under deployed Firestore Rules");
    console.log("RESULT: STAGING CLOUD AUTH + ADMIN PROFILE ACCESS PASS.");
    console.log("If web stays on /login: open a fresh InPrivate window; check sign-in errors/redirect in browser.");
    console.log("READ ONLY; no Admin permissions, Rules, passwords or live production changed.");
  }finally{await deleteApp(app);}
}
main().catch(e=>{console.error(String(e?.message||"unknown").slice(0,200));process.exitCode=1;});
