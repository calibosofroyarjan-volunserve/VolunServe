"use strict";
// Diagnostic proof only. No production code or checked-in Rules are modified.
// Both policy variants run in a fresh demo project on explicit loopback emulators.
const assert=require("node:assert/strict"),fs=require("node:fs"),cp=require("node:child_process"),ts=require("typescript");
const {initializeTestEnvironment,assertFails}=require("@firebase/rules-unit-testing");
const apps=require("firebase/app"),authSdk=require("firebase/auth"),store=require("firebase/firestore");
for(const variable of ["FIRESTORE_EMULATOR_HOST","FIREBASE_AUTH_EMULATOR_HOST"])assert.match(process.env[variable]||"",/^127\.0\.0\.1:\d+$/,variable+": refusing non-loopback access");
const baseline="e7c2cc84afcc1b0a8885ce94a41a9a444dcfe751";
const strictRules=fs.readFileSync("firestore.rules","utf8");
const oldRules=cp.execFileSync("git",["show",baseline+":firestore.rules"],{encoding:"utf8"});
const oldAuth=cp.execFileSync("git",["show",baseline+":lib/firebaseAuth.ts"],{encoding:"utf8"});
let checks=0,verificationRequests=0;
const check=async(name,fn)=>{await fn();checks++;console.log("PASS "+name);};
(async()=>{
 const projectId="demo-volunserve"; // Auth emulator routes SDK API-key calls to its CLI project.
 const app=apps.initializeApp({projectId,apiKey:"demo-transition-only",authDomain:projectId+".firebaseapp.com"},projectId);
 const auth=authSdk.initializeAuth(app,{persistence:authSdk.inMemoryPersistence});
 authSdk.connectAuthEmulator(auth,"http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
 const db=store.getFirestore(app);const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(":");store.connectFirestoreEmulator(db,host,Number(port));
 const contexts=[];let env;
 async function policy(rules){env=await initializeTestEnvironment({projectId,firestore:{rules}});contexts.push(env);}
 function load(file,enabled){const module={exports:{}};const input=file==="baseline"?oldAuth:fs.readFileSync(file,"utf8");
  const sdk={...authSdk,sendEmailVerification:async(user)=>{verificationRequests++;return authSdk.sendEmailVerification(user);}};
  const imports={"firebase/auth":sdk,"firebase/firestore":store,"./firebase":{auth,db},"./signupFeature":{EMAIL_FIRST_SIGNUP_ENABLED:enabled},"react-native":{Platform:{OS:"web"}},"./androidNativePush":{disableAndroidPhoneAlerts:async()=>{}}};
  if(file!=="lib/signupRegistration.ts")imports["./signupRegistration"]=load("lib/signupRegistration.ts",enabled);
  const js=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function("require","module","exports",js)(name=>{assert(name in imports,"Unexpected import "+name);return imports[name];},module,module.exports);return module.exports;
 }
 const legacy=load("baseline",false),compatible=load("lib/firebaseAuth.ts",false);
 const data={authProvider:"email",email:"legacy@example.com",password:"SyntheticPass1!",firstName:"Synthetic",lastName:"Resident",middleName:"",age:30,phoneNumber:"",region:"Region III",province:"Bulacan",city:"City of San Jose del Monte",barangay:"Muzon",occupationCategory:"Student",occupationSpecialization:"College",occupationOther:""};
 const fixture=store.doc(db,"volunteerStats","transition-protected-fixture");
 async function verify(email){const response=await fetch("http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST+"/emulator/v1/projects/"+projectId+"/oobCodes");assert(response.ok);const codes=await response.json();const code=codes.oobCodes.find(c=>c.email===email&&c.requestType==="VERIFY_EMAIL");assert(code,"Verification must actually have been requested");await authSdk.applyActionCode(auth,code.oobCode);}
 try{
  await policy(strictRules);
  await env.withSecurityRulesDisabled(async context=>{
   await context.firestore().doc("volunteerStats/transition-protected-fixture").set({label:"synthetic protected fixture"});
   for(const role of ["resident","volunteer","admin","superadmin"]){const uid="existing-"+role;await context.firestore().doc("users/"+uid).set({uid,email:role+"@example.com",role,status:"approved",residentAccess:true,volunteerAccess:role==="volunteer",volunteerStatus:role==="volunteer"?"approved":"not_applied",activeMode:"resident"});}
  });
  let orphanUid, approvedTemplate;
  await check("unchanged profile-first client fails before requesting email, and Auth-only UID has no protected access",async()=>{
   const before=verificationRequests;await assert.rejects(legacy.signUpUser(data),/permission denied/i);assert.equal(verificationRequests,before);
   orphanUid=auth.currentUser.uid;assert.equal(auth.currentUser.emailVerified,false);assert.equal((await store.getDoc(store.doc(db,"users",orphanUid))).exists(),false);await assertFails(store.getDocFromServer(fixture));
  });
  await check("retrying unchanged cached client cannot resume the stranded UID or send verification",async()=>{
   const before=verificationRequests;await assert.rejects(legacy.signUpUser(data),/already|registered/i);assert.equal(verificationRequests,before);
  });
  await check("supported flag-OFF rollback authenticates same UID, verifies, completes once, and preserves strict Rules",async()=>{
   const pending=await compatible.signUpUser(data);assert.equal(pending.uid,orphanUid);assert.equal(pending.emailVerified,false);assert.equal(auth.currentUser,null);
   await env.withSecurityRulesDisabled(async context=>{assert.equal((await context.firestore().doc("users/"+orphanUid).get()).exists,false);});
   await verify(data.email);const completed=await compatible.signUpUser(data);assert.equal(completed.uid,orphanUid);assert.equal(completed.emailVerified,true);assert.equal((await store.getDocFromServer(fixture)).data().label,"synthetic protected fixture");
   const ref=store.doc(db,"users",orphanUid),saved=(await store.getDoc(ref)).data();approvedTemplate=saved;await assert.rejects(compatible.signUpUser({...data,firstName:"Overwrite"}),/already has/);assert.deepEqual((await store.getDoc(ref)).data(),saved);
  });
  await check("existing Resident, Volunteer, Admin and Super Admin retain approved access without new client flags",async()=>{
   for(const role of ["resident","volunteer","admin","superadmin"]){const uid="existing-"+role;const old=env.authenticatedContext(uid,{email:role+"@example.com",email_verified:false}).firestore();await old.doc("users/"+uid).get();await old.doc("volunteerStats/transition-protected-fixture").get();await old.doc("users/"+uid).update({fullName:"Preserved Existing Role"});if(role==="admin"||role==="superadmin")await old.collection("users").get();else await assertFails(old.collection("users").get());}
  });
  await authSdk.signOut(auth);
  await policy(oldRules);let admittedUid;
  await check("UNSAFE rollback reproduces unverified approved profile creation and protected read through direct SDK",async()=>{
   const unsafe={...data,email:"unsafe-rollback@example.com"};const user=await legacy.signUpUser(unsafe);admittedUid=user.uid;assert.equal(user.emailVerified,false);
   await authSdk.signInWithEmailAndPassword(auth,unsafe.email,unsafe.password);const profile=(await store.getDoc(store.doc(db,"users",admittedUid))).data();assert.equal(profile.status,"approved");assert.equal(profile.role,"resident");assert.equal((await store.getDocFromServer(fixture)).data().label,"synthetic protected fixture");
  });
  await policy(strictRules);
  await check("restoring create-only guard cannot undo access already admitted during an unsafe compatibility window",async()=>{
   assert.equal(auth.currentUser.uid,admittedUid);assert.equal(auth.currentUser.emailVerified,false);assert.equal((await store.getDocFromServer(fixture)).data().label,"synthetic protected fixture");
  });
  await check("strict policy has no client legacy-flag or backdated timestamp exemption",async()=>{
   const probe=env.authenticatedContext("new-unverified",{email:"new@example.com",email_verified:false}).firestore();
   const template=approvedTemplate;
   const payload={...template,uid:"new-unverified",email:"new@example.com",createdAt:store.Timestamp.fromMillis(0)};
   await assertFails(probe.doc("users/new-unverified").set(payload));await assertFails(probe.doc("users/new-unverified").set({...payload,legacy:true}));
  });
  console.log(checks+" rollout/rollback diagnostic scenarios passed; release remains BLOCKED");
  fs.mkdirSync(".expo",{recursive:true});fs.writeFileSync(".expo/signup-transition-proof.json",JSON.stringify({baseline,projectId,checks,releaseBlocked:true,oldClientProfileFirstCompatible:false,strictGuardRetained:true,unsafeRollbackReproduced:true,unsafeWindowAccessPersistsAfterGuardRestore:true,featureFlagDisabledByDefault:true},null,2));
 }finally{
  await authSdk.signOut(auth);await store.terminate(db);await apps.deleteApp(app);for(const context of contexts)await context.cleanup();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
