"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = path => fs.readFileSync(path,"utf8");
const root = source("app/_layout.tsx");
const login = source("app/login.web.tsx");
const signup = source("components/auth/EmailFirstSignup.tsx");

function check(name, callback){
  callback();
  process.stdout.write("PASS "+name+"\n");
}

check("App auth gate keeps role and email verification guards",()=>{
  for(const snippet of [
    'isApprovedProfile(profile)', 'profile?.adminStatus',
    'communityAccount && usesPassword && !authUser.emailVerified',
    'homeRouteForProfile(profile)', 'canResumeEmailFirstSignup(authUser)',
    'role === "superadmin"', 'profile.role === "admin"',
    'const profileMissing = error instanceof Error',
    'if (!profileMissing)', 'setProfileReadError("We could not check your account.',
    'if (profileReadError)', 'if (authUser && profileReadError && !publicAuthRoute)',
    'onPress={() => void retryProfileAccess()}'
  ]){
    if (snippet === 'profile?.adminStatus') continue; // Admin status also checked in Admin guard.
    assert(root.includes(snippet),"Missing protected route/error logic: "+snippet);
  }
  const transientBranch = root.slice(root.indexOf('if (!profileMissing) {'),
    root.indexOf('} else if (hasGoogleIdentity'));
  assert(!transientBranch.includes('logoutUser('),"Network errors must not cause logout");
  assert(root.includes('router.replace("/signup")'),"Registration resume must remain accessible");
});

check("Google login signs out only after confirmed denial, not profile lookup error",()=>{
  assert(login.includes('let authorizationDenied = false;'));
  assert(login.includes('authorizationDenied = true;'));
  assert(login.includes('if (authorizationDenied && selectedUid && auth.currentUser?.uid === selectedUid)'));
  const transient = login.slice(login.indexOf('catch (profileError: unknown)'),
    login.indexOf('if (String(profile.role || "").toLowerCase() === "guest")'));
  assert(!transient.includes('authorizationDenied = true'));
  assert(login.includes('profile.role === "admin" || profile.role === "superadmin"'));
  assert(login.includes('!isApprovedProfile(profile)'));
  assert(login.includes('unifiedPasswordDestination(profile)'));
  assert(login.includes('browserSessionPersistence') && login.includes('browserLocalPersistence'));
});

check("Email-first verification and account linking remain unchanged",()=>{
  for(const token of ['sendEmailVerification(user)','await reload(user);',
    'await signUpUser({','router.replace("/(tabs)")','inspectSignupUser(user)']){
    assert(signup.includes(token),"Signup security/verification missing: "+token);
  }
});

check("Verified auth-only email login resumes signup rather than forcing Login or Guest",()=>{
  const authSource=source("lib/firebaseAuth.ts");
  assert(authSource.includes("resumeIncompleteSignup?: boolean"));
  assert(authSource.includes("if (!options.resumeIncompleteSignup) await signOut(auth);"));
  assert(authSource.includes('String(profile.role || "").toLowerCase() === "guest"'));
  assert(authSource.includes('!profile || String(profile.role || "").toLowerCase() === "guest"'));
  const web=source("app/login.web.tsx");
  assert(web.includes("{ resumeIncompleteSignup: true }"));
  assert(web.includes("auth.currentUser.emailVerified"));
  assert(web.includes('router.replace("/signup")'));
  assert(!web.includes('router.replace("/public");'));
  assert(web.includes('onPress={() => router.replace("/public")}'),
    "Guest mode must require the explicit user click");
  assert(web.includes('authorizationDenied = true;'));
  const native=source("app/login.tsx");
  assert(native.includes("loginUser("));
  assert(!native.includes("resumeIncompleteSignup: true"),
    "Do not silently change native registration behavior");
});

check("Firestore session hook retains signed-in UID but blocks access on snapshot failures",()=>{
  const compiled=ts.transpileModule(source("lib/useUserSession.ts"),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  let authListener, snapshotListeners=[], timers=[], cleanup, state;
  const user={uid:"resident_test_uid"};
  const auth={currentUser:null};
  const firestore={
    doc:(_db,_collection,uid)=>({uid}),
    onSnapshot:(_ref,next,error)=>{
      const item={next,error,closed:false};
      snapshotListeners.push(item);
      return ()=>{item.closed=true;};
    },
  };
  const react={
    useState(initial){state=initial;return [state,next=>{
      state=typeof next==="function"?next(state):next;
    }];},
    useEffect(fn){cleanup=fn();},
  };
  const mockRequire=name=>{
    if(name==="react") return react;
    if(name==="firebase/firestore") return firestore;
    if(name==="./firebase") return {auth,db:{}};
    if(name==="./firebaseAuth") return {
      onAuthChange:fn=>{authListener=fn;return ()=>{authListener=null;}}
    };
    throw new Error("Unexpected module "+name);
  };
  const mod={exports:{}};
  const fakeTimer=fn=>{timers.push(fn);return timers.length;};
  new Function("module","exports","require","setTimeout","clearTimeout",compiled)(
    mod,mod.exports,mockRequire,fakeTimer,()=>{}
  );
  mod.exports.useUserSession();
  auth.currentUser=user;
  authListener(user);
  assert.equal(state.loading,true);
  snapshotListeners.at(-1).next({exists:()=>true,data:()=>({role:"resident",status:"approved"})});
  assert.equal(state.loading,false);
  assert.equal(state.profile.role,"resident");
  snapshotListeners.at(-1).error({code:"unavailable"});
  assert.equal(state.loading,true,"Do not allow stale profile access");
  assert.equal(state.profile,null);
  assert.equal(state.user.uid,user.uid,"Do not sign out on Firestore read failure");
  assert.equal(timers.length,1,"Must schedule a read retry");
  timers.shift()();
  snapshotListeners.at(-1).next({exists:()=>true,data:()=>({role:"resident",status:"approved"})});
  assert.equal(state.loading,false,"Recovery must restore valid profile");
  snapshotListeners.at(-1).next({exists:()=>false});
  assert.equal(state.loading,true,"Auth-only account cannot access a protected screen");
  assert.equal(state.user.uid,user.uid,"Auth-only account remains owned by same UID");
  auth.currentUser=null;
  authListener(null);
  assert.equal(state.loading,false);
  assert.equal(state.user,null);
  assert.equal(state.profile,null);
  cleanup();
});

console.log("Auth-session redirect and linking regression checks passed.");
