"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const html = fs.readFileSync("identity-staging-web/index.html", "utf8");
const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(match, "Identity web auth module must exist");
const script = match[1].replace(/^import[^\n]*;\s*$/gm, "");

function simulate(hostname="volunserve-identity-test-staging.onrender.com") {
  let initialized=0, authListeners=0, sentAuth=0, resetCount=0;
  const calls=[], controls=new Map();
  const auth={currentUser:null};
  let notify=()=>{};
  function control(id){
    if(!controls.has(id)){
      const callbacks=new Map();
      controls.set(id,{
        id, value:"", disabled:false, textContent:"", checked:false,
        classList:{toggle(){},add(){},remove(){}},
        addEventListener(name,fn){callbacks.set(name,fn)},
        listeners:callbacks,
      });
    }
    return controls.get(id);
  }
  const signedInUser={
    uid:"test-resident-12345",
    email:"test-resident@example.invalid",
    async getIdToken(){return "synthetic-token-not-a-real-user";}
  };
  const scope={
    URL, location:{hostname},
    document:{getElementById:control},
    initializeApp(config){initialized++; return config;},
    getAuth(app){assert.equal(app.projectId,"volunserve-full-staging");return auth;},
    onAuthStateChanged(a,callback){authListeners++;notify=callback;callback(null);},
    async signInWithEmailAndPassword(a,email,password){
      sentAuth++;
      if(!email||!password)throw Error("Test credentials missing");
      auth.currentUser=signedInUser;notify(signedInUser);
    },
    async sendPasswordResetEmail(){resetCount++;},
    async signOut(a){auth.currentUser=null;notify(null);},
    setTimeout(){throw Error("Unexpected delayed retry in synthetic test");},
    clearTimeout(){},
    fetch:async(url,options)=>{
      calls.push({url,method:options?.method||"GET",headers:options?.headers});
      if(url.endsWith("/api/identity/status")){
        return {ok:true,async json(){return {identityStatus:"basic",identityVerified:false,requiresManualReview:false};}};
      }
      if(url.endsWith("/api/identity/engine-health")){
        return {ok:true,async json(){return {ok:true,ready:true,provider:"volunserve-custom-ai",documentOcrReady:true,profileComparisonReady:true,documentPrecheckReady:true,livenessImplemented:false};}};
      }
      throw Error("Forbidden network call: unrecognized identity endpoint");
    }
  };
  const context=vm.createContext(scope);
  vm.runInContext(script,context,{timeout:5000});
  async function fire(id,event="click"){
    const listener=control(id).listeners.get(event);
    assert.equal(typeof listener,"function","Listener missing: "+id+"/"+event);
    return listener(event==="submit"?{preventDefault(){}}:{});
  }
  return {auth,control,context,fire,calls,get stats(){return {initialized,authListeners,sentAuth,resetCount}}};
}

test("Real full-staging Web App metadata is paired to exact staging origin",()=>{
  const s=simulate();
  assert.equal(vm.runInContext("authIsolationReady",s.context),true);
  assert.equal(vm.runInContext("mediaSubmissionEnabled",s.context),false);
  assert.equal(s.stats.initialized,1);
  assert.equal(s.stats.authListeners,1);
  assert.equal(s.control("loginBtn").disabled,false);
  for(const id of ["readiness","status","precheck","submit"]){
    assert.equal(s.control(id).disabled,true);
  }
  assert.ok(!html.includes("volunserve-auth-staging"));
  assert.ok(!html.includes("volunserve-3aa5b"));
});

test("Staging sign-in permits read-only health and status only, not media uploads",async()=>{
  const s=simulate();
  s.control("email").value="test-resident@example.invalid";
  s.control("password").value="synthetic-secret";
  await s.fire("login","submit");
  assert.equal(s.stats.sentAuth,1);
  assert.equal(s.control("readiness").disabled,false);
  await s.fire("readiness");
  assert.equal(s.control("precheck").disabled,true);
  assert.equal(s.control("submit").disabled,true);
  await s.fire("status");
  assert.deepEqual(s.calls.map(x=>x.url),[
    "https://volunserve-backend-staging.onrender.com/api/identity/engine-health",
    "https://volunserve-backend-staging.onrender.com/api/identity/status",
  ]);
  assert.ok(s.calls.every(x=>x.method==="GET"));
  const count=s.calls.length;
  await s.fire("precheck");
  await s.fire("verify","submit");
  assert.equal(s.calls.length,count);
  assert.match(s.control("precheckResult").textContent,/No images uploaded/);
  assert.match(s.control("result").textContent,/No ID or selfie uploaded/);
});

test("No Firebase initialization outside the designated staging camera host",async()=>{
  const s=simulate("example.com");
  assert.equal(vm.runInContext("authIsolationReady",s.context),false);
  assert.equal(s.stats.initialized,0);
  assert.equal(s.stats.authListeners,0);
  for(const id of ["loginBtn","resetPassword","readiness","status","precheck","submit"]){
    assert.equal(s.control(id).disabled,true);
  }
  await s.fire("login","submit");
  await s.fire("precheck");
  await s.fire("verify","submit");
  assert.equal(s.stats.sentAuth,0);
  assert.equal(s.calls.length,0);
});

test("Local no-upload camera testing and explicit disabled-media warning remain",()=>{
  for(const file of ["camera.js","device-qa.js","pad-qa.js","match-pad-qa.js"]){
    assert.ok(html.includes('src="./'+file+'"'));
  }
  assert.match(html,/Government ID precheck and ID\/selfie submissions remain deliberately blocked/);
  assert.match(html,/const mediaSubmissionEnabled=false/);
});
