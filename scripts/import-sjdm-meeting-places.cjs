"use strict";
// One-time public geographic data import, NOT a runtime geocoding service.
// Source: OpenStreetMap contributors (ODbL), via Overpass API.
// Named public places/roads only; no private house numbers or user GPS.
const fs=require("node:fs"),assert=require("node:assert/strict");
const source=fs.readFileSync("constants/sjdmBoundaryReference.ts","utf8");
const geometry=JSON.parse(source.slice(source.indexOf('{"type":"Polygon"'),source.lastIndexOf("}")+1));
const ring=geometry.coordinates[0];
const inside=(lat,lng)=>{
 if(!Number.isFinite(lat)||!Number.isFinite(lng))return false;
 let b=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],c=ring[j];if((a[1]>lat)!==(c[1]>lat)&&lng<(c[0]-a[0])*(lat-a[1])/(c[1]-a[1])+a[0])b=!b;}return b;
};
const bounds="(14.758,121.005,14.877,121.178)";
const categories=["amenity","shop","place","highway","tourism","leisure","office","historic","public_transport","railway","landuse","natural","building","healthcare","sport","craft","man_made"];
const query='[out:json][timeout:60];nwr["name"][~"^('+categories.join("|")+')$"~"."]'+bounds+';out center;';
async function load(){
 const endpoints=["https://overpass-api.de/api/interpreter","https://overpass.private.coffee/api/interpreter"];
 let lastError;
 for(const endpoint of endpoints){
  try{
   const url=endpoint+"?"+new URLSearchParams({data:query});
   const response=await fetch(url,{headers:{"User-Agent":"VolunServe-SJDM-static-place-index/1.0 (https://volunserve.com)","Accept":"application/json"},signal:AbortSignal.timeout(100000)});
   assert(response.ok,"OSM extract unavailable HTTP "+response.status);
   const data=await response.json();assert(Array.isArray(data.elements));assert(!data.remark,"Incomplete OSM extract");
   assert(data.elements.length>=100,"Incomplete named-place dataset");
   console.log("Public OSM snapshot received: "+data.elements.length+" features");
   return data.elements;
  }catch(error){lastError=error;console.warn("One-time import unavailable: "+error.message);}
 }
 throw lastError;
}
(async()=>{
 const entries=await load();
 const rows=[];const seen=new Set();
 for(const e of entries){
  const t=e.tags||{},name=String(t.name||"").trim().slice(0,180);
  const latitude=Number(e.lat??e.center?.lat),longitude=Number(e.lon??e.center?.lon);
  if(!name||!inside(latitude,longitude))continue;
  if(t.building==="house"||t.building==="residential"||t.building==="apartments")continue;
  const lat=Number(latitude.toFixed(6)),lng=Number(longitude.toFixed(6));
  const key=name.toLowerCase()+"|"+lat+"|"+lng;if(seen.has(key))continue;seen.add(key);
  const type=categories.map(k=>t[k]).find(Boolean);
  const detail=[t["addr:street"],t["addr:suburb"]||t["addr:district"],type?String(type).replace(/_/g," "):"", "OSM "+e.type+" "+e.id].filter(Boolean).join(" · ").slice(0,220);
  rows.push({name,latitude:lat,longitude:lng,detail});
 }
 assert(rows.length>=100&&rows.length<=20000,"Unexpected size of local named-place extract: "+rows.length);
 // Previously sourced public STI campus, not a guessed address. Only keep if it is absent in the map snapshot.
 if(!rows.some(p=>/\bsti\b/i.test(p.name)&&Math.abs(p.latitude-14.77916)<0.005&&Math.abs(p.longitude-121.07442)<0.005)){
  rows.push({name:"STI College San Jose Del Monte",latitude:14.77916,longitude:121.07442,detail:"Quirino Highway, Tungkong Mangga · OpenStreetMap way 702035163"});
 }
 rows.sort((a,b)=>a.name.localeCompare(b.name)||a.latitude-b.latitude||a.longitude-b.longitude);
 fs.writeFileSync("constants/sjdmMeetingPlaces.json",JSON.stringify(rows,null,2)+"\n");
 console.log("PASS one-time OSM named-place extract: "+rows.length+" in-boundary entries; no runtime lookup added");
})().catch(e=>{console.error(e.message);process.exitCode=1});
