import Ionicons from "@expo/vector-icons/Ionicons";
import { Href, Redirect, router } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { db } from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type DonationRecord = {
  id: string;
  donorUid?: string;
  donorName?: string;
  donorDisplayName?: string;
  campaignId?: string;
  campaignTitle?: string;
  amount?: number;
  actualAmountReceived?: number;
  status?: string;
  paymentProvider?: string;
  paymentStatus?: string;
  paymongoLivemode?: boolean;
  transactionReference?: string;
  createdAt?: unknown;
  paidAt?: unknown;
  receivedAt?: unknown;
};
type Campaign = {
  id: string;
  title?: string;
  status?: string;
};
type Donor = {
  key: string;
  uid: string;
  name: string;
  records: DonationRecord[];
  receivedCount: number;
  pendingCount: number;
  recordedReceivedAmount: number;
};
type DonorProfile = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  barangay?: string;
  city?: string;
  role?: string;
  identityStatus?: string;
  identityVerified?: boolean;
};

const numberAmount = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const money = (value: number) => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
}).format(value);
const timeMillis = (value: any) => {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
};
const dateLabel = (value: unknown) => {
  const millis = timeMillis(value);
  return millis ? new Date(millis).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }) : "Not recorded";
};
const isReceived = (record: DonationRecord) => record.status === "received";
const receivedAmount = (record: DonationRecord) =>
  isReceived(record) ? numberAmount(record.actualAmountReceived) : 0;
const isAwaiting = (record: DonationRecord) =>
  ["payment_creating", "payment_pending", "submitted"].includes(record.status || "");
const statusLabel = (record: DonationRecord) => {
  if (record.status === "received") return "Verified received";
  if (record.status === "submitted") return "Manual review";
  if (record.status === "payment_creating") return "Creating checkout";
  if (record.status === "payment_pending") return "Awaiting payment";
  if (record.status === "rejected") return "Rejected";
  return record.status || "Unknown";
};
const paymentLabel = (record: DonationRecord) => {
  if (record.paymentProvider === "paymongo") {
    if (record.paymongoLivemode === true) return "PayMongo LIVE";
    if (record.paymongoLivemode === false) return "PayMongo TEST";
    return "PayMongo (mode unconfirmed)";
  }
  return "Manual / legacy record";
};
const statusColor = (record: DonationRecord) =>
  isReceived(record) ? "#15803D" :
  record.status === "rejected" ? "#B42318" : "#B45309";

