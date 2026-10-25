import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { LinearGradient } from "expo-linear-gradient";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { db } from "../../../lib/firebase";
import { useUserSession } from "../../../lib/useUserSession";

type DonationRecord = {
  amount?: number;
  campaignId?: string;
  campaignTitle?: string;
  donationType?: string;
  donorUid?: string;
  createdAt?: any;
  verifiedAt?: any;
  status?: string;
  paymentStatus?: string;
  paymentProvider?: string;
  paymongoLivemode?: boolean;
  transactionReference?: string;
  refNumber?: string;
  rejectionReason?: string;
  rejectedReason?: string;
};

const dateLabel = (input: any) => {
  if (!input) return "Not recorded";
  const ms = typeof input?.toMillis === "function"
    ? input.toMillis()
    : typeof input?.toDate === "function"
      ? input.toDate().getTime()
      : input instanceof Date
        ? input.getTime()
        : typeof input === "number" ? input : 0;
  if (!Number.isFinite(ms) || ms <= 0) return "Not recorded";
  return new Date(ms).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
};

const formatCurrency = (amount: unknown) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number.isFinite(Number(amount)) ? Number(amount) : 0);

function DetailRow({ label, value, mono = false }: {
  label: string; value: string; mono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.mono]} selectable>{value}</Text>
    </View>
  );
}

