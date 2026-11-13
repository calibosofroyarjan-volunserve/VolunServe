"use strict";
// Offline behavior and preservation tests. No SDK instances or network access.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const cp = require("node:child_process");
const ts = require("typescript");
let checks = 0;
const check = (name, fn) => Promise.resolve().then(fn).then(() => {checks++; console.log("PASS " + name);});
function load(source, imports = {}, env = process.env) {
  const module = {exports:{}};
  const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function("require","module","exports","process", js)(name => {
    if (!(name in imports)) throw Error("Unexpected import: " + name);
    return imports[name];
  },module,module.exports,{env});
  return module.exports;
}
const read = file => fs.readFileSync(file,"utf8");
const current = read("lib/firebaseAuth.ts");
const baseline = cp.execFileSync("git",["show","e7c2cc8:lib/firebaseAuth.ts"],{encoding:"utf8"});
const emailPolicy = load(read("lib/registrationEmailPolicy.ts"), {
  "./disposableEmailDomains.generated": load(read("lib/disposableEmailDomains.generated.ts")),
});
const residentDetailsGuard = load(read("lib/requireCompleteResidentRegistration.ts"), {
  "../constants/sjdmBarangays": load(read("constants/sjdmBarangays.ts")),
  "../constants/occupationOptions": load(read("constants/occupationOptions.ts")),
});
const data = {firstName:"Maria",lastName:"Santos",middleName:"",email:"resident@example.com",password:"Password1!",age:25,phoneNumber:"+639171234567",region:"Region III ? Central Luzon",province:"Bulacan",city:"City of San Jose del Monte",barangay:"Muzon Proper",occupationCategory:"Student",occupationSpecialization:"College",occupationOther:"",role:"volunteer"};
function harness(source, enabled, options = {}) {
  const calls = [];
  const user = {uid:"signup-test",email:data.email,emailVerified:options.verified ?? true,providerData:(options.providers || ["password"]).map(providerId=>({providerId})),photoURL:"",reload:async()=>{calls.push("reload");}};
  const auth = {currentUser:options.noUser ? null : user};
  let profile = options.existing || null;
  let saved;
  const snapshot = () => ({exists:()=>!!profile,data:()=>profile});
  const authSdk = {
    GoogleAuthProvider: class {static PROVIDER_ID="google.com";},
    EmailAuthProvider:{PROVIDER_ID:"password",credential:(email,password)=>({email,password})},
    createUserWithEmailAndPassword:async()=>{calls.push("create");if(options.createError)throw Object.assign(new Error("Create failed"),{code:options.createError});auth.currentUser=user;return {user};},
    signInWithEmailAndPassword:async()=>{calls.push("signin");if(options.signInError)throw Object.assign(new Error("Sign in failed"),{code:options.signInError});auth.currentUser=user;return {user};},
    sendEmailVerification:async()=>{calls.push("verification");if(options.sendError)throw Object.assign(new Error("Delivery request failed"),{code:"auth/network-request-failed"});},
    signOut:async()=>{calls.push("signout");auth.currentUser=null;},
    reload:async()=>{calls.push("reload");},
    getIdToken:async(_,refresh)=>{assert.equal(refresh,true);calls.push("token");return "token";},
    updatePassword:async()=>{calls.push("first-password");user.providerData.push({providerId:"password"});},
    linkWithCredential:async()=>{calls.push("link");if(options.sdkLinkError)throw Object.assign(new Error("Link rejected"),{code:options.sdkLinkError});user.providerData.push({providerId:"password"});return {user};},
  };
  const store = {doc:(_,collection,uid)=>({collection,uid}),getDoc:async()=>{calls.push("read");return snapshot();},serverTimestamp:()=>"timestamp",writeBatch:()=>({set:(_,value)=>{saved=value;},commit:async()=>{calls.push("commit");profile=saved;}}),runTransaction:async(_,fn)=>{calls.push("transaction");await fn({get:async()=>options.raceExisting ? {exists:()=>true} : snapshot(),set:(_,value)=>{saved=value;profile=value;}});}};
  const imports = {"./requireCompleteResidentRegistration":residentDetailsGuard,"./registrationEmailPolicy":emailPolicy,"./firebase":{auth,db:{}},"./signupFeature":{EMAIL_FIRST_SIGNUP_ENABLED:enabled},"firebase/auth":authSdk,"firebase/firestore":store,"react-native":{Platform:{OS:"web"}},"./androidNativePush":{disableAndroidPhoneAlerts:async()=>{}}};
  imports["./signupRegistration"]=load(read("lib/signupRegistration.ts"),imports);
  return {registration:imports["./signupRegistration"],api:load(source,imports),link:load(read("lib/emailFirstSignupAuth.ts"),imports),calls,user,auth,profile:()=>profile};
}
(async()=>{
  await check("web Signup stays premium after unrelated Hosting builds; native remains opt-in",()=>{
    for (const value of [undefined,"false","1","TRUE",""]) {
      const native=load(read("lib/signupFeature.ts"),{"react-native":{Platform:{OS:"android"}}},{EXPO_PUBLIC_EMAIL_FIRST_SIGNUP:value});
      assert.equal(native.EMAIL_FIRST_SIGNUP_ENABLED,false);
      assert.equal(native.canResumeEmailFirstSignup({providerData:[{providerId:"password"}]}),false);
      const web=load(read("lib/signupFeature.ts"),{"react-native":{Platform:{OS:"web"}}},{EXPO_PUBLIC_EMAIL_FIRST_SIGNUP:value});
      assert.equal(web.EMAIL_FIRST_SIGNUP_ENABLED,true);
      assert.equal(web.canResumeEmailFirstSignup({providerData:[{providerId:"password"}]}),true);
      assert.equal(web.canResumeEmailFirstSignup({providerData:[]}),false);
    }
    const nativeOptIn=load(read("lib/signupFeature.ts"),{"react-native":{Platform:{OS:"android"}}},{EXPO_PUBLIC_EMAIL_FIRST_SIGNUP:"true"});
    assert.equal(nativeOptIn.EMAIL_FIRST_SIGNUP_ENABLED,true);
    const ios=load(read("lib/signupFeature.ts"),{"react-native":{Platform:{OS:"ios"}}},{EXPO_PUBLIC_EMAIL_FIRST_SIGNUP:""});
    assert.equal(ios.EMAIL_FIRST_SIGNUP_ENABLED,false);
  });
  await check("legacy signup design matches published source apart from specific inline email errors",()=>{
    const baseRef="f7bc8d12d8e926365175afb5288f2adf214025a5";
    const extract=text=>text.replace(/\r\n/g,"\n").slice(text.replace(/\r\n/g,"\n").indexOf("  const currentMeta = STEP_META[step];")).replace(/\nexport default function Signup\(\) \{[\s\S]*$/,'').trimEnd();
    for(const file of ["app/signup.tsx","app/signup.web.tsx"]) {
      const source=read(file);
      assert(source.includes("getRegistrationEmailError(formData.email)"),"Step 1 must screen disposable mail: "+file);
      assert(source.includes("const emailValid = emailError === null;"),"Rejected email must block Next: "+file);
      assert(source.includes("emailError,"),"Show the exact email validation reason: "+file);
      let rendered=extract(source);
      if(file.endsWith(".web.tsx")){
        const current=`{formData.email.length > 0 && !!validation.emailError ? (
                    <ValidationText ok={false}>{validation.emailError}</ValidationText>
                  ) : null}`;
        const original=`{formData.email.length > 0 && !validation.emailValid ? (
                    <ValidationText ok={false}>Enter a valid email address.</ValidationText>
                  ) : null}`;
        assert.equal(rendered.split(current).length,2,"Specific web inline email error not found");
        rendered=rendered.replace(current,original);
      } else {
        const newInline=`{formData.email.length > 0 && !!validation.emailError && (
                <ValidationText ok={false}>{validation.emailError}</ValidationText>
              )}
              `;
        assert.equal(rendered.split(newInline).length,2,"Native email field error not found");
        rendered=rendered.replace(newInline,"");
      }
      const published=extract(cp.execFileSync("git",["show",baseRef+":"+file],{encoding:"utf8"}));
      assert.equal(rendered,published,"Unexpected published signup layout drift: "+file);
    }
  });
  for(const enabled of [false,true]) {
    await check("legacy email form defers profile and signs out pending UID, flag="+enabled,async()=>{
      const h=harness(current,enabled,{verified:false,noUser:true});
      const result=await h.api.signUpUser({...data,authProvider:"email"});
      assert.equal(result.uid,h.user.uid);assert.equal(h.profile(),null);assert(h.calls.includes("verification"));assert(h.calls.includes("signout"));assert(!h.calls.includes("transaction"));
    });
    await check("legacy verified resubmission authenticates the same UID, flag="+enabled,async()=>{
      const h=harness(current,enabled,{createError:"auth/email-already-in-use"});
      const result=await h.api.signUpUser({...data,authProvider:"email"});
      assert.equal(result.uid,h.user.uid);assert(h.calls.includes("signin"));assert(h.calls.includes("transaction"));assert.equal(h.profile().uid,h.user.uid);
    });
    await check("legacy verified Google profile schema matches main, flag="+enabled,async()=>{
      const options={providers:["google.com"]};const before=harness(baseline,enabled,options),after=harness(current,enabled,options);
      await before.api.signUpUser({...data,authProvider:"google"});await after.api.signUpUser({...data,authProvider:"google"});assert.deepEqual(after.profile(),before.profile());
    });
    for(const role of ["resident","volunteer","admin","superadmin","lgu_personnel"]) {
      await check("existing "+role+" login unchanged, flag="+enabled,async()=>{
        const options={existing:{role,status:"approved",residentAccess:true}};
        const before=harness(baseline,enabled,options),after=harness(current,enabled,options);
        await before.api.loginUser(data.email,data.password);await after.api.loginUser(data.email,data.password);
        assert.deepEqual(after.calls,before.calls);assert.deepEqual(after.profile(),before.profile());
      });
    }
  }
  await check("disabled verified signup cannot write or create Auth users",async()=>{
    const h=harness(current,false);await assert.rejects(h.api.signUpUser({...data,authProvider:"verified_email"}),/not enabled/);assert.deepEqual(h.calls,[]);
  });
  for(const options of [{verified:false},{noUser:true},{providers:["google.com"]},{existing:{role:"admin",status:"approved"}},{raceExisting:true}]) {
    await check("verified signup fails closed: "+JSON.stringify(options),async()=>{
      const h=harness(current,true,options);await assert.rejects(h.api.signUpUser({...data,authProvider:"verified_email"}));assert(!h.calls.includes("create"));assert(!h.calls.includes("commit"));assert.deepEqual(h.profile(),options.existing||null);
    });
  }
  await check("verified signup requires matching authenticated email",async()=>{
    const h=harness(current,true);await assert.rejects(h.api.signUpUser({...data,email:"other@example.com",authProvider:"verified_email"}),/does not match/);assert.equal(h.profile(),null);
  });
  await check("verified signup atomically creates production Basic Resident schema on the same UID",async()=>{
    const h=harness(current,true);await h.api.signUpUser({...data,password:"",authProvider:"verified_email"});
    const old=harness(baseline,false,{providers:["google.com"]});await old.api.signUpUser({...data,authProvider:"google"});
    assert.deepEqual(h.profile(),old.profile());assert(h.calls.includes("transaction"));assert(!h.calls.includes("create"));assert(!h.calls.includes("signout"));
    assert.equal(h.profile().role,"resident");assert.equal(h.profile().volunteerAccess,false);assert.equal(h.profile().identityVerified,false);
  });
  for(const options of [{existing:{role:"resident"}},{providers:["google.com","password"]},{verified:false}]) {
    await check("Google password linking refuses existing or unverified credentials: "+JSON.stringify(options),async()=>{
      const h=harness(current,true,{providers:["google.com"],...options});await assert.rejects(h.link.linkEmailFirstGooglePassword("Password1!"));assert(!h.calls.includes("link"));
    });
  }
  await check("Google linking is opt-in, same UID, verified and refreshes token",async()=>{
    const off=harness(current,false,{providers:["google.com"]});await assert.rejects(off.link.linkEmailFirstGooglePassword("Password1!"),/not enabled/);assert.deepEqual(off.calls,[]);
    const h=harness(current,true,{providers:["google.com"]});assert.equal((await h.link.linkEmailFirstGooglePassword("Password1!")).uid,h.user.uid);assert(h.calls.includes("link"));assert(h.calls.includes("token"));
  });
  await check("Google same-email SDK collision falls back on same UID without resetting an existing password",async()=>{
    const h=harness(current,true,{providers:["google.com"],sdkLinkError:"auth/email-already-in-use"});
    assert.equal((await h.link.linkEmailFirstGooglePassword("Password1!")).uid,h.user.uid);
    assert(h.calls.includes("first-password"));assert(h.calls.includes("signin"));assert(h.calls.includes("token"));
    const blocked=harness(current,true,{providers:["google.com"],sdkLinkError:"auth/network-request-failed"});
    await assert.rejects(blocked.link.linkEmailFirstGooglePassword("Password1!"));assert(!blocked.calls.includes("first-password"));
  });
  await check("duplicate email never resumes without the original password",async()=>{
    const h=harness(current,false,{createError:"auth/email-already-in-use",signInError:"auth/invalid-credential"});
    await assert.rejects(h.api.signUpUser({...data,authProvider:"email"}));assert.equal(h.profile(),null);assert(!h.calls.includes("transaction"));assert(!h.calls.includes("first-password"));
  });
  await check("legacy existing profile is never overwritten by resubmission",async()=>{
    const original={role:"volunteer",status:"approved",fullName:"Keep Existing"};
    const h=harness(current,false,{existing:original,createError:"auth/email-already-in-use"});
    await assert.rejects(h.api.signUpUser({...data,authProvider:"email"}),/already has/);assert.deepEqual(h.profile(),original);
  });
  await check("delivery failure leaves a resumable UID without a personal profile",async()=>{
    const h=harness(current,false,{verified:false,sendError:true});await assert.rejects(h.api.signUpUser({...data,authProvider:"email"}));assert.equal(h.profile(),null);assert(h.calls.includes("signout"));
  });
  await check("unverified legacy profile can request verification without being replaced",async()=>{
    const original={role:"resident",status:"approved",fullName:"Existing Resident"};const h=harness(current,false,{verified:false,existing:original,createError:"auth/email-already-in-use"});await h.api.signUpUser({...data,authProvider:"email"});assert.deepEqual(h.profile(),original);assert(h.calls.includes("verification"));
  });
  await check("email-first Create Account rejects a registered email without auto login",async()=>{
    const h=harness(current,true,{createError:"auth/email-already-in-use",noUser:true});
    await assert.rejects(
      h.registration.authenticateEmailSignup(data.email,data.password,false,true),
      error=>error.code==="auth/email-already-in-use"
    );
    assert(h.calls.includes("create"));
    assert(!h.calls.includes("signin"));
    assert(!h.calls.includes("transaction"));
    assert.equal(h.auth.currentUser,null);
    const screen=read("components/auth/EmailFirstSignup.tsx");
    assert(screen.includes("authenticateEmailSignup(email, password, resumeMode, !resumeMode)"));
    assert(screen.includes('code === "auth/email-already-in-use") return REGISTRATION_EMAIL_CONFLICT_MESSAGE'));
  });
  await check("Resume Registration only signs in and inspects the existing UID",async()=>{
    const h=harness(current,true,{verified:false});const user=await h.registration.authenticateEmailSignup(data.email,data.password,true);const state=await h.registration.inspectSignupUser(user);assert.equal(user.uid,h.user.uid);assert.equal(state.profileExists,false);assert.equal(user.emailVerified,false);assert(!h.calls.includes("create"));assert(!h.calls.includes("transaction"));
  });
  await check("signup email syntax, typo, country domain and disposable checks",()=>{
    const generated=load(read("lib/disposableEmailDomains.generated.ts"));
    const policy=load(read("lib/registrationEmailPolicy.ts"),{"./disposableEmailDomains.generated":generated});
    for(const value of ["person@yahoo.com.ph","person@outlook.com","person@department.gov.ph","person@legitimate.co"]) assert.equal(policy.getRegistrationEmailError(value),null);
    for(const value of ["","bad@gmail..com","bad@gmail.con","bad@sub.mailinator.com","person@en2ch.co","person@en2ch.com","person@sub.en2ch.co","person@ruutukf.co","person@sub.ruutukf.co","person+tag@gmail.com","person+tag@googlemail.com"]) assert.equal(typeof policy.getRegistrationEmailError(value),"string");
    for(const [wrong,right] of Object.entries(policy.KNOWN_PROVIDER_TYPO_CORRECTIONS)) assert(policy.getRegistrationEmailError("person@"+wrong).includes(right));
  });
  await check("disposable domain rejects Firebase UID before creation and profile write",async()=>{
    const h=harness(current,true,{noUser:true});
    await assert.rejects(h.registration.authenticateEmailSignup("person@en2ch.com","Password1!",false,true),/Temporary email/);
    await assert.rejects(h.registration.authenticateEmailSignup("person@en2ch.co","Password1!",false,true),/Temporary email/);
    await assert.rejects(h.registration.authenticateEmailSignup("person@ruutukf.co","Password1!",false,true),/Temporary email/);
    await assert.rejects(h.registration.authenticateEmailSignup("person@sub.ruutukf.co","Password1!",false,true),/Temporary email/);
    assert(!h.calls.includes("create")); assert(!h.calls.includes("transaction"));
    const existing=harness(current,true);
    existing.user.email="person@en2ch.co";
    await assert.rejects(existing.registration.inspectSignupUser(existing.user),/Temporary email/);
    assert(!existing.calls.includes("transaction"));
    const verified=harness(current,true);
    await assert.rejects(verified.api.signUpUser({...data,email:"person@en2ch.com",authProvider:"verified_email"}),/Temporary email/);
    assert(!verified.calls.includes("transaction"));
  });
  await check("known temporary email Resident cannot access login; staff remains compatible",async()=>{
    const resident=harness(current,true,{existing:{role:"resident",status:"approved"}});
    resident.user.email="person@en2ch.com";
    await assert.rejects(resident.api.loginUser(resident.user.email,"Password1!"),/Temporary email/);
    assert(resident.calls.includes("signout"));
    const staff=harness(current,true,{existing:{role:"admin",status:"approved"}});
    staff.user.email="person@en2ch.com";
    await staff.api.loginUser(staff.user.email,"Password1!");
    assert(!staff.calls.includes("signout"));
  });
  await check("guest mode clears Firebase session, and resident profile Rules enforce verification + details",()=>{
    const web=read("app/login.web.tsx");
    const native=read("app/login.tsx");
    assert(web.includes('signOut(auth).then(() => router.replace("/public"))'));
    assert(native.includes('firebaseSignOut(auth).then(() => router.replace("/public"))'));
    const rules=read("firestore.rules");
    assert(rules.includes('request.auth.token.get("email_verified", false) == true'));
    assert(rules.includes('request.auth.token.get("email", "") == request.resource.data.email'));
    assert(rules.includes('request.resource.data.keys().hasAll(['));
  });
  await check("verified Auth-only UID without Step 3 and Step 4 cannot create Basic Resident",async()=>{
    for(const incomplete of [
      {firstName:""},
      {lastName:""},
      {age:0},
      {phoneNumber:"not-a-number"},
      {barangay:""},
      {barangay:"Outside SJDM"},
      {occupationCategory:""},
      {occupationSpecialization:""},
    ]) {
      const h=harness(current,true);
      await assert.rejects(
        h.api.signUpUser({...data,...incomplete,authProvider:"verified_email",password:""}),
        /Step 3|Step 4/
      );
      assert(!h.calls.includes("transaction"), "Incomplete registration must not write users/{uid}");
      assert.equal(h.profile(),null);
    }
    const unverified=harness(current,true,{verified:false});
    await assert.rejects(
      unverified.api.signUpUser({...data,authProvider:"verified_email",password:""}),
      /Verify your email/
    );
    assert(!unverified.calls.includes("transaction"));
  });
  await check("email verification alone still leaves a pending Auth UID, never a Resident profile",async()=>{
    const h=harness(current,true,{verified:false,noUser:true});
    const user=await h.registration.authenticateEmailSignup(data.email,data.password,false,true);
    assert.equal(user.uid,h.user.uid);
    assert.equal(h.profile(),null);
    assert(!h.calls.includes("transaction"));
  });
  await check("Google-only signup skips password, still requires details, and preserves same verified UID",async()=>{
    const google=harness(current,true,{providers:["google.com"]});
    await google.api.signUpUser({...data,authProvider:"google",password:""});
    assert.equal(google.profile().uid,google.user.uid);
    assert.equal(google.profile().role,"resident");
    assert(google.calls.includes("transaction"));
    assert(!google.calls.includes("create") && !google.calls.includes("link") && !google.calls.includes("first-password"));
    const missing=harness(current,true,{providers:["google.com"]});
    await assert.rejects(
      missing.api.signUpUser({...data,firstName:"",authProvider:"google",password:""}),
      /Step 3/
    );
    assert(!missing.calls.includes("transaction"));
    const unverified=harness(current,true,{providers:["google.com"],verified:false});
    await assert.rejects(
      unverified.api.signUpUser({...data,authProvider:"google",password:""}),
      /verified Google/
    );
    assert(!unverified.calls.includes("transaction"));
    const fake=harness(current,true,{providers:["password"]});
    await assert.rejects(
      fake.api.signUpUser({...data,authProvider:"google",password:""}),
      /verified Google/
    );
    assert(!fake.calls.includes("transaction"));
  });
  await check("Google onboarding shows Personal Details without forced password and keeps explicit privacy consent",()=>{
    const ui=read("components/auth/EmailFirstSignup.tsx");
    assert(ui.includes("setStep(user.emailVerified ? 3 : 2)"));
    assert(ui.includes("No extra password is needed"));
    assert(ui.includes('authProvider: googleOnlyAccount ? "google" : "verified_email"'));
    assert(ui.includes('if (!consent)'));
    assert(ui.includes('Continue with Google'));
    const stepOne = ui.slice(ui.indexOf('Step 1 — Get Started'), ui.indexOf('Step 2 — Verify Your Email'));
    assert(stepOne.includes('label="Email Address *"'));
    assert(stepOne.includes('Continue to Email Verification'));
    assert(stepOne.includes('checkButton("Continue with Google"'));
    assert(stepOne.indexOf('Continue to Email Verification') < stepOne.indexOf('checkButton("Continue with Google"'),
      "Email & Password must be primary; Google is optional and below the email form");
    assert(ui.includes('formatBirthday'));
    assert(ui.includes('autoComplete={'));
    assert(ui.includes('setFirstName(current => current ||'));
    assert(ui.includes('setLastName(current => current ||'));
  });
  await check("legacy Guest profiles never become Resident accounts or link to signup",async()=>{
    const legacy={role:"guest",status:"approved",email:data.email};
    const h=harness(current,true,{existing:legacy});
    assert.equal(h.api.isApprovedProfile(legacy),false);
    await assert.rejects(h.registration.inspectSignupUser(h.user),/Guest Preview/);
    assert(h.calls.includes("signout"));
    assert.deepEqual(h.profile(),legacy);
    assert(!h.calls.includes("transaction"));
    const ui=read("components/guest/GuestWorkspace.tsx");
    assert(ui.includes("Guest Preview · No Account"));
    const publicLayout=read("app/public/_layout.tsx");
    assert(publicLayout.includes("onAuthStateChanged(auth"));
    // Public must NOT destroy an approved Resident session during routing.
    assert(!publicLayout.includes("void signOut(auth)"));
    assert(!publicLayout.includes("await signOut(auth)"));
    assert(publicLayout.includes('router.replace("/login")'));
    // The only intentional guest sign-out remains the explicit Login action.
    assert(read("app/login.tsx").includes('firebaseSignOut(auth).then(() => router.replace("/public"))'));
  });
  await check("native Google signup owns OAuth and never bounces pending users to Login",()=>{
    assert(read("lib/useSignupGoogle.ts").includes("signInWithCredential"));
    assert(read("lib/useSignupGoogle.web.ts").includes("signInWithPopup"));
    const ui=read("components/auth/EmailFirstSignup.tsx");
    assert(ui.includes("await signInGoogle()"));assert(ui.includes("authRevision.current === revision"));
    assert(ui.includes("sendEmailVerification(user)"));assert(ui.includes('authProvider: googleOnlyAccount ? "google" : "verified_email"'));
  });
  console.log(checks+" signup production regression cases passed");
})().catch(e=>{console.error(e);process.exitCode=1;});
