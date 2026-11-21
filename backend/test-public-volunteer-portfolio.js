"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {installCommunityEventPublicProfiles}=require("./communityEventPublicProfiles");
const eventId="event-1",target="volunteer-target";
const crypto=require("node:crypto");
const key=crypto.createHash("sha256").update(eventId+":"+target).digest("hex").slice(0,16);
const timestamp=mins=>({toMillis:()=>Date.UTC(2026,9,1)+mins*60000});
const tables={
  communityEvents:{
    "event-1":{publicationStatus:"published",title:"Clean Up Drive",status:"completed",date:"2026-10-01",barangay:"Assumption"},
    "event-2":{publicationStatus:"published",title:"Tree Planting",status:"completed",date:"2026-10-02",barangay:"Gumaoc"},
  },
  users:{
    "volunteer-target":{fullName:"Sample Volunteer",profilePictureUrl:"",
      email:"secret@example.com",phoneNumber:"09123456789",address:"Private House",
      identityStatus:"verified",createdAt:timestamp(0)},
  },
  communityEventParticipants:{
    a:{uid:"volunteer-target",eventId:"event-1",status:"joined",attendanceVerified:true,
      checkedInAt:timestamp(0),checkedOutAt:timestamp(60),email:"private@example.com"},
    b:{uid:"viewer",eventId:"event-1",status:"joined"},
    c:{uid:"volunteer-target",eventId:"event-2",status:"joined",attendanceVerified:true,
      checkedInAt:timestamp(10),checkedOutAt:timestamp(40)},
  },
  verifiedContributions:{
    x:{volunteerId:"volunteer-target",status:"verified",outcome:"fully_helped",contributionType:"search_and_rescue",
      peopleHelped:2,verifiedAt:timestamp(123),caseId:"SECRETCASE",contributionSummary:"Private resident notes"},
  },
  certificates:{
    cert1:{userId:"volunteer-target",volunteerId:"volunteer-target",certificateType:"community_event_participation",
      verificationStatus:"issued",certificateTitle:"Certificate of Participation",eventId:"event-1",
      eventTitle:"Clean Up Drive",verifiedServiceMinutes:60,issuedAt:timestamp(88),certificateId:"PRIVATE_ID"},
    cert2:{userId:"volunteer-target",volunteerId:"volunteer-target",certificateType:"verified_volunteer_service",
      verificationStatus:"revoked",certificateTitle:"Revoked",issuedAt:timestamp(99)},
  },
};
const db={
  collection(collection){
    return {
      doc(id){return {get:async()=>({id,exists:Boolean(tables[collection]?.[id]),data:()=>tables[collection]?.[id]})};},
      where(field,op,val){
        assert.equal(op,"==");
        const docs=Object.entries(tables[collection]||{}).filter(([,v])=>v[field]===val)
          .map(([id,v])=>({id,data:()=>v}));
        return {limit(n){return {get:async()=>({docs:docs.slice(0,n)})}}};
      },
    };
  },
};
const route=(()=>{
  let handler;
  installCommunityEventPublicProfiles({
    app:{get(url,middle,fn){assert.match(url,/profile/);handler=fn;}},
    db, requireFirebaseUser:()=>{}, isApprovedAccount:()=>true,
    loadUserProfile:async uid=>({volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer",uid}),
  });
  return handler;
})();
async function call(uid,member=key,id=eventId){
  const req={params:{eventId:id,member},firebaseUser:{uid}};
  let status=200,body;
  const res={status(code){status=code;return this;},json(json){body=json;return this;}};
  await route(req,res);
  return {status,body};
}
test("approved volunteer with shared event sees genuine sanitized progress + achievements",async()=>{
  const {status,body}=await call("viewer");
  assert.equal(status,200);
  assert.equal(body.profile.name,"Sample Volunteer");
  assert.equal(body.summary.joinedEvents,2);
  assert.equal(body.summary.completedEvents,2);
  assert.equal(body.summary.verifiedMinutes,90);
  assert.equal(body.summary.verifiedHelps,1);
  assert.equal(body.summary.certificateCount,1);
  assert.equal(body.progress.length,2);
  assert.equal(body.certificates.length,1);
  assert.equal(body.activity[0].type,"search_and_rescue");
  const encoded=JSON.stringify(body);
  for(const secret of ["secret@example.com","09123456789","Private House",
    "identityStatus","PRIVATE_ID","SECRETCASE","Private resident notes","private@example.com","checkedInAt","checkedOutAt","volunteer-target"]){
    assert(!encoded.includes(secret),"Private detail leaked: "+secret);
  }
});
test("viewer who did not join this event is forbidden",async()=>{
  const {status}=await call("other-user");assert.equal(status,403);
});
test("unknown opaque participant key does not reveal profile",async()=>{
  const {status}=await call("viewer","abcdabcdabcdabcd");assert.equal(status,404);
});
test("malformed path rejected",async()=>{
  const {status}=await call("viewer",key,"../event");assert.equal(status,400);
});
