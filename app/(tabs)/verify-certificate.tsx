import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { db } from "../../lib/firebase";
const BRAND_LOGO = require("../../assets/images/logo.png");
const C = {
  bg: "#F4F8FB",
  paper: "#FFFFFF",
  heading: "#12314B",
  text: "#24445C",
  muted: "#6B8093",
  lightMuted: "#8B9BA9",
  teal: "#008E84",
  tealDark: "#00717D",
  tealBright: "#04A99A",
  mint: "#EAF9F4",
  mintBorder: "#D1ECE4",
  border: "#DFE8EE",
  tile: "#F6F9FB",
  cream: "#FFFEF8",
  orange: "#E9A82D",
  red: "#AE3240",
  redPale: "#FFF1F1",
};
type ContributionBreakdown = { type?: string; count?: number };
type PublicCertificate = {
  certificateId?: string;
  certificateType?: string;
  certificateTitle?: string;
  volunteerName?: string;
  verifiedHelps?: number;
  fullVerifiedHelps?: number;
  partialVerifiedHelps?: number;
  verifiedEmergencyResponses?: number;
  verifiedServiceMinutes?: number;
  peopleHelped?: number;
  contributionBreakdown?: ContributionBreakdown[];
  contributionCount?: number;
  eventId?: string;
  eventTitle?: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  eventBarangay?: string;
  issuerOrganization?: string;
  issuedByName?: string;
  issuedByRole?: string;
  verificationStatus?: string;
  snapshotHash?: string;
  issuedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  revocationReason?: string;
  revokedAt?: unknown;
  revokedByName?: string;
};
type IconName = React.ComponentProps<typeof Ionicons>["name"];
function safeText(value: unknown, fallback = "Not provided") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}
function formatDate(value: unknown) {
  if (!value) return "Not provided";
  let time = Number.NaN;
  if (typeof (value as any)?.toMillis === "function") {
    time = (value as any).toMillis();
  } else if (typeof (value as any)?.toDate === "function") {
    time = (value as any).toDate().getTime();
  } else if (value instanceof Date) {
    time = value.getTime();
  } else if (typeof value === "number") {
    time = value;
  } else if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      }
      return "Not provided";
    }
    time = new Date(value).getTime();
  }
  if (!Number.isFinite(time) || time <= 0) return "Not provided";
  return new Date(time).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
