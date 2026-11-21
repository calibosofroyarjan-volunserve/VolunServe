"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {installCommunitySocial,display,conversationId}=require("./communitySocial");
const {publicKey}=require("./communityPresence");
const users={
  resident:{role:"resident",status:"approved",residentAccess:true,activeMode:"resident",fullName:"Resident Sample"},
  volunteer:{role:"resident",status:"approved",residentAccess:true,volunteerAccess:true,
    volunteerStatus:"approved",activeMode:"volunteer",fullName:"Volunteer Sample"},
  admin:{role:"admin",status:"approved",residentAccess:false},
};
const collections={users,communityPresence:{
 resident:{visible:true,displayName:"Resident Sample",mode:"resident",verified:false,
   updatedAt:new Date(),showLastSeen:false,acceptChats:true},
 volunteer:{visible:true,displayName:"Volunteer Sample",mode:"volunteer",verified:true,
   updatedAt:new Date(),showLastSeen:false,acceptChats:true},
},communityChatConversations:{},communityChatThrottle:{},communityChatBlocks:{},
communityChatReports:{}};
const messages={};
const snapshot=(id,obj)=>({id,exists:Boolean(obj),data:()=>obj});
const docRef=(collection,id)=>{
  const store=collections[collection]||{};
  const ref={
    id,async get(){return snapshot(id,store[id]);},
    async set(value,{merge}={}){
      store[id]=merge?{...store[id],...value}:value;
    },
    async delete(){delete store[id];},
    collection(name){
      assert.equal(name,"messages");
      messages[id]||={};
      return {doc(messageId){return {id:messageId,async get(){return snapshot(messageId,messages[id][messageId]);},
        async set(data){messages[id][messageId]=data;}};},
        orderBy(field,mode){assert.equal(field,"createdAt");assert.equal(mode,"desc");
          return {limit(limit){return {async get(){return {docs:Object.entries(messages[id])
            .sort((a,b)=>b[1].createdAt-a[1].createdAt).slice(0,limit)
            .map(([key,data])=>snapshot(key,data))};}};}};}
      };
    },
  };
  return ref;
};
const db={
 collection(name){
  if(!collections[name])collections[name]={};
  const store=collections[name];
  return {
   doc(id){return docRef(name,id);},
   async add(value){const id="report-"+Object.keys(store).length;store[id]=value;return {id};},
   where(field,op,value){
     const matching=()=>Object.entries(store).filter(([id,p])=>op==="=="?p[field]===value:
       op===">="?p[field] instanceof Date&&p[field]>=value:
       op==="array-contains"&&Array.isArray(p[field])&&p[field].includes(value));
     const get=async(n=Infinity)=>({docs:matching().slice(0,n).map(([id,p])=>snapshot(id,p))});
     return {get:()=>get(),limit(n){return {get:()=>get(n)};}};
   }
  };
 },
 async runTransaction(fn){
  const operations=[];
  const tx={
   async get(ref){return ref.get();},
   set(ref,value,options){operations.push(()=>ref.set(value,options));},
   create(ref,value){operations.push(()=>ref.set(value));}
  };
  const result=await fn(tx);
  for(const op of operations)await op();
  return result;
 }
};
const endpoints=new Map();
installCommunitySocial({
 app:{
  get(path,middleware,handler){endpoints.set("GET "+path,handler);},
  post(path,middleware,handler){endpoints.set("POST "+path,handler);},
 },db,
 requireFirebaseUser() {},
 async loadUserProfile(uid){return users[uid]||null;},
 isApprovedAccount:p=>p?.status==="approved",
});
async function call(method,path,uid,body={},memberKey=""){
 let status=200,payload=null,headers={};
 const handler=endpoints.get(method+" "+path);
 assert(handler,"Handler missing: "+path);
 const req={firebaseUser:{uid},body,params:{memberKey}};
 const res={status(s){status=s;return this;},set(k,v){headers[k]=v;return this;},json(p){payload=p;return this;}};
 await handler(req,res);
 return {status,payload,headers};
}
const directory="/api/community/directory",self=directory+"/self",
 prefs=directory+"/preferences",member=directory+"/:memberKey",
 inbox="/api/community/chats",thread=inbox+"/:memberKey",
 block=thread+"/block",report=thread+"/report";
