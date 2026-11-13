"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (path) => fs.readFileSync(path, "utf8");

const publicLayout = read("app/public/_layout.tsx");
const guest = read("components/guest/GuestWorkspace.tsx");
const root = read("app/_layout.tsx");
const loginWeb = read("app/login.web.tsx");
const loginNative = read("app/login.tsx");
const reg = read("lib/signupRegistration.ts");
const signup = read("lib/firebaseAuth.ts");
const ui = read("components/auth/EmailFirstSignup.tsx");
const rules = read("firestore.rules");
const staff = read("app/admin-request.tsx");

for (const [name, condition] of [
  ["LGU new applicant rejects disposable email before UID creation", staff.includes("getRegistrationEmailError(email)") && staff.indexOf("getRegistrationEmailError(email)") < staff.indexOf("createUserWithEmailAndPassword(candidateAuth")],
  ["Guest URL gates on Firebase Auth resolution", publicLayout.includes("onAuthStateChanged(auth")],
  ["Guest URL preserves inherited account session and routes back to login guard",
    !publicLayout.includes("void signOut(auth)") &&
    !publicLayout.includes("await signOut(auth)") &&
    publicLayout.includes('router.replace("/login")')],
  ["Guest URL shows preview only after confirmed signed-out state", publicLayout.includes("!ready || auth.currentUser")],
  ["Guest URL has no anonymous sign-in", !publicLayout.includes("signInAnonymously")],
  ["Guest URL has no profile creation", !publicLayout.includes("setDoc(")],
  ["Guest UI has no misleading 'Guest account menu'", !guest.includes('accessibilityLabel="Guest account menu"')],
  ["Guest UI says No Account", guest.includes("Guest Preview · No Account")],
  ["Guest account dropdown has no private profile actions", !guest.includes('["profile", "View Profile"]')],
  ["Web Guest button signs out before /public", loginWeb.includes('signOut(auth).then(() => router.replace("/public"))')],
  ["Native Guest button signs out before /public", loginNative.includes('firebaseSignOut(auth).then(() => router.replace("/public"))')],
  ["Protected routes require a profile", root.includes("if (!profile)")],
  ["Protected community account requires verified AND matching email", root.includes("!authUser.emailVerified || !communityEmailMatches")],
  ["Login rejects unverified email", signup.includes('if (!user.emailVerified) {')],
  ["Login checks profile presence", signup.includes('if (!profileSnapshot.exists()) {')],
  ["Email signup does not write user profiles at email step", !reg.includes("setDoc(") && !reg.includes("transaction.set(")],
  ["Basic Resident profile creation validates details", signup.includes("requireCompleteResidentRegistration(data)")],
  ["Email verified before profile creation", signup.includes("await getIdToken(user, true);")],
  ["Email signup creates only Basic Resident role", signup.includes('role: "resident" as Role')],
  ["Client does not auto-complete before Personal Details", ui.includes("setStep(user.emailVerified ? 3 : 2)")],
  ["Firestore denies unverified community reads", rules.includes("request.auth.token.get('email_verified', false) == true")],
  ["Firestore denies unverified Basic Resident creation", rules.includes('request.auth.token.get("email_verified", false) == true')],
  ["Firestore Basic Resident profile email must match token", rules.includes('request.auth.token.get("email", "") == request.resource.data.email')],
]) {
  assert.ok(condition, "FAIL: " + name);
  console.log("PASS: " + name);
}
console.log("PASS Guest isolation and verified-only signup route source contract");
