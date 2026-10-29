"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname,"..");
const read = p => fs.readFileSync(path.join(root,p),"utf8");
function loadTs(file, relativeRequire = {}) {
  const result=ts.transpileModule(read(file),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020
  }}).outputText;
  const mod={exports:{}};
  new Function("module","exports","require",result)(mod,mod.exports,
    name=> name in relativeRequire ? relativeRequire[name] : require(name));
  return mod.exports;
}
const reference=loadTs("constants/sjdmBoundaryReference.ts");
const city=loadTs("lib/sjdmMapBoundary.ts",{"../constants/sjdmBoundaryReference":reference});
const facilities=loadTs("lib/lguMapFacilities.ts");
const places=loadTs("lib/sjdmPublicMapPlaces.ts");
test("bundled 134-point SJDM polygon is sourced and excludes outside areas",async()=>{
  const boundary=await city.loadSjdmBoundary();
  assert.match(boundary.properties.source,/geoBoundaries/);
  assert.equal(city.insideSjdmBoundary(boundary,14.813,121.045),true);
  assert.equal(city.insideSjdmBoundary(boundary,14.813,121.20),false);
  assert.ok(city.sjdmOutsideMask(boundary).geometry.coordinates.length>=2);
});
test("mapped government/Barangay/CDRRMO reference icons are distinct from live dispatch",async()=>{
  const boundary=await city.loadSjdmBoundary();
  const pins=places.SJDM_PUBLIC_MAP_PLACE_PINS;
  assert.equal(pins.length,6);
  for(const item of pins){
    assert.equal(city.insideSjdmBoundary(boundary,item.latitude,item.longitude),true,item.name);
    assert.ok(places.SJDM_PUBLIC_PLACE_ICON[item.kind],item.kind);
    assert.ok(item.sourceUrl.startsWith("https://"));
  }
  const cdrrmo=pins.find(p=>p.kind==="cdrrmo");
  assert.equal(cdrrmo.positionQuality,"third_party_approximate");
  assert.match(cdrrmo.note,/NOT a live responder/);
});
test("unverified, inactive and out-of-area government facilities never publish as approved pins",()=>{
  const valid={name:"Synthetic City Office",address:"Test coordinate only",barangay:"Dulong Bayan",
    latitude:14.813,longitude:121.045,facilityType:"cdrrmo",
    status:"active",verificationStatus:"verified",verificationSource:"Synthetic fixture"};
  assert.equal(facilities.verifiedLguMapFacility("test",valid).id,"test");
  for(const fake of [{...valid,status:"inactive"},{...valid,verificationStatus:"pending"},
    {...valid,facilityType:"not_real"},{...valid,latitude:10}]){
    assert.equal(facilities.verifiedLguMapFacility("test",fake),null);
  }
});
test("active case map renders public reference buildings and does not suppress verified shelters",()=>{
  const map=read("components/tabs/MapTracking.web.tsx");
  assert.match(map,/payload.publicPlaces/);
  assert.match(map,/publicPlacePins\.map/);
  assert.match(map,/makeSourcedPlaceElement/);
  assert.match(map,/makeCenterElement/);
  assert.match(map,/const visibleCenters = useMemo/);
  assert.doesNotMatch(map,/if \(missionMode \|\| adminMissionMode \|\| !showCenters\)/);
  assert.match(map,/Show road route here/);
  assert.match(map,/routeStaysInSjdm/);
});

test("real hospitals use mapped buildings, named place IDs and publisher photo links",async()=>{
 const boundary=await city.loadSjdmBoundary();
 const sites=places.SJDM_PUBLIC_MAP_PLACE_PINS.filter(p=>p.kind==="hospital");
 assert.equal(sites.length,3);
 assert.equal(places.SJDM_PUBLIC_PLACE_ICON.hospital,"🏥");
 sites.forEach(p=>{
  assert.equal(city.insideSjdmBoundary(boundary,p.latitude,p.longitude),true,p.name);
  assert.ok(p.googlePlaceId.startsWith("ChIJ"));
  assert.ok(p.actualPhotoSourceUrl.startsWith("https://tanglawan.ph/"));
  assert.ok(p.officialInfoUrl.startsWith("https://"));
 });
 assert.equal(sites.find(p=>p.id==="hospital-grace-reference").positionQuality,"third_party_approximate");
 const source=read("components/tabs/MapTracking.web.tsx");
 assert.match(source,/Open named place in Google Maps/);
 assert.match(source,/Actual building photo/);
 assert.match(source,/id="facility-detail-panel"/);
 assert.match(source,/ER capacity is not live-verified/);
 assert.match(source,/if \(item.positionQuality === "osm_feature"\) appendInAppRouteButton/);
});

test("actual source images and official addresses render INSIDE a bounded, accessible map panel",()=>{
  const hospitals=places.SJDM_PUBLIC_MAP_PLACE_PINS.filter(item=>item.kind==="hospital");
  assert.equal(hospitals.length,3);
  for(const h of hospitals){
    assert.match(h.address,/San Jose del Monte/);
    assert.match(h.photoUrl,/^https:\/\/(tanglawan\.ph|cdn-healthcare\.hellohealthgroup\.com)\//);
    assert.ok(h.photoCredit);
  }
  const map=read("components/tabs/MapTracking.web.tsx");
  assert.match(map,/id="facility-detail-panel"/);
  assert.match(map,/max-height:calc\(100% - 75px\)/);
  assert.match(map,/image\.src = item\.photoUrl/);
  assert.match(map,/Official address: /);
  assert.match(map,/openFacilityDetails\(item\)/);
  assert.doesNotMatch(map,/setDOMContent\(makePublicPlacePopup\(item\)\)/);
  assert.match(map,/Hospital photograph unavailable/);
});

test("government references match their source addresses, pictures and accuracy levels",()=>{
 const publicPins=places.SJDM_PUBLIC_MAP_PLACE_PINS;
 const cdrrmo=publicPins.find(x=>x.kind==="cdrrmo");
 const govt=publicPins.find(x=>x.kind==="government");
 const hall=publicPins.find(x=>x.kind==="barangay_hall");
 assert.match(cdrrmo.address,/Productivity Complex, Motorpool/);
 assert.equal(cdrrmo.officialContact,"09326000119");
 assert.equal(cdrrmo.photoUrl,undefined);
 assert.equal(cdrrmo.positionQuality,"third_party_approximate");
 assert.match(cdrrmo.photoDescription,/No independently verified/);
 assert.match(govt.address,/New Government Center/);
 assert.match(govt.photoUrl,/upload\.wikimedia\.org/);
 assert.match(govt.photoLicenseUrl,/creativecommons\.org/);
 assert.equal(govt.officialContact,"(044) 9197370");
 assert.match(hall.address,/Provincial Road, Barangay Dulong Bayan/);
 assert.equal(hall.photoUrl,undefined);
 const script=read("components/tabs/MapTracking.web.tsx");
 assert.match(script,/\["hospital","government","barangay_hall","cdrrmo"\]\.includes\(item\.kind\)/);
 assert.match(script,/Photo author and CC BY-SA 4\.0 license/);
 assert.match(script,/Find named office \(approximate map pin\)/);
 assert.match(script,/item\.photoDescription/);
});
