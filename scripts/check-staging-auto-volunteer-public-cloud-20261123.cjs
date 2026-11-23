"use strict";
/**
 * GET-only public Render cloud smoke. All URLs are fixed isolated staging,
 * no credentials, POST, authentication attempts or actual incident writes.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const HOST="https://volunserve-emergency-match-staging-free.onrender.com";
async function get(url){
  if(!url.startsWith(HOST+"/"))throw Error("Refuse non-staging endpoint");
  let err;
  for(let n=0;n<2;n++){
    try{
      const r=await fetch(url,{method:"GET",redirect:"error",
        signal:AbortSignal.timeout(80000),
        headers:{"Cache-Control":"no-store"}});
      if(r.status===502||r.status===503||r.status===504){
        err=Error("Staging backend temporarily sleeping: HTTP "+r.status);
        continue;
      }
      return {status:r.status,body:await r.text()};
    }catch(e){err=e;}
  }
  throw err;
}
test("staging backend connected to isolated Firebase and no real emergency dispatch",async()=>{
  // Render Free instances can be cold-starting: the health handler initially
  // reports 'checking' while its isolated Firestore read runs asynchronously.
  // Do not mistake a valid transient readiness state for a broken backend.
  let h=null;
  for(let n=0;n<20;n++){
    const r=await get(HOST+"/health");
    assert.equal(r.status,200);
    h=JSON.parse(r.body);
    if(h.stagingFirestoreReadStatus!=="checking")break;
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  assert.ok(h,"Health must be returned");
  assert.equal(h.service,"volunserve-emergency-matching-staging");
  assert.equal(h.stagingServiceAccountMatches,true);
  assert.equal(h.stagingFirestoreReadStatus,"verified");
  assert.equal(h.matchingEnabled,true);
  assert.equal(h.officialEmergencyDispatch,false);
});
test("live cloud Admin page shows fictional 002 AUTO invite validation",async()=>{
  const r=await get(HOST+"/staging-login");
  assert.equal(r.status,200);
  assert.match(r.body,/volunserve-volunteer-staging/);
  assert.match(r.body,/Validate 002 \+ AUTOMATICALLY invite/);
});
test("live cloud Volunteer page provides own Accept and Decline",async()=>{
  const r=await get(HOST+"/staging-volunteer");
  assert.equal(r.status,200);
  assert.match(r.body,/Accept Test Offer/);
  assert.match(r.body,/Decline Test Offer/);
  assert.match(r.body,/\/api\/staging\/volunteer\/e2e-002\/bulk-respond/);
});
for(const endpoint of [
  "/api/admin/emergency-auto/e2e-002/preflight",
  "/api/admin/emergency-auto/e2e-002/bulk-status",
  "/api/staging/volunteer/e2e-002/bulk-task",
  "/api/admin/emergency-auto/e2e-002/eligibility-summary"
]){
  test("unsigned GET cannot read protected staging data: "+endpoint,async()=>{
    const r=await get(HOST+endpoint);
    assert.equal(r.status,401);
    const json=JSON.parse(r.body);
    assert.equal(json.error,"sign_in_required");
  });
}
