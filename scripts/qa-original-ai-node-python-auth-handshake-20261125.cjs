"use strict";
/**
 * Exact production Node readiness module -> real pinned Python FastAPI
 * running the staging-only startup guard, on loopback with entirely
 * synthetic internal keys. No Firebase, Cloudinary, hosted requests,
 * real photos or resident accounts. All outbound requests are GET.
 */
const assert=require("node:assert/strict");
const {probeIdentityAiReadiness}=require("./identityAiReadiness.js");
const base="http://127.0.0.1:18766";
const endpoint=base+"/verify";
const stageKey="local-synthetic-original-ai-private-key-staging-20261125";
const wrongKey="local-synthetic-original-ai-INCORRECT-key-staging-20261125";
const permitted=new Set([base+"/health",base+"/api/internal/auth-check"]);
const visits=[];
async function guardedFetch(url,options={}){
  assert.ok(permitted.has(url),"Outbound URL outside allowlisted localhost");
  assert.equal(options.method,"GET","Private readiness must NEVER submit ID/selfie POST");
  assert.ok(!options.body,"GET must not include private media");
  const supplied=options.headers?.["X-VolunServe-Internal-Key"];
  if(supplied)assert.ok([stageKey,wrongKey].includes(supplied),
    "Only synthetic fixed test keys may be sent");
  visits.push({path:new URL(url).pathname,hasAuth:!!supplied});
  return fetch(url,{...options,redirect:"error"});
}
let passCount=0;
function pass(message){passCount++;console.log("PASS:",message);}
const opts={endpoint,fetchImpl:guardedFetch,wait:async()=>{},
  healthTimeoutsMs:[10000],authTimeoutsMs:[10000]};
