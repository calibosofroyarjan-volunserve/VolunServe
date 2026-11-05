"use strict";
// Synthetic data only. Refuse to initialize SDKs unless BOTH local emulators are explicit.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const cp = require("node:child_process");
const {initializeTestEnvironment, assertFails} = require("@firebase/rules-unit-testing");
const appSdk = require("firebase/app");
const authSdk = require("firebase/auth");
const storeSdk = require("firebase/firestore");
for(const variable of ["FIRESTORE_EMULATOR_HOST","FIREBASE_AUTH_EMULATOR_HOST"]) {
  assert.match(process.env[variable] || "", /^127\.0\.0\.1:\d+$/, variable+" must target loopback; production access forbidden");
}
const projectId="demo-volunserve";
function load(file, firebase, enabled=true) {
  const module={exports:{}};
  const input=file === "baseline" ? cp.execFileSync("git",["show","e7c2cc8:lib/firebaseAuth.ts"],{encoding:"utf8"}) : fs.readFileSync(file,"utf8");
  const source=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const imports={"./firebase":firebase,"./signupFeature":{EMAIL_FIRST_SIGNUP_ENABLED:enabled},"firebase/auth":authSdk,"firebase/firestore":storeSdk,"react-native":{Platform:{OS:"web"}},"./androidNativePush":{disableAndroidPhoneAlerts:async()=>{}}};
  if (file !== "lib/signupRegistration.ts") imports["./signupRegistration"]=load("lib/signupRegistration.ts",firebase,enabled);
  new Function("require","module","exports",source)(name=>{assert(name in imports,"Unexpected import "+name);return imports[name];},module,module.exports);
  return module.exports;
}
let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log("PASS "+name);};
(async()=>{
  const env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync("firestore.rules","utf8")}});
  const app=appSdk.initializeApp({projectId,apiKey:"demo-signup-only",authDomain:projectId+".firebaseapp.com"},"signup-prod-regression");
  const auth=authSdk.initializeAuth(app,{persistence:authSdk.inMemoryPersistence});
  authSdk.connectAuthEmulator(auth,"http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
  const db=storeSdk.getFirestore(app);
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(":");
  storeSdk.connectFirestoreEmulator(db,host,Number(port));
  const firebase={auth,db};
  const api=load("lib/firebaseAuth.ts",firebase);
  const oldForm=load("lib/firebaseAuth.ts",firebase,false);
  const registration=load("lib/signupRegistration.ts",firebase);
  const suffix=Date.now().toString(36);
  const linking=load("lib/emailFirstSignupAuth.ts",firebase);
  const data={authProvider:"verified_email",firstName:"Test",lastName:"Resident",middleName:"",age:25,email:"signup-emulator-"+suffix+"@example.com",password:"",phoneNumber:"+639171234567",region:"Region III ? Central Luzon",province:"Bulacan",city:"City of San Jose del Monte",barangay:"Muzon",occupationCategory:"Student",occupationSpecialization:"College",occupationOther:""};
  try {
    const basic=(uid,email)=>({
      uid,email,fullName:"Test Resident",lastName:"Resident",firstName:"Test",middleName:"",age:25,phoneNumber:"+639171234567",
      region:data.region,province:data.province,city:data.city,barangay:data.barangay,address:"Muzon, City of San Jose del Monte, Bulacan",
      occupationCategory:"Student",occupationSpecialization:"College",occupationOther:"",occupation:"College",skills:[],skillOther:"",availability:[],
      role:"resident",requestedRole:"resident",primaryRole:"resident",residentAccess:true,volunteerAccess:false,volunteerStatus:"not_applied",activeMode:"resident",status:"approved",identityStatus:"basic",identityVerified:false,profilePictureUrl:"",createdAt:storeSdk.serverTimestamp(),
    });
    const directUid="direct-"+suffix;
    const unverified=env.authenticatedContext(directUid,{email:"direct@example.com",email_verified:false}).firestore();
    await check("RULES directly deny unverified Basic Resident creates without any client service",async()=>{
      await assertFails(unverified.doc("users/"+directUid).set(basic(directUid,"direct@example.com")));
      await assertFails(unverified.doc("users/"+directUid).set({...basic(directUid,"direct@example.com"),createdAt:storeSdk.Timestamp.fromMillis(0)}));
    });
    await check("RULES deny spoofed email, missing verification claims and omitted policy flags",async()=>{
      const spoof=env.authenticatedContext(directUid,{email:"owner@example.com",email_verified:true}).firestore();
      await assertFails(spoof.doc("users/"+directUid).set(basic(directUid,"other@example.com")));
      const missing=env.authenticatedContext(directUid,{email:"direct@example.com"}).firestore();
      await assertFails(missing.doc("users/"+directUid).set(basic(directUid,"direct@example.com")));
    });
    await check("RULES accept verified token email normalized to the production payload",async()=>{
      const verified=env.authenticatedContext(directUid,{email:"Direct@Example.COM",email_verified:true}).firestore();
      await verified.doc("users/"+directUid).set(basic(directUid,"direct@example.com"));
    });
    await check("existing unverified Resident, Volunteer, Admin and Super Admin permissions remain intact",async()=>{
      const roles=["resident","volunteer","admin","superadmin"];
      await env.withSecurityRulesDisabled(async context=>{
        for(const role of roles){const uid="legacy-"+role+"-"+suffix;await context.firestore().doc("users/"+uid).set({...basic(uid,role+"@example.com"),role,volunteerAccess:role==="volunteer",volunteerStatus:role==="volunteer"?"approved":"not_applied"});}
      });
      for(const role of roles){const uid="legacy-"+role+"-"+suffix;const legacy=env.authenticatedContext(uid,{email:role+"@example.com",email_verified:false}).firestore();
        await legacy.doc("users/"+uid).get();await legacy.doc("users/"+uid).update({fullName:"Updated Legacy Name"});
        if(role==="admin"||role==="superadmin")await legacy.collection("users").get();else await assertFails(legacy.collection("users").get());
      }
    });
    const credential=await authSdk.createUserWithEmailAndPassword(auth,data.email,"Password1!");
    const uid=credential.user.uid;
    const profileRef=storeSdk.doc(db,"users",uid);
    await check("unverified pending email cannot create a profile through the new service",async()=>{
      await assert.rejects(api.signUpUser(data),/Verify your email/);
      assert.equal((await storeSdk.getDoc(profileRef)).exists(),false);
    });
    await check("pending account has no dashboard, donation or event permissions",async()=>{
      for(const collection of ["donations","communityEvents","responseAssignments"]) await assertFails(storeSdk.getDocs(storeSdk.collection(db,collection)));
    });
    await check("verification link, reload and refreshed token prove ownership",async()=>{
      await authSdk.sendEmailVerification(credential.user);
      const response=await fetch("http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST+"/emulator/v1/projects/"+projectId+"/oobCodes");
      assert(response.ok);const codes=await response.json();
      const code=codes.oobCodes.find(c=>c.email===data.email && c.requestType==="VERIFY_EMAIL");assert(code);
      await authSdk.applyActionCode(auth,code.oobCode);await authSdk.reload(credential.user);await authSdk.getIdToken(credential.user,true);assert.equal(credential.user.emailVerified,true);
    });
    await check("verified service stays disabled when flag is off",async()=>{
      await assert.rejects(load("lib/firebaseAuth.ts",firebase,false).signUpUser(data),/not enabled/);assert.equal((await storeSdk.getDoc(profileRef)).exists(),false);
    });
    await check("verified email creates a Basic Resident using the guarded production rules",async()=>{
      await api.signUpUser(data);const profile=(await storeSdk.getDoc(profileRef)).data();
      assert.equal(profile.uid,uid);assert.equal(profile.role,"resident");assert.equal(profile.status,"approved");assert.equal(profile.identityVerified,false);assert.equal(profile.volunteerAccess,false);assert.equal(profile.emailVerificationRequired,undefined);assert.equal(profile.emailPolicyVersion,undefined);
    });
    await check("duplicate completion cannot overwrite an existing profile",async()=>{
      const original=(await storeSdk.getDoc(profileRef)).data();await assert.rejects(api.signUpUser({...data,firstName:"Overwrite"}),/already has/);assert.deepEqual((await storeSdk.getDoc(profileRef)).data(),original);
    });
    await check("Basic Resident cannot escalate privileges or add staging-only fields",async()=>{
      await assertFails(storeSdk.updateDoc(profileRef,{role:"admin"}));
      await assertFails(storeSdk.updateDoc(profileRef,{volunteerAccess:true,volunteerStatus:"approved"}));
      await assertFails(storeSdk.updateDoc(profileRef,{emailVerificationRequired:true}));
    });
    await check("verified existing resident still logs in normally",async()=>{
      await authSdk.signOut(auth);assert.equal((await api.loginUser(data.email,"Password1!")).user.uid,uid);
    });
    await check("legacy flag-OFF form creates Auth only, then securely completes the SAME UID after verification",async()=>{
      await authSdk.signOut(auth);
      const legacyData={...data,email:"legacy-form-"+suffix+"@example.com",password:"Password1!",authProvider:"email"};
      const pending=await oldForm.signUpUser(legacyData);const pendingUid=pending.uid;
      assert.equal(auth.currentUser,null);assert.equal(pending.emailVerified,false);
      await env.withSecurityRulesDisabled(async context=>{assert.equal((await context.firestore().doc("users/"+pendingUid).get()).exists,false);});
      const codes=await (await fetch("http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST+"/emulator/v1/projects/"+projectId+"/oobCodes")).json();
      const verification=codes.oobCodes.find(c=>c.email===legacyData.email&&c.requestType==="VERIFY_EMAIL");assert(verification);
      await authSdk.applyActionCode(auth,verification.oobCode);
      const completed=await oldForm.signUpUser(legacyData);assert.equal(completed.uid,pendingUid);
      const saved=(await storeSdk.getDoc(storeSdk.doc(db,"users",pendingUid))).data();assert.equal(saved.uid,pendingUid);
      await assert.rejects(oldForm.signUpUser({...legacyData,firstName:"Overwrite"}),/already has/);
      assert.deepEqual((await storeSdk.getDoc(storeSdk.doc(db,"users",pendingUid))).data(),saved);
      await authSdk.signOut(auth);await assert.rejects(oldForm.signUpUser({...legacyData,password:"WrongPassword1!"}));
    });
    await check("Auth-only account from the old main client is recoverable without duplicates",async()=>{
      await authSdk.signOut(auth);const orphan={...data,email:"old-client-"+suffix+"@example.com",password:"Password1!",authProvider:"email"};
      // This expected denial proves that the rules must NEVER ship alone to old clients.
      await assert.rejects(load("baseline",firebase,false).signUpUser(orphan),/permission denied/i);
      const orphanUid=auth.currentUser.uid;await authSdk.signOut(auth);
      const resumed=await registration.authenticateEmailSignup(orphan.email,orphan.password,true);assert.equal(resumed.uid,orphanUid);
      const pending=await registration.inspectSignupUser(resumed);assert.equal(pending.profileExists,false);assert.equal(pending.user.emailVerified,false);
      await authSdk.sendEmailVerification(resumed);
      const codes=await (await fetch("http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST+"/emulator/v1/projects/"+projectId+"/oobCodes")).json();
      const code=codes.oobCodes.find(c=>c.email===orphan.email&&c.requestType==="VERIFY_EMAIL");assert(code);await authSdk.applyActionCode(auth,code.oobCode);
      const verified=await registration.inspectSignupUser(resumed);assert.equal(verified.user.emailVerified,true);
      assert.equal((await api.signUpUser({...orphan,authProvider:"verified_email",password:""})).uid,orphanUid);
    });
    await check("Google registration links password on the same UID then permits either login",async()=>{
      await authSdk.signOut(auth);
      const google=await authSdk.signInWithCredential(auth,authSdk.GoogleAuthProvider.credential(JSON.stringify({sub:"signup-google-local-"+suffix,email:"signup-google-"+suffix+"@example.com",email_verified:true,name:"Test Google"})));
      const googleUid=google.user.uid;
      await linking.linkEmailFirstGooglePassword("Password1!");assert.equal(auth.currentUser.uid,googleUid);
      assert(auth.currentUser.providerData.some(p=>p.providerId==="password"));
      await api.signUpUser({...data,email:"signup-google-"+suffix+"@example.com"});
      assert.equal((await storeSdk.getDoc(storeSdk.doc(db,"users",googleUid))).data().role,"resident");
      await assert.rejects(linking.linkEmailFirstGooglePassword("Different1!"),/already has/);
      await authSdk.signOut(auth);assert.equal((await api.loginUser("signup-google-"+suffix+"@example.com","Password1!")).user.uid,googleUid);
      await authSdk.signOut(auth);
      assert.equal((await authSdk.signInWithCredential(auth,authSdk.GoogleAuthProvider.credential(JSON.stringify({sub:"signup-google-local-"+suffix,email:"signup-google-"+suffix+"@example.com",email_verified:true})))).user.uid,googleUid);
    });
    console.log(checks+" signup Auth/Firestore emulator scenarios passed");
  } finally {
    await authSdk.signOut(auth);await storeSdk.terminate(db);await appSdk.deleteApp(app);await env.cleanup();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
