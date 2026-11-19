#!/usr/bin/env node
"use strict";
/**
 * Final-defense PUBLIC HTTP smoke only.
 *
 * - GET requests to a fixed allowlist of the project's own PUBLIC endpoints
 * - No cookies, bearer token, passwords, credentials, query IDs, POST or writes
 * - No personal data, raw response bodies, headers or secrets in output
 * - No claim of authenticated login, signup completion, Android app success,
 *   Firestore Rules compliance, availability SLA or real emergency dispatch
 *
 * Run this from a trusted network-capable environment (e.g. GitHub Actions).
 * An unreachable endpoint is INDETERMINATE, NOT proof of an outage.
 */
const fs=require("node:fs");
const path=require("node:path");
const {setTimeout:pause}=require("node:timers/promises");

const MAX_BYTES=550000;
const roots={
  website:"https://volunserve.com",
  backend:"https://volunserve.onrender.com",
  staging:"https://volunserve-emergency-match-staging-free.onrender.com",
  stagingUi:"https://volunserve-auto-volunteer-ui-staging.onrender.com"
};
const targets=[
  {id:"LIVE_PUBLIC_HOME_HTTP",label:"Live public homepage",root:"website",
   path:"/",expect:"html"},
  {id:"LIVE_LOGIN_PAGE_HTTP",label:"Live login page HTTP shell",root:"website",
   path:"/login",expect:"html"},
  {id:"LIVE_SIGNUP_PAGE_HTTP",label:"Live signup page HTTP shell",root:"website",
   path:"/signup",expect:"html"},
  {id:"LIVE_BACKEND_HEALTH_HTTP",label:"Live backend health",root:"backend",
   path:"/health",expect:"prod_health"},
  {id:"LIVE_BACKEND_AUTH_GUARD_HTTP",label:"Backend identity endpoint rejects no login",
   root:"backend",path:"/api/identity/status",expect:"auth_guard"},
  {id:"STAGING_BACKEND_HEALTH_HTTP",label:"Existing isolated staging health",
   root:"staging",path:"/health",expect:"stage_health"},
  {id:"STAGING_SYNTHETIC_DEMO_HTTP",label:"Staging synthetic read-only matching demo",
   root:"staging",path:"/demo-data",expect:"synthetic"},
  {id:"STAGING_AUTH_GUARD_HTTP",label:"Staging Admin endpoint rejects no login",
   root:"staging",path:"/api/admin/emergency-auto/status",
   expect:"auth_guard"},
  {id:"STAGING_VOLUNTEER_AUTH_GUARD_HTTP",
   label:"Staging Volunteer endpoint rejects no login",
   root:"staging",path:"/api/staging/volunteer/task",
   expect:"auth_guard"},
  {id:"STAGING_WEB_HTTP",label:"Existing isolated staging web shell",
   root:"stagingUi",path:"/",expect:"html"}
];
function rejectNoSecrets(url,root){
  const u=new URL(url);
  const expected=new URL(root);
  const permittedHost=u.hostname===expected.hostname||
    (expected.hostname==="volunserve.com"&&
      u.hostname==="www.volunserve.com");
  if(u.protocol!=="https:"||!permittedHost||
    u.username||u.password||u.port||u.search||u.hash)
    throw Error("unsafe_redirect_or_unexpected_host");
  return u;
}
async function boundedText(res){
  if(!res.body)return "";
  const reader=res.body.getReader();
  const bytes=[];
  let total=0;
  try{
    while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      total+=chunk.value.length;
      if(total>MAX_BYTES)throw Error("response_exceeds_read_only_limit");
      bytes.push(Buffer.from(chunk.value));
    }
    return Buffer.concat(bytes).toString("utf8");
  }finally{
    try{await reader.cancel()}catch(_e){}
  }
}
async function getPublicUrl(start,root){
  let url=start;
  for(let redirects=0;redirects<4;redirects++){
    rejectNoSecrets(url,root);
    const res=await fetch(url,{
      method:"GET",redirect:"manual",
      signal:AbortSignal.timeout(90000),
      headers:{"Accept":"text/html,application/json;q=0.8,*/*;q=0.2",
        "User-Agent":"VolunServe-Final-Defense-ReadOnly-Smoke/1.0"}
    });
    if([301,302,303,307,308].includes(res.status)){
      const loc=res.headers.get("location");
      if(!loc)throw Error("redirect_missing_location");
      url=new URL(loc,url).toString();
      continue;
    }
    return {response:res,body:await boundedText(res)};
  }
  throw Error("redirect_limit_exceeded");
}
function verify(target,response,body){
  if(target.expect==="auth_guard"){
    return {
      passed:[401,403].includes(response.status),
      observation:[401,403].includes(response.status)?
        "Unauthenticated access rejected":
        "Protected API did not return expected 401/403"
    };
  }
  if(response.status!==200)
    return {passed:false,observation:"Unexpected HTTP response status"};
  if(target.expect==="html"){
    const good=/<html[\s>]/i.test(body)&&
      (/<head[\s>]/i.test(body)||/<body[\s>]/i.test(body));
    return {
      passed:good,
      observation:good?
        "Public HTML shell served; login/UI interactions NOT tested":
        "HTML shell marker not confirmed"
    };
  }
  let j;
  try{j=JSON.parse(body)}catch(_e){
    return {passed:false,observation:"Expected JSON body unavailable"};
  }
  if(target.expect==="prod_health"){
    const ok=j?.ok===true&&j?.service==="volunserve-backend";
    return {passed:ok,
      observation:ok?"Live backend reported healthy HTTP endpoint":
        "Production health schema mismatch"};
  }
  if(target.expect==="stage_health"){
    const ok=j?.ok===true&&
      j?.service==="volunserve-emergency-matching-staging"&&
      j?.officialEmergencyDispatch===false;
    return {passed:ok,
      observation:ok?
        "Isolated staging health reachable; official dispatch is false":
        "Staging health schema or safety flag mismatch"};
  }
  if(target.expect==="synthetic"){
    const ok=j?.mode==="synthetic"&&
      j?.doesNotSendOffers===true&&j?.wave2Configured===false;
    return {passed:ok,
      observation:ok?"Synthetic matching demo served, NO real offers":
        "Synthetic-only demo markers missing"};
  }
  return {passed:false,observation:"Unknown test"};
}
async function runOne(target){
  const base=roots[target.root];
  const start=base+target.path;
  let last;
  for(let attempt=1;attempt<=2;attempt++){
    try{
      const {response,body}=await getPublicUrl(start,base);
      const validation=verify(target,response,body);
      const status=validation.passed?"PASS":
        response.status>=500?"INDETERMINATE":"FAIL";
      if(status==="INDETERMINATE"&&attempt===1){
        await pause(3500);
        continue;
      }
      return {id:target.id,label:target.label,
        environment:target.root==="website"||target.root==="backend"?
          "PRODUCTION_PUBLIC_HTTP":"EXISTING_STAGING_PUBLIC_HTTP",
        request:"GET",status,httpStatus:response.status,
        observation:validation.observation,
        browserE2E:false,authenticatedE2E:false};
    }catch(error){
      last=String(error?.message||"request_unavailable");
      if(attempt===1)await pause(3500);
    }
  }
  return {id:target.id,label:target.label,
    environment:target.root==="website"||target.root==="backend"?
      "PRODUCTION_PUBLIC_HTTP":"EXISTING_STAGING_PUBLIC_HTTP",
    request:"GET",status:"INDETERMINATE",httpStatus:null,
    observation:"HTTP access could not be confirmed from the test runner",
    failureClass:last==="unsafe_redirect_or_unexpected_host"?
      "unsafe_redirect":"network_or_timeout",
    browserE2E:false,authenticatedE2E:false};
}
async function main(){
  // Hard-coded GET-only endpoints; no input that can modify a URL or method.
  const checks=await Promise.all(targets.map(runOne));
  const counts={
    pass:checks.filter(x=>x.status==="PASS").length,
    fail:checks.filter(x=>x.status==="FAIL").length,
    indeterminate:checks.filter(x=>x.status==="INDETERMINATE").length
  };
  const report={
    name:"VolunServe Public HTTP Defense Smoke — READ ONLY",
    generatedAt:new Date().toISOString(),
    checks,counts,
    liveFunctionalLoginVerified:false,
    signupEmailVerificationFlowVerified:false,
    fullResidentAdminVolunteerLifecycleVerified:false,
    liveCommunityEventOneMinuteCertificateVerified:false,
    liveDonationPayMongoSandboxVerified:false,
    liveAutomaticVolunteerDispatchVerified:false,
    realBrowserAndAndroidTestsPerformed:false,
    existingStagingAssignmentsModified:false,
    productionChanged:false,
    productionDeployAuthorized:false,
    verdict:counts.fail||counts.indeterminate?
      "PUBLIC_HTTP_NOT_FULLY_VERIFIED":"PUBLIC_HTTP_SMOKE_PASS_ONLY",
    caution:"HTTP GET and static SPA shell are NOT equivalent to live functional login, database writes, email verification, or emergency dispatch."
  };
  const out=path.join(process.cwd(),"defense-live-http-smoke-report.json");
  fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
  if(process.env.GITHUB_STEP_SUMMARY){
    const rows=checks.map(x=>
      "| "+x.label.replace(/\|/g,"/")+" | "+x.status+
      " | "+(x.httpStatus===null?"N/A":x.httpStatus)+
      " | "+x.observation.replace(/\|/g,"/")+" |");
    const md=[
      "## VolunServe defense public HTTP smoke (READ ONLY)",
      "",
      "This is NOT authenticated Web/Android E2E and NOT proof that live automatic dispatch works.",
      "",
      "| Endpoint | Result | HTTP | Scope |",
      "|---|---|---:|---|",...rows,
      "",
      "**Live functional acceptance:** NOT TESTED.",
      "**Cloud Firebase data/accounts:** NOT ACCESSED.",
      "**Production release:** NO-GO.",
      ""
    ].join("\n");
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
  }
  console.log(JSON.stringify({
    report:report.name,counts,verdict:report.verdict,
    checks:checks.map(x=>({id:x.id,status:x.status,
      httpStatus:x.httpStatus,observation:x.observation}))
  },null,2));
  if(counts.fail||counts.indeterminate)process.exitCode=1;
}
main().catch(_e=>{
  console.error("Public smoke unable to complete; no live functionality verified");
  process.exitCode=1;
});
