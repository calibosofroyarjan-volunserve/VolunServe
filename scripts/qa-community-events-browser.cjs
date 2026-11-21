"use strict";
/** Isolated mock-event browser acceptance, never production. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {chromium}=require("playwright");
const root=path.resolve("dist"),screens=path.resolve("qa-screenshots");
fs.mkdirSync(screens,{recursive:true});
const mimetypes={".html":"text/html;charset=UTF-8",".js":"application/javascript",
  ".json":"application/json",".css":"text/css",".png":"image/png",
  ".webp":"image/webp",".svg":"image/svg+xml",".woff2":"font/woff2",
  ".ttf":"font/ttf",".jpg":"image/jpeg",".ico":"image/x-icon"};
const server=http.createServer((request,response)=>{
 let pathname=new URL(request.url||"/","http://localhost").pathname;
 let rel=decodeURIComponent(pathname).replace(/^\/+/, "");
 if (!rel) rel="index.html";
 const dest=path.resolve(root,rel);
 if(!dest.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
 // Expo Router static export writes community-events.html, while client routes
 // must remain extensionless (/community-events) to match route definitions.
 const candidate=fs.existsSync(dest)&&fs.statSync(dest).isFile()?dest:
   (!path.extname(dest)&&fs.existsSync(dest+".html")?dest+".html":path.join(root,"index.html"));
 const file=candidate;
 response.setHeader("content-type",mimetypes[path.extname(file)]||"application/octet-stream");
 fs.createReadStream(file).pipe(response);
});
const fixtureRoster={ok:true,page:1,pageSize:5,total:4,totalPages:1,
  volunteers:[
    {key:"p1",name:"QA Participant One",status:"Joined"},
    {key:"p2",name:"QA Participant Two",status:"Joined"},
    {key:"p3",name:"QA Participant Three",status:"Joined"},
    {key:"p4",name:"QA Participant Four",status:"Joined"}]};
async function main(){
 await new Promise(resolve=>server.listen(4177,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true});
 const report={test:"synthetic QA community-events UI; NO real login or live data",
   viewports:[],failed:[],passed:[]};
 try{
  for (const [width,height] of [[1536,900],[1366,850],[390,844]]){
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:"block"});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",err=>errors.push(String(err).slice(0,300)));
    await page.route("**/*",route=>{
      const url=new URL(route.request().url());
      if(url.hostname==="127.0.0.1"){route.continue();return;}
      if(url.hostname==="volunserve.onrender.com"&&url.pathname.includes("/api/community-events/")&&url.pathname.endsWith("/volunteers")){
        route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(fixtureRoster)});return;
      }
      // Absolutely no live Firestore, Auth, Google or other external requests.
      route.abort();
    });
    // Navigate like a real approved volunteer. This project has overlapping
    // route-group exports; a direct anonymous deep link can resolve to Home.
    await page.goto("http://127.0.0.1:4177/",{waitUntil:"domcontentloaded",timeout:30000});
    if (width < 1040) {
      await page.getByRole("button",{name:"Open sidebar"}).click();
    }
    await page.getByText("Community Events",{exact:true}).first().waitFor({state:"visible",timeout:12000});
    await page.getByText("Community Events",{exact:true}).first().click();
    await page.waitForTimeout(2500);
    const body=await page.locator("body").innerText();
    // Always save a diagnostic before assertions, including blank or login pages.
    const diagnosticPath=path.join(screens,`diagnostic-community-events-${width}.png`);
    await page.screenshot({path:diagnosticPath,fullPage:true}).catch(()=>{});
    const debug = {url:page.url(),title:await page.title(),width,
      bodyExcerpt:body.slice(0,1600),pageErrors:errors,
      htmlExcerpt:(await page.locator("body").innerHTML()).slice(0,850)};
    console.log("QA_BROWSER_DIAGNOSTICS",JSON.stringify(debug));
    // Expo's ScrollView can retain the previous screen's scroll offset when
    // navigating from Home. Record the initial state and reset scroll position
    // for a comparable top-of-page screenshot at every viewport. The app
    // source is not modified by this QA-only screenshot normalization.
    const scrollInfo=await page.evaluate(()=>{
      const active=Array.from(document.querySelectorAll("*")).filter((el)=>el.scrollTop>1)
        .map((el)=>({tag:el.tagName,top:Math.round(el.scrollTop),
          client:el.clientHeight,total:el.scrollHeight})).slice(0,12);
      for(const el of Array.from(document.querySelectorAll("*"))) {
        if(el.scrollTop>0)el.scrollTop=0;
        if(el.scrollLeft>0)el.scrollLeft=0;
      }
      window.scrollTo(0,0);
      return active;
    });
    console.log("QA_BROWSER_SCROLL_AT_ENTRY",JSON.stringify({width,scrollInfo}));
    await page.waitForTimeout(300);
    assert(body.includes("QA MOCK PREVIEW"),"Mock preview label missing; inspect diagnostics screenshot and logs");
    assert(body.includes("Community Events"),"Community Events page not visible");
    assert(body.includes("Upcoming"),"Upcoming tab missing");
    if (width < 640) {
      const eventTitle=await page.getByText("Community Events",{exact:true}).last().boundingBox();
      const myEventsButton=await page.getByText(/My Events \\(2\\)/).last().boundingBox();
      assert(eventTitle && myEventsButton,"Missing mobile event title / shortcut");
      console.log("QA_MOBILE_TITLE_LAYOUT",JSON.stringify({
        titleWidth:eventTitle.width,titleY:eventTitle.y,
        shortcutY:myEventsButton.y,titleBottom:eventTitle.y+eventTitle.height
      }));
      assert(eventTitle.width>190,"Mobile title area too narrow; risk of splitting Community mid-word");
      assert(myEventsButton.y>=eventTitle.y+eventTitle.height-4,
        "My Events shortcut must be below mobile heading, not cramped alongside it");
    }
    if (width < 1450) {
      const eventHeading=page.getByText("VOLUNSERVE / COMMUNITY ENGAGEMENT",{exact:true}).last();
      const attendanceHeading=page.getByText("My Attendance",{exact:true}).last();
      const eventBox=await eventHeading.boundingBox();
      const attendanceBox=await attendanceHeading.boundingBox();
      assert(eventBox && attendanceBox,
        `Missing visible event header / attendance at ${width}px`);
      console.log("QA_BROWSER_STACK_ORDER",JSON.stringify({
        width,eventY:eventBox.y,attendanceY:attendanceBox.y,
        delta:attendanceBox.y-eventBox.y
      }));
      assert(eventBox.height>8 && attendanceBox.y>eventBox.y+80,
        `Collapsed/reordered event column at ${width}px — eventY=${eventBox.y}, attendanceY=${attendanceBox.y}`);
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert(overflow<=6,`Horizontal overflow at ${width}px: ${overflow}px`);
    const screenshot=path.join(screens,`community-events-${width}.png`);
    await page.screenshot({path:screenshot,fullPage:true});
    const current={width,height,overflow,pageErrors:errors,screenshot};
    report.viewports.push(current);
    assert(errors.length===0,`JS page exceptions at ${width}: ${errors.join("; ")}`);
    if(width===1536){
      assert(body.includes("Riverside Clean-up Drive"),"Synthetic upcoming events not rendered");
      assert(body.includes("Showing 1–5 of 11 events"),"Five-per-page pagination not working");
      report.passed.push("Upcoming filtered event cards and 5-per-page pagination");
      await page.getByText("Next",{exact:true}).first().click();
      await page.waitForTimeout(200);
      assert((await page.locator("body").innerText()).includes("Showing 6–10 of 11 events"),"Next pagination failed");
      report.passed.push("Next pagination");
      const ongoingTab=page.getByText(/Ongoing \(1\)/).first();
      await ongoingTab.click();
      await page.waitForTimeout(200);
      const now=await page.locator("body").innerText();
      assert(now.includes("Active Barangay Volunteer Service"),"Ongoing tab did not update");
      report.passed.push("Ongoing status tab");
      const buttons=page.getByText("View Participants");
      await buttons.first().click();
      await page.waitForTimeout(550);
      assert((await page.locator("body").innerText()).includes("QA Participant One"),"Roster modal did not show synthetic participants");
      report.passed.push("Event-specific participant modal from existing read-only component");
      // The background My Attendance rail has its own View Profile links.
      // When the participants modal is open, choose the LAST matching button
      // (inside the foreground modal) so the overlay does not intercept clicks.
      const foregroundProfileButton=page.getByText("View Profile",{exact:true}).last();
      await foregroundProfileButton.click({timeout:8000});
      await page.waitForTimeout(350);
      assert((await page.locator("body").innerText()).includes("Public participant profile preview"),"Profile preview did not open");
      await page.screenshot({path:path.join(screens,"community-events-profile-preview-1536.png"),fullPage:true});
      report.passed.push("Volunteer View Profile safe preview");
    }
    await context.close();
  }
  console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;server.close();});
