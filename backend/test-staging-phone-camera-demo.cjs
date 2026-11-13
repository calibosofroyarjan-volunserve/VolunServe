"use strict";
/** Test staging phone camera demo with fictional frames and mocked browser APIs.
 * This does not collect or process real ID images, faces, credentials or accounts.
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const html=fs.readFileSync("public/phone-camera-demo.html","utf8");
const match=html.match(/<script>([\s\S]*?)<\/script>/);
assert(match,"expected one isolated inline camera script");
const script=match[1];

function browser(host="volunserve-expo-resident-full-staging.onrender.com"){
  const elements=new Map();
  const globalEvents=new Map();
  const urlRevoked=[];
  const tracks=[];
  const video={
    readyState:3,videoWidth:1920,videoHeight:1080,
    pause(){this.paused=true;},
    async play(){this.played=true;},
    srcObject:null,
  };
  function get(id){
    if(id==="video")return video;
    if(!elements.has(id)){
      elements.set(id,{
        id,checked:false,hidden:false,disabled:false,src:"",
        textContent:"",className:"",addEventListener(n,handler){this["on"+n]=handler;},
        removeAttribute(a){delete this[a];},
      });
    }
    return elements.get(id);
  }
  let created=0,requested=0;
  const doc={
    getElementById:get,
    createElement(type){
      assert.equal(type,"canvas");
      return {
        width:0,height:0,
        getContext(kind){assert.equal(kind,"2d");return {drawImage(){}};},
        toBlob(cb,type){assert.equal(type,"image/jpeg");cb({fake:true,id:++created});},
      };
    },
    addEventListener(name,cb){globalEvents.set(name,cb);},
    hidden:false,
  };
  const media={
    async getUserMedia(options){
      assert.equal(options.audio,false);
      requested++;
      const track={readyState:"live",stopped:false,stop(){this.stopped=true;this.readyState="ended";}};
      tracks.push(track);
      return {getTracks:()=>[track]};
    }
  };
  const globals={
    location:{hostname:host},
    document:doc,navigator:{mediaDevices:media},
    window:{isSecureContext:true,addEventListener(name,cb){globalEvents.set(name,cb);}},
    URL:{createObjectURL:()=> "blob:synthetic-"+created,revokeObjectURL:u=>urlRevoked.push(u)},
    console:{log(){}},
    Error,String,Boolean,Math,
  };
  vm.runInNewContext(script,globals,{timeout:1500});
  return {get,doc,video,tracks,urlRevoked,globalEvents,
    count:()=>requested,
    click:async name=>{const fn=get(name).onclick;assert.equal(typeof fn,"function",name);await fn();await new Promise(r=>setImmediate(r));},
  };
}

test("production or unrelated hostname cannot open phone camera",()=>{
  for(const host of ["volunserve.com","evil.test","volunserve-expo-resident-full-staging.onrender.com.attacker.net"]){
    const b=browser(host);
    assert.equal(b.get("blocked").hidden,false);
    assert.equal(b.get("lab").hidden,true);
    assert.equal(b.count(),0);
  }
});

test("staging requires explicit local-only consent before requesting camera",async()=>{
  const b=browser();
  assert.equal(b.get("start").disabled,true);
  await b.click("start");
  assert.equal(b.count(),0);
  b.get("consent").checked=true;
  b.get("consent").onchange();
  assert.equal(b.get("start").disabled,false);
  await b.click("start");
  assert.equal(b.count(),1);
  assert.equal(b.get("capture").disabled,false);
  assert.equal(b.video.played,true);
});

test("manual ID front/back + selfie snapshots are unverified, local-only, and camera releases",async()=>{
  const b=browser();
  b.get("consent").checked=true;b.get("consent").onchange();
  for(let i=0;i<3;i++){
    await b.click("start");
    assert.equal(b.get("capture").disabled,false);
    await b.click("capture");
    assert.match(b.get("state"+i).textContent,/captured locally — NOT VERIFIED/);
    assert.equal(b.get("preview"+i).hidden,false);
    assert.equal(b.tracks[i].stopped,true);
  }
  assert.match(b.get("title").textContent,/NOT VERIFIED/);
  assert.match(b.get("status").textContent,/No identity verification/);
  assert.equal(b.get("start").disabled,true);
  await b.click("reset");
  assert.equal(b.urlRevoked.length,3);
  for(let i=0;i<3;i++)assert.equal(b.get("preview"+i).hidden,true);
});

test("revoking consent stops camera and removes ephemeral preview references",async()=>{
  const b=browser();
  b.get("consent").checked=true;b.get("consent").onchange();
  await b.click("start");await b.click("capture");
  await b.click("start");
  b.get("consent").checked=false;b.get("consent").onchange();
  assert.equal(b.tracks[0].stopped,true);
  assert.equal(b.tracks[1].stopped,true);
  assert.equal(b.get("preview0").hidden,true);
  assert.equal(b.urlRevoked.length,1);
  assert.equal(b.get("start").disabled,true);
});

test("page hiding stops the camera and releasing page clears captured photos",async()=>{
  const b=browser();
  b.get("consent").checked=true;b.get("consent").onchange();
  await b.click("start");await b.click("capture");
  await b.click("start");
  b.doc.hidden=true;
  b.globalEvents.get("visibilitychange")();
  assert.equal(b.tracks[1].stopped,true);
  b.globalEvents.get("pagehide")();
  assert.equal(b.get("preview0").hidden,true);
});

test("SFace camera QA is separate opt-in and blocked until all three captures", async()=>{
  const b=browser();
  assert.equal(b.get("qaRun").disabled,true);
  b.get("qaConsent").checked=true;b.get("qaConsent").onchange();
  assert.equal(b.get("qaRun").disabled,true);
  b.get("consent").checked=true;b.get("consent").onchange();
  for(let i=0;i<3;i++){
    await b.click("start");await b.click("capture");
    if(i<2)assert.equal(b.get("qaRun").disabled,true);
  }
  assert.equal(b.get("qaRun").disabled,false);
  assert.match(b.get("qaResult").textContent,/NOT VERIFIED/);
  b.get("qaConsent").checked=false;b.get("qaConsent").onchange();
  assert.equal(b.get("qaRun").disabled,true);
  assert.match(b.get("qaResult").textContent,/not run/);
  await b.click("reset");
  assert.equal(b.get("qaConsent").checked,false);
  assert.equal(b.get("qaRun").disabled,true);
});

test("diagnostic only loads public model weights on explicit permission and no identity decision",()=>{
  assert.match(html,/I separately consent to LOCAL face detection/);
  assert.match(script,/if \(qaBusy \|\| step !== 3/);
  assert.match(script,/await import\(FACE_VISION\)/);
  assert.match(script,/FilesetResolver\.forVisionTasks\(FACE_WASM\)/);
  assert.match(script,/FaceDetector\.createFromOptions/);
  assert.match(script,/runningMode: "IMAGE"/);
  assert.match(script,/detector\.detect\(image\)/);
  assert.match(script,/for \(const index of \[0, 2\]\)/);
  assert.match(script,/Face presence only — NOT MATCHED, NOT VERIFIED/);
  assert.match(script,/qaGeneration\+\+/);
  assert.match(script,/detector\?\.close\(\)/);
  assert.doesNotMatch(script,/\.submit\(/);
  assert.doesNotMatch(script,/XMLHttpRequest|fetch\(|WebSocket|FormData\(/);
});

test("no account access, remote media upload, fake model verification or production dependencies",()=>{
  assert.match(html,/connect-src https:\/\/cdn\.jsdelivr\.net https:\/\/storage\.googleapis\.com/);
  assert.match(html,/No signup required/);
  assert.match(html,/No identity verification, ID OCR, face matching or liveness was performed/);
  assert.match(html,/facingMode: \{ideal: facing\}/);
  assert.match(html,/window\.isSecureContext/);
  for(const forbidden of [
    "fetch(", "XMLHttpRequest", "WebSocket", "FormData(", "firebase",
    "Authorization", "localStorage", "sessionStorage", "indexedDB",
    "uploadBytes", "matchScore", "identityVerified", "verified:true",
    "submitIdentityVerification", "grantRole(", "document.cookie",
  ])assert(!script.includes(forbidden),"Unexpected browser/network/auth path: "+forbidden);
});
