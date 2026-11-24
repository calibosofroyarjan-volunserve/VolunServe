"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {createCommunityCertificateAutoSync}=require("./communityCertificateAutoSync");
let runs=0,issued=0,queries=0,shouldFail=false;
const docs=[
 {id:"completed_eligible",data:()=>({status:"completed",publicationStatus:"published",completedBy:"admin",completedAt:{seconds:1}})},
 {id:"pending",data:()=>({status:"upcoming",publicationStatus:"published"})},
 {id:"cancelled",data:()=>({status:"cancelled",publicationStatus:"published",completedBy:"admin",completedAt:{seconds:1}})},
 {id:"completed_old",data:()=>({status:"completed",publicationStatus:"published",completedBy:"admin",completedAt:{seconds:2}})},
];
const db={collection(name){
 assert.equal(name,"communityEvents");
 return {orderBy(field,order){
 assert.equal(field,"completedAt");assert.equal(order,"desc");
 return {limit(n){assert.equal(n,20);return {get:async()=>{queries++;return {docs};}};}};
 }};
}};
const logger={warn:()=>{},info:()=>{}};
const reconcile=async ({eventId,execute})=>{
 assert.equal(execute,true);
 assert(["completed_eligible","completed_old"].includes(eventId));
 runs++;
 // Existing certificate issuer returns no new certificate after initial issuance.
 if(eventId==="completed_eligible"&&!issued){issued=1;return {ok:true,issuedCount:1};}
 if(shouldFail&&eventId==="completed_old")throw Error("simulate temporary backend failure");
 return {ok:true,issuedCount:0,alreadyExistingCount:1};
};
(async()=>{
 const sync=createCommunityCertificateAutoSync({db,reconcile,logger});
 let first=await sync.runOnce();
 assert.equal(first.reviewed,2);assert.equal(first.issued,1);assert.equal(first.failed,0);
 let again=await sync.runOnce();
 assert.equal(again.issued,0,"Repeated scans cannot generate a second certificate");
 shouldFail=true;
 let failed=await sync.runOnce();
 assert.equal(failed.failed,1,"Failures must not throw or abort other eligible events");
 assert.equal(queries,3);
 const sidebar=fs.readFileSync("../app/(tabs)/_layout.tsx","utf8");
 const match=sidebar.match(/const volunteerDesktopTabs[^;]+;/s);
 assert(match && match[0].includes('name:"certificate",label:"My Certificates"'));
 assert(sidebar.includes('volunteerOnlyRoutes'));
 const cert=fs.readFileSync("../app/(tabs)/certificate.tsx","utf8");
 assert(cert.includes('Print / Save PDF'));
 assert(cert.includes('VolunteerAttendanceSummary'));
 console.log("PASS volunteer Certificates sidebar and automatic verified certificate recovery; existing records preserved");
})().catch(e=>{console.error(e);process.exitCode=1});
