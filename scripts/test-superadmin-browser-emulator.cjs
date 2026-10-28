"use strict";
/**
 * Browser acceptance on exported Expo web + Auth/Firestore emulators ONLY.
 * No production credentials, actual LGU applications, or sensitive images.
 * A browser screenshot is evidence of emulator rendering, NOT production QA.
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");

const projectId = "demo-volunserve";
const base = "http://127.0.0.1:19117";
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const evidenceDir = path.join(root, "evidence", "superadmin-browser");
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json", ".woff":"font/woff",
  ".woff2":"font/woff2", ".ttf":"font/ttf", ".png":"image/png", ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg", ".svg":"image/svg+xml", ".webp":"image/webp", ".ico":"image/x-icon" };
function staticServer() {
  return http.createServer((req,res) => {
    let route;
    try { route = decodeURIComponent(new URL(req.url || "/", base).pathname); }
    catch { res.writeHead(400).end(); return; }
    const safe = path.resolve(dist, "."+route);
    if (safe !== dist && !safe.startsWith(dist+path.sep)) { res.writeHead(403).end(); return; }
    const attempts = [safe, safe+".html",path.join(safe,"index.html")];
    let target;
    for (const candidate of attempts) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {target=candidate;break;}
    }
    if (!target) {res.writeHead(404).end("Missing exported route: "+route);return;}
    res.setHeader("Content-Type",mime[path.extname(target).toLowerCase()]||"application/octet-stream");
    res.setHeader("Cache-Control","no-store");
    fs.createReadStream(target).pipe(res);
  });
}
const localhostOnly = (value) => /^(127\.0\.0\.1|localhost):\d+$/.test(value || "");
if (!localhostOnly(process.env.FIRESTORE_EMULATOR_HOST) ||
    !localhostOnly(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
    process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId ||
    !process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS ||
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS !== "true") {
  throw Error("This browser suite requires localhost Firebase Auth/Firestore emulators and demo project.");
}
assert(fs.existsSync(path.join(dist,"index.html")), "Export Expo web before browser QA.");

async function seedEmulator() {
  const endpoint="http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST+
    "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-volunserve-key";
  const password = "EmulatorOnly!SafePass2026";
  const email = "superadmin-browser@example.test";
  const response = await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({email,password,returnSecureToken:true})});
  const result = await response.json();
  if (!response.ok || !result.localId) throw Error("Auth emulator could not create local test account: "+JSON.stringify(result));
  const env=await initializeTestEnvironment({projectId,firestore:{
    rules:fs.readFileSync(path.join(root,"firestore.rules"),"utf8")}});
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await db.doc("users/"+result.localId).set({
      uid:result.localId,role:"superadmin",status:"approved",email,
      fullName:"Emulator QA Super Admin",
    });
    for(let i=1;i<=6;i++) {
      const uid="browser-staff-"+i;
      await db.doc("users/"+uid).set({
        uid,role:"applicant",status:"pending_review",email:"staff-"+i+"@example.test",
        fullName:"Synthetic Staff "+i,
        lguOffice:"Emulator City Office",lguPosition:"Test applicant only",
        appointmentReference:"EMULATOR-ONLY-"+i,
        createdAt:new Date(2026,9,i),
      });
      await db.doc("users/browser-admin-"+i).set({
        uid:"browser-admin-"+i,role:"admin",status:"approved",adminStatus:"active",
        fullName:"Synthetic Admin "+i,email:"admin-"+i+"@example.test",
        barangay:"Muzon Proper",
      });
    }
  });
  return {env,email,password};
}

async function main() {
  const {env,email,password}=await seedEmulator();
  const server=staticServer();
  await new Promise((resolve,reject)=>server.once("error",reject).listen(19117,"127.0.0.1",resolve));
  let browser;
  try {
    fs.mkdirSync(evidenceDir,{recursive:true});
    browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
    const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const page=await context.newPage();
    const consoleErrors=[];
    const jsExceptions=[];
    const dialogs=[];
    page.on("pageerror",e=>jsExceptions.push(e.message));
    page.on("dialog",async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
    page.on("response",response=>{
      if (response.status()>=500 && response.url().startsWith(base)) consoleErrors.push(response.status()+" "+response.url());
    });
    await page.goto(base+"/admin-login",{waitUntil:"domcontentloaded",timeout:60000});
    await page.getByLabel("Administrative email").fill(email);
    await page.getByLabel("Administrative password").fill(password);
    await page.screenshot({path:path.join(evidenceDir,"admin-login-debug.png"),fullPage:false});
    await page.getByText("Login as Admin",{exact:true}).click();
    await page.getByText("System Overview",{exact:true}).first().waitFor({timeout:30000});
    await page.getByText("LGU Staff & Admin Accounts",{exact:true}).first().click();
    await page.getByText("LGU Staff Applications",{exact:true}).first().waitFor({timeout:25000});
    await page.getByText("Synthetic Staff 6",{exact:true}).first().waitFor({timeout:25000});
    await page.getByText("Showing 1–5 of 6 records",{exact:false}).first().waitFor({timeout:15000});
    const applicantPageOne=page.getByRole("button",{name:"Page 1 of 2"}).first();
    const pageTwo=page.getByRole("button",{name:"Page 2 of 2"}).first();
    await applicantPageOne.scrollIntoViewIfNeeded();
    const firstNumberBounds=await applicantPageOne.boundingBox();
    assert(firstNumberBounds && firstNumberBounds.width>=43 && firstNumberBounds.height>=43,
      "Numbered pagination must provide a 44px tap target");
    const activeColor=await applicantPageOne.evaluate(node=>getComputedStyle(node).backgroundColor);
    assert.equal(activeColor,"rgb(8, 122, 98)","Active page should use the approved emerald color");
    assert.equal(await applicantPageOne.getAttribute("aria-current"),"page",
      "Current page must be announced as the active page to web assistive technology");
    assert(await pageTwo.isVisible(),"The second numbered page button must be displayed");
    assert(await page.getByRole("button",{name:"Previous page"}).first().isDisabled(),
      "Previous must be disabled on page 1");
    await page.screenshot({path:path.join(evidenceDir,"pagination-desktop-page-1.png"),fullPage:false});
    await page.getByRole("button",{name:"Page 2 of 2"}).first().click();
    await page.getByText("Synthetic Staff 1",{exact:true}).first().waitFor({timeout:15000});
    await page.getByText("Showing 6–6 of 6 records",{exact:false}).first().waitFor({timeout:15000});
    assert.equal(await page.getByRole("button",{name:"Page 2 of 2"}).first().getAttribute("aria-current"),"page");
    assert(await page.getByRole("button",{name:"Next page"}).first().isDisabled(),
      "Next must be disabled on final page");
    await page.getByRole("button",{name:"Page 2 of 2"}).first().scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(evidenceDir,"pagination-desktop-page-2.png"),fullPage:false});

    // Separately verify the second list: approved LGU Admin accounts.
    await page.getByText("Existing LGU Admin Accounts",{exact:true}).first().scrollIntoViewIfNeeded();
    await page.getByText("Synthetic Admin 1",{exact:true}).first().waitFor({timeout:15000});
    await page.getByRole("button",{name:"Page 2 of 2"}).nth(1).click();
    await page.getByText("Synthetic Admin 6",{exact:true}).first().waitFor({timeout:15000});
    await page.getByRole("button",{name:"Page 2 of 2"}).nth(1).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(evidenceDir,"pagination-admin-accounts.png"),fullPage:false});
    await page.screenshot({path:path.join(evidenceDir,"desktop.png"),fullPage:true});
    await page.getByRole("textbox",{name:"Search pending LGU staff applications"})
      .fill("Synthetic Staff 3");
    await page.getByText("Synthetic Staff 3",{exact:true}).first().waitFor({timeout:15000});
    await page.getByText("Showing 1–1 of 1 records",{exact:false}).first().waitFor({timeout:15000});
    assert(await page.getByRole("button",{name:"Page 1 of 1"}).first().isVisible(),
      "Pagination must remain visible even for one matching search result");
    await page.getByRole("button",{name:/Review LGU credentials for Synthetic Staff 3/}).click();
    await page.getByText("Independent staff authorization",{exact:true}).waitFor({timeout:20000});
    await page.waitForTimeout(450); // Capture the settled review modal, not the fade transition.
    const promote=page.getByRole("button",{name:"Promote Verified Staff"});
    assert.equal(await promote.isDisabled(),true,"Promotion must remain disabled before credential review");
    await page.screenshot({path:path.join(evidenceDir,"review-modal.png"),fullPage:false});
    await page.getByRole("button",{name:"Cancel staff account action"}).click();
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("textbox",{name:"Search pending LGU staff applications"}).fill("");
    await page.getByText("Showing 1–5 of 6 records",{exact:false}).first().waitFor({timeout:15000});
    const narrowNumber=page.getByRole("button",{name:"Page 1 of 2"}).first();
    await narrowNumber.scrollIntoViewIfNeeded();
    const narrowBounds=await narrowNumber.boundingBox();
    assert(narrowBounds && narrowBounds.width>=43 && narrowBounds.height>=43,
      "Mobile-width pagination must retain readable 44px page buttons");
    await page.screenshot({path:path.join(evidenceDir,"pagination-narrow-web.png"),fullPage:false});
    await page.waitForTimeout(450);
    const overflow=await page.evaluate(()=>({
      scroll:document.documentElement.scrollWidth,
      client:document.documentElement.clientWidth,
    }));
    assert(overflow.scroll <= overflow.client+2,
      "Narrow web layout has horizontal overflow: "+JSON.stringify(overflow));
    await page.screenshot({path:path.join(evidenceDir,"narrow-web.png"),fullPage:true});
    assert.equal(dialogs.length,0,"Native alert/confirm/prompt dialog must not display.");
    assert.equal(jsExceptions.length,0,"Browser JS errors: "+jsExceptions.join("; "));
    assert.equal(consoleErrors.length,0,"Export server errors: "+consoleErrors.join("; "));
    console.log("PASS browser: emulator-only Super Admin Login, verified emerald numbered pagination on two lists and mobile viewport, paging/search, guarded staff review modal, no native dialogs");
    await context.close();
  } finally {
    if(browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
    await env.cleanup();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
