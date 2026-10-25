import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { useFonts } from "expo-font";
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet,
  Text, TextInput, useWindowDimensions, View,
} from "react-native";

import { db } from "../../lib/firebase";
import FundReconciliationPanel from "./FundReconciliationPanel";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type DonationRow = {
  id: string; donationType?: string; donorUid?: string; donorName?: string;
  donorDisplayName?: string; campaignId?: string; campaignTitle?: string;
  amount?: number; actualAmountReceived?: number; paymentProvider?: string;
  paymongoLivemode?: boolean; paymongoCheckoutSessionId?: string;
  paymentStatus?: string; status?: string; donorNote?: string;
  transactionReference?: string; paidAt?: any; receivedAt?: any; createdAt?: any;
};
type CampaignRow = {
  id: string; title?: string; status?: string; monetaryGoal?: number;
  verifiedAmountReceived?: number; updatedAt?: any; publishedAt?: any; createdAt?: any;
  publicPhotoUrls?: string[];
  photoUrls?: string[]; imageUrls?: string[]; generalArea?: string;
  sourceAssistanceRequestId?: string;
};
type DonorProfile = {
  fullName?: string; email?: string; barangay?: string; city?: string;
  identityVerified?: boolean; identityStatus?: string; photoURL?: string;
  profilePhotoUrl?: string;
};
type Section = "overview" | "all" | "campaigns" | "payouts" | "notifications";

const numeric = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
};
const peso = (value: unknown) => "₱" + numeric(value).toLocaleString("en-PH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const millis = (value: any) => typeof value?.toMillis === "function" ?
  value.toMillis() : (typeof value?.seconds === "number" ? value.seconds * 1000 : 0);
const dateText = (value: any) => {
  const ms = millis(value);
  return ms ? new Date(ms).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }) : "Not available";
};
const statusText = (record: DonationRow) => {
  if (record.status === "received" && record.paymentStatus === "paid") {
    return record.paymentProvider === "paymongo" && record.paymongoLivemode === false
      ? "Paid (Test)" : "Paid";
  }
  if (record.status === "received") return "Received";
  if (record.status === "submitted") return "For review";
  if (record.status === "payment_creating") return "Creating checkout";
  if (record.status === "payment_pending") return "Pending";
  if (record.status === "rejected") return "Rejected";
  if (record.status === "payment_failed") return "Checkout failed";
  return record.status || "Unknown";
};
const isConfirmed = (r: DonationRow) =>
  r.status === "received" &&
  (r.paymentProvider !== "paymongo" || r.paymentStatus === "paid");
const amountReceived = (r: DonationRow) =>
  isConfirmed(r) ? numeric(r.actualAmountReceived) : 0;
const donorLabel = (r: DonationRow) =>
  String(r.donorName || r.donorDisplayName || "Unlinked donor").trim();
const payMode = (r: DonationRow) =>
  r.paymentProvider === "paymongo" ? (
    r.paymongoLivemode === true ? "PayMongo Live" :
    r.paymongoLivemode === false ? "PayMongo Sandbox" : "PayMongo (mode unknown)"
  ) : "Manual / legacy";
const campaignImage = (c: CampaignRow) =>
  [ ...(c.publicPhotoUrls || []), ...(c.photoUrls || []), ...(c.imageUrls || [])]
    .find((x) => typeof x === "string" && x.startsWith("https://"));

function SmallButton({ text, onPress, primary = false }: {
  text: string; onPress: () => void; primary?: boolean;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress}
    style={[s.smallButton, primary && s.primaryButton]}>
    <Text style={[s.smallButtonText, primary && s.primaryButtonText]}>{text}</Text>
  </Pressable>;
}

