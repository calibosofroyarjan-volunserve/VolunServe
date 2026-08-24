import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../lib/firebase";

type Role = "user" | "volunteer" | "admin" | "superadmin" | string;

type CaseStatus =
  | "reported"
  | "validated"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

type EventStatus = "upcoming" | "active" | "completed";

type VolunteerAppStatus = "pending" | "approved" | "rejected";

const toMillis = (value: any) => {
  try {
    if (!value) return 0;
    if (value?.toDate?.()) return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = new Date(value).getTime();
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  } catch {
    return 0;
  }
};

const clamp = (value: number, min = 0, max = 100) => {
  return Math.min(Math.max(value, min), max);
};

export default function AdminAnalytics() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [role, setRole] = useState<Role>("user");
  const allowed = role === "admin" || role === "superadmin";

  const [caseDocs, setCaseDocs] = useState<any[]>([]);
  const [eventDocs, setEventDocs] = useState<any[]>([]);
  const [appDocs, setAppDocs] = useState<any[]>([]);
  const [statDocs, setStatDocs] = useState<any[]>([]);
  const [donationDocs, setDonationDocs] = useState<any[]>([]);

  const [userDocs, setUserDocs] = useState<any[]>([]);
  const [certificateDocs, setCertificateDocs] = useState<any[]>([]);
  const [participantDocs, setParticipantDocs] = useState<any[]>([]);

  useEffect(() => {
    const run = async () => {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const r = (snap.data()?.role || "user")
          .toString()
          .trim()
          .toLowerCase();

        setRole(r);
      } catch {
        setRole("user");
      } finally {
        setCheckingRole(false);
      }
    };

    run();
  }, [router]);

  useEffect(() => {
    if (!allowed) return;

    const qCases = query(
      collection(db, "disasterCases"),
      orderBy("createdAt", "desc")
    );

    const unsubCases = onSnapshot(
      qCases,
      (snap) => {
        setCaseDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => setCaseDocs([])
    );

    const qEvents = query(
      collection(db, "volunteerEvents"),
      orderBy("createdAt", "desc")
    );

    const unsubEvents = onSnapshot(
      qEvents,
      (snap) => {
        setEventDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => setEventDocs([])
    );

    const qApps = query(collection(db, "volunteerApplications"));

    const unsubApps = onSnapshot(
      qApps,
      (snap) => {
        setAppDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => setAppDocs([])
    );

    const qStats = query(collection(db, "volunteerStats"));

    const unsubStats = onSnapshot(
      qStats,
      (snap) => {
        setStatDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => setStatDocs([])
    );

    const qDon = query(
      collection(db, "donations"),
      orderBy("createdAt", "desc")
    );

    const unsubDon = onSnapshot(
      qDon,
      (snap) => {
        setDonationDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => setDonationDocs([])
    );

    const qUsers = query(collection(db, "users"));

    const unsubUsers = onSnapshot(
      qUsers,
      (snap) => {
        setUserDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => setUserDocs([])
    );

    const qCertificates = query(collection(db, "certificates"));

    const unsubCertificates = onSnapshot(
      qCertificates,
      (snap) => {
        setCertificateDocs(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        );
      },
      () => setCertificateDocs([])
    );

    const qParticipants = query(collectionGroup(db, "participants"));

    const unsubParticipants = onSnapshot(
      qParticipants,
      (snap) => {
        setParticipantDocs(
          snap.docs.map((d) => {
            const data: any = d.data();
            const parentEventId = d.ref.parent.parent?.id || "";

            return {
              id: d.id,
              docId: d.id,
              eventId: data.eventId || parentEventId,
              ...data,
            };
          })
        );
      },
      () => setParticipantDocs([])
    );

    return () => {
      unsubCases();
      unsubEvents();
      unsubApps();
      unsubStats();
      unsubDon();
      unsubUsers();
      unsubCertificates();
      unsubParticipants();
    };
  }, [allowed]);

  const sendRiskReminder = async (volunteer: any) => {
    try {
      const targetUid = volunteer.docId || volunteer.uid || volunteer.userId;

      if (!targetUid) {
        Alert.alert(
          "Cannot Send Reminder",
          "This volunteer record has no valid Firebase UID."
        );
        return;
      }

      await addDoc(collection(db, "notifications"), {
        userId: targetUid,
        title: "Volunteer Attendance Reminder",
        message: `You are currently marked as ${volunteer.riskLevel} risk with a ${volunteer.riskScore}% risk score. Please confirm your attendance and complete check-in/check-out properly during volunteer events.`,
        type: "risk_reminder",
        riskLevel: volunteer.riskLevel,
        riskScore: volunteer.riskScore,
        read: false,
        createdAt: serverTimestamp(),
      });

      Alert.alert(
        "Reminder Sent",
        `Reminder sent to ${volunteer.name || "volunteer"}.`
      );
    } catch (error) {
      console.log("Send reminder error:", error);
      Alert.alert("Error", "Failed to send reminder.");
    }
  };

  const metrics = useMemo(() => {
    const caseTotal = caseDocs.length;
    const byCaseStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const c of caseDocs) {
      const s = (c.status || "reported") as CaseStatus;
      byCaseStatus[s] = (byCaseStatus[s] || 0) + 1;

      const sev = (c.severity || "medium") as string;
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    }

    const caseActive =
      (byCaseStatus["reported"] || 0) +
      (byCaseStatus["validated"] || 0) +
      (byCaseStatus["assigned"] || 0) +
      (byCaseStatus["in_progress"] || 0);

    const caseResolved =
      (byCaseStatus["resolved"] || 0) + (byCaseStatus["closed"] || 0);

    const eventTotal = eventDocs.length;
    const byEventStatus: Record<string, number> = {};

    for (const e of eventDocs) {
      const s = (e.status || "upcoming") as EventStatus;
      byEventStatus[s] = (byEventStatus[s] || 0) + 1;
    }

    const eventUpcoming = byEventStatus["upcoming"] || 0;
    const eventActive = byEventStatus["active"] || 0;
    const eventCompleted = byEventStatus["completed"] || 0;

    const appTotal = appDocs.length;
    const byAppStatus: Record<string, number> = {};

    for (const a of appDocs) {
      const s = (a.status || "pending") as VolunteerAppStatus;
      byAppStatus[s] = (byAppStatus[s] || 0) + 1;
    }

    const appPending = byAppStatus["pending"] || 0;
    const appApproved = byAppStatus["approved"] || 0;
    const appRejected = byAppStatus["rejected"] || 0;

    let totalHours = 0;
    let totalEventsServed = 0;
    let activeVolunteers = 0;

    for (const st of statDocs) {
      const h = Number(st.totalHours || 0);
      const ev = Number(st.totalEvents || 0);

      if (ev > 0 || h > 0) activeVolunteers += 1;

      totalHours += h;
      totalEventsServed += ev;
    }

    const donationTotal = donationDocs.length;
    const byDonStatus: Record<string, number> = {};
    let donationSum = 0;

    for (const d of donationDocs) {
      const s = (d.status || "pending") as string;
      byDonStatus[s] = (byDonStatus[s] || 0) + 1;
      donationSum += Number(d.amount || 0);
    }

    const totalUsers = userDocs.length;

    const totalUserPoints = userDocs.reduce(
      (sum, u) => sum + Number(u.points || 0),
      0
    );

    const totalJoined = userDocs.reduce(
      (sum, u) => sum + Number(u.joined || 0),
      0
    );

    const totalCompleted = userDocs.reduce(
      (sum, u) => sum + Number(u.completed || 0),
      0
    );

    const totalAchievementsUnlocked = userDocs.reduce((sum, u) => {
      return sum + (Array.isArray(u.achievements) ? u.achievements.length : 0);
    }, 0);

    const usersWithAchievements = userDocs.filter(
      (u) => Array.isArray(u.achievements) && u.achievements.length > 0
    ).length;

    const certificatesIssued = certificateDocs.length;

    const topPointUsers = [...userDocs]
      .sort((a, b) => Number(b.points || 0) - Number(a.points || 0))
      .slice(0, 5);

    const topAchievementUsers = [...userDocs]
      .sort((a, b) => {
        const bCount = Array.isArray(b.achievements)
          ? b.achievements.length
          : 0;

        const aCount = Array.isArray(a.achievements)
          ? a.achievements.length
          : 0;

        return bCount - aCount;
      })
      .slice(0, 5);

    const recentCertificates = [...certificateDocs]
      .sort((a, b) => {
        const ad = new Date(a.date || 0).getTime();
        const bd = new Date(b.date || 0).getTime();

        return bd - ad;
      })
      .slice(0, 5);

    const now = Date.now();
    const volunteerRiskMap: Record<string, any> = {};

    for (const p of participantDocs) {
      const uid = p.docId || p.uid || p.userId || p.id;

      if (!uid) continue;

      const name = p.fullName || p.name || "Volunteer";

      if (!volunteerRiskMap[uid]) {
        volunteerRiskMap[uid] = {
          uid,
          userId: uid,
          docId: uid,
          name,
          joined: 0,
          absent: 0,
          incomplete: 0,
          completed: 0,
          eventPoints: 0,
          lastActivityMs: 0,
        };
      }

      volunteerRiskMap[uid].joined += 1;
      volunteerRiskMap[uid].eventPoints += Number(p.points || 0);

      const checkedInMs = toMillis(p.checkedInAt);
      const checkedOutMs = toMillis(p.checkedOutAt);
      const joinedMs = toMillis(p.joinedAt);

      const lastActivity = Math.max(checkedInMs, checkedOutMs, joinedMs);
      volunteerRiskMap[uid].lastActivityMs = Math.max(
        volunteerRiskMap[uid].lastActivityMs,
        lastActivity
      );

      const hasCheckedIn = !!checkedInMs;
      const hasCheckedOut = !!checkedOutMs;

      if (!hasCheckedIn) {
        volunteerRiskMap[uid].absent += 1;
      } else if (hasCheckedIn && !hasCheckedOut) {
        volunteerRiskMap[uid].incomplete += 1;
      } else if (hasCheckedIn && hasCheckedOut) {
        volunteerRiskMap[uid].completed += 1;
      }
    }

    const predictiveDefaulters = Object.values(volunteerRiskMap)
      .map((v: any) => {
        const joined = v.joined || 1;

        const absentRate = v.absent / joined;
        const incompleteRate = v.incomplete / joined;
        const completionRate = v.completed / joined;

        const daysInactive = v.lastActivityMs
          ? Math.floor((now - v.lastActivityMs) / (1000 * 60 * 60 * 24))
          : 999;

        let inactivityRisk = 0;

        if (daysInactive >= 30) inactivityRisk = 20;
        else if (daysInactive >= 14) inactivityRisk = 12;
        else if (daysInactive >= 7) inactivityRisk = 6;

        let reliabilityBonus = 0;

        if (completionRate >= 0.85 && joined >= 3) reliabilityBonus = 15;
        else if (completionRate >= 0.7 && joined >= 2) reliabilityBonus = 8;

        let riskScore =
          absentRate * 50 +
          incompleteRate * 25 +
          (1 - completionRate) * 20 +
          inactivityRisk -
          reliabilityBonus;

        riskScore = clamp(Math.round(riskScore), 0, 100);

        let riskLevel = "LOW";
        let reason = "Good attendance completion history.";

        if (riskScore >= 71) {
          riskLevel = "HIGH";
          reason =
            "High risk due to repeated absences, incomplete attendance, or inactivity.";
        } else if (riskScore >= 31) {
          riskLevel = "MEDIUM";
          reason =
            "Moderate risk due to some missed or incomplete attendance records.";
        }

        return {
          ...v,
          joined,
          absentRate,
          incompleteRate,
          completionRate,
          daysInactive,
          riskScore,
          riskLevel,
          reason,
        };
      })
      .sort((a: any, b: any) => b.riskScore - a.riskScore)
      .slice(0, 8);

    const highRiskCount = predictiveDefaulters.filter(
      (v: any) => v.riskLevel === "HIGH"
    ).length;

    const mediumRiskCount = predictiveDefaulters.filter(
      (v: any) => v.riskLevel === "MEDIUM"
    ).length;

    const lowRiskCount = predictiveDefaulters.filter(
      (v: any) => v.riskLevel === "LOW"
    ).length;

    return {
      caseTotal,
      caseActive,
      caseResolved,
      byCaseStatus,
      bySeverity,

      eventTotal,
      eventUpcoming,
      eventActive,
      eventCompleted,

      appTotal,
      appPending,
      appApproved,
      appRejected,

      activeVolunteers,
      totalHours,
      totalEventsServed,

      donationTotal,
      donationSum,
      byDonStatus,

      totalUsers,
      totalUserPoints,
      totalJoined,
      totalCompleted,
      totalAchievementsUnlocked,
      usersWithAchievements,
      certificatesIssued,
      topPointUsers,
      topAchievementUsers,
      recentCertificates,

      predictiveDefaulters,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
    };
  }, [
    caseDocs,
    eventDocs,
    appDocs,
    statDocs,
    donationDocs,
    userDocs,
    certificateDocs,
    participantDocs,
  ]);

  if (checkingRole) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Checking access…</Text>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>Access Denied</Text>
        <Text style={styles.muted}>
          You must be admin/superadmin to view analytics.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Admin Analytics</Text>
          <Text style={styles.sub}>Role: {String(role)}</Text>
        </View>

        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={styles.darkBtn}
            onPress={() => router.push("/(tabs)/admin-logs")}
          >
            <Text style={styles.darkBtnText}>Admin Logs</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => router.push("/(admin)/admin-cases" as any)}
        >
          <Text style={styles.navText}>Cases</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => router.push("/(admin)/admin-events" as any)}
        >
          <Text style={styles.navText}>Events</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => router.push("/(tabs)/donation-list" as any)}
        >
          <Text style={styles.navText}>Donations</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => router.push("/(tabs)/admin-analytics" as any)}
        >
          <Text style={styles.navText}>Analytics</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionHeader}>📊 System Overview</Text>

      <View style={styles.grid}>
        <KpiCard
          title="Total Cases"
          value={metrics.caseTotal}
          hint={`Active: ${metrics.caseActive} • Resolved: ${metrics.caseResolved}`}
        />

        <KpiCard
          title="Volunteer Events"
          value={metrics.eventTotal}
          hint={`Upcoming: ${metrics.eventUpcoming} • Active: ${metrics.eventActive} • Done: ${metrics.eventCompleted}`}
        />

        <KpiCard
          title="Volunteer Applications"
          value={metrics.appTotal}
          hint={`Pending: ${metrics.appPending} • Approved: ${metrics.appApproved} • Rejected: ${metrics.appRejected}`}
        />

        <KpiCard
          title="Total Users"
          value={metrics.totalUsers}
          hint="Profiles registered in users collection"
        />

        <KpiCard
          title="Certificates Issued"
          value={metrics.certificatesIssued}
          hint="Generated completion certificates"
        />

        <KpiCard
          title="Achievements Unlocked"
          value={metrics.totalAchievementsUnlocked}
          hint={`Users with badges: ${metrics.usersWithAchievements}`}
        />

        <KpiCard
          title="Total Points"
          value={metrics.totalUserPoints}
          hint={`Joined: ${metrics.totalJoined} • Completed: ${metrics.totalCompleted}`}
        />

        <KpiCard
          title="Predictive High Risk"
          value={metrics.highRiskCount}
          hint={`Medium: ${metrics.mediumRiskCount} • Low: ${metrics.lowRiskCount}`}
        />

        <KpiCard
          title="Active Volunteers"
          value={metrics.activeVolunteers}
          hint="Based on volunteerStats"
        />

        <KpiCard
          title="Total Hours Served"
          value={metrics.totalHours.toFixed(2)}
          hint={`Total events served: ${metrics.totalEventsServed}`}
        />

        <KpiCard
          title="Total Donations"
          value={metrics.donationTotal}
          hint={`Total amount: PHP ${metrics.donationSum.toFixed(2)}`}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚠️ Predictive Defaulter Analysis</Text>

        <Text style={styles.predictiveIntro}>
          Uses joined-event attendance history to estimate which volunteers may
          not show up or may fail to complete future events.
        </Text>

        {metrics.predictiveDefaulters.length === 0 ? (
          <Text style={styles.empty}>No joined volunteer attendance data yet.</Text>
        ) : (
          metrics.predictiveDefaulters.map((v: any, index: number) => (
            <View key={v.uid || index} style={styles.riskCard}>
              <View style={styles.riskTopRow}>
                <Text style={styles.riskName}>{v.name}</Text>

                <Text
                  style={[
                    styles.riskBadge,
                    v.riskLevel === "HIGH"
                      ? styles.highRisk
                      : v.riskLevel === "MEDIUM"
                      ? styles.mediumRisk
                      : styles.lowRisk,
                  ]}
                >
                  {v.riskLevel}
                </Text>
              </View>

              <View style={styles.riskProgressTrack}>
                <View
                  style={[
                    styles.riskProgressFill,
                    {
                      width: `${v.riskScore}%` as any,
                      backgroundColor:
                        v.riskLevel === "HIGH"
                          ? "#dc2626"
                          : v.riskLevel === "MEDIUM"
                          ? "#f59e0b"
                          : "#16a34a",
                    },
                  ]}
                />
              </View>

              <Text style={styles.riskScore}>Risk Score: {v.riskScore}%</Text>

              <Text style={styles.riskMeta}>
                Joined: {v.joined} • Completed: {v.completed} • Absent:{" "}
                {v.absent} • Incomplete: {v.incomplete}
              </Text>

              <Text style={styles.riskMeta}>
                Completion Rate: {Math.round(v.completionRate * 100)}% • Last
                Activity:{" "}
                {v.daysInactive >= 999
                  ? "No activity"
                  : `${v.daysInactive} day(s) ago`}
              </Text>

              <Text style={styles.riskReason}>{v.reason}</Text>

              {v.riskLevel !== "LOW" && (
                <TouchableOpacity
                  style={styles.reminderBtn}
                  onPress={() => sendRiskReminder(v)}
                >
                  <Text style={styles.reminderBtnText}>Send Reminder</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏆 Top Volunteers by Points</Text>

        {metrics.topPointUsers.length === 0 ? (
          <Text style={styles.empty}>No users yet.</Text>
        ) : (
          metrics.topPointUsers.map((u, index) => (
            <LeaderboardRow
              key={u.id || index}
              rank={index + 1}
              name={u.fullName || u.name || u.email || "User"}
              value={`${Number(u.points || 0)} pts`}
            />
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎖 Achievement Leaders</Text>

        {metrics.topAchievementUsers.length === 0 ? (
          <Text style={styles.empty}>No achievements unlocked yet.</Text>
        ) : (
          metrics.topAchievementUsers.map((u, index) => {
            const count = Array.isArray(u.achievements)
              ? u.achievements.length
              : 0;

            return (
              <LeaderboardRow
                key={u.id || index}
                rank={index + 1}
                name={u.fullName || u.name || u.email || "User"}
                value={`${count} badges`}
              />
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📄 Recent Certificates</Text>

        {metrics.recentCertificates.length === 0 ? (
          <Text style={styles.empty}>No certificates issued yet.</Text>
        ) : (
          metrics.recentCertificates.map((c, index) => (
            <View key={c.id || index} style={styles.certRow}>
              <Text style={styles.certName}>{c.name || "Volunteer"}</Text>
              <Text style={styles.certTask}>
                {c.task || "Volunteer Task"}
              </Text>
              <Text style={styles.certId}>
                ID: {c.certificateId || c.id}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Case Status Breakdown</Text>
        <BreakdownRow label="REPORTED" value={metrics.byCaseStatus["reported"] || 0} />
        <BreakdownRow label="VALIDATED" value={metrics.byCaseStatus["validated"] || 0} />
        <BreakdownRow label="ASSIGNED" value={metrics.byCaseStatus["assigned"] || 0} />
        <BreakdownRow label="IN_PROGRESS" value={metrics.byCaseStatus["in_progress"] || 0} />
        <BreakdownRow label="RESOLVED" value={metrics.byCaseStatus["resolved"] || 0} />
        <BreakdownRow label="CLOSED" value={metrics.byCaseStatus["closed"] || 0} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Case Severity Breakdown</Text>
        <BreakdownRow label="CRITICAL" value={metrics.bySeverity["critical"] || 0} />
        <BreakdownRow label="HIGH" value={metrics.bySeverity["high"] || 0} />
        <BreakdownRow label="MEDIUM" value={metrics.bySeverity["medium"] || 0} />
        <BreakdownRow label="LOW" value={metrics.bySeverity["low"] || 0} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Donation Status Breakdown</Text>
        <BreakdownRow label="PENDING" value={metrics.byDonStatus["pending"] || 0} />
        <BreakdownRow label="RECEIVED" value={metrics.byDonStatus["received"] || 0} />
        <BreakdownRow label="DISTRIBUTED" value={metrics.byDonStatus["distributed"] || 0} />
        <BreakdownRow label="REJECTED" value={metrics.byDonStatus["rejected"] || 0} />
      </View>

      <Text style={styles.footerNote}>
        Note: Volunteer hours depend on the collection{" "}
        <Text style={{ fontWeight: "900" }}>volunteerStats</Text>.
        Certificates, achievements, and predictive risk are based on checkout,
        attendance, and joined-event participant records.
      </Text>
    </ScrollView>
  );
}

function KpiCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: any;
  hint?: string;
}) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiTitle}>{title}</Text>
      <Text style={styles.kpiValue}>{String(value)}</Text>
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
    </View>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function LeaderboardRow({
  rank,
  name,
  value,
}: {
  rank: number;
  name: string;
  value: string;
}) {
  const medal =
    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  return (
    <View style={styles.leaderboardRow}>
      <Text style={styles.leaderboardRank}>{medal}</Text>
      <Text style={styles.leaderboardName}>{name}</Text>
      <Text style={styles.leaderboardHours}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#f4f7fb" },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 10,
  },
  muted: { color: "#64748b", textAlign: "center", fontWeight: "700" },
  denied: { fontSize: 18, fontWeight: "900", color: "#dc2626" },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: "900", color: "#0f172a" },
  sub: { marginTop: 2, color: "#475569", fontWeight: "800" },
  headerBtns: { flexDirection: "row", gap: 10 },

  darkBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  darkBtnText: { color: "#fff", fontWeight: "900" },

  navRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  navBtn: {
    flex: 1,
    minWidth: "30%",
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  navText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  sectionHeader: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 10,
    marginTop: 4,
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpi: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  kpiTitle: { color: "#334155", fontWeight: "900", marginBottom: 6 },
  kpiValue: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  kpiHint: {
    marginTop: 6,
    color: "#64748b",
    fontWeight: "700",
    lineHeight: 16,
  },

  section: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionTitle: {
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 10,
  },

  predictiveIntro: {
    color: "#64748b",
    fontWeight: "700",
    lineHeight: 18,
    marginBottom: 10,
  },

  riskCard: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },

  riskTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  riskName: {
    flex: 1,
    fontWeight: "900",
    color: "#0f172a",
  },

  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    overflow: "hidden",
  },

  highRisk: {
    backgroundColor: "#dc2626",
  },

  mediumRisk: {
    backgroundColor: "#f59e0b",
  },

  lowRisk: {
    backgroundColor: "#16a34a",
  },

  riskProgressTrack: {
    height: 10,
    backgroundColor: "#e5e7eb",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 10,
  },

  riskProgressFill: {
    height: "100%",
    borderRadius: 999,
  },

  riskScore: {
    marginTop: 6,
    fontWeight: "900",
    color: "#111827",
  },

  riskMeta: {
    marginTop: 3,
    color: "#475569",
    fontWeight: "700",
    fontSize: 12,
  },

  riskReason: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 12,
    lineHeight: 16,
  },

  reminderBtn: {
    marginTop: 10,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },

  reminderBtnText: {
    color: "#fff",
    fontWeight: "900",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  rowLabel: { color: "#334155", fontWeight: "800" },
  rowValue: { color: "#0f172a", fontWeight: "900" },

  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 8,
  },
  leaderboardRank: {
    fontWeight: "900",
    color: "#f59e0b",
    width: 36,
  },
  leaderboardName: {
    flex: 1,
    color: "#0f172a",
    fontWeight: "700",
  },
  leaderboardHours: {
    fontWeight: "900",
    color: "#2563eb",
  },

  certRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  certName: {
    color: "#0f172a",
    fontWeight: "900",
  },
  certTask: {
    color: "#475569",
    fontWeight: "700",
    marginTop: 2,
  },
  certId: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 2,
  },

  empty: {
    color: "#64748b",
    fontWeight: "700",
    fontStyle: "italic",
  },

  footerNote: {
    marginTop: 14,
    color: "#64748b",
    fontWeight: "700",
    lineHeight: 18,
  },
});