export default function Receipt() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { width } = useWindowDimensions();
  const { user, loading: sessionLoading } = useUserSession();
  const [record, setRecord] = useState<DonationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fontsLoaded, fontError] = useFonts({
    DonationInterRegular: Inter_400Regular,
    DonationInterMedium: Inter_500Medium,
    DonationInterSemiBold: Inter_600SemiBold,
    DonationInterBold: Inter_700Bold,
  });

  useEffect(() => {
    let active = true;
    if (sessionLoading) return () => { active = false; };
    if (!user || !id || typeof id !== "string") {
      setLoading(false);
      setError("Sign in to view a donation record.");
      return () => { active = false; };
    }
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const snap = await getDoc(doc(db, "donations", id));
        if (!active) return;
        if (!snap.exists()) {
          setRecord(null);
          setError("Donation record not found.");
          return;
        }
        const donation = snap.data() as DonationRecord;
        // Only display the authenticated donor's record when ownership is stored.
        if (donation.donorUid && donation.donorUid !== user.uid) {
          setRecord(null);
          setError("This donation record is not available for this account.");
          return;
        }
        setRecord(donation);
      } catch {
        if (active) {
          setRecord(null);
          setError("Unable to load this donation record. Please check your connection or account permissions.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id, user?.uid, sessionLoading]);

  const back = () => router.push("/(tabs)/donation");
  if (loading || sessionLoading || (!fontsLoaded && !fontError)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#08795D" />
        <Text style={styles.loading}>Loading donation details...</Text>
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.center}>
        <Ionicons name="document-text-outline" size={35} color="#688C82" />
        <Text style={styles.emptyTitle}>Receipt unavailable</Text>
        <Text style={styles.emptyText}>{error || "This donation record could not be found."}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={back} style={styles.backButton}>
          <Ionicons name="arrow-back" size={16} color="#FFFFFF" />
          <Text style={styles.backButtonText}>Back to donations</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status = String(record.status || "submitted").toLowerCase();
  const provider = String(record.paymentProvider || "").toLowerCase();
  const paymongo = provider === "paymongo";
  const verified = paymongo
    ? status === "received" && record.paymentStatus === "paid"
    : ["received", "verified", "completed"].includes(status);
  const declined = status === "rejected" || status === "payment_failed";
  const isTest = paymongo && record.paymongoLivemode === false;
  const stateText = verified ? "Payment verified" : declined ? "Payment not confirmed" : "Verification pending";
  const reference = String(record.transactionReference || record.refNumber || "").trim();
  const title = String(record.campaignTitle || "").trim();
  const displayId = typeof id === "string" ? id : "";
  const wide = width >= 700;

  return (
    <ScrollView
      style={styles.screen}
      showsVerticalScrollIndicator
      contentContainerStyle={[styles.container, !wide && styles.containerMobile]}
    >
      <TouchableOpacity accessibilityRole="button" onPress={back} style={styles.returnLink}>
        <Ionicons name="arrow-back" size={16} color="#087A5C" />
        <Text style={styles.returnText}>Back to donations</Text>
      </TouchableOpacity>

      <View style={styles.receiptShell}>
        <LinearGradient
          colors={["#E4F8ED", "#F9FEFB", "#F3FBF7"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.receiptHeader}
        >
          <View style={styles.headerEmblem}>
            <Ionicons name="receipt-outline" size={26} color="#0A805D" />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>VOLUNSERVE  ·  DONATION RECORD</Text>
            <Text style={styles.title}>Donation receipt</Text>
            <Text style={styles.subtitle}>A record of your community donation and its verification status.</Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={[styles.receiptSummary, !wide && styles.receiptSummaryStacked]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.amountLabel}>DONATION AMOUNT</Text>
              <Text style={styles.amount}>{formatCurrency(record.amount)}</Text>
              <Text style={styles.campaignLabel}>{title || "Donation campaign"}</Text>
            </View>
            <View style={[
              styles.statusChip,
              verified ? styles.statusConfirmed : declined ? styles.statusFailed : styles.statusPending,
            ]}>
              <Ionicons
                name={verified ? "shield-checkmark" : declined ? "alert-circle-outline" : "time-outline"}
                color={verified ? "#08795A" : declined ? "#A33D35" : "#936C2B"}
                size={17}
              />
              <Text style={[
                styles.statusText,
                verified ? styles.statusConfirmedText : declined ? styles.statusFailedText : styles.statusPendingText,
              ]}>{stateText}</Text>
            </View>
          </View>

          {isTest && (
            <View style={styles.testNotice}>
              <Ionicons name="information-circle-outline" size={19} color="#0E7B61" />
              <View style={{ flex: 1 }}>
                <Text style={styles.testTitle}>PayMongo Sandbox · Test transaction</Text>
                <Text style={styles.testText}>This payment uses test mode. No real money was charged, received, or transferred.</Text>
              </View>
            </View>
          )}

          <View style={styles.informationCard}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIcon}>
                <Ionicons name="document-text-outline" size={19} color="#087D5E" />
              </View>
              <Text style={styles.sectionTitle}>Transaction information</Text>
            </View>
            <DetailRow label="Campaign" value={title || "Not recorded"} />
            <DetailRow label="Payment type" value={paymongo ? (isTest ? "PayMongo Sandbox" : "PayMongo") : "Recorded donation"} />
            <DetailRow label="Date submitted" value={dateLabel(record.createdAt)} />
            {!!record.verifiedAt && verified && (
              <DetailRow label="Date verified" value={dateLabel(record.verifiedAt)} />
            )}
            {!!reference && <DetailRow label="Payment reference" value={reference} mono />}
            <DetailRow label="Donation record ID" value={displayId} mono />
            {!!record.campaignId && <DetailRow label="Campaign ID" value={record.campaignId} mono />}
          </View>

          <View style={styles.statusExplanation}>
            <Ionicons
              name={verified ? "checkmark-circle-outline" : declined ? "alert-circle-outline" : "time-outline"}
              size={20}
              color={verified ? "#0A8D6C" : declined ? "#B45342" : "#9B751E"}
            />
            <Text style={styles.explanationText}>
              {verified
                ? isTest
                  ? "This sandbox payment was marked paid after PayMongo verification. It is a test record, not a real-money receipt."
                  : "This donation has been recorded as verified by the authorized payment or donation workflow."
                : declined
                  ? String(record.rejectionReason || record.rejectedReason || "This donation was not confirmed.")
                  : "This payment is not yet verified. It must not be counted as received until the authorized workflow confirms it."}
            </Text>
          </View>

          <Text style={styles.footerNote}>This page displays saved VolunServe donation data. It does not generate an independent payment confirmation or verification code.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F9F7" },
  container: { width: "100%", maxWidth: 920, alignSelf: "center", padding: 24, paddingBottom: 55 },
  containerMobile: { padding: 13, paddingBottom: 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10, padding: 25, backgroundColor: "#F5F9F7" },
  loading: { fontFamily: "DonationInterRegular", fontSize: 12, color: "#627F79" },
  emptyTitle: { fontFamily: "DonationInterBold", fontSize: 20, color: "#1C4147", marginTop: 4 },
  emptyText: { fontFamily: "DonationInterRegular", fontSize: 12, lineHeight: 18, color: "#668287", textAlign: "center" },
  backButton: { flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 17, paddingVertical: 12, marginTop: 13, borderRadius: 10, backgroundColor: "#0A8B69" },
  backButtonText: { fontFamily: "DonationInterSemiBold", fontSize: 12, color: "#FFFFFF" },
  returnLink: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", paddingVertical: 10, marginBottom: 12 },
  returnText: { fontFamily: "DonationInterSemiBold", fontSize: 12, color: "#087A5C" },
  receiptShell: { overflow: "hidden", backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: "#D8EAE1", shadowColor: "#115740", shadowOpacity: 0.07, shadowRadius: 17, shadowOffset: { width: 0, height: 6 }, elevation: 1 },
  receiptHeader: { flexDirection: "row", alignItems: "center", gap: 15, padding: 24, borderBottomWidth: 1, borderColor: "#D8EDE3" },
  headerEmblem: { width: 52, height: 52, borderRadius: 15, backgroundColor: "#DAF4E6", alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontFamily: "DonationInterSemiBold", fontSize: 10, letterSpacing: 1, color: "#087A5A" },
  title: { fontFamily: "DonationInterBold", fontSize: 26, lineHeight: 34, color: "#1C4248", marginTop: 4, letterSpacing: -0.45 },
  subtitle: { fontFamily: "DonationInterRegular", fontSize: 11.5, lineHeight: 18, color: "#57786F", marginTop: 5 },
  content: { padding: 24, gap: 17 },
  receiptSummary: { flexDirection: "row", alignItems: "flex-start", gap: 16, borderBottomWidth: 1, borderColor: "#E6EFEB", paddingBottom: 22 },
  receiptSummaryStacked: { flexDirection: "column" },
  amountLabel: { fontFamily: "DonationInterSemiBold", fontSize: 10, letterSpacing: 0.9, color: "#6D8B85" },
  amount: { fontFamily: "DonationInterBold", fontSize: 31, lineHeight: 42, color: "#183E42", marginTop: 7, fontVariant: ["tabular-nums"] },
  campaignLabel: { fontFamily: "DonationInterMedium", fontSize: 12.5, lineHeight: 19, color: "#466B70", marginTop: 4 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9 },
  statusConfirmed: { backgroundColor: "#E2F5EA" },
  statusPending: { backgroundColor: "#FFF3DA" },
  statusFailed: { backgroundColor: "#FFF0EF" },
  statusText: { fontFamily: "DonationInterSemiBold", fontSize: 11 },
  statusConfirmedText: { color: "#08795A" },
  statusPendingText: { color: "#936C2B" },
  statusFailedText: { color: "#A33D35" },
  testNotice: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 16, borderRadius: 12, backgroundColor: "#EDF9F2", borderWidth: 1, borderColor: "#D8EDE2" },
  testTitle: { fontFamily: "DonationInterSemiBold", fontSize: 12, color: "#1A6753" },
  testText: { fontFamily: "DonationInterRegular", fontSize: 11, lineHeight: 18, color: "#4A7A6C", marginTop: 4 },
  informationCard: { borderRadius: 13, borderWidth: 1, borderColor: "#E0ECE7", backgroundColor: "#FFFFFF", padding: 18 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 },
  sectionIcon: { width: 36, height: 36, backgroundColor: "#E5F6ED", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontFamily: "DonationInterSemiBold", fontSize: 15, color: "#1D414B" },
  detailRow: { flexDirection: "row", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#EFF3F1" },
  detailLabel: { flex: 1, minWidth: 0, fontFamily: "DonationInterRegular", fontSize: 11, lineHeight: 18, color: "#748D8C" },
  detailValue: { flex: 1.5, minWidth: 0, fontFamily: "DonationInterSemiBold", fontSize: 11, lineHeight: 18, color: "#375C62", textAlign: "right" },
  mono: { fontFamily: "DonationInterMedium", fontSize: 10 },
  statusExplanation: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 15, borderRadius: 10, backgroundColor: "#F6FAF8", borderWidth: 1, borderColor: "#E1ECE6" },
  explanationText: { flex: 1, fontFamily: "DonationInterRegular", fontSize: 11.5, lineHeight: 19, color: "#50716B" },
  footerNote: { fontFamily: "DonationInterRegular", fontSize: 10.5, lineHeight: 17, color: "#829591" },
});
