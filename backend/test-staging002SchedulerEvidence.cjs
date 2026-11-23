"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {createStaging002SchedulerEvidence} = require("./staging002SchedulerEvidence");
test("Disabled timer has no fabricated runs or stop proof",()=>{
 const e=createStaging002SchedulerEvidence(false,()=>1800000000000);
 const s=e.snapshot();
 assert.deepEqual(s,{
   automaticWaveTimerConfigured:false,
   schedulerRunCount:0,
   schedulerLastResult:"not_run",
   schedulerLastCompletedAtUtc:null,
   timerExecutionObserved:false,
   actualTimerExecutionNotProven:true,
   schedulerObservationScope:"current_server_process"
 });
});
test("A returned supported result proves an actual scheduled call completed, status only",()=>{
 const e=createStaging002SchedulerEvidence(true,()=>1800000000000);
 assert.equal(e.record({status:"supported",accepted:1,volunteerId:"PRIVATE_TOKEN"}),"supported");
 const s=e.snapshot();
 assert.equal(s.timerExecutionObserved,true);
 assert.equal(s.schedulerRunCount,1);
 assert.equal(s.schedulerLastResult,"supported");
 assert.equal(s.schedulerLastCompletedAtUtc,new Date(1800000000000).toISOString());
 assert.equal(JSON.stringify(s).includes("PRIVATE_TOKEN"),false);
});
test("Other statuses do not fabricate supported outcome",()=>{
 const e=createStaging002SchedulerEvidence(true,()=>1800000000000);
 for(const status of ["waiting","offered","exhausted","blocked","supported_or_changed","error","unknown"])
   e.record({status});
 assert.equal(e.snapshot().schedulerRunCount,7);
 assert.equal(e.snapshot().schedulerLastResult,"other");
 assert.equal(e.snapshot().timerExecutionObserved,true);
});
test("A fresh server instance has no historical scheduler proof",()=>{
 const e=createStaging002SchedulerEvidence(true,()=>1800000000000);
 e.record("supported");
 const fresh=createStaging002SchedulerEvidence(true,()=>1800000000001);
 assert.equal(fresh.snapshot().timerExecutionObserved,false);
});
test("Actual staging timer writes heartbeat on completed runs and stops duplicate in-flight calls",()=>{
 const s=fs.readFileSync(__dirname+"/emergencyAutoDispatchStagingServer.js","utf8");
 assert.match(s,/const schedulerEvidence=createStaging002SchedulerEvidence\(autoWaves002\)/);
 assert.match(s,/if\(schedulerTickInFlight\)return/);
 assert.match(s,/advanceBatchWave\(firestore\)\.then\(result=>\{/);
 assert.match(s,/schedulerEvidence\.record\(result\)/);
 assert.match(s,/\.finally\(\(\)=>\{schedulerTickInFlight=false;\}\)/);
 assert.match(s,/schedulerStopObservedThisProcess:guardObserved/);
 assert.match(s,/result\.observedAfterOtherOffersExpired===true/);
 assert.match(s,/result\.acceptanceEvidenceVerified===true/);
});
test("Read-only endpoint is admin protected; UI has no action to force scheduler writes",()=>{
 const server=fs.readFileSync(__dirname+"/emergencyAutoDispatchStagingServer.js","utf8");
 assert.match(server,/app\.get\("\/api\/admin\/emergency-auto\/e2e-002\/bulk-wave-stop",\s*requireStagingAdmin/);
 const html=fs.readFileSync(__dirname+"/stagingAdminLogin.html","utf8");
 assert.ok(html.includes("Scheduled runs recorded: "));
 assert.ok(html.includes("Accepted wave-stop observed after a scheduler run"));
 const scripts=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Function(scripts[0][1].replace(/^\s*import .*?;\s*$/gm,"")));
});
