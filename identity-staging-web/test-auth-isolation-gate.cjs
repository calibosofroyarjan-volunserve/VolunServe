"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("identity-staging-web/index.html", "utf8");
const moduleMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(moduleMatch, "Identity auth module is missing");
const script=moduleMatch[1].replace(/^import[^\n]*;\s*$/gm, "");

function simulateCurrentLab(){
  const listeners = new Map();
  const controls = new Map();
  let networkCalls = 0;
  let firebaseInitializations = 0;
  let authCalls = 0;
  function control(id){
    if(!controls.has(id)){
      const callbacks = new Map();
      const value={
        disabled:false, textContent:"", value:"", required:false,
        classList:{toggle(){},add(){},remove(){}},
        addEventListener(event,cb){callbacks.set(event,cb)},
        listeners:callbacks,
      };
      controls.set(id,value);
    }
    return controls.get(id);
  }
  const globals={
    document:{getElementById:control},
    URL,
    documentVerdict(){throw Error("not used")},
    initializeApp(){firebaseInitializations++;throw Error("Obsolete Firebase must never initialize")},
    getAuth(){authCalls++;throw Error("Authentication must remain disabled")},
    onAuthStateChanged(){authCalls++;throw Error("Firebase auth listener must never initialize")},
    signInWithEmailAndPassword(){authCalls++;throw Error("Disabled auth sign-in was called")},
    sendPasswordResetEmail(){authCalls++;throw Error("Disabled auth reset was called")},
    signOut(){authCalls++;throw Error("Disabled auth logout was called")},
    fetch(){networkCalls++;throw Error("Disabled identity lab sent data")},
  };
  const ctx=vm.createContext(globals);
  vm.runInContext(script,ctx,{timeout:3000});
  return {ctx,control,counts:()=>({networkCalls,firebaseInitializations,authCalls})};
}

test("obsolete auth-staging config fails closed before initializing any Firebase SDK",()=>{
 const result=simulateCurrentLab();
 assert.equal(vm.runInContext("authIsolationReady",result.ctx),false);
 assert.deepEqual(result.counts(),{networkCalls:0,firebaseInitializations:0,authCalls:0});
 for(const id of ["loginBtn","resetPassword","readiness","status","precheck","submit"]){
  assert.equal(result.control(id).disabled,true, id+" should be disabled");
 }
 assert.match(result.control("diagnostic").textContent,/BLOCKED/);
 assert.match(result.control("account").textContent,/BLOCKED/);
});
test("even synthetic click/submit dispatch cannot bypass the no-upload gate",async()=>{
 const r=simulateCurrentLab();
 const send=async(id,event="click")=>{
  const callback=r.control(id).listeners.get(event);
  assert.equal(typeof callback,"function","Event listener missing "+id);
  await callback(event==="submit"?{preventDefault(){}}:undefined);
 };
 await send("login","submit");
 await send("resetPassword");
 await send("precheck");
 await send("verify","submit");
 await send("readiness");
 await send("status");
 await send("logout");
 assert.deepEqual(r.counts(),{networkCalls:0,firebaseInitializations:0,authCalls:0});
 assert.match(r.control("result").textContent,/No ID or selfie uploaded/);
});
test("local camera testing modules and visible no-upload warning remain present",()=>{
 for(const file of ["camera.js","device-qa.js","pad-qa.js","match-pad-qa.js"]){
  assert.ok(html.includes('src="./'+file+'"'),"Local camera module missing: "+file);
 }
 assert.match(html,/Identity uploads temporarily disabled/);
 assert.match(html,/volunserve-full-staging/);
 assert.doesNotMatch(html,/const authIsolationReady=true/);
});
