"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createQaApp, qaConfiguration } = require("./diditQaServer.cjs");

const clean = {
  RENDER_SERVICE_NAME: "volunserve-didit-qa-backend",
  VOLUNSERVE_DIDIT_QA_ISOLATED: "true",
  VOLUNSERVE_DEPLOYMENT_ENV: "staging",
  VOLUNSERVE_STAGING_STRICT: "true",
  VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID: "volunserve-didit-qa",
  DIDIT_ENVIRONMENT: "sandbox",
  DIDIT_WORKFLOW_ID: "9fd6c419-790b-45bf-be09-4892216eb155",
  DIDIT_INTEGRATION_ENABLED: "true",
  DIDIT_API_KEY: "synthetic-sandbox-test-only",
  DIDIT_WEBHOOK_SECRET: "synthetic-webhook-secret",
  DIDIT_TEST_UIDS: "test-resident-uid",
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account", project_id: "volunserve-didit-qa",
    private_key: "synthetic-not-a-real-private-key".repeat(9),
  }),
};
async function runServer(app, fn) {
  const server = await new Promise(resolve => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try { return await fn("http://127.0.0.1:" + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test("Sandbox QA requires designated isolated Firebase, service, and environment", () => {
  assert.deepEqual(qaConfiguration(clean), {ready:true, missing:[]});
  for (const change of [
    {VOLUNSERVE_DIDIT_QA_ISOLATED:""},
    {VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:"volunserve-3aa5b"},
    {RENDER_SERVICE_NAME:"VolunServe"},
    {RENDER_SERVICE_NAME:"volunserve-backend-staging"},
    {DIDIT_ENVIRONMENT:"live"},
    {DIDIT_INTEGRATION_ENABLED:"false"},
    {DIDIT_WORKFLOW_ID:"different"},
    {FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:"volunserve-full-staging"})},
    {IDENTITY_AI_SERVICE_URL:"https://volunserve-identity-ai.onrender.com"},
    {DIDIT_API_KEY:""},
  ]) {
    assert.equal(qaConfiguration({...clean,...change}).ready, false, JSON.stringify(change));
  }
});

test("Unconfigured QA gateway is alive but all verification endpoints fail closed", async () => {
  await runServer(createQaApp({...clean,DIDIT_INTEGRATION_ENABLED:"false"}), async url => {
    const health = await (await fetch(url + "/health")).json();
    assert.equal(health.ok, true);
    assert.equal(health.ready, false);
    for (const [method,route] of [
      ["GET","/api/identity/didit/sync"],
      ["POST","/api/identity/didit/start"],
      ["POST","/api/identity/didit/webhook"],
    ]) {
      const resp = await fetch(url + route,{method});
      assert.equal(resp.status,503,route);
      assert.equal((await resp.json()).error,"didit_qa_not_configured");
    }
  });
});

test("Configured QA gateway requires verified Firebase token and matching test Resident", async () => {
  let user = {uid:"test-resident-uid",email:"qa@example.test",email_verified:false};
  let profile = {
    role:"resident",status:"approved",residentAccess:true,activeMode:"resident",
    email:"qa@example.test",
  };
  const firebase = {
    auth:{verifyIdToken:async()=>user},
    db:{projectId:"volunserve-didit-qa",
      collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>profile})})})},
    FieldValue:{},
  };
  const config={...clean,DIDIT_QA_FRONTEND_ORIGIN:"https://volunserve-didit-qa-frontend.onrender.com"};
  await runServer(createQaApp(config,{firebase}), async url => {
    const start = (token="test") => fetch(url + "/api/identity/didit/start",{
      method:"POST",headers:{Authorization:"Bearer "+token},
    });
    assert.equal((await start("")).status,401);
    assert.equal((await start()).status,403,"email verification gate");
    user={...user,email_verified:true,uid:"unlisted-user"};
    assert.equal((await start()).status,403,"test UID allowlist");
    user={...user,uid:"test-resident-uid"};
    profile={...profile,email:"wrong@example.test"};
    assert.equal((await start()).status,403,"matching profile email");
    const options=await fetch(url+"/api/identity/didit/start",{
      method:"OPTIONS",headers:{Origin:"https://volunserve.com"},
    });
    assert.equal(options.headers.get("access-control-allow-origin"),null,
      "production website may not call QA through CORS");
  });
});


const { presentationReady, evaluatePresentationResult, decodeToken } =
  require("./diditPresentationRoutes.cjs");

