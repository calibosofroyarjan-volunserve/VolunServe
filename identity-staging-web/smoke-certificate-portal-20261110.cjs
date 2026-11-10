"use strict";
const assert = require("node:assert/strict");

const FRONT = "https://volunserve-identity-test-staging.onrender.com";
const API = "https://volunserve-backend-staging.onrender.com";
const ENDPOINT = API + "/api/admin/community-certificates/reconcile";
for (const origin of [FRONT, API]) {
  assert.equal(new URL(origin).protocol, "https:");
  assert.ok(new URL(origin).hostname.endsWith(".onrender.com"));
  assert.notEqual(new URL(origin).hostname, "volunserve.onrender.com");
}
async function request(url, init = {}) {
  let err;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.timeout(45000),
        headers: {"Cache-Control":"no-cache", ...(init.headers || {})},
      });
    } catch(e) {
      err=e;
      if(attempt<2) await new Promise(resolve=>setTimeout(resolve,5000));
    }
  }
  throw err;
}
(async()=>{
  const html = await request(FRONT + "/certificates.html");
  assert.equal(html.status, 200);
  assert.match(html.headers.get("content-type") || "", /text\/html/);
  const page = await html.text();
  assert.match(page,/Staging Community Certificate|Community Certificate Test Portal/i);
  assert.match(page,/id="loginForm"/);
  assert.match(page,/src="\.\/certificates.js"/);
  console.log("PASS 1: Staging certificate test portal serves HTML and sign-in controls");

  const src = await request(FRONT + "/certificates.js");
  assert.equal(src.status, 200);
  const js = await src.text();
  assert.match(js, /projectId:"volunserve-auth-staging"/);
  assert.match(js, /https:\/\/volunserve-backend-staging\.onrender\.com/);
  assert.doesNotMatch(js, /volunserve-3aa5b|https:\/\/volunserve\.onrender\.com/);
  console.log("PASS 2: Published browser module is isolated to staging Firebase and backend");

  const preflight = await request(ENDPOINT, {
    method: "OPTIONS",
    headers: {
      Origin: FRONT,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  assert.ok([200,204].includes(preflight.status));
  assert.equal(preflight.headers.get("access-control-allow-origin"), FRONT);
  console.log("PASS 3: Real staging certificate backend permits this exact test-site origin");

  const denied = await request(ENDPOINT,{
    method:"POST",
    headers: {Origin:FRONT,"Content-Type":"application/json"},
    body:JSON.stringify({eventId:"staging-noauth-smoke",execute:true}),
  });
  assert.equal(denied.status,401);
  const data = await denied.json();
  assert.equal(data.error,"unauthenticated");
  console.log("PASS 4: Anonymous certificate issuance denied before any Firestore write");
  console.log("PASS: live staging certificate portal smoke 4/4; no user accounts or writes");
})().catch(e=>{ console.error("FAIL staging portal smoke",e); process.exitCode=1; });
