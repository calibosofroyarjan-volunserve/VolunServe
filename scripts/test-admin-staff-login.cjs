const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const resident = read("app/login.tsx");
const admin = read("app/admin-login.tsx");
const apply = read("app/admin-request.tsx");
const owner = read("app/(superadmin)/admin-accounts.tsx");
const rules = read("firestore.rules");
const shell = read("components/auth/PremiumAuthShell.tsx");
assert(shell.includes("Resident Login") && shell.includes("LGU Admin Login") &&
  resident.includes('<PremiumAuthShell active="resident">') &&
  admin.includes('<PremiumAuthShell active="admin">'),
  "Both login entrypoints must share the Resident/LGU Admin tabs");
assert(resident.includes('profile.role === "admin" || profile.role === "superadmin"') &&
  resident.includes("await firebaseSignOut(auth)"),
  "Community login and Google OAuth must sign out privileged staff accounts");
assert(!admin.includes("GoogleAuthProvider") && !admin.includes("promptGoogleAsync") &&
  admin.includes("loginUser(cleanEmail, password)"),
  "LGU Admin login must use email/password only");
assert(admin.includes('router.push("/admin-request")'),
  "A separate LGU staff application must be linked to Admin Login");
assert(apply.includes('role:"applicant",status:"pending_review"') &&
  apply.includes('residentAccess:false,volunteerAccess:false'),
  "LGU applications must have no resident, volunteer or administrative permissions");
assert(owner.includes('role === "applicant" && account.status === "pending_review"') &&
  owner.includes('openAdminAction("promote",account)'),
  "Super Admin workspace must review pending applicants");
assert(rules.includes("request.resource.data.role == 'applicant'") &&
  rules.includes("hasFreshLguCredentialReview()"),
  "Rules must prohibit public creation of approved Admin role");
assert(admin.includes("Request Access from Super Admin") &&
  apply.includes("Request Access from Super Admin") &&
  apply.includes("Submit Request to Super Admin"),
  "LGU staff must clearly submit their access request to the programmer Super Admin team");
assert(apply.includes("does not grant Super Admin or LGU Admin privileges") &&
  apply.includes("independently collect and confirm supporting LGU credentials") &&
  owner.includes("These are requests for LGU Admin access, not Super Admin accounts."),
  "Applicant copy must distinguish LGU/Admin grant from Super Admin powers and require independent credential review");
console.log("PASS staff login tabs, email-only staff auth, pending LGU applications and verified Super Admin grant");
