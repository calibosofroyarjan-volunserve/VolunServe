"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"..");
const read = name => fs.readFileSync(path.join(root,name),"utf8");
test("Production app mounts branded dialog host",()=>{
 const screen=read("app/_layout.tsx");
 const host=read("components/ui/AppDialogHost.tsx");
 assert.match(screen,/<AppDialogHost\s*\/>/);
 assert.match(host,/<Modal\b/);
 assert.match(host,/subscribeAppDialog/);
});
test("Resident mobile and desktop logout use the same non-native confirmation",()=>{
 const s=read("app/(tabs)/_layout.tsx");
 assert.match(s,/function requestConfirmedResidentLogout\(\)/);
 assert.match(s,/AppAlert\.alert\("Log Out"/);
 assert.match(s,/onPress=\{requestConfirmedResidentLogout\}/);
 assert.match(s,/setMobileProfileOpen\(false\); requestConfirmedResidentLogout\(\)/);
 assert.doesNotMatch(s,/\bwindow\s*\.\s*(alert|confirm|prompt)\s*\(/);
 assert.doesNotMatch(s,/\bAlert\s*\.\s*alert\s*\(/);
 assert.doesNotMatch(s,/onPress=\{\(\)\s*=>\s*void\s+logoutUser\(\)\}/);
});
