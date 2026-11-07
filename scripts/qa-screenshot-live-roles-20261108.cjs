"use strict";
/**
 * Screenshots from ACTUAL Expo web compilation of protected live source.
 * This is a sandbox-only test. Browser network calls to external origins are denied.
 */
const fs=require("fs");
const http=require("http");
const path=require("path");
const { chromium }=require("playwright-core");
const port=4173;
const dist=path.resolve("dist");
const out=path.resolve("reports/real-ui-screens");
fs.mkdirSync(out,{recursive:true});
const MIME={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",".css":"text/css;charset=utf-8",".json":"application/json",".png":"image/png",".svg":"image/svg+xml",".woff2":"font/woff2",".ttf":"font/ttf",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp"};
function fileFor(url){
 const p=decodeURI(new URL(url,"http://127.0.0.1:"+port).pathname);
 const normalized=path.normalize(p).replace(/^(\.\.(\/|\\|$))+/,"");
 const base=path.resolve(dist,"."+normalized);
 if(!base.startsWith(dist+path.sep) && base!==dist)return null;
 const candidates=path.extname(base)?[base]:[base+".html",path.join(base,"index.html"),path.join(dist,"index.html")];
 return candidates.find(f=>fs.existsSync(f)&&fs.statSync(f).isFile())||null;
}
const server=http.createServer((req,res)=>{
 const file=fileFor(req.url);
 if(!file){res.writeHead(404);res.end("Not found");return;}
 res.setHeader("Content-Type",MIME[path.extname(file)]||"application/octet-stream");
 fs.createReadStream(file).pipe(res);
});
const roles=[
 {name:"resident",want:["home","good day","activity","community"]},
 {name:"volunteer",want:["volunteer","emergency","task"]},
 {name:"admin",want:["admin","command","dashboard"]},
 {name:"superadmin",want:["super admin","overview","admin"]}
];
const sizes=[{name:"desktop",width:1440,height:900},{name:"phone",width:390,height:844}];
const BASE="http://127.0.0.1:"+port;
const results=[];
async function main(){
 if(process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9099"||
    process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"){
  throw Error("BLOCKED: local demo emulators only");
 }
 await new Promise(resolve=>server.listen(port,"127.0.0.1",resolve));
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox"]});
 try{
  for(const size of sizes){
   // Each viewport gets a separate clean context per user, no cross-role persistence.
   for(const role of ["public-login","public-signup","public-guest",...roles.map(r=>r.name)]){
    const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:1});
    await context.route("**/*",async r=>{
      let url;
      try{url=new URL(r.request().url())}catch{return r.abort()}
      if(["data:","blob:"].includes(url.protocol)||["127.0.0.1","localhost"].includes(url.hostname))return r.continue();
      return r.abort("blockedbyclient");
    });
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",e=>errors.push(String(e.message).slice(0,350)));
    try{
     const route=role==="public-login"?"/login":role==="public-signup"?"/signup":role==="public-guest"?"/public":"/login";
     await page.goto(BASE+route,{waitUntil:"domcontentloaded",timeout:30000});
     await page.waitForTimeout(1700);
     if(!role.startsWith("public-")){
      await page.getByPlaceholder("Email address",{exact:false}).first().fill("preview."+role+"@example.com",{timeout:14000});
      await page.getByPlaceholder("Password",{exact:false}).first().fill("DemoOnlyPassword!2026",{timeout:14000});
      await page.getByText("Sign In",{exact:true}).first().click({timeout:14000});
      await page.waitForTimeout(4200);
     }
     let body=(await page.locator("body").innerText().catch(()=>"")).toLowerCase();
     const expected=roles.find(r=>r.name===role)?.want||[];
     const contains=expected.length===0||expected.some(t=>body.includes(t));
     const landed=role.startsWith("public-")||(!page.url().includes("/login")&&contains);
     const capture=path.join(out,role+"-"+size.name+".png");
     await page.screenshot({path:capture,fullPage:false,timeout:15000});
     results.push({role,viewport:size.name,url:page.url().replace(BASE,""),landed,bodySample:body.slice(0,220),errors:errors.slice(0,4),file:path.basename(capture)});
     console.log((landed?"PASS":"REVIEW")+" visual capture "+role+"/"+size.name+": "+page.url());

     // Authenticated module navigation and screenshot evidence for actual app routes.
     const pagesByRole={
       resident:[["assistance","/resident"],["events","/community-events"],["donations","/donation"],["announcements","/announcements"],["profile","/profile"]],
       volunteer:[["tasks","/volunteer"],["events","/community-events"],["impact","/volunteer-impact"],["notifications","/notifications"]],
       admin:[["identity","/identity-reviews"],["assistance","/assistance-requests"],["events","/community-events"],["announcements","/create-announcement"],["reports","/admin-cases"]],
       superadmin:[["accounts","/admin-accounts"],["records","/all-records"],["logs","/admin-logs"],["settings","/system-settings"]],
     };
     if(landed && pagesByRole[role]) for(const [label,pathName] of pagesByRole[role]){
       try{
         await page.goto(BASE+pathName,{waitUntil:"domcontentloaded",timeout:30000});
         await page.waitForTimeout(2300);
         const pathActual=new URL(page.url()).pathname;
         const bodyText=(await page.locator("body").innerText().catch(()=>"")).toLowerCase();
         const active=!pathActual.includes("/login") && pathActual===pathName && bodyText.trim().length>40;
         const fileName=role+"-"+label+"-"+size.name+".png";
         await page.screenshot({path:path.join(out,fileName),fullPage:false,timeout:16000});
         results.push({role:role+"/"+label,viewport:size.name,requested:pathName,url:pathActual,landed:active,errors:errors.slice(0,6),bodySample:bodyText.slice(0,200),file:fileName});
         console.log((active?"PASS":"REVIEW")+" module capture "+role+"/"+label+"/"+size.name+": "+pathActual);
       }catch(err){
         results.push({role:role+"/"+label,viewport:size.name,requested:pathName,landed:false,error:String(err.message).slice(0,400)});
         console.error("REVIEW module capture "+role+"/"+label+"/"+size.name+": "+err.message);
       }
     }

    }catch(e){
     const capture=path.join(out,role+"-"+size.name+"-error.png");
     await page.screenshot({path:capture,fullPage:false,timeout:12000}).catch(()=>{});
     results.push({role,viewport:size.name,landed:false,error:String(e.message).slice(0,700),errors:errors.slice(0,4)});
     console.error("REVIEW visual capture "+role+"/"+size.name+": "+e.message);
    }finally{await context.close()}
   }
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
 fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify({source:"actual compiled protected-live Expo web",backend:"isolated demo emulators",screens:results},null,2));
 const unsuccessful=results.filter(r=>!r.landed);
 console.log("Captured "+results.length+" viewport sessions. Screens requiring manual review: "+unsuccessful.length);
 if(unsuccessful.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;server.close();});
