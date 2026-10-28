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

test("Server-side blocking policy is ready but not silently enabled on unsupported Firebase projects",()=>{
  const server=read("functions/registrationEmailBlocking.js");
  const functionsEntry=read("functions/index.js");
  const domainList=JSON.parse(read("functions/disposable-email-domains.json"));
  const {isDisposableRegistrationEmail} = require("../functions/registrationEmailBlocking.js");
  const {isDisposable} = importPolicy();
  assert.ok(domainList.domains.length >= 50000);
  for(const addr of [
    "user@mailinator.com", "USER@YOPMAIL.COM",
    "person@sub.mailinator.com", "test@10minutemail.com",
    "user@guerrillamail.com", "a@gmail.com",
    "student@school.gov.ph", "name@outlook.com"
  ]) {
    assert.equal(isDisposableRegistrationEmail(addr),isDisposable(addr),addr);
  }
  assert.match(server,/beforeUserCreated/);
  assert.match(server,/invalid-argument/);
  // Safety gate: do not deploy a blocking Auth hook to a project that has not
  // confirmed the required Identity Platform upgrade and trigger configuration.
  assert.doesNotMatch(functionsEntry,/exports\.blockDisposableEmailBeforeCreate\s*=/);
});

test("LGU emergency and assistance queues paginate five records and reset on filters",()=>{
  const emergency=read("app/(admin)/admin-cases.tsx");
  const assistance=read("app/(admin)/assistance-requests.tsx");
  assert.match(emergency,/PAGE_SIZE = 5/);
  assert.match(emergency,/pagedCases = useMemo/);
  assert.match(emergency,/\{pagedCases\.map\(/);
  assert.match(emergency,/pagedCases\.find\(\(item\) => item\.id === selectedCaseId\)/);
  assert.match(emergency,/<ListPagination page=\{activeCasePage\} total=\{visibleCases\.length\}/);
  assert.match(emergency,/setCaseSearch\(value\); setCasePage\(1\)/);
  assert.match(emergency,/setFilterStatus\(status\); setCasePage\(1\)/);
  assert.match(emergency,/setFilterSeverity\(severity\); setCasePage\(1\)/);
  assert.match(assistance,/PAGE_SIZE = 5/);
  assert.match(assistance,/pagedRequests = filteredRequests\.slice/);
  assert.match(assistance,/pagedRequests\.map\(/);
  assert.match(assistance,/<ListPagination page=\{activeQueuePage\} total=\{filteredRequests\.length\}/);
  assert.match(assistance,/setSearch\(value\); setQueuePage\(1\)/);
  assert.match(assistance,/setFilter\("pending"\); setQueuePage\(1\)/);
});

test("Prepared Identity Platform hook blocks known domains without enabling a live trigger",()=>{
  const vm = require("node:vm");
  const raw = read("functions/registrationEmailBlocking.js");
  const fakeFunctions = {
    beforeUserCreated: (_options, handler) => handler,
    HttpsError: class TestHttpsError extends Error {
      constructor(code,message) { super(message); this.code=code; }
    },
  };
  const module = {exports:{}};
  const mockRequire = (name) => name === "firebase-functions/v2/identity"
    ? fakeFunctions
    : name === "./disposable-email-domains.json"
      ? JSON.parse(read("functions/disposable-email-domains.json"))
      : require(name);
  vm.runInNewContext(raw,{module,exports:module.exports,require:mockRequire,Set});
  const callback = module.exports.createBeforeCreateHook();
  for(const email of ["user@mailinator.com","person@nested.mailinator.com",
                       "person@yopmail.com","student@guerrillamail.com"]){
    assert.throws(()=>callback({data:{email}}),
      error=>error.code==="invalid-argument"&&/permanent email/.test(error.message),email);
  }
  assert.doesNotThrow(()=>callback({data:{email:"resident@gmail.com"}}));
  assert.doesNotThrow(()=>callback({data:{email:"staff@agency.gov.ph"}}));
  assert.doesNotThrow(()=>callback({data:{email:"custom@institution.edu.ph"}}));
  // Federated providers can supply an additional address in providerData.
  assert.throws(()=>callback({data:{email:"resident@gmail.com",providerData:[{providerId:"google.com",email:"user@sub.mailinator.com"}]}}),
    error=>error.code==="invalid-argument");
  assert.doesNotThrow(()=>callback({data:{email:"resident@gmail.com",providerData:[{providerId:"google.com",email:"resident@gmail.com"}]}}));
  assert.doesNotThrow(()=>callback({data:{email:"resident@gmail.com",providerData:null}}));
});


test("Super Admin overview uses independent five-item paging for real audit lists",()=>{
  const screen=read("app/(superadmin)/index.tsx");
  assert.match(screen,/const PAGE_SIZE = 5;/);
  assert.match(screen,/const \[adminActivityPage, setAdminActivityPage\] = useState\(1\)/);
  assert.match(screen,/const \[systemChangesPage, setSystemChangesPage\] = useState\(1\)/);
  assert.match(screen,/pagedAdminActions = adminActions\.slice/);
  assert.match(screen,/pagedSystemChanges = systemChanges\.slice/);
  assert.match(screen,/pagedAdminActions\.map\(/);
  assert.match(screen,/pagedSystemChanges\.map\(/);
  assert.match(screen,/<ListPagination page=\{safeActivityPage\} total=\{adminActions\.length\} onChange=\{setAdminActivityPage\}/);
  assert.match(screen,/<ListPagination page=\{safeChangesPage\} total=\{systemChanges\.length\} onChange=\{setSystemChangesPage\}/);
  assert.doesNotMatch(screen,/latestRecorded\.filter\(item => adminUids\.includes\(item\.actorUid\)\)\.slice\(0,5\)/);
});


test("Super Admin workflow avoids duplicate overview audit shortcuts and explains settings",()=>{
  const overview=read("app/(superadmin)/index.tsx");
  const settings=read("app/(superadmin)/system-settings.tsx");
  const sidebar=read("app/(superadmin)/_layout.tsx");
  assert.doesNotMatch(overview,/View Audit Logs<\/Text>/);
  assert.match(overview,/Review LGU Applications/);
  assert.match(overview,/approvedPercentage/);
  assert.match(overview,/<WorkspaceBarChart/);
  for(const label of ["System Overview","LGU Staff & Admin Accounts","System Records","Audit Logs","System Settings"])
    assert.ok(sidebar.includes(label),label);
  assert.match(settings,/Step 1 of 3/);
  assert.match(settings,/Step 2 of 3/);
  assert.match(settings,/Step 3 · Save System Settings/);
  assert.match(settings,/NOT a working automatic cleanup switch/);
  assert.match(settings,/Custom value — enter below/);
});
