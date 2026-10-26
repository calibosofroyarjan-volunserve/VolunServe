import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { db } from "../../lib/firebase";

import {
  isApprovedProfile,
} from "../../lib/firebaseAuth";

import {
  useUserSession,
} from "../../lib/useUserSession";

const VOLUNSERVE_BADGE = require("../../assets/images/logo.png");

type ContributionBreakdown = {
  type?: string;
  count?: number;
};

type CertificateRecord = {
  id: string;

  certificateId?: string;

  certificateType?: string;
  certificateTitle?: string;

  userId?: string;
  volunteerId?: string;
  volunteerName?: string;

  verifiedHelps?: number;

  fullVerifiedHelps?: number;
  partialVerifiedHelps?: number;

  verifiedEmergencyResponses?: number;

  verifiedServiceMinutes?: number;

  peopleHelped?: number;

  contributionBreakdown?:
    ContributionBreakdown[];

  contributionIds?: string[];

  contributionCount?: number;

  snapshotHash?: string;

  verificationStatus?: string;

  issuedBy?: string;
  issuedByUid?: string;
  issuedByName?: string;
  issuedByRole?: string;

  issuerOrganization?: string;

  issuedAt?: any;
  createdAt?: any;
  updatedAt?: any;

  // Verified Community Event Certificate of Participation
  eventId?: string;
  eventTitle?: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  eventBarangay?: string;
  source?: string;
  participationId?: string;
  checkedInAt?: any;
  checkedOutAt?: any;

  // Legacy event certificate support
  name?: string;
  task?: string;
  date?: any;
};

// ============================================================
// HELPERS
// ============================================================

const toMillis = (
  value: any,
) => {
  if (!value) {
    return 0;
  }

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value
      .toDate()
      .getTime();
  }

  if (
    value instanceof Date
  ) {
    return value.getTime();
  }

  if (
    typeof value ===
    "number"
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    const parsed =
      new Date(
        value,
      ).getTime();

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : 0;
  }

  return 0;
};

const formatDate = (
  value: any,
) => {
  const milliseconds =
    toMillis(value);

  if (!milliseconds) {
    return "—";
  }

  return new Date(
    milliseconds,
  ).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );
};

const formatDuration = (
  totalMinutes?: number,
) => {
  const safeMinutes =
    Math.max(
      0,

      Math.round(
        Number(
          totalMinutes || 0,
        ),
      ),
    );

  const hours =
    Math.floor(
      safeMinutes / 60,
    );

  const minutes =
    safeMinutes % 60;

  if (
    hours === 0
  ) {
    return `${minutes} minute${
      minutes === 1
        ? ""
        : "s"
    }`;
  }

  if (
    minutes === 0
  ) {
    return `${hours} hour${
      hours === 1
        ? ""
        : "s"
    }`;
  }

  return `${hours} hour${
    hours === 1
      ? ""
      : "s"
  } and ${minutes} minute${
    minutes === 1
      ? ""
      : "s"
  }`;
};

// Presentation only: do not invent credited minutes for very short service.
// Firestore keeps its verified whole-minute value unchanged.
const formatCertificateService = (certificate: CertificateRecord) => {
  const credited = Math.max(0, Math.round(Number(certificate.verifiedServiceMinutes || 0)));
  if (credited > 0) return formatDuration(credited);
  const inMillis = toMillis(certificate.checkedInAt);
  const outMillis = toMillis(certificate.checkedOutAt);
  if (inMillis > 0 && outMillis > inMillis) {
    const seconds = Math.floor((outMillis - inMillis) / 1000);
    if (seconds > 0 && seconds < 60) {
      return `${seconds} seconds recorded (0 credited minutes)`;
    }
  }
  return "0 credited minutes";
};

const getCertificateDate = (
  certificate:
    CertificateRecord,
) => {
  return (
    certificate.issuedAt ||
    certificate.createdAt ||
    certificate.date
  );
};

// ============================================================
// COMMUNITY EVENT CERTIFICATE HELPERS
// ============================================================

const formatEventDate = (value?: string) => {
  if (!value) return "Date not recorded";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const eventPlace = (certificate: CertificateRecord) =>
  [certificate.eventLocation, certificate.eventBarangay, "City of San Jose del Monte, Bulacan"]
    .filter(Boolean)
    .join(", ");

const escapeCertificateHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const encoded: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;",
    };
    return encoded[character] || character;
  });

// The printed document reproduces the portrait paper design shown on screen.
// It contains the real VolunServe badge and never claims an LGU seal/signature.
const printableCertificateHtml = (
  certificate: CertificateRecord,
  logoUrl: string,
) => {
  const isEvent = certificate.certificateType === "community_event_participation";
  const title = isEvent ? "CERTIFICATE OF PARTICIPATION" : "CERTIFICATE OF VOLUNTEER SERVICE";
  const name = escapeCertificateHtml(certificate.volunteerName || "Volunteer");
  const eventName = escapeCertificateHtml(certificate.eventTitle || "Community Event");
  const date = escapeCertificateHtml(formatEventDate(certificate.eventDate));
  const place = escapeCertificateHtml(eventPlace(certificate));
  const minutes = escapeCertificateHtml(formatCertificateService(certificate));
  const id = escapeCertificateHtml(certificate.certificateId || certificate.id);
  const issuer = escapeCertificateHtml(certificate.issuedByName || "VolunServe Administrator");
  const issued = escapeCertificateHtml(formatDate(certificate.issuedAt));
  const safeLogo = escapeCertificateHtml(logoUrl);
  const stats = isEvent
    ? `<p class="support">has actively participated in</p>
       <h2>${eventName}</h2>
       <p class="event-detail">held on <strong>${date}</strong><br/>at ${place}</p>
       <p class="recognition">In recognition of <strong>${minutes}</strong> of Admin-verified community volunteer service and commitment to the community.</p>`
    : `<p class="support">for verified volunteer service through VolunServe emergency response activities.</p>
       <p class="recognition">In recognition of <strong>${escapeCertificateHtml(String(certificate.verifiedHelps || 0))} verified response(s)</strong>, <strong>${minutes}</strong> of service and <strong>${escapeCertificateHtml(String(certificate.peopleHelped || 0))}</strong> people assisted.</p>
       <p class="record-note">Service details are documented in VolunServe's verified contribution records.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<title>VolunServe — ${title} — ${id}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#ebf1ed;color:#173747;font-family:Arial,Helvetica,sans-serif}
.toolbar{text-align:center;margin:12px;font-size:13px;color:#425f65}.toolbar button{background:#078f82;color:#fff;padding:10px 15px;border:0;border-radius:8px;font-weight:bold;cursor:pointer;margin-left:10px}
.paper{width:210mm;height:297mm;margin:12px auto;position:relative;overflow:hidden;background:#fffef9;box-shadow:0 8px 26px #142a292b;padding:17mm 15mm 14mm;display:flex;flex-direction:column;align-items:center;text-align:center}
.frame1,.frame2{position:absolute;pointer-events:none}.frame1{inset:3mm;border:2px solid #0b8175}.frame2{inset:6mm;border:1px solid #b7cdbb}
.corner{position:absolute;background:#057a70;pointer-events:none}.corner.tl{left:3mm;top:3mm;width:56mm;height:4mm;border-bottom-right-radius:100%}.corner.br{right:3mm;bottom:3mm;width:56mm;height:4mm;border-top-left-radius:100%}
.leaf{position:absolute;width:31mm;height:12mm;border-radius:2% 95% 4% 95%;background:#99c8a0;opacity:.65;pointer-events:none}.leaf.l1{top:10mm;left:4mm;transform:rotate(-43deg)}.leaf.l2{bottom:4mm;right:4mm;transform:rotate(-43deg)}
.header{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;min-height:32mm;gap:5mm;position:relative;z-index:1}
.branding{display:flex;align-items:center;gap:3mm}.branding img{width:27mm;height:27mm;object-fit:contain;flex-shrink:0}
.brandname{font-size:23px;font-weight:900;color:#007a73}.tagline{font-size:10px;color:#547780;letter-spacing:.2px;margin-top:3px}
.badge{width:23mm;height:23mm;border-radius:50%;border:2px solid #8faea6;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2px;color:#0a756d;background:#f7fbf8;flex-shrink:0}.badge strong{font-size:20px;font-family:Georgia,serif}.badge span{font-size:7px;letter-spacing:1px;font-weight:bold}
.main{display:flex;flex:1;width:100%;flex-direction:column;align-items:center;justify-content:center;position:relative;z-index:1}
.title{font:bold 29px/1.25 Georgia,serif;color:#173e52;margin:4mm 0 5mm;letter-spacing:.6px}
.rule{height:1px;width:78%;background:#c1d3b8;margin:4mm 0 5mm}.intro{font-size:15px;color:#526369;margin:0}.recipient{font:bold 36px/1.2 Georgia,serif;color:#23313b;margin:5mm 0 2mm;max-width:98%;overflow-wrap:anywhere}
.support{font-size:15px;line-height:1.6;color:#526369;margin:5mm 0 0;max-width:165mm}
h2{font:bold 25px/1.3 Georgia,serif;color:#184552;margin:4mm 0}.event-detail{font-size:14px;color:#526369;line-height:1.75;max-width:168mm;margin:1mm 0}
.recognition{font-size:15px;color:#526369;line-height:1.8;max-width:166mm;margin:10mm 0 0}.record-note{font-size:12px;color:#71847d;margin:5mm 0}
.signoff{width:100%;display:flex;gap:10mm;justify-content:space-between;text-align:center;position:relative;z-index:1;margin-bottom:7mm}.sign-col{flex:1;min-width:0}.sign-name{font-size:14px;color:#243e48;font-weight:bold;overflow-wrap:anywhere}.sign-rule{border-top:1px solid #9aaca7;margin:2mm 0 2mm}.sign-desc{font-size:11px;color:#617579;line-height:1.5}
.foot{width:100%;display:flex;gap:3mm;justify-content:space-between;align-items:flex-end;border-top:1px solid #dae7dc;padding-top:3mm;position:relative;z-index:1;background:#fffef9;font-size:11px;color:#63777a;text-align:left}.foot .id{max-width:56%;text-align:right;overflow-wrap:anywhere}.foot strong{color:#154955;font-size:11px}
@page{size:A4 portrait;margin:0}@media print{html,body{width:210mm;height:297mm;margin:0!important;padding:0!important;background:#fff}.toolbar{display:none!important}.paper{width:210mm!important;height:297mm!important;margin:0!important;box-shadow:none!important;page-break-inside:avoid;break-inside:avoid;page-break-after:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="toolbar">Save as PDF from your browser's print dialog. <button onclick="window.print()">Print / Save as PDF</button></div>
<section class="paper"><div class="frame1"></div><div class="frame2"></div><div class="corner tl"></div><div class="corner br"></div><div class="leaf l1"></div><div class="leaf l2"></div>
  <header class="header"><div class="branding">${safeLogo ? `<img src="${safeLogo}" alt="VolunServe badge"/>` : ""}<div><div class="brandname">VolunServe</div><div class="tagline">Community Volunteer Platform</div></div></div><div class="badge"><strong>VS</strong><span>RECORD</span></div></header>
  <div class="main"><h1 class="title">${title}</h1><p class="intro">This certifies that</p><div class="recipient">${name}</div><div class="rule"></div>${stats}</div>
  <div class="signoff"><div class="sign-col"><div class="sign-name">${issuer}</div><div class="sign-rule"></div><div class="sign-desc">Recorded issuer (no signature represented)</div></div><div class="sign-col"><div class="sign-name">${issued}</div><div class="sign-rule"></div><div class="sign-desc">Date issued</div></div></div>
  <footer class="foot"><span>VolunServe electronic certificate · Verify the record online</span><div class="id">CERTIFICATE ID<br/><strong>${id}</strong></div></footer>
</section></body></html>`;
};

