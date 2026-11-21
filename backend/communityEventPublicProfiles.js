"use strict";

/**
 * Read-only, shared-event public volunteer portfolio.
 * NOT an account profile API: intentionally excludes email, phone, address,
 * ID photos, private case descriptions, attendance timestamps and certificate IDs.
 * Only an approved volunteer who joined the same published event may view it.
 */
const crypto = require("node:crypto");

const clean = (v, max = 130) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const millis = v => typeof v?.toMillis === "function" ? v.toMillis()
  : typeof v === "string" ? (Date.parse(v) || 0) : 0;
const date = v => { const n=millis(v); return n>0 ? new Date(n).toISOString().slice(0,10) : null; };
const count = v => { const n=Number(v); return Number.isFinite(n) ? Math.min(100000,Math.max(0,Math.round(n))) : 0; };
const keyFor = (eventId,uid) => crypto.createHash("sha256").update(eventId+":"+uid).digest("hex").slice(0,16);
function eventMinutes(p) {
  if(p.status!=="joined" || p.attendanceVerified!==true) return 0;
  const a=millis(p.checkedInAt), b=millis(p.checkedOutAt);
  return a>0 && b>=a && b-a<=86400000 ? Math.floor((b-a)/60000) : 0;
}
const asArray = snap => (snap.docs||[]).map(d=>({id:d.id,...(d.data()||{})}));
const read = (db,collection,field,value) =>
  db.collection(collection).where(field,"==",value).limit(200).get().then(asArray);
