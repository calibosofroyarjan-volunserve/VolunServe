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
