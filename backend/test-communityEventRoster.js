"use strict";
const assert=require("node:assert/strict");
const {installCommunityEventRoster}=require("../backend/communityEventRoster");
let handler;
const app={get(path,middleware,fn){assert.equal(path,"/api/community-events/:eventId/volunteers");assert.equal(typeof middleware,"function");handler=fn;}};
const fakeProfile={status:"approved",volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer"};
let viewer=fakeProfile;
const people={
  v1:{fullName:"Volunteer One",profilePictureUrl:"https://res.cloudinary.com/example/image/upload/a.jpg",phone:"PRIVATE PHONE",governmentId:"SECRET"},
  v2:{fullName:"Volunteer Two",profilePictureUrl:"https://evil.example/id-card.png",email:"PRIVATE EMAIL"},
};
const doc=(data,id="")=>({id,exists:!!data,data:()=>data});
const db={collection(name){return {
 doc(id){return {get:async()=>name==="communityEvents"?doc({publicationStatus:"published"}):doc(people[id])}},
 where(key,op,id){assert.equal(name,"communityEventParticipants");assert.equal(key,"eventId");assert.equal(op,"==");assert.equal(id,"event1");return {limit(n){assert.equal(n,500);return {get:async()=>({docs:[doc({eventId:id,uid:"v1",status:"joined",fullName:"Fallback One"},"one"),doc({eventId:id,uid:"v2",status:"joined"},"two"),doc({eventId:id,uid:"v3",status:"declined"},"three")]})}}}}
}}};
installCommunityEventRoster({app,db,requireFirebaseUser:()=>{},loadUserProfile:async()=>viewer,isApprovedAccount:p=>p.status==="approved"});
async function invoke(page="1",eventId="event1"){
 let status=200,payload;
 await handler({params:{eventId},query:{page},firebaseUser:{uid:"viewer"}},{
 status(n){status=n;return this},
 json(value){payload=value;return this},
 });
 return {status,payload};
}
(async()=>{
 const ok=await invoke();
 assert.equal(ok.status,200);
 assert.equal(ok.payload.total,2);
 assert.deepEqual(ok.payload.volunteers.map(x=>x.name),["Volunteer One","Volunteer Two"]);
 assert.equal(ok.payload.volunteers[0].status,"Joined");
 assert.equal(ok.payload.volunteers[1].avatarUrl,"");
 assert.equal(JSON.stringify(ok.payload).includes("PRIVATE"),false,"No private profile fields");
 assert.equal(JSON.stringify(ok.payload).includes('"uid"'),false,"No user IDs in output");
 assert.equal((await invoke("0")).status,400);
 viewer={...fakeProfile,activeMode:"resident"};
 assert.equal((await invoke()).status,403);
 viewer={...fakeProfile,volunteerAccess:false};
 assert.equal((await invoke()).status,403);
 console.log("PASS: joined volunteer roster is paginated, access-gated, and sanitized");
})().catch(e=>{console.error(e);process.exitCode=1});
