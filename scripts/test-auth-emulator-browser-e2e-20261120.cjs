"use strict";
/**
 * QA only: real Chromium + Firebase Auth/Firestore emulators.
 * All accounts are synthetic and exist solely in emulator memory.
 * Requires a temporary local-emulator-only web bundle from CI (never publish).
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"), path=require("node:path"),http=require("node:http");
const {chromium}=require("playwright");
const appPort=4179;
const base="http://127.0.0.1:"+appPort;
const authBase="http://127.0.0.1:9099";
const dbBase="http://127.0.0.1:8080";
const project="demo-volunserve";
const apiKey="demo-volunserve-key";
const artifacts="artifacts/auth-emulator-e2e";
const root=path.resolve("dist");
const results=[];
const mime={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",
".css":"text/css;charset=utf-8",".json":"application/json",".woff":"font/woff",
".woff2":"font/woff2",".ttf":"font/ttf",".png":"image/png",".webp":"image/webp",
".svg":"image/svg+xml",".jpg":"image/jpeg"};
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,base).pathname);
 let asset=path.resolve(root,"."+relative);
 if(!asset.startsWith(root+path.sep)&&asset!==root){res.writeHead(403).end();return;}
 if(relative==="/"||!fs.existsSync(asset)||fs.statSync(asset).isDirectory())asset=path.join(root,"index.html");
 res.writeHead(200,{"Content-Type":mime[path.extname(asset)]||"application/octet-stream",
   "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 fs.createReadStream(asset).pipe(res);
});
async function jsonRequest(url,body,method="POST",headers={}){
 const r=await fetch(url,{method,headers:{"Content-Type":"application/json",...headers},
   body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 const bodyText=await r.text();
 let data;try{data=JSON.parse(bodyText);}catch{data={raw:bodyText.slice(0,200)};}
 if(!r.ok)throw Error("Emulator REST "+r.status+": "+JSON.stringify(data).slice(0,430));
 return data;
}
async function createUser(email,password){
 const account=await jsonRequest(authBase+"/identitytoolkit.googleapis.com/v1/accounts:signUp?key="+apiKey,
   {email,password,returnSecureToken:true});
 assert(account.localId && account.idToken);
 return account;
}
async function verifyUser(email,idToken){
 await jsonRequest(authBase+"/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key="+apiKey,
   {requestType:"VERIFY_EMAIL",idToken});
 let code=null;
 for(let i=0;i<16&&!code;i++){
   const r=await jsonRequest(authBase+"/emulator/v1/projects/"+project+"/oobCodes",undefined,"GET");
   const match=(r.oobCodes||[]).find(x=>x.email===email && x.requestType==="VERIFY_EMAIL");
   code=match?.oobCode;
   if(!code)await new Promise(resolve=>setTimeout(resolve,200));
 }
 assert(code,"Auth emulator must issue the actual verification code");
 await jsonRequest(authBase+"/identitytoolkit.googleapis.com/v1/accounts:update?key="+apiKey,
   {oobCode:code});
}
async function seedProfile(uid,email,role="resident",status="approved"){
 const fields={
   role:{stringValue:role},status:{stringValue:status},
   email:{stringValue:email},firstName:{stringValue:"Browser"},
   lastName:{stringValue:"Test"},displayName:{stringValue:"Browser Test"},
   barangay:{stringValue:"Poblacion"},city:{stringValue:"City of San Jose del Monte"},
   province:{stringValue:"Bulacan"},region:{stringValue:"Region III"},
   residentAccess:{booleanValue:role==="resident"},
   activeMode:{stringValue:"resident"},
   identityVerified:{booleanValue:false}
 };
 return jsonRequest(dbBase+"/v1/projects/"+project+"/databases/(default)/documents/users?documentId="+encodeURIComponent(uid),
   {fields},"POST",{"Authorization":"Bearer owner"});
}
async function newBrowserContext(browser){
 const context=await browser.newContext({viewport:{width:1366,height:900},locale:"en-US"});
 const blocked=[];
 await context.route("**/*",route=>{
   const url=new URL(route.request().url());
   if(["127.0.0.1","localhost"].includes(url.hostname))return route.continue();
   blocked.push(url.origin);
   return route.abort("blockedbyclient");
 });
 const page=await context.newPage();
 page.setDefaultTimeout(16000);
 return {context,page,blocked};
}
async function run(browser,name,test){
 const x=await newBrowserContext(browser);
 try{
   await test(x.page);
   const sensitiveExternal=x.blocked.filter(origin =>
     /firebase|identitytoolkit|securetoken|firestore[.]googleapis|volunserve[.]com/i.test(origin));
   assert.deepEqual(sensitiveExternal,[],"Real production Firebase/VolunServe was contacted");
   // Static pages may attempt public Google assets. They remain BLOCKED,
   // but are not treated as a live authentication or production data request.
   results.push({name,status:"PASS"});
   console.log("PASS browser auth emulator "+name);
 }catch(e){
   results.push({name,status:"FAIL",detail:String(e.message).slice(0,350)});
   await x.page.screenshot({path:path.join(artifacts,name+".png"),fullPage:true}).catch(()=>{});
   throw e;
 }finally{
   await x.context.close();
 }
}
async function logIn(page,email,password){
 await page.goto(base+"/login",{waitUntil:"domcontentloaded"});
 await page.getByPlaceholder("Email address").fill(email);
 await page.getByPlaceholder("Password").fill(password);
 await page.getByRole("button",{name:"Sign In"}).click();
}
const password="Volun2026!SecureQA";
(async()=>{
 assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,"127.0.0.1:9099");
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8080");
 assert.equal(process.env.GCLOUD_PROJECT,"demo-volunserve");
 const bundle=fs.readFileSync(path.join(root,"index.html"),"utf8");
 assert(!bundle.includes("https://volunserve.com"));
 fs.mkdirSync(artifacts,{recursive:true});
 await new Promise((ok,fail)=>server.once("error",fail).listen(appPort,"127.0.0.1",ok));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
   const residentEmail="qaresidentaccess2026@gmail.com";
   const resident=await createUser(residentEmail,password);
   await verifyUser(residentEmail,resident.idToken);
   await seedProfile(resident.localId,residentEmail,"resident","approved");

   await run(browser,"verified-resident-login-and-refresh",async(page)=>{
     await logIn(page,residentEmail,password);
     await page.waitForURL(url=>!/^\/(?:login|public|signup)(?:\/|$)/.test(url.pathname),
       {timeout:20000});
     assert(!page.url().includes("/public"),"Registered Resident must never become Guest Preview");
     await page.reload({waitUntil:"domcontentloaded"});
     await page.waitForTimeout(1800);
     assert(!/\/(?:login|public|signup)(?:\/|$)/.test(new URL(page.url()).pathname),
       "Approved resident session lost on refresh");
   });

   const freshEmail="qaverifiedincomplete2026@yahoo.com";
   const fresh=await createUser(freshEmail,password);
   await verifyUser(freshEmail,fresh.idToken);
   await run(browser,"verified-incomplete-user-resumes-signup",async(page)=>{
     await logIn(page,freshEmail,password);
     await page.waitForURL(url=>/\/signup\/?$/.test(url.pathname),{timeout:20000});
     await page.getByText(/Personal Details|Address & Profile/i).first().waitFor();
     assert(!/\/public/.test(page.url()),"Incomplete user incorrectly entered Guest");
   });

   const pendingEmail="qaunverifiedresident2026@gmail.com";
   await createUser(pendingEmail,password);
   await run(browser,"unverified-user-remains-blocked",async(page)=>{
     await logIn(page,pendingEmail,password);
     await page.getByText(/verify your email/i).first().waitFor();
     assert(/\/login\/?$/.test(new URL(page.url()).pathname));
   });

   const guestEmail="qalegacyguest2026@yahoo.com";
   const guest=await createUser(guestEmail,password);
   await verifyUser(guestEmail,guest.idToken);
   await seedProfile(guest.localId,guestEmail,"guest","approved");
   await run(browser,"legacy-guest-record-never-impersonates-resident",async(page)=>{
     await logIn(page,guestEmail,password);
     await page.getByText(/Guest Preview is read-only|Guest Preview records/i).first().waitFor();
     assert(/\/login\/?$/.test(new URL(page.url()).pathname));
   });

   // Open the actual Firebase-emulator email action link in a DIFFERENT
   // browser context. This must verify the SAME Auth UID without implicitly
   // signing in or redirecting to Guest.
   const linkEmail="qaemailactionseparate2026@gmail.com";
   const linkUser=await createUser(linkEmail,password);
   await jsonRequest(authBase+"/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key="+apiKey,
     {requestType:"VERIFY_EMAIL",idToken:linkUser.idToken});
   const codes=await jsonRequest(authBase+"/emulator/v1/projects/"+project+"/oobCodes",undefined,"GET");
   const action=(codes.oobCodes||[]).find(x=>x.email===linkEmail&&x.requestType==="VERIFY_EMAIL");
   assert(action?.oobLink,"Actual local email verification action link was not generated");
   assert(new URL(action.oobLink).hostname==="127.0.0.1","Verification link must stay on the local Auth emulator");

   await run(browser,"verification-link-opens-in-separate-browser",async(page)=>{
     const separate=await newBrowserContext(browser);
     try{
       await separate.page.goto(action.oobLink,{waitUntil:"domcontentloaded"});
       let lookup;
       for(let i=0;i<12;i++){
         lookup=await jsonRequest(authBase+"/identitytoolkit.googleapis.com/v1/accounts:lookup?key="+apiKey,
           {idToken:linkUser.idToken});
         if(lookup.users?.[0]?.emailVerified)break;
         if(i===2){
           const button=separate.page.getByRole("button",{name:/verify|confirm|continue/i}).first();
           if(await button.count())await button.click().catch(()=>{});
         }
         await separate.page.waitForTimeout(300);
       }
       assert.equal(lookup.users?.[0]?.emailVerified,true,"Clicking emulator email action must verify Auth UID");
       assert.equal(lookup.users?.[0]?.localId,linkUser.localId,"Email action must not create a new UID");
       assert(!new URL(page.url()).pathname.startsWith("/public"),"Verification link cannot trigger Guest Preview");
     }finally{await separate.context.close();}
     await logIn(page,linkEmail,password);
     await page.waitForURL(url=>/\/signup\/?$/.test(url.pathname),{timeout:20000});
     assert(!page.url().includes("/public"),"Verified Auth-only login must resume Signup, not Guest");
   });

   const googleEmail="qagooglelink2026@gmail.com";
   await run(browser,"google-emulator-popup-link-password-same-uid",async(page)=>{
     await page.goto(base+"/signup",{waitUntil:"domcontentloaded"});
     const popupPromise=page.waitForEvent("popup",{timeout:20000});
     await page.getByRole("button",{name:"Continue with Google"}).click();
     const popup=await popupPromise;
     await popup.waitForLoadState("domcontentloaded");
     await popup.bringToFront();
     await popup.setViewportSize({width:480,height:900});
     await popup.locator("#add-account-button").waitFor({state:"visible",timeout:20000});
     await popup.locator("#add-account-button").click();
     await popup.locator("#email-input").waitFor({state:"visible",timeout:16000});
     await popup.locator("#email-input").fill(googleEmail);
     await popup.locator("#display-name-input").fill("Google Emulator Tester");
     const before=await jsonRequest(authBase+"/emulator/v1/projects/"+project+"/accounts",undefined,"GET");
     const already=(before.users||[]).find(u=>u.email===googleEmail);
     assert(!already,"Google test account must be a fresh emulator identity");
     const closed=popup.waitForEvent("close",{timeout:20000});
     await popup.getByRole("button",{name:"Sign in with Google.com"}).click();
     await closed;
     await page.getByText(/Create a VolunServe password|Link Password & Continue/i).first().waitFor();
     const googleBefore=await jsonRequest(authBase+"/emulator/v1/projects/"+project+"/accounts",undefined,"GET");
     const original=(googleBefore.users||[]).find(u=>u.email===googleEmail);
     assert(original?.localId,"Google emulator popup must sign into a real Auth UID");
     await page.getByPlaceholder("At least 8 characters").fill(password);
     await page.getByPlaceholder("Type the same password again").fill(password);
     await page.getByRole("checkbox").check();
     await page.getByRole("button",{name:"Link Password & Continue"}).click();
     await page.getByText(/Step 3|Personal Details/i).first().waitFor({timeout:20000});
     const linked=await jsonRequest(authBase+"/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key="+apiKey,
       {email:googleEmail,password,returnSecureToken:true});
     assert.equal(linked.localId,original.localId,"Email linking must retain same Google UID, not create a second user");
     assert(!page.url().includes("/public"),"Google-owned account must not become Guest");
   });

   console.log("PASS "+results.length+" real authenticated Chromium emulation scenarios, no production accounts");
 }finally{
   await browser.close();
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(async()=>{
 fs.mkdirSync(artifacts,{recursive:true});
 fs.writeFileSync(path.join(artifacts,"results.json"),JSON.stringify(results,null,2));
 await new Promise(resolve=>server.close(resolve));
});
