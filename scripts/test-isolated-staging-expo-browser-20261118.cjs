#!/usr/bin/env node
"use strict";
/**
 * Public anonymous smoke of isolated Expo staging and CORS handshake.
 * No sign-in, Firestore writes, task offers, case edits, or real tokens.
 */
const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const SITE="https://volunserve-auto-volunteer-ui-staging.onrender.com";
const API="https://volunserve-emergency-match-staging-free.onrender.com";

async function run(){
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  try{
    const page=await browser.newPage({viewport:{width:1365,height:920}});
    page.setDefaultTimeout(45000);
    const errors=[];
    page.on("pageerror",err=>errors.push(String(err.message||err).slice(0,180)));
    const loaded=await page.goto(SITE,{waitUntil:"domcontentloaded",timeout:120000});
    assert.equal(loaded?.status(),200,"Actual isolated staging Expo site must serve 200");
    await page.waitForFunction(()=>document.body&&
      document.body.innerText&&document.body.innerText.trim().length>24,
      {timeout:60000});
    const app=await page.evaluate(()=>({
      title:document.title,
      contentLength:document.body.innerText.trim().length,
      hasReactContent:!!document.querySelector("#root")?.children.length,
      url:location.href,
    }));
    assert.ok(app.hasReactContent,"Expo React UI should hydrate");
    assert.ok(app.contentLength>24,"Staging React view should have visible content");
    assert.ok(app.url.startsWith(SITE),"Staging must not redirect to production");
    console.log("PASS: anonymous Expo staging UI rendered in real Chromium; React hydrated");
    console.log("UI title: "+String(app.title).slice(0,90)+", visible characters="+app.contentLength);
    assert.deepEqual(errors,[],"Unexpected browser JavaScript errors");

    // A deliberately invalid token tests only CORS, not authorization. The
    // staging service must reject it, and should not create any assignment.
    const cors=await page.evaluate(async(url)=>{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),95000);
      try{
        const response=await fetch(url+"/api/admin/emergency-auto/status",{
          headers:{Authorization:"Bearer invalid-synthetic-smoke"},
          signal:controller.signal,
        });
        return {status:response.status,type:response.type};
      }finally{clearTimeout(timer);}
    },API);
    assert.ok([401,403].includes(cors.status),
      "Missing/invalid Admin authentication must be denied");
    assert.equal(cors.type,"cors","Review UI origin should pass exact CORS allowlist");
    console.log("PASS: isolated staging API CORS available, deliberately invalid Admin token rejected with "+cors.status);
    console.log("PASS: no credentials supplied; no automatic offers or production requests");
  }finally{await browser.close();}
}
run().catch(err=>{console.error("STAGING SMOKE FAILED: "+err.message);process.exitCode=1;});
