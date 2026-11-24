const {test}=require("node:test");
const assert=require("node:assert/strict");
const {getBrowserAttendanceLocation}=require("../lib/attendanceLocationRetry.ts");
const point=(accuracy,timestamp=Date.now())=>({coords:{latitude:14.81,longitude:121.04,accuracy},timestamp});
function fake(readings) {
 let count=0;
 return {get count(){return count},getCurrentPosition(ok,bad,opts){
  assert.equal(opts.maximumAge,0);assert.equal(opts.enableHighAccuracy,true);
  const r=readings[count++]; if(r==="timeout")return;
  if(typeof r==="number")bad({code:r});else ok(r);
 }};
}
test("accurate first reading unchanged",async()=>{
 const g=fake([point(10)]);const r=await getBrowserAttendanceLocation(g,()=>{},5);
 assert.equal(g.count,1);assert.equal(r.accuracy,10);assert.equal(r.latitude,14.81);
});
test("poor accuracy then genuine better reading",async()=>{
 const g=fake([point(250),point(90),point(30)]);const progress=[];
 const r=await getBrowserAttendanceLocation(g,(a,t)=>progress.push([a,t]),5);
 assert.equal(r.accuracy,30);assert.deepEqual(progress,[[1,3],[2,3],[3,3]]);
});
test("all poor readings rejected, no fabricated coordinates",async()=>{
 const g=fake([point(100),point(500),point(51)]);
 await assert.rejects(getBrowserAttendanceLocation(g,()=>{},5),/accuracy is too low/);
 assert.equal(g.count,3);
});
test("permission denial is terminal",async()=>{
 const g=fake([1,point(10)]);await assert.rejects(getBrowserAttendanceLocation(g,()=>{},5),/Allow location permission/);assert.equal(g.count,1);
});
test("timeout and stale fix recover without using stale data",async()=>{
 const g=fake(["timeout",point(10,Date.now()-60000),point(40)]);
 assert.equal((await getBrowserAttendanceLocation(g,()=>{},5)).accuracy,40);
});
test("all timeouts bounded",async()=>{
 const g=fake(["timeout","timeout","timeout"]);
 await assert.rejects(getBrowserAttendanceLocation(g,()=>{},5),/fresh GPS location/);assert.equal(g.count,3);
});
test("invalid negative accuracy and invalid timestamp rejected",async()=>{
 const g=fake([point(-1),point(10,Date.now()+60000),point(50)]);
 assert.equal((await getBrowserAttendanceLocation(g,()=>{},5)).accuracy,50);
});
