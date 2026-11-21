import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Entry = { key: string; name: string; avatarUrl?: string; status: "Joined" };
type Response = { ok?: boolean; total?: number; totalPages?: number; volunteers?: Entry[]; message?: string };
type AuthUser = { getIdToken: () => Promise<string> };
// Matches the screen's already loaded EventInter font; no new modules or font assets.
const vsType = {
  family: "EventInter",
  size: { micro: 10, caption: 11, meta: 12, label: 13, body: 14, bodyStrong: 15, card: 16, section: 18, subheading: 20 },
} as const;

const API_URL = "https://volunserve.onrender.com";

/** Read-only event roster; the backend already limits this response to safe display fields. */
export default function CommunityEventRoster({
  eventId, viewer, participantsCount, compact = false, eventTitle,
}: { eventId: string; viewer: AuthUser; participantsCount: number; compact?: boolean; eventTitle?: string }) {
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [preview, setPreview] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<Response>({});

  useEffect(() => {
    setPage(1); setShowAll(false); setPreview(null); setData({});
  }, [eventId]);

  useEffect(() => {
    const interval = setInterval(() => setRefresh(v => v + 1), 20000);
    return () => clearInterval(interval);
  }, [eventId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const token = await viewer.getIdToken();
        const response = await fetch(`${API_URL}/api/community-events/${encodeURIComponent(eventId)}/volunteers?page=${page}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload: Response = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.message || "Unable to load joined volunteers.");
        if (active) { setData(payload); setError(""); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Volunteer list is unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [eventId, viewer, page, refresh, participantsCount]);

  const total = data.total ?? participantsCount;
  const pages = Math.max(1, data.totalPages || 1);
  const displayed = compact && !showAll ? data.volunteers?.slice(0, 3) : data.volunteers;

  return (
    <View style={[s.card, compact && s.cardCompact]}>
      <View style={s.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title}>{compact ? "Event Participants" : "Joined Volunteers"} ({total})</Text>
          {compact && !!eventTitle && <Text style={s.desc} numberOfLines={2}>{eventTitle}</Text>}
          {!compact && <Text style={s.desc}>Approved volunteers participating in this event</Text>}
        </View>
        <Pressable accessibilityRole="button" style={s.headerButton}
          onPress={() => compact ? setShowAll(x => !x) : setRefresh(x => x + 1)}>
          <Text style={s.headerButtonText}>{compact ? (showAll ? "Show less" : "View all") : "Refresh"}</Text>
          <Ionicons name={compact ? (showAll ? "chevron-up" : "arrow-forward") : "refresh-outline"}
            size={15} color="#087C69"/>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color="#087C69"/> :
        error ? <View style={s.errorBox}>
          <Text style={s.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => setRefresh(x => x + 1)}><Text style={s.retry}>Try again</Text></Pressable>
        </View> :
        !data.volunteers?.length ? <Text style={s.empty}>No joined volunteers to show yet.</Text> :
        displayed?.map(item => (
          <View key={item.key} style={s.person}>
            {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={s.avatar}/> :
              <View style={s.fallback}><Text style={s.initials}>
                {item.name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase()}
              </Text></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name} numberOfLines={1}>{item.name}</Text>
              <Text style={s.role}>Volunteer · Joined</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`View public profile of ${item.name}`}
              style={s.profileButton} onPress={() => setPreview(item)}>
              <Ionicons name="person-outline" size={14} color="#087C69"/>
              <Text style={s.profileButtonText}>View Profile</Text>
            </Pressable>
          </View>
        ))}

      {!loading && !error && compact && !showAll && total > 3 && (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={s.moreButton}>
          <Ionicons name="people-outline" size={16} color="#087C69"/>
          <Text style={s.moreText}>+ {total - 3} more volunteers</Text>
        </Pressable>
      )}
      {!loading && !error && pages > 1 && (!compact || showAll) && (
        <View style={s.paging}>
          <Pressable accessibilityRole="button" disabled={page <= 1} style={[s.pageButton, page <= 1 && s.disabled]}
            onPress={() => setPage(n => Math.max(1, n - 1))}><Text style={s.pageText}>Previous</Text></Pressable>
          <Text style={s.pageLabel}>{page} / {pages}</Text>
          <Pressable accessibilityRole="button" disabled={page >= pages} style={[s.pageButton, page >= pages && s.disabled]}
            onPress={() => setPage(n => Math.min(pages, n + 1))}><Text style={s.pageText}>Next</Text></Pressable>
        </View>
      )}
      {!compact && <Text style={s.privacy}>Only display names and approved public profile pictures are visible; personal contact and attendance data stay private.</Text>}

      <Modal transparent animationType="fade" visible={!!preview} onRequestClose={() => setPreview(null)}>
        <View style={s.backdrop}>
          <View style={s.modal}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close profile" onPress={() => setPreview(null)} style={s.close}>
              <Ionicons name="close-outline" size={22} color="#66818A"/>
            </Pressable>
            {preview?.avatarUrl ? <Image source={{uri: preview.avatarUrl}} style={s.largeAvatar}/> :
              <View style={s.largeFallback}><Ionicons name="person-outline" color="#087C69" size={42}/></View>}
            <Text style={s.profileName}>{preview?.name || "Volunteer"}</Text>
            <View style={s.tag}><Ionicons name="people-outline" size={15} color="#087C69"/>
              <Text style={s.tagText}>Volunteer · Joined this event</Text></View>
            <Text style={s.previewNote}>Public participant profile preview. Personal details, contact information, verification IDs and attendance records are private.</Text>
            <Pressable accessibilityRole="button" onPress={() => setPreview(null)} style={s.done}>
              <Text style={s.doneText}>Close Profile</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Small avatar group shown on event cards; only real roster images are rendered. */
export function CommunityEventAvatarPreview({
  eventId, viewer, participantsCount, onPress,
}: {eventId:string;viewer:AuthUser;participantsCount:number;onPress:()=>void}) {
  const [volunteers, setVolunteers] = useState<Entry[]>([]);
  const [count, setCount] = useState(participantsCount);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await viewer.getIdToken();
        const response = await fetch(`${API_URL}/api/community-events/${encodeURIComponent(eventId)}/volunteers?page=1`, {
          headers: {Authorization:`Bearer ${token}`},
        });
        if (!response.ok) return;
        const result: Response = await response.json();
        if (mounted && result.ok) {
          setVolunteers((result.volunteers || []).slice(0, 3));
          setCount(result.total ?? participantsCount);
        }
      } catch {
        // The event card keeps its public count and View Participants action.
      }
    })();
    return () => { mounted = false; };
  }, [eventId, viewer, participantsCount]);

  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${count} joined volunteers`}
    style={s.avatarPreviewButton} onPress={onPress}>
    <View style={s.avatarPreviewGroup}>
      {volunteers.length ? volunteers.map(person => person.avatarUrl ?
        <Image key={person.key} source={{uri:person.avatarUrl}} style={s.avatarPreviewPhoto}/> :
        <View key={person.key} style={s.avatarPreviewFallback}>
          <Text style={s.avatarPreviewInitial}>{person.name.trim().slice(0,1).toUpperCase()}</Text>
        </View>) : <Ionicons name="people-circle-outline" size={24} color="#087C69"/>}
      {count > 3 && <View style={s.avatarPreviewMore}><Text style={s.avatarPreviewMoreText}>+{count-3}</Text></View>}
    </View>
    <Text style={s.avatarPreviewText}>View Participants</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  avatarPreviewButton: { flexDirection:"row",gap:7,alignItems:"center",backgroundColor:"#F2FAF7",borderWidth:1,borderColor:"#B8DACE",borderRadius:8,paddingHorizontal:9,paddingVertical:6 },
  avatarPreviewGroup: { flexDirection:"row",alignItems:"center",gap:2 },
  avatarPreviewPhoto: { width:26,height:26,borderRadius:13 },
  avatarPreviewFallback: { width:26,height:26,borderRadius:13,backgroundColor:"#D8F1E6",alignItems:"center",justifyContent:"center" },
  avatarPreviewInitial: { fontSize:11,fontWeight:"700",color:"#087C69" },
  avatarPreviewMore: { paddingHorizontal:5,minHeight:26,borderRadius:13,backgroundColor:"#E1EAF0",alignItems:"center",justifyContent:"center" },
  avatarPreviewMoreText: { color:"#476370",fontSize:10,fontWeight:"700" },
  avatarPreviewText: { fontFamily:vsType.family,fontSize:11,fontWeight:"700",color:"#087C69" },

  card: { padding: 16, borderWidth: 1, borderColor: "#D6E9E1", borderRadius: 13, backgroundColor: "#FFFFFF", gap: 11, marginTop: 12 },
  cardCompact: { padding: 12, marginTop: 12, gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 31 },
  title: { fontFamily: vsType.family, fontSize: 16, fontWeight: "800", color: "#163D40" },
  desc: { fontFamily: vsType.family, fontSize: 12, color: "#698087", marginTop: 3 },
  headerButton: { flexDirection: "row", alignItems: "center", gap: 4, padding: 5 },
  headerButtonText: { fontFamily: vsType.family, fontSize: 12, fontWeight: "700", color: "#087C69" },
  person: { flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: "#E9F0ED", paddingTop: 10, paddingBottom: 3 },
  avatar: { width: 39, height: 39, borderRadius: 20 },
  fallback: { width: 39, height: 39, borderRadius: 20, backgroundColor: "#D7F2E7", alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: vsType.family, fontWeight: "800", color: "#087C69", fontSize: 13 },
  name: { fontFamily: vsType.family, fontSize: 13, fontWeight: "700", color: "#203F48" },
  role: { fontFamily: vsType.family, fontSize: 11, color: "#607D7E", marginTop: 3 },
  profileButton: { borderRadius: 7, borderWidth: 1, borderColor: "#87C8B7", paddingHorizontal: 8, paddingVertical: 8, alignItems: "center", flexDirection: "row", gap: 4, flexShrink: 0 },
  profileButtonText: { fontFamily: vsType.family, fontSize: 11, fontWeight: "700", color: "#087C69" },
  errorBox: { backgroundColor: "#FFF3F0", borderRadius: 8, padding: 12, gap: 7 },
  error: { fontFamily: vsType.family, color: "#AE3029", fontSize: 12 },
  retry: { fontFamily: vsType.family, color: "#087C69", fontWeight: "800", fontSize: 13 },
  empty: { fontFamily: vsType.family, fontSize: 13, color: "#698087" },
  paging: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  pageButton: { padding: 8, borderRadius: 8, backgroundColor: "#E8F7F0" },
  disabled: { opacity: 0.4 },
  pageText: { fontFamily: vsType.family, fontSize: 12, color: "#087C69", fontWeight: "700" },
  pageLabel: { fontFamily: vsType.family, fontSize: 12, color: "#4F6B74" },
  privacy: { fontFamily: vsType.family, fontSize: 11, lineHeight: 16, color: "#799093" },
  moreButton: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 6 },
  moreText: { fontFamily: vsType.family, fontSize: 12, fontWeight: "700", color: "#087C69" },
  backdrop: { flex: 1, backgroundColor: "rgba(14,35,41,0.55)", alignItems: "center", justifyContent: "center", padding: 18 },
  modal: { width: "100%", maxWidth: 390, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 23, alignItems: "center", gap: 12 },
  close: { alignSelf: "flex-end", padding: 5 },
  largeAvatar: { width: 84, height: 84, borderRadius: 42 },
  largeFallback: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#E8F7F0", alignItems: "center", justifyContent: "center" },
  profileName: { fontFamily: vsType.family, fontSize: 21, fontWeight: "800", color: "#153F45", textAlign: "center" },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 9, backgroundColor: "#EAF7F1" },
  tagText: { fontFamily: vsType.family, fontSize: 12, fontWeight: "700", color: "#087C69" },
  previewNote: { fontFamily: vsType.family, fontSize: 13, lineHeight: 20, color: "#59737C", textAlign: "center" },
  done: { backgroundColor: "#087C69", borderRadius: 9, paddingVertical: 11, paddingHorizontal: 22, alignSelf: "stretch", alignItems: "center" },
  doneText: { fontFamily: vsType.family, fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
});