export default function AdminDonationMonitoring() {
  const { user, profile, loading } = useUserSession();
  const { width } = useWindowDimensions();
  const compact = width < 1000;
  const isAdmin = !!user && !!profile &&
    profile.role === "admin" && isApprovedProfile(profile);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [donationsLoaded, setDonationsLoaded] = useState(false);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [donationError, setDonationError] = useState("");
  const [campaignError, setCampaignError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [donorProfile, setDonorProfile] = useState<DonorProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    const stopDonations = onSnapshot(
      collection(db, "donations"),
      (snapshot) => {
        setDonations(snapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
        } as DonationRecord)).filter((item) =>
          String((item as any).donationType || "monetary") === "monetary"
        ).sort((a, b) => timeMillis(b.createdAt) - timeMillis(a.createdAt)));
        setDonationError("");
        setDonationsLoaded(true);
      },
      () => {
        setDonationError("Unable to read donation transactions. Check Admin permissions and connection.");
        setDonationsLoaded(true);
      },
    );
    const stopCampaigns = onSnapshot(
      collection(db, "donationCampaigns"),
      (snapshot) => {
        setCampaigns(snapshot.docs.map((item) => ({
          ...item.data(),
          id: item.id,
        } as Campaign)));
        setCampaignError("");
        setCampaignsLoaded(true);
      },
      () => {
        setCampaignError("Unable to load donation campaign totals.");
        setCampaignsLoaded(true);
      },
    );
    return () => {
      stopDonations();
      stopCampaigns();
    };
  }, [isAdmin]);

  const donors = useMemo(() => {
    const groups = new Map<string, Donor>();
    for (const record of donations) {
      const uid = String(record.donorUid || "").trim();
      const key = uid ? "uid:" + uid : "record:" + record.id;
      const current = groups.get(key) || {
        key,
        uid,
        name: String(record.donorName || record.donorDisplayName || "Unlinked donor"),
        records: [],
        receivedCount: 0,
        pendingCount: 0,
        recordedReceivedAmount: 0,
      };
      current.records.push(record);
      if (isReceived(record)) {
        current.receivedCount += 1;
        current.recordedReceivedAmount += receivedAmount(record);
      } else if (isAwaiting(record)) {
        current.pendingCount += 1;
      }
      groups.set(key, current);
    }
    return [...groups.values()].sort((a, b) =>
      timeMillis(b.records[0]?.createdAt) - timeMillis(a.records[0]?.createdAt)
    );
  }, [donations]);

  const selectedDonor = donors.find((donor) => donor.key === selectedKey) || null;
  const filteredDonors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return donors;
    return donors.filter((donor) =>
      donor.name.toLowerCase().includes(term) ||
      donor.records.some((record) =>
        String(record.campaignTitle || "").toLowerCase().includes(term)
      )
    );
  }, [donors, search]);

  useEffect(() => {
    let cancelled = false;
    setDonorProfile(null);
    setProfileNotice("");
    if (!isAdmin || !selectedDonor?.uid) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    void getDoc(doc(db, "users", selectedDonor.uid)).then((snapshot) => {
      if (cancelled) return;
      if (snapshot.exists()) {
        setDonorProfile(snapshot.data() as DonorProfile);
      } else {
        setProfileNotice("No matching registered profile was found.");
      }
    }).catch(() => {
      if (!cancelled) setProfileNotice("Unable to load this donor profile.");
    }).finally(() => {
      if (!cancelled) setProfileLoading(false);
    });
    return () => { cancelled = true; };
  }, [isAdmin, selectedDonor?.uid]);

  const verified = donations.filter(isReceived);
  const liveGatewayAmount = verified
    .filter((r) => r.paymentProvider === "paymongo" && r.paymongoLivemode === true)
    .reduce((sum, r) => sum + receivedAmount(r), 0);
  const sandboxAmount = verified
    .filter((r) => r.paymentProvider === "paymongo" && r.paymongoLivemode === false)
    .reduce((sum, r) => sum + receivedAmount(r), 0);
  const otherVerifiedAmount = verified
    .filter((r) => r.paymentProvider !== "paymongo" ||
      r.paymongoLivemode === undefined)
    .reduce((sum, r) => sum + receivedAmount(r), 0);
  const awaitingCount = donations.filter(isAwaiting).length;

  if (loading) return (
    <View style={styles.loading}><ActivityIndicator color="#07877A" /><Text>Loading donation monitoring...</Text></View>
  );
  if (!user || !profile || !isApprovedProfile(profile)) return <Redirect href="/login" />;
  if (profile.role === "superadmin") return <Redirect href="/(superadmin)" />;
  if (!isAdmin) return <Redirect href="/(tabs)" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}
      showsVerticalScrollIndicator>
      <View style={styles.topRow}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>VOLUNSERVE · ADMIN DONATIONS</Text>
          <Text style={styles.title}>Donor Monitoring</Text>
          <Text style={styles.subtitle}>Review recorded monetary donations, payment confirmation, and registered donor profiles.</Text>
        </View>
        <Pressable style={styles.primary} onPress={() =>
          router.push("/(admin)/donation-list" as Href)}>
          <Ionicons name="settings-outline" size={16} color="#FFFFFF" />
          <Text style={styles.primaryText}>Donation Operations</Text>
        </Pressable>
      </View>

      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={20} color="#087A70" />
        <Text style={styles.noticeText}>PayMongo TEST transactions are sandbox records, not actual transferred funds. Amounts from manually verified or unconfirmed-mode records are shown separately. An initiated checkout is not a paid donation.</Text>
      </View>

      {(donationError || campaignError) ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{[donationError, campaignError].filter(Boolean).join(" ")}</Text>
        </View>
      ) : null}

      <View style={styles.metrics}>
        <Metric label="Campaigns" value={campaignsLoaded ? campaigns.filter((c) => c.status === "published").length.toString() : "…"} />
        <Metric label="Donor records" value={donationsLoaded ? donors.length.toString() : "…"} />
        <Metric label="Awaiting / review" value={donationsLoaded ? awaitingCount.toString() : "…"} />
        <Metric label="PayMongo live received" value={donationsLoaded ? money(liveGatewayAmount) : "…"} />
        <Metric label="PayMongo sandbox" value={donationsLoaded ? money(sandboxAmount) : "…"} />
        <Metric label="Manual / mode unknown" value={donationsLoaded ? money(otherVerifiedAmount) : "…"} />
      </View>

      <View style={[styles.columns, compact && styles.columnsCompact]}>
        <View style={[styles.donorColumn, compact && styles.fullWidth]}>
          <View style={styles.sectionHeader}>
            <View style={styles.flex}>
              <Text style={styles.sectionTitle}>Donors</Text>
              <Text style={styles.helper}>Registered donation records; select a donor to see their transaction history and profile.</Text>
            </View>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={17} color="#64748B" />
            <TextInput accessibilityLabel="Search donors or campaigns"
              value={search} onChangeText={setSearch}
              placeholder="Search donor or campaign"
              placeholderTextColor="#94A3B8"
              style={styles.searchInput} />
          </View>
          {!donationsLoaded ? (
            <View style={styles.empty}><ActivityIndicator color="#07877A" /></View>
          ) : filteredDonors.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.helper}>{search ? "No matching donors." : "No recorded monetary donations yet."}</Text>
            </View>
          ) : filteredDonors.map((donor) => (
            <Pressable key={donor.key} accessibilityRole="button"
              onPress={() => setSelectedKey(donor.key)}
              style={[styles.donorCard, selectedKey === donor.key && styles.selectedCard]}>
              <View style={styles.avatar}><Ionicons name="person-outline" size={19} color="#07877A" /></View>
              <View style={styles.flex}>
                <Text style={styles.donorName} numberOfLines={1}>{donor.name}</Text>
                <Text style={styles.helper}>{donor.records.length} transaction(s) · {donor.receivedCount} received</Text>
                <Text style={styles.donorAmount}>{money(donor.recordedReceivedAmount)} verified records</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#64748B" />
            </Pressable>
          ))}
        </View>

        <View style={[styles.detailsColumn, compact && styles.fullWidth]}>
          {!selectedDonor ? (
            <View style={styles.emptyDetail}>
              <Ionicons name="people-outline" size={36} color="#07877A" />
              <Text style={styles.sectionTitle}>Select a donor</Text>
              <Text style={styles.helper}>Their donation transactions and accessible account details will appear here.</Text>
            </View>
          ) : (
            <>
              <View style={styles.panel}>
                <Text style={styles.eyebrow}>DONOR PROFILE · ADMIN ONLY</Text>
                <Text style={styles.sectionTitle}>{donorProfile?.fullName || selectedDonor.name}</Text>
                {profileLoading ? <ActivityIndicator color="#07877A" /> : null}
                {profileNotice ? <Text style={styles.helper}>{profileNotice}</Text> : null}
                {donorProfile ? (
                  <View style={styles.profileGrid}>
                    <Info label="Name" value={donorProfile.fullName ||
                      [donorProfile.firstName, donorProfile.lastName].filter(Boolean).join(" ")} />
                    <Info label="Email" value={donorProfile.email} />
                    <Info label="Mobile number" value={donorProfile.phoneNumber} />
                    <Info label="Barangay / City"
                      value={[donorProfile.barangay, donorProfile.city].filter(Boolean).join(", ")} />
                    <Info label="Account role" value={donorProfile.role} />
                    <Info label="Identity status" value={donorProfile.identityVerified ||
                      donorProfile.identityStatus === "verified" ? "Verified" :
                      donorProfile.identityStatus || "Not verified"} />
                  </View>
                ) : null}
                <Text style={styles.privacyText}>Only authorized Admin users can load a linked profile. Private ID scans and residential addresses are not shown here.</Text>
              </View>
              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>Transaction History</Text>
                <Text style={styles.helper}>{selectedDonor.records.length} monetary record(s); only received transactions contribute to verified totals.</Text>
                {selectedDonor.records.map((record) => (
                  <View key={record.id} style={styles.transaction}>
                    <View style={styles.topRow}>
                      <View style={styles.flex}>
                        <Text style={styles.transactionTitle}>{record.campaignTitle ||
                          campaigns.find((c) => c.id === record.campaignId)?.title || "Donation Campaign"}</Text>
                        <Text style={styles.helper}>{dateLabel(record.paidAt || record.receivedAt || record.createdAt)}</Text>
                      </View>
                      <Text style={styles.amount}>{money(isReceived(record) ?
                        receivedAmount(record) : numberAmount(record.amount))}</Text>
                    </View>
                    <View style={styles.transactionFooter}>
                      <Text style={[styles.status, { color: statusColor(record) }]}>{statusLabel(record)}</Text>
                      <Text style={styles.helper}>{paymentLabel(record)}</Text>
                    </View>
                    {record.transactionReference ? (
                      <Text style={styles.reference} numberOfLines={1}>Reference: {record.transactionReference}</Text>
                    ) : null}
                    {!isReceived(record) ? (
                      <Text style={styles.unverified}>Not counted as received funds.</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}>
    <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>;
}
function Info({ label, value }: { label: string; value?: string }) {
  return <View style={styles.info}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{String(value || "Not provided")}</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F2F7FA" },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center", padding: 22, paddingBottom: 64, gap: 15 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8, color: "#07877A" },
  title: { color: "#0F3151", fontSize: 27, fontWeight: "900", marginTop: 3 },
  subtitle: { color: "#678093", fontSize: 12, lineHeight: 19, marginTop: 4 },
  primary: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: "#087F76", flexDirection: "row", alignItems: "center", gap: 8 },
  primaryText: { color: "white", fontWeight: "900", fontSize: 11 },
  notice: { flexDirection: "row", alignItems: "center", padding: 13, borderWidth: 1, borderColor: "#C5E8DB", backgroundColor: "#EAFBF3", borderRadius: 13, gap: 10 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 17, color: "#245D55" },
  errorBox: { padding: 12, backgroundColor: "#FFF4F2", borderRadius: 11, borderWidth: 1, borderColor: "#F4C8C1" },
  errorText: { fontSize: 12, color: "#B42318" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { flexGrow: 1, flexBasis: 175, minWidth: 145, backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#E0E8EE", padding: 14, gap: 5 },
  metricValue: { fontSize: 19, fontWeight: "900", color: "#0C3A54" },
  metricLabel: { fontSize: 10, color: "#667F8B", fontWeight: "700" },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  columnsCompact: { flexDirection: "column" },
  donorColumn: { flex: 0.95, minWidth: 0, gap: 9 },
  detailsColumn: { flex: 1.15, minWidth: 0, gap: 12 },
  fullWidth: { width: "100%", flex: undefined },
  sectionHeader: { flexDirection: "row", alignItems: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "900", color: "#0F3151" },
  helper: { fontSize: 11, lineHeight: 17, color: "#748391", marginTop: 3 },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "white", borderWidth: 1, borderColor: "#DDE7EC", borderRadius: 11, paddingHorizontal: 12, minHeight: 45, gap: 8 },
  searchInput: { flex: 1, fontSize: 12, color: "#153D54", minWidth: 0 },
  donorCard: { backgroundColor: "white", borderWidth: 1, borderColor: "#DFE8EC", borderRadius: 12, padding: 13, flexDirection: "row", gap: 10, alignItems: "center" },
  selectedCard: { borderColor: "#07877A", backgroundColor: "#F2FBF8" },
  avatar: { height: 38, width: 38, backgroundColor: "#E4F5EF", borderRadius: 19, alignItems: "center", justifyContent: "center" },
  donorName: { fontSize: 13, fontWeight: "900", color: "#153D54" },
  donorAmount: { fontSize: 11, fontWeight: "800", color: "#087F76", marginTop: 4 },
  empty: { padding: 26, alignItems: "center", backgroundColor: "white", borderRadius: 12 },
  emptyDetail: { padding: 45, alignItems: "center", gap: 10, backgroundColor: "white", borderRadius: 13, borderWidth: 1, borderColor: "#E0E8EE" },
  panel: { backgroundColor: "white", borderWidth: 1, borderColor: "#E0E8EE", borderRadius: 13, padding: 16, gap: 10 },
  profileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  info: { flexBasis: 190, flexGrow: 1, padding: 10, borderRadius: 9, backgroundColor: "#F5F8FA" },
  infoLabel: { color: "#69818D", textTransform: "uppercase", fontSize: 9, fontWeight: "800" },
  infoValue: { fontSize: 11, fontWeight: "700", marginTop: 4, color: "#193D51" },
  privacyText: { fontSize: 10, color: "#6C8390", lineHeight: 16 },
  transaction: { borderTopWidth: 1, borderTopColor: "#E6ECEF", paddingVertical: 12, gap: 5 },
  transactionTitle: { fontSize: 12, fontWeight: "900", color: "#163D52" },
  amount: { fontSize: 13, fontWeight: "900", color: "#087F76" },
  transactionFooter: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  status: { fontSize: 10, fontWeight: "900" },
  reference: { color: "#6B8190", fontSize: 10 },
  unverified: { color: "#AB6B12", fontSize: 10, fontWeight: "700" },
});
