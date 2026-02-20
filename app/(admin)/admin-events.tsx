import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../lib/firebase";
import { getUserProfile } from "../../lib/firebaseAuth";

type EventType = "disaster" | "training";
type EventStatus = "upcoming" | "active" | "completed";

interface VolunteerEvent {
  id: string;
  title: string;
  type: EventType;
  location: string;
  date: string; // keep string for now (your volunteer screen expects string)
  capacity: number;
  status: EventStatus;
  createdAt?: any;
  updatedAt?: any;
}

type Role = "user" | "volunteer" | "admin" | "superadmin" | string;

const emptyForm = {
  title: "",
  type: "disaster" as EventType,
  location: "",
  date: "",
  capacity: "20",
  status: "upcoming" as EventStatus,
};

export default function AdminEvents() {
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [events, setEvents] = useState<VolunteerEvent[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"" | EventType>("");
  const [filterStatus, setFilterStatus] = useState<"" | EventStatus>("");

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // 1) Guard: only admin/superadmin can open
  useEffect(() => {
    const check = async () => {
      try {
        if (!user) {
          setAllowed(false);
          setCheckingRole(false);
          return;
        }
        const profile: any = await getUserProfile(user.uid);
        const role: Role = profile?.role || "user";
        const ok = role === "admin" || role === "superadmin";
        setAllowed(ok);
      } catch {
        setAllowed(false);
      } finally {
        setCheckingRole(false);
      }
    };
    check();
  }, []);

  // 2) Realtime events list
  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, "volunteerEvents"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: VolunteerEvent[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<VolunteerEvent, "id">),
        }));
        setEvents(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        console.log("Events snapshot error:", err);
        Alert.alert(
          "Permission Error",
          "Missing or insufficient permissions. Check Firestore rules for volunteerEvents."
        );
      }
    );

    return unsub;
  }, [allowed]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();

    return events.filter((e) => {
      const matchesSearch =
        !s ||
        e.title?.toLowerCase().includes(s) ||
        e.location?.toLowerCase().includes(s);

      const matchesType = !filterType || e.type === filterType;
      const matchesStatus = !filterStatus || e.status === filterStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [events, search, filterType, filterStatus]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (ev: VolunteerEvent) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title || "",
      type: (ev.type || "disaster") as EventType,
      location: ev.location || "",
      date: ev.date || "",
      capacity: String(ev.capacity ?? 20),
      status: (ev.status || "upcoming") as EventStatus,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const validateForm = () => {
    if (!form.title.trim()) return "Title is required.";
    if (!form.location.trim()) return "Location is required.";
    if (!form.date.trim()) return "Date is required (string for now).";

    const cap = Number(form.capacity);
    if (!Number.isFinite(cap) || cap <= 0) return "Capacity must be a valid number > 0.";

    return null;
  };

  const saveEvent = async () => {
    const err = validateForm();
    if (err) {
      Alert.alert("Invalid", err);
      return;
    }
    if (!user) return;

    try {
      setSaving(true);

      const payload = {
        title: form.title.trim(),
        type: form.type,
        location: form.location.trim(),
        date: form.date.trim(),
        capacity: Number(form.capacity),
        status: form.status,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "volunteerEvents", editingId), payload);
      } else {
        await addDoc(collection(db, "volunteerEvents"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      setModalOpen(false);
    } catch (e: any) {
      console.log("Save event error:", e);
      Alert.alert("Error", e?.message || "Failed to save event.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: string) => {
    Alert.alert(
      "Delete Event",
      "Are you sure you want to delete this event? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteEvent(id),
        },
      ]
    );
  };

  const deleteEvent = async (id: string) => {
    try {
      await deleteDoc(doc(db, "volunteerEvents", id));
    } catch (e: any) {
      console.log("Delete event error:", e);
      Alert.alert("Error", e?.message || "Failed to delete event.");
    }
  };

  const quickStatusUpdate = async (id: string, status: EventStatus) => {
    try {
      await updateDoc(doc(db, "volunteerEvents", id), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      console.log("Status update error:", e);
      Alert.alert("Error", e?.message || "Failed to update status.");
    }
  };

  if (checkingRole) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Checking admin access…</Text>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Admin Events</Text>
        <Text style={styles.danger}>
          Access denied. Your account is not admin/superadmin.
        </Text>
        <Text style={styles.muted}>
          Fix: set your user profile field role = "admin" or "superadmin" in users/{`{uid}`}.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin • Volunteer Events</Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={openCreate}>
          <Text style={styles.primaryBtnText}>+ Create Event</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        <TextInput
          placeholder="Search title or location…"
          value={search}
          onChangeText={setSearch}
          style={styles.search}
        />

        <View style={styles.filterRow}>
          <FilterChip
            label="All Types"
            active={filterType === ""}
            onPress={() => setFilterType("")}
          />
          <FilterChip
            label="Disaster"
            active={filterType === "disaster"}
            onPress={() => setFilterType("disaster")}
          />
          <FilterChip
            label="Training"
            active={filterType === "training"}
            onPress={() => setFilterType("training")}
          />
        </View>

        <View style={styles.filterRow}>
          <FilterChip
            label="All Status"
            active={filterStatus === ""}
            onPress={() => setFilterStatus("")}
          />
          <FilterChip
            label="Upcoming"
            active={filterStatus === "upcoming"}
            onPress={() => setFilterStatus("upcoming")}
          />
          <FilterChip
            label="Active"
            active={filterStatus === "active"}
            onPress={() => setFilterStatus("active")}
          />
          <FilterChip
            label="Completed"
            active={filterStatus === "completed"}
            onPress={() => setFilterStatus("completed")}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.muted}>Loading events…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No events found</Text>
              <Text style={styles.muted}>Create your first event to show on volunteer screen.</Text>
            </View>
          ) : (
            filtered.map((ev) => (
              <View key={ev.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{ev.title}</Text>
                    <Text style={styles.meta}>Type: {ev.type}</Text>
                    <Text style={styles.meta}>Status: {ev.status}</Text>
                    <Text style={styles.meta}>Location: {ev.location}</Text>
                    <Text style={styles.meta}>Date: {ev.date}</Text>
                    <Text style={styles.meta}>Capacity: {ev.capacity}</Text>
                  </View>

                  <View style={styles.actionsCol}>
                    <TouchableOpacity style={styles.smallBtn} onPress={() => openEdit(ev)}>
                      <Text style={styles.smallBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.deleteBtn]}
                      onPress={() => confirmDelete(ev.id)}
                    >
                      <Text style={[styles.smallBtnText, { color: "#fff" }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Quick Status:</Text>

                  <TouchableOpacity
                    style={[
                      styles.statusBtn,
                      ev.status === "upcoming" && styles.statusBtnActive,
                    ]}
                    onPress={() => quickStatusUpdate(ev.id, "upcoming")}
                  >
                    <Text
                      style={[
                        styles.statusBtnText,
                        ev.status === "upcoming" && styles.statusBtnTextActive,
                      ]}
                    >
                      Upcoming
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.statusBtn,
                      ev.status === "active" && styles.statusBtnActive,
                    ]}
                    onPress={() => quickStatusUpdate(ev.id, "active")}
                  >
                    <Text
                      style={[
                        styles.statusBtnText,
                        ev.status === "active" && styles.statusBtnTextActive,
                      ]}
                    >
                      Active
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.statusBtn,
                      ev.status === "completed" && styles.statusBtnActive,
                    ]}
                    onPress={() => quickStatusUpdate(ev.id, "completed")}
                  >
                    <Text
                      style={[
                        styles.statusBtnText,
                        ev.status === "completed" && styles.statusBtnTextActive,
                      ]}
                    >
                      Completed
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Create/Edit Modal */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingId ? "Edit Event" : "Create Event"}
            </Text>

            <TextInput
              placeholder="Title"
              value={form.title}
              onChangeText={(v) => setForm((p) => ({ ...p, title: v }))}
              style={styles.input}
            />

            <TextInput
              placeholder="Location"
              value={form.location}
              onChangeText={(v) => setForm((p) => ({ ...p, location: v }))}
              style={styles.input}
            />

            <TextInput
              placeholder='Date (string) e.g. "Feb 25, 2026 9:00 AM"'
              value={form.date}
              onChangeText={(v) => setForm((p) => ({ ...p, date: v }))}
              style={styles.input}
            />

            <TextInput
              placeholder="Capacity (number)"
              keyboardType="numeric"
              value={form.capacity}
              onChangeText={(v) => setForm((p) => ({ ...p, capacity: v }))}
              style={styles.input}
            />

            <Text style={styles.sectionLabel}>Type</Text>
            <View style={styles.pills}>
              <Pill
                label="Disaster"
                active={form.type === "disaster"}
                onPress={() => setForm((p) => ({ ...p, type: "disaster" }))}
              />
              <Pill
                label="Training"
                active={form.type === "training"}
                onPress={() => setForm((p) => ({ ...p, type: "training" }))}
              />
            </View>

            <Text style={styles.sectionLabel}>Status</Text>
            <View style={styles.pills}>
              <Pill
                label="Upcoming"
                active={form.status === "upcoming"}
                onPress={() => setForm((p) => ({ ...p, status: "upcoming" }))}
              />
              <Pill
                label="Active"
                active={form.status === "active"}
                onPress={() => setForm((p) => ({ ...p, status: "active" }))}
              />
              <Pill
                label="Completed"
                active={form.status === "completed"}
                onPress={() => setForm((p) => ({ ...p, status: "completed" }))}
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={closeModal} disabled={saving}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.primaryBtn} onPress={saveEvent} disabled={saving}>
                <Text style={styles.primaryBtnText}>
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f7fb" },

  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a", flex: 1 },

  filters: {
    padding: 16,
    gap: 10,
  },
  search: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
  },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  chipText: { color: "#334155", fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#fff" },

  list: { padding: 16, paddingBottom: 40, gap: 12 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardTop: { flexDirection: "row", gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 6 },
  meta: { color: "#64748b", marginBottom: 2 },

  actionsCol: { gap: 8, justifyContent: "flex-start" },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  smallBtnText: { fontWeight: "800", color: "#0f172a" },
  deleteBtn: { backgroundColor: "#dc2626", borderColor: "#dc2626" },

  statusRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  statusLabel: { fontWeight: "900", color: "#0f172a", marginRight: 4 },
  statusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  statusBtnActive: { backgroundColor: "#2563eb" },
  statusBtnText: { fontWeight: "800", color: "#334155", fontSize: 12 },
  statusBtnTextActive: { color: "#fff" },

  primaryBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },

  secondaryBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#0f172a", fontWeight: "900" },

  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 10 },
  title: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  muted: { color: "#64748b", textAlign: "center" },
  danger: { color: "#dc2626", fontWeight: "900", textAlign: "center" },

  empty: { backgroundColor: "#fff", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#e5e7eb" },
  emptyTitle: { fontWeight: "900", fontSize: 16, marginBottom: 6, color: "#0f172a" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  sectionLabel: { fontWeight: "900", color: "#0f172a", marginTop: 6, marginBottom: 8 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  pillActive: { backgroundColor: "#2563eb" },
  pillText: { fontWeight: "900", color: "#334155", fontSize: 12 },
  pillTextActive: { color: "#fff" },

  modalBtns: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 10 },
});