function formatMinutes(value: unknown) {
  const total = Number(value);
  const safe = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
  if (safe < 60) return `${safe} minute${safe === 1 ? "" : "s"}`;
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours} hour${hours === 1 ? "" : "s"}${minutes ? ` ${minutes} minute${minutes === 1 ? "" : "s"}` : ""}`;
}
function normalizeCertificateId(value: string) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}
function extractCertificateId(rawValue: string) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  const direct = normalizeCertificateId(raw);
  if (/^[A-Z0-9-]{6,80}$/.test(direct)) return direct;
  try {
    const match = raw.match(/[?&]certificateId=([^&#]+)/i);
    if (match?.[1]) {
      const id = normalizeCertificateId(decodeURIComponent(match[1]));
      if (/^[A-Z0-9-]{6,80}$/.test(id)) return id;
    }
  } catch {
    return "";
  }
  return "";
}
function DetailTile({ icon, label, value, wide = false, compact = false }: {
  icon: IconName;
  label: string;
  value: string;
  wide?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.detailTile, compact ? styles.detailTileMobile : wide ? styles.detailTileWide : styles.detailTileDesktop]}>
      <View style={styles.detailTileTop}>
        <Ionicons name={icon} size={18} color={C.tealDark} />
        <Text style={styles.detailTileLabel}>{label}</Text>
      </View>
      <Text selectable style={styles.detailTileValue}>{value}</Text>
    </View>
  );
}
function SummaryTile({ icon, title, description, negative = false, compact = false }: {
  icon: IconName;
  title: string;
  description: string;
  negative?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.summaryTile, compact && styles.summaryTileMobile, negative && styles.summaryNegative]}>
      <View style={styles.summaryLine}>
        <Ionicons name={icon} size={19} color={negative ? C.red : "#09A470"} />
        <Text style={[styles.summaryTitle, negative && styles.redText]}>{title}</Text>
      </View>
      <Text style={styles.summaryDescription}>{description}</Text>
    </View>
  );
}
export default function VerifyCertificateScreen() {
  const params = useLocalSearchParams<{ certificateId?: string | string[] }>();
  const { width } = useWindowDimensions();
  const [paneWidth, setPaneWidth] = useState(width);
  const compact = paneWidth < 790;
  const veryNarrow = paneWidth < 545;
  const routeValue = useMemo(() => {
    const value = params.certificateId;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }, [params.certificateId]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [certificate, setCertificate] = useState<PublicCertificate | null>(null);
  const [verifiedId, setVerifiedId] = useState("");
  const activeRequest = useRef(0);
  const verifyCertificateByValue = useCallback(async (rawValue: string) => {
    const request = ++activeRequest.current;
    const id = extractCertificateId(rawValue);
    setCertificate(null);
    setError("");
    setVerifiedId("");
    if (!id) {
      setLoading(false);
      setError("Enter a valid VolunServe Certificate ID or verification link.");
      return;
    }
    setInputValue(id);
    setLoading(true);
    try {
      const snapshot = await getDoc(doc(db, "publicCertificateVerifications", id));
      if (request !== activeRequest.current) return;
      if (!snapshot.exists()) {
        setError("No VolunServe certificate record was found with this ID.");
        return;
      }
      const record = snapshot.data() as PublicCertificate;
      const recordId = normalizeCertificateId(String(record.certificateId || snapshot.id));
      if (recordId !== id) {
        setError("The verification record ID does not match the requested Certificate ID.");
        return;
      }
      setCertificate({ ...record, certificateId: recordId });
      setVerifiedId(recordId);
    } catch (problem: any) {
      if (request !== activeRequest.current) return;
      console.error("Certificate verification failed:", problem);
      setError("Unable to verify this certificate right now. Please try again.");
    } finally {
      if (request === activeRequest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (routeValue) void verifyCertificateByValue(routeValue);
  }, [routeValue, verifyCertificateByValue]);
  const clearVerification = () => {
    ++activeRequest.current;
    setInputValue("");
    setLoading(false);
    setCertificate(null);
    setVerifiedId("");
    setError("");
  };
  const status = String(certificate?.verificationStatus || "").trim().toLowerCase();
  const isIssued = status === "issued";
  const isRevoked = status === "revoked";
  const isCommunity = certificate?.certificateType === "community_event_participation";
  const certTitle = safeText(
    certificate?.certificateTitle,
    isCommunity ? "Certificate of Participation" : "Certificate of Volunteer Service",
  );
  const service = formatMinutes(certificate?.verifiedServiceMinutes);
  const eventDate = formatDate(certificate?.eventDate);
  const issuedDate = formatDate(certificate?.issuedAt || certificate?.createdAt);
  const recipient = safeText(certificate?.volunteerName, "Volunteer");
  const subjectTitle = safeText(certificate?.eventTitle, "Community Event");
  const rawLocation = safeText(certificate?.eventLocation, "");
  const rawBarangay = safeText(certificate?.eventBarangay, "");
  const eventLocation = rawBarangay && !rawLocation.toLowerCase().includes(rawBarangay.toLowerCase())
    ? [rawBarangay, rawLocation].filter(Boolean).join(", ")
    : rawLocation || "Not provided";
  const issuer = safeText(certificate?.issuedByName, "VolunServe (automated)");
  const organization = safeText(certificate?.issuerOrganization, "VolunServe");
  const certificateId = safeText(certificate?.certificateId || verifiedId, "—");
  return (
    <ScrollView
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        if (Math.abs(next - paneWidth) > 1) setPaneWidth(next);
      }}
      style={styles.screen}
      contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentMobile]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      <View style={styles.page}>
        <View style={[styles.pageHeader, compact && styles.headerCompact]}>
          <View style={styles.headerContent}>
            <View style={styles.eyebrowPill}>
              <Text style={styles.eyebrowText}>PUBLIC VERIFICATION</Text>
            </View>
            <Text style={[styles.pageTitle, veryNarrow && styles.pageTitleSmall]}>Verify Certificate</Text>
            <Text style={styles.pageSubtitle}>
              Verify a VolunServe Community Event participation or Volunteer Service certificate using its unique ID. Only an issued record is valid.
            </Text>
          </View>
          {!compact && (
            <View style={styles.headerIllustration}>
              <View style={styles.decoLeafOne} />
              <View style={styles.decoLeafTwo} />
              <View style={styles.decoDocument}>
                <Image source={BRAND_LOGO} style={styles.headerLogo} resizeMode="contain" />
                <View style={styles.decoLines}>
                  <View style={styles.decoLineLong} />
                  <View style={styles.decoLineShort} />
                  <View style={styles.decoLineLong} />
                </View>
              </View>
              <View style={styles.decoMedal}>
                <Ionicons name="star" size={23} color="#FFFFFF" />
              </View>
            </View>
          )}
        </View>
        <View style={styles.searchCard}>
          <Text style={styles.inputLabel}>CERTIFICATE ID</Text>
          <TextInput
            accessibilityLabel="Certificate ID or verification link"
            value={inputValue}
            onChangeText={(value) => { ++activeRequest.current; setInputValue(value); setError(""); setCertificate(null); setVerifiedId(""); setLoading(false); }}
            placeholder="Enter Certificate ID or verification link"
            placeholderTextColor={C.lightMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => { void verifyCertificateByValue(inputValue); }}
            style={styles.input}
          />
          <Text style={styles.inputHint}>Enter the certificate ID or paste a VolunServe verification link.</Text>
          <View style={[styles.actionRow, veryNarrow && styles.actionRowMobile]}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={loading}
              onPress={() => { void verifyCertificateByValue(inputValue); }}
              style={[styles.verifyButton, loading && styles.disabledButton]}
            >
              {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="shield-checkmark-outline" size={19} color="#FFFFFF" />}
              <Text style={styles.verifyText}>{loading ? "Verifying..." : "Verify Certificate"}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={clearVerification} style={[styles.clearButton, veryNarrow && styles.clearButtonMobile]}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
        {!!error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={25} color={C.red} />
            <View style={styles.errorBody}>
              <Text style={styles.errorTitle}>Certificate Not Verified</Text>
              <Text style={styles.errorDetail}>{error}</Text>
            </View>
          </View>
        )}
        {!!certificate && (
          <View style={styles.resultCard}>
            <View style={[styles.resultHeader, isRevoked ? styles.resultHeaderRed : !isIssued ? styles.resultHeaderNeutral : null, veryNarrow && styles.resultHeaderMobile]}>
              <View style={[styles.resultIcon, isRevoked && styles.resultIconRed]}>
                <Ionicons name={isRevoked ? "alert-circle-outline" : isIssued ? "shield-checkmark-outline" : "information-circle-outline"} size={29} color={isRevoked ? C.red : C.teal} />
              </View>
              <View style={styles.resultHeadingCopy}>
                <Text style={[styles.resultTitle, isRevoked && styles.redText]}>
                  {isIssued ? "Verified Certificate" : isRevoked ? "Certificate Revoked" : "Certificate Record Found"}
                </Text>
                <Text style={styles.resultDescription}>
                  {isIssued
                    ? "This Certificate ID matches an issued VolunServe public verification record."
                    : isRevoked
                      ? "This record exists but has been revoked. It is no longer a valid certificate."
                      : "This record exists, but its status is not ISSUED. It must not be treated as verified."}
                </Text>
              </View>
              <View style={[styles.statusPill, !isIssued && (isRevoked ? styles.statusPillRed : styles.statusPillNeutral)]}>
                <Ionicons name={isIssued ? "checkmark-circle" : isRevoked ? "close-circle" : "information-circle"} size={16} color={isIssued ? "#057A54" : isRevoked ? C.red : C.muted} />
                <Text style={[styles.statusPillText, !isIssued && (isRevoked ? styles.redText : styles.neutralText)]}>
                  {isIssued ? "ISSUED" : isRevoked ? "REVOKED" : "NOT VERIFIED"}
                </Text>
              </View>
            </View>
            <View style={[styles.resultBody, compact && styles.resultBodyCompact]}>
              <View style={styles.previewFrame}>
                <View style={[styles.paperCard, veryNarrow && styles.paperCardNarrow]}>
                <View style={styles.paperEdge} />
                <View style={styles.paperLine} />
                <View style={styles.paperTopBar} />
                <View style={[styles.paperContent, compact && styles.paperContentCompact]}>
                  <View style={[styles.paperBrandRow, veryNarrow && styles.paperBrandMobile]}>
                    <View style={styles.paperBrand}>
                      <Image source={BRAND_LOGO} style={styles.paperLogo} resizeMode="contain" />
                      <View>
                        <Text style={styles.paperBrandName}>VolunServe</Text>
                        <Text style={styles.paperBrandSubtitle}>Community Volunteer Platform</Text>
                      </View>
                    </View>
                    <View style={styles.paperRoundSeal}><Text style={styles.sealBig}>VS</Text><Text style={styles.sealSmall}>RECORD</Text></View>
                  </View>
                  <View style={styles.paperMain}>
                    <Text style={[styles.paperTitle, veryNarrow && styles.paperTitleMobile]}>{certTitle.toUpperCase()}</Text>
                    <Text style={styles.paperCaption}>{isCommunity ? "This certifies that" : "Issued in recognition of verified volunteer service by"}</Text>
                    <Text style={[styles.paperVolunteer, veryNarrow && styles.paperVolunteerMobile]}>{recipient.toUpperCase()}</Text>
                    <View style={styles.paperRule} />
                    {isCommunity ? (
                      <>
                        <Text style={styles.paperCaption}>has actively participated in</Text>
                        <Text style={styles.paperEvent}>{subjectTitle}</Text>
                        {eventDate !== "Not provided" ? <Text style={styles.paperLocation}>held on {eventDate}</Text> : null}
                        {eventLocation !== "Not provided" ? <Text style={styles.paperLocation}>at {eventLocation}</Text> : null}
                        <Text style={styles.paperService}>Verified community service: {service}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.paperCaption}>Verified community emergency-response contributions</Text>
                        <Text style={styles.paperEvent}>{Number(certificate.verifiedHelps || certificate.verifiedEmergencyResponses || 0)} verified responses</Text>
                        <Text style={styles.paperService}>{service} verified service • {Number(certificate.peopleHelped || 0)} people assisted</Text>
                      </>
                    )}
                  </View>
                  <View style={styles.paperFooter}>
                    <Text style={styles.paperFooterIssuer}>{issuer}</Text>
                    <Text style={styles.paperFooterId} numberOfLines={2}>ID: {certificateId}</Text>
                  </View>
                </View>
                {!isIssued && (
                  <View style={styles.paperNotValid}>
                    <Text style={styles.paperNotValidText}>{isRevoked ? "REVOKED — NOT VALID" : "NOT VERIFIED"}</Text>
                  </View>
                )}
                </View>
              </View>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionIcon}><Ionicons name="document-text-outline" size={20} color="#FFFFFF" /></View>
                <Text style={styles.sectionTitle}>Certificate Details</Text>
              </View>
              <View style={styles.detailGrid}>
                <DetailTile icon="finger-print-outline" label="CERTIFICATE ID" value={certificateId} compact={veryNarrow} />
                <DetailTile icon="calendar-outline" label="DATE ISSUED" value={issuedDate} compact={veryNarrow} />
                <DetailTile icon="shield-checkmark-outline" label="ISSUED BY" value={issuer} compact={veryNarrow} />
                {isCommunity ? (
                  <>
                    <DetailTile icon="people-outline" label="EVENT TITLE" value={subjectTitle} compact={veryNarrow} />
                    <DetailTile icon="calendar-number-outline" label="EVENT DATE" value={eventDate} compact={veryNarrow} />
                    <DetailTile icon="time-outline" label="EVENT TIME" value={safeText(certificate.eventTime)} compact={veryNarrow} />
                    <DetailTile icon="location-outline" label="EVENT LOCATION" value={eventLocation} wide compact={veryNarrow} />
                    <DetailTile icon="timer-outline" label="VERIFIED SERVICE DURATION" value={service} compact={veryNarrow} />
                  </>
                ) : (
                  <>
                    <DetailTile icon="checkmark-done-outline" label="VERIFIED RESPONSES" value={String(Number(certificate.verifiedHelps || certificate.verifiedEmergencyResponses || 0))} compact={veryNarrow} />
                    <DetailTile icon="timer-outline" label="VERIFIED SERVICE DURATION" value={service} compact={veryNarrow} />
                    <DetailTile icon="people-outline" label="PEOPLE ASSISTED" value={String(Number(certificate.peopleHelped || 0))} compact={veryNarrow} />
                  </>
                )}
                <DetailTile icon="business-outline" label="ISSUING ORGANIZATION" value={organization} wide compact={veryNarrow} />
              </View>
              {!isCommunity && Array.isArray(certificate.contributionBreakdown) && certificate.contributionBreakdown.length > 0 && (
                <View style={styles.breakdownCard}>
                  <Text style={styles.breakdownHeader}>Verified Service Contributions</Text>
                  {certificate.contributionBreakdown.map((item, index) => (
                    <View style={styles.breakdownItem} key={`${index}-${item.type || "contribution"}`}>
                      <Text style={styles.breakdownName}>{safeText(item.type, "Volunteer Assistance")}</Text>
                      <Text style={styles.breakdownValue}>{Number(item.count || 0)}</Text>
                    </View>
                  ))}
                </View>
              )}
              {isRevoked && (
                <View style={styles.revokedInfo}>
                  <Ionicons name="alert-circle-outline" size={23} color={C.red} />
                  <View style={styles.errorBody}>
                    <Text style={styles.errorTitle}>Revocation Information</Text>
                    <Text style={styles.errorDetail}>Reason: {safeText(certificate.revocationReason)}</Text>
                    <Text style={styles.errorDetail}>Revoked on: {formatDate(certificate.revokedAt)}</Text>
                    {certificate.revokedByName ? <Text style={styles.errorDetail}>Authorized by: {certificate.revokedByName}</Text> : null}
                  </View>
                </View>
              )}
              <View style={styles.sectionHeading}>
                <View style={[styles.sectionIcon, styles.summarySectionIcon]}><Ionicons name="shield-checkmark-outline" size={20} color="#FFFFFF" /></View>
                <Text style={styles.sectionTitle}>Verification Summary</Text>
              </View>
              <View style={styles.summaryGrid}>
                <SummaryTile icon={isIssued ? "checkmark-circle" : "alert-circle"} title={isIssued ? "Valid Record" : "Not a Valid Record"} description={isIssued ? "Certificate ID exists and status is ISSUED." : "Only ISSUED certificates are valid."} compact={veryNarrow} negative={!isIssued} />
                <SummaryTile icon={isIssued ? "checkmark-circle" : "information-circle"} title={isCommunity ? "Event Participation" : "Volunteer Service"} description={isCommunity ? "Public record of completed event participation and verified attendance." : "Public record of verified volunteer service contributions."} compact={veryNarrow} negative={!isIssued} />
                <SummaryTile icon="information-circle" title="VolunServe Record" description="Not an LGU-issued endorsement or government accreditation." compact={veryNarrow} />
              </View>
              <View style={styles.privacyNote}>
                <Ionicons name="information-circle-outline" size={21} color={C.tealDark} />
                <Text style={styles.privacyText}>
                  This lookup checks an exact Certificate ID. Only records marked ISSUED are valid. Identity documents, private contact details, and attendance timestamps are never shown.
                </Text>
              </View>
            </View>
          </View>
        )}
        {!certificate && !error && !loading && (
          <View style={styles.emptyHint}>
            <Ionicons name="shield-checkmark-outline" size={20} color={C.teal} />
            <Text style={styles.emptyHintText}>The verification result will appear here after you enter a Certificate ID.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scrollContent: { flexGrow: 1, alignItems: "center", paddingHorizontal: 24, paddingTop: 20, paddingBottom: 54 },
  scrollContentMobile: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 38 },
  page: { width: "100%", maxWidth: 980, alignSelf: "center" },
  pageHeader: { minHeight: 114, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  headerCompact: { minHeight: 110 },
  headerContent: { flex: 1, maxWidth: 765, paddingRight: 12 },
  eyebrowPill: { backgroundColor: "#E0F5F4", alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 99, marginBottom: 8 },
  eyebrowText: { fontSize: 11, letterSpacing: 1.25, color: C.tealDark, fontWeight: "900" },
  pageTitle: { color: C.heading, fontSize: 32, lineHeight: 40, fontWeight: "900", letterSpacing: -0.65 },
  pageTitleSmall: { fontSize: 29, lineHeight: 38 },
  pageSubtitle: { color: C.muted, fontSize: 14, lineHeight: 22, marginTop: 4, maxWidth: 730 },
  headerIllustration: { width: 185, height: 111, justifyContent: "center", alignItems: "center" },
  decoDocument: { width: 139, height: 93, borderColor: C.tealDark, borderWidth: 6, borderRadius: 10, backgroundColor: C.paper, transform: [{ rotate: "-10deg" }], flexDirection: "row", alignItems: "center", padding: 10 },
  headerLogo: { width: 43, height: 43, marginRight: 8 },
  decoLines: { flex: 1, gap: 7 },
  decoLineLong: { height: 5, backgroundColor: "#CCE1E6", borderRadius: 8 },
  decoLineShort: { height: 5, width: "70%", backgroundColor: "#CCE1E6", borderRadius: 8 },
  decoMedal: { position: "absolute", right: 2, bottom: 7, width: 52, height: 52, borderRadius: 26, backgroundColor: "#F4BE35", borderColor: C.paper, borderWidth: 4, alignItems: "center", justifyContent: "center" },
  decoLeafOne: { position: "absolute", width: 24, height: 55, borderRadius: 60, backgroundColor: "#A9E7DF", left: 2, bottom: 6, transform: [{ rotate: "-32deg" }] },
  decoLeafTwo: { position: "absolute", width: 23, height: 54, borderRadius: 60, backgroundColor: "#23BFA8", right: 7, top: 2, transform: [{ rotate: "26deg" }] },
  searchCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 17, marginBottom: 16 },
  inputLabel: { color: C.muted, letterSpacing: 1, fontWeight: "900", fontSize: 11, marginBottom: 9 },
  input: { borderWidth: 1, borderColor: "#D2E0E9", borderRadius: 10, minHeight: 52, paddingHorizontal: 15, paddingVertical: 11, color: C.heading, fontSize: 14, fontWeight: "700", backgroundColor: "#FBFDFE" },
  inputHint: { fontSize: 12, color: C.muted, marginTop: 10, marginBottom: 13 },
  actionRow: { flexDirection: "row", gap: 9 },
  actionRowMobile: { flexDirection: "column" },
  verifyButton: { backgroundColor: C.tealDark, borderRadius: 10, minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 13 },
  disabledButton: { opacity: 0.6 },
  verifyText: { fontSize: 14, fontWeight: "800", color: C.paper },
  clearButton: { minWidth: 105, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: "#C9D9E2", backgroundColor: C.paper, alignItems: "center", justifyContent: "center", paddingHorizontal: 17 },
  clearButtonMobile: { width: "100%" },
  clearText: { color: C.heading, fontSize: 13, fontWeight: "800" },
  errorCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: C.redPale, borderWidth: 1, borderColor: "#F2C9CA", borderRadius: 14, padding: 18, marginBottom: 16 },
  errorBody: { flex: 1, gap: 5 },
  errorTitle: { color: C.red, fontSize: 15, fontWeight: "800" },
  errorDetail: { color: "#7F4548", lineHeight: 19, fontSize: 13 },
  resultCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.border, borderRadius: 20, overflow: "hidden" },
  resultHeader: { backgroundColor: C.mint, minHeight: 94, paddingHorizontal: 20, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 13 },
  resultHeaderRed: { backgroundColor: C.redPale },
  resultHeaderNeutral: { backgroundColor: C.tile },
  resultHeaderMobile: { flexWrap: "wrap" },
  resultIcon: { width: 57, height: 57, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: "#D3F0E8" },
  resultIconRed: { backgroundColor: "#FADBDC" },
  resultHeadingCopy: { flex: 1, minWidth: 180 },
  resultTitle: { fontSize: 23, lineHeight: 30, fontWeight: "900", color: "#075650" },
  resultDescription: { color: C.text, fontSize: 13, lineHeight: 21, marginTop: 2 },
  statusPill: { flexDirection: "row", gap: 5, alignItems: "center", backgroundColor: "#CEF3E6", borderRadius: 100, paddingHorizontal: 12, paddingVertical: 8 },
  statusPillRed: { backgroundColor: "#F5D8DC" },
  statusPillNeutral: { backgroundColor: "#E6EBEF" },
  statusPillText: { fontSize: 11, fontWeight: "900", color: "#057A54", letterSpacing: 0.5 },
  neutralText: { color: C.muted },
  redText: { color: C.red },
  resultBody: { padding: 22 },
  resultBodyCompact: { padding: 13 },
  previewFrame: { width: "100%", alignItems: "center", paddingHorizontal: 4, paddingTop: 4, marginBottom: 23 },
  paperCard: { backgroundColor: C.cream, borderWidth: 1, borderColor: "#D8E5E5", borderRadius: 11, overflow: "hidden", width: "100%", maxWidth: 735, minHeight: 420, aspectRatio: 1.67, position: "relative", shadowColor: "#183349", shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  paperCardNarrow: { aspectRatio: undefined, minHeight: 480 },
  paperEdge: { position: "absolute", left: 11, right: 11, top: 11, bottom: 11, borderColor: C.tealDark, borderWidth: 1 },
  paperLine: { position: "absolute", left: 16, right: 16, top: 16, bottom: 16, borderColor: "#D8E5D5", borderWidth: 1 },
  paperTopBar: { position: "absolute", top: 0, left: 0, width: "31%", height: 12, backgroundColor: C.tealDark, transform: [{ skewX: "-17deg" }] },
  paperContent: { flex: 1, paddingHorizontal: 34, paddingTop: 22, paddingBottom: 20 },
  paperContentCompact: { paddingHorizontal: 23, paddingTop: 24, paddingBottom: 20 },
  paperBrandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  paperBrandMobile: { alignItems: "flex-start" },
  paperBrand: { flexDirection: "row", alignItems: "center", flexShrink: 1, gap: 9 },
  paperLogo: { width: 52, height: 52 },
  paperBrandName: { color: C.tealDark, fontSize: 18, fontWeight: "900" },
  paperBrandSubtitle: { color: C.muted, fontSize: 9, marginTop: 2 },
  paperRoundSeal: { width: 51, height: 51, borderRadius: 26, borderWidth: 1.5, borderColor: C.tealDark, justifyContent: "center", alignItems: "center" },
  sealBig: { fontFamily: "Georgia", fontSize: 19, fontWeight: "900", color: C.tealDark },
  sealSmall: { fontSize: 7, color: C.tealDark, fontWeight: "800", letterSpacing: 0.8 },
  paperMain: { flex: 1, paddingTop: 13, paddingBottom: 14, justifyContent: "center", alignItems: "center", gap: 7 },
  paperTitle: { fontSize: 24, lineHeight: 29, textAlign: "center", fontWeight: "900", color: C.heading, fontFamily: "Georgia" },
  paperTitleMobile: { fontSize: 18, lineHeight: 24 },
  paperCaption: { color: C.muted, fontSize: 11, textAlign: "center", lineHeight: 17 },
  paperVolunteer: { color: C.heading, fontSize: 25, fontFamily: "Georgia", fontWeight: "900", textAlign: "center", lineHeight: 31 },
  paperVolunteerMobile: { fontSize: 20, lineHeight: 27 },
  paperRule: { height: 1, backgroundColor: "#B7CDC5", width: "70%", marginVertical: 4 },
  paperEvent: { color: C.tealDark, fontSize: 18, fontWeight: "800", textAlign: "center" },
  paperLocation: { fontSize: 10, color: C.text, lineHeight: 15, textAlign: "center" },
  paperService: { fontSize: 10, color: C.muted, textAlign: "center", marginTop: 5 },
  paperFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 10, paddingTop: 10, borderTopWidth: 1, borderColor: "#D7E3DE" },
  paperFooterIssuer: { color: C.muted, fontSize: 9, flexShrink: 1 },
  paperFooterId: { color: C.tealDark, fontSize: 9, textAlign: "right", flexShrink: 1 },
  paperNotValid: { position: "absolute", right: 18, top: 90, borderWidth: 2, borderColor: C.red, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10, transform: [{ rotate: "-12deg" }], backgroundColor: "#FFF8F8F0" },
  paperNotValidText: { fontSize: 11, color: C.red, fontWeight: "900", letterSpacing: 1 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 3, marginBottom: 12 },
  sectionIcon: { width: 33, height: 33, borderRadius: 9, backgroundColor: C.tealDark, alignItems: "center", justifyContent: "center" },
  sectionTitle: { color: C.heading, fontSize: 18, fontWeight: "900" },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 11, marginBottom: 20 },
  detailTile: { backgroundColor: C.tile, borderRadius: 11, padding: 13, minHeight: 81, borderWidth: 1, borderColor: "#EFF4F7" },
  detailTileDesktop: { flexGrow: 1, flexBasis: "29%" },
  detailTileWide: { flexGrow: 2, flexBasis: "60%" },
  detailTileMobile: { width: "100%" },
  detailTileTop: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 7 },
  detailTileLabel: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.65, flexShrink: 1 },
  detailTileValue: { color: C.heading, fontSize: 12.5, fontWeight: "700", lineHeight: 19 },
  breakdownCard: { padding: 17, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 20 },
  breakdownHeader: { color: C.heading, fontWeight: "800", fontSize: 15, marginBottom: 10 },
  breakdownItem: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: C.border, paddingVertical: 8 },
  breakdownName: { color: C.text, fontSize: 12 },
  breakdownValue: { color: C.heading, fontWeight: "800", fontSize: 12 },
  revokedInfo: { flexDirection: "row", gap: 10, padding: 16, backgroundColor: C.redPale, borderRadius: 13, marginBottom: 18 },
  summarySectionIcon: { backgroundColor: "#08A579" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 17 },
  summaryTile: { flexGrow: 1, flexBasis: "29%", minWidth: 150, padding: 13, borderRadius: 11, backgroundColor: "#EFFAF7", minHeight: 89 },
  summaryTileMobile: { width: "100%", flexBasis: "100%" },
  summaryNegative: { backgroundColor: C.redPale },
  summaryLine: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 5 },
  summaryTitle: { fontSize: 12, fontWeight: "800", color: "#075650", flexShrink: 1 },
  summaryDescription: { fontSize: 11, color: C.text, lineHeight: 17 },
  privacyNote: { flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 15, backgroundColor: C.tile, borderRadius: 12, marginBottom: 2 },
  privacyText: { flex: 1, color: C.muted, fontSize: 11, lineHeight: 18 },
  emptyHint: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  emptyHintText: { flex: 1, fontSize: 12, color: C.muted },
});
