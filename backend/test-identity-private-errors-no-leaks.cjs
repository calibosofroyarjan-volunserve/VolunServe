"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const server=fs.readFileSync("backend/server.js","utf8");

// Run the exact identity route catch body with a synthetic Firestore/AI
// exception. This never imports Firebase, logs sensitive material, uploads
// photos, or makes network requests.
function catchBody(routeStart,nextAnchor){
  const a=server.indexOf(routeStart);
  const b=server.indexOf(nextAnchor,a+routeStart.length);
  assert(a>=0&&b>a,"identity route missing");
  const code=server.slice(a,b);
  const start=code.lastIndexOf("    } catch (error) {");
  const end=code.indexOf("\n    }\n  },\n);",start);
  assert(start>=0&&end>start,"expected identity route catch missing");
  return code.slice(start+"    } catch (error) {".length,end);
}
const routes=[
  {label:"resident status",start:'app.get(\n  "/api/identity/status"',next:'app.post(\n  "/api/identity/verify"',fallback:"status_failed",statusOnly:true},
  {label:"identity verification",start:'app.post(\n  "/api/identity/verify"',next:"function identityAdminTimestampIso(",fallback:"identity_verification_failed"},
  {label:"Admin review queue",start:'app.get(\n  "/api/admin/identity/reviews"',next:'app.post(\n  "/api/admin/identity/reviews/:uid/decision"',fallback:"identity_review_queue_failed"},
  {label:"Admin decision",start:'app.post(\n  "/api/admin/identity/reviews/:uid/decision"',next:'app.post(\n  "/api/admin/assistance/requests/:requestId/start-review"',fallback:"identity_review_decision_failed"},
];
async function runCatch(body,error){
 const warnings=[];
 let captured={status:0,data:null};
 const response={
   status(n){captured.status=n;return this},
   json(x){captured.data=x;return this},
 };
 const cleanText=(x,n)=>String(x??"").slice(0,n);
 // All inputs are inert synthetic values, no service credential or user data.
 const handler=vm.runInNewContext(
   "(async function(error,response,console,cleanText){const claimed=false;"+
      body+"})",
   { });
 await handler(error,response,{warn:(...parts)=>warnings.push(parts.join(" "))},cleanText);
 return {...captured,warnings};
}
for(const route of routes) {
 const body=catchBody(route.start,route.next);
 test(route.label+" never leaks 5xx exception details or codes",async()=>{
   const marker="sensitive_account_uid_PASSPORT_OCR_secret_provider_message";
   const result=await runCatch(body,{statusCode:503,code:marker,message:marker,stack:marker});
   assert.equal(result.status,500);
   assert.equal(result.data.error,route.fallback);
   const printed=JSON.stringify(result);
   assert(!printed.includes(marker),"private details must never escape");
 });
 test(route.label+" never leaks arbitrary Firebase error objects",async()=>{
   const marker="person@example.invalid users/uid_private firestore account";
   const result=await runCatch(body,{message:marker,stack:marker});
   assert.equal(result.status,500);
   assert(!JSON.stringify(result).includes(marker));
 });
 if(!route.statusOnly) {
   test(route.label+" preserves app-owned 4xx validation contract",async()=>{
     const result=await runCatch(body,{
       statusCode:409,code:"identity_review_not_pending",
       message:"Identity review no longer pending.",
     });
     assert.equal(result.status,409);
     assert.equal(result.data.error,"identity_review_not_pending");
     assert.equal(result.data.message,"Identity review no longer pending.");
   });
   test(route.label+" refuses malformed 4xx provider error codes",async()=>{
     const marker="private account OCR data";
     const result=await runCatch(body,{
       statusCode:403,code:"provider_"+marker,
       message:"should-not-show-"+marker,
     });
     assert.equal(result.status,500);
     assert(!JSON.stringify(result).includes(marker));
   });
 }
}
test("all private status/verification/review route catch handlers refuse raw exception logging",()=>{
 const section=server.slice(server.indexOf(routes[0].start),server.indexOf(routes[3].next));
 for(const pattern of [
   /console\.error\("Identity verification failed:",\s*error\?\.message\)/,
   /console\.error\("Identity review decision failed:",\s*error\)/,
   /console\.error\("Identity review queue failed:",\s*error\)/,
   /console\.error\(\s*"Identity status failed:",\s*error/,
   /console\.error\("Identity verification lease cleanup failed:",\s*cleanupError\?\.message/,
 ]) assert(!pattern.test(section));
});
