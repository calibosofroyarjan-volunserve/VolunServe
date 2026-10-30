import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { hasVolunteerAccess } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type Invitation = {
  id: string;
  caseId: string;
  caseTitle: string;
  volunteerId: string;
  status: "invited" | "accepted" | "declined";
  createdAt?: any;
  updatedAt?: any;
};

/**
 * An invitation is a request for availability, NOT an emergency dispatch.
 * Only a separately validated case may create a responseAssignment. This
 * allows the LGU to demonstrate real Accept/Decline even on pending cases.
 */
export default function VolunteerInvitationInbox() {
  const { user, profile } = useUserSession();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const permitted = !!user && !!profile && hasVolunteerAccess(profile);

  useEffect(() => {
    if (!permitted || !user) {
      setInvitations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, "volunteerInvitations"), where("volunteerId", "==", user.uid));
    return onSnapshot(q, (snapshot) => {
      setInvitations(snapshot.docs.map((item) => ({
        ...(item.data() as Omit<Invitation, "id">),
        id: item.id,
      })));
      setError("");
      setLoading(false);
    }, (problem) => {
      setError(problem.code === "permission-denied"
        ? "Invitation permissions are not ready. Ask the administrator to check Firestore rules."
        : "Cannot load invitation updates. Check your internet connection.");
      setLoading(false);
    });
  }, [user?.uid, permitted]);

  const shown = useMemo(() => invitations
    .sort((a, b) => Number(b.createdAt?.toMillis?.() || 0) - Number(a.createdAt?.toMillis?.() || 0))
    .slice(0, 5), [invitations]);

  const respond = async (invitation: Invitation, status: "accepted" | "declined") => {
    if (!user || !permitted || invitation.status !== "invited" || busyId) return;
    setBusyId(invitation.id);
    setError("");
    try {
      await updateDoc(doc(db, "volunteerInvitations", invitation.id), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (problem: any) {
      setError(problem?.code === "permission-denied"
        ? "Permission denied: confirm the latest invitation rules are deployed."
        : "Could not save your response. Please retry.");
    } finally {
      setBusyId("");
    }
  };

  if (!permitted) return null;
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>Volunteer Invitations</Text>
        <Text style={styles.counter}>{invitations.filter((item) => item.status === "invited").length} pending</Text>
      </View>
      <Text style={styles.note}>
        Invitations are requests for your availability, not an emergency dispatch.
        Your response is sent to LGU Admin. Travel only after an authorized, validated assignment.
      </Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading ? <ActivityIndicator color="#087e70" /> : shown.length === 0
        ? <Text style={styles.empty}>No invitations received yet.</Text>
        : shown.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.content}>
              <Text style={styles.caseTitle}>{item.caseTitle || "Emergency invitation"}</Text>
              <Text style={styles.meta}>Case {item.caseId} · {item.status === "invited" ? "Awaiting response" :
                item.status === "accepted" ? "Accepted invitation" : "Declined invitation"}</Text>
            </View>
            {item.status === "invited" ? (
              <View style={styles.actions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Accept invitation for ${item.caseTitle}`}
                  disabled={busyId === item.id}
                  style={[styles.action, styles.accept]}
                  onPress={() => respond(item, "accepted")}
                >
                  <Text style={styles.acceptText}>{busyId === item.id ? "Saving…" : "Accept"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Decline invitation for ${item.caseTitle}`}
                  disabled={busyId === item.id}
                  style={[styles.action, styles.decline]}
                  onPress={() => respond(item, "declined")}
                >
                  <Text style={styles.declineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            ) : <Text style={item.status === "accepted" ? styles.statusAccepted : styles.statusDeclined}>
              {item.status === "accepted" ? "Accepted" : "Declined"}
            </Text>}
          </View>
        ))}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { width: "100%", borderRadius: 16, borderWidth: 1, borderColor: "#b9dfd4",
    backgroundColor: "#f5fcf8", padding: 16, marginVertical: 16 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" },
  title: { fontSize: 17, fontWeight: "800", color: "#134e3b" },
  counter: { color: "#047857", fontSize: 12, fontWeight: "700" },
  note: { color: "#45665b", fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 10 },
  error: { fontSize: 12, color: "#b42318", marginTop: 7 },
  empty: { fontSize: 13, color: "#64748b", paddingVertical: 12 },
  card: { backgroundColor: "#ffffff", padding: 12, borderWidth: 1, borderColor: "#dce9e5",
    borderRadius: 10, gap: 10, marginTop: 9, flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  content: { flex: 1, minWidth: 165 },
  caseTitle: { fontSize: 14, fontWeight: "800", color: "#173c32" },
  meta: { color: "#64748b", fontSize: 12, marginTop: 5 },
  actions: { flexDirection: "row", gap: 7 },
  action: { minHeight: 38, borderRadius: 8, paddingHorizontal: 13, justifyContent: "center" },
  accept: { backgroundColor: "#087e70" },
  decline: { borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#ffffff" },
  acceptText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  declineText: { color: "#334155", fontSize: 12, fontWeight: "800" },
  statusAccepted: { color: "#047857", fontSize: 12, fontWeight: "800" },
  statusDeclined: { color: "#9a3412", fontSize: 12, fontWeight: "800" },
});
