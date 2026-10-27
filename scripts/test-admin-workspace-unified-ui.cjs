/** Static regression checks for the new LGU Admin presentation contract.
 * Browser/emulator permissions and real interactions require separate E2E tests.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
function source(p) { return fs.readFileSync(path.join(root,p), "utf8"); }
const ui = source("components/admin/AdminWorkspaceUI.tsx");
const analytics = source("app/(admin)/admin-analytics.tsx");
const events = source("app/(admin)/admin-events.tsx");
const approvals = source("app/(admin)/account-approvals.tsx");
const assistance = source("app/(admin)/assistance-requests.tsx");
const command = source("app/(admin)/command-center.tsx");
const layout = source("app/(admin)/_layout.tsx");

const checks = [
  ["Shared heading, metrics and empty state", () => {
    for (const n of ["AdminPageHeading","AdminMetricCard","AdminEmptyState","AdminSectionHeading"]) assert.match(ui,new RegExp("export function "+n));
  }],
  ["One operational Command Center, no analytics shortcuts", () => {
    assert.match(command,/Priority Actions/);
    assert.match(command,/Pending user profiles/);
    assert.doesNotMatch(analytics,/style=\{styles\.navRow\}/);
    assert.match(analytics,/Reporting & Insights/i);
    assert.match(analytics,/role === "admin"/);
  }],
  ["Analytics uses real subscribed records and reporting sections", () => {
    for (const v of ["onSnapshot(", "Emergency & Cases","Residents & Volunteer Applications", "Events & Attendance", "Certificates & Engagement", "Donation Reporting"]) assert.ok(analytics.includes(v),v);
  }],
  ["Volunteer Events retains functional actions with brand-consistent statuses", () => {
    for (const v of ["AdminPageHeading","onSnapshot(", "openCreate","openAttendance","quickStatusUpdate","setSearch", "AdminEmptyState"]) assert.ok(events.includes(v),v);
    assert.match(events,/chipActive:\s*\{\s*backgroundColor:\s*ADMIN_UI.emerald/);
  }],
  ["Resident/Volunteer approvals remain distinct from staff/identity verification", () => {
    for (const v of ["AdminPageHeading","isPendingVolunteerApplication","isVerifiedResidentAccount","reviewVolunteerApplication","moderateCommunityAccount","writeAdminLogSafely","PAGE_SIZE = 5","pagedAccounts.map","Search community accounts"]) assert.ok(approvals.includes(v),v);
    assert.match(approvals,/LGU staff promotion belongs to Super Admin/);
  }],
  ["Assistance Request review retains isolated operations and consistent palette", () => {
    assert.match(assistance,/AdminPageHeading/);
    assert.match(assistance,/Review non-emergency|individual Resident assistance/);
    for (const v of ["stats.pending","stats.underReview","filteredRequests","mockStatusTabActive"]) assert.ok(assistance.includes(v),v);
  }],
  ["Admin sidebar retains unique route destinations", () => {
    const routes = [...layout.matchAll(/\{ label: "[^"]+", icon: "[^"]+", route: "([^"]+)" \}/g)].map(m=>m[1]);
    assert.ok(routes.length >= 10, "expected grouped Admin routes");
    assert.equal(new Set(routes).size,routes.length,"duplicate Admin sidebar routes");
  }],
];

let fails=0;
for (const [name,test] of checks) {
  try {test();console.log("PASS "+name);}
  catch (e){fails++;console.error("FAIL "+name+": "+e.message);}
}
console.log("LGU Admin workspace UI contract: "+(checks.length-fails)+"/"+checks.length+" passed");
if (fails) process.exitCode=1;
