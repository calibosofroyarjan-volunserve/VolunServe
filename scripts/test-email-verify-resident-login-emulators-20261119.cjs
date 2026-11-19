"use strict";
/** Synthetic Auth+Firestore emulator integration; NEVER accesses production. */
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase/app");
const {
  getAuth,connectAuthEmulator,createUserWithEmailAndPassword,
  sendEmailVerification,applyActionCode,reload,signOut,signInWithEmailAndPassword,
}=require("firebase/auth");
const {
  getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc,serverTimestamp,
}=require("firebase/firestore");

const PROJECT="demo-volunserve-e2e-provider-20261119";
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Refusing live service access: both Firebase emulators are required.");
}
const host="http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST;
const app=initializeApp({apiKey:"fake-emulator-key",projectId:PROJECT,authDomain:PROJECT+".firebaseapp.com"});
const auth=getAuth(app);
connectAuthEmulator(auth,host,{disableWarnings:true});
const db=getFirestore(app);
const [firestoreHost,firestorePort]=process.env.FIRESTORE_EMULATOR_HOST.split(":");
connectFirestoreEmulator(db,firestoreHost,Number(firestorePort));

function profile(uid,email){
  return {
    uid,email,fullName:"Santos, Maria",firstName:"Maria",lastName:"Santos",middleName:"",
    age:25,phoneNumber:"",region:"Region III - Central Luzon",province:"Bulacan",
    city:"City of San Jose del Monte",barangay:"Muzon Proper",
    address:"Muzon Proper, City of San Jose del Monte, Bulacan",
    occupationCategory:"Student",occupationSpecialization:"College",occupationOther:"",
    occupation:"Student",skills:[],skillOther:"",availability:[],
    role:"resident",requestedRole:"resident",primaryRole:"resident",
    residentAccess:true,volunteerAccess:false,volunteerStatus:"not_applied",
    activeMode:"resident",status:"approved",identityStatus:"basic",identityVerified:false,
    profilePictureUrl:"",createdAt:serverTimestamp(),
  };
}
async function verifyEmail(user){
  await sendEmailVerification(user);
  const response=await fetch(host+"/emulator/v1/projects/"+PROJECT+"/oobCodes");
  assert(response.ok,"Auth emulator OOB endpoint failed");
  const data=await response.json();
  const codes=(data.oobCodes||[]).filter(c=>c.email===user.email && c.requestType==="VERIFY_EMAIL");
  assert(codes.length>0,"Verification email OOB code unavailable in emulator");
  await applyActionCode(auth,codes.at(-1).oobCode);
  await reload(user);
  await user.getIdToken(true);
  assert.equal(user.emailVerified,true,"Email was not verified");
}
async function run(){
  const yahoo="resident-emulator@yahoo.com", password="Password-2026!";
  const {user}=await createUserWithEmailAndPassword(auth,yahoo,password);
  assert.equal(user.emailVerified,false);
  let rejected=false;
  try{await setDoc(doc(db,"users",user.uid),profile(user.uid,yahoo));}
  catch(e){rejected=e?.code==="permission-denied";}
  assert(rejected,"Unverified Yahoo must not create Resident profile");
  await verifyEmail(user);
  await setDoc(doc(db,"users",user.uid),profile(user.uid,yahoo));
  await signOut(auth);
  const loggedIn=(await signInWithEmailAndPassword(auth,yahoo,password)).user;
  assert.equal(loggedIn.uid,user.uid,"Login created another UID");
  await loggedIn.getIdToken(true);
  const snap=await getDoc(doc(db,"users",loggedIn.uid));
  assert(snap.exists(),"Resident document missing after login");
  assert.equal(snap.data().role,"resident");
  assert.equal(snap.data().email,yahoo);
  console.log("PASS: Yahoo register -> unverified deny -> verification -> Basic Resident create -> login");

  // Simulate a shared Gmail receive-only verification holder who has NO Google
  // OAuth identity; direct Firebase SDK must NOT create a Resident profile.
  await signOut(auth);
  const gmail="shared-inbox-emulator@gmail.com";
  const {user:gmailUser}=await createUserWithEmailAndPassword(auth,gmail,password);
  await verifyEmail(gmailUser);
  rejected=false;
  try{await setDoc(doc(db,"users",gmailUser.uid),profile(gmailUser.uid,gmail));}
  catch(e){rejected=e?.code==="permission-denied";}
  assert(rejected,"Password-only verified Gmail must not create a Resident profile");
  console.log("PASS: Gmail verification alone cannot bypass new Resident Google OAuth gate");
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{try{await deleteApp(app);}catch{}});
