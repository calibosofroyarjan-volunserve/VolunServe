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
assert(shell.includes("Resident & Volunteer Login") && shell.includes("LGU & System") &&
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
assert(admin.includes("Request LGU Admin Access") &&
  apply.includes("Request LGU Admin Access") &&
  apply.includes("Submit for independent review"),
  "LGU staff access requests must display the LGU-only access request and route to the staff verification form");
assert(admin.includes("until independently verified and approved by Super Admin") &&
  apply.includes("role:\"applicant\",status:\"pending_review\"") &&
  apply.includes("before making a decision") &&
  owner.includes("LGU Staff Applications") &&
  owner.includes("LguApplicantEvidencePanel") && owner.includes("evidenceReady"),
  "Unverified submissions remain pending and visible to programmer Super Admins");
assert(owner.includes("setIdentityMatched") &&
  owner.includes("setLguEmploymentConfirmed") &&
  owner.includes("credentialsConfirmed && identityMatched && lguEmploymentConfirmed") &&
  owner.includes('actionType === "promote" && !reviewComplete') &&
  owner.includes('return "Promote Verified Staff"'),
  "Admin promotion must be disabled until independent identity and LGU employment checks pass");
assert(owner.includes("lguAdminCredentialReviews") &&
  owner.includes('reviewStatus: "verified"') &&
  owner.includes('role: "admin"'),
  "Verification result and role promotion must be captured before operational Admin access");
const auth = read("lib/firebaseAuth.ts");
const root = read("app/_layout.tsx");
assert(apply.includes("emailVerificationRequired:true") &&
  rules.includes("request.resource.data.emailVerificationRequired == true") &&
  auth.includes('profile.emailVerificationRequired === true') &&
  auth.includes('await getIdToken(user, true)'),
  "Every new LGU applicant must verify email ownership before Admin login and server role access");
assert(auth.includes('profile.role === "admin" && profile.adminStatus === "suspended"') &&
  auth.includes('Your administrative access is suspended') &&
  root.includes("!isApprovedProfile(profile)"),
  "Suspended LGU Admin accounts must be blocked both at login and on restored sessions");
console.log("PASS staff login tabs, email-only staff auth, pending LGU applications and verified Super Admin grant");
