import test from "node:test";
import assert from "node:assert/strict";
import {evaluateLighting,assessFaceBoxes,frameDifference,assessDocumentFrame} from "./camera-metrics.mjs";
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

function documentPixels(w=120,h=90,rect=null) {
 const pixels=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
   const i=(y*w+x)*4;
   const inside=rect&&x>=rect.x1&&x<=rect.x2&&y>=rect.y1&&y<=rect.y2;
   pixels[i]=pixels[i+1]=pixels[i+2]=inside?208:90;
   pixels[i+3]=255;
 }
 return pixels;
}
test("automatic ID framing finds a centered high-contrast document-shaped rectangle",()=>{
 const result=assessDocumentFrame(documentPixels(120,90,{x1:20,x2:100,y1:20,y2:70}),120,90);
 assert.equal(result.acceptable,true,JSON.stringify(result));
});
test("plain background must not auto-capture an ID",()=>{
 const result=assessDocumentFrame(documentPixels(120,90),120,90);
 assert.equal(result.acceptable,false);
});
test("too-small card does not trigger automatic ID capture",()=>{
 const result=assessDocumentFrame(documentPixels(120,90,{x1:42,x2:78,y1:34,y2:57}),120,90);
 assert.equal(result.acceptable,false);
});
test("a strongly off-center rectangle does not auto-capture",()=>{
 const result=assessDocumentFrame(documentPixels(120,90,{x1:9,x2:82,y1:20,y2:65}),120,90);
 assert.equal(result.acceptable,false);
});
test("invalid camera frame fails closed",()=>{
 assert.equal(assessDocumentFrame(null,120,90).acceptable,false);
 assert.equal(assessDocumentFrame(new Uint8ClampedArray(10),120,90).acceptable,false);
});
