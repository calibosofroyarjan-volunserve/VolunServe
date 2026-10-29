import { collection, onSnapshot } from "firebase/firestore";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import WorkspaceBarChart from "../../components/ui/WorkspaceBarChart";
import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";

type Source = "users" | "disasterCases" | "assistanceRequests" | "communityEvents";
type AuditSource = "adminLogs" | "adminActivityLogs";
type AuditItem = {id:string; source:AuditSource; actorUid:string; actorName:string; actionType:string; description:string; createdAt:any};
const AUDIT_SOURCES: AuditSource[] = ["adminLogs", "adminActivityLogs"];
const textValue = (value:unknown) => typeof value === "string" ? value : "";
const millis = (value:any) => value?.toMillis?.() || 0;
const dateLabel = (value:any) => value?.toDate?.()
  ? value.toDate().toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"})
  : "Time unavailable";
const actionLabel = (value:string) => (value || "administrative_action").replace(/_/g," ").replace(/\b\w/g, m => m.toUpperCase());
const SOURCES: { key: Source; label: string }[] = [
  { key: "users", label: "Registered Accounts" },
  { key: "disasterCases", label: "Emergency Reports" },
  { key: "assistanceRequests", label: "Assistance Requests" },
  { key: "communityEvents", label: "Community Events" },
];

