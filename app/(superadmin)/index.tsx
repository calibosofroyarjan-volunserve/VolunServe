import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";
import { router, type Href } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type ModuleCardProps = {
  title: string;
  description: string;
  icon: IconName;
  iconBackground: string;
  iconColor: string;
  onPress: () => void;
};

export default function SuperAdminDashboard() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const { user, profile, loading: sessionLoading } = useUserSession();
  const authorized = !!user && profile?.role === "superadmin" && profile?.status === "approved";
  const [accountRows, setAccountRows] = useState<Array<Record<string, any>>>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");
  useEffect(() => {
    if (sessionLoading) return;
    if (!authorized) { setStatsLoading(false); setAccountRows([]); return; }
    const unsubscribe = onSnapshot(collection(db, "users"), snapshot => {
      setAccountRows(snapshot.docs.map(item => ({ uid: item.id, ...item.data() })));
      setStatsLoading(false);
      setStatsError("");
    }, () => {
      setStatsLoading(false);
      setStatsError("Account statistics could not be loaded from Firestore.");
    });
    return unsubscribe;
  }, [sessionLoading, authorized]);
  const stats = useMemo(() => {
    const active = accountRows.filter(item => item.status === "approved");
    const residents = active.filter(item =>
      !["admin", "superadmin", "lgu_personnel", "applicant"].includes(String(item.role || ""))
    );
    const verified = residents.filter(item =>
      item.identityVerified === true || item.identityStatus === "verified"
    ).length;
    const volunteers = residents.filter(item =>
      item.volunteerAccess === true && item.volunteerStatus === "approved"
    ).length;
    const admins = active.filter(item => item.role === "admin").length;
    const superadmins = active.filter(item => item.role === "superadmin").length;
    const lgu = active.filter(item => item.role === "lgu_personnel").length;
    const pct = (count: number, total: number) =>
      total > 0 ? Math.round((count / total) * 100) : 0;
    return {
      total: accountRows.length, active: active.length,
      residents: residents.length, verified, volunteers, admins, superadmins, lgu,
      rows: [
        { name: "Resident accounts", count: residents.length, percentage: pct(residents.length, active.length) },
        { name: "LGU Admin accounts", count: admins, percentage: pct(admins, active.length) },
        { name: "LGU responders", count: lgu, percentage: pct(lgu, active.length) },
        { name: "Super Admin accounts", count: superadmins, percentage: pct(superadmins, active.length) },
      ],
      verifiedPct: pct(verified, residents.length),
      volunteerPct: pct(volunteers, residents.length),
    };
  }, [accountRows]);

  const openRoute = (route: string) => {
    router.push(route as Href);
  };

  return (
    <ScrollView
      style={[styles.screen, Platform.OS === "web" && styles.webScrollBar]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={true}
      accessibilityLabel="Super Admin dashboard content"
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, compact && styles.titleCompact]}>
            Super Admin Dashboard
          </Text>

          <Text style={styles.subtitle}>
            Manage system access, records, security, and settings.
          </Text>
        </View>

        {!compact ? (
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={16} color="#078F82" />
            <Text style={styles.roleBadgeText}>SUPER ADMIN</Text>
          </View>
        ) : null}
      </View>

      <View style={{ marginBottom: 24, padding: 20, borderRadius: 17, borderWidth: 1, borderColor: "#D6E9E0", backgroundColor: "#FFFFFF" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: "900", color: "#153E35" }}>System Account Overview</Text>
          <Text style={{ fontSize: 10, fontWeight: "800", color: "#56796B" }}>FIRESTORE ACCOUNT RECORDS · NOT ONLINE USERS</Text>
        </View>
        {statsLoading ? <ActivityIndicator color="#087F67" /> : statsError ? (
          <Text style={{ color: "#B42318", fontSize: 12 }}>{statsError}</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 9, flexWrap: "wrap", marginBottom: 20 }}>
              {[
                { title: "Registered Accounts", value: stats.total },
                { title: "Approved Accounts", value: stats.active },
                { title: "Verified Residents", value: stats.verified },
                { title: "Approved Volunteers", value: stats.volunteers },
              ].map(item => (
                <View key={item.title} style={{ flexGrow: 1, minWidth: 135, padding: 14, backgroundColor: "#EFFAF4", borderRadius: 11 }}>
                  <Text style={{ fontSize: 21, fontWeight: "900", color: "#087E5C" }}>{item.value}</Text>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#416C5B", marginTop: 4 }}>{item.title}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 13, fontWeight: "900", color: "#1B4939", marginBottom: 10 }}>Account roles · comparison</Text>
            {stats.rows.map(item => (
              <View key={item.name} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
                  <Text style={{ fontSize: 11, color: "#36584A", fontWeight: "700" }}>{item.name}</Text>
                  <Text style={{ fontSize: 11, color: "#087F61", fontWeight: "900" }}>{item.count} · {item.percentage}%</Text>
                </View>
                <View style={{ height: 9, borderRadius: 20, backgroundColor: "#DEEBE4", overflow: "hidden" }}>
                  <View style={{ width: (item.percentage + "%") as any, height: "100%", backgroundColor: "#0D956E", borderRadius: 20 }} />
                </View>
              </View>
            ))}
            <Text style={{ fontSize: 13, fontWeight: "900", color: "#1B4939", marginBottom: 7, marginTop: 5 }}>
              Resident verification & volunteer access
            </Text>
            <Text style={{ fontSize: 11, color: "#587A6D", lineHeight: 19 }}>
              {stats.verifiedPct}% of approved Residents have verified identity. {stats.volunteerPct}% have approved Volunteer access. These are overlapping permissions, not separate accounts.
            </Text>
          </>
        )}
      </View>
      <Text style={styles.sectionTitle}>System Management</Text>

      <View style={[styles.grid, compact && styles.gridCompact]}>
        <ModuleCard
          title="Admin Accounts"
          description="Manage operational admin access."
          icon="people"
          iconBackground="#E6F7F1"
          iconColor="#078F82"
          onPress={() => openRoute("/(superadmin)/admin-accounts")}
        />

        <ModuleCard
          title="All Records"
          description="View system-wide records."
          icon="document-text-outline"
          iconBackground="#EDF5FF"
          iconColor="#2472CA"
          onPress={() => openRoute("/(superadmin)/all-records")}
        />

        <ModuleCard
          title="Audit Logs"
          description="Review system activity logs."
          icon="time-outline"
          iconBackground="#E8F8F0"
          iconColor="#07906C"
          onPress={() => openRoute("/(superadmin)/admin-logs")}
        />

        <ModuleCard
          title="System Settings"
          description="Manage platform settings."
          icon="settings"
          iconBackground="#FFF4E7"
          iconColor="#D97A14"
          onPress={() => openRoute("/(superadmin)/system-settings")}
        />
      </View>
    </ScrollView>
  );
}

