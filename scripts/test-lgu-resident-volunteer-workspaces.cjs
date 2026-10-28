// Source contract check. Also run Firebase emulator and browser acceptance;
// this does NOT replace end-to-end delivery or security tests.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const src = file => fs.readFileSync(path.join(root,file), "utf8");
const layout = src("app/(admin)/_layout.tsx");
const accounts = src("app/(admin)/account-approvals.tsx");
const inbox = src("components/admin/ScopedAdminInbox.tsx");
const functions = src("functions/index.js");
const overview = src("app/(admin)/command-center.tsx");
const tests = [
  ["Resident and Volunteer subworkspaces have unique routes", () => {
    const routes = [...layout.matchAll(/\{ label: "[^"]+", icon: "[^"]+", route: "([^"]+)" \}/g)].map(m=>m[1]);
    assert.equal(routes.length,new Set(routes).size);
    for (const route of ["residents","volunteers","identity-reviews",
      "resident-notifications","volunteer-notifications"]) assert.ok(routes.includes("/(admin)/"+route),route);
    for (const name of ["Residents Management","Volunteers Management"]) assert.ok(layout.includes(name));
    assert.ok(!layout.includes('label: "User & Volunteer Approvals"'));
  }],
  ["Community accounts and volunteer approvals share one account source", () => {
    assert.ok(accounts.includes('mode === "residents"'));
    assert.ok(accounts.includes('mode === "volunteers"'));
    assert.ok(accounts.includes("volunteerApplicationFor"));
    assert.ok(accounts.includes("PAGE_SIZE = 5"));
    assert.ok(accounts.includes("pagedAccounts.map"));
    assert.ok(src("app/(admin)/residents.tsx").includes('<AccountApprovals mode="residents"'));
    assert.ok(src("app/(admin)/volunteers.tsx").includes('<AccountApprovals mode="volunteers"'));
  }],
  ["Separate notifications are scoped by authenticated recipient", () => {
    assert.ok(inbox.includes('where("userId","==",user.uid)'));
    assert.ok(inbox.includes('where("recipientUid","==",user.uid)'));
    assert.ok(inbox.includes('profile?.role === "admin"'));
    assert.ok(inbox.includes("categoryForAdminNotification"));
    assert.ok(inbox.includes("markRead"));
    assert.ok(inbox.includes("updateDoc"));
    assert.ok(!inbox.includes('onSnapshot(collection(db,"notifications")'));
  }],
  ["Section-specific notifications have own destinations", () => {
    assert.ok(src("app/(admin)/resident-notifications.tsx").includes('scope="residents"'));
    assert.ok(src("app/(admin)/volunteer-notifications.tsx").includes('scope="volunteers"'));
    assert.ok(overview.includes('route:"/(admin)/residents"'));
    assert.ok(overview.includes('route:"/(admin)/volunteers"'));
  }],
  ["Trusted alerts carry no identity attachments and are retry safe", () => {
    for (const trigger of ["notifyLguOnVolunteerApplication","notifyLguOnResidentIdentityPending"]) assert.ok(functions.includes(trigger));
    assert.ok(functions.includes('database.runTransaction'));
    assert.ok(functions.includes('if (!existing.exists)'));
    assert.ok(functions.includes('admin_volunteer_application_pending'));
    assert.ok(functions.includes('admin_resident_identity_pending'));
    assert.ok(functions.includes('FieldValue.serverTimestamp()'));
  }]
];
let failures = 0;
for (const [label,fn] of tests) {
  try { fn(); console.log("PASS "+label); }
  catch(err) { failures++; console.error("FAIL "+label+": "+err.message); }
}
console.log("LGU scoped workspace contract: "+(tests.length-failures)+"/"+tests.length+" passed");
if (failures) process.exitCode=1;