function installCommunityEventPublicProfiles({app, db, requireFirebaseUser, loadUserProfile, isApprovedAccount}) {
  app.get("/api/community-events/:eventId/volunteers/:member/profile", requireFirebaseUser, async (req,res)=>{
    try {
      const eventId=clean(req.params.eventId,160), member=clean(req.params.member,32);
      if(!/^[a-zA-Z0-9_-]{1,160}$/.test(eventId)||!/^[a-f0-9]{16}$/.test(member))
        return res.status(400).json({ok:false,message:"Invalid event participant link."});
      const viewer = await loadUserProfile(req.firebaseUser.uid);
      if(!isApprovedAccount(viewer)||viewer?.volunteerAccess!==true||
        viewer?.volunteerStatus!=="approved"||viewer?.activeMode!=="volunteer")
        return res.status(403).json({ok:false,message:"Approved Volunteer mode required."});
      const eventSnap=await db.collection("communityEvents").doc(eventId).get();
      if(!eventSnap.exists||eventSnap.data()?.publicationStatus!=="published")
        return res.status(404).json({ok:false,message:"Published event not found."});

      const eventMembers=asArray(await db.collection("communityEventParticipants")
        .where("eventId","==",eventId).limit(500).get())
        .filter(p=>p.status==="joined" && typeof p.uid==="string");
      const mine=eventMembers.some(p=>p.uid===req.firebaseUser.uid);
      // Do not expose an event participant's volunteer history to strangers.
      if(!mine)return res.status(403).json({ok:false,message:"Join this event to view participants' public profiles."});
      const target=eventMembers.find(p=>keyFor(eventId,p.uid)===member);
      if(!target)return res.status(404).json({ok:false,message:"Volunteer is no longer joined to this event."});
      const uid=target.uid;
      const [profileSnap,contributions,participations,certByUser,certByVolunteer]=await Promise.all([
        db.collection("users").doc(uid).get(),
        read(db,"verifiedContributions","volunteerId",uid),
        read(db,"communityEventParticipants","uid",uid),
        read(db,"certificates","userId",uid),
        read(db,"certificates","volunteerId",uid),
      ]);
      const profile=profileSnap.exists ? profileSnap.data()||{} : {};
      const name=clean(profile.fullName||target.fullName||"Volunteer",120)||"Volunteer";
      const rawPhoto=String(profile.profilePictureUrl||"");
      const avatarUrl=/^https:\/\/(?:res\.cloudinary\.com|lh3\.googleusercontent\.com|firebasestorage\.googleapis\.com)\//i.test(rawPhoto)
        ? rawPhoto.slice(0,1024) : "";

      const certificateMap=new Map();
      for(const c of [...certByUser,...certByVolunteer]) {
        if(c.verificationStatus!=="issued" || !["community_event_participation","verified_volunteer_service"].includes(c.certificateType))continue;
        certificateMap.set(c.id,c);
      }
      const certificates=[...certificateMap.values()].sort((a,b)=>millis(b.issuedAt)-millis(a.issuedAt)).map(c=>({
        title:clean(c.certificateTitle|| (c.certificateType==="community_event_participation"
          ? "Certificate of Participation" : "Certificate of Volunteer Service"),100),
        certificateId:clean(c.certificateId || c.id,100),
        eventTitle:clean(c.eventTitle,120),
        eventDate:clean(c.eventDate,32),
        eventBarangay:clean(c.eventBarangay,90),
        eventLocation:clean(c.eventLocation,150),
        issuedAt:date(c.issuedAt),
        issuedByName:clean(c.issuedByName || "VolunServe Administrator",90),
        serviceMinutes:count(c.verifiedServiceMinutes),
        verifiedHelps:count(c.verifiedHelps),
        peopleHelped:count(c.peopleHelped),
        type:c.certificateType,
        status:"Issued",
      }));
      const eventIds=[...new Set(participations.filter(p=>p.status==="joined"&&typeof p.eventId==="string")
        .map(p=>p.eventId))].slice(0,150);
      const events=await Promise.all(eventIds.map(id=>db.collection("communityEvents").doc(id).get()));
      const eventById=new Map(events.filter(d=>d.exists&&d.data()?.publicationStatus==="published")
        .map(d=>[d.id,d.data()]));
      const earnedEventIds=new Set([...certificateMap.values()]
        .filter(c=>c.certificateType==="community_event_participation").map(c=>c.eventId));
      const seen=new Set();
      const progress=participations.filter(p=>{
        if(p.status!=="joined"||!eventById.has(p.eventId)||seen.has(p.eventId))return false;
        seen.add(p.eventId);return true;
      }).map(p=>{
        const e=eventById.get(p.eventId);const verifiedMinutes=eventMinutes(p);
        return {
          title:clean(e.title,120),date:clean(e.date,32),barangay:clean(e.barangay,80),
          verifiedMinutes,completed:e.status==="completed"&&p.attendanceVerified===true,
          certificateIssued:earnedEventIds.has(p.eventId),
          status:earnedEventIds.has(p.eventId)?"Certificate issued":e.status==="completed"
            ? (p.attendanceVerified===true?"Verified":"Not verified"):"Joined",
        };
      }).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      const verified=contributions.filter(c=>c.status==="verified");
      const activity=verified.sort((a,b)=>millis(b.verifiedAt)-millis(a.verifiedAt))
        .slice(0,50).map(c=>({
          title:"Verified volunteer assistance",type:clean(c.contributionType,80),
          outcome:clean(c.outcome,50),peopleHelped:count(c.peopleHelped),
          verifiedAt:date(c.verifiedAt||c.completedAt),
        }));
      const completedEvents=progress.filter(p=>p.completed).length;
      const verifiedMinutes=progress.reduce((sum,p)=>sum+p.verifiedMinutes,0);
      const verifiedHelps=verified.filter(c=>["fully_helped","partially_helped"].includes(c.outcome)).length;
      res.json({
        ok:true,profile:{name,avatarUrl,role:"Volunteer",joinedEvent:true,
          accountJoinedAt:date(profile.createdAt),approved:true},
        summary:{joinedEvents:progress.length,completedEvents,verifiedMinutes,
          certificateCount:certificates.length,verifiedHelps},
        activity,progress,certificates,
        // Never return UID, private identity verification status, contact, case IDs,
        // private attendance check-in/check-out timestamps or home address.
      });
    }catch(err){
      console.error("Public volunteer profile read failed:",err?.message);
      return res.status(500).json({ok:false,message:"Unable to load volunteer portfolio."});
    }
  });
}
module.exports={installCommunityEventPublicProfiles};