export default function DonationAdminDashboard({ mode, initialView = "overview" }: {
  mode: "admin" | "superadmin"; initialView?: Section;
}) {
  const { user, profile, loading } = useUserSession();
  const [fontsLoaded, fontsError] = useFonts({
    AdminInterRegular: Inter_400Regular,
    AdminInterMedium: Inter_500Medium,
    AdminInterSemiBold: Inter_600SemiBold,
    AdminInterBold: Inter_700Bold,
  });
  const allowed = !!user && !!profile && isApprovedProfile(profile) && profile.role === mode;
  const { width } = useWindowDimensions();
  const compact = width < 1320;
  const narrow = width < 970;
  const [records, setRecords] = useState<DonationRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [ready, setReady] = useState(false);
  const [campaignReady, setCampaignReady] = useState(false);
  const [problem, setProblem] = useState("");
  const [view, setView] = useState<Section>(initialView);
  const [alerts, setAlerts] = useState<{id:string; title?:string; message?:string; read?:boolean; donationId?:string; createdAt?:any}[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [expandedReviewKey, setExpandedReviewKey] = useState("");
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState("");
  const [donor, setDonor] = useState<DonorProfile | null>(null);
  const [donorLoading, setDonorLoading] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    const unsubs = [
      onSnapshot(collection(db, "donations"), (snap) => {
        setRecords(snap.docs.map(d => ({ ...d.data(), id: d.id } as DonationRow))
          .filter(x => !x.donationType || x.donationType === "monetary")
          .sort((a, b) => millis(b.paidAt || b.createdAt) - millis(a.paidAt || a.createdAt)));
        setReady(true);
        setProblem("");
      }, () => { setProblem("Unable to load donation records. Check Firestore access."); setReady(true); }),
      onSnapshot(collection(db, "donationCampaigns"), (snap) => {
        setCampaigns(snap.docs.map(d => ({ ...d.data(), id: d.id } as CampaignRow)));
        setCampaignReady(true);
      }, () => { setCampaignReady(false); setProblem("Unable to load campaign records."); }),
    ];
    return () => unsubs.forEach(stop => stop());
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !user?.uid) return;
    return onSnapshot(query(collection(db, "notifications"), where("userId", "==", user.uid)),
      snapshot => setAlerts(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as { id:string; title?:string; message?:string; read?:boolean; donationId?:string; createdAt?:any; type?:string }))
        .filter(a => a.type === "donation_received")
        .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))), () => {});
  }, [allowed, user?.uid]);

  const selected = records.find(r => r.id === selectedId) || null;
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId) || null;
  useEffect(() => {
    let active = true;
    setDonor(null);
    if (!allowed || !selected?.donorUid) return;
    setDonorLoading(true);
    void getDoc(doc(db, "users", selected.donorUid))
      .then(snap => { if (active && snap.exists()) setDonor(snap.data() as DonorProfile); })
      .catch(() => { if (active) setDonor(null); })
      .finally(() => { if (active) setDonorLoading(false); });
    return () => { active = false; };
  }, [allowed, selected?.donorUid]);

  const paid = records.filter(isConfirmed);
  const testReceived = paid.filter(r => r.paymentProvider === "paymongo" && r.paymongoLivemode === false)
    .reduce((sum, r) => sum + amountReceived(r), 0);
  const liveReceived = paid.filter(r => r.paymentProvider === "paymongo" && r.paymongoLivemode === true)
    .reduce((sum, r) => sum + amountReceived(r), 0);
  const otherReceived = paid.filter(r => r.paymentProvider !== "paymongo" || r.paymongoLivemode == null)
    .reduce((sum, r) => sum + amountReceived(r), 0);
  const donors = new Set(records.filter(isConfirmed).map(r => r.donorUid || "unlinked:" + r.id)).size;
  const pending = records.filter(r => ["payment_creating", "payment_pending", "submitted"].includes(r.status || "")).length;
  // Real record-backed review items, not a second campaign/transaction listing.
  const missingGoal = campaigns.filter(c =>
    c.status === "published" && numeric(c.monetaryGoal) === 0);
  const manualPending = records.filter(r =>
    r.status === "submitted" && r.paymentProvider !== "paymongo");
  const paymentFailures = records.filter(r =>
    r.status === "payment_failed" || r.status === "rejected");
  const reviewItems = [
    ...missingGoal.map(c => ({key: "campaign:" + c.id, id: c.id, kind: "campaign" as const,
      title: "Published campaign missing approved goal",
      detail: c.title || "Untitled campaign", icon: "alert-circle-outline" as const})),
    ...manualPending.map(r => ({key: "legacy:" + r.id, id: r.id, kind: "donation" as const,
      title: "Legacy donation requires review",
      detail: (r.campaignTitle || "Donation") + " · " + peso(r.amount),
      icon: "document-text-outline" as const})),
    ...paymentFailures.map(r => ({key: "failed:" + r.id, id: r.id, kind: "donation" as const,
      title: "Payment exception",
      detail: (r.campaignTitle || "Donation") + " · " + statusText(r),
      icon: "alert-circle-outline" as const})),
  ];
  const recentActivity = records.slice(0, 3);
  const progressCampaigns = campaigns
    .filter(c => numeric(c.monetaryGoal) > 0)
    .sort((a,b) => {
      const aDone = numeric(a.verifiedAmountReceived) >= numeric(a.monetaryGoal);
      const bDone = numeric(b.verifiedAmountReceived) >= numeric(b.monetaryGoal);
      return Number(aDone) - Number(bDone) ||
        String(a.title || "").localeCompare(String(b.title || ""));
    });
  const progressVisible = showAllCampaigns ? progressCampaigns : progressCampaigns.slice(0,3);
  const campaignDonorCount = (campaignId: string) =>
    new Set(records.filter(r => r.campaignId === campaignId && isConfirmed(r))
      .map(r => r.donorUid || "unlinked:" + r.id)).size;
  const unreadCount = alerts.filter(a => !a.read).length;
  const selectedAlert = alerts.find(a => a.id === selectedAlertId) || null;
  const relatedAlertDonation = selectedAlert?.donationId
    ? records.find(r => r.id === selectedAlert.donationId) || null
    : null;
  const filtered = useMemo(() => records.filter(r => {
    const term = search.trim().toLowerCase();
    const match = !term || [donorLabel(r), r.campaignTitle, r.id, r.transactionReference]
      .some(v => String(v || "").toLowerCase().includes(term));
    return match && (statusFilter === "all" ||
      (statusFilter === "paid" ? isConfirmed(r) : statusFilter === "pending" ?
        ["payment_creating", "payment_pending", "submitted"].includes(r.status || "") :
        (statusFilter === "rejected"
          ? ["rejected", "payment_failed"].includes(r.status || "")
          : r.status === statusFilter)));
  }), [records, search, statusFilter]);

  if (loading || (!fontsLoaded && !fontsError)) return <View style={s.center}><ActivityIndicator color="#078F82" /></View>;
  if (!allowed) return <View style={s.center}><Text style={s.info}>Authorized {mode} account required.</Text></View>;

  const row = (r: DonationRow) => <Pressable key={r.id}
    accessibilityRole="button" accessibilityLabel={"View donation from " + donorLabel(r)}
    onPress={() => { setSelectedId(r.id); setView("all"); }}
    style={[s.tableRow, selectedId === r.id && s.selectedRow]}>
    <View style={s.donorCell}><View style={s.avatar}><Ionicons name="person" color="#087F72" size={16}/></View>
      <View style={s.flex}><Text numberOfLines={1} style={s.tableMain}>{donorLabel(r)}</Text>
      <Text numberOfLines={1} style={s.tableSecondary}>{r.campaignTitle || "Donation Campaign"}</Text></View></View>
    <View style={s.amountCell}><Text style={s.tableMain}>{peso(isConfirmed(r) ? amountReceived(r) : r.amount)}</Text>
      <Text numberOfLines={1} style={s.tableSecondary}>{payMode(r)}</Text></View>
    <View style={s.dateCell}><Text style={s.tableSecondary}>{dateText(r.paidAt || r.createdAt)}</Text></View>
    <View style={s.statusCell}><Text style={[s.statusPill, isConfirmed(r) ? s.paidPill :
      r.status === "rejected" ? s.failedPill : s.pendingPill]}>{statusText(r)}</Text></View>
    <Ionicons name="eye-outline" size={18} color="#148577" />
  </Pressable>;

  // The Overview previews are record-level drill-downs, never copies of the navigation tabs.
  const openCampaignRecord = (id: string) => {
    setSelectedCampaignId(id);
    setView("campaigns");
  };
  const campaignList = (items: CampaignRow[], preview: boolean) =>
    <View style={s.panel}>
      <View style={s.panelHeading}>
        <View style={s.flex}>
          <Text style={s.panelTitle}>{preview ? "Published campaign snapshot" : "Campaign register"}</Text>
          <Text style={s.info}>
            {preview
              ? "Select a campaign to inspect its approved goal and funding record."
              : "Select a campaign for its unique funding, source and payment overview."}
          </Text>
        </View>
        <Text style={s.countTag}>{items.length} {preview ? "published" : "records"}</Text>
      </View>
      {items.length ? items.map(c => {
        const target = numeric(c.monetaryGoal);
        const amount = numeric(c.verifiedAmountReceived);
        const percent = target > 0 ? Math.min(100, Math.round(amount / target * 100)) : 0;
        const completed = c.status === "closed" || (target > 0 && amount >= target - 0.01);
        const photo = campaignImage(c);
        return <Pressable
          key={c.id} accessibilityRole="button"
          accessibilityLabel={"Inspect campaign " + (c.title || c.id)}
          onPress={() => openCampaignRecord(c.id)}
          style={[s.campaignItem, selectedCampaignId === c.id && !preview && s.selectedCampaignItem]}
        >
          {photo ? <Image source={{ uri: photo }} style={s.campaignImage}/> :
            <View style={[s.campaignImage, s.fallbackImage]}>
              <Ionicons name="heart-outline" color="#08896E" size={23}/>
            </View>}
          <View style={s.flex}>
            <View style={s.campaignNameRow}>
              <Text style={[s.tableMain, s.campaignName]} numberOfLines={2}>{c.title || "Untitled campaign"}</Text>
              <Text style={[s.campaignStatus, completed ? s.campaignComplete : s.campaignActive]}>
                {completed ? "Goal reached" : c.status === "published" ? "Published" : c.status || "Draft"}
              </Text>
            </View>
            <View style={s.campaignMoneyRow}>
              <Text style={s.tableSecondary}>{peso(amount)} of {target > 0 ? peso(target) : "No approved goal recorded"}</Text>
              <Text style={s.campaignPercent}>{target ? percent + "%" : "—"}</Text>
            </View>
            <View style={s.track}><View style={[s.fill, { width: percent + "%" as any }]}/></View>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#688F82"/>
        </Pressable>;
      }) : <View style={s.smallEmpty}><Ionicons name="heart-outline" size={20} color="#8AA99B"/>
        <Text style={s.info}>No published campaigns are available.</Text></View>}
    </View>;

  const campaignPayments = selectedCampaign ? records.filter(r => r.campaignId === selectedCampaign.id) : [];
  const selectedCampaignPaid = campaignPayments.filter(isConfirmed);
  const selectedCampaignAmount = selectedCampaignPaid.reduce(
    (sum, payment) => sum + amountReceived(payment), 0);
  const campaignDetailsPanel = <View style={s.panel}>
    <View style={s.panelHeading}>
      <Text style={s.panelTitle}>Campaign inspection</Text>
      {selectedCampaign && <SmallButton text="Clear selection" onPress={() => setSelectedCampaignId("")}/>}
    </View>
    {!selectedCampaign ? <View style={s.empty}>
      <Ionicons name="documents-outline" size={30} color="#82A79A"/>
      <Text style={s.emptyTitle}>Select a campaign record</Text>
      <Text style={s.info}>Inspect its approved funding goal, linked assistance source, and transaction records here.</Text>
    </View> : <>
      <Text style={s.inspectorEyebrow}>CAMPAIGN RECORD</Text>
      <Text style={s.inspectorHeading}>{selectedCampaign.title || "Untitled campaign"}</Text>
      <View style={s.inspectorStatus}>
        <Ionicons name="shield-checkmark-outline" color="#0B805F" size={16}/>
        <Text style={s.inspectorStatusText}>{selectedCampaign.status || "Status not recorded"}</Text>
      </View>
      {([
        ["Approved funding goal", selectedCampaign.monetaryGoal ? peso(selectedCampaign.monetaryGoal) : "Not recorded"],
        ["Stored campaign progress", peso(selectedCampaign.verifiedAmountReceived)],
        ["Linked confirmed donations", peso(selectedCampaignAmount)],
        ["Confirmed payment records", String(selectedCampaignPaid.length)],
        ["Pending payment records", String(campaignPayments.filter(r => ["submitted", "payment_pending", "payment_creating"].includes(r.status || "")).length)],
        ["Source assistance request", selectedCampaign.sourceAssistanceRequestId || "Not linked / legacy campaign"],
        ["Campaign ID", selectedCampaign.id],
      ] as const).map(([label, value]) => <View key={label} style={s.detailRow}>
        <Text style={s.detailLabel}>{label}</Text>
        <Text selectable style={s.detailValue}>{value}</Text>
      </View>)}
      <View style={s.inspectorHint}>
        <Ionicons name="information-circle-outline" size={16} color="#557F72"/>
        <Text style={s.inspectorHintText}>Verified donations are not proof of actual settlement to the LGU. Release approval is a separate financial process.</Text>
      </View>
      {mode === "admin" && <SmallButton text="Open Campaign Operations" primary onPress={() =>
        selectedCampaign.sourceAssistanceRequestId
          ? router.push({ pathname: "/(admin)/donation-list", params: {
              assistanceRequestId: selectedCampaign.sourceAssistanceRequestId,
            }} as any)
          : router.push("/(admin)/donation-list" as any)
      } />}
    </>}
  </View>;

  const detailsPanel = <View style={s.panel}>
    <View style={s.panelHeading}>
      <Text style={s.panelTitle}>Transaction details</Text>
      {selected && <SmallButton text="Clear" onPress={() => setSelectedId("")}/>}
    </View>
    {!selected ? <View style={s.empty}>
      <Ionicons name="receipt-outline" size={30} color="#0D9170"/>
      <Text style={s.emptyTitle}>Select a donation</Text>
      <Text style={s.info}>Click a transaction to view its payment record and registered donor.</Text>
    </View> : <>
      <View style={s.donorHeader}>
        {donor?.photoURL || donor?.profilePhotoUrl ?
          <Image source={{ uri: String(donor.photoURL || donor.profilePhotoUrl) }} style={s.profileImage}/> :
          <View style={s.profileImageFallback}><Ionicons name="person" size={22} color="#087F72"/></View>}
        <View style={s.flex}>
          <Text style={s.panelTitle}>{donor?.fullName || donorLabel(selected)}</Text>
          <Text style={s.info}>{donorLoading ? "Loading linked profile…" :
            selected.donorUid ? "Registered donor" : "Unlinked record"}</Text>
        </View>
      </View>
      {([
        ["Campaign", selected.campaignTitle || campaigns.find(c => c.id === selected.campaignId)?.title || "Campaign"],
        ["Requested donation", peso(selected.amount)],
        ["Confirmed received", peso(amountReceived(selected))],
        ["Payment status", statusText(selected)],
        ["Payment source", payMode(selected)],
        ["Payment reference", selected.transactionReference || selected.paymongoCheckoutSessionId || "Not provided"],
        ["Donation record ID", selected.id],
        ["Date", dateText(selected.paidAt || selected.createdAt)],
        ["Donor barangay", donor?.barangay || "Not available"],
      ] as const).map(([label, value]) => <View key={label} style={s.detailRow}>
        <Text style={s.detailLabel}>{label}</Text>
        <Text selectable style={s.detailValue}>{value}</Text>
      </View>)}
      {!!selected.donorNote && <View style={s.note}>
        <Text style={s.detailLabel}>Donor message</Text>
        <Text style={s.tableMain}>{selected.donorNote}</Text>
      </View>}
      {selected.paymentProvider === "paymongo" && selected.paymongoLivemode === false &&
        <Text style={s.testFlag}>TEST TRANSACTION · PayMongo Sandbox · no real funds transferred</Text>}
      {donor && <View style={s.note}><Text style={s.detailLabel}>Linked account</Text>
        <Text style={s.tableMain}>{donor.fullName || donorLabel(selected)}</Text>
        <Text style={s.info}>{donor.email || "Email not available"} · {donor.city || "City not available"}</Text>
      </View>}
      <Text style={s.privacy}>Private ID files, card details and beneficiary wallet numbers are not displayed.</Text>
    </>}
  </View>;

  return <ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator>
    <View style={s.head}>
      <View style={s.flex}>
        <Text style={s.eyebrow}>VOLUNSERVE · LGU DONATIONS</Text>
        <Text style={s.title}>Donations</Text>
        <Text style={s.subtitle}>Manage verified donations, campaigns, and fund records.</Text>
      </View>
      <View style={s.demoLabel}>
        <Ionicons name="flask-outline" size={14} color="#128064"/>
        <Text style={s.demoLabelText}>PayMongo · Test Mode</Text>
      </View>
    </View>
    {!!problem && <Text style={s.error}>{problem}</Text>}

    <View style={s.tabs}>
      {([
        ["overview", "Overview", "grid-outline"],
        ["campaigns", "Campaigns", "heart-outline"],
        ["all", "Transactions", "receipt-outline"],
        ["payouts", "Fund Management", "wallet-outline"],
        ["notifications", "Alerts" + (unreadCount ? " (" + unreadCount + ")" : ""), "notifications-outline"],
      ] as const).map(([key, label, icon]) => <Pressable key={key}
        accessibilityRole="tab" accessibilityState={{selected: view === key}}
        onPress={() => setView(key)} style={[s.tab, view === key && s.tabActive]}>
        <Ionicons name={icon} size={16} color={view === key ? "#08775D" : "#68818B"}/>
        <Text style={[s.tabText, view === key && s.tabTextActive]}>{label}</Text>
      </Pressable>)}
    </View>

    {view === "overview" && <>
      <View style={s.sectionIntro}>
        <View style={s.flex}>
          <Text style={s.sectionEyebrow}>LGU DONATION OPERATIONS</Text>
          <Text style={s.sectionTitle}>Overview</Text>
          <Text style={s.sectionDescription}>
            Donation activity and records requiring review.
          </Text>
        </View>
      </View>
      <View style={s.metrics}>
        {([
          ["Verified test payments", peso(testReceived), "card-outline", "Confirmed test transactions"],
          ["Pending payments", String(pending), "time-outline", "Pending and submitted records"],
          ["Published campaigns", String(campaigns.filter(c => c.status === "published").length),
            "layers-outline", "Published campaign records"],
          ["Confirmed donors", String(donors), "people-outline", "Unique confirmed donor accounts"],
        ] as const).map(([title, value, icon, description]) =>
          <View key={title} style={s.metric}>
            <View style={s.metricLine}>
              <View style={[s.metricIcon,
                title === "Pending payments" && s.metricIconAmber,
                title === "Confirmed donors" && s.metricIconBlue]}>
                <Ionicons name={icon} size={21}
                  color={title === "Pending payments" ? "#AD751A" :
                    title === "Confirmed donors" ? "#176DAB" : "#078C69"}/>
              </View>
              <View style={s.flex}>
                <Text style={s.metricLabel}>{title}</Text>
                <Text style={s.metricValue}>{ready && campaignReady ? value : "…"}</Text>
                <Text style={s.metricDescription}>{description}</Text>
              </View>
            </View>
          </View>)}
      </View>
      <View style={s.overviewSummary}>
        <View style={s.overviewColumn}>
          <View style={s.panel}>
            <View style={s.panelHeading}>
              <View style={s.flex}>
                <Text style={s.panelTitle}>Needs Attention</Text>
                <Text style={s.info}>Records requiring LGU review.</Text>
              </View>
              <Text style={s.reviewCount}>{ready && campaignReady ? reviewItems.length : "—"} flagged</Text>
            </View>
            {!ready || !campaignReady ? <Text style={s.info}>Reviewing records…</Text> :
              reviewItems.length ? <>
                {reviewItems.slice(0, showAllReviews ? reviewItems.length : 3).map(item => {
                  const expanded = expandedReviewKey === item.key;
                  const flaggedCampaign = item.kind === "campaign"
                    ? campaigns.find(c => c.id === item.id) : null;
                  const flaggedDonation = item.kind === "donation"
                    ? records.find(r => r.id === item.id) : null;
                  return <View key={item.key} style={s.reviewItem}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{expanded}}
                      accessibilityLabel={(expanded ? "Collapse " : "Expand ") + item.title + ": " + item.detail}
                      style={[s.reviewRow, expanded && s.reviewRowExpanded]}
                      onPress={() => setExpandedReviewKey(expanded ? "" : item.key)}>
                      <View style={s.reviewIcon}>
                        <Ionicons name={item.icon} size={18} color="#A07835"/>
                      </View>
                      <View style={s.flex}>
                        <Text style={s.reviewTitle}>{item.title}</Text>
                        <Text style={s.reviewDetail} numberOfLines={2}>{item.detail}</Text>
                      </View>
                      <Ionicons name={expanded ? "chevron-up" : "chevron-down"}
                        color="#78938A" size={16}/>
                    </Pressable>
                    {expanded && <View style={s.reviewExpanded}>
                      {flaggedCampaign ? <>
                        <Text style={s.reviewExpandedHeading}>Campaign funding review</Text>
                        <Text style={s.reviewExpandedCopy}>
                          This published record does not have a positive approved monetary goal.
                          Check whether it is a historical or goods-based relief campaign
                          before deciding that a financial goal is required.
                        </Text>
                        <View style={s.reviewDetailRow}>
                          <Text style={s.reviewDetailLabel}>Recorded goal</Text>
                          <Text style={s.reviewDetailValue}>
                            {numeric(flaggedCampaign.monetaryGoal) > 0
                              ? peso(flaggedCampaign.monetaryGoal) : "Not recorded"}
                          </Text>
                        </View>
                        <View style={s.reviewDetailRow}>
                          <Text style={s.reviewDetailLabel}>Assistance source</Text>
                          <Text selectable style={s.reviewDetailValue}>
                            {flaggedCampaign.sourceAssistanceRequestId || "No assistance link recorded"}
                          </Text>
                        </View>
                        <Text style={s.reviewExpandedFoot}>
                          Any changes to a financial goal must follow a verified assistance review.
                          Expanding this item does not change the campaign.
                        </Text>
                      </> : flaggedDonation ? <>
                        <Text style={s.reviewExpandedHeading}>
                          {item.key.startsWith("legacy:") ? "Manual receipt review" : "Payment exception review"}
                        </Text>
                        <Text style={s.reviewExpandedCopy}>
                          {item.key.startsWith("legacy:")
                            ? "This is a submitted manual/legacy donation, not a verified PayMongo payment. An authorized reviewer must inspect actual supporting evidence before confirming receipt."
                            : "This payment was rejected or failed. Check the provider record and payment reference; it is not eligible to increase the confirmed funding total."}
                        </Text>
                        <View style={s.reviewDetailRow}>
                          <Text style={s.reviewDetailLabel}>Record status</Text>
                          <Text style={s.reviewDetailValue}>{statusText(flaggedDonation)}</Text>
                        </View>
                        <View style={s.reviewDetailRow}>
                          <Text style={s.reviewDetailLabel}>Payment source</Text>
                          <Text style={s.reviewDetailValue}>{payMode(flaggedDonation)}</Text>
                        </View>
                        <View style={s.reviewDetailRow}>
                          <Text style={s.reviewDetailLabel}>Record reference</Text>
                          <Text selectable style={s.reviewDetailValue}>
                            {flaggedDonation.transactionReference || flaggedDonation.id}
                          </Text>
                        </View>
                        <Text style={s.reviewExpandedFoot}>
                          This panel provides read-only review context; it cannot approve,
                          reverse, or falsely confirm a payment.
                        </Text>
                      </> : <Text style={s.reviewExpandedCopy}>This record is no longer available.</Text>}
                    </View>}
                  </View>;
                })}
                {reviewItems.length > 3 && <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setShowAllReviews(!showAllReviews);
                    setExpandedReviewKey("");
                  }}
                  style={s.reviewExpandMore}>
                  <Text style={s.reviewExpandMoreText}>
                    {showAllReviews ? "Show fewer flagged records" :
                      "Show all " + reviewItems.length + " flagged records"}
                  </Text>
                  <Ionicons name={showAllReviews ? "chevron-up" : "chevron-down"}
                    color="#0D8366" size={15}/>
                </Pressable>}
              </> : <View style={s.overviewEmpty}>
                <Ionicons name="checkmark-circle-outline" size={22} color="#108565"/>
                <View style={s.flex}>
                  <Text style={s.reviewTitle}>No flagged records in these checks</Text>
                  <Text style={s.reviewDetail}>No published missing goals, legacy submissions awaiting review, or failed/rejected payments. Settlement is reviewed separately.</Text>
                </View>
              </View>}
          </View>
        </View>
        <View style={s.overviewColumn}>
          <View style={s.panel}>
            <View style={s.panelHeading}>
              <View style={s.flex}>
                <Text style={s.panelTitle}>Recent Activity</Text>
                <Text style={s.info}>Latest recorded donation transactions.</Text>
              </View>
            </View>
            {!ready ? <Text style={s.info}>Loading activity…</Text> :
              recentActivity.length ? recentActivity.map(item => <View
                key={item.id} style={s.activityFeedRow}>
                <View style={[s.activityFeedIcon, !isConfirmed(item) && s.activityFeedIconPending]}>
                  <Ionicons name={isConfirmed(item) ? "checkmark-circle-outline" : "time-outline"}
                    color={isConfirmed(item) ? "#0A8C6A" : "#A57830"} size={19}/>
                </View>
                <View style={s.flex}>
                  <Text style={s.reviewTitle} numberOfLines={1}>
                    {item.paymentProvider === "paymongo" && item.paymongoLivemode === false
                      ? "Sandbox payment" : item.paymentProvider !== "paymongo"
                        ? "Legacy donation" : "Payment"}
                  </Text>
                  <Text style={s.reviewDetail} numberOfLines={1}>
                    {item.campaignTitle || "Donation campaign"} · {statusText(item)}
                  </Text>
                  <Text style={s.activityTime}>{dateText(item.paidAt || item.createdAt)}</Text>
                </View>
                <View style={s.activityAmountColumn}>
                  <Text style={s.activityAmount}>{peso(isConfirmed(item) ? amountReceived(item) : item.amount)}</Text>
                </View>
              </View>) : <Text style={s.info}>No donation activity recorded yet.</Text>}
          </View>
        </View>
      </View>
      <View style={[s.panel, s.progressPanel]}>
        <View style={s.panelHeading}>
          <View style={s.progressHeaderLeft}>
            <View style={s.progressHeadingIcon}>
              <Ionicons name="stats-chart-outline" size={19} color="#058764"/>
            </View>
            <View style={s.flex}>
              <Text style={s.panelTitle}>Campaign Progress</Text>
              <Text style={s.info}>Approved fundraising goals and recorded contributions.</Text>
            </View>
          </View>
          <Text style={s.progressCount}>{progressCampaigns.length} funded goal{progressCampaigns.length === 1 ? "" : "s"}</Text>
        </View>
        {!ready || !campaignReady ? <Text style={s.info}>Loading campaign progress…</Text> :
          progressVisible.length ? <>
            <ScrollView horizontal={narrow} showsHorizontalScrollIndicator={false}>
              <View style={s.progressTable}>
                <View style={s.progressTableHead}>
                  <Text style={[s.progressTh, s.progressCampaignCol]}>Campaign</Text>
                  <Text style={[s.progressTh, s.progressAmountCol]}>Goal</Text>
                  <Text style={[s.progressTh, s.progressAmountCol]}>Raised</Text>
                  <Text style={[s.progressTh, s.progressBarCol]}>Progress</Text>
                  <Text style={[s.progressTh, s.progressStatusCol]}>Status</Text>
                  <Text style={[s.progressTh, s.progressDonorCol]}>Donors</Text>
                </View>
                {progressVisible.map(c => {
                  const goal = numeric(c.monetaryGoal);
                  const raised = numeric(c.verifiedAmountReceived);
                  const fraction = goal > 0 ? Math.min(100, raised / goal * 100) : 0;
                  const completed = goal > 0 && raised >= goal - 0.01;
                  const donorCount = campaignDonorCount(c.id);
                  return <View key={c.id} style={s.progressTableRow}>
                    <View style={s.progressCampaignCol}>
                      <Text style={s.progressCampaignName} numberOfLines={2}>
                        {c.title || "Untitled campaign"}
                      </Text>
                    </View>
                    <Text style={[s.progressCell, s.progressAmountCol]}>{peso(goal)}</Text>
                    <Text style={[s.progressCell, s.progressAmountCol]}>{peso(raised)}</Text>
                    <View style={s.progressBarCol}>
                      <View style={s.progressMeter}>
                        <View style={[s.progressMeterFill, {width: (fraction + "%") as any}]}/>
                      </View>
                      <Text style={s.progressPct}>{Math.round(fraction)}%</Text>
                    </View>
                    <View style={s.progressStatusCol}>
                      <Text style={[s.progressStatus, completed ? s.progressReached : s.progressOngoing]}>
                        {completed ? "Goal reached" : c.status === "closed" ? "Closed" : "In progress"}
                      </Text>
                    </View>
                    <Text style={[s.progressCell, s.progressDonorCol]}>{donorCount}</Text>
                  </View>;
                })}
              </View>
            </ScrollView>
            {progressCampaigns.length > 3 && <Pressable accessibilityRole="button"
              onPress={() => setShowAllCampaigns(!showAllCampaigns)}
              style={s.showMoreCampaigns}>
              <Text style={s.showMoreCampaignsText}>
                {showAllCampaigns ? "Show fewer campaigns" : "Show all " + progressCampaigns.length + " campaigns"}
              </Text>
              <Ionicons name={showAllCampaigns ? "chevron-up" : "chevron-down"} size={15} color="#087D60"/>
            </Pressable>}
          </> : <View style={s.overviewEmpty}>
            <Ionicons name="layers-outline" size={22} color="#87A399"/>
            <Text style={s.info}>No campaigns with an approved monetary goal recorded.</Text>
          </View>}
      </View>
    </>}

    {view === "all" && <>
      <View style={s.sectionIntro}>
        <View style={s.flex}>
          <Text style={s.sectionEyebrow}>DONOR PAYMENT RECORDS</Text>
          <Text style={s.sectionTitle}>Transactions</Text>
          <Text style={s.sectionDescription}>Search every donation, verify its payment status, and inspect the associated donor profile.</Text>
        </View>
        <Text style={s.sectionCount}>{records.length} records</Text>
      </View>
      <View style={[s.columns, compact && s.columnsCompact]}>
        <View style={s.mainColumn}>
          <View style={s.panel}>
            <View style={s.panelHeading}>
              <Text style={s.panelTitle}>All donation transactions</Text>
              <Text style={s.info}>{filtered.length} matched</Text>
            </View>
            <TextInput style={s.search} value={search} onChangeText={setSearch}
              placeholder="Search donor, campaign or payment reference"
              placeholderTextColor="#8A9D9B"/>
            <View style={s.searchRow}>
              {(["all", "paid", "pending", "rejected"] as const).map(name =>
                <SmallButton key={name} text={name === "all" ? "All records" :
                  name === "paid" ? "Confirmed" : name === "pending" ? "Pending" : "Failed / Rejected"}
                  primary={statusFilter === name} onPress={() => setStatusFilter(name)}/>)}
            </View>
            {filtered.length ? filtered.slice(0, 100).map(row) :
              <Text style={s.info}>No matching donations.</Text>}
            {filtered.length > 100 && <Text style={s.info}>Showing latest 100 of {filtered.length} donations.</Text>}
          </View>
        </View>
        <View style={[s.detailsColumn, compact && s.detailsColumnCompact]}>{detailsPanel}</View>
      </View>
      <View style={s.slimNote}>
        <Ionicons name="information-circle-outline" color="#47776C" size={16}/>
        <Text style={s.slimNoteText}>
          PayMongo Sandbox confirmed: {peso(testReceived)} · Live confirmed: {peso(liveReceived)} · Other recorded: {peso(otherReceived)}.
          Payment confirmation alone does not establish settled funds.
        </Text>
      </View>
    </>}

    {view === "campaigns" && <>
      <View style={s.sectionIntro}>
        <View style={s.flex}>
          <Text style={s.sectionEyebrow}>VERIFIED FUNDRAISING</Text>
          <Text style={s.sectionTitle}>Campaigns</Text>
          <Text style={s.sectionDescription}>Published and completed cases, approved goals, and recorded donation progress.</Text>
        </View>
      </View>
      <View style={[s.columns, compact && s.columnsCompact]}>
        <View style={s.mainColumn}>
          {campaignList(
            [...campaigns].sort((a, b) => Number(b.status === "published") - Number(a.status === "published")),
            false,
          )}
        </View>
        <View style={[s.detailsColumn, compact && s.detailsColumnCompact]}>{campaignDetailsPanel}</View>
      </View>
    </>}

    {view === "payouts" && <FundReconciliationPanel
      campaigns={campaigns} donations={records}
      ready={ready && campaignReady && !problem}
    />}

    {view === "notifications" && <>
      <View style={s.sectionIntro}>
        <View style={s.flex}>
          <Text style={s.sectionEyebrow}>DONATION NOTIFICATIONS</Text>
          <Text style={s.sectionTitle}>Alerts</Text>
          <Text style={s.sectionDescription}>
            View notification details and acknowledge messages here,
            without being redirected to another tab.
          </Text>
        </View>
        <Text style={s.sectionCount}>{unreadCount} unread</Text>
      </View>
      <View style={[s.columns, compact && s.columnsCompact]}>
        <View style={s.mainColumn}>
          <View style={s.panel}>
            <View style={s.panelHeading}>
              <Text style={s.panelTitle}>Notification inbox</Text>
              <Text style={s.info}>{alerts.length} notifications</Text>
            </View>
            {alerts.length ? alerts.slice(0, 100).map(alert => <Pressable
              key={alert.id}
              style={[s.activity, selectedAlertId === alert.id && s.selectedRow]}
              accessibilityRole="button"
              accessibilityLabel={"Read notification " + (alert.title || "Donation")}
              onPress={() => {
                setSelectedAlertId(alert.id);
                if (!alert.read) void updateDoc(doc(db, "notifications", alert.id), {
                  read: true,
                }).catch(() => {});
              }}>
              <View style={s.alertIcon}>
                <Ionicons name={alert.read ? "notifications-outline" : "notifications"}
                  size={19} color="#098B70"/>
              </View>
              <View style={s.flex}>
                <Text style={s.tableMain}>{alert.title || "Donation update"}</Text>
                <Text style={s.tableSecondary} numberOfLines={2}>
                  {alert.message || "A donation update was recorded."}
                </Text>
                <Text style={s.tableSecondary}>
                  {dateText(alert.createdAt)} · {alert.read ? "Read" : "Unread"}
                </Text>
              </View>
              <Ionicons name={selectedAlertId === alert.id ? "chevron-down" : "chevron-forward"}
                size={18} color="#7C9890"/>
            </Pressable>) : <View style={s.empty}>
              <Ionicons name="notifications-outline" size={31} color="#8EACA2"/>
              <Text style={s.emptyTitle}>No donation alerts</Text>
              <Text style={s.info}>Verified payment alerts will appear here.</Text>
            </View>}
          </View>
        </View>
        <View style={[s.detailsColumn, compact && s.detailsColumnCompact]}>
          <View style={s.panel}>
            <View style={s.panelHeading}>
              <Text style={s.panelTitle}>Alert details</Text>
              {selectedAlert && <SmallButton text="Close" onPress={() => setSelectedAlertId("")}/>}
            </View>
            {!selectedAlert ? <View style={s.empty}>
              <Ionicons name="mail-open-outline" size={30} color="#83A89A"/>
              <Text style={s.emptyTitle}>Select an alert</Text>
              <Text style={s.info}>Its message and linked transaction status will appear here.</Text>
            </View> : <>
              <Text style={s.inspectorEyebrow}>
                {selectedAlert.read ? "ACKNOWLEDGED" : "UNREAD NOTIFICATION"}
              </Text>
              <Text style={s.inspectorHeading}>{selectedAlert.title || "Donation update"}</Text>
              <Text style={s.reviewExpandedCopy}>
                {selectedAlert.message || "A donation update was recorded."}
              </Text>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>Received</Text>
                <Text style={s.detailValue}>{dateText(selectedAlert.createdAt)}</Text>
              </View>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>Linked donation</Text>
                <Text selectable style={s.detailValue}>
                  {selectedAlert.donationId || "No linked payment record"}
                </Text>
              </View>
              {relatedAlertDonation && <>
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>Campaign</Text>
                  <Text style={s.detailValue}>
                    {relatedAlertDonation.campaignTitle || "Donation campaign"}
                  </Text>
                </View>
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>Payment status</Text>
                  <Text style={s.detailValue}>{statusText(relatedAlertDonation)}</Text>
                </View>
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>Recorded amount</Text>
                  <Text style={s.detailValue}>
                    {peso(isConfirmed(relatedAlertDonation)
                      ? amountReceived(relatedAlertDonation) : relatedAlertDonation.amount)}
                  </Text>
                </View>
              </>}
              <Text style={s.privacy}>
                This is a notification review, not a payment verification or financial release action.
              </Text>
            </>}
          </View>
        </View>
      </View>
    </>}

  </ScrollView>;
}

