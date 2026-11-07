"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const cp=require("node:child_process");
const origin="http://127.0.0.1:8765";
const roles=[
  {role:"resident",headline:"Welcome to your community"},
  {role:"volunteer",headline:"Ready to make a difference?"},
  {role:"admin",headline:"Your operations at a glance"},
  {role:"superadmin",headline:"System-wide overview"},
];
const outputDir="reports/ui-screenshots";
fs.mkdirSync(outputDir,{recursive:true});
const browser=cp.execFileSync("bash",["-lc","command -v google-chrome || command -v chromium || command -v chromium-browser"],{encoding:"utf8"}).trim().split("\n")[0];
assert(browser,"Chrome/Chromium is required for responsive design tests");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function launch() {
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),"vs-cdp-"));
  const proc=cp.spawn(browser,[
    "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
    "--no-first-run","--no-default-browser-check","--disable-extensions",
    "--remote-debugging-port=0","--user-data-dir="+profile,"about:blank",
  ],{stdio:"ignore"});
  let port;
  for(let attempt=0;attempt<65;attempt++){
    if(proc.exitCode!==null)throw Error("Chrome exited with "+proc.exitCode);
    try{const x=fs.readFileSync(path.join(profile,"DevToolsActivePort"),"utf8").trim();port=Number(x.split("\n")[0]);if(port)break;}catch{}
    await sleep(200);
  }
  if(!port){proc.kill("SIGKILL");throw Error("Chrome DevTools protocol port not ready");}
  let targets;
  for(let attempt=0;attempt<40;attempt++){
    try{targets=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();if(targets.some(t=>t.type==="page"))break;}catch{}
    await sleep(200);
  }
  const page=targets?.find(t=>t.type==="page");
  if(!page)throw Error("Chrome has no debug target");
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let seq=0;
  const pending=new Map();
  const runtimeErrors=[];
  ws.onmessage=event=>{
    let msg;try{msg=JSON.parse(String(event.data));}catch{return}
    if(msg.id && pending.has(msg.id)){
      const item=pending.get(msg.id);pending.delete(msg.id);
      msg.error?item.reject(Error(msg.error.message)):item.resolve(msg.result);
    }
    if(msg.method==="Runtime.exceptionThrown"){
      runtimeErrors.push(JSON.stringify(msg.params?.exceptionDetails?.text||"runtime exception").slice(0,220));
    }
  };
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error("CDP timeout "+method));},30000);
    pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});
    ws.send(JSON.stringify({id,method,params}));
  });
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  const evaluate=async expression=>{
    const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
    if(r?.exceptionDetails)throw Error("Browser JS failed "+r.exceptionDetails.text);
    return r?.result?.value;
  };
  return {proc,profile,ws,call,evaluate,runtimeErrors,
    close:async()=>{try{ws.close()}catch{}try{proc.kill("SIGKILL")}catch{}await sleep(200);
      fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});}};
}
async function waitFor(browser,text,route){
  let last="";
  for(let attempt=0;attempt<100;attempt++){
    last=String(await browser.evaluate("document.body ? document.body.innerText : ''")||"");
    if(last.includes(text))return last;
    await sleep(200);
  }
  console.log("BROWSER DEBUG missing "+text+" at "+route+" text="+last.slice(0,1300));
  console.log("BROWSER ERRORS",browser.runtimeErrors.slice(-6));
  throw Error("Rendered "+route+" did not show expected "+text);
}
(async()=>{
  let reachable=false;
  for(let i=0;i<30;i++){
    try{if((await fetch(origin+"/public/preview")).ok){reachable=true;break;}}catch{}
    await sleep(250);
  }
  assert(reachable,"Expo review static server is unavailable");
  const browserSession=await launch();
  try{
    for(const view of ["desktop","mobile"]){
      const width=view==="desktop"?1440:390, height=view==="desktop"?960:844;
      await browserSession.call("Emulation.setDeviceMetricsOverride",{
        width,height,deviceScaleFactor:1,mobile:view==="mobile",
        screenWidth:width,screenHeight:height,
      });
      for(const item of roles){
        const url=origin+"/public/preview?role="+item.role+"&module=home";
        await browserSession.call("Page.navigate",{url});
        await waitFor(browserSession,item.headline,item.role+"/"+view);
        const visible=await browserSession.evaluate("document.body.innerText");
        assert(visible.includes("Read-only interactive design preview"),"Missing demo-only banner");
        const widths=await browserSession.evaluate(
          "({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})"
        );
        assert(widths.document<=widths.viewport+2,
          "Horizontal page overflow at "+item.role+" "+view+": "+JSON.stringify(widths));
        const png=await browserSession.call("Page.captureScreenshot",{
          format:"png",captureBeyondViewport:false,fromSurface:true,
        });
        const output=path.join(outputDir,item.role+"-"+view+".png");
        fs.writeFileSync(output,Buffer.from(png.data,"base64"));
        assert(fs.statSync(output).size>10000,"Empty design screenshot "+output);
        console.log("PASS "+item.role+" "+view+" width="+widths.viewport+" screenshot="+output);
      }
    }
    await browserSession.call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await browserSession.call("Page.navigate",{url:origin+"/public/preview?role=admin&module=announcements"});
    await waitFor(browserSession,"Draft announcement","Admin mobile announcements");
    assert((await browserSession.evaluate("document.body.innerText")).includes("Validate sample form"),
      "Admin sample form must expose validation");
    const trigger=await browserSession.evaluate(
      "(()=>{const el=document.querySelector('[aria-label=\"Change preview role\"]');if(!el)return false;el.click();return true})()"
    );
    assert(trigger,"Role switcher must work as a button");
    await waitFor(browserSession,"SWITCH WORKSPACE","role switcher");
    const switched=await browserSession.evaluate(
      "(()=>{const el=document.querySelector('[aria-label=\"Preview Volunteer\"]');if(!el)return false;el.click();return true})()"
    );
    assert(switched,"Volunteer selector must be clickable");
    await waitFor(browserSession,"Ready to make a difference?","role switch");
    const navButton=await browserSession.evaluate(
      "(()=>{const el=document.querySelector('[aria-label=\"Open navigation\"]');if(!el)return false;el.click();return true})()"
    );
    assert(navButton,"Mobile menu button must be interactive");
    await waitFor(browserSession,"Emergency Tasks","Mobile drawer");
    console.log("PASS real browser clicks: role menu -> Volunteer -> mobile sidebar");
    fs.writeFileSync(path.join(outputDir,"qa-results.json"),JSON.stringify({
      checkedAt:new Date().toISOString(),roles:roles.map(x=>x.role),
      viewports:["1440x960","390x844"],
      checks:["public route hydration","sample labels","horizontal overflow","role switch click","mobile drawer click"],
      runtimeErrors:browserSession.runtimeErrors.slice(0,10),
    },null,2));
  }finally{await browserSession.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
