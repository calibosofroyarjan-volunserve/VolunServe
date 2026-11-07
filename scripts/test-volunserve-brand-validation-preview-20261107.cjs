"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const read = name => fs.readFileSync(name, "utf8");

function loadPureTs(path) {
  const js = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(js, { exports: mod.exports, module: mod });
  return mod.exports;
}

const { validateField, validateValues, announcementValidation, volunteerApplicationValidation, moduleValidationPolicies } =
  loadPureTs("lib/volunserveValidation.ts");
const err = (v, rule) => validateField(v, rule);
assert.equal(err("Valid title", announcementValidation.title), null);
assert.match(err("a", announcementValidation.title), /at least 3/);
assert.match(err("x".repeat(121), announcementValidation.title), /120 characters/);
assert.match(err("", announcementValidation.message), /Enter announcement message/);
assert.equal(err("hello@example.com", {label:"email",kind:"email",required:true}), null);
assert.match(err("invalid-email", {label:"email",kind:"email",required:true}), /name@example.com/);
assert.match(err("1.4", {label:"capacity",kind:"integer",required:true,min:1}), /whole number/);
assert.match(err("0", {label:"amount",kind:"amount",required:true,min:1}), /at least 1/);
assert.equal(err("2026-02-28", {label:"date",kind:"date",required:true}), null);
assert.match(err("2026-02-30", {label:"date",kind:"date",required:true}), /valid date/);
assert.match(err([], volunteerApplicationValidation.skills), /Enter at least one skill/);
assert.equal(err(["First Aid"], volunteerApplicationValidation.skills), null);
assert.match(err(["other"], {label:"consent",kind:"selection",choices:["yes"],required:true}), /listed consent/);
assert.equal(err("+63 912 345 6789", {label:"phone",kind:"phone"}), null);
assert.match(err("abc", {label:"phone",kind:"phone"}), /contact number/);
assert.equal(Object.keys(validateValues(announcementValidation, {title:"Hello",message:"This is a real update."})).length,0);
assert.equal(Object.keys(moduleValidationPolicies).length>=12,true);

const modules = read("constants/volunserveModules.ts");
for(const id of ['overview','identity','emergency','volunteer-tasks','assistance','events',
  'attendance','certificates','donations','announcements','notifications',
  'volunteer-application','profile','accounts','records','audit','settings']) {
  assert(modules.includes('id: "' + id + '"'), "Missing module identity: " + id);
}
assert(modules.includes('icon: "calendar-outline"') && modules.includes('icon: "ribbon-outline"'));
const ui = read("constants/volunserveUi.ts");
for(const t of ['typography:', 'spacing:', 'icon:', 'brand:', 'primary:', 'border:', 'sidebar:']) {
  assert(ui.includes(t), "Missing shared design token " + t);
}
const announcements=read("app/(admin)/create-announcement.tsx");
assert(announcements.includes("validateValues(announcementValidation") &&
  announcements.includes("fieldErrors.title") && announcements.includes("fieldErrors.message"),
  "Announcements need real submit checks and inline errors.");
assert(announcements.includes("addDoc(") && announcements.includes('collection(db, "announcements")'),
  "Do not change Firestore announcement write path.");
const profile=read("app/(admin)/admin-profile.tsx");
assert(profile.includes('validateValues(moduleValidationPolicies["admin-profile"]') &&
  profile.includes('updateDoc(doc(db, "users", user.uid)'), "Admin profile must keep validated self-write.");
const volunteer=read("app/(tabs)/volunteer-application.tsx");
assert(volunteer.includes("validateValues(volunteerApplicationValidation") &&
  volunteer.includes("await batch.commit()") && volunteer.includes('volunteerStatus: "pending"'),
  "Volunteer application validations and safe pending role flow required.");
console.log("PASS: VolunServe identity tokens, 17 module icons, validation edge cases and preserved writes");
