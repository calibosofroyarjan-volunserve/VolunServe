"use strict";
/**
 * Opt-in Last Seen and private 1:1 text chat. Runs solely behind Firebase ID
 * verification and existing Admin SDK: NO public Firestore rule changes.
 * Presence is shared only if the user is already visible; offline status
 * requires a separate explicit consent. Chat is an independent opt-in.
 */
const crypto=require("node:crypto");
const {publicKey,canonicalMode}=require("./communityPresence");
const FRESH_MS=100000, LAST_SEEN_MAX_MS=7*86400000;
const clean=(v,n=120)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,n);
const numberTime=v=>{
  if(!v)return 0;
  if(typeof v.toMillis==="function")return v.toMillis();
  if(typeof v.toDate==="function")return v.toDate().getTime();
  if(v instanceof Date)return v.getTime();
  const value=typeof v==="number"?v:new Date(v).getTime();
  return Number.isFinite(value)?value:0;
};
const keyMatches=v=>/^[a-f0-9]{24}$/.test(String(v||""));
const memberAllowed=p=>Boolean(p && !["admin","superadmin","lgu_personnel","applicant"].includes(String(p.role||"").toLowerCase()) &&
 (p.residentAccess===true || (p.volunteerAccess===true&&p.volunteerStatus==="approved")));
const permitted=(p,isApproved)=>isApproved(p)&&memberAllowed(p);
const safePhoto=v=>{
 const u=String(v||"").trim();
 return /^https:\/\/(?:res\.cloudinary\.com|lh3\.googleusercontent\.com|firebasestorage\.googleapis\.com)\//i.test(u)?u.slice(0,1024):"";
};
const display=(uid,p,now=Date.now())=>{
 const last=numberTime(p.updatedAt);
 const online=p.visible===true&&last>0&&now-last>=0&&now-last<FRESH_MS;
 const showOffline=p.showLastSeen===true;
 const name=clean(p.displayName||"Community member",100);
 const mode=p.mode==="volunteer"?"volunteer":"resident";
 return {
  key:publicKey(uid),name,avatarUrl:safePhoto(p.avatarUrl),mode,
  verified:p.verified===true,
  badge:mode==="volunteer"?"Volunteer":p.verified===true?"Verified Resident":"Basic Resident",
  online, lastSeenAt:showOffline&&last>0?new Date(last).toISOString():null,
  directoryListed:p.directoryListed===true,acceptChats:p.acceptChats===true,
 };
};
const conversationId=(a,b)=>crypto.createHash("sha256").update(
 "volunserve-1to1-chat-v1:"+[a,b].sort().join(":")).digest("hex");
const blockId=(owner,peer)=>crypto.createHash("sha256")
 .update("volunserve-user-chat-block-v1:"+owner+":"+peer).digest("hex");