async function probe(key,more={}){
  return probeIdentityAiReadiness({...opts,internalKey:key,...more});
}
async function run(){
  let before=visits.length;
  let direct=await guardedFetch(base+"/health",{method:"GET"});
  assert.equal(direct.status,200);
  let health=await direct.json();
  assert.equal(health.ok,true);
  assert.equal(health.internalAuthConfigured,true);
  assert.equal(health.verificationEngineReady,true);
  assert.equal(health.documentOcrReady,true);
  assert.equal(health.profileComparisonReady,true);
  assert.equal(health.documentPrecheckReady,true);
  assert.equal(health.livenessImplemented,false);
  assert.equal(health.idDocumentAuthenticityVerified,false);
  pass("REAL staging Python FaceMesh+Tesseract+profile readiness on localhost (no PAD or issuer authenticity)");

  before=visits.length;
  direct=await guardedFetch(base+"/api/internal/auth-check",{method:"GET"});
  assert.equal(direct.status,401);
  assert.equal(visits.length,before+1);
  pass("REAL Python private auth route rejects missing key with 401");

  direct=await guardedFetch(base+"/api/internal/auth-check",{
    method:"GET",headers:{"X-VolunServe-Internal-Key":wrongKey}
  });
  assert.equal(direct.status,401);
  pass("REAL Python private auth route rejects invalid synthetic key with 401");

  direct=await guardedFetch(base+"/api/internal/auth-check",{
    method:"GET",headers:{"X-VolunServe-Internal-Key":stageKey}
  });
  assert.equal(direct.status,200);
  assert.equal((await direct.json()).authenticated,true);
  pass("REAL Python private auth route authenticates correct synthetic staging key");

  before=visits.length;
  let result=await probe(stageKey);
  assert.equal(result.statusCode,200,JSON.stringify(result.body));
  assert.equal(result.body.ready,true);
  assert.equal(result.body.provider,"volunserve-custom-ai");
  assert.equal(result.body.livenessImplemented,false);
  assert.deepEqual(visits.slice(before).map(x=>x.path),
    ["/health","/api/internal/auth-check"]);
  assert.equal(visits.at(-1).hasAuth,true);
  pass("REAL Node readiness probe makes GET health then correct private GET handshake; readiness 200");

  before=visits.length;
  result=await probe(wrongKey);
  assert.equal(result.statusCode,503);
  assert.equal(result.body.ready,false);
  assert.equal(result.body.error,"identity_ai_auth_mismatch");
  assert.deepEqual(visits.slice(before).map(x=>x.path),
    ["/health","/api/internal/auth-check"]);
  pass("REAL Node probe fails closed on wrong private key without AI media POST");

  before=visits.length;
  result=await probe("");
  assert.equal(result.statusCode,503);
  assert.equal(result.body.error,"identity_ai_key_missing");
  assert.equal(visits.length,before);
  pass("REAL Node probe refuses missing key before any HTTP");

  before=visits.length;
  result=await probeIdentityAiReadiness({...opts,endpoint:"",internalKey:stageKey});
  assert.equal(result.statusCode,503);
  assert.equal(result.body.error,"identity_ai_not_configured");
  assert.equal(visits.length,before);
  pass("REAL Node probe refuses missing endpoint before any HTTP");

  const fakeResponse=(status,body)=>({
    status,ok:status>=200&&status<300,
    json:async()=>structuredClone(body)
  });
  const readyHealth={
    ok:true,internalAuthConfigured:true,verificationEngineReady:true,
    documentOcrReady:true,profileComparisonReady:true,documentPrecheckReady:true,
    livenessImplemented:false
  };
  async function syntheticProbe(modifier){
    const calls=[];
    const injected=async(url,options)=>{
      assert.equal(options.method,"GET");
      assert.ok(permitted.has(url));
      calls.push(new URL(url).pathname);
      return modifier(url,calls.length);
    };
    const outcome=await probeIdentityAiReadiness({...opts,internalKey:stageKey,
      fetchImpl:injected,healthTimeoutsMs:[100],authTimeoutsMs:[100]});
    return {outcome,calls};
  }
  let fake=await syntheticProbe(async()=>fakeResponse(200,{
    ...readyHealth,documentOcrReady:false
  }));
  assert.equal(fake.outcome.body.error,"identity_document_readiness_failed");
  assert.deepEqual(fake.calls,["/health"]);
  pass("Actual Node helper refuses degraded OCR health without private auth or media upload");

  fake=await syntheticProbe(async()=>fakeResponse(200,{
    ...readyHealth,profileComparisonReady:false
  }));
  assert.equal(fake.outcome.body.error,"identity_document_readiness_failed");
  assert.deepEqual(fake.calls,["/health"]);
  pass("Actual Node helper refuses degraded profile comparison readiness");

  fake=await syntheticProbe(async()=>fakeResponse(200,{
    ...readyHealth,documentPrecheckReady:false
  }));
  assert.equal(fake.outcome.body.error,"identity_document_readiness_failed");
  assert.deepEqual(fake.calls,["/health"]);
  pass("Actual Node helper refuses degraded document precheck readiness");

  fake=await syntheticProbe(async()=>fakeResponse(200,{
    ...readyHealth,internalAuthConfigured:false
  }));
  assert.equal(fake.outcome.body.error,"identity_ai_key_missing_on_ai");
  assert.deepEqual(fake.calls,["/health"]);
  pass("Actual Node helper fails closed when Python reports no private auth configuration");

  fake=await syntheticProbe(async(url)=>url.endsWith("/health")
    ?fakeResponse(200,readyHealth):fakeResponse(404,{}));
  assert.equal(fake.outcome.body.error,"identity_ai_auth_check_missing");
  assert.deepEqual(fake.calls,["/health","/api/internal/auth-check"]);
  pass("Actual Node helper blocks Python instances missing internal auth-check route");

  let sequence=0;
  const retries=[];
  result=await probeIdentityAiReadiness({...opts,internalKey:stageKey,
    healthTimeoutsMs:[100,100],authTimeoutsMs:[100],
    wait:async ms=>{assert.equal(ms,1200);},
    fetchImpl:async(url,options)=>{
      assert.ok(permitted.has(url));
      assert.equal(options.method,"GET");
      retries.push(new URL(url).pathname);
      if(url.endsWith("/health")&&sequence++===0)
        return fakeResponse(503,{ok:false});
      return fakeResponse(200,url.endsWith("/health")
        ?readyHealth:{ok:true,authenticated:true});
    }});
  assert.equal(result.statusCode,200);
  assert.deepEqual(retries,["/health","/health","/api/internal/auth-check"]);
  pass("Actual Node helper retries idempotent GET health only, never verification POST");

  assert.ok(visits.every(x=>permitted.has(base+x.path)));
  assert.equal(visits.filter(x=>x.path==="/verify").length,0);
  assert.ok(visits.length>=9);
  pass("All REAL integration network requests stayed on 127.0.0.1; zero ID media, Firebase, Cloudinary calls");

  console.log("SUCCESS:",passCount,"real local Node/Python handshake and fail-closed readiness scenarios");
}
run().catch(error=>{console.error("QA FAIL:",error.stack||error);process.exitCode=1;});
