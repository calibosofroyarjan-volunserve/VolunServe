"use strict";
const assert=require("node:assert/strict");
const cp=require("node:child_process");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const origin="http://127.0.0.1:8765";
const browser=cp.execFileSync("bash",["-lc","command -v google-chrome || command -v chromium || command -v chromium-browser"],{encoding:"utf8"}).trim().split("\n")[0];
assert(browser,"Chromium/Chrome must be available on CI runner");
const shots=[
  {role:"resident",title:"Welcome to your community"},
  {role:"volunteer",title:"Ready to make a difference?"},
  {role:"admin",title:"Your operations at a glance"},
  {role:"superadmin",title:"System-wide overview"},
];
function chromeRun(url,viewport,args){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),"vs-responsive-"));
  try{
    return cp.execFileSync(browser,[
      "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
      "--disable-extensions","--no-first-run","--no-default-browser-check",
      "--user-data-dir="+profile,
      "--window-size="+viewport,
      "--force-device-scale-factor=1",
      "--virtual-time-budget=11000",
      ...args,url,
    ],{timeout:90000,encoding:"utf8",maxBuffer:16*1024*1024,stdio:["ignore","pipe","ignore"]});
  }finally{fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200})}
}
(async()=>{
  for(let t=0;t<24;t++){
    try{const r=await fetch(origin+"/public/preview");if(r.ok)break;}catch{}
    if(t===23)throw Error("Local Expo preview did not start");
    await new Promise(r=>setTimeout(r,500));
  }
  const outputDir="reports/ui-screenshots";
  fs.mkdirSync(outputDir,{recursive:true});
  for(const shot of shots)for(const view of ["desktop","mobile"]){
    const viewport=view==="desktop"?"1440,960":"390,844";
    const url=origin+"/public/preview?role="+shot.role+"&module=home";
    const html=chromeRun(url,viewport,["--dump-dom"]);
    assert(html.includes(shot.title),"Rendered preview missing "+shot.role+" headline at "+view);
    assert(html.includes("Read-only interactive design preview"),"Unsafe/unlabeled preview: "+shot.role+" "+view);
    const file=path.resolve(outputDir,shot.role+"-"+view+".png");
    chromeRun(url,viewport,["--screenshot="+file,"--hide-scrollbars"]);
    assert(fs.statSync(file).size>6000,"Screenshot appears empty "+file);
    console.log("PASS screenshot "+shot.role+" "+view+" -> "+file);
  }
  const route=origin+"/public/preview?role=admin&module=announcements";
  const html=chromeRun(route,"390,844",["--dump-dom"]);
  assert(html.includes("Draft announcement")&&html.includes("Validate sample form"),
    "Mobile Admin announcement module does not render accessible sample validation");
  console.log("PASS Admin mobile module sample form and validation controls");
})().catch(error=>{console.error(error);process.exitCode=1});
