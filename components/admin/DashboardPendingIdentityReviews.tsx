import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ListPagination from "../ui/ListPagination";
import { useUserSession } from "../../lib/useUserSession";

type PendingIdentity = {
  uid: string;
  status?: string;
  identityVerified?: boolean;
  requiresManualReview?: boolean;
  manualReviewDecision?: string;
  resident?: { fullName?: string; email?: string; barangay?: string; };
};
const API = "https://volunserve.onrender.com/api/admin/identity/reviews";
const PAGE_SIZE = 5;
const pendingReview = (item: PendingIdentity) =>
  item.requiresManualReview === true && item.status === "pending" &&
  item.identityVerified !== true && item.manualReviewDecision !== "verified";

export default function DashboardPendingIdentityReviews() {
  const router = useRouter();
  const { user, profile } = useUserSession();
  const [items, setItems] = useState<PendingIdentity[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!user || profile?.role !== "admin" || profile.adminStatus === "suspended") return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(API, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.message || "Identity reviews unavailable.");
      const rows = Array.isArray(body.items) ? body.items as PendingIdentity[] : [];
      setItems(rows.filter(pendingReview));
      setPage(1);
    } catch (e: any) {
      setItems([]); setError(e?.message || "Unable to load pending Resident identity reviews.");
    } finally { setLoading(false); }
  }, [user, profile?.role, profile?.adminStatus]);
  useEffect(() => { void load(); }, [load]);
  const activePage = Math.max(1, Math.min(page, Math.max(1, Math.ceil(items.length / PAGE_SIZE))));
  const paged = items.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  return <View style={styles.panel}>
    <View style={styles.heading}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>IDENTITY VERIFICATION / PENDING REVIEW</Text>
        <Text style={styles.title}>Resident Identity Reviews {error ? "" : `(${items.length})`}</Text>
        <Text style={styles.subtitle}>Official verification queue. Open the secure review to inspect ID evidence, confirm authenticity and document a decision.</Text>
      </View>
      <TouchableOpacity onPress={() => void load()} accessibilityRole="button" style={styles.refresh}>
        <Ionicons name="refresh-outline" size={16} color="#14745A"/>
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>
    </View>
    {error ? <Text style={styles.error}>{error}</Text> :
      loading ? <ActivityIndicator color="#087A60" style={{ marginVertical: 15 }}/> :
      <>
        <ListPagination page={activePage} total={items.length} pageSize={PAGE_SIZE} onChange={setPage}/>
        {paged.length === 0 ? <Text style={styles.empty}>No Resident identity submissions awaiting manual review.</Text> :
        paged.map(item => <View key={item.uid} style={styles.row}>
          <View style={styles.copy}>
            <Text style={styles.name}>{item.resident?.fullName || item.resident?.email || "Resident"}</Text>
            <Text style={styles.meta}>{item.resident?.barangay || "Barangay unlisted"} · Pending manual verification</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" style={styles.action}
            onPress={() => router.push("/(admin)/identity-reviews" as any)}>
            <Text style={styles.actionText}>Review securely</Text>
          </TouchableOpacity>
        </View>)}
      </>}
  </View>;
}
const styles = StyleSheet.create({
  panel:{ backgroundColor:"#FFFFFF", borderColor:"#D7E7DE", borderWidth:1, borderRadius:14, padding:18, marginBottom:15 },
  heading:{ flexDirection:"row", alignItems:"center", flexWrap:"wrap", gap:12 },
  copy:{ flex:1, minWidth:170 },
  eyebrow:{ color:"#087A60", fontSize:10, fontWeight:"800", letterSpacing:1 },
  title:{ color:"#123F31", fontSize:17, fontWeight:"800", marginTop:5 },
  subtitle:{ color:"#5F7D6E", fontSize:12, lineHeight:18, marginTop:5 },
  refresh:{ minHeight:44, flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:10, borderRadius:10, backgroundColor:"#EBF6F0" },
  refreshText:{ color:"#14745A", fontWeight:"800", fontSize:12 },
  row:{ flexDirection:"row", flexWrap:"wrap", alignItems:"center", gap:12, borderTopWidth:1, borderTopColor:"#E6EEE9", paddingVertical:12 },
  name:{ color:"#194633", fontWeight:"800", fontSize:13 },
  meta:{ color:"#6B8074", fontSize:11, marginTop:4 },
  action:{ minHeight:44, paddingHorizontal:12, alignItems:"center", justifyContent:"center", borderRadius:10, backgroundColor:"#E9F5EE" },
  actionText:{ color:"#087A60", fontWeight:"700", fontSize:12 },
  error:{ color:"#A23A37", paddingVertical:12, fontSize:12 },
  empty:{ color:"#627E6D", paddingVertical:12, fontSize:12 },
});
