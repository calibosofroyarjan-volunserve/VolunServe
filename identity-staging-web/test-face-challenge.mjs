import test from "node:test";
import assert from "node:assert/strict";
import {ACTIONS,generateChallenge,faceSignals,createChallengeState,advanceChallenge} from "./face-challenge.mjs";
test("randomized challenge uses two distinct prompts",()=>{
 const sample=generateChallenge(()=>.1);
 assert.equal(sample.length,2);
 assert.notEqual(sample[0],sample[1]);
 assert.ok(sample.every(x=>ACTIONS[x]));
});
test("blank/duplicate face cannot complete challenge",()=>{
 let s=createChallengeState(["blink","smile"],100);
 for(let i=0;i<50;i++)s=advanceChallenge(s,{oneFace:false,blink:true,smile:true},200+i*200);
 assert.equal(s.completed,false);
});
function feed(s,kind,active,time){
 const signals={oneFace:true,blink:false,smile:false,openMouth:false};
 signals[kind]=active;
 return advanceChallenge(s,signals,time);
}
test("blink twice then smile and release completes",()=>{
 let s=createChallengeState(["blink","smile"],100);
 let t=100;
 const act=(kind,active,n)=>{for(let i=0;i<n;i++){t+=240;s=feed(s,kind,active,t)}};
 act("blink",true,2);act("blink",false,2);
 assert.equal(s.step,0);
 act("blink",true,2);act("blink",false,2);
 assert.equal(s.step,1);
 act("smile",true,2);act("smile",false,2);
 assert.equal(s.completed,true);
});
test("holding one expression continuously cannot pass",()=>{
 let s=createChallengeState(["blink","smile"],100);
 for(let i=0;i<90;i++)s=feed(s,"blink",true,100+i*220);
 assert.equal(s.completed,false);
});
test("challenge expires instead of silently succeeding",()=>{
 const s=advanceChallenge(createChallengeState(["smile","blink"],100),{oneFace:true,smile:true},50101);
 assert.equal(s.expired,true);
 assert.equal(s.completed,false);
});
test("missing blendshape scores do not count as expression",()=>{
 const f=faceSignals({faceLandmarks:[[]],faceBlendshapes:[{categories:[]}]});
 assert.equal(f.oneFace,true);
 assert.equal(f.blink,false);
 assert.equal(f.smile,false);
 assert.equal(f.openMouth,false);
});
test("multiple faces cannot satisfy expression challenge",()=>{
 const f=faceSignals({faceLandmarks:[[],[]],faceBlendshapes:[{categories:[{categoryName:"eyeBlinkLeft",score:1},{categoryName:"eyeBlinkRight",score:1}]}]});
 assert.equal(f.oneFace,false);
});
test("MediaPipe blendshapes allow blink and mouth-open prompts",()=>{
 const f=faceSignals({faceLandmarks:[[]],faceBlendshapes:[{categories:[
 {categoryName:"eyeBlinkLeft",score:.91},{categoryName:"eyeBlinkRight",score:.91},{categoryName:"jawOpen",score:.81}
 ]}]});
 assert.equal(f.blink,true);assert.equal(f.openMouth,true);
});
