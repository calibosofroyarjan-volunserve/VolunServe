const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const sa = read("app/(superadmin)/_layout.tsx");
const lgu = read("app/(admin)/_layout.tsx");
const accounts = read("app/(superadmin)/admin-accounts.tsx");
const rules = read("firestore.rules");
const guide = read("docs/final-admin-navigation-and-workflows.md");
const firstBetween = (text, from, to) => {
  const a = text.indexOf(from), b = text.indexOf(to,a+from.length);
  assert(a>=0 && b>a, "Missing navigation boundary");
  return text.slice(a,b);
};
const saItems = firstBetween(sa, "const navItems: NavItem[] = [", "export default function SuperAdminLayout");
const expectedSa = [
  ["System Overview","/(superadmin)"],
  ["Admin Accounts","/(superadmin)/admin-accounts"],
  ["Admin Activity & Audit Logs","/(superadmin)/admin-logs"],
  ["System Records (Read Only)","/(superadmin)/all-records"],
];
for(let i=0;i<expectedSa.length;i++){
  const [label,route]=expectedSa[i];
  assert(saItems.includes('label: "'+label+'"') && saItems.includes('route: "'+route+'"'),
    "Missing final programmer module "+label);
  if(i>0)assert(saItems.indexOf('label: "'+expectedSa[i-1][0]+'"') <
    saItems.indexOf('label: "'+label+'"'),"Incorrect Super Admin menu sequence");
}
assert(!saItems.includes('label: "System Settings"') &&
  sa.includes('accessibilityLabel="Super Admin profile dropdown"') &&
  sa.includes('router.push("/(superadmin)/system-settings"'),
  "System Settings must be accessible through the profile dropdown and not duplicated in sidebar");
const adminItems = firstBetween(lgu, "const NAV_ITEMS: NavItem[] = [", "type NavSectionId");
const sectionItems = firstBetween(lgu, "const NAV_SECTIONS:", "const navActive");
const expectedGroups = [
  {title:"People & Verification",items:["Resident Identity Reviews","LGU Operations"]},
  {title:"Emergency & Assistance",items:["Emergency Reports","Assistance Requests","Relief Operations"]},
  {title:"Events & Volunteering",items:["Community Events","Event Attendance","Certificates"]},
  {title:"Donations & Funds",items:["Donation Management"]},
  {title:"Communication & Reports",items:["Announcements","Disputes"]},
];
const adminLabels = ["Command Center",...expectedGroups.flatMap(group=>group.items)];
for (let i=0;i<adminLabels.length;i++){
  const label = adminLabels[i];
  assert(adminItems.includes('label: "'+label+'"'),"Missing admin route: "+label);
  assert(adminItems.split('label: "'+label+'"').length===2,"Duplicate Admin route label: "+label);
  if (i>0)assert(adminItems.indexOf('label: "'+adminLabels[i-1]+'"') <
    adminItems.indexOf('label: "'+label+'"'),"Wrong LGU page order: "+label);
}
for(let i=0;i<expectedGroups.length;i++){
  const {title,items}=expectedGroups[i];
  assert(sectionItems.includes('title: "'+title+'"'),"Missing ordered group "+title);
  for (const label of items) assert(sectionItems.includes('"'+label+'"'),"Wrong group child "+label);
  if(i>0)assert(sectionItems.indexOf('title: "'+expectedGroups[i-1].title+'"') <
    sectionItems.indexOf('title: "'+title+'"'),"Wrong group order");
}
assert(lgu.includes(')?.id ?? "none"') && lgu.includes(">Command Center</Text>"),
  "Command Center must open without unnecessary expanded sidebar groups");
assert(!accounts.includes("LGU STAFF VERIFICATION FLOW") &&
  !accounts.includes(">LGU Staff Applications</Text>") &&
  accounts.includes("credentialsConfirmed") &&
  accounts.includes("lguEmploymentConfirmed"),
  "Visible staff onboarding stays hidden, but independent verification safeguards remain in code");
assert(!accounts.includes('accessibilityLabel="Create independent LGU Admin account"') &&
  !accounts.includes('>Create LGU Admin</Text>') &&
  !accounts.includes('onPress={() => setShowAddAdmin(true)}'),
  "Remove old visible shortcuts bypassing the pending application queue");
assert(accounts.includes('actionTarget?.role === "applicant"') &&
  accounts.includes('actionTarget?.status === "pending_review"'),
  "Client must promote only pending LGU staff applicants");
assert(!rules.includes("allow create: if isSuperAdmin()\n        && request.resource.data.uid == uid\n        && request.resource.data.role == 'admin'") &&
  rules.includes("resource.data.role == 'applicant'\n            && resource.data.status == 'pending_review'"),
  "Server must deny direct Admin creation and Resident→Admin promotion");
assert(guide.includes("single") || guide.includes("Single"),"Missing documented source-of-truth");
console.log("PASS final administrative labels, section order, one applicant promotion path, locked server rules");
