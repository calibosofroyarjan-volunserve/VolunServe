"use strict";
// REAL staging read-only smoke: existing approved test account.
// No account creation, verification email sending, linking changes,
// production sessions, Firebase data writes or Hosting deployment.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {chromium}=require("playwright");
const project=process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const testEmail=process.env.VOLUNSERVE_STAGING_TEST_EMAIL;
const testPassword=process.env.VOLUNSERVE_STAGING_TEST_PASSWORD;
assert(project && project!=="volunserve-3aa5b" && project!=="demo-volunserve","Staging project must be real, separate from production and emulator");
assert(/^[^\s@]+@(gmail\.com|yahoo\.com)$/.test(testEmail||""),"A dedicated staging Gmail/Yahoo test identity is required");
assert(typeof testPassword==="string"&&testPassword.length>=8,"Dedicated staging user password is required");
const root=path.resolve("dist"),port=4181;
const base="http://127.0.0.1:"+port;
const mime={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",".css":"text/css;charset=utf-8",".json":"application/json",".woff2":"font/woff2",".png":"image/png",".svg":"image/svg+xml"};
const server=http.createServer((req,res)=>{
 let url=new URL(req.url,base).pathname,asset=path.resolve(root,"."+decodeURIComponent(url));
 if(!asset.startsWith(root+path.sep)&&asset!==root){res.writeHead(403).end();return;}
 if(url==="/"||!fs.existsSync(asset)||fs.statSync(asset).isDirectory())asset=path.join(root,"index.html");
 res.writeHead(200,{"Content-Type":mime[path.extname(asset)]||"application/octet-stream","Cache-Control":"no-store"});
 fs.createReadStream(asset).pipe(res);
});
(async()=>{
 await new Promise((resolve,reject)=>server.once("error",reject).listen(port,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const context=await browser.newContext({viewport:{width:1366,height:850}});
 const rejected=[];
 await context.route("**/*",route=>{
   const url=route.request().url();
   if(/volunserve-3aa5b|https?:\/\/(?:www\.)?volunserve\.com/i.test(url)){
     rejected.push("Production endpoint blocked");return route.abort("blockedbyclient");
   }
   return route.continue();
 });
 const page=await context.newPage();
 page.setDefaultTimeout(20000);
 try{
   await page.goto(base+"/login",{waitUntil:"domcontentloaded",timeout:35000});
   await page.getByPlaceholder("Email address").fill(testEmail);
   await page.getByPlaceholder("Password").fill(testPassword);
   await page.getByRole("button",{name:"Sign In"}).click();
   await page.waitForURL(url=>!["/login","/signup","/public","/admin-login"].some(x=>url.pathname===x||url.pathname===x+"/"),
     {timeout:25000});
   assert.equal(rejected.length,0,"Production endpoint was contacted");
   console.log("PASS staging signed-in account reached a protected, non-Guest route");
   await page.reload({waitUntil:"domcontentloaded"});
   await page.waitForTimeout(2500);
   const route=new URL(page.url()).pathname;
   assert(!/^\/(?:login|signup|public|admin-login)(?:\/|$)/.test(route),"Staging account redirected to Login/Guest after refresh");
   assert.equal(rejected.length,0,"Production endpoint contacted on refresh");
   console.log("PASS staging authenticated session persisted across reload (NO DEPLOY)");
 }finally{await context.close();await browser.close();}
})().catch(err=>{console.error("Staging authentication check failed; no changes made: "+String(err.message));process.exitCode=1;}).finally(()=>new Promise(resolve=>server.close(resolve)));
