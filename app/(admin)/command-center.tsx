import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import DashboardVolunteerApprovals from "../../components/admin/DashboardVolunteerApprovals";
import DashboardOperationalInsights from "../../components/admin/DashboardOperationalInsights";
import DashboardPendingIdentityReviews from "../../components/admin/DashboardPendingIdentityReviews";
import DashboardRecentActivities from "../../components/admin/DashboardRecentActivities";
import { ResidentAccountsPanel } from "./account-approvals";
import ListPagination from "../../components/ui/ListPagination";
import { db } from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type Severity =
  | "low"
  | "medium"
  | "high"
  | "critical";

type CaseStatus =
  | "reported"
  | "validated"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

type DisasterCase = {
  id: string;
  severity?: Severity;
  status?: CaseStatus;
};

type WorkspaceTab = "overview" | "identity" | "residents" | "volunteers" | "insights";

export default function CommandCenter() {
  const router =
    useRouter();
  const params = useLocalSearchParams<{ section?: string }>();

  const {
    width,
  } = useWindowDimensions();

  const {
    loading,
    user,
    profile,
  } = useUserSession();

  const [
    cases,
    setCases,
  ] = useState<
    DisasterCase[]
  >([]);

  const [
    pendingUserIds,
    setPendingUserIds,
  ] = useState<
    string[]
  >([]);

  const [
    pendingVolunteerIds,
    setPendingVolunteerIds,
  ] = useState<
    string[]
  >([]);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("overview");
  useEffect(() => {
    const section = params.section;
    if (section === "identity" || section === "residents" || section === "volunteers" || section === "insights" || section === "overview") setWorkspaceTab(section);
  }, [params.section]);
  const [priorityPage, setPriorityPage] = useState(1);

  const [
    dataError,
    setDataError,
  ] = useState(false);
  const [loadedSources,setLoadedSources] = useState({
    cases:false,users:false,volunteers:false,
  });
  const overviewReady = Object.values(loadedSources).every(Boolean);

  const isAdmin =
    !!profile &&
    profile.role === "admin" &&
    profile.adminStatus !== "suspended" &&
    isApprovedProfile(profile);

  const contentWidth = Math.min(1180, Math.max(280, width - (Platform.OS === "web" && width >= 980 ? 320 : 32)));

  const navigate = (
    route: string,
  ) => {
    router.push(
      route as any,
    );
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "disasterCases",
        ),
        (snapshot) => {
          const rows: DisasterCase[] =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...(item.data() as Omit<
                  DisasterCase,
                  "id"
                >),
              }),
            );

          setCases(
            rows,
          );
          setLoadedSources(old=>({...old,cases:true}));
        },
        (error) => {
          console.log(
            "Admin dashboard cases error:",
            error,
          );

          setDataError(
            true,
          );
        },
      );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const pendingUsersQuery =
      query(
        collection(
          db,
          "users",
        ),
        where(
          "status",
          "==",
          "pending_review",
        ),
      );

    const unsubscribe =
      onSnapshot(
        pendingUsersQuery,
        (snapshot) => {
          // LGU staff applications belong exclusively to the programmer
          // Super Admin queue, not Resident identity/user approvals.
          setPendingUserIds(snapshot.docs
            .filter(item => !["applicant", "admin", "superadmin", "lgu_personnel"].includes(String(item.data().role || "").toLowerCase()))
            .map(item => item.id));
          setLoadedSources(old=>({...old,users:true}));
        },
        (error) => {
          console.log(
            "Admin dashboard pending users error:",
            error,
          );

          setDataError(
            true,
          );
        },
      );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const pendingApplicationsQuery =
      query(
        collection(
          db,
          "volunteerApplications",
        ),
        where(
          "status",
          "==",
          "pending",
        ),
      );

    const unsubscribe =
      onSnapshot(
        pendingApplicationsQuery,
        (snapshot) => {
          setPendingVolunteerIds(
            snapshot.docs.map(
              (item) =>
                item.id,
            ),
          );
          setLoadedSources(old=>({...old,volunteers:true}));
        },
        (error) => {
          console.log(
            "Admin dashboard pending volunteer applications error:",
            error,
          );

          setDataError(
            true,
          );
        },
      );

    return unsubscribe;
  }, [isAdmin]);

  const metrics =
    useMemo(() => {
      const activeCases =
        cases.filter(
          (item) => {
            const status =
              item.status ||
              "reported";

            return (
              status !==
                "resolved" &&
              status !==
                "closed"
            );
          },
        ).length;

      const criticalOpen =
        cases.filter(
          (item) => {
            const status =
              item.status ||
              "reported";

            return (
              item.severity ===
                "critical" &&
              status !==
                "resolved" &&
              status !==
                "closed"
            );
          },
        ).length;

      // Count actionable review tasks; one person may have multiple independent tasks.
      const pendingReviews = pendingUserIds.length + pendingVolunteerIds.length;

      return {
        activeCases,
        criticalOpen,
        pendingReviews,
      };
    }, [
      cases,
      pendingUserIds,
      pendingVolunteerIds,
    ]);

  if (loading) {
    return (
      <View
        style={
          styles.center
        }
      >
        <ActivityIndicator
          size="large"
          color="#078F82"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Loading Admin Command Center...
        </Text>
      </View>
    );
  }

  if (
    !user ||
    !profile ||
    !isApprovedProfile(
      profile,
    )
  ) {
    return (
      <Redirect href="/login" />
    );
  }

  if (
    profile.role ===
    "superadmin"
  ) {
    return (
      <Redirect href="/(superadmin)" />
    );
  }

  if (!isAdmin) {
    return (
      <Redirect href="/(tabs)" />
    );
  }

  return (
    <ScrollView
      style={[
        styles.screen,
        Platform.OS === "web" && styles.webScrollBar,
      ]}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={true}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Admin dashboard content"
    >
      <View
        style={[
          styles.content,
          {
            maxWidth:
              contentWidth,
          },
        ]}
      >
        <View style={styles.premiumHero}>
          <View pointerEvents="none" style={styles.heroOrbLarge} />
          <View pointerEvents="none" style={styles.heroOrbSmall} />
          <View style={[styles.heroHeader, width < 830 && styles.heroHeaderCompact]}>
            <View style={styles.heroCopy}>
              <View style={styles.heroEyebrow}>
                <View style={styles.heroEyebrowMark} />
                <Text style={styles.heroEyebrowText}>VOLUNSERVE  /  LGU OPERATIONS</Text>
              </View>
              <Text style={styles.heroTitle}>Command Center</Text>
              <Text style={styles.heroSubtitle}>
                Review urgent emergencies first, then follow the appropriate LGU service workflow.
              </Text>
            </View>
            <View style={styles.heroLocality}>
              <Ionicons name="location-outline" size={16} color="#AFDEC5" />
              <Text style={styles.heroLocalityText}>SAN JOSE DEL MONTE · BULACAN</Text>
            </View>
          </View>
        </View>
        <View style={[styles.kpiGrid, width < 640 && styles.kpiGridCompact]}>
          {([
            {key:"cases",label:"Open emergencies",count:metrics.activeCases,icon:"alert-circle-outline" as const,route:"/(admin)/admin-cases",hint:"Incident response"},
            {key:"residents",label:"Pending Resident profiles",count:pendingUserIds.length,icon:"shield-checkmark-outline" as const,route:"/(admin)/command-center?section=residents",hint:"Resident account directory"},
            {key:"volunteers",label:"Volunteer approvals",count:pendingVolunteerIds.length,icon:"people-outline" as const,route:"/(admin)/command-center?section=volunteers",hint:"Volunteer applications"},
          ]).map((item,index) => (
            <TouchableOpacity key={item.key} accessibilityRole="button"
              accessibilityLabel={item.label + " · open assigned LGU workflow"}
              onPress={() => navigate(item.route)}
              style={[styles.kpiCard,index===0 && styles.kpiCardFeatured,width < 640 && styles.kpiCardCompact]}
              activeOpacity={0.86}>
              <View style={styles.kpiCardHeader}>
                <Text style={[styles.kpiCardLabel,index===0 && styles.kpiFeaturedText]}>{item.label}</Text>
                <Ionicons name={item.icon} color={index===0?"#E7FFF4":"#147B5A"} size={19}/>
              </View>
              <Text style={[styles.kpiCardValue,index===0 && styles.kpiFeaturedText]}>
                {dataError ? "—" : !overviewReady ? "…" : item.count.toLocaleString("en-PH")}
              </Text>
              <View style={styles.kpiCardFoot}>
                <Text style={[styles.kpiCardHint,index===0 && styles.kpiFeaturedHint]}>{item.hint}</Text>
                <Ionicons name="arrow-forward-outline" size={15} color={index===0?"#CBF4E2":"#8CA99B"}/>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {dataError && (
          <View
            style={
              styles.warningBox
            }
          >
            <Ionicons
              name="warning-outline"
              size={18}
              color="#B45309"
            />

            <Text
              style={
                styles.warningText
              }
            >
              Some live dashboard counts could not be loaded. The modules are still available.
            </Text>
          </View>
        )}


        <View style={styles.workspaceTabs} accessibilityLabel="Command Center workspace navigation">
          {([
            { id: "overview", label: "Overview", icon: "grid-outline" as const },
            { id: "identity", label: "Identity Reviews", icon: "finger-print-outline" as const },
            { id: "residents", label: "Resident Accounts", icon: "people-outline" as const },
            { id: "volunteers", label: "Volunteer Approvals", icon: "checkmark-circle-outline" as const },
            { id: "insights", label: "Service Analytics", icon: "stats-chart-outline" as const },
          ] as {id: WorkspaceTab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"]}[]).map(tab => (
            <TouchableOpacity key={tab.id} accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: workspaceTab === tab.id }}
              onPress={() => setWorkspaceTab(tab.id)}
              style={[styles.workspaceTab, workspaceTab === tab.id && styles.workspaceTabActive]}>
              <Ionicons name={tab.icon} size={16} color={workspaceTab === tab.id ? "#126B50" : "#708477"} />
              <Text style={[styles.workspaceTabText, workspaceTab === tab.id && styles.workspaceTabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {workspaceTab === "overview" && (
          <>
        <View style={[styles.overviewColumns, width < 1220 && styles.overviewColumnsStack]}>
          <View style={[styles.overviewPrimary, width < 1220 && styles.overviewFullWidth]}>
            <View style={styles.overviewSectionHeader}>
              <View style={styles.sectionEyebrow}>
                <View style={styles.sectionEyebrowLine} />
                <Text style={styles.sectionEyebrowText}>ACTION CENTER</Text>
              </View>
              <Text style={styles.sectionTitle}>Priority Actions</Text>
              <Text style={styles.overviewSectionSubtitle}>Urgent reports first; other requests follow their own approval sequence.</Text>
            </View>
            <ListPagination page={priorityPage} total={5} pageSize={5} onChange={setPriorityPage} />
            {[
              {
                key: "critical", label: "Emergency response",
                detail: dataError ? "Live status unavailable" : !overviewReady ? "Loading current workload…" :
                  metrics.criticalOpen > 0 ? `${metrics.criticalOpen} critical case${metrics.criticalOpen === 1 ? "" : "s"} requiring attention` : "Review incoming emergency reports",
                icon: "warning-outline" as const, count: metrics.criticalOpen,
                route: "/(admin)/admin-cases",
              },
              {
                key: "resident", label: "Pending user profiles",
                detail: dataError ? "Live status unavailable" : !overviewReady ? "Loading current workload…" :
                  pendingUserIds.length + " non-staff accounts awaiting review",
                icon: "shield-checkmark-outline" as const, count: pendingUserIds.length,
                route: "/(admin)/command-center?section=residents",
              },
              {
                key: "identity", label: "AI identity reviews",
                detail: "Open the dedicated identity verification queue",
                icon: "finger-print-outline" as const, count: null,
                route: "/(admin)/identity-reviews",
              },
              {
                key: "volunteers", label: "Volunteer applications",
                detail: dataError ? "Live status unavailable" : !overviewReady ? "Loading current workload…" :
                  pendingVolunteerIds.length + " volunteer application(s) awaiting review",
                icon: "people-outline" as const, count: pendingVolunteerIds.length,
                route: "/(admin)/command-center?section=volunteers",
              },
              {
                key: "attendance", label: "Community event attendance",
                detail: "Review attendance and verified service hours",
                icon: "checkmark-done-outline" as const, count: null,
                route: "/(admin)/community-attendance",
              },
            ].slice((priorityPage - 1) * 5, priorityPage * 5).map(action => (
              <TouchableOpacity key={action.key} accessibilityRole="button"
                accessibilityLabel={action.label} style={styles.overviewAction}
                activeOpacity={0.78} onPress={() => navigate(action.route)}>
                <View style={styles.overviewActionIcon}>
                  <Ionicons name={action.icon} size={19} color="#2E7560" />
                </View>
                <View style={styles.overviewActionContent}>
                  <Text style={styles.overviewActionTitle}>{action.label}</Text>
                  <Text style={styles.overviewActionDetail}>{action.detail}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#7D998D" />
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.overviewSecondary, width < 1220 && styles.overviewFullWidth]}>
            <DashboardRecentActivities />
          </View>
        </View>
          </>
        )}
        {workspaceTab === "identity" && <DashboardPendingIdentityReviews />}
        {workspaceTab === "residents" && <ResidentAccountsPanel />}
        {workspaceTab === "volunteers" && <DashboardVolunteerApprovals />}

        {workspaceTab === "insights" && <DashboardOperationalInsights workload={{
          emergency: dataError || !overviewReady ? null : metrics.activeCases,
          approvals: dataError || !overviewReady ? null : metrics.pendingReviews,
        }} />}
      </View>

    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    workspaceTabs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5,
      borderBottomWidth: 1, borderBottomColor: "#DDE8E1", marginBottom: 10 },
    workspaceTab: { flexGrow: 1, minHeight: 43, flexDirection: "row", alignItems: "center",
      justifyContent: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 10,
      borderBottomWidth: 2, borderBottomColor: "transparent" },
    workspaceTabActive: { borderBottomColor: "#167456", backgroundColor: "#EAF4ED", borderTopLeftRadius: 8, borderTopRightRadius: 8 },
    workspaceTabText: { fontSize: 12, color: "#61776B", fontWeight: "600" },
    workspaceTabTextActive: { color: "#135E48", fontWeight: "800" },
    // Xacton-inspired clarity: restrained KPI cards below one evergreen hero.
    kpiGrid: {flexDirection:"row",flexWrap:"wrap",gap:9,marginBottom:9},
    kpiGridCompact: {gap:9},
    kpiCard: {flex:1,minWidth:165,backgroundColor:"#FFFFFF",borderRadius:12,
      padding:12,borderWidth:1,borderColor:"#D9E7DF"},
    kpiCardCompact: {minWidth:136,padding:13},
    kpiCardFeatured: {backgroundColor:"#087B60",borderColor:"#087B60"},
    kpiCardHeader: {flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",gap:8},
    kpiCardLabel: {fontSize:11,fontWeight:"700",color:"#688073",flex:1,lineHeight:16},
    kpiCardValue: {fontSize:25,fontWeight:"800",color:"#164535",marginTop:5,fontVariant:["tabular-nums"]},
    kpiCardFoot: {flexDirection:"row",justifyContent:"space-between",gap:7,alignItems:"center",marginTop:5},
    kpiCardHint: {flex:1,fontSize:10.5,color:"#829B8E"},
    kpiFeaturedText: {color:"#FFFFFF"},
    kpiFeaturedHint: {color:"#C5EDDF"},
    // VolunServe identity: one rich evergreen masthead, not a field of cards.
    premiumHero: {
      overflow: "hidden", position: "relative", backgroundColor: "#103E33",
      borderRadius: 11, paddingHorizontal: 20, paddingTop: 13, paddingBottom: 10,
      marginBottom: 10, borderWidth: 1, borderColor: "#235D4E",
    },
    heroOrbLarge: {
      position: "absolute", right: -105, top: -180, width: 375, height: 375,
      borderRadius: 190, borderWidth: 1, borderColor: "rgba(203,243,220,0.14)",
      backgroundColor: "rgba(60,143,113,0.09)",
    },
    heroOrbSmall: {
      position: "absolute", right: 90, top: -130, width: 250, height: 250,
      borderRadius: 125, borderWidth: 1, borderColor: "rgba(203,243,220,0.12)",
    },
    heroHeader: {
      flexDirection: "row", alignItems: "flex-start",
      justifyContent: "space-between", gap: 16, paddingBottom: 8,
    },
    heroHeaderCompact: { flexDirection: "column", gap: 8, paddingBottom: 7 },
    heroCopy: { flex: 1, minWidth: 0, zIndex: 1 },
    heroEyebrow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 5 },
    heroEyebrowMark: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#AFD7A0" },
    heroEyebrowText: { color: "#A9D9C5", letterSpacing: 1.35, fontSize: 10.5, fontWeight: "700" },
    heroTitle: { color: "#FFFFFF", fontSize: 26, lineHeight: 32, letterSpacing: -0.7, fontWeight: "700" },
    heroSubtitle: { color: "#C0DED0", maxWidth: 570, marginTop: 4, fontSize: 12, lineHeight: 17 },
    heroLocality: {
      flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 8, zIndex: 1,
    },
    heroLocalityText: { color: "#BADDCB", fontSize: 9.5, letterSpacing: 0.6, fontWeight: "700" },
    heroDivider: { height: 1, backgroundColor: "rgba(204,238,217,0.21)" },
    metricItemDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(204,238,217,0.18)" },
    sectionEyebrow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 },
    sectionEyebrowLine: { height: 2, width: 21, backgroundColor: "#3C9072" },
    sectionEyebrowText: { fontSize: 10, fontWeight: "800", color: "#53836D", letterSpacing: 1.0 },
    chartHeadingAccent: { width: 34, height: 3, borderRadius: 2, backgroundColor: "#2F8468", marginBottom: 11 },
    overviewEyebrow: { flexDirection: "row", alignItems: "center", gap: 7, paddingBottom: 13 },
    overviewEyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#23765F" },
    overviewColumns: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 6 },
    overviewColumnsStack: { flexDirection: "column", gap: 10 },
    overviewPrimary: { flex: 1, minWidth: 0, padding: 13, borderRadius: 11, borderWidth: 1, borderColor: "#DFE9E1", backgroundColor: "#FFFFFF" },
    overviewSecondary: { flex: 1, minWidth: 0 },
    overviewFullWidth: { flex: 0, width: "100%" },
    overviewSectionHeader: { marginBottom: 10 },
    overviewSectionSubtitle: { color: "#6C8076", fontSize: 11.5, lineHeight: 17, marginTop: 3 },
    overviewAction: {
      flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 8, paddingHorizontal: 2,
      borderBottomWidth: 1, borderColor: "#EDF1ED", minHeight: 49,
    },
    overviewActionIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#EAF4ED", alignItems: "center", justifyContent: "center" },
    overviewActionContent: { flex: 1, minWidth: 0 },
    overviewActionTitle: { fontSize: 12.5, fontWeight: "700", color: "#173E31" },
    overviewActionDetail: { fontSize: 11, lineHeight: 16, color: "#708579", marginTop: 2 },
    metricItemCritical: {},
    metricItemValueCritical: { color: "#EBC18B" },
    overline: {
      fontSize: 10, letterSpacing: 1.2, color: "#688076", fontWeight: "700", marginBottom: 9,
    },
    flatSummary: { marginBottom: 26 },
    metricStrip: {
      flexDirection: "row", flexWrap: "wrap",
    },
    metricStripCompact: { flexWrap: "wrap" },
    metricItem: { flexGrow: 1, flexBasis: "24%", minWidth: 138, paddingVertical: 20, paddingHorizontal: 17 },
    metricItemLabel: { fontSize: 11.5, color: "#B6D5C4", fontWeight: "600" },
    metricItemValue: { fontSize: 31, lineHeight: 40, fontWeight: "700", color: "#FFFFFF", marginTop: 5, fontVariant: ["tabular-nums"] },
    queueSection: { marginTop: 31 },
    queueHeader: { marginBottom: 15 },
    queueRow: {
      flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16,
      borderTopWidth: 1, borderTopColor: "#DDE6E1", minHeight: 65,
    },
    queueContent: { flex: 1, minWidth: 0 },
    queueTitle: { fontSize: 13, fontWeight: "700", color: "#173D32" },
    queueSummary: { fontSize: 12, color: "#6C7F77", lineHeight: 18, marginTop: 4 },
    screen: {
      flex: 1,
      minHeight: 0,
      backgroundColor: "#F6F8F7",
    },

    // Separate right-side scrolling from the fixed Admin navigation.
    webScrollBar: {
      overflowY: "auto",
      scrollbarWidth: "thin",
      scrollbarColor: "#8CAA9A #F6F8F7",
    } as any,

    page: {
      width: "100%",
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 10,
    },

    content: {
      width: "100%",
      alignSelf: "center",
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F5F7FB",
      padding: 24,
    },

    loadingText: {
      marginTop: 12,
      color: "#64748B",
      fontSize: 13,
      fontWeight: "600",
    },

    header: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 16,
      marginBottom: 30,
    },

    headerCopy: {
      flex: 1,
      minWidth: 0,
    },

    title: {
      color: "#173D32",
      fontSize: 30,
      fontWeight: "700",
      letterSpacing: -0.5,
    },

    subtitle: {
      marginTop: 5,
      color: "#64748B",
      fontSize: 13,
      lineHeight: 19,
    },

    adminBadge: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor:
        "#ECFDF5",
      borderWidth: 1,
      borderColor:
        "#A7F3D0",
    },

    adminBadgeText: {
      color: "#0F766E",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    warningBox: {
      marginBottom: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      padding: 12,
      borderRadius: 11,
      backgroundColor:
        "#FFFBEB",
      borderWidth: 1,
      borderColor:
        "#FDE68A",
    },

    warningText: {
      flex: 1,
      color: "#92400E",
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "600",
    },

    lguDoctrineCard: {
      marginBottom: 24,
      padding: 16,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      borderRadius: 15,
      backgroundColor: "#ECFDF5",
      borderWidth: 1,
      borderColor: "#A7F3D0",
    },

    lguDoctrineIcon: {
      width: 44,
      height: 44,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#D1FAE5",
    },

    lguDoctrineCopy: {
      flex: 1,
    },

    lguDoctrineTitle: {
      color: "#065F46",
      fontSize: 14,
      fontWeight: "900",
    },

    lguDoctrineText: {
      marginTop: 4,
      color: "#3F6F62",
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "600",
    },

    sectionHeader: {
      marginBottom: 13,
    },

    overviewHeader: {
      marginTop: 30,
    },

    sectionTitle: {
      color: "#173D32",
      fontSize: 17,
      fontWeight: "700",
    },

    sectionSubtitle: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 12.5,
    },

    moduleGrid: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "stretch",
    },

    moduleCard: {
      minHeight: 196,
      padding: 18,
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCEAE8",
    },

    moduleTop: {
      minHeight: 44,
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 10,
    },

    moduleIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent:
        "center",
    },

    countBadge: {
      minWidth: 27,
      height: 27,
      paddingHorizontal: 7,
      borderRadius: 14,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F1F5F9",
    },

    countBadgeText: {
      color: "#334155",
      fontSize: 11,
      fontWeight: "900",
    },

    moduleTitle: {
      marginTop: 17,
      color: "#0F172A",
      fontSize: 15,
      fontWeight: "900",
    },

    moduleDescription: {
      marginTop: 6,
      minHeight: 38,
      color: "#64748B",
      fontSize: 12,
      lineHeight: 18,
    },

    moduleFooter: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    openText: {
      color: "#078F82",
      fontSize: 12,
      fontWeight: "800",
    },

    overviewGrid: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "stretch",
    },

    overviewCard: {
      minHeight: 132,
      padding: 17,
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DCEAE8",
    },

    overviewIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent:
        "center",
    },

    overviewBody: {
      flex: 1,
      minWidth: 0,
    },

    overviewLabel: {
      color: "#334155",
      fontSize: 12,
      fontWeight: "800",
    },

    overviewValue: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 27,
      fontWeight: "900",
    },

    overviewDescription: {
      marginTop: 4,
      color: "#64748B",
      fontSize: 11.5,
      lineHeight: 16,
    },

  });
