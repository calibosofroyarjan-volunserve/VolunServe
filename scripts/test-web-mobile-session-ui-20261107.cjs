"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const read = file => fs.readFileSync(file,"utf8");
const compile = (path) => {
  const javascript = ts.transpileModule(read(path), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const mod = {exports:{}};
  new Function("module","exports",javascript)(mod,mod.exports);
  return mod.exports;
};
const issue = compile("lib/profileRecovery.ts");
assert.equal(issue.profileReadIssue(new Error("Profile not found.")), "missing");
assert.equal(issue.profileReadIssue({code:"firestore/not-found"}), "missing");
assert.equal(issue.profileReadIssue({code:"unavailable"}), "unavailable");
assert.equal(issue.profileReadIssue({code:"deadline-exceeded"}), "unavailable");
assert.equal(issue.profileReadIssue({code:"permission-denied"}), "unavailable");
assert.match(issue.profileRecoveryMessage("unavailable"),/session has not been signed out/);

const root=read("app/_layout.tsx");
assert(root.includes("setGuardFailure(profileRecoveryMessage(issue))"),"Root must block rather than sign out on a failed profile read");
assert(root.includes("profileReadIssue(error)") && root.includes("if (issue === \"missing\" && canCompleteSignup)"),"Missing account keeps signup continuation");
const segment=root.slice(root.indexOf("const issue = profileReadIssue(error)"),root.indexOf("} finally {",root.indexOf("const issue = profileReadIssue(error)")));
assert(!segment.includes("logoutUser()"),"Profile lookup catch may not sign out automatically");
assert(root.includes("accessibilityLabel=\"Retry verifying account\"") &&
  root.includes("onPress={() => setGuardFailure(null)}"),"Account recovery must have user-controlled retry");
assert(root.includes('if (!isApprovedProfile(profile))') &&
  root.includes('if (communityAccount && usesPassword && !authUser.emailVerified)'),
  "Real unauthorized/unchecked accounts must continue to be blocked");

const session=read("lib/useUserSession.ts");
assert(session.includes("profileListenerVersion !== version") &&
  session.includes("current.user?.uid === user.uid ? current.profile : null"),
  "Ignore outdated listeners and never use another account's profile");
assert(session.includes("if (!user)") && session.includes("unsubscribeAuth()"),
  "Preserve real logout handling and cleanup");

const admin=read("app/(admin)/_layout.tsx");
const superAdmin=read("app/(superadmin)/_layout.tsx");
const home=read("components/home/Home.web.tsx");
const tabs=read("app/(tabs)/_layout.tsx");
for(const [label,source] of [["admin",admin],["superadmin",superAdmin],["resident Home",home]]) {
  assert(source.includes("await AppAlert.confirm("), label+" must confirm before logout");
  assert(source.includes("logoutPromptOpen.current"), label+" must block duplicate logout prompts");
  assert(source.indexOf("await AppAlert.confirm(") < source.indexOf("await logoutUser();"),
    label+" cannot sign out before confirmation");
}
assert(tabs.includes('AppAlert.alert("Log Out"') &&
  tabs.includes("residentLogoutPromptOpen") && tabs.includes("cancelable: false"),
  "Resident web/mobile account confirmation must be explicit and single-instance");

const hero=read("components/admin/AdminReviewHero.tsx");
const web=read("app/(tabs)/volunteer.web.tsx");
const native=read("app/(tabs)/volunteer.tsx");
const card=read("components/ui/VolunServeCard.tsx");
const type=read("components/ui/VolunServeText.tsx");
for(const [label,source] of [["Admin",hero],["Volunteer web",web],["Volunteer mobile",native]]) {
  assert(source.includes('VolunServeText'),label+" must use a shared typography component");
}
assert(card.includes("ui.radius.card") && card.includes("ui.color.border"));
assert(type.includes("ui.typography[role]"));
assert(home.includes("borderRadius: ui.radius.card") && home.includes("borderColor: ui.color.border"));
assert(web.includes("borderRadius: ui.radius.card") && native.includes("borderRadius: ui.radius.card"));
assert(tabs.includes('label:"Emergency Tasks",icon:"hand-left-outline"'));
assert(admin.includes('label: "Emergency Reports", icon: "alert-circle-outline"') &&
  admin.includes('label: "Community Events", icon: "calendar-outline"'));
assert(web.includes("runTransaction(") && native.includes("runTransaction("),"Volunteer assignment state actions must remain present");
assert(home.includes('router.push("/notifications")') && home.includes('router.push("/profile?tab=progress")'),
  "Do not break Home web notifications or profile actions");
console.log("PASS: logout confirmation, transient account recovery, same-user session guards, responsive VolunServe UI");
