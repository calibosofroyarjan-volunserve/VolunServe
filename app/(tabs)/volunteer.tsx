import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../lib/firebase";
import { getUserProfile } from "../../lib/firebaseAuth";
import { updateVolunteerStatsAfterCheckout } from "../../lib/volunteerStats";

type ApplicationStatus = "pending" | "approved" | "rejected" | null;

interface VolunteerEvent {
  id: string;
  title: string;
  type: "disaster" | "training";
  location: string;
  date: string;
  capacity: number;
  status: "upcoming" | "active" | "completed";

  // ✅ NEW (optional but used for auto-sync)
  participantsCount?: number; // stored in volunteerEvents doc
  caseId?: string; // link to disasterCases doc
}

type ParticipantInfo = {
  joinedAt?: any;
  checkedInAt?: any;
  checkedOutAt?: any;
};

const formatDate = (v: any) => {
  try {
    const d = v?.toDate?.() ? v.toDate() : v instanceof Date ? v : null;
    if (!d) return "-";
    return d.toLocaleString();
  } catch {
    return "-";
  }
};

export default function Volunteer() {
  const [profile, setProfile] = useState<any>(null);
  const [status, setStatus] = useState<ApplicationStatus>(null);

  // Application fields
  const [phone, setPhone] = useState("");
  const [skills, setSkills] = useState("");
  const [availability, setAvailability] = useState("");

  // Events
  const [events, setEvents] = useState<VolunteerEvent[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [participantByEvent, setParticipantByEvent] = useState<
    Record<string, ParticipantInfo>
  >({});

  const user = auth.currentUser;

  // Load profile + application status
  useEffect(() => {
    const load = async () => {
      if (!user) return;

      const profileData = await getUserProfile(user.uid);
      setProfile(profileData);

      const appSnap = await getDoc(doc(db, "volunteerApplications", user.uid));
      if (appSnap.exists()) setStatus(appSnap.data().status);
    };

    load();
  }, []);

  // Load events if approved
  useEffect(() => {
    if (status !== "approved") return;

    const q = query(collection(db, "volunteerEvents"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: VolunteerEvent[] = snapshot.docs.map((d) => {
        const data: any = d.data();
        return {
          id: d.id,
          title: data.title,
          type: data.type,
          location: data.location,
          date: data.date,
          capacity: Number(data.capacity || 0),
          status: data.status,

          // ✅ new fields (safe if missing)
          participantsCount: Number(data.participantsCount || 0),
          caseId: data.caseId || "",
        };
      });

      setEvents(list);
    });

    return unsub;
  }, [status]);

  // Load my joined/attendance info + counts (now reads participantsCount from event doc)
  useEffect(() => {
    const loadMine = async () => {
      if (!user || status !== "approved") return;

      const joined: string[] = [];
      const mapCounts: Record<string, number> = {};
      const mapParticipant: Record<string, ParticipantInfo> = {};

      for (const ev of events) {
        // ✅ use event doc participantsCount (fast)
        mapCounts[ev.id] = Number(ev.participantsCount || 0);

        const meRef = doc(db, "volunteerEvents", ev.id, "participants", user.uid);
        const meSnap = await getDoc(meRef);

        if (meSnap.exists()) {
          joined.push(ev.id);
          const data: any = meSnap.data();
          mapParticipant[ev.id] = {
            joinedAt: data.joinedAt,
            checkedInAt: data.checkedInAt,
            checkedOutAt: data.checkedOutAt,
          };
        }
      }

      setCounts(mapCounts);
      setJoinedEvents(joined);
      setParticipantByEvent(mapParticipant);
    };

    if (events.length) loadMine();
  }, [events, status]);

  // Apply as volunteer
  const handleApply = async () => {
    if (!phone || !skills || !availability) {
      Alert.alert("Incomplete", "Please fill all required fields.");
      return;
    }
    if (!user) return;

    await setDoc(doc(db, "volunteerApplications", user.uid), {
      uid: user.uid,
      fullName: profile?.fullName || "Volunteer",
      email: profile?.email || "",
      barangay: profile?.barangay || profile?.address || "",
      phone,
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      availability,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    setStatus("pending");
    Alert.alert("Submitted", "Your application is under review.");
  };

  /**
   * ✅ JOIN EVENT (ATOMIC + AUTO SYNC)
   * - Checks capacity using volunteerEvents.participantsCount
   * - Prevents duplicate join
   * - Increments participantsCount
   * - If event has caseId -> increment disasterCases.assignedVolunteersCount
   */
  const handleJoin = async (eventId: string) => {
    if (!user) return;

    try {
      await runTransaction(db, async (tx) => {
        const eventRef = doc(db, "volunteerEvents", eventId);
        const eventSnap = await tx.get(eventRef);

        if (!eventSnap.exists()) throw new Error("Event not found.");

        const ev: any = eventSnap.data();
        const capacity = Number(ev.capacity || 0);
        const currentCount = Number(ev.participantsCount || 0);
        const caseId = (ev.caseId || "").toString();

        if (currentCount >= capacity) throw new Error("FULL");

        const meRef = doc(db, "volunteerEvents", eventId, "participants", user.uid);
        const meSnap = await tx.get(meRef);

        if (meSnap.exists()) throw new Error("ALREADY_JOINED");

        // create participant doc
        tx.set(meRef, {
          uid: user.uid,
          fullName: profile?.fullName || "Volunteer",
          barangay: profile?.barangay || profile?.address || "",
          joinedAt: serverTimestamp(),
          checkedInAt: null,
          checkedOutAt: null,
        });

        // increment event participants count
        tx.update(eventRef, {
          participantsCount: increment(1),
          updatedAt: serverTimestamp(),
        });

        // if linked to case, increment assignedVolunteersCount
        if (caseId) {
          const caseRef = doc(db, "disasterCases", caseId);
          tx.update(caseRef, {
            assignedVolunteersCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        }
      });

      // UI update (fast)
      setJoinedEvents((prev) => [...prev, eventId]);
      setCounts((prev) => ({ ...prev, [eventId]: (prev[eventId] ?? 0) + 1 }));
      setParticipantByEvent((prev) => ({
        ...prev,
        [eventId]: { joinedAt: new Date(), checkedInAt: null, checkedOutAt: null },
      }));

      Alert.alert("Success", "You joined the event.");
    } catch (e: any) {
      const msg = String(e?.message || "");

      if (msg.includes("FULL")) {
        Alert.alert("Full", "This event is already full.");
        return;
      }
      if (msg.includes("ALREADY_JOINED")) {
        Alert.alert("Already Joined", "You already joined this event.");
        return;
      }

      console.log("Join error:", e);
      Alert.alert("Error", "Failed to join. Check console / rules.");
    }
  };

  // ✅ Attendance: Check-in
  const handleCheckIn = async (eventId: string) => {
    if (!user) return;

    if (!joinedEvents.includes(eventId)) {
      Alert.alert("Not Joined", "You must join the event before checking in.");
      return;
    }

    const info = participantByEvent[eventId];
    if (info?.checkedInAt && !info?.checkedOutAt) {
      Alert.alert("Already Checked In", "You are already checked in.");
      return;
    }

    const meRef = doc(db, "volunteerEvents", eventId, "participants", user.uid);

    await updateDoc(meRef, {
      checkedInAt: serverTimestamp(),
      checkedOutAt: null,
    });

    setParticipantByEvent((prev) => ({
      ...prev,
      [eventId]: {
        ...(prev[eventId] || {}),
        checkedInAt: new Date(),
        checkedOutAt: null,
      },
    }));

    Alert.alert("Checked In", "Attendance recorded successfully.");
  };

  // ✅ Attendance: Check-out (+stats)
  const handleCheckOut = async (eventId: string) => {
    if (!user) return;

    const info = participantByEvent[eventId];

    if (!info?.checkedInAt) {
      Alert.alert("No Check-in", "You must check in first.");
      return;
    }

    if (info?.checkedOutAt) {
      Alert.alert("Already Checked Out", "You already checked out.");
      return;
    }

    const meRef = doc(db, "volunteerEvents", eventId, "participants", user.uid);

    await updateDoc(meRef, {
      checkedOutAt: serverTimestamp(),
    });

    const checkedOutLocal = new Date();

    setParticipantByEvent((prev) => ({
      ...prev,
      [eventId]: {
        ...(prev[eventId] || {}),
        checkedOutAt: checkedOutLocal,
      },
    }));

    try {
      await updateVolunteerStatsAfterCheckout({
        uid: user.uid,
        eventId,
        checkedInAt: info.checkedInAt,
        checkedOutAt: checkedOutLocal,
      });
    } catch (err) {
      console.log("Volunteer stats update failed:", err);
    }

    Alert.alert("Checked Out", "Checkout recorded successfully.");
  };

  const renderAttendanceBadge = (info?: ParticipantInfo) => {
    if (!info?.checkedInAt) {
      return (
        <View style={[styles.badge, { backgroundColor: "#6b7280" }]}>
          <Text style={styles.badgeText}>NOT CHECKED-IN</Text>
        </View>
      );
    }
    if (info?.checkedInAt && !info?.checkedOutAt) {
      return (
        <View style={[styles.badge, { backgroundColor: "#2563eb" }]}>
          <Text style={styles.badgeText}>CHECKED-IN</Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, { backgroundColor: "#16a34a" }]}>
        <Text style={styles.badgeText}>COMPLETED</Text>
      </View>
    );
  };

  // ---------------- RENDER ----------------

  if (status === "pending") {
    return (
      <View style={styles.center}>
        <Text style={styles.pending}>Application Pending Review</Text>
        <Text style={styles.smallNote}>
          Please wait for admin approval before joining events.
        </Text>
      </View>
    );
  }

  if (status === "rejected") {
    return (
      <View style={styles.center}>
        <Text style={styles.rejected}>Application Rejected</Text>
        <Text style={styles.smallNote}>
          You may re-apply later (admin can also reset your status).
        </Text>
      </View>
    );
  }

  if (status === "approved") {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Volunteer Events</Text>

        {events
          .filter((e) => e.status !== "completed")
          .map((ev) => {
            const joinedCount = counts[ev.id] ?? 0;
            const slotsLeft = Math.max(ev.capacity - joinedCount, 0);
            const alreadyJoined = joinedEvents.includes(ev.id);
            const isFull = slotsLeft <= 0;

            const myInfo = participantByEvent[ev.id];

            return (
              <View key={ev.id} style={styles.card}>
                <View style={styles.topRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{ev.title}</Text>
                    <Text style={styles.meta}>Type: {ev.type.toUpperCase()}</Text>
                    <Text style={styles.meta}>Location: {ev.location}</Text>
                    <Text style={styles.meta}>Date: {ev.date}</Text>
                    <Text style={styles.meta}>
                      Volunteers: {joinedCount}/{ev.capacity} • Slots left: {slotsLeft}
                    </Text>
                  </View>

                  {alreadyJoined ? renderAttendanceBadge(myInfo) : null}
                </View>

                {/* JOIN */}
                <TouchableOpacity
                  style={[
                    styles.button,
                    (alreadyJoined || isFull) && styles.disabled,
                  ]}
                  disabled={alreadyJoined || isFull}
                  onPress={() => handleJoin(ev.id)}
                >
                  <Text style={styles.buttonText}>
                    {alreadyJoined ? "Joined" : isFull ? "Full" : "Join Event"}
                  </Text>
                </TouchableOpacity>

                {/* ATTENDANCE BUTTONS (only if joined) */}
                {alreadyJoined && (
                  <View style={styles.attRow}>
                    <TouchableOpacity
                      style={[styles.attBtn, { backgroundColor: "#2563eb" }]}
                      onPress={() => handleCheckIn(ev.id)}
                    >
                      <Text style={styles.attText}>Check-in</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.attBtn, { backgroundColor: "#16a34a" }]}
                      onPress={() => handleCheckOut(ev.id)}
                    >
                      <Text style={styles.attText}>Check-out</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Attendance details */}
                {alreadyJoined && (
                  <View style={styles.attInfo}>
                    <Text style={styles.meta}>
                      Checked-in: {formatDate(myInfo?.checkedInAt)}
                    </Text>
                    <Text style={styles.meta}>
                      Checked-out: {formatDate(myInfo?.checkedOutAt)}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
      </ScrollView>
    );
  }

  // Default: show application form
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Volunteer Application</Text>

      <Text style={styles.formHint}>
        Please submit accurate information. Your application will be manually reviewed.
      </Text>

      <TextInput
        placeholder="Phone Number"
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
      />

      <TextInput
        placeholder="Skills (comma separated) e.g. First aid, Driving"
        style={styles.input}
        value={skills}
        onChangeText={setSkills}
      />

      <TextInput
        placeholder="Availability e.g. Weekends, Night shifts"
        style={styles.input}
        value={availability}
        onChangeText={setAvailability}
      />

      <TouchableOpacity style={styles.button} onPress={handleApply}>
        <Text style={styles.buttonText}>Submit Application</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: "#f4f7fb" },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12 },

  formHint: { color: "#64748b", marginBottom: 16, lineHeight: 18 },

  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    backgroundColor: "#fff",
  },

  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  topRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  name: { fontSize: 16, fontWeight: "800", marginBottom: 6, color: "#0f172a" },
  meta: { color: "#64748b", marginBottom: 4 },

  button: {
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    alignItems: "center",
  },

  disabled: { backgroundColor: "#9ca3af" },

  buttonText: { color: "#fff", fontWeight: "700" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 11 },

  attRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  attBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: "center" },
  attText: { color: "#fff", fontWeight: "800" },

  attInfo: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },

  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  pending: { fontSize: 18, fontWeight: "800", color: "#f59e0b" },
  rejected: { fontSize: 18, fontWeight: "800", color: "#dc2626" },
  smallNote: { marginTop: 10, color: "#64748b", textAlign: "center" },
});