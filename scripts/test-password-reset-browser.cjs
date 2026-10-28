"use strict";
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const assert=require("node:assert/strict");
const {chromium,expect}=require("@playwright/test");

const root=path.resolve(__dirname,"..");
const dist=path.join(root,"dist");
const evidence=path.join(root,"evidence","password-reset-modal");
const base="http://127.0.0.1:19125";
const mime={
  ".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".json":"application/json",".woff":"font/woff",
  ".woff2":"font/woff2",".png":"image/png",".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",".svg":"image/svg+xml",".webp":"image/webp",".ico":"image/x-icon",
};
const server=http.createServer((req,res)=>{
  let url;
  try {url=decodeURIComponent(new URL(req.url||"/",base).pathname);}
  catch {res.writeHead(400).end();return;}
  const safe=path.resolve(dist,"."+url);
  if(safe!==dist&&!safe.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
  let file;
  for(const candidate of [safe,safe+".html",path.join(safe,"index.html")]){
    if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile()){file=candidate;break;}
  }
  if(!file){res.writeHead(404).end("Missing exported route "+url);return;}
  res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");
  res.setHeader("Cache-Control","no-store");
  fs.createReadStream(file).pipe(res);
});

async function main(){
  assert(fs.existsSync(path.join(dist,"index.html")),"Export Expo web before browser QA");
  fs.mkdirSync(evidence,{recursive:true});
  await new Promise((resolve,reject)=>server.once("error",reject).listen(19125,"127.0.0.1",resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    const page=await context.newPage();
    const errors=[];
    const resetCalls=[];
    page.on("pageerror",error=>errors.push(error.message));
    page.on("request",request=>{
      if(/sendOobCode|PASSWORD_RESET/.test(request.url())||/sendOobCode|PASSWORD_RESET/.test(request.postData()||""))
        resetCalls.push(request.url());
    });
    // Even if the UI regresses, never send a real reset email from CI.
    await page.route(/identitytoolkit\.googleapis\.com/,async route=>{
      if(/sendOobCode|PASSWORD_RESET/.test(route.request().url())||
         /sendOobCode|PASSWORD_RESET/.test(route.request().postData()||"")){
        resetCalls.push(route.request().url());
        await route.abort("blockedbyclient");
      }else await route.continue();
    });
    for(const route of ["/login","/admin-login"]){
      await page.goto(base+route,{waitUntil:"domcontentloaded",timeout:60000});
      const forgot=page.getByRole("button",{name:"Forgot password?"});
      await forgot.waitFor({timeout:30000});
      await forgot.click();
      await page.getByText("Reset your password",{exact:true}).waitFor({timeout:10000});
      const dialogEmail=page.getByLabel("Password reset email address");
      await dialogEmail.waitFor({timeout:10000});
      const send=page.getByRole("button",{name:"Send password reset link"});
      assert(await send.isVisible(),"Reset action must be inside modal");
      await dialogEmail.fill("not-an-email");
      await send.click();
      await page.getByText("Enter a valid email address to receive your reset link.",{exact:true})
        .waitFor({timeout:10000});
      assert.equal(resetCalls.length,0,"Invalid input must never trigger Firebase email");
      await page.screenshot({path:path.join(evidence,route.replaceAll("/","")+"-reset-validation.png"),fullPage:false});
      await page.getByRole("button",{name:"Cancel"}).click();
      await page.getByText("Reset your password",{exact:true}).waitFor({state:"hidden",timeout:10000});
      const loginField=page.getByLabel(route==="/login"
        ? "Resident or volunteer email address":"Administrative email");
      await loginField.fill("sample@example.com");
      await forgot.click();
      await page.getByText("Reset your password",{exact:true}).waitFor({timeout:10000});
      await expect(dialogEmail).toHaveValue("sample@example.com",{timeout:10000});
      await page.screenshot({path:path.join(evidence,route.replaceAll("/","")+"-reset-popup.png"),fullPage:false});
      await page.getByRole("button",{name:"Close password reset dialog"}).click();
      await page.getByText("Reset your password",{exact:true}).waitFor({state:"hidden",timeout:10000});
    }
    await page.setViewportSize({width:390,height:844});
    await page.goto(base+"/login",{waitUntil:"domcontentloaded",timeout:60000});
    await page.getByRole("button",{name:"Forgot password?"}).click();
    await page.getByText("Reset your password",{exact:true}).waitFor({timeout:15000});
    const resetModal=page.getByLabel("Password reset email address");
    const bounds=await resetModal.boundingBox();
    assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=392,
      "Email input must remain inside narrow viewport");
    await page.screenshot({path:path.join(evidence,"resident-mobile-reset-popup.png"),fullPage:false});
    assert.equal(resetCalls.length,0,"Opening and validating modal must NOT send actual reset emails");
    assert.equal(errors.length,0,"Uncaught browser JS errors: "+errors.join("; "));
    console.log("PASS browser: resident/admin reset modal, backdrop, email input, validation, Cancel, X, prefill, mobile viewport; ZERO live Firebase reset requests.");
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