test("Presentation gateway is opt-in, Sandbox only, and requires a test UID allowlist", () => {
  const env = {...clean, DIDIT_PRESENTATION_ENABLED:"true",
    DIDIT_PRESENTATION_ALLOWED_UIDS:"testresident12345"};
  assert.equal(presentationReady(env),true);
  for (const override of [
    {DIDIT_PRESENTATION_ENABLED:"false"},
    {DIDIT_PRESENTATION_ALLOWED_UIDS:""},
    {RENDER_SERVICE_NAME:"VolunServe"},
    {DIDIT_ENVIRONMENT:"live"},
    {DIDIT_WORKFLOW_ID:"another_workflow"},
    {VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID:"volunserve-3aa5b"},
    {DIDIT_API_KEY:""},
  ]) assert.equal(presentationReady({...env,...override}),false,JSON.stringify(override));
  const approved = {status:"Approved",id_verifications:[{status:"Approved"}],
    liveness_checks:[{status:"Approved"}],face_matches:[{status:"Approved"}]};
  assert.equal(evaluatePresentationResult(approved),"demo_approved_simulated");
  assert.equal(evaluatePresentationResult({...approved,id_verifications:[{
    status:"Approved",document_type:"ID Card",document_subtype:"School ID"}]}),
    "demo_school_id_flagged");
  assert.equal(evaluatePresentationResult({...approved,face_matches:[{status:"Declined"}]}),
    "demo_declined");
});

test("Live-site presentation session requires allowlisted signed-in account and never changes production users", async () => {
  const uid = "testresident12345";
  const config = {...clean,DIDIT_INTEGRATION_ENABLED:"false",
    DIDIT_PRESENTATION_ENABLED:"true",DIDIT_PRESENTATION_ALLOWED_UIDS:uid};
  let vendor = "";
  let calls = 0;
  const presentation = {
    verifyIdToken:async token=>({
      uid:token==="valid-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ? uid:"otherresident12345",
      aud:"volunserve-3aa5b",iss:"https://securetoken.google.com/volunserve-3aa5b",
      email_verified:true,
    }),
    startSession:async ({uid})=>{
      calls++;vendor=uid;
      return {sessionId:"sandbox_session_12345",url:"https://verify.didit.me/demo",
        workflowId:clean.DIDIT_WORKFLOW_ID,vendorData:uid};
    },
    fetchDecision:async sessionId=>({
      session_id:sessionId,vendor_data:vendor,workflow_id:clean.DIDIT_WORKFLOW_ID,
      environment:"sandbox",status:"Approved",
      id_verifications:[{status:"Approved",document_type:"ID Card",document_subtype:"National ID"}],
      face_matches:[{status:"Approved"}],liveness_checks:[{status:"Approved"}],
    }),
  };
  // Backend old QA is not configured; demo must remain completely independent.
  await runServer(createQaApp(config,{presentation}),async url=>{
    const request = (route,method,origin,token,body) => fetch(url+route,{
      method,headers:{Origin:origin,Authorization:"Bearer "+token,
        "Content-Type":"application/json"},
      ...(method==="POST"?{body:JSON.stringify(body)}:{}),
    });
    const route="/api/demo/didit/start";
    assert.equal((await request(route,"POST","https://malicious.example","valid-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",{consent:true})).status,403);
    assert.equal((await request(route,"POST","https://volunserve.com","invalid-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",{consent:true})).status,403);
    assert.equal((await request(route,"POST","https://volunserve.com","valid-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",{consent:false})).status,400);
    const approved=await request(route,"POST","https://volunserve.com","valid-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",{consent:true});
    assert.equal(approved.status,201);
    const data=await approved.json();
    assert.equal(calls,1);
    assert.equal(vendor.startsWith("demo_"),true);
    assert.equal(data.url,"https://verify.didit.me/demo");
    assert.equal(data.notice.includes("No production Resident verification"),true);
    const status=await request("/api/demo/didit/status?token="+encodeURIComponent(data.token),
      "GET","https://volunserve.com","valid-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(status.status,200);
    const body=await status.json();
    assert.equal(body.result,"demo_approved_simulated");
    assert.equal(body.residentStatusUnchanged,true);
    assert.equal(body.schoolIdActualImageNotValidated,true);
    const tampered=data.token.slice(0,-1)+(data.token.endsWith("x")?"y":"x");
    const bad=await request("/api/demo/didit/status?token="+tampered,
      "GET","https://volunserve.com","valid-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(bad.status,403);
    const old=await fetch(url+"/api/identity/didit/sync");
    assert.equal(old.status,503);
  });
});
