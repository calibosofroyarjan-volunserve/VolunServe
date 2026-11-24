import { SJDM_REFERENCE_GEOMETRY } from "../constants/sjdmBoundaryReference";
import { insideSjdmBoundary, type SjdmBoundary } from "./sjdmMapBoundary";
export type MeetingPlace={name:string;latitude:number;longitude:number;detail?:string};
const boundary:SjdmBoundary={type:"Feature",properties:{},geometry:SJDM_REFERENCE_GEOMETRY as unknown as SjdmBoundary["geometry"]};
export function validMeetingPlace(p:MeetingPlace){return Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&insideSjdmBoundary(boundary,p.latitude,p.longitude);}
const normalized=(s:string)=>s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
export function searchMeetingPlaces(places:MeetingPlace[],query:string):MeetingPlace[]{
 const q=normalized(query);if(q.length<2)return [];
 const tokens=q.split(" ");
 return places.filter(validMeetingPlace).filter(p=>tokens.every(t=>normalized(p.name+" "+(p.detail||"")).includes(t)))
 .sort((a,b)=>Number(normalized(b.name).startsWith(q))-Number(normalized(a.name).startsWith(q))||a.name.length-b.name.length)
 .filter((p,i,all)=>all.findIndex(other=>normalized(other.name)===normalized(p.name)&&Math.abs(other.latitude-p.latitude)<0.0003&&Math.abs(other.longitude-p.longitude)<0.0003)===i).slice(0,12);
}
export function nearestMeetingPlace(places:MeetingPlace[],lat:number,lng:number):MeetingPlace|undefined{
 let best:MeetingPlace|undefined;let bestMeters=Infinity;
 for(const p of places){if(!validMeetingPlace(p))continue;const d=Math.hypot((p.latitude-lat)*111195,(p.longitude-lng)*111195*Math.cos(lat*Math.PI/180));if(d<bestMeters){best=p;bestMeters=d;}}
 return bestMeters<=150?best:undefined;
}
