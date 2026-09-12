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

type Role =
  | "user"
  | "volunteer"
  | "admin"
  | "superadmin"
  | string;

type CaseStatus =
  | "reported"
  | "validated"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

type EventStatus =
  | "upcoming"
  | "active"
  | "completed";

type VolunteerAppStatus =
  | "pending"
  | "approved"
  | "rejected";

const toMillis = (value: any) => {
  try {
    if (!value) return 0;

    if (value?.toDate?.()) {
      return value.toDate().getTime();
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      const parsed = new Date(value).getTime();
      return Number.isNaN(parsed) ? 0 : parsed;
    }

    return 0;
  } catch {
    return 0;
  }
};

const clamp = (
  value: number,
  min = 0,
  max = 100
) => {
  return Math.min(Math.max(value, min), max);
};

export default function AdminAnalytics() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] =
    useState(true);

  const [role, setRole] =
    useState<Role>("user");

  const allowed =
    role === "admin" ||
    role === "superadmin";

  const [caseDocs, setCaseDocs] =
    useState<any[]>([]);

  const [eventDocs, setEventDocs] =
    useState<any[]>([]);

  const [appDocs, setAppDocs] =
    useState<any[]>([]);

  const [statDocs, setStatDocs] =
    useState<any[]>([]);

  const [donationDocs, setDonationDocs] =
    useState<any[]>([]);

  const [userDocs, setUserDocs] =
    useState<any[]>([]);

  const [certificateDocs, setCertificateDocs] =
    useState<any[]>([]);

  const [participantDocs, setParticipantDocs] =
    useState<any[]>([]);

  useEffect(() => {
    const run = async () => {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(
          doc(db, "users", user.uid)
        );

        const currentRole = (
          snap.data()?.role || "user"
        )
          .toString()
          .trim()
          .toLowerCase();

        setRole(currentRole);
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

    const casesQuery = query(
      collection(db, "disasterCases"),
      orderBy("createdAt", "desc")
    );

    const unsubscribeCases = onSnapshot(
      casesQuery,
      (snapshot) => {
        setCaseDocs(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      () => setCaseDocs([])
    );

    const eventsQuery = query(
      collection(db, "volunteerEvents"),
      orderBy("createdAt", "desc")
    );

    const unsubscribeEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        setEventDocs(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      () => setEventDocs([])
    );

    const applicationsQuery = query(
      collection(db, "volunteerApplications")
    );

    const unsubscribeApplications = onSnapshot(
      applicationsQuery,
      (snapshot) => {
        setAppDocs(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      () => setAppDocs([])
    );

    const statsQuery = query(
      collection(db, "volunteerStats")
    );

    const unsubscribeStats = onSnapshot(
      statsQuery,
      (snapshot) => {
        setStatDocs(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      () => setStatDocs([])
    );

    const donationsQuery = query(
      collection(db, "donations"),
      orderBy("createdAt", "desc")
    );

    const unsubscribeDonations = onSnapshot(
      donationsQuery,
      (snapshot) => {
        setDonationDocs(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      () => setDonationDocs([])
    );

    const usersQuery = query(
      collection(db, "users")
    );

    const unsubscribeUsers = onSnapshot(
      usersQuery,
      (snapshot) => {
        setUserDocs(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      () => setUserDocs([])
    );

    const certificatesQuery = query(
      collection(db, "certificates")
    );

    const unsubscribeCertificates = onSnapshot(
      certificatesQuery,
      (snapshot) => {
        setCertificateDocs(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      () => setCertificateDocs([])
    );

    const participantsQuery = query(
      collectionGroup(db, "participants")
    );

    const unsubscribeParticipants = onSnapshot(
      participantsQuery,
      (snapshot) => {
        setParticipantDocs(
          snapshot.docs.map((item) => {
            const data: any = item.data();

            const parentEventId =
              item.ref.parent.parent?.id || "";

            return {
              id: item.id,
              docId: item.id,
              eventId:
                data.eventId ||
                parentEventId,
              ...data,
            };
          })
        );
      },
      () => setParticipantDocs([])
    );

    return () => {
      unsubscribeCases();
      unsubscribeEvents();
      unsubscribeApplications();
      unsubscribeStats();
      unsubscribeDonations();
      unsubscribeUsers();
      unsubscribeCertificates();
      unsubscribeParticipants();
    };
  }, [allowed]);

  const sendRiskReminder = async (
    volunteer: any
  ) => {
    try {
      const targetUid =
        volunteer.docId ||
        volunteer.uid ||
        volunteer.userId;

      if (!targetUid) {
        Alert.alert(
          "Cannot Send Reminder",
          "This volunteer record has no valid Firebase UID."
        );

        return;
      }

      await addDoc(
        collection(db, "notifications"),
        {
          userId: targetUid,
          title:
            "Volunteer Attendance Reminder",
          message: `You are currently marked as ${volunteer.riskLevel} risk with a ${volunteer.riskScore}% risk score. Please confirm your attendance and complete check-in/check-out properly during volunteer events.`,
          type: "risk_reminder",
          riskLevel: volunteer.riskLevel,
          riskScore: volunteer.riskScore,
          read: false,
          createdAt: serverTimestamp(),
        }
      );

      Alert.alert(
        "Reminder Sent",
        `Reminder sent to ${
          volunteer.name || "volunteer"
        }.`
      );
    } catch (error) {
      console.log(
        "Send reminder error:",
        error
      );

      Alert.alert(
        "Error",
        "Failed to send reminder."
      );
    }
  };

  const metrics = useMemo(() => {
    const caseTotal = caseDocs.length;

    const byCaseStatus:
      Record<string, number> = {};

    const bySeverity:
      Record<string, number> = {};

    for (const item of caseDocs) {
      const status = (
        item.status || "reported"
      ) as CaseStatus;

      byCaseStatus[status] =
        (byCaseStatus[status] || 0) + 1;

      const severity = (
        item.severity || "medium"
      ) as string;

      bySeverity[severity] =
        (bySeverity[severity] || 0) + 1;
    }

    const caseActive =
      (byCaseStatus.reported || 0) +
      (byCaseStatus.validated || 0) +
      (byCaseStatus.assigned || 0) +
      (byCaseStatus.in_progress || 0);

    const caseResolved =
      (byCaseStatus.resolved || 0) +
      (byCaseStatus.closed || 0);

    const eventTotal = eventDocs.length;

    const byEventStatus:
      Record<string, number> = {};

    for (const item of eventDocs) {
      const status = (
        item.status || "upcoming"
      ) as EventStatus;

      byEventStatus[status] =
        (byEventStatus[status] || 0) + 1;
    }

    const eventUpcoming =
      byEventStatus.upcoming || 0;

    const eventActive =
      byEventStatus.active || 0;

    const eventCompleted =
      byEventStatus.completed || 0;

    const appTotal = appDocs.length;

    const byAppStatus:
      Record<string, number> = {};

    for (const item of appDocs) {
      const status = (
        item.status || "pending"
      ) as VolunteerAppStatus;

      byAppStatus[status] =
        (byAppStatus[status] || 0) + 1;
    }

    const appPending =
      byAppStatus.pending || 0;

    const appApproved =
      byAppStatus.approved || 0;

    const appRejected =
      byAppStatus.rejected || 0;

    let totalHours = 0;
    let totalEventsServed = 0;
    let activeVolunteers = 0;

    for (const item of statDocs) {
      const hours =
        Number(item.totalHours || 0);

      const events =
        Number(item.totalEvents || 0);

      if (events > 0 || hours > 0) {
        activeVolunteers += 1;
      }

      totalHours += hours;
      totalEventsServed += events;
    }

    const donationTotal =
      donationDocs.length;

    const byDonStatus:
      Record<string, number> = {};

    let donationSum = 0;

    for (const item of donationDocs) {
      const status = (
        item.status || "pending"
      ) as string;

      byDonStatus[status] =
        (byDonStatus[status] || 0) + 1;

      donationSum +=
        Number(item.amount || 0);
    }

    const totalUsers = userDocs.length;

    const totalUserPoints =
      userDocs.reduce(
        (sum, item) =>
          sum + Number(item.points || 0),
        0
      );

    const totalJoined =
      userDocs.reduce(
        (sum, item) =>
          sum + Number(item.joined || 0),
        0
      );

    const totalCompleted =
      userDocs.reduce(
        (sum, item) =>
          sum +
          Number(item.completed || 0),
        0
      );

    const totalAchievementsUnlocked =
      userDocs.reduce((sum, item) => {
        const achievements =
          Array.isArray(item.achievements)
            ? item.achievements.length
            : 0;

        return sum + achievements;
      }, 0);

    const usersWithAchievements =
      userDocs.filter(
        (item) =>
          Array.isArray(
            item.achievements
          ) &&
          item.achievements.length > 0
      ).length;

    const certificatesIssued =
      certificateDocs.length;

    const topPointUsers = [
      ...userDocs,
    ]
      .sort(
        (first, second) =>
          Number(second.points || 0) -
          Number(first.points || 0)
      )
      .slice(0, 5);

    const topAchievementUsers = [
      ...userDocs,
    ]
      .sort((first, second) => {
        const secondCount =
          Array.isArray(
            second.achievements
          )
            ? second.achievements.length
            : 0;

        const firstCount =
          Array.isArray(
            first.achievements
          )
            ? first.achievements.length
            : 0;

        return secondCount - firstCount;
      })
      .slice(0, 5);

    const recentCertificates = [
      ...certificateDocs,
    ]
      .sort((first, second) => {
        const firstDate =
          new Date(
            first.date || 0
          ).getTime();

        const secondDate =
          new Date(
            second.date || 0
          ).getTime();

        return secondDate - firstDate;
      })
      .slice(0, 5);

    const now = Date.now();

    const volunteerRiskMap:
      Record<string, any> = {};

    for (const participant of participantDocs) {
      const uid =
        participant.docId ||
        participant.uid ||
        participant.userId ||
        participant.id;

      if (!uid) continue;

      const name =
        participant.fullName ||
        participant.name ||
        "Volunteer";

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

      volunteerRiskMap[uid].eventPoints +=
        Number(
          participant.points || 0
        );

      const checkedInMs = toMillis(
        participant.checkedInAt
      );

      const checkedOutMs = toMillis(
        participant.checkedOutAt
      );

      const joinedMs = toMillis(
        participant.joinedAt
      );

      const lastActivity = Math.max(
        checkedInMs,
        checkedOutMs,
        joinedMs
      );

      volunteerRiskMap[
        uid
      ].lastActivityMs = Math.max(
        volunteerRiskMap[uid]
          .lastActivityMs,
        lastActivity
      );

      const hasCheckedIn =
        !!checkedInMs;

      const hasCheckedOut =
        !!checkedOutMs;

      if (!hasCheckedIn) {
        volunteerRiskMap[uid].absent += 1;
      } else if (
        hasCheckedIn &&
        !hasCheckedOut
      ) {
        volunteerRiskMap[
          uid
        ].incomplete += 1;
      } else {
        volunteerRiskMap[
          uid
        ].completed += 1;
      }
    }

    const attendanceFollowUps =
      Object.values(volunteerRiskMap)
        .map((volunteer: any) => {
          const joined =
            volunteer.joined || 1;

          const absentRate =
            volunteer.absent / joined;

          const incompleteRate =
            volunteer.incomplete / joined;

          const completionRate =
            volunteer.completed / joined;

          const daysInactive =
            volunteer.lastActivityMs
              ? Math.floor(
                  (now -
                    volunteer.lastActivityMs) /
                    (1000 * 60 * 60 * 24)
                )
              : 999;

          let inactivityRisk = 0;

          if (daysInactive >= 30) {
            inactivityRisk = 20;
          } else if (
            daysInactive >= 14
          ) {
            inactivityRisk = 12;
          } else if (
            daysInactive >= 7
          ) {
            inactivityRisk = 6;
          }

          let reliabilityBonus = 0;

          if (
            completionRate >= 0.85 &&
            joined >= 3
          ) {
            reliabilityBonus = 15;
          } else if (
            completionRate >= 0.7 &&
            joined >= 2
          ) {
            reliabilityBonus = 8;
          }

          let riskScore =
            absentRate * 50 +
            incompleteRate * 25 +
            (1 - completionRate) * 20 +
            inactivityRisk -
            reliabilityBonus;

          riskScore = clamp(
            Math.round(riskScore),
            0,
            100
          );

          let riskLevel = "LOW";

          let reason =
            "Good attendance completion history.";

          if (riskScore >= 71) {
            riskLevel = "HIGH";

            reason =
              "High risk due to repeated absences, incomplete attendance, or inactivity.";
          } else if (
            riskScore >= 31
          ) {
            riskLevel = "MEDIUM";

            reason =
              "Moderate risk due to some missed or incomplete attendance records.";
          }

          return {
            ...volunteer,
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
        .sort(
          (
            first: any,
            second: any
          ) =>
            second.riskScore -
            first.riskScore
        )
        .slice(0, 8);

    const highRiskCount =
      attendanceFollowUps.filter(
        (item: any) =>
          item.riskLevel === "HIGH"
      ).length;

    const mediumRiskCount =
      attendanceFollowUps.filter(
        (item: any) =>
          item.riskLevel === "MEDIUM"
      ).length;

    const lowRiskCount =
      attendanceFollowUps.filter(
        (item: any) =>
          item.riskLevel === "LOW"
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

      attendanceFollowUps,
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

        <Text style={styles.muted}>
          Checking access…
        </Text>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>
          Access Denied
        </Text>

        <Text style={styles.muted}>
          You must be admin/superadmin to
          view analytics.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            Admin Analytics
          </Text>

          <Text style={styles.sub}>
            Role: {String(role)}
          </Text>
        </View>

        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={styles.darkBtn}
            onPress={() =>
              router.push(
                "/(admin)/admin-logs" as any
              )
            }
          >
            <Text style={styles.darkBtnText}>
              Admin Logs
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() =>
            router.push(
              "/(admin)/admin-cases" as any
            )
          }
        >
          <Text style={styles.navText}>
            Cases
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() =>
            router.push(
              "/(admin)/admin-events" as any
            )
          }
        >
          <Text style={styles.navText}>
            Events
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() =>
            router.push(
              "/(tabs)/donation-list" as any
            )
          }
        >
          <Text style={styles.navText}>
            Donations
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() =>
            router.push(
              "/(admin)/admin-analytics" as any
            )
          }
        >
          <Text style={styles.navText}>
            Analytics
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionHeader}>
        📊 System Overview
      </Text>

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
          value={
            metrics.totalAchievementsUnlocked
          }
          hint={`Users with badges: ${metrics.usersWithAchievements}`}
        />

        <KpiCard
          title="Total Points"
          value={metrics.totalUserPoints}
          hint={`Joined: ${metrics.totalJoined} • Completed: ${metrics.totalCompleted}`}
        />

        <KpiCard
          title="Attendance Follow-up"
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
        <Text style={styles.sectionTitle}>
          ⚠️ Attendance Completion Follow-up
        </Text>

        <Text style={styles.predictiveIntro}>
          This is a rule-based summary of
          recorded absences, incomplete
          attendance, completion rate, and
          inactivity. It is not an AI
          prediction.
        </Text>

        {metrics.attendanceFollowUps.length ===
        0 ? (
          <Text style={styles.empty}>
            No joined volunteer attendance
            data yet.
          </Text>
        ) : (
          metrics.attendanceFollowUps.map(
            (
              volunteer: any,
              index: number
            ) => (
              <View
                key={
                  volunteer.uid ||
                  index
                }
                style={styles.riskCard}
              >
                <View
                  style={styles.riskTopRow}
                >
                  <Text
                    style={styles.riskName}
                  >
                    {volunteer.name}
                  </Text>

                  <Text
                    style={[
                      styles.riskBadge,
                      volunteer.riskLevel ===
                      "HIGH"
                        ? styles.highRisk
                        : volunteer.riskLevel ===
                            "MEDIUM"
                          ? styles.mediumRisk
                          : styles.lowRisk,
                    ]}
                  >
                    {volunteer.riskLevel}
                  </Text>
                </View>

                <View
                  style={
                    styles.riskProgressTrack
                  }
                >
                  <View
                    style={[
                      styles.riskProgressFill,
                      {
                        width: `${volunteer.riskScore}%` as any,
                        backgroundColor:
                          volunteer.riskLevel ===
                          "HIGH"
                            ? "#DC2626"
                            : volunteer.riskLevel ===
                                "MEDIUM"
                              ? "#F59E0B"
                              : "#16A34A",
                      },
                    ]}
                  />
                </View>

                <Text
                  style={styles.riskScore}
                >
                  Risk Score:{" "}
                  {volunteer.riskScore}%
                </Text>

                <Text style={styles.riskMeta}>
                  Joined: {volunteer.joined} •
                  Completed:{" "}
                  {volunteer.completed} • Absent:{" "}
                  {volunteer.absent} •
                  Incomplete:{" "}
                  {volunteer.incomplete}
                </Text>

                <Text style={styles.riskMeta}>
                  Completion Rate:{" "}
                  {Math.round(
                    volunteer.completionRate *
                      100
                  )}
                  % • Last Activity:{" "}
                  {volunteer.daysInactive >=
                  999
                    ? "No activity"
                    : `${volunteer.daysInactive} day(s) ago`}
                </Text>

                <Text
                  style={styles.riskReason}
                >
                  {volunteer.reason}
                </Text>

                {volunteer.riskLevel !==
                  "LOW" && (
                  <TouchableOpacity
                    style={styles.reminderBtn}
                    onPress={() =>
                      sendRiskReminder(
                        volunteer
                      )
                    }
                  >
                    <Text
                      style={
                        styles.reminderBtnText
                      }
                    >
                      Send Reminder
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          )
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          🏆 Top Volunteers by Points
        </Text>

        {metrics.topPointUsers.length === 0 ? (
          <Text style={styles.empty}>
            No users yet.
          </Text>
        ) : (
          metrics.topPointUsers.map(
            (item, index) => (
              <LeaderboardRow
                key={item.id || index}
                rank={index + 1}
                name={
                  item.fullName ||
                  item.name ||
                  item.email ||
                  "User"
                }
                value={`${Number(
                  item.points || 0
                )} pts`}
              />
            )
          )
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          🎖 Achievement Leaders
        </Text>

        {metrics.topAchievementUsers.length ===
        0 ? (
          <Text style={styles.empty}>
            No achievements unlocked yet.
          </Text>
        ) : (
          metrics.topAchievementUsers.map(
            (item, index) => {
              const count =
                Array.isArray(
                  item.achievements
                )
                  ? item.achievements.length
                  : 0;

              return (
                <LeaderboardRow
                  key={item.id || index}
                  rank={index + 1}
                  name={
                    item.fullName ||
                    item.name ||
                    item.email ||
                    "User"
                  }
                  value={`${count} badges`}
                />
              );
            }
          )
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          📄 Recent Certificates
        </Text>

        {metrics.recentCertificates.length ===
        0 ? (
          <Text style={styles.empty}>
            No certificates issued yet.
          </Text>
        ) : (
          metrics.recentCertificates.map(
            (item, index) => (
              <View
                key={item.id || index}
                style={styles.certRow}
              >
                <Text
                  style={styles.certName}
                >
                  {item.name ||
                    "Volunteer"}
                </Text>

                <Text
                  style={styles.certTask}
                >
                  {item.task ||
                    "Volunteer Task"}
                </Text>

                <Text
                  style={styles.certId}
                >
                  ID:{" "}
                  {item.certificateId ||
                    item.id}
                </Text>
              </View>
            )
          )
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Case Status Breakdown
        </Text>

        <BreakdownRow
          label="REPORTED"
          value={
            metrics.byCaseStatus.reported ||
            0
          }
        />

        <BreakdownRow
          label="VALIDATED"
          value={
            metrics.byCaseStatus.validated ||
            0
          }
        />

        <BreakdownRow
          label="ASSIGNED"
          value={
            metrics.byCaseStatus.assigned ||
            0
          }
        />

        <BreakdownRow
          label="IN_PROGRESS"
          value={
            metrics.byCaseStatus.in_progress ||
            0
          }
        />

        <BreakdownRow
          label="RESOLVED"
          value={
            metrics.byCaseStatus.resolved ||
            0
          }
        />

        <BreakdownRow
          label="CLOSED"
          value={
            metrics.byCaseStatus.closed ||
            0
          }
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Case Severity Breakdown
        </Text>

        <BreakdownRow
          label="CRITICAL"
          value={
            metrics.bySeverity.critical || 0
          }
        />

        <BreakdownRow
          label="HIGH"
          value={
            metrics.bySeverity.high || 0
          }
        />

        <BreakdownRow
          label="MEDIUM"
          value={
            metrics.bySeverity.medium || 0
          }
        />

        <BreakdownRow
          label="LOW"
          value={
            metrics.bySeverity.low || 0
          }
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Donation Status Breakdown
        </Text>

        <BreakdownRow
          label="PENDING"
          value={
            metrics.byDonStatus.pending || 0
          }
        />

        <BreakdownRow
          label="RECEIVED"
          value={
            metrics.byDonStatus.received || 0
          }
        />

        <BreakdownRow
          label="DISTRIBUTED"
          value={
            metrics.byDonStatus.distributed ||
            0
          }
        />

        <BreakdownRow
          label="REJECTED"
          value={
            metrics.byDonStatus.rejected || 0
          }
        />
      </View>

      <Text style={styles.footerNote}>
        Note: Volunteer hours depend on the
        collection{" "}
        <Text style={{ fontWeight: "900" }}>
          volunteerStats
        </Text>
        . Certificates, achievements, and
        attendance follow-up scores are based
        on checkout, attendance, and
        joined-event participant records.
        Follow-up scores are deterministic
        administrative indicators, not AI
        predictions.
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
      <Text style={styles.kpiTitle}>
        {title}
      </Text>

      <Text style={styles.kpiValue}>
        {String(value)}
      </Text>

      {hint ? (
        <Text style={styles.kpiHint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function BreakdownRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>
        {label}
      </Text>

      <Text style={styles.rowValue}>
        {value}
      </Text>
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
    rank === 1
      ? "🥇"
      : rank === 2
        ? "🥈"
        : rank === 3
          ? "🥉"
          : `#${rank}`;

  return (
    <View style={styles.leaderboardRow}>
      <Text style={styles.leaderboardRank}>
        {medal}
      </Text>

      <Text style={styles.leaderboardName}>
        {name}
      </Text>

      <Text style={styles.leaderboardHours}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: "#F4F7FB",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 10,
  },

  muted: {
    color: "#64748B",
    textAlign: "center",
    fontWeight: "700",
  },

  denied: {
    fontSize: 18,
    fontWeight: "900",
    color: "#DC2626",
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
  },

  sub: {
    marginTop: 2,
    color: "#475569",
    fontWeight: "800",
  },

  headerBtns: {
    flexDirection: "row",
    gap: 10,
  },

  darkBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },

  darkBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },

  navRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },

  navBtn: {
    flex: 1,
    minWidth: "30%",
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },

  navText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 13,
  },

  sectionHeader: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 10,
    marginTop: 4,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  kpi: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  kpiTitle: {
    color: "#334155",
    fontWeight: "900",
    marginBottom: 6,
  },

  kpiValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
  },

  kpiHint: {
    marginTop: 6,
    color: "#64748B",
    fontWeight: "700",
    lineHeight: 16,
  },

  section: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  sectionTitle: {
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 10,
  },

  predictiveIntro: {
    color: "#64748B",
    fontWeight: "700",
    lineHeight: 18,
    marginBottom: 10,
  },

  riskCard: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  riskTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  riskName: {
    flex: 1,
    fontWeight: "900",
    color: "#0F172A",
  },

  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 11,
    overflow: "hidden",
  },

  highRisk: {
    backgroundColor: "#DC2626",
  },

  mediumRisk: {
    backgroundColor: "#F59E0B",
  },

  lowRisk: {
    backgroundColor: "#16A34A",
  },

  riskProgressTrack: {
    height: 10,
    backgroundColor: "#E5E7EB",
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
    color: "#64748B",
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
    color: "#FFFFFF",
    fontWeight: "900",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },

  rowLabel: {
    color: "#334155",
    fontWeight: "800",
  },

  rowValue: {
    color: "#0F172A",
    fontWeight: "900",
  },

  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 8,
  },

  leaderboardRank: {
    fontWeight: "900",
    color: "#F59E0B",
    width: 36,
  },

  leaderboardName: {
    flex: 1,
    color: "#0F172A",
    fontWeight: "700",
  },

  leaderboardHours: {
    fontWeight: "900",
    color: "#2563EB",
  },

  certRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  certName: {
    color: "#0F172A",
    fontWeight: "900",
  },

  certTask: {
    color: "#475569",
    fontWeight: "700",
    marginTop: 2,
  },

  certId: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },

  empty: {
    color: "#64748B",
    fontWeight: "700",
    fontStyle: "italic",
  },

  footerNote: {
    marginTop: 14,
    color: "#64748B",
    fontWeight: "700",
    lineHeight: 18,
  },
});