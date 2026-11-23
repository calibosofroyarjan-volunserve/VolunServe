"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const page=fs.readFileSync(require("node:path").join(__dirname,"stagingAdminLogin.html"),"utf8");
test("staging defense UI clearly shows 1-click Admin validation -> automatic all-eligible invites",()=>{
  assert.match(page,/Validate 002 \+ AUTOMATICALLY invite all eligible Volunteers/);
  assert.match(page,/QUICK DEFENSE DEMO:/);
  assert.match(page,/No manual bulk-send click needed/);
});
test("Admin staging login never sends task directly via frontend validation",()=>{
  assert.match(page,/validate:"\/api\/admin\/emergency-auto\/e2e-002\/validate"/);
  assert.match(page,/result\.automaticOffers/);
  assert.match(page,/\(status==="reported"\|\|status==="ready"\)/);
  assert.match(page,/EXISTING FICTIONAL OFFERS PROTECTED/);
});
test("real production Firebase is not configured on the staging Admin demo page",()=>{
  assert.match(page,/volunserve-volunteer-staging/);
  assert.doesNotMatch(page,/volunserve-3aa5b/);
});
