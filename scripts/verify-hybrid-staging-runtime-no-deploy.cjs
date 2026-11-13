"use strict";
/**
 * Public, read-only post-deploy checks of the isolated VolunServe staging services.
 * No real or synthetic Firebase accounts, tokens, login attempts, ID media,
 * multipart submissions, user records, or production endpoints are used.
 * A 200 on a protected Admin endpoint is a security failure.
 */
const assert = require("node:assert/strict");

const BASE = Object.freeze({
  backend: "https://volunserve-backend-staging.onrender.com",
  ai: "https://volunserve-identity-ai-staging.onrender.com",
  web: "https://volunserve-expo-resident-full-staging.onrender.com",
});

async function request(url, attempts=3) {
  let lastError;
  for(let i=0;i<attempts;i++){
    try {
      const response = await fetch(url, {
        method:"GET", redirect:"manual",
        headers: {Accept:"application/json, text/html;q=0.9"},
        signal:AbortSignal.timeout(75000),
      });
      if([502,503,504,429].includes(response.status) && i+1<attempts){
        await response.body?.cancel().catch(()=>{});
        await new Promise(resolve=>setTimeout(resolve,1500));
        continue;
      }
      return response;
    }catch(error){
      lastError=error;
      if(i+1<attempts)await new Promise(resolve=>setTimeout(resolve,1500));
    }
  }
  throw new Error("Staging endpoint unavailable after cold-start retries: "+
    String(lastError?.name||"network_failure"));
}
async function health(name) {
  const response=await request(BASE[name]+"/health");
  assert.equal(response.status,200,name+" public health must return HTTP 200");
  const body=await response.json();
  assert.equal(body.ok,true,name+" health must report ok=true");
  assert.equal(body.service,name==="backend"?"volunserve-backend":"volunserve-identity-ai",
    name+" must be the expected isolated service");
  console.log("PASS: "+name+" isolated staging health responds 200");
}
async function forbidden(path,label){
  const response=await request(BASE.backend+path);
  assert([401,403].includes(response.status),
    label+" must reject anonymous access; got HTTP "+response.status);
  await response.body?.cancel().catch(()=>{});
  console.log("PASS: anonymous "+label+" returns HTTP "+response.status);
}
(async()=>{
  await health("backend");
  await health("ai");
  const page=await request(BASE.web+"/identity-reviews");
  assert.equal(page.status,200,"staging Admin route must be served");
  const contentType=String(page.headers.get("content-type")||"");
  assert(contentType.includes("html"),"staging web route must return HTML");
  await page.body?.cancel().catch(()=>{});
  console.log("PASS: staging Admin route HTML serves HTTP 200 (does NOT bypass app authentication)");
  await forbidden("/api/admin/identity/reviews","Admin identity queue");
  await forbidden("/api/identity/status","Resident identity status");
  await forbidden("/api/identity/engine-health","authenticated AI readiness");
  console.log("PASS: read-only post-deploy smoke; no photos, credentials, accounts or production writes used");
})().catch(error=>{
  console.error("FAIL: isolated staging post-deploy smoke: "+String(error?.message||error));
  process.exitCode=1;
});