const s = StyleSheet.create({
  screen: {flex:1,backgroundColor:"#F8FAFB"},
  content: {width:"100%",maxWidth:1660,alignSelf:"center",paddingHorizontal:24,paddingTop:20,paddingBottom:55,gap:17},
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  head: {flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:14,paddingBottom:8},
  title: {fontFamily:"AdminInterBold",fontSize:34,letterSpacing:-0.95,color:"#153644",marginTop:6},
  subtitle: {fontFamily:"AdminInterRegular",marginTop:6,color:"#647E90",fontSize:12.6,lineHeight:20},
  notice: { padding: 12, borderRadius: 13, backgroundColor: "#EAF9F2",
    borderWidth: 1, borderColor: "#C6EEDD", flexDirection: "row", gap: 9, alignItems: "center" },
  noticeText: { color: "#276155", flex: 1, fontSize: 11, lineHeight: 17 },
  error: {fontFamily: "AdminInterMedium", color: "#BB2C36", padding: 12, backgroundColor: "#FFF0F1", borderRadius: 9},
  metrics: {flexDirection:"row",flexWrap:"wrap",gap:13},
  metric: {flexGrow:1,flexBasis:210,minWidth:170,paddingVertical:21,paddingHorizontal:17,minHeight:123,borderWidth:1,borderColor:"#E2EAED",backgroundColor:"#FFFFFF",borderRadius:14,shadowColor:"#173F4C",shadowOpacity:0.045,shadowRadius:15,shadowOffset:{width:0,height:6},elevation:1},
  metricValue: {fontFamily:"AdminInterBold",fontSize:24,letterSpacing:-0.5,color:"#153F3B",marginTop:5},
  metricLabel: {fontFamily:"AdminInterSemiBold",fontSize:11.5,color:"#53697F"},
  tabs: {flexDirection:"row",flexWrap:"wrap",gap:8,borderBottomWidth:1,borderBottomColor:"#E1EBEE",paddingBottom:0,marginBottom:3},
  tab: {flexDirection:"row",alignItems:"center",gap:9,paddingVertical:15,paddingHorizontal:17,backgroundColor:"transparent",borderBottomColor:"transparent",borderBottomWidth:2,borderTopLeftRadius:6,borderTopRightRadius:6},
  tabActive: {backgroundColor:"#F1F9F6",borderBottomColor:"#0C8F6F"},
  tabText: {fontFamily:"AdminInterSemiBold",fontSize:11.7,color:"#4D6576"},
  tabTextActive: {color:"#08775D"},
  columns: {flexDirection: "row", alignItems: "flex-start", gap: 15},
  columnsCompact: { flexDirection: "column" },
  mainColumn: {flex: 1, minWidth: 0, gap: 13},
  detailsColumn: {width: 345, maxWidth: "100%"},
  topPanels: {flexDirection: "row", alignItems: "stretch", gap: 15, flexWrap: "wrap"},
  recentColumn: {flexGrow: 1.3, flexBasis: 420, minWidth: 0},
  campaignColumn: {flexGrow: 1, flexBasis: 350, minWidth: 0},
  panel: {backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E1E9ED",borderRadius:15,padding:18,gap:11,shadowColor:"#1D4959",shadowOpacity:0.032,shadowRadius:14,shadowOffset:{width:0,height:5},elevation:1},
  panelHeading: {flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",minHeight:44},
  panelTitle: {fontFamily:"AdminInterBold",fontSize:16.2,color:"#203E50",letterSpacing:-0.22},
  smallButton: {paddingHorizontal: 13, paddingVertical: 10, borderRadius: 9, borderWidth: 1, borderColor: "#CFE7DB", backgroundColor: "#F8FCFA", alignSelf: "center"},
  primaryButton: {backgroundColor: "#098D6C", borderColor: "#098D6C"},
  smallButtonText: {fontFamily: "AdminInterSemiBold", fontSize: 10.6, color: "#0B7C5E"},
  primaryButtonText: { color: "white" },
  info: {fontFamily:"AdminInterRegular",fontSize:11.2,lineHeight:17,color:"#778FA0"},
  tableRow: {flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: "#EAF1EC", paddingVertical: 13, minHeight: 66},
  selectedRow: {backgroundColor: "#F0F9F5", borderRadius: 9, paddingHorizontal: 8},
  donorCell: {flex: 2, flexDirection: "row", gap: 9, alignItems: "center", minWidth: 0},
  avatar: {width: 35, height: 35, borderRadius: 11, justifyContent: "center", alignItems: "center", backgroundColor: "#E6F7EE"},
  amountCell: {flex: 1.2, minWidth: 0},
  dateCell: {flex: 1, minWidth: 0},
  statusCell: {flex: 0.87, alignItems: "flex-start"},
  tableMain: {color: "#284752", fontSize: 11.5, fontFamily: "AdminInterSemiBold"},
  tableSecondary: {color: "#758F94", fontSize: 10, lineHeight: 16, fontFamily: "AdminInterRegular"},
  statusPill: {paddingHorizontal: 9, paddingVertical: 7, borderRadius: 7, overflow: "hidden", fontSize: 10.2, fontFamily: "AdminInterSemiBold"},
  paidPill: { backgroundColor: "#E2F8EB", color: "#047348" },
  pendingPill: { backgroundColor: "#FFF3D9", color: "#B36B0B" },
  failedPill: { backgroundColor: "#FFEBEC", color: "#B42330" },
  campaignItem: {flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#EAF1EB"},
  campaignImage: {width: 68, height: 58, borderRadius: 10, backgroundColor: "#E8F5EE"},
  fallbackImage: { backgroundColor: "#EAF8F2", alignItems: "center", justifyContent: "center" },
  track: {height: 7, backgroundColor: "#E3EDE7", borderRadius: 9, overflow: "hidden", marginTop: 7},
  fill: {height: "100%", backgroundColor: "#0DA87C", borderRadius: 9},
  searchRow: {flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8},
  search: {backgroundColor: "#F7FAF8", borderRadius: 10, paddingVertical: 13, paddingHorizontal: 14, minWidth: 185, fontSize: 11.5, fontFamily: "AdminInterRegular", borderWidth: 1, borderColor: "#DFECE6", color: "#24484E"},
  donorHeader: {flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10},
  profileImage: { width: 45, height: 45, borderRadius: 24 },
  profileImageFallback: { width: 45, height: 45, borderRadius: 24, backgroundColor: "#E6F9F2",
    alignItems: "center", justifyContent: "center" },
  detailRow: {flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 11, borderBottomWidth: 1, borderBottomColor: "#EDF2EF", paddingVertical: 11},
  detailLabel: {color: "#758E93", fontSize: 10.3, fontFamily: "AdminInterRegular", flex: 1},
  detailValue: {color: "#2F5159", fontSize: 10.6, fontFamily: "AdminInterSemiBold", flex: 1.4, textAlign: "right"},
  note: {backgroundColor: "#F6FAF7", padding: 12, borderRadius: 10, gap: 6},
  privacy: {fontFamily: "AdminInterRegular", fontSize: 10, lineHeight: 17, color: "#7B9193"},
  testFlag: {fontFamily: "AdminInterSemiBold", fontSize: 9.7, color: "#916A2B", backgroundColor: "#FFF7EA", padding: 11, borderRadius: 9},
  empty: {minHeight: 155, justifyContent: "center", alignItems: "center", padding: 17, gap: 9},
  activity: {flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#E8EFEB"},
  balance: { paddingHorizontal: 4 },
  eyebrow: {fontFamily:"AdminInterSemiBold",fontSize:10.5,letterSpacing:1.18,color:"#617C82"},
  demoLabel: {flexDirection:"row",alignItems:"center",gap:7,borderRadius:8,borderWidth:1,borderColor:"#D0E7DC",backgroundColor:"#F0F9F5",paddingHorizontal:12,paddingVertical:10},
  demoLabelText: {fontFamily:"AdminInterSemiBold",fontSize:10.5,color:"#0E8064"},
  sectionIntro: {flexDirection:"row",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginTop:0},
  sectionEyebrow: {fontFamily:"AdminInterSemiBold",fontSize:10,letterSpacing:1.15,color:"#0B8A68"},
  sectionTitle: {fontFamily:"AdminInterBold",fontSize:25,color:"#163847",letterSpacing:-0.55,marginTop:5},
  sectionDescription: {fontFamily:"AdminInterRegular",fontSize:12.2,color:"#708699",lineHeight:20,marginTop:4},
  sectionCount: {fontFamily: "AdminInterSemiBold", fontSize: 10.5, color: "#47816F", padding: 10, borderRadius: 8, backgroundColor: "#EBF7F0"},
  metricTop: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8},
  metricDescription: {fontFamily:"AdminInterRegular",fontSize:10.3,lineHeight:16,color:"#8194A4",marginTop:6},
  workflow: {padding: 19, borderRadius: 15, backgroundColor: "#F9FCFA", borderWidth: 1, borderColor: "#DDEBE3", gap: 14},
  quickGrid: {flexDirection: "row", flexWrap: "wrap", gap: 11},
  quickCard: {flexDirection: "row", alignItems: "center", gap: 10, padding: 13, minWidth: 215, flexBasis: 222, flexGrow: 1, borderWidth: 1, borderColor: "#DEEDE4", borderRadius: 11, backgroundColor: "#FFFFFF"},
  quickIcon: {backgroundColor: "#E7F8EE", borderRadius: 10, width: 42, height: 42, alignItems: "center", justifyContent: "center"},
  quickStep: {fontFamily: "AdminInterSemiBold", fontSize: 9, color: "#09966A", letterSpacing: 0.85},
  quickTitle: {fontFamily: "AdminInterSemiBold", fontSize: 11.2, color: "#295047", marginTop: 3},
  quickDescription: {fontFamily: "AdminInterRegular", fontSize: 9.4, lineHeight: 15.5, color: "#7D9290", marginTop: 3},
  slimNote: {flexDirection: "row", alignItems: "flex-start", gap: 9, borderWidth: 1, borderColor: "#DCEDE2", backgroundColor: "#F1F8F3", padding: 13, borderRadius: 11},
  slimNoteText: {flex: 1, fontFamily: "AdminInterRegular", fontSize: 10.2, lineHeight: 17, color: "#587C72"},
  campaignNameRow: {flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 7},
  campaignName: {flex: 1, minWidth: 120},
  campaignStatus: {fontFamily: "AdminInterSemiBold", fontSize: 9.5, borderRadius: 7, overflow: "hidden", paddingVertical: 6, paddingHorizontal: 9},
  campaignComplete: {color: "#0B7960", backgroundColor: "#E5F8ED"},
  campaignActive: {color: "#0A7A5D", backgroundColor: "#E7F7F0"},
  campaignMoneyRow: {flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 7, marginTop: 5},
  campaignPercent: {fontFamily: "AdminInterSemiBold", fontSize: 10.5, color: "#0B8667"},
  smallEmpty: {flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 15},
  emptyTitle: {fontFamily: "AdminInterSemiBold", fontSize: 12, color: "#325D54"},
  detailsColumnCompact: {width: "100%", maxWidth: "100%"},
  alertIcon: {width: 36, height: 36, borderRadius: 10, backgroundColor: "#EBF8F1", alignItems: "center", justifyContent: "center"},

  countTag: {fontFamily: "AdminInterSemiBold", fontSize: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#EDF8F1", borderRadius: 8, color: "#0C8366"},
  selectedCampaignItem: {backgroundColor: "#F0FAF5", borderRadius: 9, paddingHorizontal: 8},
  inspectorEyebrow: {fontFamily: "AdminInterSemiBold", fontSize: 9.3, color: "#0C8565", letterSpacing: 0.9, marginTop: 7},
  inspectorHeading: {fontFamily: "AdminInterBold", fontSize: 16, lineHeight: 23, color: "#214B4B"},
  inspectorStatus: {flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, backgroundColor: "#E9F8EF", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8},
  inspectorStatusText: {fontFamily: "AdminInterSemiBold", fontSize: 10, textTransform: "capitalize", color: "#167458"},
  inspectorHint: {flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#F3F9F5", padding: 11, borderRadius: 10, marginTop: 4},
  inspectorHintText: {flex: 1, fontFamily: "AdminInterRegular", fontSize: 10, lineHeight: 16, color: "#608277"},

  overviewSummary: {flexDirection:"row",flexWrap:"wrap",gap:15,alignItems:"stretch"},
  overviewColumn: {flexBasis:390,flexGrow:1,minWidth:0},
  reviewCount: {fontFamily:"AdminInterSemiBold",fontSize:10.8,color:"#9C691E",backgroundColor:"#FFF4E6",paddingHorizontal:12,paddingVertical:8,borderRadius:10},
  reviewRow: {flexDirection:"row",alignItems:"center",gap:10,paddingVertical:13,borderBottomWidth:0},
  reviewIcon: {width:39,height:39,borderRadius:11,alignItems:"center",justifyContent:"center",backgroundColor:"#FFF3E7"},
  reviewTitle: {fontFamily:"AdminInterSemiBold",fontSize:11.7,color:"#264559"},
  reviewDetail: {fontFamily:"AdminInterRegular",fontSize:10.5,lineHeight:16,color:"#7A8EA2",marginTop:4},
  reviewFoot: {fontFamily: "AdminInterRegular", color: "#946F37", fontSize: 10, lineHeight: 16, paddingTop: 4},
  overviewEmpty: {flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 15},
  activityFeedRow: {flexDirection:"row",alignItems:"center",gap:10,paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#E8EFF1"},
  activityFeedIcon: {width:40,height:40,borderRadius:11,alignItems:"center",justifyContent:"center",backgroundColor:"#EAF9F2"},
  activityFeedIconPending: {backgroundColor:"#FFF3E5"},
  activityTime: {fontFamily:"AdminInterRegular",fontSize:9.7,color:"#90A1B0",marginTop:5},
  activityAmountColumn: {alignItems: "flex-end", gap: 6},
  activityAmount: {fontFamily:"AdminInterBold",fontSize:11.7,color:"#214455"},

  reviewItem: {borderBottomWidth:1,borderBottomColor:"#E8EFF1"},
  reviewRowExpanded: {backgroundColor:"#F5FAF8",borderRadius:8},
  reviewExpanded: {paddingHorizontal: 15, paddingVertical: 13, borderRadius: 9, backgroundColor: "#F8FCFA", borderWidth: 1, borderColor: "#E1EEE7", marginBottom: 10, gap: 8},
  reviewExpandedHeading: {fontFamily: "AdminInterSemiBold", fontSize: 11.8, color: "#275148"},
  reviewExpandedCopy: {fontFamily: "AdminInterRegular", fontSize: 10.7, lineHeight: 18, color: "#607F77"},
  reviewDetailRow: {flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start", paddingVertical: 6},
  reviewDetailLabel: {fontFamily: "AdminInterRegular", fontSize: 10.2, color: "#738B83", flex: 1},
  reviewDetailValue: {fontFamily: "AdminInterSemiBold", fontSize: 10.2, color: "#31574F", flex: 1.4, textAlign: "right"},
  reviewExpandedFoot: {fontFamily: "AdminInterRegular", fontSize: 9.8, lineHeight: 16, color: "#80968E", marginTop: 4},
  reviewExpandMore: {flexDirection:"row",alignItems:"center",justifyContent:"flex-start",gap:7,paddingVertical:12},
  reviewExpandMoreText: {fontFamily:"AdminInterSemiBold",fontSize:10.9,color:"#0A8668"},

  metricLine: {flexDirection:"row",alignItems:"flex-start",gap:13},
  metricIcon: {width:49,height:49,borderRadius:12,backgroundColor:"#E8F8EF",alignItems:"center",justifyContent:"center"},
  metricIconAmber: {backgroundColor:"#FFF4E3"},
  metricIconBlue: {backgroundColor:"#E7F4FF"},
  progressPanel: {paddingVertical:18,paddingHorizontal:19,gap:13},
  progressHeaderLeft: {flexDirection:"row",alignItems:"center",gap:12,flex:1,minWidth:220},
  progressHeadingIcon: {width:39,height:39,borderRadius:10,backgroundColor:"#E8F8F0",justifyContent:"center",alignItems:"center"},
  progressCount: {fontFamily:"AdminInterSemiBold",fontSize:10.7,color:"#0E8163"},
  progressTable: {width:"100%",minWidth:730,borderWidth:1,borderColor:"#E3EAEE",borderRadius:10,overflow:"hidden"},
  progressTableHead: {flexDirection:"row",alignItems:"center",backgroundColor:"#F3F7F9",paddingHorizontal:13,minHeight:38,gap:12},
  progressTableRow: {flexDirection:"row",alignItems:"center",gap:12,paddingVertical:15,paddingHorizontal:13,borderTopColor:"#EBF0F2",borderTopWidth:1,backgroundColor:"#FFFFFF",minHeight:55},
  progressTh: {fontFamily:"AdminInterSemiBold",fontSize:10,color:"#6F8495"},
  progressCampaignCol: {flex:2.25,minWidth:130},
  progressCampaignName: {fontFamily:"AdminInterSemiBold",fontSize:10.8,color:"#284656"},
  progressAmountCol: {flex:1,minWidth:74},
  progressCell: {fontFamily:"AdminInterMedium",fontSize:10.8,color:"#32566B"},
  progressBarCol: {flex:1.72,minWidth:118,flexDirection:"row",alignItems:"center",gap:9},
  progressMeter: {flex:1,height:8,backgroundColor:"#E4EAF0",borderRadius:10,overflow:"hidden"},
  progressMeterFill: {height:"100%",backgroundColor:"#0CA878",borderRadius:10},
  progressPct: {fontFamily:"AdminInterSemiBold",fontSize:10,color:"#567181",minWidth:29,textAlign:"right"},
  progressStatusCol: {flex:1.12,minWidth:82},
  progressStatus: {fontFamily:"AdminInterSemiBold",fontSize:9.7,paddingVertical:6,paddingHorizontal:9,alignSelf:"flex-start",borderRadius:12,overflow:"hidden"},
  progressReached: {backgroundColor:"#DCF6E4",color:"#087749"},
  progressOngoing: {backgroundColor:"#E7F2FA",color:"#2876A5"},
  progressDonorCol: {flex:0.55,minWidth:41},
  showMoreCampaigns: {alignSelf:"flex-end",flexDirection:"row",gap:7,alignItems:"center",paddingVertical:10,paddingHorizontal:9},
  showMoreCampaignsText: {fontFamily:"AdminInterSemiBold",fontSize:10.8,color:"#0E8062"},

});
