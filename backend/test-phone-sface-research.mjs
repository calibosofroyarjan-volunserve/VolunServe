import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  fiveFacePoints, sfaceSimilarityMatrix, rgbTensorData, cosineResearchOnly,
  researchResult, SFACE_SHA256
} from "../public/phone-sface-research.mjs";

test("five landmarks map left/right eyes, nose, mouth in correct research order",()=>{
  const points=Array.from({length:478},()=>({x:0.5,y:0.5}));
  const set=(index,x,y)=>{points[index]={x,y};};
  set(33,.3,.35);set(133,.4,.35);set(362,.6,.35);set(263,.7,.35);
  set(1,.5,.51);set(61,.39,.7);set(291,.61,.7);
  const five=fiveFacePoints(points,600,400);
  assert(five);
  assert.equal(five.length,5);
  assert.deepEqual(five[0],[210,140]);
  assert.deepEqual(five[1],[390,140]);
  assert.deepEqual(five[2],[300,204]);
  assert.deepEqual(five[3],[234,280]);
  assert.deepEqual(five[4],[366,280]);
});

test("five-point similarity maps known target geometry to 112x112",()=>{
  const canonical=[
    [38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],
    [41.5493,92.3655],[70.7299,92.2041]
  ];
  const m=sfaceSimilarityMatrix(canonical);
  assert(m);
  assert(Math.abs(m.a-1)<1e-8);
  assert(Math.abs(m.b)<1e-8);
  assert(Math.abs(m.tx)<1e-8);
  assert(Math.abs(m.ty)<1e-8);
  assert(m.meanSquaredError<1e-8);
  const translated=canonical.map(([x,y])=>[x*2+100,y*2+50]);
  const m2=sfaceSimilarityMatrix(translated);
  assert(m2);
  assert(Math.abs(m2.a-.5)<1e-8);
  assert(Math.abs(m2.b)<1e-8);
  assert(Math.abs(m2.tx+50)<1e-8);
  assert(Math.abs(m2.ty+25)<1e-8);
});

test("degenerate/malformed/unusable landmarks fail closed, not a fake match",()=>{
  assert.equal(fiveFacePoints(null,600,400),null);
  assert.equal(fiveFacePoints([],600,400),null);
  assert.equal(sfaceSimilarityMatrix(Array(5).fill([42,42])),null);
  assert.equal(sfaceSimilarityMatrix([[0,0],[1,1]]),null);
  assert.equal(sfaceSimilarityMatrix(Array(5).fill([NaN,2])),null);
  assert.equal(sfaceSimilarityMatrix(Array(5).fill([10,20]).map((x,i)=>[10+i,20+i])),null);
});

test("RGB tensor uses raw 0-255 channel-first OpenCV SFace normalization",()=>{
  const raw=new Uint8ClampedArray(112*112*4);
  raw[0]=12;raw[1]=34;raw[2]=56;raw[3]=255;
  raw[4]=100;raw[5]=150;raw[6]=200;raw[7]=255;
  const tensor=rgbTensorData({data:raw});
  assert.equal(tensor.length,3*112*112);
  assert.equal(tensor[0],12);
  assert.equal(tensor[1],100);
  assert.equal(tensor[112*112],34);
  assert.equal(tensor[2*112*112],56);
  assert.equal(rgbTensorData({data:[1,2,3]}),null);
});

test("cosine handles valid embeddings, zero vectors, NaN/Inf and nonmatching lengths",()=>{
  assert(Math.abs(cosineResearchOnly(new Float32Array(8).fill(1),new Float32Array(8).fill(1)) - 1)<1e-12);
  assert(Math.abs(cosineResearchOnly(new Float32Array(8).fill(1),new Float32Array(8).fill(-1)) + 1)<1e-12);
  assert.equal(cosineResearchOnly(new Float32Array(8),new Float32Array(8).fill(1)),null);
  assert.equal(cosineResearchOnly(new Float32Array(8),new Float32Array(9)),null);
  const x=new Float32Array(8).fill(1);x[3]=NaN;
  assert.equal(cosineResearchOnly(x,new Float32Array(8).fill(1)),null);
});

test("every research result explicitly denies real identity / PAD decisions",()=>{
  const failed=researchResult("id_face_count_invalid");
  const scored=researchResult("numeric_score_research_only",.42);
  for(const result of [failed,scored]){
    assert.equal(result.identityDecisionUse,"none");
    assert.equal(result.independentPadValidated,false);
    assert.equal(result.independentFaceMatchValidated,false);
    assert.equal(result.antiSpoofStatus,"NOT TESTED");
    assert(!Object.hasOwn(result,"identityVerified"));
    assert(!Object.hasOwn(result,"matched"));
  }
  assert.equal(scored.status,"similarity_observed_unvalidated");
  assert.equal(scored.cosineSimilarity,.42);
  assert.equal(failed.status,"inconclusive");
  assert(!Object.hasOwn(failed,"cosineSimilarity"));
  assert.equal(SFACE_SHA256,"0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79");
});

test("only public model bytes can be fetched and validated; no photo/embedding upload",()=>{
  const source=readFileSync("public/phone-sface-research.mjs","utf8");
  const page=readFileSync("public/phone-camera-demo.html","utf8");
  assert.match(source,/fetch\(MODEL_URL, \{mode:"cors", cache:"no-store", credentials:"omit"\}\)/);
  assert.match(source,/crypto\.subtle\.digest\("SHA-256",buffer\)/);
  assert.match(source,/if \(hex!==SFACE_SHA256/);
  assert.match(source,/ORT_WASM/);
  assert.match(source,/sfaceSimilarityMatrix\(points\)/);
  assert.match(page,/SFace not run\. Anti-spoofing: NOT TESTED/);
  assert.match(page,/sfaceConsent/);
  assert.match(page,/qaFacesReady = counts\.length === 2 && counts\.every\(n => n === 1\)/);
  assert.match(page,/Run 1:1 SFace research — NOT VERIFIED/);
  for(const forbidden of ["FormData(", "XMLHttpRequest", "uploadBytes", "firebase", "localStorage", "indexedDB", "sessionStorage",
    "faceMatched", "verifyIdentity", "setVerifiedResident", "Cloudinary", "PayMongo"]){
    assert(!source.includes(forbidden),"Unexpected processing action: "+forbidden);
  }
  assert(!source.includes("fetch(idUrl"));
  assert(!source.includes("fetch(selfieUrl"));
});
