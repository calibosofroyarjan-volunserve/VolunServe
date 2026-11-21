"use strict";
/**
 * VolunServe opt-in community presence, operated entirely through the
 * authenticated backend. Existing Firestore rules are not relaxed.
 *
 * Online means a recent authenticated heartbeat from an approved account.
 * Each heartbeat uses the canonical server-side activeMode, not a client role.
 * No IP, location, email, phone, residence address, verification IDs or
 * incident data are exposed to any viewer.
 */
const crypto = require("node:crypto");
const FRESH_MS = 100 * 1000;
const WRITE_INTERVAL_MS = 20 * 1000;
const MAX_RESULTS = 72;
const clean = (v,n=100)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,n);
const publicKey = uid => crypto.createHash("sha256")
  .update("volunserve-public-member-v1:"+uid).digest("hex").slice(0,24);
const permitted = p => Boolean(p && !["admin","superadmin","lgu_personnel","applicant"].includes(
  String(p.role||"").toLowerCase()) && (p.residentAccess===true ||
  (p.volunteerAccess===true && p.volunteerStatus==="approved")));
const canonicalMode = p => p.activeMode==="volunteer" && p.volunteerAccess===true &&
  p.volunteerStatus==="approved" ? "volunteer" : "resident";
const safePhoto = value => {
  const url=String(value||"").trim();
  return /^https:\/\/(?:res\.cloudinary\.com|lh3\.googleusercontent\.com|firebasestorage\.googleapis\.com)\//i.test(url)
    ? url.slice(0,1024) : "";
};
const millis = value => value?.toMillis?.() ?? (value?.toDate?.()?.getTime?.() ??
  (value instanceof Date ? value.getTime() : new Date(value||0).getTime()));
