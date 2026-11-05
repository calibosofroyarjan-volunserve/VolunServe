#!/usr/bin/env node
"use strict";
/**
 * Public-only UI smoke. Requires Chrome --remote-debugging-port=9223.
 * No sign-in, user data, tokens, Firestore writes or role impersonation.
 */
const assert=require("node:assert/strict");
const origin=process.argv[2];
assert(origin && /^https:\/\/[^/?#]+$/.test(origin), "Expected a public HTTPS preview origin");
const endpoint="http://127.0.0.1:9223";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(method,params={},ms=12000){
  const id=++seq;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error("Chrome command timeout: "+method))},ms);
    pending.set(id,{resolve,reject,timeout});
    ws.send(JSON.stringify({id,method,params}));
  });
}
let ws,seq=0;
const pending=new Map(),exceptions=[];
async function main(){
  let page;
  for(let i=0;i<140;i++){
    try{
      const r=await fetch(endpoint+"/json/list");
      const pages=await r.json();
      page=pages.find(x=>x.type==="page"&&x.webSocketDebuggerUrl);
      if(page)break;
    }catch {}
    await sleep(300);
  }
  assert(page?.webSocketDebuggerUrl,"Could not find Chrome debugging page");
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    ws.addEventListener("open",resolve,{once:true});
    ws.addEventListener("error",reject,{once:true});
    setTimeout(()=>reject(Error("Chrome WebSocket did not open")),10000);
  });
  ws.addEventListener("message",event=>{
    let payload;
    try{payload=JSON.parse(String(event.data));}catch{return;}
    if(payload.id!==undefined){
      const waiting=pending.get(payload.id);if(!waiting)return;
      pending.delete(payload.id);clearTimeout(waiting.timeout);
      if(payload.error)waiting.reject(Error(JSON.stringify(payload.error)));
      else waiting.resolve(payload.result||{});
    }else if(payload.method==="Runtime.exceptionThrown"){
      const d=payload.params?.exceptionDetails;
      if(d)exceptions.push(String(d.text||"Exception") + " "+String(d.exception?.description||"").slice(0,350));
    }
  });
  await request("Page.enable");
  await request("Runtime.enable");
  await request("Network.enable");
  const url=origin+"/admin-request?lgu-ui-check="+Date.now();
  console.log("Navigating to",url);
  await request("Page.navigate",{url});
  let last={};
  const deadline=Date.now()+65000;
  while(Date.now()<deadline){
    try{
      const result=await request("Runtime.evaluate",{
        expression:"({url:location.href, ready:document.readyState,text:(document.body?.innerText||'').slice(0,6000),scripts:document.scripts.length})",
        returnByValue:true,awaitPromise:false
      });
      last=result.result?.value||{};
      const text=last.text||"";
      const keys=["LGU Staff Verification Application","Proof of LGU Employment","LGU Employee ID","Supporting official document","Resume Proof Upload","Submit for Super Admin Verification"];
      if(keys.every(x=>text.includes(x))){
        assert(!text.includes("Use an AI face scan"),"Face recognition unexpectedly present.");
        console.log("PASS LGU documents application UI fully hydrated",JSON.stringify({url:last.url,ready:last.ready,scripts:last.scripts,bytes:text.length}));
        await ws.close();
        return;
      }
    }catch(e){last={...last,cdpError:String(e.message||e)};}
    await sleep(1300);
  }
  console.error("FAILED hydration after 65 seconds",JSON.stringify(last).slice(0,3500));
  console.error("Browser JS errors:",JSON.stringify(exceptions.slice(-8)));
  process.exitCode=1;
  ws.close();
}
main().catch(e=>{console.error(e.stack||String(e));process.exitCode=1;ws?.close();});
