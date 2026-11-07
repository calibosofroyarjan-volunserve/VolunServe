"use strict";
/**
 * Actual chromium visual/interaction smoke for nonproduction four-role web.
 * No login, saves, database data, or payment actions.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright-core");

const ROOT = process.env.VS_BROWSER_ORIGIN || "http://127.0.0.1:8765";
const chrome = execFileSync("bash",["-lc",
  "command -v google-chrome || command -v chromium || command -v chromium-browser"
],{encoding:"utf8"}).trim().split("\n")[0];
const cases = [
  ["resident","home","RESIDENT OPERATIONS CENTER"],
  ["resident","emergency-reports","Emergency Reports"],
  ["resident","request-assistance","Request Assistance"],
  ["resident","community-events","Community Events"],
  ["resident","donations","Donations"],
  ["volunteer","home","VOLUNTEER OPERATIONS CENTER"],
  ["volunteer","emergency-tasks","Emergency Tasks"],
  ["volunteer","community-events","Community Events"],
  ["volunteer","certificates","My Profile"],
  ["admin","command-center","Command Center"],
  ["admin","identity-reviews","Resident Identity Reviews"],
  ["admin","lgu-attendance","LGU Operations"],
  ["admin","admin-cases","Emergency Reports"],
  ["admin","assistance-requests","Assistance Requests"],
  ["admin","community-events","Community Events"],
  ["admin","community-attendance","Event Attendance"],
  ["admin","certificates","Certificates"],
  ["admin","donor-monitoring","Donation Management"],
  ["admin","create-announcement","Announcements"],
  ["superadmin","overview","System Overview"],
  ["superadmin","admin-accounts","Admin Accounts"],
  ["superadmin","admin-logs","Admin Activity & Audit Logs"],
  ["superadmin","all-records","System Records"],
  ["superadmin","system-settings","System Settings"],
];
const screens = [
  {name:"desktop",width:1440,height:900},
  {name:"phone",width:390,height:844},
  {name:"small-phone",width:320,height:720},
  {name:"tablet",width:768,height:1024},
];
function safeFile(value){return value.replace(/[^a-z0-9_-]/gi,"-");}
async function main(){
 fs.mkdirSync("reports/visual-screenshots",{recursive:true});
 const browser = await chromium.launch({executablePath:chrome,headless:true,
   args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
 let checked=0;
 try {
   for(const screen of screens) {
     const context=await browser.newContext({viewport:{width:screen.width,height:screen.height},
       reducedMotion:"reduce",deviceScaleFactor:1});
     const page=await context.newPage();
     const errors=[];
     page.on("pageerror",e=>errors.push(e.message));
     const failedResources=[];
     page.on("requestfailed",request=>failedResources.push(request.url()+" "+request.failure()?.errorText));
     page.on("response",response=>{if(response.status()>=400) failedResources.push(response.status()+" "+response.url());});

     for(const [role,module,expect] of cases){
       const url=ROOT+"/public/preview?role="+role+"&module="+module;
       let resp=null;
       for(let attempt=0;attempt<4;attempt++) {
         try {
           resp=await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
           if(resp?.status()===200) break;
         } catch(e) {
           if(attempt===3) throw e;
         }
         await new Promise(resolve=>setTimeout(resolve,2500));
       }
       assert.equal(resp?.status(),200,"Expected live preview 200: "+url);
       try {
         await page.waitForFunction((label)=>document.body.innerText.includes(label),expect,{timeout:18000});
       } catch(error) {
         const diagnostic=await page.evaluate(()=>({
           title:document.title,route:location.href,
           readyState:document.readyState,
           rootText:document.getElementById("root")?.innerText.slice(0,700)||"",
           bodyText:document.body?.innerText.slice(0,900)||"",
           scripts:[...document.scripts].slice(0,8).map(el=>el.src),
         }));
         console.error("RENDERED PREVIEW DEBUG",JSON.stringify({
           viewport:screen.name,role,module,expect,diagnostic,failedResources:failedResources.slice(-16),
           runtimeErrors:errors.slice(-12),
         }));
         throw error;
       }
       const x=await page.evaluate(()=>({
          viewport:window.innerWidth,
          htmlWidth:document.documentElement.scrollWidth,
          bodyWidth:document.body.scrollWidth,
          rootWidth:document.getElementById("root")?.scrollWidth||0,
          text:document.body.innerText.slice(0,8000),
          passwordInputs:document.querySelectorAll('input[type="password"]').length,
       }));
       assert.equal(x.passwordInputs,0,role+" preview exposed credential input");
       if(role==="resident" && module==="home")
         assert(x.text.includes("Your community, at a glance"),
           screen.name+" Resident preview is still showing old production-copy hero");
       if(role==="volunteer" && module==="home")
         assert(x.text.includes("Ready to serve your community"),
           screen.name+" Volunteer preview is still showing old production-copy hero");
       // Web layout must never create a page-wide horizontal scrollbar.
       assert(x.htmlWidth <= screen.width+4,
          screen.name+" "+role+"/"+module+" horizontal overflow "+x.htmlWidth+" vs "+screen.width);
       assert(x.bodyWidth <= screen.width+4,
          screen.name+" "+role+"/"+module+" body overflow "+x.bodyWidth+" vs "+screen.width);
       if(["admin","superadmin"].includes(role)) {
         assert(x.text.includes("Workflow and records") &&
                x.text.includes("Module actions"),"Missing actionable admin preview "+url);
       }
       if(["home","command-center","overview"].includes(module)) {
         await page.screenshot({path:"reports/visual-screenshots/"+
            safeFile(role+"-"+screen.name)+".png",fullPage:true});
       }
       checked++;
       console.log("PASS "+screen.name+" "+role+"/"+module+" no overflow, no login inputs");
     }
     if(screen.name==="desktop" || screen.name==="phone") {
       await page.goto(ROOT+"/public/preview?role=admin&module=command-center",
         {waitUntil:"domcontentloaded"});
       await page.waitForFunction(()=>document.body.innerText.includes("Workflow and records"),null,{timeout:18000});
       if(screen.name==="phone") {
          await page.getByRole("button",{name:"Open navigation"}).click();
       }
       await page.getByRole("button",{name:"Emergency Reports",exact:true}).first().click();
       await page.waitForFunction(()=>location.search.includes("module=admin-cases"),null,{timeout:13000});
       await page.getByRole("button",{name:"Preview confirmation"}).click();
       await page.getByText("Example only: no approval, publishing or database update was performed.").waitFor();
       console.log("PASS "+screen.name+" Admin nav and preview-only confirmation");
     }
     assert.equal(errors.length,0,"Browser runtime JS errors "+screen.name+": "+errors.join(" | "));
     await context.close();
   }
 } finally {await browser.close();}
 console.log("PASS "+checked+" actual Expo desktop/phone/tablet route + viewport checks");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
