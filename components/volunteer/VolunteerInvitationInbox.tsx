import { Ionicons } from "@expo/vector-icons";
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

type Props = {
  visible?: boolean;
  assignedCaseIds?: string[];
  onPendingCountChange?: (count: number) => void;
};

/**
 * Backward compatibility for invitations created before direct Admin assignments.
 * Do not create a task or grant access to private incident photographs here:
 * Firestore permits incident evidence only after the Admin actually assigns
 * the Volunteer to the validated case. New offers use responseAssignments cards.
 */
export default function VolunteerInvitationInbox({
  visible = true,
  assignedCaseIds = [],
  onPendingCountChange,
}: Props) {
  const { user, profile } = useUserSession();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const permitted = !!user && !!profile && hasVolunteerAccess(profile);
  const assignedKey = assignedCaseIds.slice().sort().join("|");

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
        ? "Previous invitation permissions are unavailable. Ask Admin to assign a validated task directly."
        : "Unable to load earlier invitations. Check your connection.");
      setLoading(false);
    });
  }, [user?.uid, permitted]);

  const pending = useMemo(() => {
    const assigned = new Set(assignedKey.split("|").filter(Boolean));
    return invitations
      .filter((invitation) => invitation.status === "invited" && !assigned.has(invitation.caseId))
      .sort((a, b) => Number(b.createdAt?.toMillis?.() || 0) - Number(a.createdAt?.toMillis?.() || 0));
  }, [invitations, assignedKey]);

  useEffect(() => {
    onPendingCountChange?.(pending.length);
  }, [pending.length, onPendingCountChange]);

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
        ? "The invitation changed or access was denied. Refresh your tasks."
        : "Could not save your response. Please retry.");
    } finally {
      setBusyId("");
    }
  };

  if (!permitted || !visible) return null;
  if (!pending.length && !error) return null;

  return (
    <View style={styles.list}>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color="#087e70" />}
      {pending.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.media}>
            <Ionicons name="images-outline" size={27} color="#087F74" />
            <Text style={styles.mediaHint}>Photo available after assignment</Text>
          </View>
          <View style={styles.content}>
            <Text style={styles.label}>PREVIOUS AVAILABILITY REQUEST</Text>
            <Text style={styles.caseTitle}>{item.caseTitle || "Emergency report"}</Text>
            <Text style={styles.meta}>Case {item.caseId}</Text>
            <Text style={styles.note}>
              This is an earlier invitation, not an assigned task. Admin must issue a validated
              assignment before the incident photo and full details can be opened.
              Do not travel or share GPS for an invitation alone.
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Accept previous invitation for ${item.caseTitle}`}
              disabled={busyId === item.id}
              style={[styles.action, styles.accept]}
              onPress={() => respond(item, "accepted")}
            >
              <Text style={styles.acceptText}>{busyId === item.id ? "Saving…" : "Accept"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Decline previous invitation for ${item.caseTitle}`}
              disabled={busyId === item.id}
              style={[styles.action, styles.decline]}
              onPress={() => respond(item, "declined")}
            >
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { width: "100%", gap: 9, marginBottom: 10 },
  card: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", borderWidth: 1,
    borderColor: "#DAE7E2", borderRadius: 14, backgroundColor: "#FFFFFF", padding: 12, gap: 12 },
  media: { width: 132, minHeight: 112, borderRadius: 12, backgroundColor: "#EAF6F1",
    justifyContent: "center", alignItems: "center", padding: 10, gap: 7 },
  mediaHint: { color: "#476C60", fontSize: 10, fontWeight: "700", textAlign: "center" },
  content: { flex: 1, minWidth: 190, gap: 4 },
  label: { color: "#087F74", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  caseTitle: { fontSize: 15, fontWeight: "800", color: "#173C32" },
  meta: { color: "#64748B", fontSize: 11 },
  note: { color: "#536B61", fontSize: 12, lineHeight: 18, marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  action: { minHeight: 40, borderRadius: 8, paddingHorizontal: 13, justifyContent: "center" },
  accept: { backgroundColor: "#087E70" },
  decline: { borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF" },
  acceptText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  declineText: { color: "#334155", fontSize: 12, fontWeight: "800" },
  error: { fontSize: 12, color: "#B42318", marginVertical: 5 },
});