const safeDisplay = (uid,p) => ({
  key:publicKey(uid),
  name:clean(p.displayName||p.fullName||"Community member",100),
  avatarUrl:safePhoto(p.avatarUrl||p.profilePictureUrl),
  mode:p.mode==="volunteer"?"volunteer":"resident",
  verified:p.verified===true,
  badge:p.mode==="volunteer"?"Volunteer":p.verified===true?"Verified Resident":"Basic Resident",
  online:true,
});
function installCommunityPresence({app,db,requireFirebaseUser,loadUserProfile,isApprovedAccount}) {
  const authorized = async (req,res) => {
    const p=await loadUserProfile(req.firebaseUser.uid);
    if(!isApprovedAccount(p)||!permitted(p)) {
      res.status(403).json({ok:false,message:"Approved Resident or Volunteer access required."});
      return null;
    }
    return p;
  };
  const getActive = async () => {
    const since = new Date(Date.now()-FRESH_MS);
    const snap = await db.collection("communityPresence").where("updatedAt",">=",since)
      .limit(MAX_RESULTS).get();
    return (snap.docs||[]).filter(d => {
      const p=d.data()||{};
      return p.visible===true &&
        ["resident","volunteer"].includes(p.mode) &&
        Number.isFinite(millis(p.updatedAt)) &&
        millis(p.updatedAt)>=Date.now()-FRESH_MS;
    }).map(d=>({uid:d.id,raw:d.data()}));
  };
  app.get("/api/community/presence",requireFirebaseUser,async(req,res)=>{
    try {
      if(!await authorized(req,res))return;
      const rows=await getActive();
      const members=rows.map(({uid,raw})=>safeDisplay(uid,raw));
      members.sort((a,b)=>a.name.localeCompare(b.name)||a.key.localeCompare(b.key));
      res.set("Cache-Control","no-store");
      return res.json({ok:true,members,counts:{
        residents:members.filter(p=>p.mode==="resident").length,
        volunteers:members.filter(p=>p.mode==="volunteer").length,
      },sampleLimit:MAX_RESULTS,heartbeatExpirySeconds:FRESH_MS/1000});
    }catch(error){console.error("Presence list failed",error?.message);
      return res.status(500).json({ok:false,message:"Presence is temporarily unavailable."});}
  });
  app.get("/api/community/presence/self",requireFirebaseUser,async(req,res)=>{
    try {
      if(!await authorized(req,res))return;
      const record=await db.collection("communityPresence").doc(req.firebaseUser.uid).get();
      res.set("Cache-Control","no-store");
      return res.json({ok:true,visible:record.exists&&record.data()?.visible===true});
    }catch(error){return res.status(500).json({ok:false,message:"Cannot load presence setting."});}
  });
  app.post("/api/community/presence/visibility",requireFirebaseUser,async(req,res)=>{
    try {
      const p=await authorized(req,res);if(!p)return;
      // Must be an actual boolean; the browser may never set another user's state.
      if(typeof req.body?.visible!=="boolean")
        return res.status(400).json({ok:false,message:"A boolean visibility value is required."});
      const visible=req.body.visible;
      const document=db.collection("communityPresence").doc(req.firebaseUser.uid);
      if(!visible) {
        await document.set({visible:false,updatedAt:new Date(0)},{merge:true});
      }else{
        const verified=p.identityVerified===true || p.identityStatus==="verified";
        await document.set({
          visible:true,
          mode:canonicalMode(p),
          verified,
          displayName:clean(p.fullName||[p.firstName,p.lastName].filter(Boolean).join(" ")||
            req.firebaseUser.name||"Community member",100),
          avatarUrl:safePhoto(p.profilePictureUrl),
          updatedAt:new Date(),activeAt:new Date(),activeMode:canonicalMode(p),
        },{merge:true});
      }
      return res.json({ok:true,visible});
    }catch(error){console.error("Presence opt-in failed",error?.message);
      return res.status(500).json({ok:false,message:"Cannot change online visibility."});}
  });
  app.post("/api/community/presence/heartbeat",requireFirebaseUser,async(req,res)=>{
    try {
      const p=await authorized(req,res);if(!p)return;
      const record=db.collection("communityPresence").doc(req.firebaseUser.uid);
      const old=await record.get();
      const previous=old.exists?old.data()||{}:{};
      const mode=canonicalMode(p);
      const visible=previous.visible===true;
      const active=millis(previous.activeAt);
      const now=Date.now();
      const needsActivity=!Number.isFinite(active)||now-active>=WRITE_INTERVAL_MS||
        previous.activeMode!==mode;
      // Anonymous aggregate activity: record only the signed-in approved UID,
      // current mode and timestamp. Never publish a hidden user's identity,
      // profile picture or last-seen timestamp in a public directory.
      if(!visible) {
        if(needsActivity)await record.set({
          activeAt:new Date(now),activeMode:mode,
        },{merge:true});
        return res.json({ok:true,visible:false});
      }
      const verified=p.identityVerified===true || p.identityStatus==="verified";
      const last=millis(previous.updatedAt);
      if(mode!==previous.mode || verified!==previous.verified ||
        !Number.isFinite(last) || now-last>=WRITE_INTERVAL_MS || needsActivity) {
        await record.set({
          mode,verified,visible:true,
          displayName:clean(p.fullName||[p.firstName,p.lastName].filter(Boolean).join(" ")||
            req.firebaseUser.name||"Community member",100),
          avatarUrl:safePhoto(p.profilePictureUrl),updatedAt:new Date(now),
          activeAt:new Date(now),activeMode:mode,
        },{merge:true});
      }
      return res.json({ok:true,visible:true,mode});
    }catch(error){console.error("Presence heartbeat failed",error?.message);
      return res.status(500).json({ok:false,message:"Cannot update presence."});}
  });
  app.get("/api/community/members/:memberKey",requireFirebaseUser,async(req,res)=>{
    try {
      if(!await authorized(req,res))return;
      const key=clean(req.params.memberKey,32);
      if(!/^[a-f0-9]{24}$/.test(key))
        return res.status(400).json({ok:false,message:"Invalid community member link."});
      const rows=await getActive();
      const match=rows.find(row=>publicKey(row.uid)===key);
      if(!match)return res.status(404).json({ok:false,message:"Member is no longer online or public."});
      res.set("Cache-Control","no-store");
      return res.json({ok:true,member:safeDisplay(match.uid,match.raw)});
    }catch(error){return res.status(500).json({ok:false,message:"Member profile unavailable."});}
  });
}
module.exports={installCommunityPresence,publicKey,canonicalMode,safeDisplay};
