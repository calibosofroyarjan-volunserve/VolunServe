"use strict";
/**
 * Read-only, anonymous smoke of the ALREADY-DEPLOYED staging services.
 * No Firebase credentials, login, mutation, POST, Accept/Decline, or
 * emergency dispatch. Fixed allowlist: two isolated Render staging hosts.
 */
const assert=require("node:assert/strict");

const BACKEND="https://volunserve-emergency-match-staging-free.onrender.com";
const UI="https://volunserve-auto-volunteer-ui-staging.onrender.com";
const STAGING_PROJECT="volunserve-volunteer-staging";
const checks=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function get(origin,pathname,{maxAttempts=5}={}){
  assert.ok([BACKEND,UI].includes(origin),"Only the two known staging origins");
  assert.match(pathname,/^\/[A-Za-z0-9/_-]*$/,"Only fixed read-only paths");
  let last;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      const response=await fetch(origin+pathname,{
        method:"GET",redirect:"error",
        headers:{"Accept":"text/html,application/json"},
        signal:AbortSignal.timeout(20000)
      });
      const body=await response.text();
      if(response.status===503||response.status===502||response.status===504){
        last=Error("staging temporarily unavailable: HTTP "+response.status);
      }else{
        return {status:response.status,body,
          type:String(response.headers.get("content-type")||"")};
      }
    }catch(e){last=e;}
    if(attempt<maxAttempts)await sleep([0,3000,6000,9000,15000][attempt]||15000);
  }
  throw Error("Unable to verify "+origin+pathname+
    " after "+maxAttempts+" bounded read-only checks: "+
    String(last?.message||"unknown").slice(0,140));
}
function passed(name){checks.push(name);console.log("PASS "+name)}
async function run(){
  const health=await get(BACKEND,"/health");
  assert.equal(health.status,200,"Staging backend health must be HTTP 200");
  assert.match(health.type,/json/);
  const h=JSON.parse(health.body);
  assert.equal(h.service,"volunserve-emergency-matching-staging");
  assert.equal(h.ok,true);
  assert.equal(h.officialEmergencyDispatch,false);
  assert.equal(h.stagingServiceAccountMatches,true,
    "The isolated staging identity is not verified");
  assert.equal(h.stagingFirestoreReadStatus,"verified",
    "Staging Firebase read was not verified on this instance");
  passed("Render staging backend and isolated Firebase read verified");

  for(const [route,label] of [
    ["/staging-login","fictional Admin sign-in page"],
    ["/staging-volunteer","fictional Volunteer sign-in page"]
  ]){
    const page=await get(BACKEND,route);
    assert.equal(page.status,200,label+" must serve HTTP 200");
    assert.match(page.type,/html/);
    assert.ok(page.body.includes(STAGING_PROJECT),
      "Staging login must reference only staging Firebase Auth");
    assert.ok(!page.body.includes("volunserve-3aa5b"),
      "Staging login must not link production Firebase project");
    assert.match(page.body,/<input\b/i,"Login input missing");
    passed(label+" loads without revealing a real identity");
  }

  for(const [route,label] of [
    ["/api/admin/emergency-auto/status","Admin status"],
    ["/api/admin/emergency-auto/e2e-002/bulk-status","Admin bulk status"],
    ["/api/admin/emergency-auto/e2e-002/bulk-preview","Admin preview"],
    ["/api/staging/volunteer/e2e-002/bulk-task","Volunteer offer"]
  ]){
    const r=await get(BACKEND,route);
    assert.equal(r.status,401,label+" must deny anonymous GET");
    assert.match(r.type,/json/);
    const body=JSON.parse(r.body);
    assert.equal(body.ok,false);
    assert.ok(["sign_in_required","invalid_admin_session","invalid_volunteer_session"].includes(body.error),
      label+" returned unexpected anonymous auth response");
    passed(label+" denies anonymous access (401)");
  }

  const ui=await get(UI,"/");
  assert.equal(ui.status,200,"Deployed staging UI must serve HTTP 200");
  assert.match(ui.type,/html/);
  assert.match(ui.body,/<html\b/i,"Staging UI did not return HTML");
  assert.match(ui.body,/<script\\b/i,"Staging UI bundle entrypoint missing");
  passed("Deployed staging Admin/Volunteer web entrypoint served");

  // Verify that this ALREADY DEPLOYED UI contains the exact fictional
  // browser bridge and isolated Firebase project. Only public same-origin
  // script assets are read: no login, POST, or project credentials.
  const assetSources=[...ui.body.matchAll(/<script\\b[^>]*\\bsrc=["']([^"']+\\.js(?:\\?[^"']*)?)["'][^>]*>/gi)]
    .map(m=>m[1]);
  assert.ok(assetSources.length>0,"Staging HTML has no JavaScript assets");
  let hasFixture=false,hasStageProject=false;
  for(const asset of assetSources.slice(0,16)){
    const target=new URL(asset,UI);
    assert.equal(target.origin,UI,"All bundle reads must stay on staging UI origin");
    assert.match(target.pathname,/^\\/[a-zA-Z0-9/_\\.-]*$/);
    assert.ok(!target.pathname.includes(".."),"Unsafe script path");
    const response=await get(UI,target.pathname,{maxAttempts:2});
    assert.equal(response.status,200,"Staging bundle asset is unavailable");
    hasFixture ||= response.body.includes("STAGING_E2E_002");
    hasStageProject ||= response.body.includes("volunserve-volunteer-staging");
  }
  assert.ok(hasFixture,"Deployed web bundle is missing fictional Volunteer 002 UI bridge");
  assert.ok(hasStageProject,"Deployed web bundle does not reference isolated staging Firebase project");
  passed("Deployed web bundle includes fictional 002 bridge and isolated staging Firebase project");

  console.log("PASS "+checks.length+" read-only staging checks.");
  console.log("No credentials, POST, Firebase writes, assignments, or deployments.");
  console.log("WARNING: Anonymous smoke does NOT verify authenticated live UI flow.");
}
run().catch(e=>{
  console.error("STAGING READ-ONLY VERIFICATION FAILED: "+String(e.message||e));
  process.exitCode=1;
});
