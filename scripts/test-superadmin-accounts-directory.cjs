"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const load=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const page=load("app/(superadmin)/admin-accounts.tsx");
const layout=load("app/(superadmin)/_layout.tsx");
const overview=load("app/(superadmin)/index.tsx");

test("Admin Accounts page displays compact five-per-page Overview-style directory",()=>{
 assert.match(page,/Administrator Directory/);
 assert.match(page,/const ADMIN_PAGE_SIZE = 5/);
 assert.match(page,/pagedAdminAccounts\.map/);
 assert.match(page,/safeAdminPage/);
 assert.match(page,/dirColumns/);
 assert.match(page,/dirPaging/);
 assert.match(page,/Showing/);
 assert.match(page,/Manage/);
});
test("remove visible staff onboarding panels, without erasing backend records",()=>{
 assert.doesNotMatch(page,/LGU STAFF VERIFICATION FLOW/);
 assert.doesNotMatch(page,/>LGU Staff Applications</);
 assert.doesNotMatch(page,/\<LguStaffPrivacyRequestsPanel\s*\/\>/);
 assert.match(page,/onSnapshot/);
 assert.match(page,/writeBatch/);
});
test("keep confirmation, authorization and auditable actions",()=>{
 for (const keyword of ["isSuperAdmin","confirmAdminAction","openAdminAction","suspend","activate","revoke","adminLogs"]) {
  assert.ok(page.includes(keyword),keyword);
 }
 assert.match(page,/setExpandedAdminId/);
 assert.match(page,/actionType === "promote"/);
});
test("super admin sidebar and Overview use consistent professional Admin Accounts label",()=>{
 assert.match(layout,/label: "Admin Accounts"/);
 assert.match(overview,/Manage Admin Accounts/);
 assert.doesNotMatch(layout,/LGU Staff & Admin Accounts/);
});