const notFound=(res)=>res.status(404).json({ok:false,message:"This member is unavailable."});
function installCommunitySocial({app,db,requireFirebaseUser,loadUserProfile,isApprovedAccount}){
 const authViewer=async(req,res)=>{
  const p=await loadUserProfile(req.firebaseUser.uid);
  if(!permitted(p,isApprovedAccount)){
    res.status(403).json({ok:false,message:"Approved Resident or Volunteer account required."});return null;
  }
  return p;
 };
 const scan=async()=>{
  // Read ONLY existing opt-in presence/directory documents; never enumerate
  // users, Firebase Auth accounts or application records to populate the list.
  // Both single-field Firestore queries use default automatic indexes.
  const [shown,listed]=await Promise.all([
    db.collection("communityPresence").where("visible","==",true).get(),
    db.collection("communityPresence").where("directoryListed","==",true).get(),
  ]);
  const merged=new Map();
  for(const doc of [...shown.docs,...listed.docs])
    merged.set(doc.id,{uid:doc.id,p:doc.data()||{}});
  const now=Date.now(),candidates=[...merged.values()].filter(({p})=>{
    const elapsed=now-numberTime(p.updatedAt);
    const legacyPresent=p.visible===true && elapsed>=0 &&
      (elapsed<FRESH_MS||(p.showLastSeen===true&&elapsed<LAST_SEEN_MAX_MS));
    return ["resident","volunteer"].includes(p.mode) &&
      (p.directoryListed===true||legacyPresent);
  });
  // Recheck current approval/role on every read. Former, suspended or
  // rejected members are never leaked merely because a stale consent doc remains.
  const checked=await Promise.all(candidates.map(async row=>{
    const canonical=await loadUserProfile(row.uid);
    if(!permitted(canonical,isApprovedAccount))return null;
    return {...row,p:{
      ...row.p,
      mode:canonicalMode(canonical),
      verified:canonical.identityVerified===true||canonical.identityStatus==="verified",
    }};
  }));
  return checked.filter(Boolean);
 };
 const peerForKey=async(uid,key,includePast=true)=>{
   if(!keyMatches(key))return null;
   const active=(await scan()).find(x=>x.uid!==uid&&publicKey(x.uid)===key);
   if(active)return active;
   if(!includePast)return null;
   const conversations=await db.collection("communityChatConversations")
     .where("participants","array-contains",uid).limit(50).get();
   for(const d of conversations.docs){
     const ids=d.data()?.participants;
     if(!Array.isArray(ids)||!ids.includes(uid))continue;
     const peer=ids.find(id=>id!==uid&&typeof id==="string");
     if(peer&&publicKey(peer)===key) {
       const doc=await db.collection("communityPresence").doc(peer).get();
       return {uid:peer,p:doc.exists?doc.data()||{}:{}};
     }
   }
   return null;
 };
 const publicPeer=({uid,p})=>(p.visible===true||p.directoryListed===true)?
   display(uid,p):{key:publicKey(uid),name:"Community member",
    avatarUrl:"",mode:"resident",verified:false,badge:"Private",online:false,lastSeenAt:null,acceptChats:false};
 const isBlocked=async(a,b)=>{
   const pair=await Promise.all([
     db.collection("communityChatBlocks").doc(blockId(a,b)).get(),
     db.collection("communityChatBlocks").doc(blockId(b,a)).get(),
   ]);
   return pair.some(x=>x.exists&&x.data()?.blocked===true);
 };
 const canMessage=async(viewerId,viewerProfile,peer)=>{
   if(!peer||peer.uid===viewerId||!permitted(viewerProfile,isApprovedAccount))return false;
   const self=await db.collection("communityPresence").doc(viewerId).get();
   if(!self.exists||self.data()?.acceptChats!==true||
      (self.data()?.visible!==true&&self.data()?.directoryListed!==true))return false;
   if(peer.p.acceptChats!==true||
      (peer.p.visible!==true&&peer.p.directoryListed!==true))return false;
   // Legacy online-only profiles expire; explicit directory listings persist.
   const last=numberTime(peer.p.updatedAt);
   if(peer.p.directoryListed!==true &&
      (last<=0||Date.now()-last>=LAST_SEEN_MAX_MS))return false;
   const canonical=await loadUserProfile(peer.uid);
   if(!permitted(canonical,isApprovedAccount))return false;
   return !(await isBlocked(viewerId,peer.uid));
 };
 const thread=async(uid,peerId)=>{
   const id=conversationId(uid,peerId);
   const ref=db.collection("communityChatConversations").doc(id);
   const doc=await ref.get();
   const ids=doc.data()?.participants;
   const valid=doc.exists && Array.isArray(ids)&&ids.length===2&&ids.includes(uid)&&ids.includes(peerId);
   return {id,ref,doc,exists:valid};
 };
 const errorResponse=(res,error,kind)=>{
   console.error(kind,error?.message);
   return res.status(500).json({ok:false,message:kind+" is temporarily unavailable."});
 };
 app.get("/api/community/directory",requireFirebaseUser,async(req,res)=>{
   try{
     if(!await authViewer(req,res))return;
     const rows=await scan(),now=Date.now();
     const entries=rows.map(({uid,p})=>({...display(uid,p,now),isSelf:uid===req.firebaseUser.uid}))
       .sort((a,b)=>Number(b.online)-Number(a.online)||
         (b.lastSeenAt||"").localeCompare(a.lastSeenAt||"")||a.name.localeCompare(b.name));
     res.set("Cache-Control","private, no-store");
     res.json({ok:true,members:entries,
       onlineCounts:{residents:entries.filter(x=>x.online&&x.mode==="resident").length,
         volunteers:entries.filter(x=>x.online&&x.mode==="volunteer").length},
       listedCount:entries.length});
   }catch(e){errorResponse(res,e,"Community directory");}
 });
 app.get("/api/community/directory/self",requireFirebaseUser,async(req,res)=>{
   try{
     if(!await authViewer(req,res))return;
     const d=await db.collection("communityPresence").doc(req.firebaseUser.uid).get(),p=d.data()||{};
     res.set("Cache-Control","private, no-store");
     res.json({ok:true,visible:p.visible===true,directoryListed:p.directoryListed===true,showLastSeen:p.showLastSeen===true,acceptChats:p.acceptChats===true});
   }catch(e){errorResponse(res,e,"Directory preferences");}
 });
 app.post("/api/community/directory/preferences",requireFirebaseUser,async(req,res)=>{
   try{
     const account=await authViewer(req,res);if(!account)return;
     const options={};
     for(const k of ["showLastSeen","acceptChats","directoryListed"]){
       if(Object.prototype.hasOwnProperty.call(req.body||{},k)){
         if(typeof req.body[k]!=="boolean")return res.status(400).json({ok:false,message:"Invalid preference value."});
         options[k]=req.body[k];
       }
     }
     if(!Object.keys(options).length||Object.keys(req.body||{}).some(k=>!["showLastSeen","acceptChats","directoryListed"].includes(k)))
       return res.status(400).json({ok:false,message:"Only consent preferences can be changed."});
     if(options.directoryListed===true){
       // Consent is explicit; hydrate only public values from the signed-in
       // approved account. Never copy contact, ID, address or location fields.
       options.mode=canonicalMode(account);
       options.verified=account.identityVerified===true||account.identityStatus==="verified";
       options.displayName=clean(account.fullName||
         [account.firstName,account.lastName].filter(Boolean).join(" ")||
         req.firebaseUser.name||"Community member",100);
       options.avatarUrl=safePhoto(account.profilePictureUrl);
       // updatedAt is useful for existing chat compatibility but does NOT
       // expose online status while visible=false.
       options.updatedAt=new Date();
     }
     await db.collection("communityPresence").doc(req.firebaseUser.uid).set(options,{merge:true});
     res.json({ok:true,showLastSeen:options.showLastSeen,acceptChats:options.acceptChats,directoryListed:options.directoryListed});
   }catch(e){errorResponse(res,e,"Directory preferences");}
 });
 app.get("/api/community/directory/:memberKey",requireFirebaseUser,async(req,res)=>{
   try{
     if(!await authViewer(req,res))return;
     const peer=await peerForKey(req.firebaseUser.uid,req.params.memberKey,false);
     if(!peer)return notFound(res);
     res.set("Cache-Control","private, no-store");
     res.json({ok:true,member:publicPeer(peer),self:false});
   }catch(e){errorResponse(res,e,"Public member profile");}
 });
 app.get("/api/community/chats",requireFirebaseUser,async(req,res)=>{
   try{
     if(!await authViewer(req,res))return;
     const uid=req.firebaseUser.uid;
     const snapshot=await db.collection("communityChatConversations")
       .where("participants","array-contains",uid).limit(50).get();
     const data=await Promise.all(snapshot.docs.map(async d=>{
       const c=d.data()||{};
       const peerId=Array.isArray(c.participants)?c.participants.find(id=>id!==uid):null;
       if(typeof peerId!=="string")return null;
       const p=await db.collection("communityPresence").doc(peerId).get();
       return {peer:publicPeer({uid:peerId,p:p.exists?p.data()||{}:{}}),
         lastMessage:clean(c.lastMessage,120),
         lastMessageAt:numberTime(c.updatedAt)>0?new Date(numberTime(c.updatedAt)).toISOString():null,
         lastSenderIsMe:c.lastSender===uid};
     }));
     const conversations=data.filter(Boolean)
       .sort((a,b)=>(b.lastMessageAt||"").localeCompare(a.lastMessageAt||""))
       .slice(0,30);
     res.set("Cache-Control","private, no-store");
     res.json({ok:true,conversations});
   }catch(e){errorResponse(res,e,"Inbox");}
 });
 app.get("/api/community/chats/:memberKey",requireFirebaseUser,async(req,res)=>{
   try{
     const viewer=await authViewer(req,res);if(!viewer)return;
     const uid=req.firebaseUser.uid;
     const peer=await peerForKey(uid,req.params.memberKey,true);
     if(!peer)return notFound(res);
     const c=await thread(uid,peer.uid);
     const sendAllowed=await canMessage(uid,viewer,peer);
     const ownBlock=await db.collection("communityChatBlocks").doc(blockId(uid,peer.uid)).get();
     if(!c.exists&&!sendAllowed)return notFound(res);
     let messages=[];
     if(c.exists){
       const snapshot=await c.ref.collection("messages").orderBy("createdAt","desc").limit(40).get();
       messages=snapshot.docs.map(d=>{
         const p=d.data()||{};
         return {id:d.id,text:clean(p.text,500),
           fromMe:p.senderUid===uid,
           sentAt:numberTime(p.createdAt)>0?new Date(numberTime(p.createdAt)).toISOString():null};
       }).reverse();
     }
     res.set("Cache-Control","private, no-store");
     res.json({ok:true,member:publicPeer(peer),canSend:sendAllowed,blockedByMe:ownBlock.exists&&ownBlock.data()?.blocked===true,messages});
   }catch(e){errorResponse(res,e,"Conversation");}
 });
 app.post("/api/community/chats/:memberKey",requireFirebaseUser,async(req,res)=>{
   try{
     const viewer=await authViewer(req,res);if(!viewer)return;
     const uid=req.firebaseUser.uid;
     const key=String(req.params.memberKey||"");
     if(!keyMatches(key))return res.status(400).json({ok:false,message:"Invalid recipient."});
     if(typeof req.body?.text!=="string"||!req.body.text.trim()||
       req.body.text.length>500||req.body.text.includes("\u0000"))
       return res.status(400).json({ok:false,message:"Message must contain 1–500 characters."});
     const text=clean(req.body.text,500);
     if(!text)return res.status(400).json({ok:false,message:"Message cannot be empty."});
     const peer=await peerForKey(uid,key,true);
     if(!peer)return notFound(res);
     if(!(await canMessage(uid,viewer,peer)))
       return res.status(403).json({ok:false,message:"Messaging is disabled, blocked or the recipient is no longer public."});
     const c=await thread(uid,peer.uid);
     const rateRef=db.collection("communityChatThrottle").doc(uid);
     const msgRef=c.ref.collection("messages").doc(crypto.randomUUID());
     const now=new Date();
     let result=null;
     await db.runTransaction(async tx=>{
       const [r,previous]=await Promise.all([tx.get(rateRef),tx.get(c.ref)]);
       const state=r.data()||{},last=numberTime(state.lastAt),minute=numberTime(state.minuteAt),
         day=numberTime(state.dayAt),ms=now.getTime();
       const minuteCount=ms-minute<60000?Number(state.minuteCount||0):0;
       const dayCount=ms-day<86400000?Number(state.dayCount||0):0;
       if(ms-last<1500||minuteCount>=8||dayCount>=75){
         result="slow_down";return;
       }
       // Validate this thread remains exactly the two authenticated participants.
       if(previous.exists){
         const old=previous.data()?.participants;
         if(!Array.isArray(old)||old.length!==2||!old.includes(uid)||!old.includes(peer.uid)){
           result="invalid_thread";return;
         }
       }
       tx.set(rateRef,{lastAt:now,minuteAt:minuteCount?state.minuteAt:now,
         minuteCount:minuteCount+1,dayAt:dayCount?state.dayAt:now,dayCount:dayCount+1},{merge:true});
       tx.set(c.ref,{participants:[uid,peer.uid].sort(),lastMessage:text.slice(0,120),
         lastSender:uid,updatedAt:now},{merge:true});
       tx.create(msgRef,{senderUid:uid,text,createdAt:now});
       result="ok";
     });
     if(result==="slow_down")return res.status(429).json({ok:false,message:"Please slow down before sending more messages."});
     if(result!=="ok")return res.status(409).json({ok:false,message:"Conversation could not be updated safely."});
     res.json({ok:true,id:msgRef.id,sentAt:now.toISOString()});
   }catch(e){errorResponse(res,e,"Send message");}
 });
 app.post("/api/community/chats/:memberKey/block",requireFirebaseUser,async(req,res)=>{
   try{
     if(!await authViewer(req,res))return;
     if(typeof req.body?.blocked!=="boolean")
       return res.status(400).json({ok:false,message:"A boolean block state is required."});
     const uid=req.firebaseUser.uid;
     const peer=await peerForKey(uid,req.params.memberKey,true);
     if(!peer)return notFound(res);
     await db.collection("communityChatBlocks").doc(blockId(uid,peer.uid))
       .set({blocked:req.body.blocked,updatedAt:new Date()},{merge:true});
     res.json({ok:true,blocked:req.body.blocked});
   }catch(e){errorResponse(res,e,"Block member");}
 });
 app.post("/api/community/chats/:memberKey/report",requireFirebaseUser,async(req,res)=>{
   try{
     if(!await authViewer(req,res))return;
     const uid=req.firebaseUser.uid;
     const peer=await peerForKey(uid,req.params.memberKey,true);
     if(!peer)return notFound(res);
     const c=await thread(uid,peer.uid);
     if(!c.exists)return res.status(404).json({ok:false,message:"No conversation to report."});
     const reason=String(req.body?.reason||"");
     if(!["spam","harassment","inappropriate","other"].includes(reason))
       return res.status(400).json({ok:false,message:"Select a valid report reason."});
     await db.collection("communityChatReports").add({
       reporterUid:uid,reportedUid:peer.uid,conversationId:c.id,reason,
       createdAt:new Date(),status:"pending"});
     res.json({ok:true,reported:true});
   }catch(e){errorResponse(res,e,"Report conversation");}
 });
}
module.exports={installCommunitySocial,display,numberTime,conversationId,blockId};
