"use strict";
/**
 * Generate a browser-only demo from a COPY of the already QA-validated source.
 * NEVER run in production; the main release artifact is built and uploaded first.
 * No users, Auth accounts, Firestore, Hosting, or backend data are modified.
 */
const fs=require("node:fs"), assert=require("node:assert/strict");
const screenPath="app/(tabs)/community-events.tsx";
let screen=fs.readFileSync(screenPath,"utf8");
assert(screen.includes('import { useUserSession } from "../../lib/useUserSession";'));
assert(screen.includes('  onSnapshot,'));
assert(screen.includes('onSnapshot('));
screen=screen.replace('  onSnapshot,\n',"");
screen=screen.replace('import { useUserSession } from "../../lib/useUserSession";',
  'import { useUserSession } from "../../lib/useUserSession";\nimport { qaOnSnapshot } from "../../lib/qaCommunityEventsPreview";');
screen=screen.replaceAll("onSnapshot(","qaOnSnapshot(");
assert(screen.includes("qaOnSnapshot(")&&!screen.includes("onSnapshot("));
fs.writeFileSync(screenPath,screen);

fs.writeFileSync("lib/useUserSession.ts",`
/* QA-ONLY synthetic login; generated in disposable workflow after real build. */
const qaUser={uid:"qa-volunteer-preview",email:"qa-volunteer@example.com",
  getIdToken:async()=> "qa-local-token",providerData:[]};
const qaProfile={uid:"qa-volunteer-preview",role:"resident",status:"approved",
  residentAccess:true,volunteerAccess:true,volunteerStatus:"approved",
  activeMode:"volunteer",email:"qa-volunteer@example.com",fullName:"QA Preview Volunteer",
  identityVerified:true,identityStatus:"verified",firstName:"QA",lastName:"Volunteer"};
export function useUserSession(){
  return {loading:false,user:qaUser as any,profile:qaProfile as any};
}
`);

fs.writeFileSync("app/_layout.tsx",`
/* This test-only layout bypasses real auth ONLY in ephemeral isolated QA preview build. */
import React from "react";
import { Stack } from "expo-router";
import { View, Text } from "react-native";
export default function QARootLayout(){
  return <>
    <View style={{backgroundColor:"#F8E4AB",padding:8,alignItems:"center"}}>
      <Text style={{color:"#6B4509",fontWeight:"800",fontSize:12}}>
        QA MOCK PREVIEW — SYNTHETIC VOLUNTEER & EVENTS — NOT LIVE
      </Text>
    </View>
    <Stack screenOptions={{headerShown:false}} />
  </>;
}
`);
fs.writeFileSync("lib/qaCommunityEventsPreview.ts",`
/* Static fixture. NO Firestore reads/writes; only used by the disposable QA build. */
const scheduled=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
const created=(days:number)=>({toMillis:()=>Date.now()-days*86400000,seconds:Math.floor((Date.now()-days*86400000)/1000)});
const categories=["Clean-up Drive","Tree Planting","Feeding Program","Community Outreach"];
const barangays=["Poblacion","Sapang Palay","Bagong Buhay III","Citrus"];
const upcoming=Array.from({length:11},(_,i)=>({
  id:"qa-upcoming-"+(i+1),title:["Riverside Clean-up Drive","Tree Planting Day","Community Food Program",
   "Barangay Outreach","Park Restoration","Green City Project"][i%6]+" #"+(i+1),
  description:"An approved community volunteer activity with scheduled tasks, venue and verified participation.",
  category:categories[i%4],barangay:barangays[i%4],
  location:"Community Center, City of San Jose del Monte",date:scheduled(3+i),
  time:"08:00",capacity:20,participantsCount:3,status:"upcoming",
  publicationStatus:"published",createdAt:created(i),approvedAt:created(i),
  proposedBy:"qa-resident-"+i,proposerName:"QA Resident",coverImageUrl:""
}));
const active={...upcoming[1],id:"qa-ongoing-1",title:"Active Barangay Volunteer Service",
  date:scheduled(-1),status:"active",participantsCount:4};
const finished={...upcoming[2],id:"qa-finished-1",title:"Completed Community Clean-up",
  date:scheduled(-12),status:"completed",participantsCount:7};
const events=[...upcoming,active,finished];
const joined=[{id:"qa-ongoing-1_qa-volunteer-preview",eventId:active.id,uid:"qa-volunteer-preview",
  fullName:"QA Preview Volunteer",status:"joined",joinedAt:created(4),
  checkedInAt:created(0.4),checkedOutAt:created(0.35),attendanceVerified:true,
  attendanceVerifiedAt:created(0.25)},
  {id:"qa-upcoming-1_qa-volunteer-preview",eventId:upcoming[0].id,uid:"qa-volunteer-preview",
  status:"joined",joinedAt:created(1),checkedInAt:null,checkedOutAt:null,attendanceVerified:false}
];
export function qaOnSnapshot(query:any,onData:(snapshot:any)=>void){
 const pieces=query?._query?.path?.segments||[];
 const path=pieces.join("/");
 const items=path.includes("communityEventParticipants")?joined:
   path.includes("communityEventProposals")?[]:events;
 const handle=setTimeout(()=>onData({docs:items.map((value:any)=>({
    id:value.id,data:()=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=="id"))
  }))}),25);
 return ()=>clearTimeout(handle);
}
`);

console.log("QA fixture inserted in disposable source: exact screen JSX retained, synthetic snapshots and mock route login only.");