function ModuleCard({
  title,
  description,
  icon,
  iconBackground,
  iconColor,
  onPress,
}: ModuleCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.82}
      onPress={onPress}
    >
      <View style={styles.cardMain}>
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: iconBackground,
            },
          ]}
        >
          <Ionicons name={icon} size={27} color={iconColor} />
        </View>

        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>

      <View style={styles.arrowButton}>
        <Ionicons name="arrow-forward" size={20} color="#078F82" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#F2F9FC",
  },
  webScrollBar: {
    overflowY: "scroll",
    scrollbarWidth: "auto",
    scrollbarColor: "#8CA3B2 #F2F9FC",
  } as any,
  content: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    paddingHorizontal: 28,
    paddingTop: 35,
    paddingBottom: 64,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 34,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: {
    color: "#0E2D4E",
    fontSize: 30,
    lineHeight: 39,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  titleCompact: { fontSize: 25, lineHeight: 32 },
  subtitle: {
    color: "#657D92",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
  },
  roleBadge: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#A7EDCE",
    backgroundColor: "#E7FBF2",
  },
  roleBadgeText: {
    color: "#08766C",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  sectionTitle: {
    color: "#0E2D4E",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  gridCompact: {
    flexDirection: "column",
  },
  card: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 0,
    minHeight: 205,
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCEAE8",
    padding: 18,
  },
  cardMain: { alignItems: "flex-start" },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  cardTitle: {
    color: "#0E2D4E",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 21,
  },
  cardDescription: {
    color: "#657D92",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    maxWidth: 230,
  },
  arrowButton: {
    alignSelf: "flex-start",
    marginTop: 13,
    alignItems: "center",
    justifyContent: "center",
  },
});
