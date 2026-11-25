"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {probeIdentityAiReadiness}=require("./identityAiReadiness");
const source=fs.readFileSync(require.resolve("./server.js"),"utf8");
const goodHealth={ok:true,internalAuthConfigured:true,verificationEngineReady:true,
  documentOcrReady:false,profileComparisonReady:false,documentPrecheckReady:false,
  livenessImplemented:false};
const json=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});

test("face-only GET-only cold-start: first two 503 responses recover; no media or POST",async()=>{
  const requests=[],sleeps=[];
  const fetchImpl=async(url,opts)=>{
    requests.push({url,method:opts.method,headers:opts.headers?Object.keys(opts.headers):[]});
    assert.equal(opts.method,"GET");
    assert.ok(!opts.body,"never send any private media");
    if(url.endsWith("/health"))return requests.filter(x=>x.url.endsWith("/health")).length<=2
      ? json(503,{}) : json(200,goodHealth);
    if(url.endsWith("/api/internal/auth-check"))return json(200,{authenticated:true});
    throw Error("Unexpected endpoint");
  };
  const x=await probeIdentityAiReadiness({endpoint:"https://synthetic.example/verify",
    internalKey:"SYNTHETIC_KEY",requireDocumentReadiness:false,
    fetchImpl,wait:async(ms)=>{sleeps.push(ms)},
    healthTimeoutsMs:[25000,20000,15000,10000],
    healthRetryDelaysMs:[6000,12000,18000]});
  assert.equal(x.statusCode,200);assert.equal(x.body.ready,true);
  assert.deepEqual(sleeps,[6000,12000]);
  assert.deepEqual(requests.map(y=>y.method),["GET","GET","GET","GET"]);
  assert.ok(requests.every(y=>!y.url.includes("/verify")));
});
test("face-only healthy at first GET does not add artificial delays",async()=>{
  const seen=[],sleeps=[];
  const x=await probeIdentityAiReadiness({endpoint:"https://synthetic.example/verify",
    internalKey:"SYNTHETIC_KEY",requireDocumentReadiness:false,
    fetchImpl:async(url,opts)=>{seen.push(opts.method);
      return url.endsWith("/health")?json(200,goodHealth):json(200,{authenticated:true});
    },wait:async(ms)=>sleeps.push(ms),
    healthTimeoutsMs:[25000,20000,15000,10000],
    healthRetryDelaysMs:[6000,12000,18000]});
  assert.equal(x.statusCode,200);assert.deepEqual(seen,["GET","GET"]);assert.deepEqual(sleeps,[]);
});
test("all four health 503s fail closed after bounded retries, no auth calls",async()=>{
  const seen=[],sleeps=[];
  const x=await probeIdentityAiReadiness({endpoint:"https://synthetic.example/verify",
    internalKey:"SYNTHETIC_KEY",requireDocumentReadiness:false,
    fetchImpl:async(url,opts)=>{seen.push({url,method:opts.method});return json(503,{})},
    wait:async(ms)=>sleeps.push(ms),
    healthTimeoutsMs:[25000,20000,15000,10000],
    healthRetryDelaysMs:[6000,12000,18000]});
  assert.equal(x.statusCode,503);assert.equal(x.body.error,"identity_ai_warming_up");
  assert.deepEqual(sleeps,[6000,12000,18000]);
  assert.equal(seen.length,4);assert.ok(seen.every(y=>y.method==="GET"&&y.url.endsWith("/health")));
});
test("internal key mismatch is still hard failure without retrying private POST",async()=>{
  const requests=[];
  const x=await probeIdentityAiReadiness({endpoint:"https://synthetic.example/verify",
    internalKey:"SYNTHETIC_WRONG_KEY",requireDocumentReadiness:false,
    fetchImpl:async(url,opts)=>{requests.push({url,method:opts.method});
      return url.endsWith("/health")?json(200,goodHealth):json(401,{detail:"unauthorized"});
    },wait:async()=>{throw Error("No retries for 401");}});
  assert.equal(x.statusCode,503);assert.equal(x.body.error,"identity_ai_auth_mismatch");
  assert.equal(requests.length,2);assert.ok(requests.every(x=>x.method==="GET"));
});
test("legacy OCR preflight keeps two health checks with original 1200ms spacing",async()=>{
  const requests=[],sleeps=[];
  const x=await probeIdentityAiReadiness({endpoint:"https://synthetic.example/verify",
    internalKey:"SYNTHETIC_KEY",
    fetchImpl:async(url,opts)=>{requests.push(url);return json(503,{})},
    wait:async(ms)=>sleeps.push(ms)});
  assert.equal(x.statusCode,503);assert.deepEqual(sleeps,[1200]);assert.equal(requests.length,2);
});
test("actual live Node route enables extended health only for opted-in face-only GET",()=>{
  const start=source.indexOf('app.get("/api/identity/face-engine-health"');
  const end=source.indexOf("// Authenticated OCR-only document precheck",start);
  assert.ok(start>0&&end>start);
  const route=source.slice(start,end);
  assert.match(route,/requireDocumentReadiness: false/);
  assert.match(route,/healthTimeoutsMs: \[25000, 20000, 15000, 10000\]/);
  assert.match(route,/healthRetryDelaysMs: \[6000, 12000, 18000\]/);
  const ocrStart=source.indexOf('"/api/identity/engine-health"');
  assert.ok(ocrStart>=0);
  const legacy=source.slice(ocrStart,start);
  assert.ok(!legacy.includes("healthRetryDelaysMs"));
  assert.match(source,/signal: AbortSignal\.timeout\(options\.documentPrecheck \? 105000 : 55000\)/);
});
