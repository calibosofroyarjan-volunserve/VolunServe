import test from "node:test";
import assert from "node:assert/strict";
import {evaluateLighting,assessFaceBoxes,frameDifference} from "./camera-metrics.mjs";
function detection(x,y,w,h){return {boundingBox:{originX:x,originY:y,width:w,height:h}}}
test("exactly one centered face is eligible for framing guidance",()=>{
 assert.equal(assessFaceBoxes([detection(270,90,260,350)],800,600).acceptable,true);
});
test("blank face feed is rejected",()=>assert.equal(assessFaceBoxes([],800,600).acceptable,false));
test("multiple faces are not accepted",()=>assert.equal(assessFaceBoxes([detection(200,90,300,350),detection(400,90,200,350)],800,600).acceptable,false));
test("tiny face must move closer",()=>assert.equal(assessFaceBoxes([detection(370,270,40,45)],800,600).acceptable,false));
test("off center face must recenter",()=>assert.equal(assessFaceBoxes([detection(20,150,280,330)],800,600).acceptable,false));
test("invalid box is rejected safely",()=>assert.equal(assessFaceBoxes([{boundingBox:{width:NaN}}],800,600).acceptable,false));
test("difference treats identical frames as stable",()=>{
 const a=Uint8ClampedArray.from({length:128},(_,i)=>i%4===3?255:110);
 assert.equal(frameDifference(a,a),0);
 assert.equal(frameDifference(a,null),Infinity);
});
test("very dark image fails light guidance",()=>{
 const p=Uint8ClampedArray.from({length:64},(_,i)=>i%4===3?255:10);
 assert.equal(evaluateLighting(p).acceptable,false);
});
test("sufficient contrast and brightness enable framing guidance",()=>{
 const p=Uint8ClampedArray.from({length:128},(_,i)=>i%4===3?255:(i%8<4?55:200));
 assert.equal(evaluateLighting(p).acceptable,true);
});
