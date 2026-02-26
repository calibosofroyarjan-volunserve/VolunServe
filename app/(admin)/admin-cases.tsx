import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../lib/firebase";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 40;

type Severity = "low" | "medium" | "high" | "critical";
type CaseStatus =
  | "reported"
  | "validated"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

interface DisasterCase {
  id: string;

  reporterUid: string;
  reporterName: string;
  reporterEmail?: string;
  reporterBarangay?: string;
  contactNumber?: string;

  title: string;
  category: string;
  severity: Severity;
  status: CaseStatus;

  location: string;
  details: string;

  requiredVolunteers?: number;
  assignedVolunteersCount?: number;

  adminNote?: string;

  createdAt?: any;
  updatedAt?: any;

  validatedAt?: any;
  assignedAt?: any;
  resolvedAt?: any;
  closedAt?: any;

  // ✅ IMPORTANT: link to volunteer event created when case is assigned
  linkedEventId?: string;
}

const severityRank: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
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

export default function AdminCases() {
  const router = useRouter();

  const [role, setRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  const [cases, setCases] = useState<DisasterCase[]>([]);
  const [filterStatus, setFilterStatus] = useState<CaseStatus | "all">("all");
  const [filterSeverity, setFilterSeverity] = useState<Severity | "all">("all");

  // per-case edit state
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reqVols, setReqVols] = useState<Record<string, string>>({});

  // ✅ NEW: Volunteer roster per case
  const [participantsMap, setParticipantsMap] = useState<Record<string, any[]>>(
    {}
  );

  // 🔥 Volunteer matching system
  const [allVolunteers, setAllVolunteers] = useState<any[]>([]);
  const [skillFilter, setSkillFilter] = useState("");
  const [barangayFilter, setBarangayFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");

  // 🧱 STEP 1 — Approved volunteers state
  const [approvedVolunteers, setApprovedVolunteers] = useState<any[]>([]);

  // 🔐 CHECK ROLE
  useEffect(() => {
    const checkRole = async () => {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        router.replace("/login");
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) {
        router.replace("/login");
        return;
      }

      const userRole = (snap.data()?.role || "")
        .toString()
        .trim()
        .toLowerCase();
      setRole(userRole);
      setLoadingRole(false);
    };

    checkRole();
  }, [router]);

  const isSuperAdmin = role === "superadmin";
  const isAdmin = role === "admin";
  const isAuthorized = isSuperAdmin || isAdmin;

  // 📦 FETCH CASES
  useEffect(() => {
    if (!isAuthorized) return;

    const q = query(
      collection(db, "disasterCases"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: DisasterCase[] = snapshot.docs.map((d) => {
          const data: any = d.data();
          return {
            id: d.id,

            reporterUid: data.reporterUid,
            reporterName: data.reporterName || "Resident",
            reporterEmail: data.reporterEmail,
            reporterBarangay: data.reporterBarangay,
            contactNumber: data.contactNumber,

            title: data.title || "",
            category: data.category || "",
            severity: (data.severity || "medium") as Severity,
            status: (data.status || "reported") as CaseStatus,

            location: data.location || "",
            details: data.details || "",

            requiredVolunteers: Number(data.requiredVolunteers || 0),
            assignedVolunteersCount: Number(data.assignedVolunteersCount || 0),

            adminNote: data.adminNote || "",

            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            validatedAt: data.validatedAt,
            assignedAt: data.assignedAt,
            resolvedAt: data.resolvedAt,
            closedAt: data.closedAt,

            // ✅ IMPORTANT: read linkedEventId if exists
            linkedEventId: data.linkedEventId || "",
          };
        });

        setCases(list);
      },
      (error) => {
        console.log("Cases listener error:", error);
        Alert.alert(
          "Permission Error",
          "Missing or insufficient permissions for disasterCases."
        );
      }
    );

    return () => unsub();
  }, [isAuthorized]);

  // 🧱 STEP 1 — Fetch approved volunteers (below cases fetch)
  useEffect(() => {
    if (!isAuthorized) return;

    const unsub = onSnapshot(
      collection(db, "volunteerApplications"),
      (snapshot) => {
        const list: any[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.status === "approved") {
            list.push({
              uid: docSnap.id,
              fullName: data.fullName,
              skills: data.skills || [],
              barangay: data.barangay || "",
            });
          }
        });

        setApprovedVolunteers(list);
      }
    );

    return () => unsub();
  }, [isAuthorized]);

  const sortedFiltered = useMemo(() => {
    let list = [...cases];

    if (filterStatus !== "all")
      list = list.filter((c) => c.status === filterStatus);
    if (filterSeverity !== "all")
      list = list.filter((c) => c.severity === filterSeverity);

    // sort by severity rank first, then by createdAt desc
    list.sort((a, b) => {
      const s =
        (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
      if (s !== 0) return s;

      const ta = a.createdAt?.toMillis?.() ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis?.() ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });

    return list;
  }, [cases, filterStatus, filterSeverity]);

  // ✅ LISTEN: participants for each linked event
  useEffect(() => {
    if (!isAuthorized) return;

    const unsubs: (() => void)[] = [];

    sortedFiltered.forEach((c) => {
      if (!c.linkedEventId) return;

      const participantsRef = collection(
        db,
        "volunteerEvents",
        c.linkedEventId,
        "participants"
      );

      const unsub = onSnapshot(
        participantsRef,
        (snap) => {
          const list = snap.docs.map((d) => {
            const data: any = d.data();
            return {
              id: d.id,
              fullName: data.fullName || "Volunteer",
              checkedInAt: data.checkedInAt,
              checkedOutAt: data.checkedOutAt,
              joinedAt: data.joinedAt,
            };
          });

          setParticipantsMap((prev) => ({
            ...prev,
            [c.id]: list,
          }));
        },
        (err) => {
          console.log("participants listener error:", err);
        }
      );

      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [sortedFiltered, isAuthorized]);

  // 🔥 Fetch Approved Volunteers (matching system)
  useEffect(() => {
    if (!isAuthorized) return;

    const q = query(collection(db, "volunteerApplications"));

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => {
          const data: any = d.data();
          return {
            id: d.id,
            fullName: data.fullName,
            barangay: data.barangay,
            skills: data.skills || [],
            availability: data.availability,
            status: data.status,
          };
        })
        .filter((v) => v.status === "approved");

      setAllVolunteers(list);
    });

    return () => unsub();
  }, [isAuthorized]);

  // 🔥 Matching Algorithm
  const filteredVolunteers = useMemo(() => {
    return allVolunteers.filter((v) => {
      const skillMatch =
        !skillFilter ||
        v.skills.some((s: string) =>
          s.toLowerCase().includes(skillFilter.toLowerCase())
        );

      const barangayMatch =
        !barangayFilter ||
        v.barangay?.toLowerCase().includes(barangayFilter.toLowerCase());

      const availabilityMatch =
        !availabilityFilter ||
        v.availability
          ?.toLowerCase()
          .includes(availabilityFilter.toLowerCase());

      return skillMatch && barangayMatch && availabilityMatch;
    });
  }, [allVolunteers, skillFilter, barangayFilter, availabilityFilter]);

  const pillStyle = (active: boolean) => [styles.pill, active && styles.pillActive];

  const pillTextStyle = (active: boolean) => [
    styles.pillText,
    active && styles.pillTextActive,
  ];

  // ✅ helpers for roster
  const attendanceStatus = (p: any) => {
    if (!p.checkedInAt) return "NOT CHECKED-IN";
    if (p.checkedInAt && !p.checkedOutAt) return "CHECKED-IN";
    return "COMPLETED";
  };

  const attendanceColor = (p: any) => {
    if (!p.checkedInAt) return { backgroundColor: "#6b7280" };
    if (p.checkedInAt && !p.checkedOutAt) return { backgroundColor: "#2563eb" };
    return { backgroundColor: "#16a34a" };
  };

  const autoResolveCase = async (c: DisasterCase) => {
    try {
      await updateDoc(doc(db, "disasterCases", c.id), {
        status: "resolved",
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      Alert.alert("Resolved", "Case automatically resolved.");
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Failed to resolve case.");
    }
  };

  // 🔥 Invite Volunteer Function (matching system)
  const inviteVolunteer = async (caseId: string, volunteerId: string) => {
    try {
      await addDoc(collection(db, "caseInvitations"), {
        caseId,
        volunteerId,
        invitedAt: serverTimestamp(),
        status: "pending",
      });

      Alert.alert("Invited", "Volunteer invitation sent.");
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Failed to invite volunteer.");
    }
  };

  // 🧱 STEP 2 — Assign volunteer directly to case/event
  const assignVolunteerToCase = async (c: DisasterCase, volunteer: any) => {
    try {
      if (!c.linkedEventId) {
        Alert.alert("Error", "No linked event found for this case.");
        return;
      }

      const participantRef = doc(
        db,
        "volunteerEvents",
        c.linkedEventId,
        "participants",
        volunteer.uid
      );

      const existing = await getDoc(participantRef);
      if (existing.exists()) {
        Alert.alert("Already Assigned", "Volunteer already assigned.");
        return;
      }

      await updateDoc(participantRef, {
        uid: volunteer.uid,
        fullName: volunteer.fullName,
        barangay: volunteer.barangay,
        joinedAt: serverTimestamp(),
        checkedInAt: null,
        checkedOutAt: null,
      });

      await updateDoc(doc(db, "disasterCases", c.id), {
        assignedVolunteersCount:
          (c.assignedVolunteersCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "adminActivityLogs"), {
        action: "Volunteer Assigned",
        caseId: c.id,
        volunteerUid: volunteer.uid,
        volunteerName: volunteer.fullName,
        timestamp: serverTimestamp(),
      });

      Alert.alert("Success", "Volunteer assigned successfully.");
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Failed to assign volunteer.");
    }
  };

  // ✅ CORE: status change (with auto event creation on assigned)
  const setStatus = async (c: DisasterCase, next: CaseStatus) => {
    try {
      const patch: any = {
        status: next,
        updatedAt: serverTimestamp(),
      };

      if (next === "validated") patch.validatedAt = serverTimestamp();
      if (next === "resolved") patch.resolvedAt = serverTimestamp();
      if (next === "closed") patch.closedAt = serverTimestamp();

      // ✅ WHEN ASSIGNED → CREATE EVENT (ONLY IF NOT ALREADY LINKED)
      if (next === "assigned") {
        patch.assignedAt = serverTimestamp();

        if (!c.linkedEventId) {
          const eventRef = await addDoc(collection(db, "volunteerEvents"), {
            title: `Disaster Response: ${c.title}`,
            type: "disaster",
            location: c.location,
            date: new Date().toLocaleString(),
            capacity: Number(c.requiredVolunteers || 0),
            status: "upcoming",
            caseId: c.id,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          patch.linkedEventId = eventRef.id;
        }
      }

      await updateDoc(doc(db, "disasterCases", c.id), patch);
      Alert.alert("Updated", `Case status updated to ${next.toUpperCase()}`);
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Failed to update status.");
    }
  };

  const saveAdminNote = async (c: DisasterCase) => {
    try {
      const note = (notes[c.id] ?? c.adminNote ?? "").trim();
      await updateDoc(doc(db, "disasterCases", c.id), {
        adminNote: note,
        updatedAt: serverTimestamp(),
      });
      Alert.alert("Saved", "Admin note saved.");
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Failed to save admin note.");
    }
  };

  const saveRequiredVolunteers = async (c: DisasterCase) => {
    const v = (reqVols[c.id] ?? String(c.requiredVolunteers ?? 0)).trim();
    const n = Number(v);
    if (Number.isNaN(n) || n < 0) {
      Alert.alert("Invalid", "Required volunteers must be a valid number (0 or higher).");
      return;
    }

    try {
      await updateDoc(doc(db, "disasterCases", c.id), {
        requiredVolunteers: n,
        updatedAt: serverTimestamp(),
      });
      Alert.alert("Saved", "Required volunteers updated.");
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Failed to update required volunteers.");
    }
  };

  const badgeColor = (s: Severity) => {
    if (s === "critical") return { backgroundColor: "#dc2626" };
    if (s === "high") return { backgroundColor: "#f97316" };
    if (s === "medium") return { backgroundColor: "#2563eb" };
    return { backgroundColor: "#16a34a" };
  };

  const statusColor = (s: CaseStatus) => {
    if (s === "reported") return { backgroundColor: "#6b7280" };
    if (s === "validated") return { backgroundColor: "#2563eb" };
    if (s === "assigned") return { backgroundColor: "#7c3aed" };
    if (s === "in_progress") return { backgroundColor: "#0ea5e9" };
    if (s === "resolved") return { backgroundColor: "#16a34a" };
    return { backgroundColor: "#111827" };
  };

  if (loadingRole) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!isAuthorized) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>Access Denied</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Disaster Case Administration</Text>
      <Text style={styles.sub}>Role: {role}</Text>

      {/* FILTERS */}
      <View style={styles.filterCard}>
        <Text style={styles.filterTitle}>Filters</Text>

        <Text style={styles.filterLabel}>Status</Text>
        <View style={styles.pillRow}>
          {(
            ["all", "reported", "validated", "assigned", "in_progress", "resolved", "closed"] as const
          ).map((s) => {
            const active = filterStatus === s;
            return (
              <TouchableOpacity
                key={s}
                style={pillStyle(active)}
                onPress={() => setFilterStatus(s)}
              >
                <Text style={pillTextStyle(active)}>{String(s).toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.filterLabel}>Severity</Text>
        <View style={styles.pillRow}>
          {(["all", "low", "medium", "high", "critical"] as const).map((s) => {
            const active = filterSeverity === s;
            return (
              <TouchableOpacity
                key={s}
                style={pillStyle(active)}
                onPress={() => setFilterSeverity(s)}
              >
                <Text style={pillTextStyle(active)}>{String(s).toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* LIST */}
      {sortedFiltered.map((c) => {
        const req = reqVols[c.id] ?? String(c.requiredVolunteers ?? 0);
        const note = notes[c.id] ?? (c.adminNote || "");

        const roster = participantsMap[c.id] || [];
        const totalJoined = roster.length;
        const totalCompleted = roster.filter((p) => p.checkedInAt && p.checkedOutAt).length;
        const required = Number(c.requiredVolunteers || 0);

        return (
          <View key={c.id} style={styles.card}>
            <View style={styles.topRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.caseTitle}>{c.title}</Text>
                <Text style={styles.meta}>Category: {c.category}</Text>
                <Text style={styles.meta}>Location: {c.location}</Text>
                <Text style={styles.meta}>Reporter: {c.reporterName}</Text>
                {c.contactNumber ? (
                  <Text style={styles.meta}>Contact: {c.contactNumber}</Text>
                ) : null}
                <Text style={styles.meta}>Submitted: {formatDate(c.createdAt)}</Text>

                {c.linkedEventId ? (
                  <Text style={styles.meta}>Linked Event ID: {c.linkedEventId}</Text>
                ) : null}
              </View>

              <View style={[styles.badge, badgeColor(c.severity)]}>
                <Text style={styles.badgeText}>{c.severity.toUpperCase()}</Text>
              </View>
            </View>

            <View style={[styles.badge2, statusColor(c.status)]}>
              <Text style={styles.badgeText}>{c.status.toUpperCase()}</Text>
            </View>

            <Text style={styles.details}>{c.details}</Text>

            {/* REQUIRED VOLUNTEERS */}
            <Text style={styles.sectionTitle}>Required Volunteers</Text>
            <TextInput
              style={styles.input}
              value={req}
              onChangeText={(t) => setReqVols((p) => ({ ...p, [c.id]: t }))}
              keyboardType="numeric"
              placeholder="0"
            />
            <TouchableOpacity
              style={[styles.btn, styles.btnBlue]}
              onPress={() => saveRequiredVolunteers(c)}
            >
              <Text style={styles.btnText}>Save Required Volunteers</Text>
            </TouchableOpacity>

            {/* ADMIN NOTE */}
            <Text style={styles.sectionTitle}>Admin Note</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
              value={note}
              onChangeText={(t) => setNotes((p) => ({ ...p, [c.id]: t }))}
              multiline
              placeholder="Admin note for validation/assignment..."
            />
            <TouchableOpacity
              style={[styles.btn, styles.btnGray]}
              onPress={() => saveAdminNote(c)}
            >
              <Text style={styles.btnText}>Save Note</Text>
            </TouchableOpacity>

            {/* STATUS ACTIONS */}
            <Text style={styles.sectionTitle}>Change Status</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: "#2563eb" }]}
                onPress={() => setStatus(c, "validated")}
              >
                <Text style={styles.btnText}>Validate</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: "#7c3aed" }]}
                onPress={() => setStatus(c, "assigned")}
              >
                <Text style={styles.btnText}>Assign</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: "#0ea5e9" }]}
                onPress={() => setStatus(c, "in_progress")}
              >
                <Text style={styles.btnText}>In-Progress</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: "#16a34a" }]}
                onPress={() => setStatus(c, "resolved")}
              >
                <Text style={styles.btnText}>Resolve</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: "#111827" }]}
                onPress={() => setStatus(c, "closed")}
              >
                <Text style={styles.btnText}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* 🧱 STEP 3 — Assign Volunteers UI */}
            {c.status === "assigned" && (
              <>
                <Text style={styles.sectionTitle}>Assign Volunteers</Text>

                {approvedVolunteers.length === 0 ? (
                  <Text style={styles.meta}>No approved volunteers found.</Text>
                ) : (
                  approvedVolunteers.map((v) => (
                    <View key={v.uid} style={styles.volunteerCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.caseTitle}>{v.fullName}</Text>
                        <Text style={styles.meta}>
                          Barangay: {v.barangay}
                        </Text>
                        <Text style={styles.meta}>
                          Skills: {v.skills?.join(", ") || "None"}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[styles.smallBtn, { backgroundColor: "#16a34a" }]}
                        onPress={() => assignVolunteerToCase(c, v)}
                      >
                        <Text style={styles.btnText}>Assign</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </>
            )}

            {/* ✅ VOLUNTEER ROSTER */}
            {c.linkedEventId && (
              <View style={styles.rosterCard}>
                <Text style={styles.sectionTitle}>Volunteer Roster</Text>

                {totalJoined > 0 ? (
                  <>
                    {roster.map((p) => (
                      <View key={p.id} style={styles.rosterRow}>
                        <Text style={styles.rosterName}>{p.fullName}</Text>

                        <View style={[styles.attBadge, attendanceColor(p)]}>
                          <Text style={styles.attBadgeText}>
                            {attendanceStatus(p)}
                          </Text>
                        </View>
                      </View>
                    ))}

                    <Text style={styles.meta}>Total Joined: {totalJoined}</Text>
                    <Text style={styles.meta}>
                      Completed: {totalCompleted} / {required}
                    </Text>

                    {required > 0 &&
                      totalCompleted >= required &&
                      c.status !== "resolved" && (
                        <TouchableOpacity
                          style={[styles.btn, { backgroundColor: "#16a34a" }]}
                          onPress={() => autoResolveCase(c)}
                        >
                          <Text style={styles.btnText}>Auto Resolve Case</Text>
                        </TouchableOpacity>
                      )}
                  </>
                ) : (
                  <Text style={styles.meta}>No volunteers yet.</Text>
                )}
              </View>
            )}

            {/* 🔥 VOLUNTEER MATCHING PANEL */}
            {c.status === "assigned" && (
              <View style={styles.matchCard}>
                <Text style={styles.sectionTitle}>Volunteer Matching</Text>

                <TextInput
                  placeholder="Filter by Skill"
                  style={styles.input}
                  value={skillFilter}
                  onChangeText={setSkillFilter}
                />

                <TextInput
                  placeholder="Filter by Barangay"
                  style={styles.input}
                  value={barangayFilter}
                  onChangeText={setBarangayFilter}
                />

                <TextInput
                  placeholder="Filter by Availability"
                  style={styles.input}
                  value={availabilityFilter}
                  onChangeText={setAvailabilityFilter}
                />

                {filteredVolunteers.slice(0, 10).map((v) => (
                  <View key={v.id} style={styles.matchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matchName}>{v.fullName}</Text>
                      <Text style={styles.meta}>
                        {v.barangay} • {v.skills.join(", ")} • {v.availability}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: "#2563eb" }]}
                      onPress={() => inviteVolunteer(c.id, v.id)}
                    >
                      <Text style={styles.btnText}>Invite</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#f4f7fb", alignItems: "center" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  denied: { fontSize: 18, fontWeight: "900", color: "red" },

  title: { fontSize: 22, fontWeight: "900", alignSelf: "flex-start" },
  sub: {
    marginTop: 4,
    marginBottom: 12,
    color: "#475569",
    fontWeight: "700",
    alignSelf: "flex-start",
  },

  filterCard: {
    width: CARD_WIDTH,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
  },
  filterTitle: { fontWeight: "900", color: "#0f172a", marginBottom: 8 },
  filterLabel: {
    fontWeight: "800",
    color: "#64748b",
    marginTop: 6,
    marginBottom: 6,
    fontSize: 12,
  },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
  },
  pillActive: { borderColor: "#2563eb", backgroundColor: "#2563eb" },
  pillText: { fontWeight: "900", color: "#0f172a", fontSize: 11 },
  pillTextActive: { color: "#fff" },

  card: {
    width: CARD_WIDTH,
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
  },

  topRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  caseTitle: { fontWeight: "900", fontSize: 16, color: "#0f172a" },
  meta: { color: "#64748b", fontWeight: "700", marginTop: 2 },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badge2: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgeText: { color: "#fff", fontWeight: "900", fontSize: 11 },

  details: { marginTop: 10, color: "#0f172a", fontWeight: "600", lineHeight: 18 },

  sectionTitle: { marginTop: 12, fontWeight: "900", color: "#0f172a" },

  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
    fontWeight: "700",
    color: "#0f172a",
  },

  btn: { marginTop: 8, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  btnBlue: { backgroundColor: "#2563eb" },
  btnGray: { backgroundColor: "#111827" },
  btnText: { color: "#fff", fontWeight: "900" },

  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },

  // ✅ roster styles
  rosterCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rosterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  rosterName: { fontWeight: "800", color: "#0f172a" },
  attBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  attBadgeText: { color: "#fff", fontWeight: "900", fontSize: 11 },

  // 🔥 Matching styles
  matchCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },

  matchName: {
    fontWeight: "900",
    color: "#0f172a",
  },

  // 🧱 STEP 4 — Volunteer assign card style
  volunteerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
});