"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const cp=require("node:child_process");
const ts=require("typescript");
const base="1a9e206bdfea2167b205ce6eec168757323a8e9f";

const locked=[
 "lib/registrationEmailPolicy.ts",
 "lib/disposableEmailDomains.generated.ts",
 "lib/emailFirstSignupAuth.ts",
 "lib/signupRegistration.ts",
 "lib/signupFeature.ts",
 "components/auth/EmailFirstSignup.tsx",
 "app/signup.web.tsx",
 "app/signup.tsx",
 "lib/loginInputValidation.ts",
 "functions/index.js",
 "firestore.rules",
 "storage.rules"
];
for(const p of locked){
 const now=cp.execFileSync("git",["hash-object",p],{encoding:"utf8"}).trim();
 const prior=cp.execFileSync("git",["rev-parse",base+":"+p],{encoding:"utf8"}).trim();
 assert.equal(now,prior,"BLOCKED: existing signup, disposable-email or security source changed: "+p);
}
console.log("PASS preserved signup policy, temp-domain dataset, form, validation and backend verbatim");

const generatedSource=fs.readFileSync("lib/disposableEmailDomains.generated.ts","utf8");
const backtick=String.fromCharCode(96);
const start=generatedSource.indexOf(backtick);
const end=generatedSource.lastIndexOf(backtick);
assert(start>0 && end>start);
const generated=generatedSource.slice(start+1,end).trim().split("\n");
assert(generated.length>20000,"Disposable-domain dataset unexpectedly truncated");
const source=fs.readFileSync("lib/registrationEmailPolicy.ts","utf8");
const js=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const moduleBox={exports:{}};
new Function("module","exports","require",js)(moduleBox,moduleBox.exports,name=>{
 assert.equal(name,"./disposableEmailDomains.generated");
 return {GENERATED_DISPOSABLE_EMAIL_DOMAINS:generated};
});
const policy=moduleBox.exports;
const allowed=["anordinaryexample2026@gmail.com","anordinaryexample2026@yahoo.com"];
for(const email of allowed)
 assert.equal(policy.getRegistrationEmailError(email),null,email+" should be eligible for new registration");
const blocked=[
 "name@gmail.co","name@yahoo.co","name@legitimatebusiness.co",
 "name@business.com","name@outlook.com","name@mailticking.com",
 "name@en2ch.co","name@ruutukf.co","name@mailinator.com",
 "les.terbigs.antos@gmail.com","l.est.erb.igs.ant.os@gmail.com",
 "name+alias@gmail.com","name@gmail.com.example.com"
];
for(const email of blocked)
 assert.notEqual(policy.getRegistrationEmailError(email),null,
   "BLOCKED: forbidden new-signup address unexpectedly accepted: "+email);
assert(policy.isKnownDisposableEmail("name@mailticking.com"));
assert(policy.isKnownDisposableEmail("name@ruutukf.co"));
assert(!policy.isKnownDisposableEmail("name@legitimatebusiness.co"),
 "Valid .co must be rejected by signup allowlist, not falsely called disposable");
console.log("PASS signup allows exact Gmail/Yahoo; blocks all .co, known temp mail and dotted test Gmail aliases");

const loginSource=fs.readFileSync("lib/loginInputValidation.ts","utf8");
const loginJs=ts.transpileModule(loginSource,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const loginBox={exports:{}};
new Function("module","exports",loginJs)(loginBox,loginBox.exports);
assert.equal(loginBox.exports.getLoginEmailError("existing@business.co"),null);
assert.equal(loginBox.exports.getLoginEmailError("existing@outlook.com"),null);
console.log("PASS legacy login accepts valid domains; login remains separate from new signup rules");

const auth=fs.readFileSync("lib/firebaseAuth.ts","utf8");
assert(auth.includes("const emailError = getRegistrationEmailError(submittedEmail);"));
assert(auth.includes("if (emailError) throw new Error(emailError);"));
assert(auth.includes("if (!user.emailVerified)"));
assert(auth.includes("await signOut(auth);"));
const web=fs.readFileSync("app/login.web.tsx","utf8");
assert(web.includes("resumeIncompleteSignup: true"));
assert(web.includes("getLoginEmailError(email)"));
console.log("PASS authentication still enforces email verification and registration-email policy");
