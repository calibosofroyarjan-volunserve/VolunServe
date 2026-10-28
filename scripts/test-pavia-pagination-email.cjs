"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
function importPolicy() {
  const parsed = ts.transpileModule(read("lib/registrationEmailPolicy.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const domains = read("lib/disposableEmailDomains.generated.ts");
  const list = domains.match(/export const GENERATED_DISPOSABLE_EMAIL_DOMAINS = `([\s\S]*?)`\.trim\(\)\.split\("\\n"\);/);
  assert.ok(list, "generated offline domain list must be valid");
  const generated = list[1].trim().split("\n");
  const module = {exports:{}};
  new Function("module","exports","require",parsed)(
    module,module.exports,(name)=>{
      if(name === "./disposableEmailDomains.generated")
        return {GENERATED_DISPOSABLE_EMAIL_DOMAINS:generated};
      throw Error("Unexpected dependency: "+name);
    });
  return {isDisposable:module.exports.isKnownDisposableEmail,domains:generated};
}
test("Public signup checks a maintained set of known disposable email domains and nested subdomains",()=>{
  const {isDisposable,domains}=importPolicy();
  assert.ok(domains.length >= 30000,"Blocklist regressed below 30,000 known domains");
  for(const addr of ["user@mailinator.com","USER@YOPMAIL.COM","person@sub.mailinator.com","test@10minutemail.com","user@guerrillamail.com","x@tempmail.com"])
    assert.equal(isDisposable(addr),true,addr);
  for(const addr of ["person@gmail.com","student@outlook.com","teacher@education.gov.ph","name@agency.gov.ph"])
    assert.equal(isDisposable(addr),false,addr);
});
test("All account creation entry points enforce disposable email policy BEFORE Firebase Auth creation",()=>{
  const auth=read("lib/firebaseAuth.ts");
  const admin=read("lib/adminAccounts.ts");
  const staff=read("app/admin-request.tsx");
  const policy=read("lib/lguStaffApplicationPolicy.ts");
  assert.match(auth,/if \(isKnownDisposableEmail\(submittedEmail\)\)/);
  assert.ok(auth.indexOf("if (isKnownDisposableEmail(submittedEmail))") < auth.indexOf("await createUserWithEmailAndPassword("));
  assert.match(admin,/if \(isKnownDisposableEmail\(email\)\)/);
  assert.ok(admin.indexOf("if (isKnownDisposableEmail(email))") < admin.indexOf("await createUserWithEmailAndPassword("));
  assert.match(policy,/!isKnownDisposableEmail\(form\.email\)/);
  assert.match(staff,/if \(isKnownDisposableEmail\(form\.email\)\)/);
  assert.ok(staff.indexOf("if (isKnownDisposableEmail(form.email))") < staff.indexOf("await createUserWithEmailAndPassword("));
});
test("Super Admin Admin accounts and LGU applicant review remain five per page",()=>{
  const s=read("app/(superadmin)/admin-accounts.tsx");
  assert.match(s,/ADMIN_PAGE_SIZE = 5/);
  assert.match(s,/pagedAdminAccounts = adminAccounts\.slice/);
  assert.match(s,/pagedLguApplications = pendingLguApplications\.slice/);
  assert.match(s,/Previous Admin accounts page/);
  assert.match(s,/Next LGU applicant page/);
});
test("LGU resident directory, volunteer approvals, Identity Reviews and Events show five items per page",()=>{
  const a=read("app/(admin)/account-approvals.tsx");
  assert.match(a,/PAGE_SIZE = 5/);
  assert.match(a,/pagedAccounts = matchingAccounts\.slice/);
  for(const file of ["app/(admin)/identity-reviews.tsx","app/(admin)/community-events.tsx"]){
    const s=read(file);
    assert.match(s,/PAGE_SIZE = 5/,file);
    assert.match(s,/<ListPagination/,file);
    assert.match(s,/\.slice\(\(activePage - 1\) \* PAGE_SIZE, activePage \* PAGE_SIZE\)/,file);
  }
});

test("Super Admin read-only records and audit feed use five-row pagination and reset search",()=>{
  const records=read("app/(superadmin)/all-records.tsx");
  const audit=read("app/(superadmin)/admin-logs.tsx");
  for(const [label,source] of [["System Records",records],["Audit Logs",audit]]){
    assert.match(source,/PAGE_SIZE = 5/,label);
    assert.match(source,/<ListPagination page=\{activePage\} total=/,label);
    assert.match(source,/setPage\(1\)/,label);
    assert.match(source,/\.slice\(\(activePage - 1\) \* PAGE_SIZE, activePage \* PAGE_SIZE\)/,label);
  }
  assert.match(records,/pagedRecords\.map\(/);
  assert.match(audit,/pagedLogs\.map\(/);
  assert.doesNotMatch(records,/visibleRecords\.map\(\s*renderRecord/);
  assert.doesNotMatch(audit,/\{visible\.map\(\(item\)/);
});
