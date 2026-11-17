#!/usr/bin/env node
"use strict";
/**
 * Public staging browser smoke only. Browser does not sign in, accept/decline,
 * reissue a test or mutate Firestore. Does not exercise the PR preview panel
 * itself: that panel requires isolated staged credentials/opt-in build.
 */
const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const ORIGIN="https://volunserve-emergency-match-staging-free.onrender.com";
async function smoke(){
  assert.match(ORIGIN,/^https:\/\/volunserve-emergency-match-staging-free\.onrender\.com$/);
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    page.setDefaultTimeout(25000);
    const errors=[];
    page.on("pageerror",e=>errors.push(String(e?.message||e).slice(0,110)));
    for(const route of ["/staging-login","/staging-volunteer"]){
      const response=await page.goto(ORIGIN+route,{waitUntil:"domcontentloaded",timeout:120000});
      const httpStatus=response?.status()||0;
      console.log("Staging Chromium page response: "+route+" status="+httpStatus+
        " title="+String(await page.title()).slice(0,85));
      assert.equal(httpStatus,200,route+" must serve HTTP 200; staging may be sleeping or blocked by the host");
      const html=await page.content();
      assert.ok(!html.includes("volunserve-3aa5b"),"staging page must not target production Firebase");
      assert.ok(html.includes("volunserve-volunteer-staging"),"staging Auth project must be pinned");
      assert.match((await page.locator("h1").first().innerText()),route==="/staging-login"
        ? /Staging Admin Login Check/
        : /Volunteer Task Acceptance/);
      const email=page.locator('input[type="email"]');
      const password=page.locator('input[type="password"]');
      assert.equal(await email.count(),1,"Email input present");
      assert.equal(await password.count(),1,"Password input present");
      // We intentionally do NOT fill login, access real Firestore, or accept.
      if(route==="/staging-login"){
        assert.equal(await page.locator("#verify-test").isDisabled(),true,
          "Admin verification requires authenticated staging Admin");
      } else {
        assert.equal(await page.locator("#accept").isDisabled(),true,
          "Volunteer Accept disabled until verified staging login/offer");
        assert.equal(await page.locator("#decline").isDisabled(),true,
          "Volunteer Decline disabled until verified staging login/offer");
      }
      console.log("PASS: real Chromium loaded "+route+
        " using isolated Firebase Auth markup; auth-dependent actions disabled");
    }
    console.log("Browser errors observed (not a login validation): "+errors.length);
    console.log("PASS: anonymous staging browser smoke; no credentials supplied, no Firebase writes");
  }finally{await browser.close();}
}
smoke().catch(e=>{console.error("STAGING BROWSER SMOKE FAILED: "+e.message);process.exitCode=1});