test("private last seen defaults OFF, online members show proper role and no UID",async()=>{
 const result=await call("GET",directory,"resident");
 assert.equal(result.status,200);
 assert.equal(result.payload.onlineCounts.residents,1);
 assert.equal(result.payload.onlineCounts.volunteers,1);
 assert.equal(result.payload.registeredCount,2);
 assert(result.payload.members.every(x=>x.lastSeenAt===null&&x.online));
 assert(!JSON.stringify(result.payload).includes('"uid":'));
 assert.equal((await call("GET",directory,"admin")).status,403);
});
test("only explicit consent reveals last-seen when offline",async()=>{
 const age=new Date(Date.now()-5*60*1000);
 collections.communityPresence.volunteer.updatedAt=age;
 let result=await call("GET",directory,"resident");
 assert.equal(result.payload.members.length,2);
 assert.equal((await call("POST",prefs,"volunteer",{showLastSeen:true})).status,200);
 result=await call("GET",directory,"resident");
 assert.equal(result.payload.members.length,2);
 const p=result.payload.members.find(x=>x.name==="Volunteer Sample");
 assert.equal(p.online,false);assert.equal(p.lastSeenAt,age.toISOString());
 assert.equal(p.badge,"Volunteer");
 assert.equal((await call("GET",member,"resident",{},publicKey("volunteer"))).payload.member.online,false);
 assert.equal((await call("POST",prefs,"volunteer",{showLastSeen:"true"})).status,400);
 assert.equal((await call("POST",prefs,"volunteer",{other:true})).status,400);
 collections.communityPresence.volunteer.updatedAt=new Date();
});
test("users can opt in and out of chat independently of last seen",async()=>{
 assert.equal((await call("GET",self,"resident")).payload.acceptChats,true);
 assert.equal((await call("POST",prefs,"resident",{acceptChats:false})).status,200);
 assert.equal((await call("GET",self,"resident")).payload.acceptChats,false);
 assert.equal((await call("POST",prefs,"resident",{acceptChats:true})).status,200);
 assert.equal((await call("GET",self,"resident")).payload.acceptChats,true);
});
test("authenticated chat sends only with mutual opt-in, reads only its thread",async()=>{
 const before=await call("GET",thread,"resident",{},publicKey("volunteer"));
 assert.equal(before.status,200);assert.deepEqual(before.payload.messages,[]);
 const send=await call("POST",thread,"resident",{text:"Hello, volunteer!"},publicKey("volunteer"));
 assert.equal(send.status,200);
 const sent=await call("GET",thread,"volunteer",{},publicKey("resident"));
 assert.equal(sent.payload.messages.length,1);
 assert.equal(sent.payload.messages[0].text,"Hello, volunteer!");
 assert.equal(sent.payload.messages[0].fromMe,false);
 assert.equal((await call("GET",inbox,"volunteer")).payload.conversations[0].peer.name,"Resident Sample");
 assert.equal((await call("POST",thread,"admin",{text:"x"},publicKey("resident"))).status,403);
 assert.equal((await call("POST",thread,"resident",{text:""},publicKey("volunteer"))).status,400);
 assert.equal((await call("GET",thread,"resident",{},publicKey("resident"))).status,404);
 assert.equal(typeof conversationId("resident","volunteer"),"string");
});
test("limits flood and allows the recipient to block, report, and opt out",async()=>{
 const immediate=await call("POST",thread,"resident",{text:"Too quick"},publicKey("volunteer"));
 assert.equal(immediate.status,429);
 assert.equal((await call("POST",block,"volunteer",{blocked:true},publicKey("resident"))).status,200);
 assert.equal((await call("POST",thread,"resident",{text:"Blocked"},publicKey("volunteer"))).status,403);
 assert.equal((await call("POST",report,"volunteer",{reason:"harassment"},publicKey("resident"))).status,200);
 assert.equal(Object.keys(collections.communityChatReports).length,1);
 assert.equal((await call("POST",block,"volunteer",{blocked:false},publicKey("resident"))).status,200);
 assert.equal((await call("POST",prefs,"volunteer",{acceptChats:false})).status,200);
 assert.equal((await call("POST",thread,"resident",{text:"No consent"},publicKey("volunteer"))).status,403);
 const prev=await call("GET",thread,"resident",{},publicKey("volunteer"));
 assert.equal(prev.status,200);assert.equal(prev.payload.canSend,false);
});
test("turning off presence does not remove an approved member from directory",async()=>{
 collections.communityPresence.volunteer.visible=false;
 const result=await call("GET",directory,"resident");
 assert.equal(result.payload.members.length,2);
 const volunteer=result.payload.members.find(x=>x.name==="Volunteer Sample");
 assert(volunteer);assert.equal(volunteer.online,false);
 assert.equal(volunteer.presencePrivate,true);
 assert.equal(volunteer.lastSeenAt,null);
 assert.equal((await call("GET",member,"resident",{},publicKey("volunteer"))).status,200);
 collections.communityPresence.volunteer.visible=true;
});

