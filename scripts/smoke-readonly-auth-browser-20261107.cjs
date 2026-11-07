"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const cp=require("node:child_process");

const base=process.env.VOLUNSERVE_PREVIEW_URL||"https://volunserve-readonly-ui-preview.onrender.com";
assert.equal(new URL(base).hostname,"volunserve-readonly-ui-preview.onrender.com",
  "Never run authentication UI probes against production");
const chrome=cp.execFileSync("bash",["-lc","command -v google-chrome || command -v chromium || command -v chromium-browser"],{encoding:"utf8"}).trim().split("\n")[0];
assert(chrome,"Chrome or Chromium required for browser UI verification");

function inspect(route,attempt) {
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),"volunserve-preview-chrome-"));
  try {
    const url=base+route+"?previewAuthTest="+attempt;
    return cp.execFileSync(chrome,[
      "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
      "--disable-extensions","--no-first-run","--no-default-browser-check",
      "--user-data-dir="+profile,"--virtual-time-budget=25000","--dump-dom",url,
    ],{encoding:"utf8",timeout:85000,maxBuffer:16*1024*1024,stdio:["ignore","pipe","ignore"]});
  } finally {
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
  }
}

for (const route of ["/login","/signup","/admin-request"]) {
  let sawNotice=false, observations=[];
  for(let attempt=1;attempt<=4;attempt++) {
    let page;
    try {page=inspect(route,attempt);}
    catch(e){observations.push("browser error "+String(e.message).slice(0,130));continue;}
    const inputs=page.match(/<input[^>]*>/gi)||[];
    const credentialInputs=inputs.filter(tag=>/(?:type|name)=["'](?:email|password)["']/i.test(tag));
    assert.equal(credentialInputs.length,0,
      route+" exposes credential input(s) despite staging-only mode");
    const notice=page.includes("Sign-in is disabled on this preview");
    observations.push("attempt "+attempt+" notice="+notice+" inputs="+inputs.length+" domBytes="+page.length);
    if(notice){sawNotice=true;break;}
  }
  if(route==="/login"){
    assert(sawNotice,"/login never displayed disabled sign-in notice: "+observations.join("; "));
  }
  console.log("PASS staging-only "+route+" credential input suppression",observations.join("; "));
}
