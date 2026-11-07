"use strict";
const assert=require("node:assert/strict");
const urlBase="https://volunserve-readonly-ui-preview.onrender.com";
async function read(path) {
 const response=await fetch(urlBase+path,{redirect:"follow",signal:AbortSignal.timeout(25000),headers:{"cache-control":"no-cache"}});
 const body=await response.text();
 return {status:response.status,contentType:response.headers.get("content-type")||"",finalUrl:response.url,body};
}
(async()=>{
 const candidates=["/public/preview","/public/preview.html","/public/preview/"];
 let success=null;
 for(const path of candidates) {
  try {
   const response=await read(path);
   console.log("PREVIEW PATH",path,"STATUS",response.status,"TYPE",response.contentType);
   if(response.status===200 && response.contentType.includes("html") && response.body.toLowerCase().includes("<html") && response.finalUrl.startsWith(urlBase)) {
     success={path,...response};break;
   }
  } catch(e){console.log("PREVIEW PATH FAILED",path,e.message)}
 }
 assert(success,"No reachable read-only Expo guest preview page");
 assert(!success.finalUrl.includes("volunserve.com"),"A preview may never redirect to production");
 const app=await read("/");
 assert(app.status===200 && app.contentType.includes("html"),"Read-only preview root should be reachable");
 console.log("PASS: publicly hosted isolated Expo preview page:",urlBase+success.path);
})().catch(e=>{console.error(e);process.exitCode=1});