test("basic residents appear automatically; profile photo stays consent-based",async()=>{
 // A never-online approved Basic Resident must appear automatically.
 users.newbie={role:"resident",status:"approved",residentAccess:true,
   activeMode:"resident",fullName:"Basic User",profilePictureUrl:"https://res.cloudinary.com/test/image/upload/pic.jpg"};
 collections.communityPresence.newbie={visible:false,showLastSeen:false,
   acceptChats:false,mode:"resident",verified:false,displayName:"Basic User"};
 let result=await call("GET",directory,"resident");
 const initial=result.payload.members.find(x=>x.name==="Basic User");
 assert(initial,"new approved Basic Resident should appear immediately");
 assert.equal(initial.online,false);assert.equal(initial.presencePrivate,true);
 assert.equal(initial.avatarUrl,"","profile photo remains private without opt-in");
 assert.equal((await call("GET",self,"newbie")).payload.directoryListed,false);
 assert.equal((await call("POST",prefs,"newbie",{directoryListed:true})).status,200);
 result=await call("GET",directory,"resident");
 const entry=result.payload.members.find(x=>x.name==="Basic User");
 assert(entry,"offline opted-in Basic Resident must be discoverable");
 assert.equal(entry.online,false);
 assert.equal(entry.lastSeenAt,null);
 assert.equal(entry.badge,"Basic Resident");
 assert.equal(entry.acceptChats,false);
 assert(entry.avatarUrl.includes("cloudinary.com"),"approved photo consent should make avatar available");
 assert.equal((await call("GET",member,"resident",{},publicKey("newbie"))).payload.member.name,"Basic User");
 assert(!JSON.stringify(result.payload).includes('"uid":'));
 assert.equal((await call("POST",prefs,"newbie",{directoryListed:"yes"})).status,400);
});
test("offline directory persists beyond the historical 7-day last-seen cap",async()=>{
 collections.communityPresence.newbie.updatedAt=new Date(Date.now()-18*86400000);
 collections.communityPresence.newbie.showLastSeen=false;
 let result=await call("GET",directory,"resident");
 assert(result.payload.members.some(x=>x.name==="Basic User"));
 assert.equal(result.payload.members.find(x=>x.name==="Basic User").lastSeenAt,null);
 // Offline presence and directory-photo preference never remove approved members.
 collections.communityPresence.newbie.directoryListed=false;
 result=await call("GET",directory,"resident");
 assert(result.payload.members.some(x=>x.name==="Basic User"));
 assert.equal(result.payload.members.find(x=>x.name==="Basic User").avatarUrl,"");
 collections.communityPresence.newbie.directoryListed=true;
});
test("directory opt-in cannot resurrect unapproved or administrator accounts",async()=>{
 users.revoked={role:"resident",status:"suspended",residentAccess:true,fullName:"Revoked User"};
 users.admin={role:"admin",status:"approved",residentAccess:false,fullName:"Admin User"};
 collections.communityPresence.revoked={visible:false,directoryListed:true,
   mode:"resident",displayName:"Revoked User",updatedAt:new Date()};
 collections.communityPresence.admin={visible:false,directoryListed:true,
   mode:"resident",displayName:"Admin User",updatedAt:new Date()};
 const result=await call("GET",directory,"resident");
 assert(!result.payload.members.some(p=>p.name==="Revoked User"||p.name==="Admin User"));
 assert.equal((await call("POST",prefs,"admin",{directoryListed:true})).status,403);
 assert.equal((await call("POST",prefs,"revoked",{directoryListed:true})).status,403);
});
test("profile-photo opt-out keeps basic member name while protecting online and chat",async()=>{
 const before=await call("GET",self,"newbie");
 assert.equal(before.payload.directoryListed,true);
 assert.equal((await call("POST",prefs,"newbie",{directoryListed:false})).status,200);
 assert.equal((await call("GET",self,"newbie")).payload.directoryListed,false);
 assert.equal(collections.communityPresence.newbie.visible,false);
 assert.equal(collections.communityPresence.newbie.acceptChats,false);
 const row=(await call("GET",directory,"resident")).payload.members.find(x=>x.name==="Basic User");
 assert(row);assert.equal(row.avatarUrl,"");assert.equal(row.online,false);
});