// Shared on-screen certificate paper. Both certificate types keep their own data.
function CertificatePaper({
  certificate,
  displayName,
}: {
  certificate: CertificateRecord;
  displayName?: string;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const compact = viewportWidth < 540;
  const isEvent = certificate.certificateType === "community_event_participation";
  const isRevoked = certificate.verificationStatus === "revoked";
  const certificateId = certificate.certificateId || certificate.id;
  return (
    <View style={[styles.paperSheet, compact && styles.paperSheetCompact]}>
      <View pointerEvents="none" style={styles.paperBorderOuter} />
      <View pointerEvents="none" style={styles.paperBorderInner} />
      <View pointerEvents="none" style={styles.paperCornerTop} />
      <View pointerEvents="none" style={styles.paperCornerBottom} />
      <View pointerEvents="none" style={styles.paperLeafTop} />
      <View pointerEvents="none" style={styles.paperLeafBottom} />

      <View style={styles.paperHead}>
        <View style={styles.paperBrandRow}>
          <Image source={VOLUNSERVE_BADGE} style={[styles.paperLogoImage, compact && styles.paperLogoCompact]} resizeMode="contain" />
          <View style={styles.paperBrandCopy}>
            <Text style={[styles.paperBrandName, compact && styles.paperBrandCompact]}>VolunServe</Text>
            <Text style={styles.paperBrandTagline}>Community Volunteer Platform</Text>
          </View>
        </View>
        <View style={[styles.paperRecordBadge, compact && styles.paperRecordCompact]}>
          <Text style={styles.paperRecordLetters}>VS</Text>
          <Text style={styles.paperRecordLabel}>RECORD</Text>
        </View>
      </View>

      <View style={styles.paperMiddle}>
        <Text style={[styles.paperHeading, compact && styles.paperHeadingCompact]}>
          {isEvent ? "CERTIFICATE OF PARTICIPATION" : "CERTIFICATE OF VOLUNTEER SERVICE"}
        </Text>
        <Text style={styles.paperIntro}>This certifies that</Text>
        <Text style={[styles.paperRecipient, compact && styles.paperRecipientCompact]}>{certificate.volunteerName || displayName || "Volunteer"}</Text>
        <View style={styles.paperNameDivider} />
        {isEvent ? (
          <>
            <Text style={styles.paperSupport}>has actively participated in</Text>
            <Text style={styles.paperEventName}>{certificate.eventTitle || "Community Event"}</Text>
            <Text style={styles.paperEventDetail}>held on {formatEventDate(certificate.eventDate)}</Text>
            <Text style={styles.paperEventDetail}>at {eventPlace(certificate)}</Text>
            <Text style={styles.paperRecognition}>
              In recognition of {formatCertificateService(certificate)} of Admin-verified community volunteer service and commitment to the community.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.paperSupport}>
              for verified volunteer service through VolunServe emergency response activities.
            </Text>
            <Text style={styles.paperRecognition}>
              In recognition of {Number(certificate.verifiedHelps || 0)} verified response(s), {formatCertificateService(certificate)} of service and {Number(certificate.peopleHelped || 0)} people assisted.
            </Text>
            <Text style={styles.paperRecordNote}>
              Service details are documented in VolunServe's verified contribution records.
            </Text>
          </>
        )}
      </View>

      <View style={styles.paperSignoff}>
        <View style={styles.paperSignoffCol}>
          <Text style={styles.paperSignoffName}>{certificate.issuedByName || "VolunServe Administrator"}</Text>
          <View style={styles.paperSignoffRule} />
          <Text style={styles.paperSignoffDesc}>Recorded issuer (no signature represented)</Text>
        </View>
        <View style={styles.paperSignoffCol}>
          <Text style={styles.paperSignoffName}>{formatDate(certificate.issuedAt)}</Text>
          <View style={styles.paperSignoffRule} />
          <Text style={styles.paperSignoffDesc}>Date issued</Text>
        </View>
      </View>
      <View style={styles.paperFooter}>
        <Text style={styles.paperFooterNote}>VolunServe electronic certificate · Verify the record online</Text>
        <View style={styles.paperFooterIdWrap}>
          <Text style={styles.paperFooterIdLabel}>CERTIFICATE ID</Text>
          <Text selectable style={styles.paperFooterId}>{certificateId}</Text>
        </View>
      </View>
      {isRevoked && (
        <View style={styles.paperRevokedOverlay} pointerEvents="none">
          <Text style={styles.paperRevokedText}>REVOKED</Text>
        </View>
      )}
    </View>
  );
}

// Dashboard thumbnail only — the original CertificatePaper and A4 printable
// certificate above are deliberately untouched.
function CertificateMiniPreview({
  certificate,
  displayName,
}: {
  certificate: CertificateRecord;
  displayName?: string;
}) {
  const eventCertificate = certificate.certificateType === "community_event_participation";
  return (
    <View style={styles.dashMiniPaper}>
      <View pointerEvents="none" style={styles.dashMiniBorder} />
      <View pointerEvents="none" style={styles.dashMiniCornerTop} />
      <View pointerEvents="none" style={styles.dashMiniCornerBottom} />
      <View style={styles.dashMiniBrand}>
        <Image source={VOLUNSERVE_BADGE} style={styles.dashMiniLogo} resizeMode="contain" />
        <View>
          <Text style={styles.dashMiniBrandName}>VolunServe</Text>
          <Text style={styles.dashMiniBrandSub}>COMMUNITY VOLUNTEER PLATFORM</Text>
        </View>
      </View>
      <Text style={styles.dashMiniHeading}>CERTIFICATE</Text>
      <Text style={styles.dashMiniOf}>
        {eventCertificate ? "OF PARTICIPATION" : "OF VOLUNTEER SERVICE"}
      </Text>
      <Text style={styles.dashMiniPresented}>This certifies that</Text>
      <Text numberOfLines={2} style={styles.dashMiniRecipient}>
        {certificate.volunteerName || displayName || "Volunteer"}
      </Text>
      <View style={styles.dashMiniRule} />
      <Text numberOfLines={2} style={styles.dashMiniReason}>
        {eventCertificate
          ? certificate.eventTitle || "Community Event"
          : "Verified Emergency Response Service"}
      </Text>
      <Text style={styles.dashMiniDate}>{eventCertificate
        ? formatEventDate(certificate.eventDate)
        : formatDate(certificate.issuedAt)}</Text>
      <View style={styles.dashMiniFooter}>
        <Text numberOfLines={1} style={styles.dashMiniIssuer}>
          {certificate.issuedByName || "VolunServe Administrator"}
        </Text>
        <Text style={styles.dashMiniId} numberOfLines={1}>
          ID: {certificate.certificateId || certificate.id}
        </Text>
      </View>
      {certificate.verificationStatus === "revoked" && (
        <View style={styles.dashMiniRevoked} pointerEvents="none">
          <Text style={styles.dashMiniRevokedText}>REVOKED</Text>
        </View>
      )}
    </View>
  );
}

