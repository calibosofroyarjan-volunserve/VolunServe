"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const {
  getProfileRole,
  isApprovedAccount,
  isOperationalAdminProfile,
  isAdminOrSuperAdminProfile,
} = require("../backend/adminAccess");

test("canonical role ignores stale primaryRole, activeMode and requestedRole", () => {
  const admin = { role: "admin", primaryRole: "resident", activeMode: "resident", status: "approved" };
  assert.equal(getProfileRole(admin), "admin");
  assert.equal(isOperationalAdminProfile(admin), true);
  assert.equal(isAdminOrSuperAdminProfile(admin), true);
  const user = { role: "resident", primaryRole: "admin", requestedRole: "admin", status: "approved" };
  assert.equal(isOperationalAdminProfile(user), false);
  assert.equal(isAdminOrSuperAdminProfile(user), false);
});

test("provisioned legacy admin without status matches existing Firestore rules", () => {
  assert.equal(isOperationalAdminProfile({role: "admin"}), true);
  assert.equal(isOperationalAdminProfile({role: "admin", primaryRole: "resident"}), true);
  assert.equal(isAdminOrSuperAdminProfile({role: "superadmin"}), true);
  assert.equal(isApprovedAccount({role: "resident"}), false);
  assert.equal(isOperationalAdminProfile({role: "admin", status: null}), false);
});

test("never authorize unapproved, disabled or suspended admins", () => {
  for (const status of ["pending", "rejected", "suspended", "inactive", ""]) {
    assert.equal(isOperationalAdminProfile({role:"admin",status}), false, status);
    assert.equal(isAdminOrSuperAdminProfile({role:"admin",status}), false, status);
  }
  for (const status of ["suspended", "SUSPENDED"]) {
    assert.equal(isOperationalAdminProfile({role:"admin",status:"approved",adminStatus:status}),false);
    assert.equal(isAdminOrSuperAdminProfile({role:"admin",status:"approved",adminStatus:status}),false);
  }
  assert.equal(isOperationalAdminProfile({role:"superadmin",status:"approved"}),false);
  assert.equal(isAdminOrSuperAdminProfile({role:"superadmin",status:"approved"}),true);
  assert.equal(isAdminOrSuperAdminProfile({role:"applicant",status:"approved"}),false);
});

test("backend routes delegate both LGU panels to one consistent canonical authorization", () => {
  const server = fs.readFileSync("backend/server.js", "utf8");
  assert.ok(server.includes('require("./adminAccess")'));
  for (const route of [
    '"/api/admin/lgu/personnel"',
    '"/api/admin/lgu/test-personnel"',
    '"/api/admin/lgu/field-reports"',
  ]) assert.ok(server.includes(route),route);
  assert.ok(server.includes("requireAdminOrSuperAdmin"));
  assert.ok(server.includes("requireOperationalAdmin"));
  assert.ok(!server.includes("profile?.primaryRole ||"));
});

test("Volunteer assignment reads require ownership and approved access, not UI mode", () => {
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const assignment = rules.slice(rules.indexOf("match /responseAssignments/{assignmentId}"));
  const read = assignment.slice(assignment.indexOf("allow read:"),assignment.indexOf("allow create:"));
  assert.match(read,/hasVolunteerAccess\(\)/);
  assert.match(read,/resource\.data\.volunteerId == request\.auth\.uid/);
  assert.match(read,/hasResidentAccess\(\)/);
  assert.doesNotMatch(read,/isVolunteer\(\)/);
  assert.doesNotMatch(read,/allow read: if signedIn\(\)/);
});

test("Client denies suspended admin access and explains missing Volunteer permissions",()=>{
  const auth=fs.readFileSync("lib/firebaseAuth.ts","utf8");
  const volunteer=fs.readFileSync("app/(tabs)/volunteer.tsx","utf8");
  assert.match(auth,/profile\?\.adminStatus !== "suspended"/);
  assert.match(volunteer,/setAssignments\(\[\]\);[\s\S]*?setCasesById\(\{\}\);[\s\S]*?problem.code === "permission-denied"/);
});
