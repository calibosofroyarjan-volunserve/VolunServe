"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync(__dirname+"/stagingAdminLogin.html","utf8");
const server=fs.readFileSync(__dirname+"/emergencyAutoDispatchStagingServer.js","utf8");
test("Admin page has exactly three synthetic email/password controls and only staging test route",()=>{
  for(let i=1;i<=3;i++){
    assert.ok(html.includes("staging002.qa.volunteer"+i+"@example.com"));
    assert.ok(html.includes('id="qa-secret-'+i+'"'));
  }
  assert.ok(html.includes("confirmFictionalTestUsers:true"));
  assert.ok(html.includes('/api/admin/emergency-auto/e2e-002/test-volunteers'));
  assert.ok(html.includes('qaEl("qa-create").disabled=true'));
});
test("Inline staging Admin module JavaScript parses without browser execution",()=>{
  const scripts=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  const js=scripts[0][1].replace(/^\s*import .*?;\s*$/gm,"");
  assert.doesNotThrow(()=>new Function(js));
});
test("both provisioning routes enforce Admin authentication, and POST requires activation",()=>{
  assert.match(server,/app\.get\("\/api\/admin\/emergency-auto\/e2e-002\/test-volunteers",\s*requireStagingAdmin/);
  assert.match(server,/app\.post\("\/api\/admin\/emergency-auto\/e2e-002\/test-volunteers",\s*requireStagingAdmin,requireActivation/);
  assert.match(server,/request\.body\?\.confirmFictionalTestUsers!==true/);
  assert.match(server,/stagingServiceAccountMatches/);
});
