"use strict";
/**
 * Regression: an authenticated Resident must NEVER be signed out simply
 * because the application touched the public/Guest route during login.
 * The user-selected "Continue as Guest" action is the ONLY guest entry
 * allowed to invalidate a Firebase Auth session.
 *
 * Static AST + real source contract, no real credentials, Firebase or network.
 */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const publicLayout = fs.readFileSync("app/public/_layout.tsx", "utf8");
const login = fs.readFileSync("app/login.tsx", "utf8");
const rootLayout = fs.readFileSync("app/_layout.tsx", "utf8");
const landing = fs.readFileSync("app/public/index.tsx", "utf8");
const publicTree = ts.createSourceFile("app/public/_layout.tsx", publicLayout,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function collectCalls(node) {
  const calls=[];
  function visit(n) {
    if(ts.isCallExpression(n))calls.push(n.expression.getText(publicTree));
    ts.forEachChild(n,visit);
  }
  visit(node);
  return calls;
}

test("Guest layout never imports or invokes Firebase signOut",()=>{
  const calls=collectCalls(publicTree);
  assert.equal(calls.includes("signOut"),false);
  assert.equal(calls.includes("logoutUser"),false);
  assert.doesNotMatch(publicLayout,/\b(?:signOut|logoutUser|linkWithCredential|setDoc|updateDoc)\s*\(/);
  assert.doesNotMatch(publicLayout,/import\s*\{[^}]*\bsignOut\b/);
});

test("Signed-in entry to /public exits before displaying Guest, without changing session",()=>{
  const calls=collectCalls(publicTree);
  assert.ok(calls.includes("onAuthStateChanged"));
  assert.ok(calls.includes("router.replace"));
  assert.match(publicLayout,/if\s*\(user\)\s*\{[\s\S]*?setReady\(false\);[\s\S]*?router\.replace\("\/login"\)/);
  assert.match(publicLayout,/if\s*\(!ready\s*\|\|\s*auth\.currentUser\)/);
  assert.match(publicLayout,/return\s*<Stack screenOptions=\{\{headerShown:\s*false\}\}\s*\/>/);
});

test("Explicit Continue as Guest still signs out before entering public preview",()=>{
  assert.match(login,/firebaseSignOut\(auth\)\.then\(\(\) => router\.replace\("\/public"\)\)/);
  assert.match(landing,/GuestWorkspace/);
});

test("Root authority guard redirects approved signed-in accounts to their profile route",()=>{
  assert.match(rootLayout,/shouldLeaveGuestLanding\(/);
  assert.match(rootLayout,/approvedProfile:\s*isApprovedProfile\(profile\)/);
  assert.match(rootLayout,/router\.replace\(homeRouteForProfile\(profile\)/);
  assert.match(rootLayout,/if\s*\(isLoginRoute\s*\|\|/);
  assert.match(rootLayout,/router\.replace\(destination as any\)/);
});
