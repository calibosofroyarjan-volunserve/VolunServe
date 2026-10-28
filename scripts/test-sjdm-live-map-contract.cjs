"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
function importLocalTs(file) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(content, {compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
  }}).outputText;
  const mod = { exports: {} };
  const scopedRequire = name => name === "../constants/sjdmBoundaryReference"
    ? importLocalTs("constants/sjdmBoundaryReference.ts") : require(name);
  new Function("module", "exports", "require", output)(mod, mod.exports, scopedRequire);
  return mod.exports;
}
const boundary = importLocalTs("lib/sjdmMapBoundary.ts");
const facilities = importLocalTs("lib/lguMapFacilities.ts");
const emergency = importLocalTs("lib/emergencyMapTypes.ts");
const polygon = {
  type: "Feature",
  properties: {city:"Synthetic",province:"Synthetic",source:"Test only"},
  geometry: {type:"Polygon",coordinates:[
    [[121,14.7],[121.2,14.7],[121.2,14.9],[121,14.9],[121,14.7]],
    [[121.05,14.75],[121.15,14.75],[121.15,14.85],[121.05,14.85],[121.05,14.75]],
  ]},
};

test("boundary point inclusion rejects outside coordinates and polygon holes", () => {
  assert.equal(boundary.insideSjdmBoundary(polygon,14.72,121.02),true);
  assert.equal(boundary.insideSjdmBoundary(polygon,14.8,121.1),false);
  assert.equal(boundary.insideSjdmBoundary(polygon,15.5,121.1),false);
  assert.deepEqual(boundary.boundaryBounds(polygon),{
    north:14.9,south:14.7,east:121.2,west:121,
  });
});

test("MultiPolygon includes separated verified parts", () => {
  const multi={...polygon,geometry:{type:"MultiPolygon",coordinates:[
    polygon.geometry.coordinates,
    [[[120.9,14.8],[120.95,14.8],[120.95,14.85],[120.9,14.85],[120.9,14.8]]],
  ]}};
  assert.equal(boundary.insideSjdmBoundary(multi,14.82,120.92),true);
  assert.equal(boundary.insideSjdmBoundary(multi,14.8,121.1),false);
});

test("unverified or inactive LGU facility never becomes map pin", () => {
  const valid={
    name:"Synthetic Test Fire Office",address:"Test-only address",
    barangay:"Synthetic Barangay",facilityType:"fire_station",
    status:"active",verificationStatus:"verified",verificationSource:"Synthetic fixture only",
    latitude:14.813,longitude:121.045,
  };
  assert.equal(facilities.verifiedLguMapFacility("test",valid).facilityType,"fire_station");
  assert.equal(facilities.verifiedLguMapFacility("test",{...valid,verificationStatus:"pending"}),null);
  assert.equal(facilities.verifiedLguMapFacility("test",{...valid,status:"inactive"}),null);
  assert.equal(facilities.verifiedLguMapFacility("test",{...valid,facilityType:"unknown"}),null);
  assert.equal(facilities.verifiedLguMapFacility("test",{...valid,latitude:0,longitude:0}),null);
});

test("both map targets render GIS polygon and approved live facilities", () => {
  for (const file of ["components/tabs/MapTracking.web.tsx","components/tabs/MapTracking.native.tsx"]) {
    const code=fs.readFileSync(path.join(root,file),"utf8");
    assert.match(code,/loadSjdmBoundary/);
    assert.match(code,/insideSjdmBoundary/);
    assert.match(code,/lguMapFacilities/);
  }
  const web=fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  const native=fs.readFileSync(path.join(root,"components/tabs/MapTracking.native.tsx"),"utf8");
  assert.match(web,/sjdm-city-outline/);
  assert.match(web,/map\.setMaxBounds/);
  assert.match(native,/<Polygon/);
  assert.match(native,/setMapBoundaries/);
  assert.doesNotMatch(web,/const LGU_BASE =/);
});

test("real bundled SJDM geometry is verified and available without network", async () => {
  const city = await boundary.loadSjdmBoundary();
  assert.equal(city.type, "Feature");
  assert.match(city.properties.source, /geoBoundaries/);
  assert.ok(boundary.boundaryRings(city)[0][0].length > 100);
  const box = boundary.boundaryBounds(city);
  assert.ok(box.north > 14.82 && box.south < 14.79);
  assert.ok(box.west < 121.04 && box.east > 121.15);
});


