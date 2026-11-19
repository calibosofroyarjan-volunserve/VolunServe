"use strict";
/**
 * Real Firebase JS SDK requests against isolated Auth + Firestore emulators.
 * No production URLs, credentials, mailbox access or user data.
 * Auth-email link OOB codes are read only from the Auth emulator.
 *
 * Pinned policy is exactly the previously verified LIVE Hosting build;
 * Firestore rules are the separate review-only candidate in this branch.
 */
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const ts = require("typescript");
const { initializeApp, deleteApp } = require("firebase/app");
const {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword,
  sendEmailVerification, applyActionCode, reload, getIdToken,
  signOut, signInWithEmailAndPassword,
} = require("firebase/auth");
const {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, Timestamp,
} = require("firebase/firestore");

const PROJECT = "demo-volunserve-resident-signup-e2e";
const LIVE_SHA = "6b30cbd7fe72abb247b6b32233411048d6e42b84";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!authHost || !firestoreHost ||
    !/^(127[.]0[.]0[.]1|localhost):[0-9]+$/.test(authHost) ||
    !/^(127[.]0[.]0[.]1|localhost):[0-9]+$/.test(firestoreHost)) {
  throw new Error("REFUSED: local Auth and Firestore emulator endpoints required");
}
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("REFUSED: no production service-account credentials allowed");
}
function liveRead(path) {
  return cp.execFileSync("git", ["show", LIVE_SHA + ":" + path], {encoding:"utf8"});
}
function loadTS(source, dependencies={}) {
  const mod={exports:{}};
  const javascript=ts.transpileModule(source,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText;
  new Function("module","exports","require", javascript)(mod,mod.exports,key=>{
    assert(Object.prototype.hasOwnProperty.call(dependencies,key),"Unknown import "+key);
    return dependencies[key];
  });
  return mod.exports;
}
const generated = loadTS(liveRead("lib/disposableEmailDomains.generated.ts"));
const emailPolicy = loadTS(liveRead("lib/registrationEmailPolicy.ts"),{
  "./disposableEmailDomains.generated":generated,
});
const routing = loadTS(liveRead("lib/unifiedLoginRouting.ts"),{
  "./firebaseAuth":{
    homeRouteForProfile: profile => profile.role === "resident" ? "/(tabs)" : "/not-resident",
    isAdminProfile:()=>false,
    isApprovedProfile: profile => profile.status === "approved",
    isLguPersonnelProfile:()=>false,
    isSuperAdminProfile:()=>false,
  },
});
const app = initializeApp({
  projectId: PROJECT, apiKey:"demo-auth-key",
  appId:"1:000000000000:web:volunserve-emulator",
  authDomain:PROJECT+".firebaseapp.com",
},"volunserve-qa-e2e");
const auth = getAuth(app);
connectAuthEmulator(auth,"http://"+authHost,{disableWarnings:true});
const db = getFirestore(app);
const [host,port] = firestoreHost.split(":");
connectFirestoreEmulator(db,host,Number(port));

function validProfile(uid,email) {
  return {
    uid,email,fullName:"Resident, Test",
    firstName:"Test",lastName:"Resident",middleName:"",
    age:23,phoneNumber:"",
    region:"Region III – Central Luzon",province:"Bulacan",
    city:"City of San Jose del Monte",barangay:"Muzon Proper",
    address:"Muzon Proper, City of San Jose del Monte, Bulacan",
    occupationCategory:"Student",occupationSpecialization:"College",
    occupationOther:"",occupation:"Student",skills:[],
    skillOther:"",availability:[],role:"resident",
    requestedRole:"resident",primaryRole:"resident",
    residentAccess:true,volunteerAccess:false,
    volunteerStatus:"not_applied",activeMode:"resident",
    status:"approved",identityStatus:"basic",identityVerified:false,
    profilePictureUrl:"",createdAt:Timestamp.now(),
  };
}
async function activateEmulatorVerification(email) {
  const endpoint="http://"+authHost+"/emulator/v1/projects/"+PROJECT+"/oobCodes";
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(10000)});
  assert(response.ok,"Auth emulator OOB inspection endpoint unavailable");
  const codes=(await response.json()).oobCodes||[];
  const code=[...codes].reverse().find(v=>v.email===email && v.requestType==="VERIFY_EMAIL");
  assert(code?.oobCode,"Missing synthetic verification email link for "+email);
  await applyActionCode(auth,code.oobCode);
}
async function registeredResident(email) {
  const password="MockOnly!P455w0rd";
  assert.equal(emailPolicy.getRegistrationEmailError(email),null,
    "Deployed client policy must allow approved signup mailbox");
  const {user}=await createUserWithEmailAndPassword(auth,email,password);
  const record=doc(db,"users",user.uid);
  assert(!user.emailVerified,"New Auth UID must start unverified");
  await assert.rejects(setDoc(record,validProfile(user.uid,email)),
    /permission|denied/i,"Unverified UID must not create a Resident profile");
  await sendEmailVerification(user);
  await activateEmulatorVerification(email);
  await reload(user);
  assert.equal(user.emailVerified,true,"Emulated inbox link must verify user");
  await getIdToken(user,true);
  await setDoc(record,validProfile(user.uid,email));
  await signOut(auth);
  const relogged=(await signInWithEmailAndPassword(auth,email,password)).user;
  await reload(relogged);
  assert.equal(relogged.emailVerified,true);
  assert.equal(relogged.uid,user.uid,"Login must use original UID");
  const snap=await getDoc(doc(db,"users",relogged.uid));
  assert(snap.exists(),"Verified Resident must read their profile");
  assert.equal(snap.data().role,"resident");
  assert.equal(snap.data().identityVerified,false,"Basic Resident is never auto Verified");
  assert.equal(routing.unifiedPasswordDestination(snap.data()),"/(tabs)",
    "Resident must be routed into own portal, never Guest or staff");
  await signOut(auth);
  console.log("PASS: synthetic "+email.split("@")[1]+" signup → inbox verification → Basic Resident profile → password login");
}
async function unownedGmailDenied(email) {
  const password="MockOnly!P455w0rd";
  const {user}=await createUserWithEmailAndPassword(auth,email,password);
  await sendEmailVerification(user);
  await activateEmulatorVerification(email);
  await reload(user);
  assert.equal(user.emailVerified,true);
  await getIdToken(user,true);
  await assert.rejects(
    setDoc(doc(db,"users",user.uid),validProfile(user.uid,email)),
    /permission|denied/i,
    "Inbox-verified Gmail without Google-linked identity cannot create Resident"
  );
  await signOut(auth);
  console.log("PASS: inbox-only Gmail UID denied Basic Resident profile");
}
async function directSdkBypass(email) {
  assert(emailPolicy.getRegistrationEmailError(email),
    "Live frontend must reject the disallowed email");
  // Raw Firebase Auth SDK still allows creating a UID in Spark plan.
  // Firestore must DENY an approved Resident profile for that UID.
  const password="MockOnly!P455w0rd";
  const {user}=await createUserWithEmailAndPassword(auth,email,password);
  await sendEmailVerification(user);
  await activateEmulatorVerification(email);
  await reload(user);
  await getIdToken(user,true);
  await assert.rejects(
    setDoc(doc(db,"users",user.uid),validProfile(user.uid,email)),
    /permission|denied/i,
    "Proposed Firestore rules must reject direct-SDK account bypass"
  );
  await signOut(auth);
  console.log("PASS: direct SDK "+email.split("@")[1]+" UID can exist but cannot create Resident profile");
}
(async()=>{
  try{
    for(const email of [
      "invalid@sample.co","invalid@outlook.com","invalid@tempmail.com",
      "invalid@yahoo.com.ph","invalid@googlemail.com","invalid@gmail.com.fake.test",
    ]){
      assert(emailPolicy.getRegistrationEmailError(email),email+" must be blocked at browser signup");
    }
    assert.equal(emailPolicy.getRegistrationEmailError("resident+tag@gmail.com")!==null,true);
    // A password-only Gmail account can still exist in Firebase Auth, but
    // must not gain a Basic Resident profile, even after inbox verification.
    await unownedGmailDenied("synthetic.basic.resident@gmail.com");
    await registeredResident("synthetic.basic.resident@yahoo.com");
    await directSdkBypass("synthetic.invalid@outlook.com");
    console.log("PASS: Firebase Auth/Firestore emulator contract completed. NOT a live-browser acceptance test.");
  }finally{
    await signOut(auth).catch(()=>{});
    await deleteApp(app);
  }
})().catch(error=>{console.error("FAIL emulator E2E:",error.message||error);process.exitCode=1;});
