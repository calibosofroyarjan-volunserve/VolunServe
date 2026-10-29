"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const map=read("components/tabs/MapTracking.web.tsx");
const facilities=read("lib/sjdmPublicMapPlaces.ts");

test("three hospitals remain mapped with photos and sourced addresses",()=>{
  for(const name of ["Healthway QualiMed Hospital","Skyline Hospital and Medical Center","Grace Medical Center"]){
    assert.ok(facilities.includes(name),"Missing "+name);
  }
  assert.match(map,/facility-photo-frame/);
  assert.match(map,/facility-detail-panel/);
  assert.match(map,/facility-address/);
  assert.match(map,/function openFacilityDetails/);
});

test("all three hospital cards show in-app road route CTA regardless of map pin precision",()=>{
  assert.match(map,/item\.positionQuality === "osm_feature" \|\| item\.kind === "hospital"/);
  assert.match(map,/Show road route here/);
  assert.match(map,/Show road route to approximate pin/);
  assert.match(map,/showFacilityRoute\(Number\(item\.latitude\), Number\(item\.longitude\)/);
  assert.match(map,/closeFacilityDetails\(\);\s*showFacilityRoute/);
});

test("hospital directions never open external Google Maps links",()=>{
  assert.match(map,/item\.kind !== "hospital" && typeof item\.googlePlaceId/);
  assert.match(map,/item\.kind !== "hospital" && item\.positionQuality === "third_party_approximate"/);
  assert.match(map,/function showFacilityRoute/);
  assert.match(map,/router\.project-osrm\.org\/route\/v1\/driving/);
  assert.match(map,/facility-road-route/);
  assert.match(map,/map\.fitBounds\(bounds/);
});

test("approximate Grace pin warns about uncertain destination and only routes within city",()=>{
  assert.match(facilities,/name: "Grace Medical Center \(formerly Grace General Hospital\)"/);
  assert.match(facilities,/positionQuality: "third_party_approximate"/);
  assert.match(map,/NOT a confirmed emergency entrance/);
  assert.match(map,/routeInsideCity\(route\.geometry\.coordinates\)/);
  assert.match(map,/navigator\.geolocation\.getCurrentPosition/);
  assert.match(map,/tel:09326000119/);
});
