"use strict";
/** No webcam, network, credentials, IDs, videos, or real biometric media. */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("lib/identityCameraPreview.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length || 0, 0);
const moduleMock = {exports:{}};
vm.runInNewContext(compiled.outputText, {
  module: moduleMock, exports: moduleMock.exports, setTimeout, clearTimeout, Promise,
}, {filename:"identityCameraPreview.js"});
const {waitForCameraPreview} = moduleMock.exports;

function fixture({tracks=true, playError=false, ready=false}={}) {
  const listeners = new Map();
  const track = {readyState: tracks ? "live" : "ended"};
  const stream = {getVideoTracks:()=> tracks ? [track] : []};
  const video = {
    srcObject:null, muted:false, playsInline:false,
    readyState:ready ? 2 : 0, videoWidth:ready ? 640 : 0,
    videoHeight:ready ? 480 : 0,
    addEventListener(name,listener){
      const set=listeners.get(name)||new Set();set.add(listener);listeners.set(name,set);
    },
    removeEventListener(name,listener){listeners.get(name)?.delete(listener);},
    play(){return playError ? Promise.reject(new Error("synthetic playback denied")) : Promise.resolve();},
    emit(name){for(const cb of listeners.get(name)||[])cb();},
    listeners(){return [...listeners.values()].reduce((sum,s)=>sum+s.size,0);},
  };
  return {video,stream,track};
}

test("camera with no live track cannot be labeled ready",async()=>{
  const {video,stream}=fixture({tracks:false});
  await assert.rejects(waitForCameraPreview(video,stream,20),/no active video track/);
  assert.equal(video.srcObject,null);
});

test("camera granted but black/unpainted frames times out and cleans listeners",async()=>{
  const {video,stream}=fixture();
  await assert.rejects(waitForCameraPreview(video,stream,15),/no webcam picture appeared/);
  assert.equal(video.srcObject,stream);
  assert.equal(video.listeners(),0);
});

test("first decoded visible frame enables capture only after video dimensions are set",async()=>{
  const {video,stream}=fixture();
  const started=waitForCameraPreview(video,stream,120);
  assert.equal(video.srcObject,stream);
  assert.equal(video.muted,true);
  assert.equal(video.playsInline,true);
  video.readyState=2;
  video.videoWidth=640;video.videoHeight=0;
  video.emit("loadeddata");
  assert.ok(video.listeners()>0,"zero-height frame must NOT complete preview");
  video.videoHeight=480;
  video.emit("resize");
  await started;
  assert.equal(video.listeners(),0);
});

test("already-ready video element passes without any extra events",async()=>{
 const {video,stream}=fixture({ready:true});
 await waitForCameraPreview(video,stream,50);
 assert.equal(video.listeners(),0);
});

test("ended stream during startup fails closed",async()=>{
  const {video,stream,track}=fixture();
  const started=waitForCameraPreview(video,stream,80);
  track.readyState="ended";
  video.emit("playing");
  await assert.rejects(started,/stopped sending video/);
  assert.equal(video.listeners(),0);
});

test("browser play errors are surfaced and cannot claim preview ready",async()=>{
 const {video,stream}=fixture({playError:true});
 await assert.rejects(waitForCameraPreview(video,stream,80),/synthetic playback denied/);
 assert.equal(video.listeners(),0);
});

test("real Expo web cameras use first-frame readiness before enabling capture",()=>{
 const web=fs.readFileSync("app/identity-verification.web.tsx","utf8");
 assert.match(web,/import \{ waitForCameraPreview \}/);
 assert.match(web,/await waitForCameraPreview\(element, stream\);\s*if \(!cancelled\) setIdCameraReady\(true\);/);
 const start=web.slice(web.indexOf("const startCamera = async"),web.indexOf("const openFaceScan = async"));
 assert.match(start,/await waitForCameraPreview\(video, stream\);/);
 assert(start.indexOf("await waitForCameraPreview(video, stream);") <
        start.indexOf("setCameraActive(true);"));
 assert(start.indexOf("setCameraActive(true);") < start.indexOf("await ensureDetector();"),
        "render preview BEFORE loading MediaPipe");
 assert.doesNotMatch(start,/await video\.play\(\)/);
 assert.match(web,/!cameraActive &&\s*!selfie/);
 assert.match(web,/ref: videoRef/);
});