test("active counts include private sessions while approved names and roles are discoverable",async()=>{
 users.privateMember={role:"resident",status:"approved",residentAccess:true,
   activeMode:"resident",fullName:"Private User",email:"secret@example.com",phoneNumber:"09123456789",address:"Private Location",identityNumber:"SECRET"};
 collections.communityPresence.privateMember={visible:false,directoryListed:false,
   activeMode:"resident",activeAt:new Date(),acceptChats:false,mode:"resident",
   displayName:"DO NOT SHOW ME",updatedAt:new Date(0)};
 const result=await call("GET",directory,"resident");
 assert.equal(result.status,200);
 assert.equal(result.payload.activeCounts.residents,1);
 assert.equal(result.payload.activeCounts.total,1);
 assert(!result.payload.members.some(x=>x.name==="DO NOT SHOW ME"));
 const privateRow=result.payload.members.find(x=>x.name==="Private User");
 assert(privateRow);assert.equal(privateRow.presencePrivate,true);
 assert.equal(privateRow.online,false);assert.equal(privateRow.lastSeenAt,null);
 assert.equal(privateRow.acceptChats,false);
 for(const secret of ["secret@example.com","09123456789","Private Location","SECRET"]){
   assert(!JSON.stringify(result.payload).includes(secret),"private field must be excluded");
 }
 assert(!JSON.stringify(result.payload).includes("privateMember"));
 assert.equal(result.payload.registeredCount,4);
 assert.equal((await call("GET",member,"resident",{},publicKey("privateMember"))).status,200);
});
test("registered count matches automatically listed eligible members without sensitive fields",async()=>{
 users.hidden={role:"resident",status:"approved",residentAccess:true,
   activeMode:"resident",fullName:"Private Resident",email:"never-expose@example.com"};
 users.deleted={role:"resident",status:"approved",residentAccess:true,
   fullName:"Removed Account",deleted:true};
 collections.communityPresence.hidden={visible:false,directoryListed:false,
   displayName:"Private Resident",mode:"resident",updatedAt:new Date(0)};
 const result=await call("GET",directory,"resident");
 assert.equal(result.status,200);
 assert.equal(result.payload.registeredCount,5);
 assert.equal(result.payload.registeredCount,result.payload.members.length);
 assert(result.payload.members.some(x=>x.name==="Private Resident"));
 for(const secret of ["Removed Account","never-expose@example.com",'"uid":']){
   assert(!JSON.stringify(result.payload.members).includes(secret),secret+" must not be exposed");
 }
 assert.equal((await call("GET",member,"resident",{},publicKey("hidden"))).status,200);
 delete users.hidden;delete users.deleted;delete collections.communityPresence.hidden;
});
test("20 more registered offline members appear without requiring presence or re-login",async()=>{
 const count=20;
 for(let i=0;i<count;i++){
   const uid="offline_member_"+i;
   users[uid]={role:"resident",status:"approved",residentAccess:true,activeMode:"resident",
     fullName:"Offline Member "+String(i).padStart(2,"0"),email:"private_"+i+"@example.com"};
 }
 const result=await call("GET",directory,"resident");
 assert.equal(result.status,200);
 assert.equal(result.payload.members.filter(x=>x.name.startsWith("Offline Member ")).length,count);
 assert.equal(result.payload.registeredCount,result.payload.members.length);
 assert(result.payload.members.filter(x=>x.name.startsWith("Offline Member "))
   .every(x=>x.online===false&&x.presencePrivate===true&&x.lastSeenAt===null));
 assert(!JSON.stringify(result.payload).includes("private_0@example.com"));
 for(let i=0;i<count;i++)delete users["offline_member_"+i];
});
test("expired, rejected and Admin sessions are excluded from active totals",async()=>{
 users.rejected={role:"resident",status:"suspended",residentAccess:true,
   activeMode:"resident",fullName:"Rejected Member"};
 collections.communityPresence.rejected={activeAt:new Date(),activeMode:"resident"};
 collections.communityPresence.admin.activeAt=new Date();
 collections.communityPresence.privateMember.activeAt=new Date(Date.now()-6*60*1000);
 const result=await call("GET",directory,"resident");
 assert.equal(result.payload.activeCounts.total,0);
 assert(!JSON.stringify(result.payload).includes("Rejected Member"));
});
