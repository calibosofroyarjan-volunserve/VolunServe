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
  assert.equal((s.match(/<ListPagination page=/g) || []).length,2);
  assert.match(s,/page=\{safeAdminPage\} total=\{adminAccounts\.length\}/);
  assert.match(s,/page=\{safeApplicantPage\} total=\{pendingLguApplications\.length\}/);
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
  assert.match(screen,/rows=\{pagedAdminActions\}/);
  assert.match(screen,/rows=\{pagedSystemChanges\}/);
  assert.match(screen,/page=\{safeActivityPage\}/);
  assert.match(screen,/page=\{safeChangesPage\}/);
  assert.match(screen,/<ListPagination page=\{page\} total=\{total\} onChange=\{onPageChange\}/);
  assert.doesNotMatch(screen,/latestRecorded\.filter\(item => adminUids\.includes\(item\.actorUid\)\)\.slice\(0,5\)/);
});


test("Super Admin workflow avoids duplicate overview audit shortcuts and explains settings",()=>{
  const overview=read("app/(superadmin)/index.tsx");
  const settings=read("app/(superadmin)/system-settings.tsx");
  const sidebar=read("app/(superadmin)/_layout.tsx");
  assert.doesNotMatch(overview,/View Audit Logs<\/Text>/);
  assert.match(overview,/Recent LGU Admin Activity/);
  assert.match(overview,/System & Access Changes/);
  assert.match(overview,/View All/);
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


test("Reviewer-visible Super Admin analytics and pagination are never hidden on one-page queues",()=>{
  const overview=read("app/(superadmin)/index.tsx");
  const paging=read("components/ui/ListPagination.tsx");
  assert.match(overview,/orientation="vertical"/);
  assert.match(overview,/System Records by Service Area/);
  assert.match(overview,/shortLabel:/);
  assert.match(overview,/approvedPercentage/);
  assert.doesNotMatch(paging,/if \(total <= pageSize\) return null/);
  assert.match(paging,/Showing \{first\}–\{last\} of \{total\} records/);
  assert.match(paging,/Page \{safePage\} of \{pages\}/);
  assert.match(paging,/disabled=\{safePage <= 1\}/);
  assert.match(paging,/disabled=\{safePage >= pages\}/);
});


test("Minimal Super Admin design has one chart and numbered pagination",()=>{
 const overview=read("app/(superadmin)/index.tsx");
 const paging=read("components/ui/ListPagination.tsx");
 assert.equal((overview.match(/<WorkspaceBarChart/g)||[]).length,1);
 assert.ok(overview.includes('orientation="vertical"'));
 for(const name of ["Registered Accounts","Active LGU Admins","Pending LGU Applications","Suspended Admins"])
   assert.ok(overview.includes(name),name);
 assert.ok(overview.includes("rows={pagedAdminActions}"));
 assert.ok(overview.includes("rows={pagedSystemChanges}"));
 assert.ok(!overview.includes("styles.secondarySection"));
 assert.ok(paging.includes("visiblePages.map"));
 assert.ok(paging.includes("number === safePage"));
});


test("Resident web and mobile logout use the branded dialog, not browser confirmation",()=>{
 const screen=read("app/(tabs)/_layout.tsx");
 const host=read("app/_layout.tsx");
 const dialog=read("lib/appDialog.ts");
 assert.match(screen,/onPress=\{requestConfirmedResidentLogout\}/);
 assert.match(screen,/function requestConfirmedResidentLogout\(\)/);
 assert.match(screen,/AppAlert\.alert\("Log Out", "Are you sure you want to log out of VolunServe\?"/);
 assert.doesNotMatch(screen,/onPress=\{\(\) => void logoutUser\(\)\}/);
 assert.ok(host.includes("<AppDialogHost />"));
 assert.match(dialog,/export const AppAlert =/);
 assert.match(dialog,/subscribeAppDialog/);
});


test("All application source avoids native browser and React Native popup calls (TypeScript AST)",()=>{
 const dirs=["app","components","lib","hooks","contexts"].filter(dir=>fs.existsSync(path.join(root,dir)));
 const violations=[];
 const forbidden=new Set(["alert","confirm","prompt"]);
 const member=(node,sf)=>{
   if(ts.isPropertyAccessExpression(node))
     return {owner:node.expression.getText(sf).replace(/\s+/g,""),method:node.name.text};
   if(ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression))
     return {owner:node.expression.getText(sf).replace(/\s+/g,""),method:node.argumentExpression.text};
   return null;
 };
 const walk=directory=>{
   for(const item of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){
     const relative=path.posix.join(directory,item.name);
     if(item.isDirectory()) {walk(relative);continue;}
     if(!/\.(?:tsx?|jsx?)$/.test(item.name)) continue;
     const sf=ts.createSourceFile(relative,read(relative),ts.ScriptTarget.Latest,true,
       /\.tsx$|\.jsx$/.test(relative)?ts.ScriptKind.TSX:ts.ScriptKind.TS);
     const nativeAliases=new Set(["Alert"]);
     const rnNamespaces=new Set();
     for(const statement of sf.statements){
       if(!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text!=="react-native")continue;
       const binding=statement.importClause?.namedBindings;
       if(binding && ts.isNamedImports(binding))
         for(const spec of binding.elements)
           if((spec.propertyName?.text || spec.name.text)==="Alert") nativeAliases.add(spec.name.text);
       if(binding && ts.isNamespaceImport(binding))rnNamespaces.add(binding.name.text);
     }
     const visit=node=>{
       if(ts.isCallExpression(node)){
         const expr=node.expression;
         let found=false;
         if(ts.isIdentifier(expr) && forbidden.has(expr.text))found=true;
         const prop=member(expr,sf);
         if(prop){
           const {owner,method}=prop;
           const globalOwner=["window","globalThis","self","global","globalThis.window","globalThis.self","globalThis.global"].includes(owner);
           const alertOwner=nativeAliases.has(owner)||owner==="globalThis.Alert"||
             [...rnNamespaces].some(ns=>owner===ns+".Alert");
           if((globalOwner && forbidden.has(method)) ||
              (alertOwner && (method==="alert"||method==="prompt"))) found=true;
         }
         if(found){
           const lc=sf.getLineAndCharacterOfPosition(node.getStart(sf));
           violations.push(relative+":"+(lc.line+1)+" "+node.getText(sf).slice(0,130));
         }
       }
       ts.forEachChild(node,visit);
     };
     visit(sf);
   }
 };
 dirs.forEach(walk);
 assert.deepEqual(violations,[],"Native dialog calls detected:\n"+violations.join("\n"));
});


test("Approved clean Super Admin visual hierarchy and five-per-page controls",()=>{
 const overview=read("app/(superadmin)/index.tsx");
 const shell=read("app/(superadmin)/_layout.tsx");
 const accounts=read("app/(superadmin)/admin-accounts.tsx");
 const records=read("app/(superadmin)/all-records.tsx");
 const audit=read("app/(superadmin)/admin-logs.tsx");
 const paging=read("components/ui/ListPagination.tsx");
 assert.ok(overview.includes("System Overview"));
 assert.ok(overview.includes("S Y S T E M   G O V E R N A N C E"));
 assert.ok(overview.includes("System Records by Service Area"));
 assert.equal((overview.match(/<OverviewAuditTable/g)||[]).length,2);
 assert.equal((overview.match(/<WorkspaceBarChart/g)||[]).length,1);
 assert.ok(overview.includes("const PAGE_SIZE = 5"));
 assert.ok(overview.includes("pagedAdminActions"));
 assert.ok(overview.includes("pagedSystemChanges"));
 assert.ok(shell.includes("confirmSignOut"));
 assert.ok(shell.includes('AppAlert.alert("Sign Out"'));
 assert.ok(shell.includes("LGU Staff & Admin Accounts"));
 assert.equal((accounts.match(/<ListPagination/g)||[]).length,2);
 assert.ok(records.includes("<ListPagination"));
 assert.ok(audit.includes("<ListPagination"));
 assert.ok(paging.includes("visiblePages.map"));
 assert.ok(!overview.includes("Monthly Revenue"));
});


test("Sir Pavia Edit Profile persists name to main profile without compulsory occupation",()=>{
  const profile=read("app/(tabs)/profile.tsx");
  const home=read("components/home/Home.web.tsx");
  const session=read("lib/useUserSession.ts");
  const auth=read("lib/firebaseAuth.ts");
  const rules=read("firestore.rules");
  assert.match(profile,/const \[occupationTouched, setOccupationTouched\] = useState\(false\)/);
  assert.match(profile,/const editingOccupation = occupationTouched/);
  assert.match(profile,/const editProfileRef = useRef\(edit === "1"\)/);
  assert.match(profile,/const hydrateEditableProfile = \(nextProfile: UserProfile\)/);
  assert.match(profile,/if \(!editProfileRef\.current \|\| !editDraftInitializedRef\.current\)/);
  assert.match(profile,/onPress=\{openProfileEditor\}/);
  assert.match(profile,/onRequestClose=\{closeProfileEditor\}/);

  assert.match(profile,/if \(editingOccupation && occupationCategory === "Other \(Specify\)"/);
  assert.match(profile,/setOccupationTouched\(true\);setOccupationCategory\(value==="Not specified"\?"":value\)/);
  assert.match(profile,/setOccupationTouched\(true\);setOccupationSpecialization\(value\)/);
  assert.match(profile,/setOccupationTouched\(true\);\s*setOccupationOther\(value\)/);
  assert.doesNotMatch(profile,/if \(!occupationCategory \|\| !OCCUPATION_OPTIONS\.includes\(occupationCategory\)\)/);
  assert.match(profile,/const changes: Partial<UserProfile> = \{/);
  for(const field of ["fullName: cleanName","firstName: first","middleName: middle","lastName: last"])
    assert.ok(profile.includes(field),field);
  assert.match(profile,/if \(editingOccupation\) \{\s*changes\.occupationCategory/);
  assert.match(profile,/await updateUserProfile\(user\.uid, changes\)/);
  assert.match(profile,/await updateProfile\(user, \{ displayName: cleanName \}\)/);
  assert.ok(home.indexOf("profile?.fullName?.trim() ||") < home.indexOf("    composedName ||"));
  assert.match(session,/onSnapshot\(\s*doc\(db, "users", user\.uid\)/);
  assert.match(auth,/await updateDoc\(\s*doc\(db, "users", uid\),\s*safeUpdates/);
  const ownerSection=rules.slice(rules.indexOf("match /users/{uid}"),rules.indexOf("match /",rules.indexOf("match /users/{uid}")+1));
  for(const name of ["'fullName'","'firstName'","'middleName'","'lastName'"])
    assert.ok(ownerSection.includes(name),name);
  assert.ok(ownerSection.includes("request.auth.uid == uid"));
});


test("Edit Profile checks are source-only and require no fake or disposable accounts",()=>{
  const profile=read("app/(tabs)/profile.tsx");
  const auth=read("lib/firebaseAuth.ts");
  const web=read("app/signup.web.tsx");
  const native=read("app/signup.tsx");
  const staff=read("app/admin-request.tsx");
  assert.doesNotMatch(profile,/createUserWithEmailAndPassword|signUpUser\(/);
  assert.match(profile,/await updateUserProfile\(user\.uid, changes\)/);
  assert.match(auth,/if \(isKnownDisposableEmail\(submittedEmail\)\)/);
  assert.match(web,/!isKnownDisposableEmail\(formData\.email\)/);
  assert.match(native,/!isKnownDisposableEmail\(formData\.email\)/);
  assert.match(staff,/if \(step === 0 && isKnownDisposableEmail\(form\.email\)\)/);
});

test("Final emerald Resident Edit Profile has visible vertical scrolling and official searchable dropdowns",()=>{
 const s=read("app/(tabs)/profile.tsx");
 assert.match(s,/import \{ SJDM_BARANGAYS \} from/);
 assert.match(s,/label="Barangay" value=\{barangay\}/);
 assert.match(s,/options=\{SJDM_BARANGAYS\} open=\{barangayOpen\} searchable/);
 assert.match(s,/if \(barangayTouched && !SJDM_BARANGAYS\.includes\(barangay\)\)/);
 assert.match(s,/if \(barangayTouched\) changes\.barangay = barangay/);
 assert.match(s,/options=\{\["Not specified",\.\.\.OCCUPATION_OPTIONS\]\}/);
 assert.match(s,/options=\{SPECIALIZATIONS\[occupationCategory\] \|\| \[\]\}/);
 assert.match(s,/showsVerticalScrollIndicator persistentScrollbar/);
 assert.match(s,/overflowY:"auto"/);
 assert.match(s,/function ProfileDropdown\(/);
 assert.match(s,/onSelect=\{value => \{setBarangay\(value\);setBarangayTouched\(true\);/);
 const modal=s.slice(s.indexOf('<Modal visible={editOpen}'),s.indexOf('</Modal>',s.indexOf('<Modal visible={editOpen}')));
 assert.ok(modal.indexOf('</ScrollView>')<modal.indexOf('<View style={styles.modalFooter}>'),"Footer must remain visible outside scrollable edit fields");
 for(const label of ['label="First Name"','label="Middle Name"','label="Last Name"','label="Phone Number"','label="Complete Address"'])
   assert.ok(modal.includes(label),label);
 assert.match(s,/backgroundColor:"#087C61"/);
 assert.match(s,/label="Barangay" value=\{profile\.barangay \|\| "Not provided"\}/);
});

test("System Settings and governance audit entry use one atomic Firestore batch", () => {
  const source = read("app/(superadmin)/system-settings.tsx");
  const rules = read("firestore.rules");
  assert.match(source, /const batch = writeBatch\(db\);/);
  assert.match(source, /batch\.set\(doc\(db, "systemSettings", "public"\)/);
  assert.match(source, /batch\.set\(doc\(collection\(db, "adminLogs"\)\)/);
  assert.match(source, /actionType: "system_settings_updated"/);
  assert.match(source, /createdAt: serverTimestamp\(\)/);
  assert.match(source, /await batch\.commit\(\);/);
  assert.doesNotMatch(source, /await (?:setDoc|createAdminLog)\(/);
  assert.match(rules, /match \/systemSettings\/\{settingId\}/);
  assert.match(rules, /match \/adminLogs\/\{logId\}/);
});

test("Uncommitted Super Admin settings are not erased by a Firestore settings refresh", () => {
  const source = read("app/(superadmin)/system-settings.tsx");
  assert.match(source, /const editingDraft = useRef\(false\)/);
  assert.match(source, /const trackEdit = \(setter: \(value: string\) => void\)/);
  assert.match(source, /editingDraft\.current = true;/);
  assert.match(source, /useEffect\(\(\) => \{\s*if \(editingDraft\.current\) return;/);
  for (const setter of [
    "setCityName", "setEmergencyHotline", "setSupportEmail",
    "setPublicServiceNotice", "setRetentionHours"
  ]) assert.ok(source.includes(`onChangeText={trackEdit(${setter})}`), setter);
  const commitIndex = source.indexOf("await batch.commit();");
  const clearIndex = source.indexOf("editingDraft.current = false;");
  assert.ok(commitIndex >= 0 && clearIndex > commitIndex,
    "Unsaved edit guard must clear only after a confirmed settings/audit batch commit");
});

test("Super Admin staff onboarding has responsive premium cards, searchable review queue and accessible approval modal", () => {
  const screen = read("app/(superadmin)/admin-accounts.tsx");
  assert.match(screen, /const compact = viewportWidth < 780;/);
  assert.match(screen, /styles\.headerCompact/);
  assert.match(screen, /styles\.accessFlowStepsCompact/);
  assert.match(screen, /styles\.applicationPanel/);
  assert.match(screen, /styles\.applicationRowCompact/);
  assert.match(screen, /styles\.reviewApplicationButtonCompact/);
  assert.match(screen, /pendingTotal = users\.filter/);
  assert.match(screen, /const \[applicationSearch, setApplicationSearch\] = useState\(""/);
  assert.match(screen, /setApplicantPage\(1\); \}, \[applicationSearch\]/);
  assert.match(screen, /accessibilityLabel="Search pending LGU staff applications"/);
  assert.match(screen, /page=\{safeApplicantPage\} total=\{pendingLguApplications\.length\}/);
  for (const step of ["Receive staff application", "Verify official LGU credentials", "Promote to Admin & record audit"]) {
    assert.ok(screen.includes(step), step);
  }
  assert.match(screen, /styles\.reviewScrollWide/);
  assert.match(screen, /persistentScrollbar/);
  assert.match(screen, /styles\.confirmActionsCompact/);
  assert.match(screen, /reviewComplete && styles\.reviewStatusReady/);
  assert.match(screen, /actionType === "promote" && !reviewComplete/);
  assert.match(screen, /credentialsConfirmed && identityMatched && lguEmploymentConfirmed && evidenceReady/);
  assert.match(screen, /inPersonIdentityConfirmed/);
  assert.match(screen, /batch\.set\(doc\(db, "lguAdminCredentialReviews", account\.id\)/);
  assert.match(screen, /await batch\.commit\(\)/);
  assert.doesNotMatch(screen, /onPress=\{\(\) => setShowAddAdmin\(true\)\}/);
});