// Dashboard card: real Firestore fields only. Printable original is opened
// by the View Certificate action, not replaced by this compact preview.
function CertificateDashboardCard({
  certificate,
  displayName,
  narrow,
  onView,
  onVerify,
  onPrint,
}: {
  certificate: CertificateRecord;
  displayName?: string;
  narrow: boolean;
  onView: (certificate: CertificateRecord) => void;
  onVerify: (certificate: CertificateRecord) => void;
  onPrint: (certificate: CertificateRecord) => void;
}) {
  const isEvent = certificate.certificateType === "community_event_participation";
  const isIssued = certificate.verificationStatus === "issued";
  const isRevoked = certificate.verificationStatus === "revoked";
  return (
    <View style={[styles.dashCertificateCard, narrow && styles.dashCertificateCardStack]}>
      <TouchableOpacity
        style={[styles.dashThumbnailWrap, narrow && styles.dashThumbnailWrapStack]}
        onPress={() => onView(certificate)}
        activeOpacity={0.87}
        accessibilityRole="button"
        accessibilityLabel="View certificate preview"
      >
        <CertificateMiniPreview certificate={certificate} displayName={displayName} />
      </TouchableOpacity>
      <View style={styles.dashCertificateInfo}>
        <Text style={styles.dashCertTitle} numberOfLines={2}>
          {isEvent ? certificate.eventTitle || "Community Event" : "Volunteer Service Certificate"}
        </Text>
        <View style={styles.dashMetaRow}>
          <Ionicons name="calendar-outline" size={15} color="#5D7891" />
          <Text style={styles.dashMetaText} numberOfLines={2}>
            {isEvent ? formatEventDate(certificate.eventDate) : formatDate(certificate.issuedAt)}
          </Text>
        </View>
        <View style={styles.dashMetaRow}>
          <Ionicons name="location-outline" size={15} color="#5D7891" />
          <Text style={styles.dashMetaText} numberOfLines={2}>
            {isEvent ? eventPlace(certificate) : "VolunServe Emergency Response"}
          </Text>
        </View>
        <View style={styles.dashMetaRow}>
          <Ionicons name="time-outline" size={15} color="#5D7891" />
          <Text style={styles.dashMetaText}>
            {formatCertificateService(certificate)} verified service
          </Text>
        </View>
        <View style={[styles.dashStatusPill, isRevoked && styles.dashStatusRevoked]}>
          <Ionicons
            name={isRevoked ? "close-circle" : isIssued ? "checkmark-circle" : "time-outline"}
            size={14}
            color={isRevoked ? "#B23F42" : "#078F77"}
          />
          <Text style={[styles.dashStatusText, isRevoked && styles.dashStatusTextRevoked]}>
            {isRevoked ? "REVOKED" : isIssued ? "ISSUED" : "CHECK STATUS"}
          </Text>
        </View>
        <TouchableOpacity style={styles.dashViewButton} onPress={() => onView(certificate)} accessibilityRole="button">
          <Ionicons name="eye-outline" color="#FFFFFF" size={16} />
          <Text style={styles.dashViewButtonText}>View Certificate</Text>
        </TouchableOpacity>
        <View style={styles.dashCardActions}>
          {isIssued && (
            <TouchableOpacity style={styles.dashOutlineButton} onPress={() => onPrint(certificate)} accessibilityRole="button">
              <Ionicons name="print-outline" size={15} color="#0B425D" />
              <Text style={styles.dashOutlineButtonText}>Print / Save PDF</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.dashOutlineButton} onPress={() => onVerify(certificate)} accessibilityRole="button">
            <Ionicons name="shield-checkmark-outline" size={15} color="#0B425D" />
            <Text style={styles.dashOutlineButtonText}>Verify ID</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ============================================================
// SCREEN
// ============================================================

export default function CertificateScreen() {
  const router =
    useRouter();

  const {
    user,
    profile,
    loading,
  } =
    useUserSession();

  const { width: windowWidth } = useWindowDimensions();
  const compactDashboard = windowWidth < 740;
  // Account for the volunteer sidebar when deciding the certificate grid layout.
  const twoColumnCards = windowWidth >= 1440;
  const [previewCertificate, setPreviewCertificate] = useState<CertificateRecord | null>(null);
  const [showAllCommunity, setShowAllCommunity] = useState(false);
  const [showAllService, setShowAllService] = useState(false);

  const [
    certificates,
    setCertificates,
  ] =
    useState<
      CertificateRecord[]
    >([]);

  const [
    certificatesLoading,
    setCertificatesLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  // ==========================================================
  // CERTIFICATE LISTENER
  // ==========================================================

  useEffect(() => {
    if (!user) {
      setCertificates(
        [],
      );

      setCertificatesLoading(
        false,
      );

      return;
    }

    setCertificatesLoading(
      true,
    );

    const certificateQuery =
      query(
        collection(
          db,
          "certificates",
        ),

        where(
          "userId",
          "==",
          user.uid,
        ),
      );

    return onSnapshot(
      certificateQuery,

      (
        snapshot,
      ) => {
        const rows =
          snapshot.docs
            .map(
              (
                certificateDoc,
              ) => ({
                id:
                  certificateDoc.id,

                ...(certificateDoc.data() as Omit<
                  CertificateRecord,
                  "id"
                >),
              }),
            )

            .sort(
              (
                left,
                right,
              ) =>
                toMillis(
                  getCertificateDate(
                    right,
                  ),
                ) -
                toMillis(
                  getCertificateDate(
                    left,
                  ),
                ),
            );

        setCertificates(
          rows,
        );

        setCertificatesLoading(
          false,
        );

        setError(
          "",
        );
      },

      (
        problem,
      ) => {
        console.error(
          "Certificate listener failed:",
          problem,
        );

        setError(
          "Unable to load your certificates. Check the deployed Firestore rules.",
        );

        setCertificatesLoading(
          false,
        );
      },
    );
  }, [
    user?.uid,
  ]);

  // ==========================================================
  // SERVICE CERTIFICATES
  // ==========================================================

  const serviceCertificates =
    useMemo(
      () =>
        certificates.filter(
          (
            item,
          ) =>
            item.certificateType ===
            "verified_volunteer_service",
        ),

      [
        certificates,
      ],
    );

  // ==========================================================
  // VERIFIED COMMUNITY EVENT CERTIFICATES (ISSUED BY BACKEND)
  // ==========================================================

  const communityEventCertificates = useMemo(
    () => certificates.filter(
      (item) => item.certificateType === "community_event_participation",
    ),
    [certificates],
  );

  // ==========================================================
  // PRESERVE PRE-EXISTING LEGACY EVENT CERTIFICATES
  // ==========================================================

  const legacyEventCertificates = useMemo(
    () => certificates.filter(
      (item) =>
        item.certificateType !== "verified_volunteer_service" &&
        item.certificateType !== "community_event_participation" &&
        Boolean(item.eventId || item.task),
    ),
    [certificates],
  );

  // ==========================================================
  // OPEN VERIFICATION PAGE
  // ==========================================================

  const openVerification =
    (
      certificate:
        CertificateRecord,
    ) => {
      const certificateId =
        certificate.certificateId ||
        certificate.id;

      router.push({
        pathname:
          "/verify-certificate" as any,

        params: {
          certificateId,
        },
      });
    };

  // ==========================================================
  // PRINT / SAVE PDF — SINGLE SELECTED CERTIFICATE, NOT DASHBOARD
  // ==========================================================

  const printCertificate = (certificate: CertificateRecord) => {
    if (certificate.verificationStatus !== "issued") {
      setError("Only issued, non-revoked certificates can be printed.");
      return;
    }

    if (Platform.OS !== "web") {
      Alert.alert(
        "Print / Save PDF",
        "Open My Certificates in the VolunServe web portal to print or save this certificate as a PDF.",
      );
      return;
    }

    // Prepare the complete HTML BEFORE opening a tab.  On Expo Web,
    // require("...png") is typically { uri, width, height }, not a native
    // Image ID. Calling Image.resolveAssetSource() without checking that it
    // exists can throw *after* window.open(), leaving an about:blank tab.
    try {
      const browser = (globalThis as any).window;
      if (!browser) {
        throw new Error("Browser window is unavailable.");
      }

      let assetUri = "";
      const badge = VOLUNSERVE_BADGE as any;
      if (typeof badge === "string") {
        assetUri = badge;
      } else if (badge && typeof badge.uri === "string") {
        assetUri = badge.uri;
      } else if (typeof (Image as any).resolveAssetSource === "function") {
        assetUri = (Image as any).resolveAssetSource(badge)?.uri || "";
      }

      if (!assetUri) {
        throw new Error("Cannot locate VolunServe logo asset for print.");
      }

      // Always use an absolute URL: a printed Blob document has a different
      // location from localhost:8081, so relative asset URLs will not work.
      const logoUrl = new URL(assetUri, browser.location.href).href;
      const html = printableCertificateHtml(certificate, logoUrl);

      // Open a complete HTML document directly, instead of first opening
      // an empty about:blank tab and then writing into its document.
      const blob = new Blob([html], {type: "text/html;charset=utf-8"});
      const objectUrl = browser.URL.createObjectURL(blob);
      const popup = browser.open(objectUrl, "_blank");

      if (!popup) {
        browser.URL.revokeObjectURL(objectUrl);
        setError("Please allow pop-ups for VolunServe to open the printable certificate.");
        return;
      }

      // Revoke only once the page has loaded, so it can fully render first.
      popup.addEventListener("load", () => {
        browser.URL.revokeObjectURL(objectUrl);
      }, {once: true});
      popup.focus();
      setError("");
    } catch (problem) {
      console.error("Certificate print failed:", problem);
      setError("Could not prepare printable certificate. Check the browser console for details.");
      Alert.alert("Print / Save PDF", "Unable to open the printable certificate. Please try again.");
    }
  };

  const visibleCommunity = showAllCommunity
    ? communityEventCertificates
    : communityEventCertificates.slice(0, 4);
  const visibleService = showAllService
    ? serviceCertificates
    : serviceCertificates.slice(0, 4);

  // ==========================================================
  // LOADING
  // ==========================================================

  if (
    loading ||
    certificatesLoading
  ) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <ActivityIndicator
          size="large"
          color="#087F78"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Loading certificates…
        </Text>
      </View>
    );
  }

  // ==========================================================
  // ACCESS
  // ==========================================================

  if (
    !user ||
    !profile ||
    !isApprovedProfile(
      profile,
    )
  ) {
    return (
      <View
        style={
          styles.centerCard
        }
      >
        <Text
          style={
            styles.centerTitle
          }
        >
          Approved account required
        </Text>

        <Text
          style={
            styles.centerText
          }
        >
          Sign in with an approved
          VolunServe account to view
          your certificates.
        </Text>
      </View>
    );
  }

  // ==========================================================
  // MY CERTIFICATES — redesigned dashboard (the certificate paper
  // and printable HTML above remain 100% unchanged).
  // ==========================================================
  return (
    <View style={styles.dashRoot}>
      <ScrollView
        style={styles.dashScroll}
        contentContainerStyle={[styles.dashContainer, compactDashboard && styles.dashContainerMobile]}
      >
        <View style={styles.dashHero}>
          <View style={styles.dashHeroText}>
            <Text style={styles.dashEyebrow}>VOLUNSERVE RECOGNITION</Text>
            <Text style={[styles.dashTitle, compactDashboard && styles.dashTitleMobile]}>My Certificates</Text>
            <Text style={styles.dashSubtitle}>
              Your proof of service and commitment to a stronger, safer, and more united community.
            </Text>
          </View>
          {!compactDashboard && (
            <View style={styles.dashHeroGraphic} pointerEvents="none">
              <View style={styles.dashHeroHalo} />
              <View style={styles.dashHeroLeafOne} />
              <View style={styles.dashHeroLeafTwo} />
              <View style={styles.dashHeroDocument}>
                <Image source={VOLUNSERVE_BADGE} style={styles.dashHeroLogo} resizeMode="contain" />
                <View style={styles.dashHeroLines}>
                  <View style={[styles.dashHeroLine, {width: 76}]} />
                  <View style={[styles.dashHeroLine, {width: 59}]} />
                  <View style={[styles.dashHeroLine, {width: 68}]} />
                </View>
              </View>
              <View style={styles.dashHeroMedallion}>
                <Ionicons name="star" color="#FFFFFF" size={23} />
              </View>
            </View>
          )}
        </View>

        <View style={styles.dashNotice}>
          <View style={styles.dashNoticeIcon}>
            <Ionicons name="ribbon" size={26} color="#FFFFFF" />
          </View>
          <View style={styles.dashNoticeCopy}>
            <Text style={styles.dashNoticeTitle}>
              Certificates are issued after completion and verification of your volunteer service.
            </Text>
            <Text style={styles.dashNoticeBody}>
              Keep participating in community events and emergency response activities to earn more certificates.
            </Text>
          </View>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.dashSection}>
          <View style={[styles.dashSectionHeader, compactDashboard && styles.dashSectionHeaderStack]}>
            <View style={styles.dashSectionInfo}>
              <View style={styles.dashSectionIcon}>
                <Ionicons name="calendar-clear-outline" color="#FFFFFF" size={23} />
              </View>
              <View style={styles.dashSectionTitleWrap}>
                <Text style={styles.dashSectionTitle}>Community Event Certificates</Text>
                <Text style={styles.dashSectionDescription}>
                  Certificates for completed community events with Admin-verified attendance.
                </Text>
              </View>
            </View>
            <View style={styles.dashSectionControls}>
              {communityEventCertificates.length > 4 && (
                <TouchableOpacity style={styles.dashViewAll} onPress={() => setShowAllCommunity((previous) => !previous)} accessibilityRole="button">
                  <Text style={styles.dashViewAllText}>{showAllCommunity ? "Show Less" : "View All"}</Text>
                  <Ionicons name={showAllCommunity ? "chevron-up" : "chevron-forward"} size={16} color="#164057" />
                </TouchableOpacity>
              )}
              <View style={styles.dashCount}><Text style={styles.dashCountNumber}>{communityEventCertificates.length}</Text></View>
              <Text style={styles.dashCountLabel}>Certificates</Text>
            </View>
          </View>

          {communityEventCertificates.length === 0 ? (
            <View style={styles.dashEmpty}>
              <View style={styles.dashEmptyGraphic}>
                <View style={styles.dashEmptyCloudLeft} />
                <View style={styles.dashEmptyCloudRight} />
                <View style={styles.dashEmptyDocument}>
                  <Ionicons name="ribbon-outline" size={40} color="#0C9587" />
                </View>
              </View>
              <Text style={styles.dashEmptyTitle}>No Community Event Certificates Yet</Text>
              <Text style={styles.dashEmptyText}>
                Your certificate will appear here after the event is completed, your attendance is verified, and the certificate is issued.
              </Text>
              <TouchableOpacity style={styles.dashBrowseButton} onPress={() => router.push("/(tabs)/community-events" as any)} accessibilityRole="button">
                <Ionicons name="calendar-outline" size={17} color="#FFFFFF" />
                <Text style={styles.dashBrowseText}>Browse Community Events</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.dashCardGrid}>
              {visibleCommunity.map((certificate) => (
                <View key={certificate.id} style={[styles.dashGridItem, twoColumnCards && styles.dashGridItemTwo]}>
                  <CertificateDashboardCard
                    certificate={certificate}
                    displayName={profile?.fullName}
                    narrow={compactDashboard || !twoColumnCards}
                    onView={setPreviewCertificate}
                    onVerify={openVerification}
                    onPrint={printCertificate}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.dashSection}>
          <View style={[styles.dashSectionHeader, compactDashboard && styles.dashSectionHeaderStack]}>
            <View style={styles.dashSectionInfo}>
              <View style={styles.dashSectionIcon}>
                <Ionicons name="shield-checkmark-outline" color="#FFFFFF" size={23} />
              </View>
              <View style={styles.dashSectionTitleWrap}>
                <Text style={styles.dashSectionTitle}>Emergency Response Certificates</Text>
                <Text style={styles.dashSectionDescription}>
                  Certificates for verified emergency-response contributions.
                </Text>
              </View>
            </View>
            <View style={styles.dashSectionControls}>
              {serviceCertificates.length > 4 && (
                <TouchableOpacity style={styles.dashViewAll} onPress={() => setShowAllService((previous) => !previous)} accessibilityRole="button">
                  <Text style={styles.dashViewAllText}>{showAllService ? "Show Less" : "View All"}</Text>
                  <Ionicons name={showAllService ? "chevron-up" : "chevron-forward"} size={16} color="#164057" />
                </TouchableOpacity>
              )}
              <View style={styles.dashCount}><Text style={styles.dashCountNumber}>{serviceCertificates.length}</Text></View>
              <Text style={styles.dashCountLabel}>Certificates</Text>
            </View>
          </View>

          {serviceCertificates.length === 0 ? (
            <View style={styles.dashEmpty}>
              <View style={styles.dashEmptyGraphic}>
                <View style={styles.dashEmptyCloudLeft} />
                <View style={styles.dashEmptyCloudRight} />
                <View style={styles.dashEmptyDocument}>
                  <Ionicons name="shield-checkmark-outline" color="#0C9587" size={40} />
                </View>
              </View>
              <Text style={styles.dashEmptyTitle}>No Emergency Response Certificates Yet</Text>
              <Text style={styles.dashEmptyText}>
                Complete verified emergency-response activities to receive recognition after your certificate is officially issued.
              </Text>
            </View>
          ) : (
            <View style={styles.dashCardGrid}>
              {visibleService.map((certificate) => (
                <View key={certificate.id} style={[styles.dashGridItem, twoColumnCards && styles.dashGridItemTwo]}>
                  <CertificateDashboardCard
                    certificate={certificate}
                    displayName={profile?.fullName}
                    narrow={compactDashboard || !twoColumnCards}
                    onView={setPreviewCertificate}
                    onVerify={openVerification}
                    onPrint={printCertificate}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

      {/* =====================================================
          LEGACY EVENT CERTIFICATES
          Kept separate so old records are not destroyed.
      ===================================================== */}

      {legacyEventCertificates.length >
        0 && (
        <View
          style={
            styles.legacySection
          }
        >
          <Text
            style={
              styles.legacyHeading
            }
          >
            Event Certificates
          </Text>

          <Text
            style={
              styles.legacySubheading
            }
          >
            Existing certificates from
            earlier volunteer event
            records.
          </Text>

          {legacyEventCertificates.map(
            (
              certificate,
            ) => (
              <View
                key={
                  certificate.id
                }
                style={
                  styles.legacyCard
                }
              >
                <Text
                  style={
                    styles.legacyTitle
                  }
                >
                  {certificate.task ||
                    "Volunteer Event"}
                </Text>

                <Text
                  style={
                    styles.legacyName
                  }
                >
                  {certificate.name ||
                    profile?.fullName ||
                    "Volunteer"}
                </Text>

                <Text
                  style={
                    styles.legacyDate
                  }
                >
                  {formatDate(
                    certificate.date,
                  )}
                </Text>

                <Text
                  style={
                    styles.legacyId
                  }
                >
                  Certificate ID:{" "}
                  {certificate.certificateId ||
                    certificate.id}
                </Text>
              </View>
            ),
          )}
        </View>
      )}
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={previewCertificate !== null}
        onRequestClose={() => setPreviewCertificate(null)}
      >
        <View style={styles.dashModalBackdrop}>
          <View style={[styles.dashModalPanel, compactDashboard && styles.dashModalPanelMobile]}>
            <View style={styles.dashModalTopbar}>
              <View style={{flex: 1}}>
                <Text style={styles.dashModalEyebrow}>OFFICIAL CERTIFICATE PREVIEW</Text>
                <Text style={styles.dashModalTitle}>Certificate of {previewCertificate?.certificateType === "community_event_participation" ? "Participation" : "Volunteer Service"}</Text>
              </View>
              <TouchableOpacity style={styles.dashModalClose} onPress={() => setPreviewCertificate(null)} accessibilityRole="button" accessibilityLabel="Close certificate preview">
                <Ionicons name="close" size={22} color="#173747" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.dashModalBody} contentContainerStyle={styles.dashModalScroll}>
              {previewCertificate && (
                <CertificatePaper certificate={previewCertificate} displayName={profile?.fullName} />
              )}
            </ScrollView>
            {previewCertificate && (
              <View style={styles.dashModalFooter}>
                <TouchableOpacity style={styles.dashOutlineButton} onPress={() => openVerification(previewCertificate)} accessibilityRole="button">
                  <Ionicons name="shield-checkmark-outline" size={17} color="#0B425D" />
                  <Text style={styles.dashOutlineButtonText}>Verify Certificate ID</Text>
                </TouchableOpacity>
                {previewCertificate.verificationStatus === "issued" && (
                  <TouchableOpacity style={styles.dashViewButton} onPress={() => printCertificate(previewCertificate)} accessibilityRole="button">
                    <Ionicons name="print-outline" size={17} color="#FFFFFF" />
                    <Text style={styles.dashViewButtonText}>Print / Save PDF</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
// ============================================================
// STYLES
// ============================================================

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: "#F6F8F7",
    },

    container: {
      width: "100%",
      maxWidth: 1050,
      alignSelf: "center",
      padding: 24,
      paddingBottom: 70,
    },

    loadingScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor: "#F6F8F7",
      gap: 10,
    },

    loadingText: {
      color: "#64748B",
      fontSize: 13,
    },

    centerCard: {
      margin: 24,
      padding: 24,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
    },

    centerTitle: {
      color: "#102A3A",
      fontSize: 20,
      fontWeight: "900",
    },

    centerText: {
      marginTop: 6,
      color: "#64748B",
      lineHeight: 20,
    },

    header: {
      marginBottom: 18,
    },

    eyebrow: {
      color: "#087F78",
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.3,
    },

    title: {
      marginTop: 5,
      color: "#173D32",
      fontSize: 28,
      lineHeight: 36,
      fontWeight: "700",
    },

    subtitle: {
      marginTop: 5,
      color: "#64748B",
      fontSize: 13,
      lineHeight: 20,
    },

    errorBox: {
      marginBottom: 14,
      padding: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor:
        "#F1BDBD",
      backgroundColor:
        "#FFF2F2",
    },

    errorText: {
      color: "#A83232",
      fontSize: 11.5,
      fontWeight: "700",
    },

    pendingCard: {
      padding: 24,
      borderRadius: 16,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
      marginBottom: 18,
    },

    pendingEyebrow: {
      color: "#087F78",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    pendingTitle: {
      marginTop: 5,
      color: "#173748",
      fontSize: 17,
      fontWeight: "900",
    },

    pendingText: {
      marginTop: 6,
      maxWidth: 680,
      color: "#64748B",
      fontSize: 11.5,
      lineHeight: 18,
    },

    certificateWrapper: {
      marginBottom: 24,
    },

    certificate: {
      position: "relative",
      padding: 32,
      borderWidth: 1,
      borderColor:
        "#B9D7D1",
      borderRadius: 5,
      backgroundColor:
        "#FFFFFF",
      overflow: "hidden",
    },

    topLine: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: 7,
      backgroundColor:
        "#087F78",
    },

    bottomLine: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 7,
      backgroundColor:
        "#087F78",
    },

    certificateHeader: {
      alignItems: "center",
      marginTop: 8,
    },

    logoText: {
      color: "#087F78",
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 2,
    },

    organization: {
      marginTop: 3,
      color: "#526B79",
      fontSize: 10,
      fontWeight: "700",
      textAlign: "center",
    },

    city: {
      marginTop: 2,
      color: "#83949E",
      fontSize: 9,
      textAlign: "center",
    },

    divider: {
      height: 1,
      backgroundColor:
        "#D7E5E2",
      marginVertical: 22,
    },

    certSmallTitle: {
      color: "#71858F",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 2,
      textAlign: "center",
    },

    certMainTitle: {
      marginTop: 4,
      color: "#173748",
      fontSize: 32,
      lineHeight: 38,
      fontWeight: "900",
      textAlign: "center",
    },

    presentedText: {
      marginTop: 22,
      color: "#7B8E97",
      fontSize: 11,
      textAlign: "center",
    },

    volunteerName: {
      marginTop: 8,
      color: "#087F78",
      fontSize: 27,
      lineHeight: 34,
      fontWeight: "900",
      textAlign: "center",
    },

    nameLine: {
      width: "70%",
      maxWidth: 500,
      alignSelf: "center",
      marginTop: 8,
      height: 1,
      backgroundColor:
        "#BFD4D0",
    },

    bodyText: {
      marginTop: 18,
      alignSelf: "center",
      maxWidth: 650,
      color: "#526B79",
      fontSize: 12,
      lineHeight: 20,
      textAlign: "center",
    },

    metricsGrid: {
      marginTop: 24,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent:
        "center",
    },

    metricCard: {
      flexGrow: 1,
      flexBasis: 170,
      maxWidth: 230,
      minWidth: 150,
      padding: 14,
      borderRadius: 10,
      backgroundColor:
        "#F5FAF8",
      borderWidth: 1,
      borderColor:
        "#D7E8E3",
      alignItems: "center",
    },

    metricValue: {
      color: "#087F78",
      fontSize: 22,
      fontWeight: "900",
    },

    metricValueSmall: {
      color: "#087F78",
      fontSize: 15,
      fontWeight: "900",
      textAlign: "center",
    },

    metricLabel: {
      marginTop: 4,
      color: "#607984",
      fontSize: 8.5,
      lineHeight: 13,
      fontWeight: "800",
      textAlign: "center",
      textTransform:
        "uppercase",
      letterSpacing: 0.5,
    },

    breakdownSection: {
      alignSelf: "center",
      width: "100%",
      maxWidth: 650,
      marginTop: 22,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        "#E0E9EC",
      backgroundColor:
        "#FAFCFC",
    },

    breakdownHeading: {
      marginBottom: 5,
      color: "#405D69",
      fontSize: 11,
      fontWeight: "900",
      textAlign: "center",
    },

    breakdownRow: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",
      paddingVertical: 7,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        "#E4EBEE",
    },

    breakdownType: {
      flex: 1,
      color: "#5A717D",
      fontSize: 10.5,
    },

    breakdownCount: {
      color: "#087F78",
      fontSize: 11,
      fontWeight: "900",
    },

    recognitionText: {
      marginTop: 20,
      alignSelf: "center",
      maxWidth: 620,
      color: "#71858F",
      fontSize: 10,
      lineHeight: 16,
      textAlign: "center",
      fontStyle: "italic",
    },

    footerGrid: {
      marginTop: 24,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent:
        "space-around",
      gap: 20,
    },

    footerItem: {
      minWidth: 180,
      alignItems: "center",
    },

    footerLabel: {
      color: "#8B9BA4",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    footerValue: {
      marginTop: 5,
      color: "#334E5C",
      fontSize: 10.5,
      fontWeight: "800",
      textAlign: "center",
    },

    // ========================================================
    // CERTIFICATE ID VERIFICATION FOOTER
    // ========================================================

    verificationFooter: {
      marginTop: 24,
      paddingTop: 15,
      borderTopWidth: 1,
      borderTopColor: "#D6E5E1",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 18,
    },
    verificationMessageBox: { flex: 1, minWidth: 190 },
    verificationNote: { color: "#71858F", fontSize: 10, lineHeight: 16 },
    verificationRecordStatus: { color: "#08786F", fontWeight: "900", fontSize: 9, marginTop: 6 },
    verificationRevoked: { color: "#A83232", fontWeight: "900", fontSize: 9, marginTop: 6 },
    verificationIdBlock: { alignItems: "flex-end", maxWidth: "100%" },
    verificationLabel: { color: "#71858F", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
    verificationId: { color: "#173748", fontSize: 12, fontWeight: "900", marginTop: 4, textAlign: "right" },

    actions: {
      marginTop: 10,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent:
        "flex-end",
      gap: 9,
    },

    primaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 9,
      backgroundColor:
        "#087F78",
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    secondaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#BEDDD7",
      backgroundColor:
        "#EFF8F6",
    },

    secondaryButtonText: {
      color: "#08786F",
      fontSize: 10.5,
      fontWeight: "900",
    },

    legacySection: {
      marginTop: 8,
    },

    legacyHeading: {
      color: "#173748",
      fontSize: 17,
      fontWeight: "900",
    },

    legacySubheading: {
      marginTop: 3,
      marginBottom: 10,
      color: "#7A8E99",
      fontSize: 11,
    },

    legacyCard: {
      marginBottom: 8,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        "#DCE5EA",
      backgroundColor:
        "#FFFFFF",
    },

    legacyTitle: {
      color: "#173748",
      fontSize: 12,
      fontWeight: "900",
    },

    legacyName: {
      marginTop: 3,
      color: "#526B79",
      fontSize: 11,
    },

    legacyDate: {
      marginTop: 3,
      color: "#83949E",
      fontSize: 9.5,
    },

    legacyId: {
      marginTop: 5,
      color: "#087F78",
      fontSize: 9,
      fontWeight: "700",
    },
    // ========================================================
    // PORTRAIT CERTIFICATE — Logo + decorative border INSIDE paper
    // Used consistently by both Community Event and Emergency records.
    // ========================================================
    paperSheetCompact: { paddingHorizontal: 30, paddingTop: 37, paddingBottom: 38 },
    paperLogoCompact: { width: 49, height: 49 },
    paperBrandCompact: { fontSize: 16 },
    paperRecordCompact: { width: 48, height: 48 },
    paperHeadingCompact: { fontSize: 18, lineHeight: 26 },
    paperRecipientCompact: { fontSize: 22, lineHeight: 30 },
    paperSheet: {
      width: "100%", maxWidth: 610, alignSelf: "center", minHeight: 810,
      backgroundColor: "#FFFEF9", paddingHorizontal: 49, paddingTop: 48,
      paddingBottom: 43, overflow: "hidden", position: "relative",
      justifyContent: "space-between", borderWidth: 1, borderColor: "#D7E7DE",
    },
    paperBorderOuter: { position: "absolute", top: 13, right: 13, bottom: 13, left: 13, borderWidth: 2, borderColor: "#0B8175" },
    paperBorderInner: { position: "absolute", top: 19, right: 19, bottom: 19, left: 19, borderWidth: 1, borderColor: "#B7CDBB" },
    paperCornerTop: { position: "absolute", top: 13, left: 13, width: 135, height: 9, backgroundColor: "#057A70", borderBottomRightRadius: 60 },
    paperCornerBottom: { position: "absolute", bottom: 13, right: 13, width: 135, height: 9, backgroundColor: "#057A70", borderTopLeftRadius: 60 },
    paperLeafTop: { position: "absolute", top: 33, left: 17, width: 80, height: 28, borderTopLeftRadius: 3, borderBottomRightRadius: 80, backgroundColor: "#B6D3B0", opacity: 0.7, transform: [{rotate:"-42deg"}] },
    paperLeafBottom: { position: "absolute", bottom: 8, right: 17, width: 80, height: 28, borderTopLeftRadius: 3, borderBottomRightRadius: 80, backgroundColor: "#B6D3B0", opacity: 0.7, transform: [{rotate:"-42deg"}] },
    paperHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, zIndex: 1 },
    paperBrandRow: { flexDirection: "row", alignItems: "center", flexShrink: 1, gap: 7 },
    paperLogoImage: { width: 67, height: 67 },
    paperBrandCopy: { flexShrink: 1 },
    paperBrandName: { color: "#007A73", fontSize: 22, fontWeight: "900" },
    paperBrandTagline: { color: "#547780", fontSize: 9, lineHeight: 14 },
    paperRecordBadge: { width: 68, height: 68, borderRadius: 35, borderWidth: 2, borderColor: "#8FAEA6", backgroundColor: "#F7FBF8", alignItems: "center", justifyContent: "center" },
    paperRecordLetters: { color: "#0A756D", fontSize: 22, fontFamily: "Georgia", fontWeight: "900" },
    paperRecordLabel: { fontSize: 7, fontWeight: "900", color: "#0A756D", letterSpacing: 1 },
    paperMiddle: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", paddingVertical: 28, zIndex: 1 },
    paperHeading: { fontFamily: "Georgia", fontSize: 23, lineHeight: 31, color: "#173E52", fontWeight: "900", textAlign: "center", letterSpacing: 0.4, marginBottom: 18 },
    paperIntro: { color: "#526369", fontSize: 12, textAlign: "center" },
    paperRecipient: { fontFamily: "Georgia", fontSize: 29, lineHeight: 38, fontWeight: "900", color: "#23313B", textAlign: "center", marginTop: 11, flexShrink: 1 },
    paperNameDivider: { height: 1, width: "80%", backgroundColor: "#C1D3B8", marginTop: 12, marginBottom: 14 },
    paperSupport: { color: "#526369", fontSize: 12, lineHeight: 20, textAlign: "center", marginTop: 6 },
    paperEventName: { fontFamily: "Georgia", color: "#184552", fontSize: 23, lineHeight: 30, fontWeight: "900", textAlign: "center", marginVertical: 12 },
    paperEventDetail: { color: "#526369", fontSize: 11.5, lineHeight: 19, textAlign: "center" },
    paperRecognition: { maxWidth: 390, marginTop: 31, color: "#526369", fontSize: 12, lineHeight: 20, textAlign: "center" },
    paperRecordNote: { color: "#71847D", fontSize: 10, lineHeight: 17, marginTop: 13, textAlign: "center" },
    paperSignoff: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 18, width: "100%", marginBottom: 23, zIndex: 1 },
    paperSignoffCol: { flex: 1, minWidth: 0, alignItems: "center" },
    paperSignoffName: { fontSize: 11, fontWeight: "800", color: "#243E48", textAlign: "center" },
    paperSignoffRule: { borderTopWidth: 1, borderTopColor: "#9AACA7", width: "100%", marginTop: 9, marginBottom: 7 },
    paperSignoffDesc: { color: "#617579", fontSize: 9, lineHeight: 14, textAlign: "center" },
    paperFooter: { backgroundColor: "#FFFEF9", paddingTop: 12, borderTopWidth: 1, borderTopColor: "#DAE7DC", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12, width: "100%", zIndex: 1 },
    paperFooterNote: { color: "#63777A", fontSize: 8.5, lineHeight: 14, flex: 1 },
    paperFooterIdWrap: { alignItems: "flex-end", flex: 1 },
    paperFooterIdLabel: { fontSize: 8, color: "#63777A", fontWeight: "800", letterSpacing: 0.5 },
    paperFooterId: { fontSize: 10, fontWeight: "900", color: "#154955", textAlign: "right", marginTop: 4 },
    paperRevokedOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFFAD", zIndex: 3 },
    paperRevokedText: { fontSize: 42, color: "#A83232", fontWeight: "900", letterSpacing: 6, transform: [{rotate:"-20deg"}] },

    // --------------------------------------------------------
    // COMMUNITY EVENT CERTIFICATE UI — ADDED, ORIGINAL STYLES KEPT
    // --------------------------------------------------------
    sectionHeadingRow: {
      flexDirection: "row", alignItems: "center", gap: 12,
      marginTop: 14, marginBottom: 12,
    },
    communityEyebrow: { color: "#078F82", fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
    communitySectionTitle: { marginTop: 4, color: "#173747", fontSize: 19, fontWeight: "900" },
    communitySectionSub: { marginTop: 4, color: "#667F8A", fontSize: 11, lineHeight: 17 },
    communityCount: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#E2F5EE" },
    communityCountText: { color: "#078F82", fontWeight: "900", fontSize: 14 },
    communityEmpty: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDEBE5", borderRadius: 12, padding: 21, marginBottom: 22 },
    communityEmptyTitle: { color: "#173747", fontSize: 14, fontWeight: "900" },
    communityEmptyCopy: { color: "#657C89", marginTop: 7, lineHeight: 19, fontSize: 11.5 },
    communityWrapper: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#DDEAE3", overflow: "hidden", marginBottom: 20 },
    communityPaper: { position: "relative", backgroundColor: "#FFFEF8", padding: 23, minHeight: 475 },
    communityBorderOuter: { position: "absolute", left: 12, right: 12, top: 12, bottom: 12, borderWidth: 2, borderColor: "#078F82", borderRadius: 1 },
    communityBorderInner: { position: "absolute", left: 17, right: 17, top: 17, bottom: 17, borderWidth: 1, borderColor: "#B3D0B8", borderRadius: 1 },
    communityPaperBody: { paddingHorizontal: 12, paddingVertical: 15, alignItems: "center", flex: 1 },
    communityBrand: { fontSize: 21, fontWeight: "900", color: "#078F82", letterSpacing: 1.5 },
    communityBrandSub: { fontSize: 9, color: "#7A8C80", letterSpacing: 1.1, marginTop: 3, textAlign: "center" },
    communityCertHeading: { fontFamily: "Georgia", fontWeight: "900", color: "#173747", textAlign: "center", fontSize: 25, marginTop: 20 },
    communityPresented: { color: "#526E76", fontSize: 12, textAlign: "center", marginTop: 11 },
    communityRecipient: { color: "#173747", fontFamily: "Georgia", fontSize: 27, fontWeight: "900", textAlign: "center", marginTop: 8 },
    communityNameRule: { width: "70%", height: 1, backgroundColor: "#AAC6AE", marginTop: 9 },
    communityEventTitle: { fontFamily: "Georgia", fontSize: 22, color: "#087F78", fontWeight: "900", textAlign: "center", marginTop: 8 },
    communityEventMeta: { marginTop: 4, color: "#627782", fontSize: 11, textAlign: "center", lineHeight: 17 },
    communityServicePill: { marginTop: 15, borderRadius: 11, backgroundColor: "#E6F6EF", paddingHorizontal: 23, paddingVertical: 11, alignItems: "center" },
    communityServiceLabel: { fontSize: 8.5, color: "#53877A", fontWeight: "900", letterSpacing: 0.6 },
    communityServiceValue: { fontSize: 17, fontWeight: "900", color: "#087F78", marginTop: 3 },
    communityPaperFooter: { marginTop: "auto", paddingTop: 24, alignSelf: "stretch", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 14 },
    communityIssuerDetails: { flex: 1, minWidth: 180, gap: 5 },
    communityIdBlock: { alignItems: "flex-end", maxWidth: "100%", borderTopWidth: 1, borderTopColor: "#C9DCD0", paddingTop: 8 },
    communityIdLabel: { fontSize: 8, fontWeight: "900", letterSpacing: 1, color: "#7F9194" },
    communityIdValue: { fontSize: 12, fontWeight: "900", color: "#173747", textAlign: "right", marginTop: 4 },
    communityIdHelp: { fontSize: 9, color: "#7D958B", marginTop: 4, textAlign: "right" },
    communityFootDetails: { fontSize: 10, color: "#536D77" },
    communityDisclaimer: { marginTop: 2, fontSize: 9, color: "#87948B", lineHeight: 14 },
    communityActionBar: { backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E1ECE6", padding: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 9 },
    communityState: { fontWeight: "900", fontSize: 10, letterSpacing: 0.5 },
    communityStateIssued: { color: "#087F78" },
    communityStateRevoked: { color: "#B33A3A" },
    communityStateOther: { color: "#657C89" },
    communityActionButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    communityVerifyBtn: { borderWidth: 1, borderColor: "#B8D9CE", backgroundColor: "#EFF8F4", paddingHorizontal: 13, paddingVertical: 11, borderRadius: 8 },
    communityVerifyText: { color: "#087F78", fontSize: 10.5, fontWeight: "900" },
    communityPrintBtn: { backgroundColor: "#078F82", paddingHorizontal: 13, paddingVertical: 11, borderRadius: 8 },
    communityPrintText: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "900" },
    // Certificate DASHBOARD only. Do not change the existing A4 paper styles.
    dashRoot: {flex: 1, backgroundColor: "#F4F8FC"},
    dashScroll: {flex: 1},
    dashContainer: {width: "100%", maxWidth: 1320, alignSelf: "center", paddingHorizontal: 26, paddingTop: 20, paddingBottom: 70, gap: 20},
    dashContainerMobile: {paddingHorizontal: 14, paddingTop: 15, gap: 16},
    dashHero: {minHeight: 135, overflow: "hidden", flexDirection: "row", justifyContent: "space-between", alignItems: "center", position: "relative"},
    dashHeroText: {flex: 1, minWidth: 0, paddingTop: 1, paddingBottom: 10, zIndex: 2},
    dashEyebrow: {fontSize: 11, fontWeight: "900", color: "#048D80", letterSpacing: 1.2},
    dashTitle: {fontSize: 38, fontWeight: "900", color: "#102F46", marginTop: 6, letterSpacing: -0.8},
    dashTitleMobile: {fontSize: 30},
    dashSubtitle: {fontSize: 13, color: "#58738A", lineHeight: 22, marginTop: 7, maxWidth: 770},
    dashHeroGraphic: {height: 144, width: 295, position: "relative", flexShrink: 0, justifyContent: "center", alignItems: "center", overflow: "hidden"},
    dashHeroHalo: {position: "absolute", width: 240, height: 170, right: -38, top: 12, backgroundColor: "#E0F3F2", borderTopLeftRadius: 120, borderTopRightRadius: 90},
    dashHeroLeafOne: {position: "absolute", height: 65, width: 37, top: 27, right: 18, transform: [{rotate: "-32deg"}], borderTopLeftRadius: 42, borderBottomRightRadius: 42, backgroundColor: "#4EB6A5"},
    dashHeroLeafTwo: {position: "absolute", height: 53, width: 26, bottom: 3, left: 24, transform: [{rotate: "22deg"}], borderTopRightRadius: 40, borderBottomLeftRadius: 40, backgroundColor: "#9FDBD3"},
    dashHeroDocument: {position: "absolute", height: 128, width: 158, top: 20, right: 72, borderRadius: 12, borderWidth: 8, borderColor: "#087A90", backgroundColor: "#FFFFFF", transform: [{rotate: "-8deg"}], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, shadowColor: "#0C4853", shadowOpacity: 0.18, shadowRadius: 8, elevation: 3},
    dashHeroLogo: {width: 42, height: 42},
    dashHeroLines: {gap: 7},
    dashHeroLine: {height: 5, borderRadius: 4, backgroundColor: "#C7DAE1"},
    dashHeroMedallion: {position: "absolute", backgroundColor: "#EDB82E", borderWidth: 4, borderColor: "#FFE8A7", width: 54, height: 54, borderRadius: 27, justifyContent: "center", alignItems: "center", bottom: 2, right: 48, elevation: 4},
    dashNotice: {flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 16, paddingHorizontal: 19, backgroundColor: "#EAF8F5", borderWidth: 1, borderColor: "#CDEAE1", borderRadius: 14},
    dashNoticeIcon: {width: 51, height: 51, borderRadius: 26, backgroundColor: "#078F82", alignItems: "center", justifyContent: "center", borderWidth: 5, borderColor: "#BFE6DD"},
    dashNoticeCopy: {flex: 1, gap: 5},
    dashNoticeTitle: {fontSize: 13, fontWeight: "900", color: "#123C4D", lineHeight: 20},
    dashNoticeBody: {fontSize: 12, color: "#47697C", lineHeight: 18},
    dashSection: {backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E3EBF1", borderRadius: 18, padding: 17, gap: 16, shadowColor: "#123C4C", shadowOpacity: 0.035, shadowRadius: 12, shadowOffset: {width: 0, height: 4}, elevation: 1},
    dashSectionHeader: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10},
    dashSectionHeaderStack: {alignItems: "flex-start", flexDirection: "column"},
    dashSectionInfo: {flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 13},
    dashSectionTitleWrap: {flex: 1, minWidth: 0},
    dashSectionIcon: {width: 49, height: 49, backgroundColor: "#058C80", borderRadius: 13, alignItems: "center", justifyContent: "center", shadowColor: "#068D83", shadowOpacity: 0.12, shadowRadius: 8},
    dashSectionTitle: {fontSize: 18, fontWeight: "900", color: "#12324C"},
    dashSectionDescription: {color: "#58738B", fontSize: 12, lineHeight: 18, marginTop: 5},
    dashSectionControls: {flexDirection: "row", alignItems: "center", gap: 10},
    dashViewAll: {flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#D0E0E8", borderRadius: 9, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: "#FFFFFF"},
    dashViewAllText: {fontSize: 11, fontWeight: "800", color: "#164057"},
    dashCount: {height: 38, width: 38, borderRadius: 20, backgroundColor: "#E0F5F0", justifyContent: "center", alignItems: "center"},
    dashCountNumber: {fontSize: 16, fontWeight: "900", color: "#078F82"},
    dashCountLabel: {fontSize: 11, color: "#55758A"},
    dashEmpty: {borderRadius: 13, borderWidth: 1, borderColor: "#E5EEF2", minHeight: 214, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 23, backgroundColor: "#FCFDFE"},
    dashEmptyGraphic: {width: 230, height: 74, alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 10},
    dashEmptyCloudLeft: {position: "absolute", width: 135, height: 45, borderTopLeftRadius: 90, borderTopRightRadius: 90, bottom: 0, left: 9, backgroundColor: "#EFF5FA"},
    dashEmptyCloudRight: {position: "absolute", width: 135, height: 48, borderTopLeftRadius: 90, borderTopRightRadius: 90, bottom: 0, right: 9, backgroundColor: "#EAF2F8"},
    dashEmptyDocument: {height: 66, width: 67, backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#B7D3DC", borderRadius: 9, justifyContent: "center", alignItems: "center", shadowColor: "#345566", shadowOpacity: 0.07, shadowRadius: 5},
    dashEmptyTitle: {fontSize: 14, fontWeight: "900", color: "#16374F", textAlign: "center"},
    dashEmptyText: {marginTop: 7, fontSize: 12, lineHeight: 20, color: "#58738B", textAlign: "center", maxWidth: 580},
    dashBrowseButton: {marginTop: 17, borderRadius: 9, backgroundColor: "#087F78", minHeight: 37, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8},
    dashBrowseText: {color: "#FFFFFF", fontSize: 12, fontWeight: "900"},
    dashCardGrid: {flexDirection: "row", flexWrap: "wrap", gap: 13},
    dashGridItem: {width: "100%"},
    dashGridItemTwo: {width: "49%", flexGrow: 1, flexBasis: "45%"},
    dashCertificateCard: {flexDirection: "row", backgroundColor: "#FBFDFD", borderWidth: 1, borderColor: "#E4ECF2", borderRadius: 12, padding: 12, gap: 13, minHeight: 262},
    dashCertificateCardStack: {flexDirection: "column"},
    dashThumbnailWrap: {width: "49%", flexShrink: 0, minWidth: 0},
    dashThumbnailWrapStack: {width: "100%", alignSelf: "center", maxWidth: 420},
    dashMiniPaper: {flex: 1, minHeight: 246, backgroundColor: "#FFFEF7", borderRadius: 8, overflow: "hidden", paddingHorizontal: 14, paddingVertical: 12, alignItems: "center", justifyContent: "space-between", shadowColor: "#1F4B4D", shadowOpacity: 0.12, shadowRadius: 7, elevation: 1},
    dashMiniBorder: {position: "absolute", top: 8, bottom: 8, right: 8, left: 8, borderWidth: 1.5, borderColor: "#C4CCB2", borderRadius: 2},
    dashMiniCornerTop: {position: "absolute", left: 0, top: 0, height: 19, width: 130, backgroundColor: "#05847F", transform: [{rotate: "-6deg"}]},
    dashMiniCornerBottom: {position: "absolute", bottom: 0, right: 0, height: 16, width: 120, backgroundColor: "#007B73", transform: [{rotate: "-8deg"}]},
    dashMiniBrand: {flexDirection: "row", gap: 5, alignItems: "center", marginTop: 9, zIndex: 1},
    dashMiniLogo: {width: 28, height: 28},
    dashMiniBrandName: {fontSize: 11, fontWeight: "900", color: "#008277"},
    dashMiniBrandSub: {fontSize: 4.8, color: "#466C75"},
    dashMiniHeading: {fontFamily: "Georgia", fontSize: 17, fontWeight: "900", color: "#15374B", marginTop: 9, letterSpacing: 0.5, textAlign: "center"},
    dashMiniOf: {fontSize: 8, fontWeight: "800", color: "#B38C42", letterSpacing: 1.3, marginTop: -5, textAlign: "center"},
    dashMiniPresented: {fontSize: 7, color: "#698083", marginTop: 9},
    dashMiniRecipient: {fontSize: 14, fontFamily: "Georgia", fontWeight: "900", textAlign: "center", color: "#122E47", lineHeight: 19},
    dashMiniRule: {width: "75%", height: 1, backgroundColor: "#D5DCCC", marginTop: 3},
    dashMiniReason: {fontSize: 8.5, textAlign: "center", fontWeight: "700", color: "#445D65", lineHeight: 12, marginTop: 5},
    dashMiniDate: {fontSize: 7, color: "#637F7F", marginTop: 5},
    dashMiniFooter: {width: "100%", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 5, zIndex: 1, marginTop: 13},
    dashMiniIssuer: {fontSize: 6.5, color: "#5F7373", flex: 1},
    dashMiniId: {fontSize: 6, color: "#5F7373", maxWidth: "48%"},
    dashMiniRevoked: {position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFFFFBF", alignItems: "center", justifyContent: "center", zIndex: 2},
    dashMiniRevokedText: {fontSize: 25, color: "#B94141", fontWeight: "900", transform: [{rotate: "-18deg"}]},
    dashCertificateInfo: {flex: 1, minWidth: 0, justifyContent: "center", gap: 9},
    dashCertTitle: {fontSize: 13.5, fontWeight: "900", color: "#113750", marginBottom: 3},
    dashMetaRow: {flexDirection: "row", alignItems: "flex-start", gap: 6},
    dashMetaText: {fontSize: 10.5, color: "#55728D", flex: 1, lineHeight: 16},
    dashStatusPill: {flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#E4F6EE", borderRadius: 22, paddingHorizontal: 9, paddingVertical: 6, alignSelf: "flex-start"},
    dashStatusRevoked: {backgroundColor: "#FFF0F0"},
    dashStatusText: {color: "#078F77", fontSize: 9.5, fontWeight: "900"},
    dashStatusTextRevoked: {color: "#B23F42"},
    dashViewButton: {minHeight: 36, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#006474", flexDirection: "row", gap: 7, justifyContent: "center", alignItems: "center"},
    dashViewButtonText: {fontSize: 10.5, fontWeight: "900", color: "#FFFFFF"},
    dashCardActions: {flexDirection: "row", flexWrap: "wrap", gap: 6},
    dashOutlineButton: {borderWidth: 1, borderColor: "#C9DBE4", borderRadius: 7, minHeight: 34, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FFFFFF"},
    dashOutlineButtonText: {fontSize: 10, fontWeight: "800", color: "#0B425D"},
    dashModalBackdrop: {flex: 1, backgroundColor: "#061D2BC7", justifyContent: "center", alignItems: "center", padding: 18},
    dashModalPanel: {width: "100%", maxWidth: 750, height: "94%", backgroundColor: "#F4F8FB", borderRadius: 16, overflow: "hidden"},
    dashModalPanelMobile: {height: "100%", borderRadius: 10},
    dashModalTopbar: {flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#E2EBEF", backgroundColor: "#FFFFFF"},
    dashModalEyebrow: {fontSize: 9, fontWeight: "900", letterSpacing: 1.2, color: "#078F82"},
    dashModalTitle: {fontSize: 17, fontWeight: "900", color: "#16384B", marginTop: 4},
    dashModalClose: {width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center", backgroundColor: "#EFF3F5"},
    dashModalBody: {flex: 1},
    dashModalScroll: {paddingVertical: 20, paddingHorizontal: 14, alignItems: "stretch"},
    dashModalFooter: {padding: 12, borderTopWidth: 1, borderTopColor: "#DFE8EE", flexDirection: "row", justifyContent: "flex-end", gap: 9, flexWrap: "wrap", backgroundColor: "#FFFFFF"},
  });