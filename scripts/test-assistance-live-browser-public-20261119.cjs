"use strict";
// Read-only production browser smoke. No privileged login, no form submissions.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {chromium}=require("playwright");
const origin="https://volunserve.com",revision="761c91ea5a65529c4f8086b035c91b2e476a13bd";
const results=[];
async function main(){
 fs.mkdirSync("browser-smoke-artifacts",{recursive:true});
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},locale:"en-PH",serviceWorkers:"block"});
  const page=await context.newPage();
  page.setDefaultTimeout(25000);
  const errors=[];
  page.on("pageerror",error=>errors.push(String(error.message||error).slice(0,600)));
  const marker=await context.request.get(origin+"/volunserve-release.json?browser_smoke="+Date.now(),{timeout:16000});
  assert.equal(marker.status(),200,"Expected live release marker HTTP 200");
  const body=await marker.json();
  assert.equal(body.app,"VolunServe");
  assert.equal(body.revision,revision,"Production changed since approved live revision");
  results.push("PASS: exact verified live revision "+body.revision.slice(0,12));

  await page.goto(origin+"/login",{waitUntil:"domcontentloaded",timeout:30000});
  await page.getByPlaceholder("Email address",{exact:true}).waitFor({state:"visible"});
  await page.getByPlaceholder("Password",{exact:true}).waitFor({state:"visible"});
  await page.getByText("Sign In",{exact:true}).first().waitFor({state:"visible"});
  await page.screenshot({path:"browser-smoke-artifacts/live-login-desktop.png",fullPage:true});
  results.push("PASS: live login form renders desktop, fields and Sign In button visible");

  for(const route of ["/assistance-requests","/donation-list"]){
   await page.goto(origin+route,{waitUntil:"domcontentloaded",timeout:30000});
   await page.waitForURL(url=>["/login","/admin-login"].includes(url.pathname),{timeout:25000});
   await page.getByPlaceholder("Email address",{exact:true}).waitFor({state:"visible"});
   const visibleAdmin=await page.getByText("Assistance Request Queue",{exact:true}).count();
   assert.equal(visibleAdmin,0,"Protected request content leaked to signed-out browser");
   results.push("PASS: signed-out visitor cannot open protected "+route);
  }

  await context.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:"en-PH",serviceWorkers:"block"});
  const mp=await mobile.newPage();
  mp.on("pageerror",e=>errors.push(String(e.message||e).slice(0,600)));
  await mp.goto(origin+"/login",{waitUntil:"domcontentloaded",timeout:30000});
  await mp.getByPlaceholder("Email address",{exact:true}).waitFor({state:"visible"});
  await mp.getByText("Sign In",{exact:true}).first().waitFor({state:"visible"});
  await mp.screenshot({path:"browser-smoke-artifacts/live-login-mobile.png",fullPage:true});
  results.push("PASS: live mobile-sized login renders and Sign In is visible");
  await mobile.close();
  if(errors.length)throw Error("Unhandled browser errors:\n"+errors.join("\n"));
  results.push("PASS: no uncaught JavaScript page exceptions on audited screens");
 }finally{await browser.close();}
 for(const line of results)console.log(line);
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
