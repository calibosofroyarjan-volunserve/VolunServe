"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const login=read("app/login.tsx"),web=read("app/login.web.tsx"),old=read("app/admin-login.tsx");
const apply=read("app/admin-request.tsx"),owner=read("app/(superadmin)/admin-accounts.tsx");
const rules=read("firestore.rules"),shell=read("components/auth/PremiumAuthShell.tsx");
const policy=read("lib/unifiedLoginRouting.ts");
assert(shell.includes("VolunServe Login") && !shell.includes("styles.switcher") &&
  login.includes("<PremiumAuthShell>") && web.includes("<PremiumAuthShell>"),
  "One clear Login must replace two login-role tabs");
assert(login.includes("unifiedPasswordDestination(profile)") && web.includes("unifiedPasswordDestination(profile)") &&
  policy.includes("isAdminProfile(profile)") && policy.includes("isSuperAdminProfile(profile)"),
  "Password sign-in must route only approved Admin and Super Admin accounts to their own dashboard");
assert(login.includes('profile.role === "admin" || profile.role === "superadmin"') &&
  web.includes('profile.role === "admin" || profile.role === "superadmin"'),
  "Google OAuth must remain community-only for staff");
assert(old.includes('<Redirect href="/login" />') && login.includes('router.push("/admin-request")'),
  "Old staff bookmarks redirect to one Login, and the LGU staff application remains accessible");
assert(apply.includes('role:"applicant",status:"pending_review"') &&
  apply.includes('residentAccess:false,volunteerAccess:false'),
  "LGU staff applicants must have no approved role at creation");
assert(owner.includes('role === "applicant" && account.status === "pending_review"') &&
  owner.includes('actionType === "promote"'),
  "Super Admin retains a pending queue and secure approval pathway");
assert(rules.includes("request.resource.data.role == 'applicant'") &&
  rules.includes("hasFreshLguCredentialReview()"),
  "Rules must continue to prohibit public privilege elevation");
assert(apply.includes("LGU Staff Verification Application") &&
  apply.includes("Submit LGU Information for Verification"),
  "Existing LGU staff form must remain unchanged");
assert(owner.includes("setIdentityMatched") &&
  owner.includes("setLguEmploymentConfirmed") &&
  owner.includes("credentialsConfirmed && identityMatched && lguEmploymentConfirmed") &&
  owner.includes('actionType === "promote" && !reviewComplete') &&
  owner.includes('return "Promote Verified Staff"'),
  "Admin promotion must require official staff credential verification");
assert(owner.includes("lguAdminCredentialReviews") &&
  owner.includes('reviewStatus: "verified"') &&
  owner.includes('role: "admin"'),
  "Admin elevation must record verified review evidence");
console.log("PASS single staff credential login, pending LGU applications and server-side role guards");
