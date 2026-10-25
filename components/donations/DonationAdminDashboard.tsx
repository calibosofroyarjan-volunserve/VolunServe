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
  verifiedAmountReceived?: number; publicPhotoUrls?: string[];
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
  const activeCampaigns = campaigns.filter(c =>
    c.status === "published" &&
    !(Number(c.monetaryGoal || 0) > 0 &&
      Number(c.verifiedAmountReceived || 0) >= Number(c.monetaryGoal || 0) - 0.01),
  );
  const recent = paid.slice(0, 5);
  const unreadCount = alerts.filter(a => !a.read).length;
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

  const campaignList = (items: CampaignRow[], preview: boolean) =>
    <View style={s.panel}>
      <View style={s.panelHeading}>
        <View style={s.flex}>
          <Text style={s.panelTitle}>{preview ? "Open campaigns" : "Campaign register"}</Text>
          {!preview && <Text style={s.info}>Review campaign goals and progress. Approval remains in Campaign Operations.</Text>}
        </View>
        {preview && <SmallButton text="See campaigns" onPress={() => setView("campaigns")} />}
        {!preview && mode === "admin" && <SmallButton text="Manage campaigns" primary
          onPress={() => router.push("/(admin)/donation-list" as any)} />}
      </View>
      {items.length ? items.map(c => {
        const target = numeric(c.monetaryGoal);
        const amount = numeric(c.verifiedAmountReceived);
        const percent = target > 0 ? Math.min(100, Math.round(amount / target * 100)) : 0;
        const completed = c.status === "closed" || (target > 0 && amount >= target - 0.01);
        const photo = campaignImage(c);
        return <View key={c.id} style={s.campaignItem}>
          {photo ? <Image source={{ uri: photo }} style={s.campaignImage}/> :
            <View style={[s.campaignImage, s.fallbackImage]}>
              <Ionicons name="heart-outline" color="#08896E" size={23}/>
            </View>}
          <View style={s.flex}>
            <View style={s.campaignNameRow}>
              <Text style={[s.tableMain, s.campaignName]} numberOfLines={2}>{c.title || "Untitled campaign"}</Text>
              <Text style={[s.campaignStatus, completed ? s.campaignComplete : s.campaignActive]}>
                {completed ? "Goal reached" : c.status === "published" ? "Open" : c.status || "Draft"}
              </Text>
            </View>
            <View style={s.campaignMoneyRow}>
              <Text style={s.tableSecondary}>{peso(amount)} of {peso(target)}</Text>
              <Text style={s.campaignPercent}>{target ? percent + "%" : "—"}</Text>
            </View>
            <View style={s.track}><View style={[s.fill, { width: percent + "%" as any }]}/></View>
          </View>
        </View>;
      }) : <View style={s.smallEmpty}><Ionicons name="heart-outline" size={20} color="#8AA99B"/>
        <Text style={s.info}>No campaigns in this category.</Text></View>}
    </View>;

  const stepLinks: {
    label: string; detail: string; icon: React.ComponentProps<typeof Ionicons>["name"];
    open: () => void;
  }[] = [
    {
      label: "Request review", detail: "Verify evidence and approved assistance needs",
      icon: "shield-checkmark-outline",
      open: () => mode === "admin"
        ? router.push("/(admin)/assistance-requests" as any)
        : setView("campaigns"),
    },
    {
      label: "Campaigns", detail: "Review published needs and approved funding goals",
      icon: "heart-outline",
      open: () => setView("campaigns"),
    },
    {
      label: "Transactions", detail: "Check paid, pending and failed donation records",
      icon: "receipt-outline",
      open: () => setView("all"),
    },
    {
      label: "Fund management", detail: "Review fund status before any release",
      icon: "wallet-outline",
      open: () => setView("payouts"),
    },
  ];

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
        <Text style={s.title}>Donation Management</Text>
        <Text style={s.subtitle}>Verified assistance campaigns, donor payments and transparent fund monitoring.</Text>
      </View>
      <View style={s.demoLabel}>
        <Ionicons name="flask-outline" size={14} color="#128064"/>
        <Text style={s.demoLabelText}>PAYMONGO SANDBOX · DEMO</Text>
      </View>
    </View>
    {!!problem && <Text style={s.error}>{problem}</Text>}

    <View style={s.tabs}>
      {([
        ["overview", "Overview", "grid-outline"],
        ["all", "Transactions", "receipt-outline"],
        ["campaigns", "Campaigns", "heart-outline"],
        ["payouts", "Fund Management", "wallet-outline"],
        ["notifications", "Alerts" + (unreadCount ? " (" + unreadCount + ")" : ""), "notifications-outline"],
      ] as const).map(([key, label, icon]) => <Pressable key={key}
        accessibilityRole="tab" accessibilityState={{selected: view === key}}
        onPress={() => setView(key)} style={[s.tab, view === key && s.tabActive]}>
        <Ionicons name={icon} size={15} color={view === key ? "#FFFFFF" : "#698078"}/>
        <Text style={[s.tabText, view === key && s.tabTextActive]}>{label}</Text>
      </Pressable>)}
    </View>

    {view === "overview" && <>
      <View style={s.sectionIntro}>
        <View style={s.flex}><Text style={s.sectionEyebrow}>ADMIN WORKSPACE</Text>
          <Text style={s.sectionTitle}>Overview</Text>
          <Text style={s.sectionDescription}>Start here for a quick status check, then open the appropriate tab to complete a task.</Text>
        </View>
      </View>
      <View style={s.metrics}>
        {([
          ["Verified test payments", peso(testReceived), "card-outline", "Confirmed sandbox payments only"],
          ["Payments to review", String(pending), "time-outline", "Pending or submitted records"],
          ["Open campaigns", String(activeCampaigns.length), "heart-outline", "Published and accepting donations"],
          ["Confirmed donors", String(donors), "people-outline", "Unique recorded donor accounts"],
        ] as const).map(([name, value, icon, description]) =>
          <View key={name} style={s.metric}>
            <View style={s.metricTop}>
              <Text style={s.metricLabel}>{name}</Text>
              <Ionicons name={icon} size={19} color="#0D8F70"/>
            </View>
            <Text style={s.metricValue}>{ready && campaignReady ? value : "…"}</Text>
            <Text style={s.metricDescription}>{description}</Text>
          </View>)}
      </View>
      <View style={s.workflow}>
        <View style={s.panelHeading}>
          <View style={s.flex}>
            <Text style={s.panelTitle}>Quick workflow</Text>
            <Text style={s.info}>Select the next action. Financial approval and wallet payouts are not enabled in this demo.</Text>
          </View>
        </View>
        <View style={s.quickGrid}>
          {stepLinks.map((step, index) => <Pressable key={step.label}
            accessibilityRole="button" accessibilityLabel={"Open " + step.label}
            onPress={step.open} style={s.quickCard}>
            <View style={s.quickIcon}><Ionicons name={step.icon} color="#0A8C6A" size={21}/></View>
            <View style={s.flex}>
              <Text style={s.quickStep}>STEP 0{index + 1}</Text>
              <Text style={s.quickTitle}>{step.label}</Text>
              <Text style={s.quickDescription}>{step.detail}</Text>
            </View>
            <Ionicons name="arrow-forward-outline" size={17} color="#709687"/>
          </Pressable>)}
        </View>
      </View>
      <View style={s.topPanels}>
        <View style={s.recentColumn}>
          <View style={s.panel}>
            <View style={s.panelHeading}>
              <View style={s.flex}><Text style={s.panelTitle}>Latest verified transactions</Text>
                <Text style={s.info}>Confirmed donations only · click to inspect the record</Text>
              </View>
              <SmallButton text="View transactions" onPress={() => setView("all")}/>
            </View>
            {recent.length ? recent.map(row) : <Text style={s.info}>No confirmed donations yet.</Text>}
          </View>
        </View>
        <View style={s.campaignColumn}>{campaignList(activeCampaigns.slice(0, 3), true)}</View>
      </View>
      <View style={s.slimNote}>
        <Ionicons name="information-circle-outline" color="#47776C" size={16}/>
        <Text style={s.slimNoteText}>
          Demo data: PayMongo Sandbox payments are simulated, not funds in an LGU bank account.
          Legacy/admin-recorded receipts are reviewed separately under Transactions and Fund Management.
        </Text>
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
      {campaignList(
        [...campaigns].sort((a, b) => Number(b.status === "published") - Number(a.status === "published")),
        false,
      )}
    </>}

    {view === "payouts" && <FundReconciliationPanel
      campaigns={campaigns} donations={records}
      ready={ready && campaignReady && !problem}
    />}

    {view === "notifications" && <>
      <View style={s.sectionIntro}>
        <View style={s.flex}>
          <Text style={s.sectionEyebrow}>ADMIN NOTIFICATIONS</Text>
          <Text style={s.sectionTitle}>Donation alerts</Text>
          <Text style={s.sectionDescription}>Confirmed payment events sent to authorized administrators. Select an alert to inspect its donation record.</Text>
        </View>
        <Text style={s.sectionCount}>{unreadCount} unread</Text>
      </View>
      <View style={s.panel}>
        {alerts.length ? alerts.slice(0, 100).map(alert => <Pressable
          key={alert.id} style={[s.activity, !alert.read && s.selectedRow]}
          accessibilityRole="button"
          onPress={() => {
            if (alert.donationId) setSelectedId(alert.donationId);
            setView("all");
            if (!alert.read) void updateDoc(doc(db, "notifications", alert.id), {read: true}).catch(() => {});
          }}>
          <View style={s.alertIcon}>
            <Ionicons name={alert.read ? "notifications-outline" : "notifications"} size={19} color="#098B70"/>
          </View>
          <View style={s.flex}>
            <Text style={s.tableMain}>{alert.title || "Donation confirmed"}</Text>
            <Text style={s.tableSecondary}>{alert.message || "A payment was confirmed."}</Text>
            <Text style={s.tableSecondary}>{dateText(alert.createdAt)} · {alert.read ? "Read" : "Unread"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#7C9890"/>
        </Pressable>) : <View style={s.empty}>
          <Ionicons name="notifications-outline" size={31} color="#8EACA2"/>
          <Text style={s.emptyTitle}>No donation alerts</Text>
          <Text style={s.info}>Verified payment alerts will appear here.</Text>
        </View>}
      </View>
    </>}
  </ScrollView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F3F8FA" },
  content: { width: "100%", maxWidth: 1680, alignSelf: "center", padding: 22, paddingBottom: 60, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  title: { fontSize: 27, fontWeight: "900", color: "#0A283C" },
  subtitle: { marginTop: 5, color: "#637D91", fontSize: 12 },
  notice: { padding: 12, borderRadius: 13, backgroundColor: "#EAF9F2",
    borderWidth: 1, borderColor: "#C6EEDD", flexDirection: "row", gap: 9, alignItems: "center" },
  noticeText: { color: "#276155", flex: 1, fontSize: 11, lineHeight: 17 },
  error: { color: "#BB2C36", padding: 12, backgroundColor: "#FFF0F1", borderRadius: 10 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { flexGrow: 1, flexBasis: 170, minWidth: 148, borderRadius: 15, borderWidth: 1,
    borderColor: "#E1EBEC", backgroundColor: "#FFFFFF", padding: 17, gap: 5 },
  metricValue: { fontSize: 23, fontWeight: "900", color: "#066D56" },
  metricLabel: { fontSize: 11, color: "#587386", fontWeight: "700" },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tab: { paddingVertical: 10, paddingHorizontal: 13, backgroundColor: "white",
    borderColor: "#D9E6E8", borderWidth: 1, borderRadius: 9 },
  tabActive: { backgroundColor: "#008E71", borderColor: "#008E71" },
  tabText: { fontSize: 11, fontWeight: "800", color: "#365168" },
  tabTextActive: { color: "#FFFFFF" },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  columnsCompact: { flexDirection: "column" },
  mainColumn: { flex: 1, minWidth: 0, gap: 13, width: "100%" },
  detailsColumn: { width: 320, maxWidth: "100%" },
  topPanels: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  recentColumn: { flexGrow: 1.3, flexBasis: 370, minWidth: 0 },
  campaignColumn: { flexGrow: 1, flexBasis: 260, minWidth: 0 },
  panel: { backgroundColor: "white", borderColor: "#E1EBEC", borderWidth: 1, borderRadius: 15, padding: 14, gap: 9 },
  panelHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  panelTitle: { fontSize: 15, fontWeight: "900", color: "#152F40" },
  smallButton: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: "#D5E6E4", backgroundColor: "#FFFFFF", alignSelf: "center" },
  primaryButton: { backgroundColor: "#009474", borderColor: "#009474" },
  smallButtonText: { fontSize: 10, color: "#087A69", fontWeight: "800" },
  primaryButtonText: { color: "white" },
  info: { fontSize: 11, lineHeight: 17, color: "#63798A" },
  tableRow: { flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: 1,
    borderBottomColor: "#EEF2F4", paddingVertical: 10 },
  selectedRow: { backgroundColor: "#EFFBF6", borderRadius: 9, paddingHorizontal: 5 },
  donorCell: { flex: 2, flexDirection: "row", gap: 9, alignItems: "center", minWidth: 0 },
  avatar: { width: 33, height: 33, borderRadius: 17, justifyContent: "center", alignItems: "center", backgroundColor: "#E7F8F2" },
  amountCell: { flex: 1.35, minWidth: 0 },
  dateCell: { flex: 1.1, minWidth: 0 },
  statusCell: { flex: 0.9, alignItems: "flex-start" },
  tableMain: { color: "#183A4C", fontSize: 11.5, fontWeight: "800" },
  tableSecondary: { color: "#73899B", fontSize: 9.5, lineHeight: 15 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, overflow: "hidden",
    fontSize: 10, fontWeight: "800" },
  paidPill: { backgroundColor: "#E2F8EB", color: "#047348" },
  pendingPill: { backgroundColor: "#FFF3D9", color: "#B36B0B" },
  failedPill: { backgroundColor: "#FFEBEC", color: "#B42330" },
  campaignItem: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: "#F0F4F5" },
  campaignImage: { width: 76, height: 55, borderRadius: 9 },
  fallbackImage: { backgroundColor: "#EAF8F2", alignItems: "center", justifyContent: "center" },
  track: { height: 7, backgroundColor: "#E2EAF0", borderRadius: 9, overflow: "hidden", marginTop: 5 },
  fill: { height: "100%", backgroundColor: "#04AC82", borderRadius: 9 },
  searchRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  search: { backgroundColor: "#F5F8F9", borderRadius: 9, paddingVertical: 9,
    paddingHorizontal: 10, minWidth: 175, flexGrow: 1, fontSize: 11, color: "#193D4C" },
  donorHeader: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 8 },
  profileImage: { width: 45, height: 45, borderRadius: 24 },
  profileImageFallback: { width: 45, height: 45, borderRadius: 24, backgroundColor: "#E6F9F2",
    alignItems: "center", justifyContent: "center" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    gap: 9, borderBottomWidth: 1, borderBottomColor: "#F0F3F4", paddingVertical: 8 },
  detailLabel: { color: "#72869A", fontSize: 10, flex: 1 },
  detailValue: { color: "#233747", fontSize: 10.5, fontWeight: "700", flex: 1.4, textAlign: "right" },
  note: { backgroundColor: "#F5F9FA", padding: 10, borderRadius: 9, gap: 6 },
  privacy: { fontSize: 10, lineHeight: 16, color: "#6F8491" },
  testFlag: { fontSize: 10, color: "#9D5200", backgroundColor: "#FFF7E7",
    padding: 9, borderRadius: 8, fontWeight: "800" },
  empty: { minHeight: 165, justifyContent: "center", alignItems: "center", padding: 15, gap: 10 },
  activity: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: "#E6EEEF" },
  balance: { paddingHorizontal: 4 },
});
