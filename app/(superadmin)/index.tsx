import { collection, onSnapshot } from "firebase/firestore";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import WorkspaceBarChart from "../../components/ui/WorkspaceBarChart";
import { liveUi as ui } from "../../constants/volunserveLiveUi";
import ListPagination from "../../components/ui/ListPagination";
import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";

type Source = "users" | "disasterCases" | "assistanceRequests" | "communityEvents";
type AuditSource = "adminLogs" | "adminActivityLogs";
type AuditItem = {id:string; source:AuditSource; actorUid:string; actorName:string; actionType:string; description:string; createdAt:any};
const AUDIT_SOURCES: AuditSource[] = ["adminLogs", "adminActivityLogs"];
const PAGE_SIZE = 5;
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
  const [staffStats, setStaffStats] = useState({ active: 0, suspended: 0 });
  const [adminActivityPage, setAdminActivityPage] = useState(1);
  const [systemChangesPage, setSystemChangesPage] = useState(1);
  const [errors, setErrors] = useState<Partial<Record<Source, boolean>>>({});
  const [loaded, setLoaded] = useState<Partial<Record<Source, boolean>>>({});

  useEffect(() => {
    if (!authorized) {
      setCounts({});
      setApproved(null);
      setAdminUids([]);
      setStaffStats({ active: 0, suspended: 0 });
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
    latestRecorded.filter(item => adminUids.includes(item.actorUid)),
    [latestRecorded,adminUids]);
  const systemChanges = useMemo(() =>
    latestRecorded.filter(item =>
      /system_settings|admin_account|credential|access|suspend|reactivat|promot|sign_in|login|password|role_update|privacy|data_cleanup/i.test(item.actionType)
    ),[latestRecorded]);
  const safeActivityPage = Math.min(adminActivityPage, Math.max(1, Math.ceil(adminActions.length / PAGE_SIZE)));
  const safeChangesPage = Math.min(systemChangesPage, Math.max(1, Math.ceil(systemChanges.length / PAGE_SIZE)));
  const pagedAdminActions = adminActions.slice((safeActivityPage - 1) * PAGE_SIZE, safeActivityPage * PAGE_SIZE);
  const pagedSystemChanges = systemChanges.slice((safeChangesPage - 1) * PAGE_SIZE, safeChangesPage * PAGE_SIZE);
  const total = counts.users ?? 0;
  const approvedPercentage = total > 0 && approved !== null
    ? Math.round((approved / total) * 100) : null;
  const data = useMemo(() => SOURCES.map(({ key, label }) => ({
    key, label,
    shortLabel: compact ? ({users:"Accounts",disasterCases:"Emergency",assistanceRequests:"Assistance",communityEvents:"Events"} as Record<Source,string>)[key] : label,
    color: ({users:"#087B63",disasterCases:"#24A18A",assistanceRequests:"#4CBFA3",communityEvents:"#79CEB8"} as Record<Source,string>)[key],
    value: errors[key] || !loaded[key] ? null : (counts[key] ?? 0),
  })), [counts, errors, loaded, compact]);
  const hasUnavailable = SOURCES.some(({ key }) => errors[key]);
  const allLoaded = SOURCES.every(({ key }) => loaded[key]);
  const showApproval = loaded.users && !errors.users && approved !== null;

  return (
    <ScrollView
      style={[styles.screen, Platform.OS === "web" && styles.webScroll]}
      contentContainerStyle={[styles.content, compact && styles.compactContent]}
      showsVerticalScrollIndicator
      accessibilityLabel="Super Admin System Overview"
    >
      <View style={styles.hero}>
        <View pointerEvents="none" style={styles.heroLeafRight}>
          <Ionicons name="leaf-outline" size={148} color="#B6E4D0" />
        </View>
        <View pointerEvents="none" style={styles.heroLeafBack}>
          <Ionicons name="leaf-outline" size={118} color="#D6F0E2" />
        </View>
        <View style={styles.heroText}>
          <Text style={styles.eyebrow}>S Y S T E M   G O V E R N A N C E</Text>
          <Text style={[styles.title,compact && styles.compactTitle]}>System Overview</Text>
          <Text style={styles.subtitle}>Live governance, audit and system records for authorized Super Admins. LGU operations remain with LGU Admins.</Text>
        </View>
        {!compact && (
          <View style={styles.heroQuote}>
            <Text style={styles.quoteText}>“Building secure systems for a safer San Jose del Monte.”</Text>
            <View style={styles.quoteAccent}/>
          </View>
        )}
      </View>

      <View style={styles.metricRow}>
        {([
          { key:"users",label:"Registered Accounts",value:total,icon:"people" as const,detail:"Total system users" },
          { key:"active",label:"Active LGU Admins",value:staffStats.active,icon:"shield-checkmark" as const,detail:"Authorized personnel" },
          { key:"adminAccounts",label:"Admin Accounts",value:staffStats.active + staffStats.suspended,icon:"people-circle" as const,detail:"Managed LGU Admin access" },
          { key:"suspended",label:"Suspended Admins",value:staffStats.suspended,icon:"lock-closed" as const,detail:"Restricted access accounts" },
        ]).map(item => (
          <View key={item.key} style={[styles.metric,compact && styles.metricCompact]}>
            <View style={styles.metricIcon}>
              <Ionicons name={item.icon} size={24} color="#087D66" />
            </View>
            <View style={styles.metricText}>
              <Text style={styles.metricLabel}>{item.label}</Text>
              <Text style={styles.metricValue}>
                {!loaded.users ? "…" : errors.users ? "—" : item.value.toLocaleString("en-PH")}
              </Text>
              <Text style={styles.metricDetail}>
                {item.key === "users" && showApproval ? String(approvedPercentage) + "% of accounts approved" : item.detail}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.graphCard}>
        <WorkspaceBarChart
          title="System Records by Service Area"
          subtitle="Live counts from authorized Firestore records."
          orientation="vertical"
          bars={data}
          footer={allLoaded && !hasUnavailable
            ? "Current records, not historical trends. Values update when source records change."
            : "One or more sources are loading or unavailable. Missing data is not counted as zero."}
        />
      </View>

      <View style={[styles.activityColumns,compact && styles.activityColumnsStack]}>
        <OverviewAuditTable
          title="Recent LGU Admin Activity"
          subtitle="Latest actions by authorized LGU Admin accounts."
          rows={pagedAdminActions}
          total={adminActions.length}
          page={safeActivityPage}
          onPageChange={setAdminActivityPage}
          loading={auditLoading || !loaded.users}
          unavailable={auditUnavailable || !!errors.users}
          variant="admin"
          onViewAll={() => router.push("/(superadmin)/admin-logs" as any)}
        />
        <OverviewAuditTable
          title="System & Access Changes"
          subtitle="Recorded configuration and account-access changes."
          rows={pagedSystemChanges}
          total={systemChanges.length}
          page={safeChangesPage}
          onPageChange={setSystemChangesPage}
          loading={auditLoading}
          unavailable={auditUnavailable}
          variant="system"
          onViewAll={() => router.push("/(superadmin)/admin-logs" as any)}
        />
      </View>
      {hasUnavailable && (
        <Text style={styles.error}>Some data sources could not be read. Verify deployed Firestore permissions before presenting totals.</Text>
      )}
    </ScrollView>
  );
}

type OverviewAuditProps = {
  title: string;
  subtitle: string;
  rows: AuditItem[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  unavailable: boolean;
  variant: "admin" | "system";
  onViewAll: () => void;
};

function OverviewAuditTable({
  title,subtitle,rows,total,page,onPageChange,loading,unavailable,variant,onViewAll,
}: OverviewAuditProps) {
  return (
    <View style={styles.activityPanel}>
      <View style={styles.activityHead}>
        <View style={styles.activityCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionHint}>{subtitle}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={"View all " + title}
          style={styles.viewAllButton} onPress={onViewAll}>
          <Text style={styles.viewAllText}>View All</Text>
          <Ionicons name="chevron-forward" size={13} color="#145640"/>
        </TouchableOpacity>
      </View>

      {!loading && !unavailable && (
        <ListPagination page={page} total={total} onChange={onPageChange} pageSize={PAGE_SIZE} />
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tableHorizontal} accessibilityLabel={title + " records"}>
        <View style={styles.tableInner}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeading,styles.dateCell]}>Date & Time</Text>
            <Text style={[styles.tableHeading,styles.actorCell]}>{variant === "admin" ? "Admin" : "User"}</Text>
            <Text style={[styles.tableHeading,styles.actionCell]}>{variant === "admin" ? "Action" : "Change Type"}</Text>
            <Text style={[styles.tableHeading,styles.detailsCell]}>Details</Text>
          </View>
          {loading ? (
            <View style={styles.emptyState}><ActivityIndicator color="#087D66"/><Text style={styles.emptyText}>Loading recorded activity…</Text></View>
          ) : unavailable ? (
            <View style={styles.emptyState}><Ionicons name="alert-circle-outline" color="#A34A27" size={22}/>
              <Text style={styles.emptyText}>Audit feed unavailable. Check access permissions.</Text></View>
          ) : rows.length === 0 ? (
            <View style={styles.emptyState}><Ionicons name="document-text-outline" color="#71988B" size={22}/>
              <Text style={styles.emptyText}>No recorded events in this list yet.</Text></View>
          ) : rows.map((item,index) => (
            <View key={item.source + ":" + item.id} style={[styles.tableRow,index % 2 === 1 && styles.alternateRow]}>
              <Text style={[styles.tableText,styles.dateCell]} numberOfLines={2}>{dateLabel(item.createdAt)}</Text>
              <Text style={[styles.tableText,styles.actorCell]} numberOfLines={2}>{item.actorName || item.actorUid || "Not recorded"}</Text>
              <View style={styles.actionCell}>
                <View style={[styles.statusPill,
                  /suspend|reject|fail/i.test(item.actionType) ? styles.statusDanger :
                  /pending|update|config/i.test(item.actionType) ? styles.statusWarm : styles.statusGreen]}>
                  <Text style={styles.statusText} numberOfLines={1}>{actionLabel(item.actionType)}</Text>
                </View>
              </View>
              <Text style={[styles.tableText,styles.detailsCell]} numberOfLines={2}>{item.description || "No details recorded"}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

    </View>
  );
}


const styles = StyleSheet.create({
  screen:{flex:1,minHeight:0,backgroundColor:ui.color.canvas},
  webScroll:{overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:"#B4D2C4 #F6F9F8"} as any,
  content:{width:"100%",maxWidth:1500,alignSelf:"center",paddingHorizontal:20,paddingTop:18,paddingBottom:42},
  compactContent:{paddingHorizontal:12,paddingTop:12},
  hero:{minHeight:134,backgroundColor:ui.color.surface,borderColor:ui.color.border,borderWidth:1,borderRadius:ui.radius.card,
    overflow:"hidden",flexDirection:"row",alignItems:"center",justifyContent:"space-between",
    paddingHorizontal:32,paddingVertical:22,marginBottom:14},
  heroText:{flex:1,zIndex:1},
  heroLeafRight:{position:"absolute",right:-18,bottom:-41,opacity:.07,transform:[{rotate:"-28deg"}]},
  heroLeafBack:{position:"absolute",right:"31%",top:-48,opacity:.04,transform:[{rotate:"25deg"}]},
  eyebrow:{color:ui.color.primary,fontSize:11,fontWeight:"700",letterSpacing:1,marginBottom:7},
  title:{fontSize:ui.type.page.fontSize,lineHeight:ui.type.page.lineHeight,letterSpacing:-.4,color:ui.color.text,fontWeight:"700"},
  compactTitle:{fontSize:22,lineHeight:29},
  subtitle:{color:ui.color.secondary,fontSize:13,lineHeight:20,marginTop:5},
  heroQuote:{width:270,marginLeft:20,marginRight:70},
  quoteText:{fontSize:14,fontStyle:"italic",fontWeight:"700",lineHeight:21,color:"#124B3A"},
  quoteAccent:{height:3,width:34,backgroundColor:"#168A71",marginTop:12,borderRadius:2},
  metricRow:{flexDirection:"row",flexWrap:"wrap",gap:10,marginBottom:13},
  metric:{flexGrow:1,flexBasis:"22%",minWidth:205,backgroundColor:ui.color.surface,borderWidth:1,
    borderColor:ui.color.border,borderRadius:ui.radius.card,paddingHorizontal:15,paddingVertical:17,
    flexDirection:"row",alignItems:"center",gap:12,minHeight:111},
  metricCompact:{flexBasis:"47%",minWidth:145,paddingHorizontal:10,paddingVertical:12,gap:8,minHeight:98},
  metricIcon:{width:53,height:53,borderRadius:ui.radius.card,backgroundColor:ui.color.primarySoft,alignItems:"center",justifyContent:"center"},
  metricText:{flex:1,minWidth:0},
  metricLabel:{fontSize:12,fontWeight:"600",color:ui.color.secondary,lineHeight:18},
  metricValue:{fontSize:27,fontWeight:"700",color:ui.color.text,lineHeight:35,marginTop:1,fontVariant:["tabular-nums"]},
  metricDetail:{fontSize:12,color:ui.color.secondary,lineHeight:18},
  graphCard:{backgroundColor:ui.color.surface,borderColor:ui.color.border,borderWidth:1,borderRadius:ui.radius.card,padding:12},
  activityColumns:{flexDirection:"row",alignItems:"stretch",gap:12,marginTop:13},
  activityColumnsStack:{flexDirection:"column"},
  activityPanel:{flex:1,minWidth:0,width:"100%",borderWidth:1,borderColor:ui.color.border,
    backgroundColor:ui.color.surface,borderRadius:ui.radius.card,padding:17,overflow:"hidden"},
  activityHead:{flexDirection:"row",alignItems:"center",gap:8,marginBottom:14},
  activityCopy:{flex:1,minWidth:0},
  sectionTitle:{fontSize:ui.type.card.fontSize,fontWeight:"700",color:ui.color.text,letterSpacing:-.25},
  sectionHint:{fontSize:12,color:ui.color.secondary,lineHeight:18,marginTop:3},
  viewAllButton:{minHeight:ui.minTap,flexDirection:"row",gap:3,paddingHorizontal:11,
    alignItems:"center",borderWidth:1,borderColor:"#DDE8E2",backgroundColor:"#FFFFFF",borderRadius:8},
  viewAllText:{fontWeight:"700",fontSize:12,color:ui.color.primary},
  tableHorizontal:{flexGrow:1},
  tableInner:{width:"100%",minWidth:540},
  tableHeader:{minHeight:29,flexDirection:"row",alignItems:"center",backgroundColor:"#F2F6F4",
    borderTopLeftRadius:7,borderTopRightRadius:7,paddingHorizontal:8},
  tableHeading:{fontSize:10,fontWeight:"900",color:"#34564B"},
  tableRow:{minHeight:47,flexDirection:"row",alignItems:"center",paddingHorizontal:8,paddingVertical:5,
    borderBottomWidth:1,borderBottomColor:"#ECF1EE"},
  alternateRow:{backgroundColor:"#FBFDFC"},
  tableText:{fontSize:10.5,color:"#304940",lineHeight:15},
  dateCell:{flex:1.2,paddingRight:5},
  actorCell:{flex:1,paddingRight:5},
  actionCell:{flex:1.05,paddingRight:5,alignItems:"flex-start"},
  detailsCell:{flex:1.8},
  statusPill:{backgroundColor:"#D6F5E7",borderRadius:6,paddingHorizontal:7,paddingVertical:5,maxWidth:"100%"},
  statusWarm:{backgroundColor:"#FFF0CF"},
  statusDanger:{backgroundColor:"#FCE5E3"},
  statusGreen:{backgroundColor:"#D6F5E7"},
  statusText:{fontSize:10,fontWeight:"800",color:"#135F4C"},
  emptyState:{minHeight:142,gap:10,alignItems:"center",justifyContent:"center",padding:18},
  emptyText:{color:"#6A8278",fontSize:12,textAlign:"center"},
  error:{color:"#AA3D2B",fontSize:12,marginTop:12},
});
