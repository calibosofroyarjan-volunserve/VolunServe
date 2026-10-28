"use strict";
const { test }=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("Edit Profile has SJDM-specific searchable dropdown and vertically scrollable modal",()=>{
 const profile=read("app/(tabs)/profile.tsx");
 const locations=read("constants/sjdmBarangays.ts");
 const jobs=read("constants/occupationOptions.ts");
 assert.match(profile,/function ProfileDropdown\(/);
 assert.match(profile,/label="Barangay" value=\{barangay\}/);
 assert.match(profile,/options=\{SJDM_BARANGAYS\} open=\{barangayOpen\} searchable/);
 assert.match(profile,/options=\{\["Not specified",\.\.\.OCCUPATION_OPTIONS\]\}/);
 assert.match(profile,/options=\{SPECIALIZATIONS\[occupationCategory\] \|\| \[\]\}/);
 assert.match(profile,/showsVerticalScrollIndicator persistentScrollbar/);
 assert.match(profile,/overflowY:"auto"/);
 assert.match(profile,/styles\.modalFooter/);
 assert.match(profile,/if \(barangayTouched\) changes\.barangay = barangay/);
 assert.match(locations,/export const SJDM_BARANGAYS/);
 assert.match(jobs,/export const OCCUPATION_OPTIONS/);
});
test("Profile names save to Firestore and Firebase Auth without requiring an occupation change",()=>{
 const profile=read("app/(tabs)/profile.tsx");
 assert.match(profile,/const editingOccupation = occupationTouched/);
 assert.match(profile,/if \(editingOccupation\) \{\s*changes\.occupationCategory/);
 assert.match(profile,/await updateUserProfile\(user\.uid, changes\)/);
 assert.match(profile,/await updateProfile\(user, \{ displayName: cleanName \}\)/);
 assert.match(profile,/fullName: cleanName/);
 assert.match(profile,/if \(!editProfileRef\.current \|\| !editDraftInitializedRef\.current\)/);
 assert.match(profile,/onPress=\{openProfileEditor\}/);
 assert.doesNotMatch(profile,/\bwindow\.(?:confirm|alert|prompt)\s*\(/);
 assert.doesNotMatch(profile,/(?<!App)Alert\.alert\s*\(/);
});


test("Resident Home header and account menu prefer saved Firestore fullName",()=>{
 const home=read("components/home/Home.web.tsx");
 const profile=read("app/(tabs)/profile.tsx");
 const session=read("lib/useUserSession.ts");
 assert.match(home,/const displayName =\s*profile\?\.fullName\?\.trim\(\) \|\|\s*composedName \|\|/);
 assert.match(home,/style=\{styles\.dropdownName\}>\{displayName\}/);
 assert.match(profile,/fullName: cleanName/);
 assert.match(profile,/await updateUserProfile\(user\.uid, changes\)/);
 assert.match(session,/onSnapshot\(/);
});