test("reference mask paints outside SJDM but cuts the real city out as a hole", async () => {
  const city = await boundary.loadSjdmBoundary();
  const outside = boundary.sjdmOutsideMask(city);
  assert.equal(outside.type, "Feature");
  assert.equal(outside.geometry.type, "Polygon");
  assert.ok(outside.geometry.coordinates.length >= 2);
  assert.equal(outside.geometry.coordinates[1].length, 134);
  assert.equal(boundary.insideSjdmBoundary(city, 14.813, 121.045), true);
  assert.equal(boundary.insideSjdmBoundary(city, 14.813, 121.20), false);
});

test("city-only road routing refuses any segment that exits SJDM", async () => {
  const city = await boundary.loadSjdmBoundary();
  assert.equal(boundary.routeStaysInSjdm(city, [
    {latitude:14.813,longitude:121.045},
    {latitude:14.8132,longitude:121.0454},
  ]), true);
  assert.equal(boundary.routeStaysInSjdm(city, [
    {latitude:14.813,longitude:121.045},
    {latitude:14.95,longitude:121.045},
    {latitude:14.8132,longitude:121.0454},
  ]), false);
  assert.equal(boundary.routeStaysInSjdm(city, []), false);
});

test("web/Android do not expose roads, outside pins or invalid city camera targets", () => {
  const web=fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  const native=fs.readFileSync(path.join(root,"components/tabs/MapTracking.native.tsx"),"utf8");
  assert.match(web, /sjdm-exterior-blocked/);
  assert.match(web, /sjdm-outside-mask/);
  assert.match(web, /sjdmOutsideMask\(sjdmBoundary\)/);
  assert.match(web, /withinCity\(person.latitude, person.longitude\)/);
  assert.match(web, /map\.on\("moveend"/);
  assert.match(web, /routeStaysInSjdm/);
  assert.match(native, /SJDM_MASK_EXTERIOR/);
  assert.match(native, /holes=\{sjdmOutsideMask\(sjdmBoundary\)/);
  assert.match(native, /onRegionChangeComplete/);
  assert.match(native, /routeStaysInSjdm/);
  assert.match(native, /inCity\(geocoded.latitude, geocoded.longitude\)/);
  assert.match(native, /inCity\(incident.latitude, incident.longitude\)/);
  assert.match(native, /inCity\(point.latitude, point.longitude\)/);
  assert.match(native, /inCity\(center.latitude, center.longitude\)/);
});


test("city overview fits all SJDM bounds and outside is fully opaque", () => {
  const web = fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  const native = fs.readFileSync(path.join(root,"components/tabs/MapTracking.native.tsx"),"utf8");
  assert.match(web, /map\.fitBounds\(\[\[area\.west, area\.south\], \[area\.east, area\.north\]\]/);
  assert.match(web, /"fill-color": "#E7EEEA", "fill-opacity": 1/);
  assert.match(native, /fillColor="rgba\(231,238,234,1\)"/);
  assert.match(native, /onRegionChangeComplete=\{region =>/);
  assert.match(web, /City boundary unavailable\. SJDM-only map|SJDM boundary unavailable\. Map is hidden/);
});


test("old shelter reports never authorize fresh available evacuation routing", () => {
  const t = Date.parse("2026-10-28T08:00:00Z");
  const base = { status:"active", verificationStatus:"verified" };
  assert.equal(emergency.isRecentShelterReport({
    ...base, lastVerifiedAt: {toMillis:()=>t-60*60*1000}
  },t),true);
  assert.equal(emergency.isRecentShelterReport({
    ...base, lastVerifiedAt: {toMillis:()=>t-25*60*60*1000}
  },t),false);
  assert.equal(emergency.isRecentShelterReport({...base},t),false);
  assert.equal(emergency.isRecentShelterReport({
    ...base, status:"closed",lastVerifiedAt:{toMillis:()=>t}
  },t),false);
  assert.equal(emergency.isRecentShelterReport({
    ...base, lastVerifiedAt:{toMillis:()=>t+60*60*1000}
  },t),false);
  const native = fs.readFileSync(path.join(root,"components/tabs/MapTracking.native.tsx"),"utf8");
  assert.match(native,/isRecentShelterReport\(center\)/);
  const web = fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  assert.match(web,/Shelter opening NOT recently confirmed/);
});


test("active Resident/Volunteer/LGU response views keep real shelter feeds and show missing-data notices", () => {
  const web=fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  assert.match(web,/setShelterFeedState\("ready"\)/);
  assert.match(web,/setLguFacilityFeedState\("ready"\)/);
  assert.match(web,/collection\(db, "evacuation_centers"\)/);
  assert.doesNotMatch(web,/if \(missionMode \|\| adminMissionMode\) \{\s*setCenters\(\[\]\)/);
  assert.doesNotMatch(web,/if \(missionMode \|\| adminMissionMode \|\| !showCenters\)/);
  assert.doesNotMatch(web,/centers: missionMode\s*\?\s*\[\]/);
  assert.match(web,/activeResponseView: isResidentMode \|\| missionMode \|\| adminMissionMode \|\| lguPersonnelMissionMode/);
  assert.match(web,/if \(!payload\.activeResponseView\)/);
  assert.match(web,/visibleCenters/);
  assert.match(web,/lguFacilities/);
  assert.match(web,/publicPlaces: publicPlacePins\.map/);
  assert.doesNotMatch(web,/SJDM VERIFIED FACILITY RECORDS/);
});

test("Minuyan Proper verified history is a SOURCE REFERENCE only, not an active shelter pin", () => {
  const sources=fs.readFileSync(path.join(root,"constants/sjdmOfficialFacilityReview.ts"),"utf8");
  assert.match(sources,/minuyan-proper-pagcor-multipurpose-shelter/);
  assert.match(sources,/www\.pagcor\.ph\/press-releases\/first-pagcor-funded-evacuation-facility-in-bulacan-inaugurated\.php/);
  assert.match(sources,/NOT evidence of a currently open shelter/);
  assert.doesNotMatch(sources,/latitude\s*:/);
  assert.doesNotMatch(sources,/longitude\s*:/);
});


test("Residents can reveal the full authentic SJDM outline without switching off case/verified pins", () => {
  const web=fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  assert.match(web,/data\?\.kind === "fit-whole-sjdm"/);
  assert.match(web,/map\.fitBounds\(\[\[box\.west, box\.south\],\[box\.east, box\.north\]\]/);
  assert.match(web,/map\.fitBounds\(\[\[area\.west, area\.south\], \[area\.east, area\.north\]\]/);
  assert.doesNotMatch(web,/SJDM VERIFIED FACILITY RECORDS/);
});


test("Only sourced real SJDM infrastructure coordinates become default public map icons", async () => {
  const city=await boundary.loadSjdmBoundary();
  const publicFeed=importLocalTs("lib/sjdmPublicMapPlaces.ts");
  const pins=publicFeed.SJDM_PUBLIC_MAP_PLACE_PINS;
  assert.equal(pins.length,2,"Only independently corroborated locations may be published.");
  assert.ok(pins.some(item=>item.kind==="government"));
  assert.ok(pins.some(item=>item.kind==="barangay_hall"));
  assert.ok(!pins.some(item=>["fire_station","cdrrmo","evacuation_site"].includes(item.kind)),
    "No unresolved relocated or unverified site should have a hardcoded default pin.");
  for (const item of pins) {
    assert.ok(boundary.insideSjdmBoundary(city,item.latitude,item.longitude),
      item.name+" must be physically inside SJDM");
    assert.match(item.sourceUrl,/^https:\/\//);
    assert.match(item.note,/not|unconfirmed|approximate|verify|confirm/i);
    assert.ok(!("availability" in item), "must not invent live occupancy");
  }
  const web=fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  assert.match(web,/publicPlaceMarkers\.push\(marker\)/);
  assert.match(web,/makeSourcedPlaceElement/);
  assert.match(web,/publicPlacePins/);
  assert.doesNotMatch(web,/fetchMappedSjdmPublicPlaces/);
  assert.doesNotMatch(web,/osmMappedPlaces/);
  const native=fs.readFileSync(path.join(root,"components/tabs/MapTracking.native.tsx"),"utf8");
  assert.doesNotMatch(native,/fetchMappedSjdmPublicPlaces/);
  assert.doesNotMatch(native,/osmMappedPlaces/);
  assert.match(web,/withinCity\(item\.latitude, item\.longitude\)/);
  assert.match(web,/public-place-marker/);
  assert.doesNotMatch(web,/SJDM VERIFIED FACILITY RECORDS/);
});


test("web map popup is readable, actionable and never displays raw OSM technical text", () => {
  const source=fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  assert.match(source,/function makePublicPlacePopup/);
  assert.match(source,/makePublicPlacePopup\(item\)/);
  assert.match(source,/setDOMContent\(makePublicPlacePopup\(item\)\)/);
  assert.match(source,/makeVerifiedMapPopup\(item,true\)/);
  assert.match(source,/makeVerifiedMapPopup\(item,false\)/);
  assert.doesNotMatch(source,/View map source/);
  assert.doesNotMatch(source,/Official information/);
  assert.match(source,/Show road route here/);
  assert.match(source,/appendInAppRouteButton\(item, links\)/);
  assert.match(source,/function showFacilityRoute/);
  assert.match(source,/navigator\.geolocation\.getCurrentPosition/);
  assert.match(source,/router\.project-osrm\.org\/route\/v1\/driving\//);
  assert.match(source,/routeInsideCity\(route\.geometry\.coordinates\)/);
  assert.match(source,/facility-road-route-line/);
  assert.doesNotMatch(source,/Directions in Google Maps/);
  assert.match(source,/allow="geolocation"/);
  assert.match(source,/Call SJDM CDRRMO/);
  assert.doesNotMatch(source,/item\.sourceLabel \+ " · " \+ item\.note/);
  assert.doesNotMatch(source,/typeof url !== "string" \|\| !\/\^https:/);
  assert.match(source,/sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"/);
});

test("response UI never describes an unassigned case as an active LGU responder", () => {
  const source=fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  assert.match(source,/Awaiting LGU assignment/);
  assert.match(source,/No LGU responder assigned yet/);
  assert.match(source,/NOT ASSIGNED/);
  assert.match(source,/tel:911/);
  assert.match(source,/tel:09366000119/);
  assert.doesNotMatch(source,/"LGU coordinating response"/);
});

test("official evacuation center names are maintained as review-only entries with no made-up GPS", () => {
  const source=fs.readFileSync(path.join(root,"constants/sjdmOfficialFacilityReview.ts"),"utf8");
  assert.match(source,/Assumption SRSCP Auditorium/);
  assert.match(source,/Bagong Buhay Elementary School/);
  assert.match(source,/CSJDM-SEP-2022\.pdf/);
  assert.doesNotMatch(source,/latitude\s*:/);
  assert.doesNotMatch(source,/longitude\s*:/);
});

test("OpenStreetMap map-viewer script compiles to valid JavaScript", () => {
  const source=fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  const parsed=ts.createSourceFile("MapTracking.web.tsx",source,
    ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  const literals=[];
  function walk(node){
    if(ts.isVariableDeclaration(node) && node.name.getText(parsed)==="mapDocument"){
      literals.push(node.initializer);
    }
    ts.forEachChild(node,walk);
  }
  walk(parsed);
  assert.equal(literals.length,1);
  const initial=literals[0];
  assert.ok(ts.isTemplateExpression(initial) || ts.isNoSubstitutionTemplateLiteral(initial),
    "expected template literal with the MapLibre iframe document");
  const html=ts.isTemplateExpression(initial)
    ? initial.head.text + initial.templateSpans.map(span =>
        "0" + span.literal.text).join("")
    : initial.text;
  const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length>=1,"expected inline MapLibre script");
  const vm=require("node:vm");
  for(const block of scripts)if(block[1].trim())
    assert.doesNotThrow(()=>new vm.Script(block[1]),"inline map code must parse");
});


test("programmer Super Admin is not a field LGU dispatcher", () => {
  const source=fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  assert.match(source,/const isOperationalLgu = accountRole === "admin" \|\| isLguPersonnel/);
  assert.match(source,/const adminMissionMode =\s*!!focusedCaseId && isOperationalLgu/);
});


test("all visible types of public safety facility pins support correct coordinate-based directions", async () => {
  const map = importLocalTs("lib/sjdmPublicMapPlaces.ts");
  const u = map.googleMapsFacilityDirections(14.82785,121.04486);
  assert.equal(u,
    "https://www.google.com/maps/dir/?api=1&destination=14.827850%2C121.044860&travelmode=driving&dir_action=navigate");
  assert.throws(()=>map.googleMapsFacilityDirections(Infinity,121),/Invalid facility/);
  assert.throws(()=>map.googleMapsFacilityDirections(14.8,200),/Invalid facility/);
  const web=fs.readFileSync(path.join(root,"components/tabs/MapTracking.web.tsx"),"utf8");
  assert.match(web,/appendInAppRouteButton\(item, links\)/);
  assert.match(web,/if \(!validPoint\(item.latitude, item.longitude\) \|\|/);
  assert.match(web,/!withinCity\(item.latitude, item.longitude\)/);
  assert.match(web,/if \(!route \|\| route.geometry\?\.type !== "LineString"/);
  assert.match(web,/facilityRouteNotice\("Road route unavailable"/);
  const native=fs.readFileSync(path.join(root,"components/tabs/MapTracking.native.tsx"),"utf8");
  assert.match(native,/function|const openVerifiedDirections/);
  assert.match(native,/Linking\.openURL\(googleMapsFacilityDirections\(latitude,longitude\)\)/);
  assert.match(native,/onCalloutPress=\{\(\) => openVerifiedDirections\(place.latitude,place.longitude\)\}/);
  assert.match(native,/onCalloutPress=\{\(\) => openVerifiedDirections\(facility.latitude,facility.longitude\)\}/);
  assert.match(native,/onCalloutPress=\{\(\) => openVerifiedDirections\(center.latitude,center.longitude\)\}/);
  assert.match(native,/<Callout>/);
});
