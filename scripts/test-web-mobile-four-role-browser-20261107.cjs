"use strict";
/**
 * Real browser UI test, no sign-in or Firebase writes.
 * Requires playwright-core installed in NODE_PATH and Chrome/Chromium.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const cp=require("node:child_process");
const {chromium}=require("playwright-core");
const base="https://volunserve-4role-ui-review.onrender.com";
const chrome=cp.execFileSync("bash",["-lc","command -v google-chrome || command -v chromium || command -v chromium-browser"],{encoding:"utf8"}).trim().split("\n")[0];
const widths=[1440,1024,768,390,320];
fs.mkdirSync("reports/design-review-screenshots",{recursive:true});

(async()=>{
 const browser=await chromium.launch({executablePath:chrome,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of widths){
   const height=width<=390?844:900;
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   const failed=[];
   page.on("pageerror",e=>failed.push("JS: "+e.message));
   page.on("request",req=>{
     const url=req.url();
     if(/^https:\/\/(?:volunserve\.com|volunserve\.onrender\.com)(?:\/|$)/i.test(url))
       failed.push("Production request: "+url.slice(0,100));
   });
   try {
    let loaded=false;
    for(let retry=0;retry<6;retry++){
      try{
        const res=await page.goto(base+"/public/design-review",{waitUntil:"domcontentloaded",timeout:45000});
        if(res?.ok()){loaded=true;break;}
      }catch(e){if(retry===5)throw e;}
      await page.waitForTimeout(5000);
    }
    assert(loaded,"The isolated review site is not yet published");
    await page.getByText("Interactive visual review", {exact:false}).first().waitFor({timeout:25000});
    const size=await page.evaluate(()=>({
      width:innerWidth,root:document.documentElement.scrollWidth,body:document.body.scrollWidth,
    }));
    assert(size.root<=size.width+4&&size.body<=size.width+4,
      "Horizontal overflow at "+width+": "+JSON.stringify(size));
    for(const role of ["Resident","Volunteer","Admin","Super Admin"]){
      const label="View "+role+" design";
      await page.getByRole("button",{name:label}).click();
      await page.getByText(role.toUpperCase()+" PORTAL",{exact:false}).first().waitFor();
    }
    await page.getByRole("button",{name:"View Admin design"}).click();
    if(width<800){
      await page.getByRole("button",{name:"Open sidebar"}).click();
    }
    await page.getByRole("button",{name:"Resident Identity Reviews",exact:true}).click();
    await page.getByRole("button",{name:"Try sample action"}).click();
    await page.getByRole("button",{name:"Validate sample"}).click();
    await page.getByText("Enter at least 3 characters",{exact:false}).first().waitFor();
    await page.getByRole("textbox",{name:"Sample title"}).fill("Example Review");
    await page.getByRole("textbox",{name:"Sample message"}).fill("Valid sample content for visual review only.");
    await page.getByRole("button",{name:"Validate sample"}).click();
    await page.getByText("No real record was created.",{exact:false}).first().waitFor();
    await page.screenshot({path:path.join("reports/design-review-screenshots","volunserve-"+width+".png"),fullPage:true});
    assert(!failed.length,"Browser or production access failures at "+width+": "+failed.join("; "));
    console.log("PASS responsive review",width,"px: 4 roles, navigation, modal validation, zero horizontal overflow, no production calls");
   } finally {await page.close()}
  }
 } finally {await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
