import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import ListPagination from "../../components/ui/ListPagination";
import DocumentScreeningSummary from "../../components/identity/DocumentScreeningSummary";
import type { DocumentScreening } from "../../lib/identityVerification";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Image,
    Modal,
    ScrollView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";

import { useUserSession } from "../../lib/useUserSession";

const BACKEND_URL = "https://volunserve.onrender.com";

type ReviewFilter = "pending" | "verified" | "retry_required" | "rejected" | "all";

type IdentityReview = {
  uid: string;
  verificationId?: string;
  verificationMethod?: string;
  status?: string;
  identityStatus?: string;
  identityVerified?: boolean;
  aiDecision?: string;
  decision?: string;
  matchScore?: number | null;
  livenessScore?: number | null;
  documentScreening?: DocumentScreening;
  reviewTrack?: "blurry_id_review" | "priority_admin_review" | "standard_admin_review" | "none";
  message?: string;
  requiresManualReview?: boolean;
  evidenceAvailable?: boolean;
  manualReviewDecision?: string;
  manualValidationMethod?: string;
  manualReviewNotes?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  lastSubmissionAt?: string;
  resident?: {
    fullName?: string;
    email?: string;
    phoneNumber?: string;
    barangay?: string;
    address?: string;
    accountStatus?: string;
    residentAccess?: boolean;
  };
};

const VALIDATION_METHODS = [
  {value:"psa_national_id_qr_check",label:"PSA National ID Check (official QR verification)",icon:"qr-code-outline" as const},
  {
    value: "in_person_lgu_validation",
    label: "In-person LGU validation",
    icon: "person-outline" as const,
  },
  {
    value: "barangay_lgu_record_check",
    label: "Barangay / LGU record check",
    icon: "document-text-outline" as const,
  },
  {
    value: "official_document_check",
    label: "Official document check",
    icon: "card-outline" as const,
  },
];

function formatDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function reviewBucket(item: IdentityReview): ReviewFilter {
  if (item.requiresManualReview === true && item.status === "pending") {
    return "pending";
  }

  if (
    item.identityVerified === true ||
    item.status === "verified" ||
    item.manualReviewDecision === "verified"
  ) {
    return "verified";
  }

  if (item.manualReviewDecision === "rejected") return "rejected";

  if (
    item.status === "failed" ||
    item.manualReviewDecision === "retry_required"
  ) {
    return "retry_required";
  }

  return "all";
}

