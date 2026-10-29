import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  View, useWindowDimensions,
} from "react-native";
import {
  collection, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch,
} from "firebase/firestore";
import ListPagination from "../ui/ListPagination";
import { createAdminLog } from "../../lib/adminLogger";
import { auth, db } from "../../lib/firebase";
import { isApprovedProfile, UserProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type CommunityAccount = UserProfile & { id: string };
type Application = {
  id: string;
  uid?: string;
  status?: string;
  skills?: string[];
  availability?: string[];
  experienceTraining?: string;
  preferredActivity?: string;
  motivation?: string;
  rejectedReason?: string;
};
type PendingReview = { account: CommunityAccount | null; application: Application };

const PAGE_SIZE = 5;
function eligible(account: CommunityAccount | null, application: Application) {
  return !!account &&
    application.status === "pending" &&
    account.status === "approved" &&
    account.residentAccess === true &&
    (account.identityVerified === true || account.identityStatus === "verified") &&
    account.volunteerAccess !== true &&
    !["admin", "superadmin", "applicant", "lgu_personnel"].includes(String(account.role || "").toLowerCase());
}

/** Embedded, fully actionable LGU volunteer-review queue. Does not grant access merely on a card click. */
export default function DashboardVolunteerApprovals() {
  const { user, profile } = useUserSession();
  const { width } = useWindowDimensions();
  const isAdmin = !!user && !!profile && profile.role === "admin" &&
    profile.adminStatus !== "suspended" && isApprovedProfile(profile);
  const [users, setUsers] = useState<Record<string, CommunityAccount>>({});
  const [applications, setApplications] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState({ users: false, applications: false });
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PendingReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    const unsubUsers = onSnapshot(collection(db, "users"), snapshot => {
      const next: Record<string, CommunityAccount> = {};
      snapshot.docs.forEach(item => {
        next[item.id] = { id: item.id, ...(item.data() as UserProfile) };
      });
      setUsers(next);
      setLoaded(old => ({ ...old, users: true }));
    }, () => { setError("Unable to load resident identities. Try refreshing."); setLoaded(old => ({ ...old, users: true })); });
    const unsubApplications = onSnapshot(query(collection(db, "volunteerApplications"), where("status", "==", "pending")), snapshot => {
      setApplications(snapshot.docs.map(item => ({ id: item.id, ...(item.data() as Omit<Application,"id">) })));
      setLoaded(old => ({ ...old, applications: true }));
    }, () => { setError("Unable to load volunteer applications. Please retry."); setLoaded(old => ({ ...old, applications: true })); });
    return () => { unsubUsers(); unsubApplications(); };
  }, [isAdmin]);

  const pending = useMemo(() => applications.map(application => ({
    application,
    account: users[application.uid || application.id] || users[application.id] || null,
  })), [applications, users]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return pending;
    return pending.filter(item => [
      item.account?.fullName, item.account?.email, item.account?.barangay, item.application.uid, item.application.id,
    ].some(value => String(value || "").toLowerCase().includes(term)));
  }, [pending, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const activePage = Math.max(1, Math.min(page, totalPages));
  const paged = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const closeReview = () => {
    if (saving) return;
    setSelected(null); setConfirmed(false); setReason("");
  };
  const submit = async (decision: "approved" | "rejected") => {
    if (!selected || saving || !isAdmin || !auth.currentUser || auth.currentUser.uid !== user?.uid || !confirmed) return;
    if (decision === "rejected" && reason.trim().length < 5) {
      setError("Provide a clear rejection reason (at least 5 characters).");
      return;
    }
    setError("");
    setSaving(true);
    try {
      // Re-read both records immediately before action. A completed or withdrawn
      // application must never be processed from a stale dashboard snapshot.
      const uid = selected.application.uid || selected.application.id;
      const [accountSnap, applicationSnap] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        getDoc(doc(db, "volunteerApplications", selected.application.id)),
      ]);
      const latestAccount = accountSnap.exists()
        ? { id: uid, ...(accountSnap.data() as UserProfile) } as CommunityAccount : null;
      const latestApplication = applicationSnap.exists()
        ? { id: applicationSnap.id, ...(applicationSnap.data() as Omit<Application, "id">) } : null;
      if (!latestAccount || !latestApplication || latestApplication.status !== "pending" ||
        latestAccount.volunteerAccess === true) {
        throw new Error("Application changed. Refresh and review its latest status.");
      }
      if (decision === "approved" && !eligible(latestAccount, latestApplication)) {
        throw new Error("Approval requires an active, identity-verified Resident.");
      }
      if (["admin", "superadmin", "applicant", "lgu_personnel"].includes(String(latestAccount.role || "").toLowerCase())) {
        throw new Error("Only community Resident accounts are eligible for this workflow.");
      }
      const batch = writeBatch(db);
      batch.update(doc(db, "users", uid), {
        volunteerAccess: decision === "approved",
        volunteerStatus: decision,
        activeMode: "resident",
        volunteerReviewedAt: serverTimestamp(),
        volunteerReviewedBy: user!.uid,
      });
      // Keep this update aligned with approved volunteerApplications Firestore rules.
      batch.update(doc(db, "volunteerApplications", selected.application.id), {
        status: decision,
        volunteerAccess: decision === "approved",
        activeMode: "resident",
        reviewedAt: serverTimestamp(),
        reviewedBy: user!.uid,
        rejectedReason: decision === "rejected" ? reason.trim() : "",
      });
      await batch.commit();
      try {
        await createAdminLog({
          actionType: `volunteer_application_${decision}`,
          targetType: "user",
          targetId: uid,
          adminUid: user!.uid,
          adminName: user!.displayName || user!.email || "LGU Admin",
          description: `${latestAccount.fullName || latestAccount.email || uid} volunteer application was ${decision} from the Command Center.`,
        });
      } catch (logError) {
        // Commit already succeeded; never suggest a second approval because logging failed.
        console.log("dashboard volunteer approval audit log error", logError);
      }
      setNotice(decision === "approved"
        ? "Volunteer approved. Their existing Resident account remains active."
        : "Volunteer application declined. The Resident account remains active.");
      closeAfterSave();
    } catch (err: any) {
      setError(err?.message || "Review could not be saved. Check permissions and try again.");
    } finally { setSaving(false); }
  };
  const closeAfterSave = () => { setSelected(null); setConfirmed(false); setReason(""); };

  if (!isAdmin) return null;
  return (
    <View style={styles.panel} accessibilityLabel="Dashboard Volunteer Account Approvals">
      <View style={styles.heading}>
        <View style={styles.headerIcon}><Ionicons name="people-outline" size={22} color="#08775E" /></View>
        <View style={styles.headingText}>
          <Text style={styles.eyebrow}>ACCOUNT APPROVALS · LGU ADMIN</Text>
          <Text style={styles.title}>Volunteer Applications</Text>
          <Text style={styles.subtitle}>Review real Resident applications here, without leaving the Command Center.</Text>
        </View>
        <View style={styles.count}><Text style={styles.countText}>{pending.length} pending</Text></View>
      </View>
      {!!notice && <View style={styles.success}><Text style={styles.successText}>{notice}</Text></View>}
      {!!error && <View style={styles.error}><Text style={styles.errorText} accessibilityRole="alert">{error}</Text></View>}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={19} color="#627D71" />
        <TextInput style={styles.searchInput} value={search}
          onChangeText={value => { setSearch(value); setPage(1); }}
          placeholder="Find applicant by name, email or barangay"
          placeholderTextColor="#799187"
          accessibilityLabel="Search dashboard volunteer applications" />
      </View>
      {!loaded.users || !loaded.applications
        ? <View style={styles.loading}><ActivityIndicator color="#08775E" /><Text style={styles.subtitle}>Loading applications…</Text></View>
        : <>
          <ListPagination page={activePage} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
          {filtered.length === 0
            ? <Text style={styles.empty}>No pending volunteer applications in this view.</Text>
            : paged.map(({ application, account }) => (
              <View key={application.id} style={[styles.item, width < 650 && styles.itemSmall]}>
                <View style={styles.personIcon}><Ionicons name="person-outline" color="#0D7057" size={19} /></View>
                <View style={styles.itemCopy}>
                  <Text style={styles.personName}>{account?.fullName || "Account details unavailable"}</Text>
                  <Text style={styles.detail}>{account?.email || "Missing account"} · {account?.barangay || "Barangay not set"}</Text>
                  <Text style={styles.detail}>{eligible(account, application) ? "Verified Resident · Eligible to review" : "Requires verified Resident eligibility"}</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Review volunteer application for ${account?.fullName || application.id}`}
                  style={styles.reviewButton} onPress={() => {
                    setSelected({ application, account }); setConfirmed(false); setReason(""); setError(""); setNotice("");
                  }}>
                  <Text style={styles.reviewText}>Review</Text><Ionicons name="chevron-forward" color="#FFFFFF" size={15} />
                </TouchableOpacity>
              </View>
            ))
          }
        </>
      }
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={closeReview}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHeading}>
              <View style={styles.headingText}>
                <Text style={styles.eyebrow}>REVIEW BEFORE APPROVAL</Text>
                <Text style={styles.title}>Volunteer Application</Text>
              </View>
              <TouchableOpacity onPress={closeReview} disabled={saving} accessibilityLabel="Close volunteer review"><Ionicons name="close" size={22} color="#35584C" /></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.details} keyboardShouldPersistTaps="handled">
              <Text style={styles.detailStrong}>Name: {selected?.account?.fullName || "Not available"}</Text>
              <Text style={styles.detail}>Email: {selected?.account?.email || "Not available"}</Text>
              <Text style={styles.detail}>Barangay: {selected?.account?.barangay || "Not available"}</Text>
              <Text style={styles.detail}>Account: {selected?.account?.status || "Not available"}</Text>
              <Text style={styles.detail}>Identity: {selected?.account?.identityVerified === true || selected?.account?.identityStatus === "verified" ? "Verified Resident" : "Not verified"}</Text>
              <Text style={styles.detail}>Skills: {selected?.application.skills?.join(", ") || "Not provided"}</Text>
              <Text style={styles.detail}>Availability: {selected?.application.availability?.join(", ") || "Not provided"}</Text>
              <Text style={styles.detail}>Preferred activity: {selected?.application.preferredActivity || "Not provided"}</Text>
              <Text style={styles.detail}>Training: {selected?.application.experienceTraining || "Not provided"}</Text>
              <Text style={styles.detail}>Application status: {selected?.application.status || "Not available"}</Text>
            </ScrollView>
            <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }}
              style={styles.checkRow} disabled={saving} onPress={() => setConfirmed(v => !v)}>
              <Ionicons name={confirmed ? "checkbox" : "square-outline"} size={23} color="#08775E" />
              <Text style={styles.checkText}>I have checked this application and the Resident's eligibility.</Text>
            </TouchableOpacity>
            <TextInput style={styles.reason} placeholder="Reason for declining (required for Reject)"
              placeholderTextColor="#789084" multiline value={reason} onChangeText={setReason}
              accessibilityLabel="Volunteer rejection reason" editable={!saving} />
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.approve, (!confirmed || !selected || !eligible(selected.account, selected.application) || saving) && styles.disabled]}
                disabled={!confirmed || !selected || !eligible(selected.account, selected.application) || saving}
                onPress={() => void submit("approved")}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Approve</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.reject, (!confirmed || saving || reason.trim().length < 5) && styles.disabled]}
                disabled={!confirmed || saving || reason.trim().length < 5} onPress={() => void submit("rejected")}>
                <Text style={styles.rejectText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancel} disabled={saving} onPress={closeReview}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 21, borderWidth: 1, borderColor: "#D6E8DC", marginBottom: 24 },
  heading: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 11, marginBottom: 15 },
  headerIcon: { backgroundColor: "#E4F5EC", width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  headingText: { flex: 1, minWidth: 200 },
  eyebrow: { fontSize: 10, letterSpacing: 0.9, color: "#0B765C", fontWeight: "900" },
  title: { color: "#123F31", fontSize: 21, fontWeight: "800", marginTop: 3 },
  subtitle: { color: "#597A6B", fontSize: 12, lineHeight: 18, marginTop: 4 },
  count: { backgroundColor: "#E6F5ED", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 99 },
  countText: { color: "#08725B", fontSize: 12, fontWeight: "900" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, backgroundColor: "#F9FCFA", borderWidth: 1, borderColor: "#D7E8DE", borderRadius: 10 },
  searchInput: { flex: 1, minHeight: 44, color: "#163F30", fontSize: 13 },
  loading: { minHeight: 90, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  empty: { textAlign: "center", color: "#6A8474", padding: 22, fontSize: 13 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderTopWidth: 1, borderColor: "#E9F0EB" },
  itemSmall: { flexWrap: "wrap" },
  personIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#E8F5EC", alignItems: "center", justifyContent: "center" },
  itemCopy: { flex: 1, minWidth: 175 },
  personName: { color: "#123F31", fontWeight: "800", fontSize: 13 },
  detail: { color: "#58756A", fontSize: 12, lineHeight: 19 },
  detailStrong: { color: "#184934", fontSize: 13, fontWeight: "800", lineHeight: 21 },
  reviewButton: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, backgroundColor: "#08785D", paddingHorizontal: 14 },
  reviewText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  success: { backgroundColor: "#E7F7EB", padding: 12, borderRadius: 10, marginBottom: 10 },
  successText: { color: "#175D41", fontWeight: "700", fontSize: 12 },
  error: { backgroundColor: "#FFF0EA", padding: 12, borderRadius: 10, marginBottom: 10 },
  errorText: { color: "#9A3412", fontSize: 12, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(5,28,22,.72)", justifyContent: "center", padding: 18, alignItems: "center" },
  modal: { maxWidth: 550, width: "100%", maxHeight: "94%", backgroundColor: "#FFFFFF", padding: 23, borderRadius: 16 },
  modalHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  modalScroll: { maxHeight: 260, marginTop: 16 },
  details: { backgroundColor: "#F5FAF7", borderColor: "#D5E9DB", borderWidth: 1, borderRadius: 10, padding: 13, gap: 2 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 17 },
  checkText: { flex: 1, color: "#2C5A48", fontSize: 12, lineHeight: 19, fontWeight: "700" },
  reason: { marginTop: 10, borderWidth: 1, borderColor: "#D7E7DE", borderRadius: 10, minHeight: 60, padding: 10, fontSize: 12, color: "#204A39", textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 13 },
  approve: { flex: 1, minWidth: 92, minHeight: 43, backgroundColor: "#08785D", borderRadius: 9, alignItems: "center", justifyContent: "center" },
  reject: { flex: 1, minWidth: 92, minHeight: 43, borderColor: "#C43E40", borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  cancel: { minWidth: 82, minHeight: 43, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F5F2", paddingHorizontal: 12 },
  buttonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  rejectText: { color: "#B4232D", fontWeight: "800", fontSize: 12 },
  cancelText: { color: "#4B6A5B", fontWeight: "700", fontSize: 12 },
  disabled: { opacity: 0.42 },
});