export default function SuperAdminDashboard() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const { user, profile } = useUserSession();
  const authorized = !!user && profile?.role === "superadmin" && profile?.status === "approved";
  const [counts, setCounts] = useState<Partial<Record<Source, number>>>({});
  const [approved, setApproved] = useState<number | null>(null);
  const [adminUids,setAdminUids] = useState<string[]>([]);
  const [auditRows,setAuditRows] = useState<Partial<Record<AuditSource,AuditItem[]>>>({});
  const [auditLoaded,setAuditLoaded] = useState<Partial<Record<AuditSource,boolean>>>({});
  const [auditErrors,setAuditErrors] = useState<Partial<Record<AuditSource,boolean>>>({});
  const [staffStats, setStaffStats] = useState({ pending: 0, active: 0, suspended: 0 });
  const [errors, setErrors] = useState<Partial<Record<Source, boolean>>>({});
  const [loaded, setLoaded] = useState<Partial<Record<Source, boolean>>>({});

  useEffect(() => {
    if (!authorized) {
      setCounts({});
      setApproved(null);
      setAdminUids([]);
      setStaffStats({ pending: 0, active: 0, suspended: 0 });
      setErrors({});
      setLoaded({});
      return;
    }
    const stops = SOURCES.map(({ key }) => onSnapshot(
      collection(db, key),
      (snapshot) => {
        setCounts((old) => ({ ...old, [key]: snapshot.size }));
        if (key === "users") {
          const accounts = snapshot.docs.map(item => item.data());
          setAdminUids(snapshot.docs.filter(item => item.data().role === "admin").map(item => item.id));
          setApproved(accounts.filter(item => item.status === "approved").length);
          setStaffStats({
            pending: accounts.filter(item => item.role === "applicant" && item.status === "pending_review").length,
            active: accounts.filter(item => item.role === "admin" && item.status === "approved" && item.adminStatus !== "suspended").length,
            suspended: accounts.filter(item => item.role === "admin" && item.adminStatus === "suspended").length,
          });
        }
        setErrors((old) => ({ ...old, [key]: false }));
        setLoaded((old) => ({ ...old, [key]: true }));
      },
      (error) => {
        console.warn("Super Admin overview source unavailable", key, error.code);
        setErrors((old) => ({ ...old, [key]: true }));
        setLoaded((old) => ({ ...old, [key]: true }));
      },
    ));
    return () => stops.forEach((stop) => stop());
  }, [authorized]);

  useEffect(() => {
    if (!authorized) {
      setAuditRows({}); setAuditLoaded({}); setAuditErrors({});
      return;
    }
    const stops = AUDIT_SOURCES.map(source => onSnapshot(collection(db,source),
      snapshot => {
        setAuditRows(old => ({...old,[source]:snapshot.docs.map(item => {
          const row = item.data();
          return {
            id:item.id, source,
            actorUid:textValue(row.adminUid || row.actorUid || row.updatedBy),
            actorName:textValue(row.adminName || row.actorName),
            actionType:textValue(row.actionType || row.action),
            description:textValue(row.description || row.details || row.message),
            createdAt:row.createdAt || row.timestamp || null,
          };
        })}));
        setAuditLoaded(old => ({...old,[source]:true}));
        setAuditErrors(old => ({...old,[source]:false}));
      },
      error => {
        console.warn("Super Admin audit feed unavailable", source,error.code);
        setAuditLoaded(old => ({...old,[source]:true}));
        setAuditErrors(old => ({...old,[source]:true}));
      }
    ));
    return () => stops.forEach(stop => stop());
  },[authorized]);
  const auditLoading = AUDIT_SOURCES.some(source => !auditLoaded[source]);
  const auditUnavailable = AUDIT_SOURCES.some(source => auditErrors[source]);
  const latestRecorded = useMemo(() =>
    AUDIT_SOURCES.flatMap(source => auditRows[source] || [])
      .sort((a,b) => millis(b.createdAt) - millis(a.createdAt)),[auditRows]);
  const adminActions = useMemo(() =>
    latestRecorded.filter(item => adminUids.includes(item.actorUid)).slice(0,5),
    [latestRecorded,adminUids]);
  const systemChanges = useMemo(() =>
    latestRecorded.filter(item =>
      /system_settings|admin_account|credential|access|suspend|reactivat|promot/i.test(item.actionType)
    ).slice(0,4),[latestRecorded]);
  const total = counts.users ?? 0;
  const approvedPercentage = total > 0 && approved !== null
    ? Math.round((approved / total) * 100) : null;
  const data = useMemo(() => SOURCES.map(({ key, label }) => ({
    key, label,
    value: errors[key] || !loaded[key] ? null : (counts[key] ?? 0),
  })), [counts, errors, loaded]);
  const hasUnavailable = SOURCES.some(({ key }) => errors[key]);
  const allLoaded = SOURCES.every(({ key }) => loaded[key]);
  const showApproval = loaded.users && !errors.users && approved !== null;

  return (
    <ScrollView
      style={[styles.screen, Platform.OS === "web" && styles.webScroll]}
      contentContainerStyle={[styles.content, compact && styles.compactContent]}
      showsVerticalScrollIndicator
      accessibilityLabel="Super Admin dashboard"
    >
      <View style={styles.header}>
        <View style={styles.eyebrowRow}>
          <View style={styles.dot} />
          <Text style={styles.eyebrow}>SYSTEM GOVERNANCE</Text>
        </View>
        <Text style={[styles.title, compact && styles.compactTitle]}>System Overview</Text>
        <Text style={styles.subtitle}>Admin account access, technical oversight and system audit trails. City operations remain under authorized LGU Admin personnel.</Text>
      </View>

      <View style={[styles.metricRow,compact && styles.metricRowCompact]}>
        {([
          {key:"pending",label:"Admin accounts",value:staffStats.active+staffStats.suspended,icon:"people-outline" as const},
          {key:"active",label:"Active LGU Admins",value:staffStats.active,icon:"shield-checkmark-outline" as const},
          {key:"suspended",label:"Suspended Admins",value:staffStats.suspended,icon:"lock-closed-outline" as const},
          {key:"users",label:"Registered accounts",value:total,icon:"people-outline" as const},
        ]).map((item,index) => (
          <View key={item.key} style={[styles.metric,index === 0 && styles.metricFeatured,compact && styles.metricCompact]}>
            <View style={styles.metricHeading}>
              <Text style={[styles.metricLabel,index===0 && styles.metricLabelFeatured]}>{item.label}</Text>
              <Ionicons name={item.icon} size={18} color={index===0 ? "#D4F7EA" : "#1B8A66"}/>
            </View>
            <Text style={[styles.metricValue,index===0 && styles.metricValueFeatured]}>
              {!loaded.users ? "…" : errors.users ? "—" : item.value.toLocaleString("en-PH")}
            </Text>
            <Text style={[styles.metricDetail,index===0 && styles.metricDetailFeatured]}>
              {item.key==="pending" ? "Managed Admin access" :
               item.key==="users" ? "Firestore user profiles" : "Access governance"}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.visualSection}>
        <Text style={styles.sectionTitle}>System records at a glance</Text>
        <Text style={styles.sectionHint}>Actual collection totals—not fabricated monthly growth or revenue.</Text>
      </View>
      <WorkspaceBarChart
        title="Records by service area"
        subtitle="Comparison of live Firestore record totals. Bars represent counts, not monthly trends."
        bars={data}
        footer={allLoaded && !hasUnavailable
          ? "Source: authorized Firestore records. Values update when records change."
          : "Some sources are loading or unavailable. Missing counts are never shown as zero."}
      />

      <View style={[styles.activityColumns,compact && styles.activityColumnsStack]}>
        <View style={styles.activityPanel}>
          <View style={styles.activityHead}>
            <View style={styles.activityCopy}>
              <Text style={styles.sectionTitle}>Recent LGU Admin activity</Text>
              <Text style={styles.sectionHint}>Recorded actions from authorized LGU Admin accounts.</Text>
            </View>
            <Ionicons name="reader-outline" size={20} color="#168566"/>
          </View>
          {(auditLoading || !loaded.users) ? <ActivityIndicator color="#168566" style={styles.activityLoading}/> :
            (auditUnavailable || errors.users) ? <Text style={styles.activityEmpty}>Audit feed unavailable. Check Firestore access.</Text> :
            adminActions.length===0 ? <Text style={styles.activityEmpty}>No recorded LGU Admin actions found. Only logged activities appear here.</Text> :
            adminActions.map(item => <View key={item.source+":"+item.id} style={styles.activityRow}>
              <View style={styles.activityIcon}><Ionicons name="document-text-outline" color="#1C8465" size={17}/></View>
              <View style={styles.activityCopy}>
                <Text style={styles.activityName}>{actionLabel(item.actionType)}</Text>
                <Text style={styles.activityDescription} numberOfLines={2}>{item.description || "Recorded administrative action"}</Text>
                <Text style={styles.activityMeta}>{item.actorName || item.actorUid} · {dateLabel(item.createdAt)}</Text>
              </View>
            </View>)}
          <TouchableOpacity style={styles.activityLink} onPress={() => router.push("/(superadmin)/admin-logs" as any)}
            accessibilityRole="button" accessibilityLabel="View all recorded administrative audit actions">
            <Text style={styles.activityLinkText}>Full audit history</Text>
            <Ionicons name="arrow-forward" size={16} color="#087F61"/>
          </TouchableOpacity>
        </View>
        <View style={styles.activityPanel}>
          <View style={styles.activityHead}>
            <View style={styles.activityCopy}>
              <Text style={styles.sectionTitle}>System & access changes</Text>
              <Text style={styles.sectionHint}>Configuration and access audit entries; not deployment uptime.</Text>
            </View>
            <Ionicons name="settings-outline" size={20} color="#168566"/>
          </View>
          {auditLoading ? <ActivityIndicator color="#168566" style={styles.activityLoading}/> :
            auditUnavailable ? <Text style={styles.activityEmpty}>System update logs unavailable.</Text> :
            systemChanges.length===0 ? <Text style={styles.activityEmpty}>No system or access changes recorded yet.</Text> :
            systemChanges.map(item => <View key={item.source+":"+item.id} style={styles.changeRow}>
              <View style={styles.changeDot}/>
              <View style={styles.activityCopy}>
                <Text style={styles.activityName}>{actionLabel(item.actionType)}</Text>
                <Text style={styles.activityMeta}>{dateLabel(item.createdAt)} · {item.actorName || item.actorUid || "Unknown actor"}</Text>
              </View>
            </View>)}
          <TouchableOpacity style={styles.activityLink} onPress={() => router.push("/(superadmin)/system-settings" as any)}
            accessibilityRole="button" accessibilityLabel="Manage authorized technical system settings">
            <Text style={styles.activityLinkText}>System settings</Text>
            <Ionicons name="arrow-forward" size={16} color="#087F61"/>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.secondarySection}>
        <View style={styles.secondaryHead}>
          <Text style={styles.sectionTitle}>Admin account governance</Text>
          <Text style={styles.sectionHint}>Real-time account status from Firestore</Text>
        </View>
        <View style={styles.governanceActions}>
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel="Manage existing LGU Admin accounts"
            onPress={() => router.push("/(superadmin)/admin-accounts" as any)}
            style={styles.governancePrimary}>
            <Text style={styles.governancePrimaryText}>Manage Admin Accounts</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel="Open Super Admin security and audit logs"
            onPress={() => router.push("/(superadmin)/admin-logs" as any)}
            style={styles.governanceSecondary}>
            <Text style={styles.governanceSecondaryText}>View Audit Logs</Text>
          </TouchableOpacity>
        </View>
        {showApproval ?
          <View style={styles.approvalRow}>
            <View style={styles.approvalMain}>
              <Text style={styles.largePercentage}>{approvedPercentage ?? 0}%</Text>
              <Text style={styles.approvalDescription}>
                {approved?.toLocaleString("en-PH")} approved of {total.toLocaleString("en-PH")} registered accounts
              </Text>
            </View>
            <View style={styles.percentageTrack}>
              <View style={[styles.percentageFill, { width: `${approvedPercentage ?? 0}%` as `${number}%` }]} />
            </View>
          </View> :
          <Text style={styles.pendingText}>
            {!loaded.users ? "Loading account status…" : "Account approval figures are unavailable."}
          </Text>
        }
        <Text style={styles.note}>
          Review LGU credentials before granting Admin permissions. System administrators manage access and settings; operational donations belong to the LGU Admin workspace.
        </Text>
      </View>

      {hasUnavailable &&
        <Text style={styles.error}>Some records could not be read. Check deployed Firestore permissions before presenting these totals.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: "#F6F8F7" },
  webScroll: { overflowY: "scroll", scrollbarWidth: "auto", scrollbarColor: "#A4B7AF #F6F8F7" } as any,
  content: { width: "100%", maxWidth: 1250, alignSelf: "center", paddingHorizontal: 38, paddingTop: 36, paddingBottom: 70 },
  compactContent: { paddingHorizontal: 17, paddingTop: 24 },
  header: { paddingBottom: 28 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#23765F" },
  eyebrow: { color: "#568174", fontSize: 10, fontWeight: "700", letterSpacing: 1.3 },
  title: { fontSize: 31, lineHeight: 38, letterSpacing: -0.6, fontWeight: "700", color: "#133A30" },
  compactTitle: { fontSize: 26, lineHeight: 33 },
  subtitle: { color: "#688076", fontSize: 13, lineHeight: 19, marginTop: 7 },
  metricRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 25 },
  metricRowCompact: { flexWrap: "wrap" },
  metric: { flexGrow: 1, flexBasis: "23%", minWidth: 165, paddingVertical: 18, paddingHorizontal: 17, backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#DFEAE3" },
  metricCompact: { flexBasis: "47%", minWidth: 136, paddingHorizontal: 13 },
  metricLabel: { fontSize: 11, fontWeight: "700", color: "#62786F", flex: 1, lineHeight: 16 },
  metricValue: { fontSize: 30, fontWeight: "800", color: "#173D32", marginTop: 10, fontVariant: ["tabular-nums"] },
  metricFeatured: {backgroundColor:"#0B7960",borderColor:"#0B7960"},
  metricHeading: {flexDirection:"row",gap:8,alignItems:"flex-start"},
  metricLabelFeatured: {color:"#EDFFF7"},
  metricValueFeatured: {color:"#FFFFFF"},
  metricDetail: {fontSize:10.5,color:"#8D9F95",marginTop:6},
  metricDetailFeatured: {color:"#D0F6E7"},
  visualSection: {marginBottom:14},
  activityColumns: {flexDirection:"row",gap:15,alignItems:"flex-start",marginTop:20},
  activityColumnsStack: {flexDirection:"column"},
  activityPanel: {backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DEE9E2",borderRadius:12,padding:19,flex:1,minWidth:0,width:"100%"},
  activityHead: {flexDirection:"row",alignItems:"flex-start",gap:10,marginBottom:16},
  activityCopy: {flex:1,minWidth:0},
  activityRow: {flexDirection:"row",gap:11,alignItems:"flex-start",paddingVertical:12,borderTopWidth:1,borderColor:"#EBF1ED"},
  activityIcon: {width:34,height:34,borderRadius:8,backgroundColor:"#EAF6F0",alignItems:"center",justifyContent:"center"},
  activityName: {fontWeight:"800",color:"#1B4536",fontSize:12},
  activityDescription: {color:"#6D8377",fontSize:11.5,lineHeight:17,marginTop:4},
  activityMeta: {color:"#8CA097",fontSize:10.5,marginTop:4},
  activityLoading: {marginVertical:18},
  activityEmpty: {fontSize:12,color:"#6E887A",lineHeight:19,marginBottom:12,paddingVertical:12},
  activityLink: {flexDirection:"row",gap:8,alignItems:"center",borderTopWidth:1,borderColor:"#E5EFE8",paddingTop:14,marginTop:8},
  activityLinkText: {color:"#087F61",fontSize:12,fontWeight:"800"},
  changeRow: {flexDirection:"row",gap:11,paddingVertical:12,borderTopWidth:1,borderColor:"#EBF1ED"},
  changeDot: {height:8,width:8,marginTop:4,borderRadius:4,backgroundColor:"#21A077"},
  secondarySection: { marginTop: 23, padding:19,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E0EAE2",borderRadius:12 },
  governanceRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14 },
  governanceStat: { flexGrow: 1, flexBasis: "27%", minWidth: 156, borderColor: "#DCE9E1",
    borderWidth: 1, backgroundColor: "#FFFFFF", borderRadius: 10, padding: 17 },
  governanceLabel: { fontSize: 11, fontWeight: "700", color: "#607D70" },
  governanceValue: { fontSize: 26, fontWeight: "800", color: "#195743", marginTop: 7, fontVariant: ["tabular-nums"] },
  governanceActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  governancePrimary: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 9,
    backgroundColor: "#087F61", justifyContent: "center", alignItems: "center" },
  governancePrimaryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  governanceSecondary: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 9,
    borderWidth: 1, borderColor: "#BDD8CA", justifyContent: "center", alignItems: "center" },
  governanceSecondaryText: { color: "#087F61", fontSize: 12, fontWeight: "800" },
  secondaryHead: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#173D32" },
  sectionHint: { fontSize: 12, color: "#6C7F77" },
  approvalRow: { paddingVertical: 17, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#DDE6E1" },
  approvalMain: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 12 },
  largePercentage: { fontSize: 35, fontWeight: "700", color: "#23765F", fontVariant: ["tabular-nums"] },
  approvalDescription: { fontSize: 13, color: "#566B61" },
  percentageTrack: { height: 7, borderRadius: 3, backgroundColor: "#E4ECE7", marginTop: 16, overflow: "hidden" },
  percentageFill: { backgroundColor: "#23765F", height: "100%", borderRadius: 3 },
  pendingText: { fontSize: 13, color: "#6C7F77", paddingVertical: 15 },
  note: { color: "#64776E", fontSize: 12, lineHeight: 19, paddingTop: 16, maxWidth: 850 },
  error: { fontSize: 12, color: "#A45125", marginTop: 20 },
});
