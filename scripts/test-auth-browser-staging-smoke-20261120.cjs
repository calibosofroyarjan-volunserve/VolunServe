"use strict";
/**
 * Real Chromium browser smoke tests for the actual staging web export.
 * No production Auth credentials, no test-account creation, and NO deployment.
 *
 * The real cross-browser Gmail verification and Google linking flows still
 * require approved staging identities and an authorized staging Firebase app.
 * These checks verify entrypoint routing, guest isolation, signup validation
 * and browser reload safety; code-level tests separately simulate Auth states.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const { chromium }=require("playwright");

const root=path.resolve("dist");
const port=4178;
const types={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",
 ".css":"text/css;charset=utf-8",".json":"application/json",
 ".svg":"image/svg+xml",".png":"image/png",".webp":"image/webp",".woff2":"font/woff2"};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1:"+port).pathname);
 let filename=path.resolve(root,"."+pathname);
 if(!filename.startsWith(root+path.sep)&&filename!==root){res.writeHead(403).end();return;}
 if(pathname==="/" || !fs.existsSync(filename) || fs.statSync(filename).isDirectory())
   filename=path.join(root,"index.html");
 const ext=path.extname(filename);
 res.writeHead(200,{"Content-Type":types[ext]||"application/octet-stream",
   "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 fs.createReadStream(filename).pipe(res);
});
const base="http://127.0.0.1:"+port;
const shots="artifacts/auth-browser-staging";
const checks=[];
let browser;

async function openFresh(){
 const context=await browser.newContext({viewport:{width:1366,height:900},
   locale:"en-US",ignoreHTTPSErrors:false});
 const forbidden=[];
 await context.route("**/*",route=>{
   const url=route.request().url();
   if(url.includes("volunserve-3aa5b") || url.startsWith("https://volunserve.com")){
     forbidden.push(url.replace(/[?].*/,""));
     return route.abort("blockedbyclient");
   }
   return route.continue();
 });
 const page=await context.newPage();
 page.setDefaultTimeout(15000);
 return {context,page,forbidden};
}
async function visit(route){
 const c=await openFresh();
 await c.page.goto(base+route,{waitUntil:"domcontentloaded",timeout:30000});
 return c;
}
async function run(name,fn){
 const x=await visit("/login");
 try{
   await fn(x.page,x.forbidden);
   assert.equal(x.forbidden.length,0,"Real production URL/network request attempted");
   checks.push({test:name,result:"PASS"});
   console.log("PASS "+name);
 }catch(e){
   checks.push({test:name,result:"FAIL: "+String(e.message)});
   await x.page.screenshot({path:path.join(shots,name.replaceAll(/[^a-z0-9-]/gi,"-")+".png"),fullPage:true}).catch(()=>{});
   throw e;
 }finally{await x.context.close();}
}
(async()=>{
 fs.mkdirSync(shots,{recursive:true});
 await new Promise((ok,fail)=>server.once("error",fail).listen(port,"127.0.0.1",ok));
 browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});

 await run("login-loads-without-auto-guest-redirect",async(page)=>{
   await page.getByPlaceholder("Email address").waitFor();
   await page.getByPlaceholder("Password").waitFor();
   assert.match(new URL(page.url()).pathname,/\/login\/?$/);
   await page.waitForTimeout(850);
   assert.match(new URL(page.url()).pathname,/\/login\/?$/);
   await page.screenshot({path:path.join(shots,"login-stage.png")});
 });
 await run("empty-login-remains-login-and-displays-validation",async(page)=>{
   await page.getByRole("button",{name:"Sign In"}).click();
   await page.getByText(/Enter your email/i).first().waitFor();
   assert.match(new URL(page.url()).pathname,/\/login\/?$/);
 });
 await run("login-page-refresh-does-not-enter-guest",async(page)=>{
   await page.getByPlaceholder("Email address").waitFor();
   await page.reload({waitUntil:"domcontentloaded"});
   await page.getByPlaceholder("Email address").waitFor();
   assert.match(new URL(page.url()).pathname,/\/login\/?$/);
 });
 await run("guest-preview-requires-explicit-selection",async(page)=>{
   assert.match(new URL(page.url()).pathname,/\/login\/?$/);
   await page.getByRole("button",{name:"Continue as Guest"}).click();
   await page.getByText(/Which workspace would you like to preview/i).waitFor();
   assert.match(new URL(page.url()).pathname,/\/public\/?$/);
   await page.screenshot({path:path.join(shots,"guest-preview-stage.png")});
 });
 await run("signup-blocks-co-and-disposable-email",async(page)=>{
   await page.goto(base+"/signup",{waitUntil:"domcontentloaded"});
   const email=page.getByPlaceholder("name@example.com");
   await email.waitFor();
   await email.fill("sample@legitimatebusiness.co");
   await page.getByText("New VolunServe registration accepts only @gmail.com or @yahoo.com email addresses.",{exact:true}).waitFor();
   await email.fill("sample@mailticking.com");
   await page.getByText("Temporary email addresses are not accepted. Use a permanent email address.",{exact:true}).waitFor();
   await page.screenshot({path:path.join(shots,"signup-co-rejection-stage.png")});
 });
 await run("signup-gmail-yahoo-validation-and-refresh",async(page)=>{
   await page.goto(base+"/signup",{waitUntil:"domcontentloaded"});
   const email=page.getByPlaceholder("name@example.com");await email.waitFor();
   await email.fill("newvalidexample2026@gmail.com");
   await page.getByText(/Valid email format/i).waitFor();
   await email.fill("newvalidexample2026@yahoo.com");
   await page.getByText(/Valid email format/i).waitFor();
   await page.reload({waitUntil:"domcontentloaded"});
   await page.getByPlaceholder("name@example.com").waitFor();
   assert.match(new URL(page.url()).pathname,/\/signup\/?$/);
 });
 console.log("PASS "+checks.length+" actual Chromium staging browser smoke checks; no account writes");
})().catch(err=>{console.error(err.stack||String(err));process.exitCode=1;}).finally(async()=>{
 fs.writeFileSync(path.join(shots,"results.json"),JSON.stringify(checks,null,2));
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
});
