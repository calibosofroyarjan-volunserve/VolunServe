import {getSafeVolunServeBackendBaseUrl} from "../../lib/stagingExpoServiceIsolation";
import { volunserveTypography as vsType } from "../../constants/volunserveLiveUi";
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

type Entry = { key: string; name: string; avatarUrl?: string; status: "Joined" };
type Response = {
  ok?: boolean; total?: number; totalPages?: number; volunteers?: Entry[]; message?: string;
};
type AuthUser = { getIdToken: () => Promise<string> };
const API_URL = getSafeVolunServeBackendBaseUrl();

export default function CommunityEventRoster({
  eventId, viewer, participantsCount,
}: { eventId: string; viewer: AuthUser; participantsCount: number }) {
  const [page,setPage] = useState(1);
  const [refresh,setRefresh] = useState(0);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [data,setData] = useState<Response>({});
  useEffect(() => setPage(1),[eventId]);
  useEffect(() => {
    const interval = setInterval(() => setRefresh(value => value + 1), 20000);
    return () => clearInterval(interval);
  },[eventId]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const token = await viewer.getIdToken();
        const response = await fetch(`${API_URL}/api/community-events/${encodeURIComponent(eventId)}/volunteers?page=${page}`, {
          headers: {Authorization: `Bearer ${token}`},
        });
        const payload: Response = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.message || "Unable to load joined volunteers.");
        if (active) { setData(payload); setError(""); }
      } catch (e) {
        if(active) setError(e instanceof Error ? e.message : "Volunteer list is unavailable.");
      } finally {
        if(active) setLoading(false);
      }
    })();
    return () => { active = false; };
  },[eventId, viewer, page, refresh, participantsCount]);
  const total = data.total ?? participantsCount;
  const pages = Math.max(1,data.totalPages || 1);
  return (
    <View style={s.card}>
      <View style={s.heading}>
        <View style={s.icon}><Ionicons name="people-outline" color="#087C69" size={21}/></View>
        <View style={{flex:1}}>
          <Text style={s.title}>Joined Volunteers ({total})</Text>
          <Text style={s.desc}>Approved volunteers participating in this event</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh joined volunteers" onPress={() => setRefresh(x => x + 1)} style={s.refresh}>
          <Ionicons name="refresh-outline" color="#087C69" size={17}/>
          <Text style={s.refreshText}>Refresh</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color="#087C69"/> :
        error ? <View style={s.errorBox}><Text style={s.error}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>setRefresh(x=>x+1)}><Text style={s.retry}>Try again</Text></Pressable></View> :
        !data.volunteers?.length ? <Text style={s.empty}>No joined volunteers to show yet.</Text> :
        data.volunteers.map((item) => (
          <View key={item.key} style={s.person}>
            {item.avatarUrl ? <Image source={{uri:item.avatarUrl}} style={s.avatar}/> :
              <View style={s.fallback}><Text style={s.initials}>{item.name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}</Text></View>}
            <View style={{flex:1}}>
              <Text style={s.name} numberOfLines={1}>{item.name}</Text>
              <Text style={s.role}>Volunteer · Joined</Text>
            </View>
            <Ionicons name="checkmark-circle" color="#0A8C71" size={19}/>
          </View>
        ))}
      {!error && !loading && pages > 1 && (
        <View style={s.paging}>
          <Pressable accessibilityRole="button" disabled={page <= 1} style={[s.pageBtn,page <= 1 && s.disabled]} onPress={() => setPage(n=>Math.max(1,n-1))}><Text style={s.pageText}>Previous</Text></Pressable>
          <Text style={s.pageLabel}>{page} / {pages}</Text>
          <Pressable accessibilityRole="button" disabled={page >= pages} style={[s.pageBtn,page>=pages && s.disabled]} onPress={() => setPage(n=>Math.min(pages,n+1))}><Text style={s.pageText}>Next</Text></Pressable>
        </View>
      )}
      <Text style={s.privacy}>Only volunteered display names and public profile pictures are shown. Contact details and attendance records remain private.</Text>
    </View>
  );
}
const s=StyleSheet.create({
 card:{padding:16,borderWidth:1,borderColor:"#D6E9E1",borderRadius:14,backgroundColor:"#FFFFFF",gap:12,marginTop:12},
 heading:{flexDirection:"row",alignItems:"center",gap:9},icon:{padding:8,backgroundColor:"#E8F7F0",borderRadius:10},
 title:{fontSize: vsType.size.bodyStrong, fontFamily: vsType.family,fontWeight:"800",color:"#153F45"},desc:{fontSize: vsType.size.caption, fontFamily: vsType.family,color:"#698087",marginTop:3},
 refresh:{flexDirection:"row",alignItems:"center",gap:4,padding:7},refreshText:{fontSize: vsType.size.caption, fontFamily: vsType.family,fontWeight:"700",color:"#087C69"},
 person:{flexDirection:"row",alignItems:"center",gap:10,borderTopWidth:1,borderTopColor:"#E9F0ED",paddingTop:11},
 avatar:{width:39,height:39,borderRadius:20},fallback:{width:39,height:39,borderRadius:20,backgroundColor:"#D7F2E7",alignItems:"center",justifyContent:"center"},
 initials:{fontWeight:"800",color:"#087C69",fontSize: vsType.size.label, fontFamily: vsType.family},name:{fontSize: vsType.size.label, fontFamily: vsType.family,fontWeight:"700",color:"#203F48"},role:{fontSize: vsType.size.micro, fontFamily: vsType.family,color:"#607D7E",marginTop:3},
 errorBox:{padding:12,backgroundColor:"#FFF3F0",borderRadius:8,gap:7},error:{color:"#AE3029",fontSize: vsType.size.caption, fontFamily: vsType.family},
 retry:{fontWeight:"800",color:"#087C69",fontSize: vsType.size.meta, fontFamily: vsType.family},empty:{fontSize: vsType.size.meta, fontFamily: vsType.family,color:"#698087"},
 paging:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10},
 pageBtn:{padding:8,backgroundColor:"#E8F7F0",borderRadius:8},disabled:{opacity:.4},pageText:{color:"#087C69",fontWeight:"700",fontSize: vsType.size.caption, fontFamily: vsType.family},
 pageLabel:{color:"#4F6B74",fontSize: vsType.size.caption, fontFamily: vsType.family},privacy:{color:"#799093",fontSize: vsType.size.micro, fontFamily: vsType.family,lineHeight:15},
});
