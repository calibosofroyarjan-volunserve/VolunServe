import { useRouter } from "expo-router";
import {
    collection,
    doc,
    getDoc,
    getDocs,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { auth, db } from "../../lib/firebase";

export default function AdminDashboard() {
  const router = useRouter();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalDonations: 0,
    distributed: 0,
    pendingDonations: 0,
    totalApplications: 0,
    approvedVolunteers: 0,
    totalEvents: 0,
    activeEvents: 0,
    completedAttendance: 0,
  });

  useEffect(() => {
    const init = async () => {
      if (!user) {
        router.replace("/login");
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));
      const role = snap.data()?.role;

      if (role !== "admin" && role !== "superadmin") {
        router.replace("/");
        return;
      }

      await loadStats();
    };

    init();
  }, []);

  const loadStats = async () => {
    // 🔹 Donations
    const donationsSnap = await getDocs(collection(db, "donations"));
    let totalDonations = 0;
    let distributed = 0;
    let pendingDonations = 0;

    donationsSnap.docs.forEach((d) => {
      const data = d.data();
      totalDonations += Number(data.amount || 0);

      if (data.status === "distributed") {
        distributed += Number(data.amount || 0);
      }

      if (data.status === "pending") {
        pendingDonations++;
      }
    });

    // 🔹 Volunteer Applications
    const appsSnap = await getDocs(collection(db, "volunteerApplications"));
    let approvedVolunteers = 0;

    appsSnap.docs.forEach((d) => {
      if (d.data().status === "approved") approvedVolunteers++;
    });

    // 🔹 Events + Attendance
    const eventsSnap = await getDocs(collection(db, "volunteerEvents"));
    let totalEvents = eventsSnap.size;
    let activeEvents = 0;
    let completedAttendance = 0;

    for (const ev of eventsSnap.docs) {
      const eventData = ev.data();

      if (eventData.status === "active") activeEvents++;

      const participantsSnap = await getDocs(
        collection(db, "volunteerEvents", ev.id, "participants")
      );

      participantsSnap.docs.forEach((p) => {
        if (p.data().checkedOutAt) completedAttendance++;
      });
    }

    setStats({
      totalDonations,
      distributed,
      pendingDonations,
      totalApplications: appsSnap.size,
      approvedVolunteers,
      totalEvents,
      activeEvents,
      completedAttendance,
    });

    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Admin Control Center</Text>

      <StatCard label="Total Donations (PHP)" value={stats.totalDonations} />
      <StatCard label="Distributed (PHP)" value={stats.distributed} />
      <StatCard label="Pending Donations" value={stats.pendingDonations} />

      <StatCard label="Volunteer Applications" value={stats.totalApplications} />
      <StatCard label="Approved Volunteers" value={stats.approvedVolunteers} />

      <StatCard label="Total Events" value={stats.totalEvents} />
      <StatCard label="Active Events" value={stats.activeEvents} />

      <StatCard label="Completed Attendance" value={stats.completedAttendance} />

      <View style={styles.navSection}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => router.push("/admin-events")}
        >
          <Text style={styles.navText}>Manage Events</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => router.push("/admin-volunteers")}
        >
          <Text style={styles.navText}>Manage Volunteers</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => router.push("/admin-attendance")}
        >
          <Text style={styles.navText}>Attendance Monitor</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value }: any) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#f4f7fb",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  label: {
    fontSize: 14,
    color: "#64748b",
  },

  value: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 6,
  },

  navSection: {
    marginTop: 20,
  },

  navButton: {
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: "center",
  },

  navText: {
    color: "#fff",
    fontWeight: "700",
  },
});