export default function IdentityReviewsAdmin() {
  const params = useLocalSearchParams<{ uid?: string }>();
  const { loading: sessionLoading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();
  const wide = width >= 1240;
  const scrollRef = useRef<ScrollView | null>(null);

  const [items, setItems] = useState<IdentityReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (typeof params.uid === "string") { setSearch(params.uid); setPage(1); }
  }, [params.uid]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;
  const [selected, setSelected] = useState<IdentityReview | null>(null);
  const [queueMode, setQueueMode] = useState(false);
  const [validationMethod, setValidationMethod] = useState("");
  const [issuerReviewAttested,setIssuerReviewAttested] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState<"" | "verify" | "require_retry" | "reject">("");

  const role =
    typeof profile?.role === "string"
      ? profile.role.toLowerCase()
      : "";

  const isAdmin =
    !!user &&
    !!profile &&
    role === "admin" &&
    profile.status === "approved";

  const loadReviews = async () => {
    if (!user || !isAdmin) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const token = await user.getIdToken(true);
      const response = await fetch(
        `${BACKEND_URL}/api/admin/identity/reviews`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.ok) {
        throw new Error(
          body?.message ||
            body?.error ||
            `Identity reviews returned HTTP ${response.status}.`,
        );
      }

      const nextItems: IdentityReview[] = Array.isArray(body.items)
        ? body.items
        : [];

      setItems(nextItems);

      if (selected) {
        const updated = nextItems.find(
          (item) => item.uid === selected.uid,
        );
        if (updated) setSelected(updated);
      }
    } catch (loadError: any) {
      setError(
        loadError?.message ||
          "Unable to load identity verification reviews.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionLoading) return;
    void loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, user?.uid, isAdmin]);

  const counts = useMemo(() => {
    const result = {
      pending: 0,
      verified: 0,
      retry_required: 0,
      rejected: 0,
      all: items.length,
    };

    items.forEach((item) => {
      const bucket = reviewBucket(item);
      if (bucket === "pending") result.pending += 1;
      if (bucket === "verified") result.verified += 1;
      if (bucket === "retry_required") result.retry_required += 1;
      if (bucket === "rejected") result.rejected += 1;
    });

    return result;
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const bucket = reviewBucket(item);
      if (filter !== "all" && bucket !== filter) return false;
      if (!query) return true;

      const haystack = [
        item.resident?.fullName,
        item.resident?.email,
        item.resident?.barangay,
        item.verificationId,
        item.uid,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    }).sort((a, b) => {
      // Only prioritize pending identity checks. Never award Verified status
      // on account of a perceived name match or a camera quality score.
      if (reviewBucket(a) !== "pending" || reviewBucket(b) !== "pending") return 0;
      const priority = (item: IdentityReview) =>
        item.reviewTrack === "priority_admin_review" ? 0
          : item.reviewTrack === "blurry_id_review" ? 2 : 1;
      return priority(a) - priority(b);
    });
  }, [filter, items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const activePage = Math.max(1, Math.min(page, totalPages));
  const pagedReviews = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  useEffect(() => {
    if (!wide || queueMode || loading || selected || pagedReviews.length === 0) return;
    openReview(pagedReviews[0]);
    // Only open automatically in a wide layout; tablet/phone retains queue navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, queueMode, loading, selected, page, filter, items, search]);

  const openReview = (item: IdentityReview) => {
    scrollRef.current?.scrollTo({y:0,animated:false});
    setQueueMode(false);
    setSelected(item);
    setValidationMethod(item.manualValidationMethod || "");
    setIssuerReviewAttested(false);
    setNotes(item.manualReviewNotes || "");
  };

  const saveDecision = async (
    action: "verify" | "require_retry" | "reject",
  ) => {
    if (!selected || !user || saving) return;

    if (action === "verify" && selected.reviewTrack === "blurry_id_review") {
      Alert.alert(
        "Clear ID Evidence Required",
        "This claimed National ID is too blurry to identify. You may request a new scan, but it cannot be approved from the unreadable OCR result.",
      );
      return;
    }
    if (action === "verify" && !validationMethod) {
      Alert.alert(
        "Validation Method Required",
        "Select how the Resident was independently validated by LGU/Admin.",
      );
      return;
    }

    if (action === "verify" && (!issuerReviewAttested || notes.trim().length < 10)) {
      Alert.alert("Independent Review Required","Complete the official or in-person government ID check, confirm it, and add brief privacy-safe review notes.");
      return;
    }

    if (action === "reject" && notes.trim().length < 10) {
      Alert.alert("Rejection Reason Required",
        "Explain why the submitted identity evidence is rejected (at least 10 characters).");
      return;
    }
    if (action === "require_retry" && notes.trim().length < 5) {
      Alert.alert(
        "Retry Reason Required",
        "Enter a clear reason so the Resident knows what must be corrected.",
      );
      return;
    }

    const confirmFn = (globalThis as any)?.confirm;
    if (typeof confirmFn === "function") {
      const confirmed = confirmFn(
        action === "verify"
          ? "Verify this Resident identity after independent LGU/Admin validation?"
          : action === "reject"
            ? "Reject this identity submission? The Resident can submit a corrected verification."
            : "Require this Resident to retry identity verification?",
      );
      if (!confirmed) return;
    }

    try {
      setSaving(action);

      const token = await user.getIdToken(true);
      const response = await fetch(
        `${BACKEND_URL}/api/admin/identity/reviews/${encodeURIComponent(
          selected.uid,
        )}/decision`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            validationMethod:
              action === "verify" ? validationMethod : "",
            notes: notes.trim(),
            issuerReviewAttested: action === "verify" && issuerReviewAttested,
          }),
        },
      );

      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.ok) {
        throw new Error(
          body?.message ||
            body?.error ||
            `Identity review returned HTTP ${response.status}.`,
        );
      }

      Alert.alert(
        action === "verify"
          ? "Identity Verified"
          : action === "reject" ? "Submission Rejected" : "Retry Required",
        body?.message ||
          (action === "verify"
            ? "The Resident is now identity verified."
            : action === "reject"
              ? "The identity submission was rejected. The Resident can submit corrected evidence."
              : "The Resident must submit identity verification again."),
      );

      setQueueMode(true);
      setSelected(null);
      setValidationMethod("");
      setNotes("");
      await loadReviews();
    } catch (saveError: any) {
      Alert.alert(
        "Unable to Save Decision",
        saveError?.message ||
          "The identity review decision could not be saved.",
      );
    } finally {
      setSaving("");
    }
  };

  if (sessionLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.centerText}>
          Checking administrator access...
        </Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="lock-closed-outline"
          size={44}
          color="#94A3B8"
        />
        <Text style={styles.emptyTitle}>Admin access required</Text>
        <Text style={styles.centerText}>
          Only an approved operational Admin can review Resident identity verification.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={[styles.scroll, Platform.OS === "web" && styles.webScrollBar]}
        contentContainerStyle={[styles.page, !wide && styles.pageCompact]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Resident identity reviews"
      >
        <View style={styles.premiumHeading}>
          <Text style={styles.premiumPageTitle}>Resident Identity Reviews</Text>
          <Text style={styles.premiumPageSubtitle}>
            Review resident identity submissions with AI-assisted screening and independent LGU validation.
          </Text>
        </View>
        <View style={styles.premiumBreadcrumb}>
          <Ionicons name="home-outline" size={17} color="#08765A" />
          <Text style={styles.premiumBreadcrumbText}>People &amp; Verification</Text>
          <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
          <Text style={styles.premiumBreadcrumbText}>Resident Identity Reviews</Text>
          <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
          <Text style={styles.premiumBreadcrumbCurrent}>{selected ? "Review Details" : "All Reviews"}</Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#08765A" />
            <Text style={styles.centerText}>Loading identity reviews...</Text>
          </View>
        ) : selected ? (
          <>
            <View style={styles.premiumReviewHeader}>
              <TouchableOpacity accessibilityRole="button"
                style={styles.premiumBackButton}
                onPress={() => {
                  setQueueMode(true);
                  setSelected(null);
                  setIssuerReviewAttested(false);
                  scrollRef.current?.scrollTo({y:0,animated:false});
                }}>
                <Ionicons name="arrow-back-outline" size={19} color="#08765A" />
                <Text style={styles.premiumBackText}>Back to List</Text>
              </TouchableOpacity>
              <View style={styles.premiumReviewTitleWrap}>
                <Ionicons name="document-text-outline" size={28} color="#08765A" />
                <View style={styles.flexOne}>
                  <Text style={styles.premiumReviewTitle}>Identity Review Details</Text>
                  <Text style={styles.premiumReviewSubtitle} numberOfLines={2}>
                    Verification ID: {selected.verificationId || "Not available"}
                  </Text>
                </View>
              </View>
              <StatusChip bucket={reviewBucket(selected)} />
            </View>
            <ReviewDetail
              item={selected}
              viewer={user}
              screenWide={wide}
              validationMethod={validationMethod}
              setValidationMethod={setValidationMethod}
              issuerReviewAttested={issuerReviewAttested}
              setIssuerReviewAttested={setIssuerReviewAttested}
              notes={notes}
              setNotes={setNotes}
              saving={saving}
              onVerify={() => void saveDecision("verify")}
              onRetry={() => void saveDecision("require_retry")}
              onReject={() => void saveDecision("reject")}
            />
          </>
        ) : (
          <>
            <View style={styles.summaryMetrics}>
              {[
                {label:"Pending Review",value:counts.pending,icon:"time-outline" as const},
                {label:"Verified",value:counts.verified,icon:"shield-checkmark-outline" as const},
                {label:"Retry Required",value:counts.retry_required,icon:"refresh-circle-outline" as const},
                {label:"Rejected",value:counts.rejected,icon:"close-circle-outline" as const},
                {label:"Total Records",value:counts.all,icon:"people-outline" as const},
              ].map(metric => (
                <View key={metric.label} style={styles.summaryMetric}>
                  <View style={styles.summaryIcon}>
                    <Ionicons name={metric.icon} size={19} color="#08765A" />
                  </View>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.summaryLabel}>{metric.label}</Text>
                    <Text style={styles.summaryValue}>{metric.value}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.premiumQueuePanel}>
              <View style={styles.queueHeading}>
                <View style={styles.flexOne}>
                  <Text style={styles.queueTitle}>Identity Verification Queue</Text>
                  <Text style={styles.queueSubheading}>
                    Select a submission to review its evidence and verification results.
                  </Text>
                </View>
                <TouchableOpacity style={styles.refreshButton}
                  onPress={() => void loadReviews()} accessibilityRole="button"
                  accessibilityLabel="Refresh verification queue">
                  <Ionicons name="refresh-outline" size={18} color="#08765A" />
                  <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.filterRow}>
                {([
                  {key:"pending" as const,label:"Pending",count:counts.pending},
                  {key:"verified" as const,label:"Verified",count:counts.verified},
                  {key:"retry_required" as const,label:"Retry Required",count:counts.retry_required},
                  {key:"rejected" as const,label:"Rejected",count:counts.rejected},
                  {key:"all" as const,label:"All",count:counts.all},
                ]).map(option => (
                  <TouchableOpacity key={option.key} accessibilityRole="button"
                    accessibilityState={{selected:filter===option.key}}
                    style={[styles.filterButton,filter===option.key&&styles.filterButtonActive]}
                    onPress={() => {setFilter(option.key);setPage(1);}}>
                    <Text style={[styles.filterButtonText,filter===option.key&&styles.filterButtonTextActive]}>
                      {option.label} ({option.count})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={18} color="#64748B" />
                <TextInput value={search} style={styles.searchInput}
                  onChangeText={value=>{setSearch(value);setPage(1);}}
                  placeholder="Search resident, email, barangay, or verification ID"
                  placeholderTextColor="#94A3B8" />
              </View>
              {pagedReviews.length === 0 ? (
                <View style={styles.queueEmptyState}>
                  <Ionicons name="search-outline" size={27} color="#94A3B8" />
                  <Text style={styles.queueEmptyTitle}>No matching verification records</Text>
                  <Text style={styles.queueEmptyText}>Change your search or select another status.</Text>
                </View>
              ) : (
                <View style={styles.premiumQueueCards}>
                  {pagedReviews.map(item => (
                    <TouchableOpacity key={item.uid} style={styles.premiumQueueCard}
                      accessibilityRole="button" onPress={() => openReview(item)}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {String(item.resident?.fullName || "R").trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.flexOne}>
                        <Text style={styles.residentName}>{item.resident?.fullName || "Resident"}</Text>
                        <Text style={styles.residentMeta}>{item.resident?.barangay || "Barangay not set"} · {formatDate(item.lastSubmissionAt || item.updatedAt || item.createdAt)}</Text>
                        <Text style={styles.premiumQueueSummary} numberOfLines={1}>
                          {item.reviewTrack === "blurry_id_review" ? "Blurry ID — rescan review" : item.message || "Review the submitted record"}
                        </Text>
                      </View>
                      <StatusChip bucket={reviewBucket(item)} />
                      <Ionicons name="chevron-forward-outline" size={19} color="#94A3B8" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={styles.queueFooter}>
                <Text style={styles.queueFooterLabel}>
                  {filtered.length ? (activePage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(activePage * PAGE_SIZE, filtered.length)} of {filtered.length} records · 5 per page
                </Text>
                <ListPagination page={activePage} total={filtered.length} pageSize={PAGE_SIZE}
                  onChange={next=>setPage(next)} />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatusChip({ bucket }: { bucket: ReviewFilter }) {
  const meta =
    bucket === "pending"
      ? { label: "Pending", background: "#FEF3C7", color: "#92400E" }
      : bucket === "verified"
        ? { label: "Verified", background: "#DCFCE7", color: "#166534" }
        : bucket === "retry_required"
          ? { label: "Retry", background: "#FEE2E2", color: "#B91C1C" }
          : { label: "Other", background: "#F1F5F9", color: "#475569" };

  return (
    <View
      style={[
        styles.statusChip,
        { backgroundColor: meta.background },
      ]}
    >
      <Text
        style={[
          styles.statusChipText,
          { color: meta.color },
        ]}
      >
        {meta.label}
      </Text>
    </View>
  );
}

function ReviewDetail({
  item,
  viewer,
  screenWide,
  validationMethod,
  setValidationMethod,
  issuerReviewAttested,
  setIssuerReviewAttested,
  notes,
  setNotes,
  saving,
  onVerify,
  onRetry,
  onReject,
}: {
  item: IdentityReview;
  viewer: {getIdToken: (forceRefresh?: boolean) => Promise<string>} | null;
  screenWide: boolean;
  validationMethod: string;
  setValidationMethod: (value: string) => void;
  issuerReviewAttested: boolean;
  setIssuerReviewAttested: (value: boolean) => void;
  notes: string;
  setNotes: (value: string) => void;
  saving: "" | "verify" | "require_retry" | "reject";
  onVerify: () => void;
  onRetry: () => void;
  onReject: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"review" | "history" | "audit">("review");
  const [evidenceUris, setEvidenceUris] = useState<{
    front?: string | null; back?: string | null; selfie?: string | null;
  } | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [zoomedEvidence, setZoomedEvidence] = useState<string | null>(null);
  const [evidenceRefresh, setEvidenceRefresh] = useState(0);
  useEffect(() => { setActiveTab("review"); }, [item.uid, item.verificationId]);
  useEffect(() => {
    let active = true;
    setEvidenceUris(null);
    setEvidenceError("");
    setZoomedEvidence(null);
    if (!viewer || !item.evidenceAvailable) {
      setEvidenceLoading(false);
      return () => { active = false; };
    }
    setEvidenceLoading(true);
    void (async () => {
      try {
        const token = await viewer.getIdToken(true);
        const response = await fetch(
          `${BACKEND_URL}/api/admin/identity/reviews/${encodeURIComponent(item.uid)}/evidence`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.ok || body.verificationId !== item.verificationId) {
          throw new Error(body?.message || "The private evidence viewer is unavailable.");
        }
        if (active) setEvidenceUris(body.images || null);
      } catch (error: any) {
        if (active) setEvidenceError(error?.message || "Unable to load protected identity photos.");
      } finally {
        if (active) setEvidenceLoading(false);
      }
    })();
    return () => { active = false; };
  }, [viewer, item.uid, item.verificationId, item.evidenceAvailable, evidenceRefresh]);
  const pending = reviewBucket(item) === "pending";
  const nationalId = item.documentScreening?.declaredIdType === "national_id";
  const blurry = item.reviewTrack === "blurry_id_review";
  const availableMethods = VALIDATION_METHODS.filter(m =>
    nationalId ? m.value === "psa_national_id_qr_check" : m.value !== "psa_national_id_qr_check"
  );

  const idQuality = String(item.documentScreening?.imageQualityStatus || "").toLowerCase();
  const weakImage = blurry || idQuality === "low" || idQuality === "poor";
  const recognized = item.documentScreening?.status === "text_consistent_unverified" &&
    item.documentScreening?.declaredIdType === item.documentScreening?.detectedIdType;
  const faceScore = typeof item.matchScore === "number" &&
    Number.isFinite(item.matchScore) && item.matchScore >= 0 && item.matchScore <= 1
    ? (item.matchScore * 100).toFixed(1) + "%" : "Not evaluated";
  const declaredIdLabel = item.documentScreening?.declaredIdType === "national_id"
    ? "Philippine National ID" :
    String(item.documentScreening?.declaredIdType || "Unspecified").replace(/_/g, " ");
  const checkRows = [
    {
      name:"Document upload",
      value:item.evidenceAvailable ? "Protected evidence available" : "Earlier images not retained",
      ok:item.evidenceAvailable===true,
      warning:!item.evidenceAvailable,
    },
    {
      name:"Government ID type",
      value:recognized ? declaredIdLabel + " (OCR consistent)" :
        declaredIdLabel + " — not confirmed by OCR",
      ok:recognized,
      warning:!recognized,
    },
    {
      name:"Image quality",
      value:weakImage ? "Blurry — clearer scan needed" :
        idQuality === "adequate" ? "Adequate for preliminary screening" : "Not confirmed",
      ok:!weakImage && idQuality === "adequate",
      warning:weakImage,
    },
    {
      name:"Face matching",
      value:faceScore === "Not evaluated" ? "Not yet evaluated" :
        faceScore + " preliminary similarity",
      ok:false,
      warning:false,
    },
  ];
  const openIssuerCheck = () => void Linking.openURL("https://everify.gov.ph/check");

  return (
    <View style={[styles.premiumDetailColumns, !screenWide && styles.premiumDetailStack]}>
      <View style={[styles.premiumLeftColumn, !screenWide && styles.premiumFullWidth]}>
        <View style={styles.premiumCard}>
          <View style={styles.premiumResidentHeader}>
            <View style={styles.premiumResidentIcon}>
              <Ionicons name="person-outline" size={28} color="#08765A" />
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.premiumResidentName}>{item.resident?.fullName || "Resident"}</Text>
              <Text style={styles.premiumResidentEmail} numberOfLines={2}>
                {item.resident?.email || "Email not available"}
              </Text>
            </View>
          </View>
          <View style={styles.premiumInfoDivider} />
          <InfoLine label="Account Type" value={item.identityVerified === true ? "Verified Resident" : "Basic Resident"} />
          <InfoLine label="Barangay" value={item.resident?.barangay || "Not set"} />
          <InfoLine label="Submitted" value={formatDate(item.lastSubmissionAt || item.createdAt)} />
          <InfoLine label="Verification ID" value={item.verificationId || "Not available"} />
        </View>

        <View style={styles.premiumCard}>
          <View style={styles.premiumCardTitleRow}>
            <Ionicons name="hardware-chip-outline" size={21} color="#08765A" />
            <Text style={styles.premiumCardTitle}>AI Verification Result</Text>
          </View>
          <View style={styles.premiumFaceResult}>
            <Text style={styles.premiumFaceValue}>{faceScore}</Text>
            <Text style={styles.premiumSubCopy}>Preliminary face similarity; not identity proof.</Text>
          </View>
          <View style={styles.premiumResultRow}>
            <Text style={styles.premiumResultLabel}>ID Quality</Text>
            <Text style={[styles.premiumResultValue,weakImage && styles.premiumWarningText]}>
              {weakImage ? "Low · Blurry" : idQuality || "Not evaluated"}
            </Text>
          </View>
          <View style={styles.premiumResultRow}>
            <Text style={styles.premiumResultLabel}>ID Back Screening</Text>
            <Text style={styles.premiumResultValue}>
              {item.documentScreening?.backSideScreened === true
                ? "Screened · Unverified" : "Not evaluated"}
            </Text>
          </View>
          <View style={styles.premiumResultRow}>
            <Text style={styles.premiumResultLabel}>AI Route</Text>
            <Text style={[styles.premiumResultValue,blurry && styles.premiumWarningText]}>
              {blurry ? "Rescan required" :
                item.reviewTrack === "priority_admin_review"
                  ? "Priority Admin review" : "Independent LGU review"}
            </Text>
          </View>
        </View>

        <View style={styles.premiumCard}>
          <View style={styles.premiumCardTitleRow}>
            <Ionicons name="shield-checkmark-outline" size={21} color="#08765A" />
            <Text style={styles.premiumCardTitle}>Independent LGU Validation</Text>
          </View>
          {pending ? (
            <>
              <Text style={styles.premiumSubCopy}>
                {blurry ? "Unclear National ID: request a new scan. Approval is blocked." :
                  "Select the method actually completed. AI and OCR alone are not sufficient."}
              </Text>
              <View style={styles.premiumMethodOptions}>
                {availableMethods.map(method => (
                  <TouchableOpacity key={method.value} accessibilityRole="radio"
                    accessibilityState={{selected:validationMethod===method.value}}
                    style={[styles.premiumMethod,validationMethod===method.value&&styles.premiumMethodSelected]}
                    onPress={() => setValidationMethod(method.value)}>
                    <Ionicons
                      name={validationMethod===method.value ? "radio-button-on-outline" : "radio-button-off-outline"}
                      size={20} color="#08765A" />
                    <Text style={styles.premiumMethodText}>{method.label}</Text>
                    {nationalId ? (
                      <TouchableOpacity accessibilityRole="link"
                        accessibilityLabel="Open official PSA National ID check"
                        onPress={openIssuerCheck}>
                        <Ionicons name="open-outline" size={18} color="#08765A" />
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity accessibilityRole="checkbox"
                accessibilityState={{checked:issuerReviewAttested}}
                style={styles.premiumAttestation}
                onPress={() => setIssuerReviewAttested(!issuerReviewAttested)}>
                <Ionicons name={issuerReviewAttested ? "checkbox-outline" : "square-outline"}
                  color="#08765A" size={22} />
                <Text style={styles.premiumAttestationText}>
                  I personally completed the independent identity check.
                  No official verification result is automatically transferred to VolunServe.
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <InfoLine label="Decision" value={item.manualReviewDecision || item.decision || item.status || "—"} />
              <InfoLine label="Method" value={item.manualValidationMethod || "Not recorded"} />
              <InfoLine label="Reviewed By" value={item.reviewedByName || item.reviewedBy || "—"} />
              <InfoLine label="Reviewed At" value={formatDate(item.reviewedAt)} />
            </>
          )}
        </View>
      </View>

      <View style={[styles.premiumRightColumn,!screenWide && styles.premiumFullWidth]}>
        <View style={styles.premiumCard}>
          <View style={styles.premiumCardTitleRow}>
            <Ionicons name="document-text-outline" size={21} color="#08765A" />
            <View style={styles.flexOne}>
              <Text style={styles.premiumCardTitle}>Submitted Identity Evidence</Text>
              <Text style={styles.premiumSubCopy}>Review the government ID images and live selfie before a decision.</Text>
            </View>
            <TouchableOpacity accessibilityRole="button"
              accessibilityLabel="Refresh secure identity images"
              onPress={()=>setEvidenceRefresh(value=>value+1)}
              disabled={!item.evidenceAvailable}>
              <Ionicons name="refresh-outline" size={20}
                color={item.evidenceAvailable ? "#08765A" : "#CBD5E1"} />
            </TouchableOpacity>
          </View>
          <View style={styles.premiumEvidenceTiles}>
            {([
              {key:"front" as const,label:"Government ID — Front",icon:"id-card-outline" as const},
              {key:"back" as const,label:"Government ID — Back",icon:"card-outline" as const},
              {key:"selfie" as const,label:"Live Selfie",icon:"person-outline" as const},
            ]).map(tile => {
              const uri = evidenceUris?.[tile.key];
              const notCaptured = tile.key === "selfie" &&
                item.verificationMethod === "volunserve_ai_ocr_manual_review";
              const description = evidenceLoading ? "Loading protected image..." :
                evidenceError ? "Photo unavailable" : notCaptured ? "Not captured (OCR only)" :
                item.evidenceAvailable ? "Not available" : "Not retained previously";
              return (
                <TouchableOpacity key={tile.key} style={styles.premiumEvidenceTile}
                  accessibilityRole="button" disabled={!uri}
                  accessibilityLabel={uri ? "Enlarge " + tile.label : tile.label + ": " + description}
                  onPress={() => uri && setZoomedEvidence(uri)}>
                  <View style={styles.premiumEvidenceImage}>
                    {uri ? (
                      <Image source={{uri}} resizeMode="contain"
                        style={styles.premiumEvidencePhoto}
                        accessibilityLabel={tile.label} />
                    ) : (
                      <>
                        {evidenceLoading ? <ActivityIndicator color="#08765A" /> :
                          <Ionicons name={tile.icon} size={28} color="#94A3B8" />}
                        <Text style={styles.premiumMissingLabel}>{description}</Text>
                      </>
                    )}
                  </View>
                  <View style={styles.premiumEvidenceFooter}>
                    <Text style={styles.premiumEvidenceText} numberOfLines={2}>{tile.label}</Text>
                    <Ionicons name={uri ? "checkmark-circle" : "ellipse-outline"}
                      size={18} color={uri ? "#08765A" : "#CBD5E1"} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          {evidenceError || !item.evidenceAvailable ? (
            <Text style={styles.premiumEvidenceNotice}>
              {evidenceError || "Earlier submissions did not store private images. Ask the Resident to submit a new scan."}
            </Text>
          ) : item.verificationMethod === "volunserve_ai_ocr_manual_review" ? (
            <Text style={styles.premiumEvidenceNotice}>
              This is an ID-only OCR review. No selfie has been captured and face matching has not been performed.
            </Text>
          ) : (
            <Text style={styles.premiumEvidenceNotice}>
              Enlarge photos to review. Authorized access only; temporary links expire after 3 minutes.
            </Text>
          )}

          <View style={styles.premiumInfoDivider} />
          <View style={styles.premiumCardTitleRow}>
            <Ionicons name="checkbox-outline" size={21} color="#08765A" />
            <Text style={styles.premiumCardTitle}>Verification Checks</Text>
          </View>
          <View style={[styles.premiumChecksLayout,!screenWide&&styles.premiumChecksStack]}>
            <View style={styles.premiumChecksTable}>
              {checkRows.map(row => (
                <View key={row.name} style={styles.premiumCheckRow}>
                  <Ionicons name={row.ok ? "checkmark-circle" :
                      row.warning ? "alert-circle" : "ellipse-outline"}
                    size={20} color={row.ok ? "#08765A" : row.warning ? "#D97706" : "#94A3B8"} />
                  <Text style={styles.premiumCheckName}>{row.name}</Text>
                  <Text style={styles.premiumCheckValue}>{row.value}</Text>
                </View>
              ))}
            </View>
            <View style={styles.premiumAssessment}>
              <View style={styles.premiumCardTitleRow}>
                <Ionicons name="information-circle-outline" size={20} color="#1D4ED8" />
                <Text style={styles.premiumAssessmentTitle}>Assessment Summary</Text>
              </View>
              <Text style={styles.premiumAssessmentText}>
                {blurry ? "The submitted National ID scan is too blurry to identify. Request a clearer scan before approval." :
                  item.documentScreening?.status === "mismatch"
                    ? "The declared ID type and scanned document do not match. Request a corrected submission."
                    : item.message || "AI screening is preliminary; independent LGU validation is required."}
              </Text>
            </View>
          </View>
          <Text style={styles.premiumDisclaimer}>
            AI/OCR checks are preliminary and do not prove government ID authenticity, residency, or liveness.
          </Text>

          {pending ? (
            <>
              <View style={styles.premiumNotesHeader}>
                <Text style={styles.premiumNotesLabel}>Review Notes / Retry Reason</Text>
                <Text style={styles.premiumNotesMeta}>Required for retry or rejection</Text>
              </View>
              <TextInput style={styles.premiumNotesInput} multiline
                maxLength={500} textAlignVertical="top" value={notes}
                onChangeText={setNotes}
                placeholder="Record LGU findings, document issues, or the reason for retry..."
                placeholderTextColor="#94A3B8" />
              <Text style={styles.premiumNotesCounter}>{notes.length}/500</Text>
              <View style={[styles.premiumActions,!screenWide&&styles.premiumActionsStack]}>
                <TouchableOpacity accessibilityRole="button"
                  style={[styles.premiumVerifyAction,
                    (blurry || !validationMethod || !issuerReviewAttested || notes.trim().length<10 || !!saving)
                      && styles.disabledButton]}
                  disabled={blurry || !validationMethod || !issuerReviewAttested || notes.trim().length<10 || !!saving}
                  onPress={onVerify}>
                  {saving === "verify" ? <ActivityIndicator color="#FFFFFF" /> :
                    <Ionicons name="shield-checkmark-outline" size={21} color="#FFFFFF" />}
                  <Text style={styles.premiumVerifyText}>Verify Resident</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button"
                  style={[styles.premiumRetryAction,(notes.trim().length<5 || !!saving)&&styles.disabledButton]}
                  disabled={notes.trim().length<5 || !!saving} onPress={onRetry}>
                  {saving === "require_retry" ? <ActivityIndicator color="#A16207" /> :
                    <Ionicons name="refresh-outline" size={20} color="#A16207" />}
                  <Text style={styles.premiumRetryText}>Require Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button"
                  style={[styles.premiumRejectAction,(notes.trim().length<10 || !!saving)&&styles.disabledButton]}
                  disabled={notes.trim().length<10 || !!saving} onPress={onReject}>
                  {saving === "reject" ? <ActivityIndicator color="#B91C1C" /> :
                    <Ionicons name="close-circle-outline" size={21} color="#B91C1C" />}
                  <Text style={styles.premiumRejectText}>Reject Verification</Text>
                </TouchableOpacity>
              </View>
              {blurry ? (
                <Text style={styles.premiumDecisionHint}>
                  This OCR-only or blurry ID case cannot be approved. Request a corrected scan after entering your review notes.
                </Text>
              ) : null}
            </>
          ) : (
            <View style={styles.premiumResolvedNotes}>
              <Text style={styles.premiumNotesLabel}>Recorded Review Notes</Text>
              <Text style={styles.premiumSubCopy}>
                {item.manualReviewNotes || "No review notes recorded."}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.premiumSecondaryTabs}>
          {([
            {key:"review" as const,label:"Review Overview"},
            {key:"history" as const,label:"Details & History"},
            {key:"audit" as const,label:"Audit Trail"},
          ]).map(tab => (
            <TouchableOpacity key={tab.key} onPress={()=>setActiveTab(tab.key)}
              style={[styles.premiumSecondaryTab,activeTab===tab.key&&styles.premiumSecondaryTabActive]}>
              <Text style={[styles.premiumSecondaryTabText,activeTab===tab.key&&styles.premiumSecondaryTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {activeTab === "history" ? (
          <View style={styles.premiumCard}>
            <View style={styles.premiumCardTitleRow}>
              <Ionicons name="time-outline" size={20} color="#08765A" />
              <Text style={styles.premiumCardTitle}>Details &amp; History</Text>
            </View>
            <InfoLine label="Resident" value={item.resident?.fullName || "—"} />
            <InfoLine label="Verification ID" value={item.verificationId || "—"} />
            <InfoLine label="Submitted" value={formatDate(item.lastSubmissionAt || item.createdAt)} />
            <InfoLine label="AI decision" value={item.aiDecision || "—"} />
            <InfoLine label="Status" value={item.status || "—"} />
            <DocumentScreeningSummary screening={item.documentScreening} />
          </View>
        ) : activeTab === "audit" ? (
          <View style={styles.premiumCard}>
            <View style={styles.premiumCardTitleRow}>
              <Ionicons name="document-text-outline" size={20} color="#08765A" />
              <Text style={styles.premiumCardTitle}>Recorded Audit Details</Text>
            </View>
            <InfoLine label="Manual decision" value={item.manualReviewDecision || "No decision recorded"} />
            <InfoLine label="Validation method" value={item.manualValidationMethod || "—"} />
            <InfoLine label="Reviewed by" value={item.reviewedByName || item.reviewedBy || "—"} />
            <InfoLine label="Reviewed at" value={formatDate(item.reviewedAt)} />
            <Text style={styles.premiumEvidenceNotice}>
              Additional access events are recorded in authorized system logs.
            </Text>
          </View>
        ) : null}
      </View>
      <Modal visible={Boolean(zoomedEvidence)} transparent animationType="fade"
        onRequestClose={()=>setZoomedEvidence(null)}>
        <View style={styles.fullScreenEvidence}>
          <TouchableOpacity style={styles.fullScreenEvidenceClose}
            accessibilityRole="button" onPress={()=>setZoomedEvidence(null)}>
            <Ionicons name="close-outline" size={22} color="#FFFFFF" />
            <Text style={styles.fullScreenEvidenceCloseText}>Close photo</Text>
          </TouchableOpacity>
          {zoomedEvidence ? (
            <Image source={{uri:zoomedEvidence}} resizeMode="contain"
              style={styles.fullScreenEvidenceImage}
              accessibilityLabel="Enlarged private identity image" />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function SectionTitle({
  icon,
  title,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Ionicons name={icon} size={19} color="#4F46E5" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={styles.infoValue}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#F4F8F5",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  // On desktop browsers, keep the right-side review scrollbar visible.
  webScrollBar: {
    overflowY: "scroll",
    scrollbarWidth: "auto",
    scrollbarColor: "#8CA3B2 #F2F9FC",
  } as any,
  page: {
    width: "100%",
    maxWidth: 1450,
    alignSelf: "center",
    padding: 24,
    paddingBottom: 70,
  },
  center: {
    flex: 1,
    minHeight: 500,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F5F7FB",
  },
  centerText: {
    marginTop: 9,
    maxWidth: 520,
    color: "#64748B",
    fontSize: 12.5,
    lineHeight: 19,
    textAlign: "center",
  },
  flexOne: {
    flex: 1,
  },
  summaryMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 11, marginBottom: 13 },
  summaryMetric: { flexGrow: 1, flexBasis: 200, minWidth: 150, minHeight: 74,
    paddingVertical: 12, paddingHorizontal: 15, backgroundColor: "#FFFFFF",
    borderRadius: 12, borderWidth: 1, borderColor: "#D8E9E0",
    flexDirection: "row", alignItems: "center", gap: 11 },
  summaryIcon: { width: 43, height: 43, borderRadius: 11, backgroundColor: "#E2F5EA",
    alignItems: "center", justifyContent: "center" },
  summaryLabel: { color: "#315A4C", fontSize: 11, fontWeight: "800" },
  summaryValue: { color: "#123F32", fontSize: 23, fontWeight: "800" },
  queueHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7,
    borderBottomWidth: 1, borderBottomColor: "#E6EEE9", paddingBottom: 12, marginBottom: 3 },
  queueTitle: { color: "#153D32", fontWeight: "900", fontSize: 17 },
  queueSubheading: { color: "#647E71", fontSize: 12, lineHeight: 19, marginTop: 4 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#23765F",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: "#23765F",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    marginTop: 3,
    color: "#173D32",
    fontSize: 25,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 5,
    maxWidth: 760,
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
  },
  refreshButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  refreshButtonText: {
    color: "#08765A",
    fontSize: 12,
    fontWeight: "800",
  },
  privacyNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
    marginBottom: 14,
  },
  noticeTitle: {
    color: "#173D32",
    fontSize: 12.5,
    fontWeight: "900",
  },
  noticeText: {
    marginTop: 3,
    color: "#475569",
    fontSize: 11.5,
    lineHeight: 17,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 39,
    paddingHorizontal: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  filterButtonActive: {
    backgroundColor: "#08765A",
    borderColor: "#08765A",
  },
  filterButtonText: {
    color: "#475569",
    fontSize: 11.5,
    fontWeight: "800",
  },
  filterButtonTextActive: {
    color: "#FFFFFF",
  },
  countBadge: {
    minWidth: 23,
    height: 23,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F8F7",
  },
  countBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.17)",
  },
  countBadgeText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
  },
  countBadgeTextActive: {
    color: "#FFFFFF",
  },
  searchWrap: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: "#173D32",
    fontSize: 12.5,
    outlineStyle: "none",
  } as any,
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 14,
    borderRadius: 12,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    flex: 1,
    color: "#991B1B",
    fontSize: 11.5,
    lineHeight: 17,
  },
  loadingCard: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyCard: {
    minHeight: 270,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyTitle: {
    marginTop: 10,
    color: "#173D32",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  workspace: {
    gap: 14,
  },
  workspaceWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  queue: { gap: 9, backgroundColor: "#FFFFFF", borderWidth: 1,
    borderColor: "#D8E9E0", borderRadius: 13, padding: 13, minWidth: 0 },
  queueWide: {
    width: 365,
    flexShrink: 0,
  },
  queueCard: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  queueCardActive: {
    borderColor: "#8AC9A7",
    backgroundColor: "#F1FAF4",
  },
  queueTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 39,
    height: 39,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E0E7FF",
  },
  avatarText: {
    color: "#4338CA",
    fontSize: 13,
    fontWeight: "900",
  },
  residentName: {
    color: "#173D32",
    fontSize: 12.5,
    fontWeight: "900",
  },
  residentMeta: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 10.5,
  },
  statusChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusChipText: {
    fontSize: 9.5,
    fontWeight: "900",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  scoreLabel: {
    color: "#64748B",
    fontSize: 10.5,
    fontWeight: "700",
  },
  scoreValue: {
    color: "#173D32",
    fontSize: 12,
    fontWeight: "900",
  },
  queueDate: {
    marginTop: 6,
    color: "#94A3B8",
    fontSize: 9.5,
  },
  detailPanel: { padding: 15, borderRadius: 13, borderWidth: 1,
    borderColor: "#D8E9E0", backgroundColor: "#FFFFFF" },
  detailPanelWide: {
    flex: 1,
    minWidth: 0,
  },
  detailEmpty: {
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingBottom: 15,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  detailHeaderIcon: {
    width: 45,
    height: 45,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  detailTitle: {
    color: "#173D32",
    fontSize: 17,
    fontWeight: "900",
  },
  detailMeta: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 11,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
    marginBottom: 9,
  },
  sectionTitle: {
    color: "#173D32",
    fontSize: 13,
    fontWeight: "900",
  },
  infoLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  infoLabel: {
    width: 130,
    color: "#64748B",
    fontSize: 10.5,
    fontWeight: "700",
  },
  infoValue: {
    flex: 1,
    color: "#173D32",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },
  scoreCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 14,
    padding: 14,
    borderRadius: 13,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 5,
  },
  scoreCardLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
  },
  scoreCardValue: {
    marginTop: 3,
    color: "#173D32",
    fontSize: 18,
    fontWeight: "900",
  },
  scoreCardDecision: {
    marginTop: 3,
    color: "#4F46E5",
    fontSize: 12,
    fontWeight: "900",
  },
  aiMessage: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    marginTop: 10,
    borderRadius: 11,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  aiMessageText: {
    flex: 1,
    color: "#334155",
    fontSize: 10.5,
    lineHeight: 16,
  },
  helperText: {
    marginBottom: 10,
    color: "#64748B",
    fontSize: 10.5,
    lineHeight: 16,
  },
  methodList: {
    gap: 8,
    marginBottom: 13,
  },
  methodButton: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  methodButtonActive: {
    borderColor: "#5EEAD4",
    backgroundColor: "#ECFDF5",
  },
  methodButtonText: {
    flex: 1,
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
  },
  methodButtonTextActive: {
    color: "#0F766E",
  },
  inputLabel: {
    marginBottom: 6,
    color: "#334155",
    fontSize: 10.5,
    fontWeight: "800",
  },
  notesInput: {
    minHeight: 105,
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    color: "#173D32",
    fontSize: 11.5,
    lineHeight: 17,
    outlineStyle: "none",
  } as any,
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 13,
  },
  verifyButton: {
    minHeight: 46,
    flex: 1,
    minWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: "#0F766E",
  },
  verifyButtonText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "900",
  },
  retryButton: {
    minHeight: 46,
    flex: 1,
    minWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  retryButtonText: {
    color: "#B91C1C",
    fontSize: 11.5,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.5,
  },
  resolvedNotes: {
    marginTop: 10,
    padding: 12,
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  resolvedNotesLabel: {
    color: "#475569",
    fontSize: 10.5,
    fontWeight: "900",
  },
  resolvedNotesText: {
    marginTop: 4,
    color: "#334155",
    fontSize: 11,
    lineHeight: 17,
  },

  // Scoped production visual design: all security, OCR and approval behavior is unchanged.
  pageCompact: { paddingHorizontal: 12, paddingVertical: 14, paddingBottom: 60 },
  backToQueue: { backgroundColor: "#FFFFFF", borderColor: "#DBE7DF", borderWidth: 1,
    borderRadius: 10, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  backToQueueLabel: { color: "#08765A", fontWeight: "800", fontSize: 13 },
  queuePrivacyLine: { flexDirection: "row", backgroundColor: "#F3FAF5",
    borderRadius: 8, gap: 8, padding: 9, alignItems: "flex-start" },
  queuePrivacyText: { fontSize: 11, color: "#557865", flex: 1, lineHeight: 16 },
  queueEmptyState: { minHeight: 160, alignItems: "center", justifyContent: "center", padding: 16, gap: 8 },
  queueEmptyTitle: { fontSize: 13, fontWeight: "800", color: "#244436" },
  queueEmptyText: { fontSize: 11, color: "#647E71", textAlign: "center" },
  queueFooter: { borderTopWidth: 1, borderTopColor: "#E6EEE9", paddingTop: 12, marginTop: 8, gap: 6 },
  queueFooterLabel: { color: "#668373", fontSize: 11, textAlign: "center" },
  summaryCopy: { flex: 1, gap: 2 },


  detailTabRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, borderBottomWidth: 1,
    borderBottomColor: "#E3ECE5", marginTop: 10, marginBottom: 12 },
  detailTab: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 7, borderBottomWidth: 3, borderBottomColor: "transparent" },
  detailTabActive: { borderBottomColor: "#08765A" },
  detailTabLabel: { color: "#698477", fontWeight: "600", fontSize: 12 },
  detailTabLabelActive: { color: "#08765A", fontWeight: "800" },
  evidenceAndAiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 11, marginBottom: 11 },
  previewEvidenceCard: { flex: 2, flexBasis: 315, minWidth: 0, borderWidth: 1, borderColor: "#DBE9DF",
    borderRadius: 11, padding: 12, backgroundColor: "#FFFFFF" },
  previewAiCard: { flex: 1, flexBasis: 220, minWidth: 0, borderWidth: 1, borderColor: "#DBE9DF",
    borderRadius: 11, padding: 12, backgroundColor: "#FFFFFF" },
  previewCardHeading: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 11 },
  previewCardHeadingText: { flex: 1, color: "#173D32", fontWeight: "800", fontSize: 13 },
  previewEvidenceTiles: { flexDirection: "row", gap: 7 },
  previewEvidenceTile: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: "#DBE9DF",
    borderRadius: 8, backgroundColor: "#F8FBF9", padding: 5, gap: 6 },
  previewEvidenceImage: { backgroundColor: "#EBF3EE", minHeight: 120, borderRadius: 5,
    alignItems: "center", justifyContent: "center", gap: 7, padding: 5 },
  previewEvidenceText: { color: "#64816E", fontSize: 10, textAlign: "center" },
  previewEvidencePhoto: { width: "100%", height: 120, borderRadius: 5 },
  fullScreenEvidence: { flex: 1, backgroundColor: "rgba(4,22,18,0.96)", padding: 16, justifyContent: "center" },
  fullScreenEvidenceImage: { flex: 1, width: "100%", maxHeight: "90%" },
  fullScreenEvidenceClose: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end",
    paddingVertical: 10, paddingHorizontal: 14 },
  fullScreenEvidenceCloseText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  previewEvidenceLabel: { color: "#355C4B", fontWeight: "700", fontSize: 10, textAlign: "center" },
  previewEvidenceCaption: { marginTop: 11, color: "#597664", fontSize: 11, lineHeight: 17 },
  previewScoreBox: { borderRadius: 9, backgroundColor: "#EAF7EE", padding: 11, marginBottom: 9 },
  previewScoreLabel: { color: "#557963", fontSize: 11, fontWeight: "700" },
  previewScoreValue: { color: "#08765A", fontSize: 22, fontWeight: "800", marginTop: 4 },
  previewScoreNote: { color: "#577763", fontSize: 11, lineHeight: 16, marginTop: 3 },
  previewDisclaimer: { borderRadius: 9, backgroundColor: "#FFF9E9", flexDirection: "row",
    padding: 11, gap: 8, marginBottom: 12 },
  previewDisclaimerText: { flex: 1, fontSize: 11, color: "#82642D", lineHeight: 17 },
  previewInfoCard: { borderRadius: 11, borderWidth: 1, borderColor: "#DCE8DF", padding: 15 },

});
