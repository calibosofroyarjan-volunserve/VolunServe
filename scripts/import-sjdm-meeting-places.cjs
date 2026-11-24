"use strict";
// One user-requested, bounded public map data snapshot. No runtime geocoder,
// private addresses, user location, Firestore or paid Google APIs.
const fs=require("node:fs"),assert=require("node:assert/strict");
const source=fs.readFileSync("constants/sjdmBoundaryReference.ts","utf8");
const geometry=JSON.parse(source.slice(source.indexOf('{"type":"Polygon"'),source.lastIndexOf("}")+1));
const ring=geometry.coordinates[0];
const inside=(lat,lng)=>{
 if(!Number.isFinite(lat)||!Number.isFinite(lng))return false;
 let b=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],c=ring[j];if((a[1]>lat)!==(c[1]>lat)&&lng<(c[0]-a[0])*(lat-a[1])/(c[1]-a[1])+a[0])b=!b;}return b;
};
const headers={"User-Agent":"VolunServe-SJDM-public-place-snapshot/1.0 (https://volunserve.com)"};
async function request(url,accept){
 const r=await fetch(url,{headers:{...headers,Accept:accept},signal:AbortSignal.timeout(25000)});
 assert(r.ok,"Map data HTTP "+r.status);
 return r;
}
(async()=>{
 // Decoder installed only in isolated QA runner, not app package dependencies.
 const {VectorTile}=await import("@mapbox/vector-tile");
 const {default:Pbf}=await import("pbf");
 const meta=await (await request("https://tiles.openfreemap.org/planet","application/json")).json();
 assert(Array.isArray(meta.tiles)&&meta.tiles.length,"Missing map tile URL");
 const template=meta.tiles[0];
 assert(typeof template==="string"&&template.startsWith("https://tiles.openfreemap.org/"),"Unexpected tile origin");
 const z=Math.min(14,Number(meta.maxzoom)||14),n=2**z;
 const x=lon=>Math.floor((lon+180)/360*n);
 const y=lat=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
 const tiles=[];
 for(let tx=x(121.005);tx<=x(121.178);tx++)for(let ty=y(14.877);ty<=y(14.758);ty++)tiles.push([tx,ty]);
 assert(tiles.length>0&&tiles.length<=100,"Bounded local extraction only");
 const rows=[],seen=new Set();let totalBytes=0;
 const layers=["poi","place","transportation_name","park","water_name","mountain_peak"];
 for(const [tx,ty] of tiles){
  const url=template.replace("{z}",String(z)).replace("{x}",String(tx)).replace("{y}",String(ty));
  const r=await request(url,"application/x-protobuf");
  const buffer=new Uint8Array(await r.arrayBuffer());totalBytes+=buffer.length;
  assert(totalBytes<=45*1024*1024,"Offline import size limit reached");
  const tile=new VectorTile(new Pbf(buffer));
  for(const name of layers){
   const layer=tile.layers[name];if(!layer)continue;
   for(let i=0;i<layer.length;i++){
    const f=layer.feature(i),p=f.properties;
    const title=String(p.name||p.name_en||p["name:en"]||"").trim().slice(0,180);
    if(!title)continue;
    const g=f.toGeoJSON(tx,ty,z).geometry;
    const coords=g.type==="Point"?[g.coordinates]:g.type==="MultiPoint"||g.type==="LineString"?g.coordinates:g.type==="MultiLineString"?g.coordinates.flat():[];
    const good=coords.filter(c=>inside(c[1],c[0]));
    if(!good.length)continue;
    const c=good[Math.floor(good.length/2)];
    const latitude=Number(c[1].toFixed(6)),longitude=Number(c[0].toFixed(6));
    const key=title.toLowerCase()+"|"+Math.round(latitude*1000)+"|"+Math.round(longitude*1000);
    if(seen.has(key))continue;seen.add(key);
    const kind=name==="transportation_name"?"Mapped road":String(p.subclass||p.class||name).replace(/_/g," ");
    rows.push({name:title,latitude,longitude,detail:kind+" · OpenStreetMap / OpenMapTiles"});
   }
  }
 }
 assert(rows.length>=100&&rows.length<=20000,"Unexpected local place count: "+rows.length);
 // Retain previously sourced explicit campus point if the tile label omits STI.
 const seed=JSON.parse(fs.readFileSync("constants/sjdmMeetingPlaces.json","utf8"));
 for(const p of seed)if(inside(p.latitude,p.longitude)&&/\bsti\b/i.test(p.name)&&!rows.some(q=>/\bsti\b/i.test(q.name)&&Math.abs(q.latitude-p.latitude)<0.005&&Math.abs(q.longitude-p.longitude)<0.005))rows.push(p);
 rows.sort((a,b)=>a.name.localeCompare(b.name)||a.latitude-b.latitude||a.longitude-b.longitude);
 fs.writeFileSync("constants/sjdmMeetingPlaces.json",JSON.stringify(rows,null,2)+"\n");
 console.log("PASS one-time map snapshot: "+rows.length+" places and named roads, "+tiles.length+" tiles, "+totalBytes+" bytes");
})().catch(e=>{console.error(e.message);process.exitCode=1});
