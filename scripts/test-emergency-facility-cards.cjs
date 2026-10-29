"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const places=read("lib/sjdmPublicMapPlaces.ts");
const web=read("components/tabs/MapTracking.web.tsx");
test("public place markers have meaningful actual location sources",()=>{
  assert.match(places,/Dulong Bayan Barangay Hall/);
  assert.match(places,/New Government Center/);
  assert.match(places,/mapcarta\.com\/29271770/);
  assert.match(places,/photoStatus: "unavailable"/);
});
test("facility popup shows verified address and safe photo fallback",()=>{
  assert.match(web,/item\.address/);
  assert.match(web,/item\.photoUrl/);
  assert.match(web,/Building photo not yet confirmed/);
  assert.match(web,/photo\.onerror/);
  assert.match(web,/photo\.loading = "lazy"/);
});
test("map route and readable source details preserved",()=>{
  assert.match(web,/showFacilityRoute\(Number\(item\.latitude\)/);
  assert.match(web,/Official information/);
  assert.match(web,/Location source/);
  assert.match(web,/overflow-y: auto/);
});
