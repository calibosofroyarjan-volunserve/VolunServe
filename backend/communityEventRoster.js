"use strict";

/**
 * Read-only, privacy-limited volunteer roster.
 * Firestore participant rules remain owner-only: only the Admin backend
 * reads full attendance records and returns display-safe fields.
 */
const crypto = require("node:crypto");

function installCommunityEventRoster({ app, db, requireFirebaseUser, loadUserProfile, isApprovedAccount }) {
  app.get("/api/community-events/:eventId/volunteers", requireFirebaseUser, async (req, res) => {
    try {
      const eventId = String(req.params.eventId || "").trim();
      const rawPage = String(req.query.page || "1");
      if (!/^[a-zA-Z0-9_-]{1,160}$/.test(eventId) || !/^[1-9][0-9]{0,2}$/.test(rawPage)) {
        return res.status(400).json({ok:false, message:"Invalid event or page."});
      }
      const page = Number(rawPage);
      const viewer = await loadUserProfile(req.firebaseUser.uid);
      if (!isApprovedAccount(viewer) ||
          viewer?.volunteerAccess !== true ||
          viewer?.volunteerStatus !== "approved" ||
          viewer?.activeMode !== "volunteer") {
        return res.status(403).json({ok:false, message:"Approved Volunteer mode required to view joined volunteers."});
      }
      const eventSnap = await db.collection("communityEvents").doc(eventId).get();
      if (!eventSnap.exists || eventSnap.data()?.publicationStatus !== "published") {
        return res.status(404).json({ok:false, message:"Published community event not found."});
      }
      // Single-field eventId index only; no new composite index or rules deploy.
      // Capacity is limited to 500 in the existing production event schema.
      const records = await db.collection("communityEventParticipants")
        .where("eventId", "==", eventId).limit(500).get();
      const joined = records.docs.filter(doc => doc.data()?.status === "joined")
        .sort((a,b) => {
          const t = v => v.data()?.joinedAt?.toMillis?.() || 0;
          return t(a)-t(b) || a.id.localeCompare(b.id);
        });
      const pageSize = 5;
      const total = joined.length;
      const pageItems = joined.slice((page-1)*pageSize,page*pageSize);
      const volunteers = await Promise.all(pageItems.map(async item => {
        const entry = item.data() || {};
        const uid = typeof entry.uid === "string" ? entry.uid : "";
        const profileSnap = uid ? await db.collection("users").doc(uid).get() : null;
        const person = profileSnap?.exists ? profileSnap.data() : {};
        const rawName = String(person?.fullName || entry.fullName || "Volunteer").trim();
        const name = rawName.slice(0,120) || "Volunteer";
        const rawPhoto = String(person?.profilePictureUrl || "");
        // Only display public avatar origins (not identity verification images).
        const avatarUrl = /^https:\/\/(?:res\.cloudinary\.com|lh3\.googleusercontent\.com|firebasestorage\.googleapis\.com)\//i.test(rawPhoto)
          ? rawPhoto.slice(0,1024) : "";
        return {
          key: crypto.createHash("sha256").update(eventId+":"+uid).digest("hex").slice(0,16),
          name, avatarUrl, status:"Joined",
        };
      }));
      return res.json({ok:true,eventId,page,pageSize,total,totalPages:Math.ceil(total/pageSize),volunteers});
    } catch (error) {
      console.error("Community Event roster read failed:",error?.message);
      return res.status(500).json({ok:false,message:"Unable to load joined volunteers."});
    }
  });
}

module.exports = { installCommunityEventRoster };
