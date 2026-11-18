"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {STAGING_PROJECT,CASE_ID,TESTS,modeFrom,readStagingCredential}
 =require("./seed-isolated-staging-volunteers.cjs");

test("plan works without credentials or network calls",()=>{
 const p=spawnSync(process.execPath,[path.join(__dirname,"seed-isolated-staging-volunteers.cjs"),"--plan"],
   {encoding:"utf8",env:{PATH:process.env.PATH}});
 assert.equal(p.status,0,p.stderr);
 assert.match(p.stdout,/no Firebase calls or mutations/i);
 assert.match(p.stdout,/volunserve-volunteer-staging/);
 assert.equal(TESTS.length,3);
 assert.equal(CASE_ID,"STAGING_E2E_002");
 assert.ok(TESTS.every(x=>x.email.endsWith("@volunserve.test") && x.skills[0]==="First Aid"));
});
test("explicit confirmation required to write",()=>{
 assert.equal(modeFrom([]),"--plan");
 assert.equal(modeFrom(["--inspect"]),"--inspect");
 assert.throws(()=>modeFrom(["--apply"]),/Refusing writes/);
 assert.throws(()=>modeFrom(["--apply","--confirm=volunserve-3aa5b"]),/Unknown flag/);
 assert.throws(()=>modeFrom(["--apply","--inspect"]),/Choose only one/);
 assert.equal(modeFrom(["--apply","--confirm="+STAGING_PROJECT]),"--apply");
});
test("production or cross-project credentials rejected without any Firebase requests",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"vs-stage-fixture-"));
 try{
   for(const project of ["volunserve-3aa5b","another-project",STAGING_PROJECT]){
     const file=path.join(dir,project+".json");
     fs.writeFileSync(file,JSON.stringify({
       type:"service_account",project_id:project,
       client_email:"qa@"+project+".iam.gserviceaccount.com",
       private_key:"-----BEGIN PRIVATE KEY-----\nFAKE QA ONLY"
     }));
     if(project===STAGING_PROJECT)
       assert.equal(readStagingCredential(file).project_id,STAGING_PROJECT);
     else
       assert.throws(()=>readStagingCredential(file),/NOT for the isolated/);
   }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
