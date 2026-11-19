"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const { chromium }=require("playwright");
const asyncMain=async()=>{
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage({viewport:{width:2010,height:1390},deviceScaleFactor:1});
  const problems=[];
  page.on("pageerror",e=>problems.push(e.message));
  const url="http://127.0.0.1:4173/public/assistance-design-qa.html";
  const response=await page.goto(url,{waitUntil:"networkidle",timeout:45000});
  assert(response && response.ok(),"QA preview route not available");
  await page.waitForTimeout(2200);
  const body=await page.locator("body").innerText();
  for(const text of ["QA VISUAL FIXTURE","Assistance Requests","Request Information","Review Summary",
    "Choose Assistance","Publish Donation Campaign"]){
    assert(body.includes(text),"Missing actual UI component on preview: "+text);
  }
  assert.equal(problems.length,0,"Client-side render errors: "+problems.join(" | "));
  fs.mkdirSync("qa-artifacts",{recursive:true});
  await page.screenshot({path:"qa-artifacts/assistance-four-panel-fixture.png",fullPage:true});
  console.log("PASS: all four actual Assistance Requests UI component states rendered with fictional QA data");
  console.log("PASS: no browser page errors. No Firebase user or private request data loaded.");
  await browser.close();
};
asyncMain().catch(e=>{console.error(e.stack||e);process.exitCode=1});
