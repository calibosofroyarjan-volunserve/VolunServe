import { volunserveTypography as vsType } from "../../constants/volunserveLiveUi";
import { liveUi as designUi } from "../../constants/volunserveLiveUi";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import ListPagination from "../../components/ui/ListPagination";
import AdminReviewHero from "../../components/admin/AdminReviewHero";
import DocumentScreeningSummary from "../../components/identity/DocumentScreeningSummary";
import AdminIdentityEvidence from "../../components/identity/AdminIdentityEvidence";
import { getIdentityBackendBaseUrl } from "../../lib/identityBackendUrl";
import type { DocumentScreening } from "../../lib/identityVerification";
import {
    ActivityIndicator,
    Alert,
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



type ReviewFilter = "pending" | "verified" | "retry_required" | "all";

type IdentityReview = {
  uid: string;
  verificationId?: string;
  status?: string;
  identityStatus?: string;
  identityVerified?: boolean;
  aiDecision?: string;
  decision?: string;
  matchScore?: number | null;
  livenessScore?: number | null;
  idImageQualityScore?: number | null;
  idBackImageQualityScore?: number | null;
  idBackQualityChecked?: boolean;
  selfieQualityScore?: number | null;
  scanWarnings?: string[];
  documentScreening?: DocumentScreening;
  evidenceAvailable?: boolean;
  evidenceExpiresAt?: string;
  message?: string;
  requiresManualReview?: boolean;
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

const identityReviewKey = (item: IdentityReview) => item.uid + "::" + (item.verificationId || "");

const VALIDATION_METHODS = [
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
  const wide = width >= 1050;
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
  const mobileDetail = !wide && !!selected;
  const [validationMethod, setValidationMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState<"" | "verify" | "require_retry">("");
  const [readyEvidenceKey, setReadyEvidenceKey] = useState("");
  const [confirmedEvidenceKey, setConfirmedEvidenceKey] = useState("");

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
        `${getIdentityBackendBaseUrl()}/api/admin/identity/reviews`,
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
      all: items.length,
    };

    items.forEach((item) => {
      const bucket = reviewBucket(item);
      if (bucket === "pending") result.pending += 1;
      if (bucket === "verified") result.verified += 1;
      if (bucket === "retry_required") result.retry_required += 1;
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
    });
  }, [filter, items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const activePage = Math.max(1, Math.min(page, totalPages));
  const pagedReviews = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  // Keep mobile queue navigation explicit; on desktop show the first case.
  useEffect(() => {
    if (!wide || loading || selected || filtered.length === 0) return;
    const first = filtered[0];
    setSelected(first);
    setValidationMethod(first.manualValidationMethod || "");
    setNotes(first.manualReviewNotes || "");
  }, [wide, loading, selected, filtered]);


  const openReview = (item: IdentityReview) => {
    setReadyEvidenceKey("");
    setConfirmedEvidenceKey("");
    if (!wide) scrollRef.current?.scrollTo({ y: 0, animated: false });
    setSelected(item);
    setValidationMethod(item.manualValidationMethod || "");
    setNotes(item.manualReviewNotes || "");
  };

  const saveDecision = async (
    action: "verify" | "require_retry",
  ) => {
    if (!selected || !user || saving) return;

    if (action === "verify" &&
        (readyEvidenceKey !== identityReviewKey(selected) ||
         confirmedEvidenceKey !== identityReviewKey(selected))) {
      Alert.alert("Review Photos First",
        "Open all required private ID and selfie photos, then confirm your evidence review before approving.");
      return;
    }

    if (action === "verify" && !validationMethod) {
      Alert.alert(
        "Validation Method Required",
        "Select how the Resident was independently validated by LGU/Admin.",
      );
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
          : "Require this Resident to retry identity verification?",
      );
      if (!confirmed) return;
    }

    try {
      setSaving(action);

      const token = await user.getIdToken(true);
      const response = await fetch(
        `${getIdentityBackendBaseUrl()}/api/admin/identity/reviews/${encodeURIComponent(
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
            imagesReviewed: action === "verify" &&
              confirmedEvidenceKey === identityReviewKey(selected),
            validationMethod:
              action === "verify" ? validationMethod : "",
            notes: notes.trim(),
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
          : "Retry Required",
        body?.message ||
          (action === "verify"
            ? "The Resident is now identity verified."
            : "The Resident must submit identity verification again."),
      );

      setSelected(null);
      setReadyEvidenceKey("");
      setConfirmedEvidenceKey("");
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
        style={[
          styles.scroll,
          Platform.OS === "web" && styles.webScrollBar,
        ]}
        contentContainerStyle={[styles.page, !wide && styles.pageCompact]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Identity reviews content"
      >
        {!mobileDetail ? <>
        <AdminReviewHero
          eyebrow="LGU OPERATIONS / PEOPLE & VERIFICATION"
          title="Resident Identity Reviews"
          subtitle="Review identity cases requiring independent LGU validation. AI-assisted checks and manual review remain separate."
          icon="shield-checkmark-outline"
          tag="IDENTITY PROTECTION"
          variant="mint"
        />
        <View style={styles.summaryMetrics}>
          {[
            { label: "Pending Review", value: counts.pending, icon: "time-outline" as const },
            { label: "Verified", value: counts.verified, icon: "shield-checkmark-outline" as const },
            { label: "Retry Required", value: counts.retry_required, icon: "refresh-circle-outline" as const },
            { label: "Total Records", value: counts.all, icon: "people-outline" as const },
          ].map(metric => (
            <View key={metric.label} style={styles.summaryMetric}>
              <View style={styles.summaryIcon}><Ionicons name={metric.icon} size={20} color="#08765A" /></View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryLabel}>{metric.label}</Text>
                <Text style={styles.summaryValue}>{metric.value}</Text>
              </View>
            </View>
          ))}
        </View>
        </> : (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to identity verification queue"
            onPress={() => { setSelected(null); setValidationMethod(""); setNotes(""); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
            style={styles.mobileBackButton}>
            <Ionicons name="arrow-back" size={18} color="#08765A" />
            <View style={styles.flexOne}>
              <Text style={styles.mobileBackText}>Back to identity verification queue</Text>
              <Text style={styles.mobileBackDescription}>Resident details and private evidence</Text>
            </View>
          </TouchableOpacity>
        )}
        {error ? (
          <View style={styles.errorCard}>
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color="#B91C1C"
            />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#08765A" />
            <Text style={styles.centerText}>
              Loading identity reviews...
            </Text>
          </View>
        ) : filtered.length === 0 && !mobileDetail ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="shield-checkmark-outline"
              size={38}
              color="#94A3B8"
            />
            <Text style={styles.emptyTitle}>
              No identity reviews here
            </Text>
            <Text style={styles.centerText}>
              New AI-uncertain cases will appear in Pending when manual
              validation is required.
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.workspace,
              wide && styles.workspaceWide,
            ]}
          >
            {!mobileDetail ? <View style={[styles.queue, wide && styles.queueWide]}>
              <View style={styles.queueHeading}>
                <View style={styles.flexOne}>
                  <Text style={styles.queueTitle}>Identity Verification Queue</Text>
                  <Text style={styles.queueSubheading}>Select a resident to review and validate.</Text>
                </View>
                <TouchableOpacity style={styles.refreshButton} accessibilityRole="button"
                  accessibilityLabel="Refresh identity verification queue"
                  onPress={() => void loadReviews()} disabled={loading}>
                  {loading ? <ActivityIndicator size="small" color="#08765A" /> :
                    <Ionicons name="refresh-outline" size={17} color="#08765A" />}
                  <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.filterRow}>
                {([
                  { key: "pending" as const, label: "Pending", count: counts.pending },
                  { key: "verified" as const, label: "Verified", count: counts.verified },
                  { key: "retry_required" as const, label: "Retry Required", count: counts.retry_required },
                  { key: "all" as const, label: "All", count: counts.all },
                ]).map((choice) => {
                  const active = filter === choice.key;
                  return (
                    <TouchableOpacity key={choice.key} accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[styles.filterButton, active && styles.filterButtonActive]}
                      onPress={() => {
                        setFilter(choice.key); setPage(1); setSelected(null);
                        setReadyEvidenceKey(""); setConfirmedEvidenceKey("");
                      }}>
                      <Text style={[styles.filterButtonText, active && styles.filterButtonTextActive]}>{choice.label}</Text>
                      <View style={[styles.countBadge, active && styles.countBadgeActive]}>
                        <Text style={[styles.countBadgeText, active && styles.countBadgeTextActive]}>{choice.count}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={17} color="#64748B" />
                <TextInput style={styles.searchInput} value={search}
                  onChangeText={(value) => { setSearch(value); setPage(1); }}
                  placeholder="Search resident, email, barangay, or ID..."
                  placeholderTextColor="#94A3B8" />
              </View>
              <View style={styles.queuePrivacyLine}>
                <Ionicons name="lock-closed-outline" size={13} color="#08765A" />
                <Text style={styles.queuePrivacyText}>Private evidence is available only to authorized LGU reviewers.</Text>
              </View>

              {pagedReviews.map((item) => {
                const active = selected?.uid === item.uid;
                return (
                  <TouchableOpacity
                    key={item.uid}
                    style={[
                      styles.queueCard,
                      active && styles.queueCardActive,
                    ]}
                    onPress={() => openReview(item)}
                    activeOpacity={0.86}
                  >
                    <View style={styles.queueTop}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {String(item.resident?.fullName || "R")
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.flexOne}>
                        <Text
                          style={styles.residentName}
                          numberOfLines={1}
                        >
                          {item.resident?.fullName || "Resident"}
                        </Text>
                        <Text
                          style={styles.residentMeta}
                          numberOfLines={1}
                        >
                          {item.resident?.barangay || "Barangay not set"}
                        </Text>
                      </View>

                      <StatusChip bucket={reviewBucket(item)} />
                    </View>

                    <View style={styles.scoreRow}>
                      <Text style={styles.scoreLabel}>Government ID check</Text>
                      <Text style={styles.scoreValue}>
                        {item.documentScreening?.status === "text_consistent_unverified"
                          ? "ID type recognized — unverified"
                          : item.documentScreening?.status === "mismatch"
                            ? "Selected ID type mismatch"
                            : "Recognition inconclusive"}
                      </Text>
                    </View>

                    <View style={styles.evidenceStatusRow}>
                      <Ionicons name={item.evidenceAvailable ? "lock-closed-outline" : "alert-circle-outline"}
                        size={14} color={item.evidenceAvailable ? "#08765A" : "#B45309"} />
                      <Text style={[styles.evidenceStatusText, !item.evidenceAvailable && styles.evidenceStatusWarning]}>
                        {item.evidenceAvailable ? "Protected ID and selfie saved" : "Pictures unavailable — resubmission needed"}
                      </Text>
                    </View>
                    <Text style={styles.queueDate}>
                      Submitted{" "}
                      {formatDate(
                        item.lastSubmissionAt ||
                          item.updatedAt ||
                          item.createdAt,
                      )}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <View style={styles.queueFooter}>
                <Text style={styles.queueFooterLabel}>
                  {filtered.length ? (activePage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(activePage * PAGE_SIZE, filtered.length)} of {filtered.length} records · 5 per page
                </Text>
                <ListPagination page={activePage} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
              </View>
            </View> : null}

            <View
              style={[
                styles.detailPanel,
                wide ? styles.detailPanelWide : styles.detailPanelCompact,
              ]}
            >
              {selected ? (
                <ReviewDetail
                  item={selected}
                  user={user}
                  validationMethod={validationMethod}
                  setValidationMethod={setValidationMethod}
                  evidenceReady={readyEvidenceKey === identityReviewKey(selected)}
                  evidenceAcknowledged={confirmedEvidenceKey === identityReviewKey(selected)}
                  onEvidenceStateChange={(ready) => {
                    const key = identityReviewKey(selected);
                    if (ready) setReadyEvidenceKey(key);
                    else {
                      setReadyEvidenceKey((current) => current === key ? "" : current);
                      setConfirmedEvidenceKey((current) => current === key ? "" : current);
                    }
                  }}
                  onAcknowledgeEvidence={() => setConfirmedEvidenceKey((current) =>
                    current === identityReviewKey(selected) ? "" : identityReviewKey(selected))}
                  notes={notes}
                  setNotes={setNotes}
                  saving={saving}
                  onVerify={() => void saveDecision("verify")}
                  onRetry={() => void saveDecision("require_retry")}
                />
              ) : (
                <View style={styles.detailEmpty}>
                  <Ionicons
                    name="document-text-outline"
                    size={39}
                    color="#94A3B8"
                  />
                  <Text style={styles.emptyTitle}>
                    Select a Resident
                  </Text>
                  <Text style={styles.centerText}>
                    Open a verification record to review its AI result
                    and manual-validation decision.
                  </Text>
                </View>
              )}
            </View>
          </View>
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
  item, user, validationMethod, setValidationMethod,
  evidenceReady, evidenceAcknowledged, onEvidenceStateChange, onAcknowledgeEvidence,
  notes, setNotes, saving, onVerify, onRetry,
}: {
  item: IdentityReview;
  user: { getIdToken: (forceRefresh?: boolean) => Promise<string> } | null;
  validationMethod: string;
  setValidationMethod: (value: string) => void;
  evidenceReady: boolean;
  evidenceAcknowledged: boolean;
  onEvidenceStateChange: (ready: boolean) => void;
  onAcknowledgeEvidence: () => void;
  notes: string;
  setNotes: (value: string) => void;
  saving: "" | "verify" | "require_retry";
  onVerify: () => void;
  onRetry: () => void;
}) {
  const { width } = useWindowDimensions();
  const wideDetail = width >= 1400;
  const [tab, setTab] = useState<"review" | "details" | "audit">("review");
  const [methodOpen, setMethodOpen] = useState(false);
  useEffect(() => {
    setTab("review");
    setMethodOpen(false);
  }, [item.uid, item.verificationId]);

  const pending = reviewBucket(item) === "pending";
  const evidenceExpired = !!item.evidenceExpiresAt &&
    Date.parse(item.evidenceExpiresAt) <= Date.now();
  const evidenceMissing = item.evidenceAvailable !== true || evidenceExpired;
  const score = typeof item.matchScore === "number" && Number.isFinite(item.matchScore)
    && item.matchScore >= 0 && item.matchScore <= 1
    ? (item.matchScore * 100).toFixed(1) + "%" : "Not evaluated";
  const quality = (value?: number | null) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
      ? (value * 100).toFixed(0) + " / 100" : "Not evaluated";
  const documentType = ({
    national_id: "Philippine National ID",
    passport: "Philippine Passport",
    drivers_license: "Driver's License",
    other_government_id: "Other Government ID",
  } as const)[item.documentScreening?.declaredIdType || "other_government_id"];
  const screening = item.documentScreening?.status === "text_consistent_unverified"
    ? "ID type recognized — not authenticated"
    : item.documentScreening?.status === "mismatch"
      ? "Detected document type mismatch" : "Document screening inconclusive";
  const selectedMethod = VALIDATION_METHODS.find((method) => method.value === validationMethod);
  return (
    <View style={styles.reviewDetailRoot}>
      <View style={styles.detailHeader}>
        <View style={styles.detailHeaderIcon}>
          <Text style={styles.detailAvatarText}>
            {String(item.resident?.fullName || "R").trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.flexOne}>
          <Text style={styles.detailTitle}>{item.resident?.fullName || "Resident"}</Text>
          <Text style={styles.detailMeta}>
            {item.resident?.barangay ? "Brgy. " + item.resident.barangay : "Barangay not set"}
          </Text>
          <Text style={styles.detailMeta}>
            Submitted {formatDate(item.lastSubmissionAt || item.updatedAt || item.createdAt)}
          </Text>
        </View>
        <StatusChip bucket={reviewBucket(item)} />
      </View>

      <View style={styles.detailTabRow}>
        {([
          { key: "review" as const, label: "Identity Review", icon: "shield-checkmark-outline" as const },
          { key: "details" as const, label: "Details & History", icon: "time-outline" as const },
          { key: "audit" as const, label: "Audit Trail", icon: "document-text-outline" as const },
        ]).map(({ key, label, icon }) => (
          <TouchableOpacity key={key} accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[styles.detailTab, tab === key && styles.detailTabActive]}>
            <Ionicons name={icon} size={16} color={tab === key ? "#08765A" : "#64748B"} />
            <Text style={[styles.detailTabText, tab === key && styles.detailTabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "review" ? (
        <>
          <View style={[styles.reviewTopGrid, wideDetail && styles.reviewTopGridWide]}>
            <View style={[styles.reviewEvidencePanel, wideDetail && styles.reviewEvidenceWide]}>
              <View style={styles.panelHeading}>
                <Ionicons name="id-card-outline" size={19} color="#08765A" />
                <Text style={styles.panelHeadingText}>Submitted Identity Evidence</Text>
                <Ionicons name="lock-closed-outline" size={15} color="#08765A" />
              </View>
              <AdminIdentityEvidence uid={item.uid} verificationId={item.verificationId} user={user}
                matchScore={item.matchScore} aiDecision={item.aiDecision}
                onEvidenceStateChange={onEvidenceStateChange} />
            </View>

            <View style={[styles.reviewAiPanel, wideDetail && styles.reviewAiNarrow]}>
              <View style={styles.panelHeading}>
                <Ionicons name="scan-outline" size={19} color="#08765A" />
                <Text style={styles.panelHeadingText}>AI Verification Result</Text>
              </View>
              <View style={styles.reviewAiScoreBox}>
                <Text style={styles.reviewAiScoreLabel}>Face similarity</Text>
                <Text style={styles.reviewAiScore}>{score}</Text>
                <Text style={styles.reviewAiScoreDescription}>
                  Preliminary AI comparison only. Not proof of identity or liveness.
                </Text>
              </View>
              <SectionTitle icon="images-outline" title="Image Quality Screening" />
              <InfoLine label="ID Front" value={quality(item.idImageQualityScore)} />
              <InfoLine label="ID Back" value={
                item.idBackQualityChecked ? quality(item.idBackImageQualityScore) : "Not evaluated"
              } />
              <InfoLine label="Live Selfie" value={quality(item.selfieQualityScore)} />
              <InfoLine label="AI result" value={
                item.aiDecision === "failed" ? "Requires attention" :
                item.requiresManualReview ? "Manual review required" : "Pending assessment"
              } />
              {item.scanWarnings?.length ? (
                <View style={styles.reviewAiWarnings}>
                  <Ionicons name="alert-circle-outline" size={15} color="#A16207" />
                  <Text style={styles.reviewAiWarningText}>
                    {item.scanWarnings.map((warning) => warning.replace(/_/g, " ")).join(" · ")}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.reviewNotice}>
            <Ionicons name="alert-circle-outline" size={17} color="#A16207" />
            <Text style={styles.reviewNoticeText}>
              AI similarity and OCR screening cannot establish document authenticity or liveness.
              Final approval requires independent LGU validation.
            </Text>
          </View>

          <View style={[styles.reviewBottomGrid, wideDetail && styles.reviewBottomGridWide]}>
            <View style={[styles.reviewSummaryPanel, wideDetail && styles.reviewBottomChild]}>
              <View style={styles.panelHeading}>
                <Ionicons name="clipboard-outline" size={18} color="#08765A" />
                <Text style={styles.panelHeadingText}>Review Summary</Text>
              </View>
              <InfoLine label="Document Type" value={documentType} />
              <InfoLine label="Government ID Check" value={screening} />
              <InfoLine label="AI Face Similarity" value={score} />
              <InfoLine label="Evidence Status" value={
                evidenceMissing ? "Missing / expired — resubmission needed" : "Private photos saved"
              } />
              <DocumentScreeningSummary screening={item.documentScreening} />
              {item.message ? <Text style={styles.reviewSummaryMessage}>{item.message}</Text> : null}
            </View>

            <View style={[styles.reviewValidationPanel, wideDetail && styles.reviewBottomChild]}>
              {pending ? (
                <>
                  <View style={styles.panelHeading}>
                    <Ionicons name="shield-checkmark-outline" size={19} color="#08765A" />
                    <Text style={styles.panelHeadingText}>Independent LGU Validation</Text>
                  </View>
                  {evidenceMissing ? (
                    <View style={styles.reviewAiWarnings}>
                      <Ionicons name="alert-circle-outline" size={16} color="#A16207" />
                      <Text style={styles.reviewAiWarningText}>
                        Required Front/Back ID or selfie evidence is unavailable.
                        Ask the Resident to resubmit before approval.
                      </Text>
                    </View>
                  ) : null}
                  <TouchableOpacity accessibilityRole="checkbox"
                    accessibilityState={{ checked: evidenceAcknowledged, disabled: !evidenceReady || evidenceMissing }}
                    disabled={!evidenceReady || evidenceMissing}
                    onPress={onAcknowledgeEvidence}
                    style={styles.reviewCheckboxRow}>
                    <Ionicons name={evidenceAcknowledged ? "checkbox" : "square-outline"}
                      size={21} color={evidenceAcknowledged ? "#08765A" : "#64748B"} />
                    <Text style={styles.reviewCheckboxText}>
                      I reviewed the submitted identity images and AI results.
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.reviewFieldLabel}>Validation Method *</Text>
                  <TouchableOpacity accessibilityRole="button"
                    accessibilityState={{ expanded: methodOpen }}
                    style={styles.reviewSelectField} onPress={() => setMethodOpen(!methodOpen)}>
                    <Text style={[styles.reviewSelectText, !selectedMethod && styles.reviewPlaceholder]}>
                      {selectedMethod?.label || "Select an independent LGU validation method"}
                    </Text>
                    <Ionicons name={methodOpen ? "chevron-up-outline" : "chevron-down-outline"} size={17} color="#64748B" />
                  </TouchableOpacity>
                  {methodOpen ? (
                    <View style={styles.reviewSelectOptions}>
                      {VALIDATION_METHODS.map((method) => (
                        <TouchableOpacity key={method.value} accessibilityRole="button"
                          style={[styles.reviewSelectOption,
                            validationMethod === method.value && styles.reviewSelectOptionSelected]}
                          onPress={() => { setValidationMethod(method.value); setMethodOpen(false); }}>
                          <Ionicons name={method.icon} size={16} color="#08765A" />
                          <Text style={styles.reviewSelectOptionText}>{method.label}</Text>
                          {validationMethod === method.value ?
                            <Ionicons name="checkmark" size={16} color="#08765A" /> : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                  <Text style={styles.reviewFieldLabel}>Review Notes / Retry Reason</Text>
                  <TextInput multiline value={notes} onChangeText={setNotes}
                    placeholder="Enter review observations or reason for retry..."
                    placeholderTextColor="#94A3B8" textAlignVertical="top"
                    style={styles.reviewNotesInput} maxLength={500} />
                  <Text style={styles.reviewNoteHint}>
                    Verify requires completed evidence review and independent validation.
                    Retry requires a reason of at least 5 characters.
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.panelHeading}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#08765A" />
                    <Text style={styles.panelHeadingText}>Recorded LGU Decision</Text>
                  </View>
                  <InfoLine label="Decision" value={item.manualReviewDecision || item.decision || item.status || "—"} />
                  <InfoLine label="Method" value={item.manualValidationMethod || "—"} />
                  <InfoLine label="Reviewed by" value={item.reviewedByName || item.reviewedBy || "—"} />
                  <InfoLine label="Reviewed at" value={formatDate(item.reviewedAt)} />
                  {item.manualReviewNotes ? <Text style={styles.reviewSummaryMessage}>{item.manualReviewNotes}</Text> : null}
                </>
              )}
            </View>
          </View>

          {pending ? (
            <View style={styles.reviewFooterActions}>
              <TouchableOpacity style={[styles.retryButton, (notes.trim().length < 5 || !!saving) && styles.disabledButton]}
                disabled={notes.trim().length < 5 || !!saving} onPress={onRetry}
                accessibilityRole="button">
                {saving === "require_retry" ? <ActivityIndicator color="#B91C1C" size="small" /> :
                  <Ionicons name="refresh-outline" size={18} color="#B91C1C" />}
                <Text style={styles.retryButtonText}>Require Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[
                styles.verifyButton,
                (!validationMethod || !!saving || evidenceMissing || !evidenceReady || !evidenceAcknowledged)
                  && styles.disabledButton,
              ]} disabled={!validationMethod || !!saving || evidenceMissing || !evidenceReady || !evidenceAcknowledged}
                onPress={onVerify} accessibilityRole="button">
                {saving === "verify" ? <ActivityIndicator color="#FFFFFF" size="small" /> :
                  <Ionicons name="checkmark-outline" size={19} color="#FFFFFF" />}
                <Text style={styles.verifyButtonText}>Verify Resident</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : tab === "details" ? (
        <View style={styles.reviewInformationPanel}>
          <SectionTitle icon="person-circle-outline" title="Resident Account & Verification History" />
          <InfoLine label="Resident" value={item.resident?.fullName || "Resident"} />
          <InfoLine label="Email" value={item.resident?.email || "Not available"} />
          <InfoLine label="Barangay" value={item.resident?.barangay || "Not provided"} />
          <InfoLine label="Account status" value={item.resident?.accountStatus || "—"} />
          <InfoLine label="Verification ID" value={item.verificationId || "—"} />
          <InfoLine label="Submitted" value={formatDate(item.lastSubmissionAt || item.createdAt)} />
          <InfoLine label="Current status" value={item.status || "—"} />
          <InfoLine label="AI decision" value={item.aiDecision || "—"} />
          <InfoLine label="Evidence expiry" value={formatDate(item.evidenceExpiresAt)} />
          {item.message ? <Text style={styles.reviewSummaryMessage}>{item.message}</Text> : null}
        </View>
      ) : (
        <View style={styles.reviewInformationPanel}>
          <SectionTitle icon="document-text-outline" title="Available Review Audit Details" />
          <Text style={styles.reviewNoteHint}>
            This panel shows decision metadata from the current verification record.
            Complete Admin activity logs remain in the protected audit system.
          </Text>
          <InfoLine label="Verification ID" value={item.verificationId || "—"} />
          <InfoLine label="Last decision" value={item.manualReviewDecision || "No manual decision recorded"} />
          <InfoLine label="LGU method" value={item.manualValidationMethod || "—"} />
          <InfoLine label="Reviewed by" value={item.reviewedByName || item.reviewedBy || "—"} />
          <InfoLine label="Reviewed at" value={formatDate(item.reviewedAt)} />
          {item.manualReviewNotes ? <Text style={styles.reviewSummaryMessage}>{item.manualReviewNotes}</Text> : null}
        </View>
      )}
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
    scrollbarColor: "#A6BDB1 #F0F7F3",
  } as any,
  page: {
    width: "100%",
    maxWidth: 1450,
    alignSelf: "center",
    padding: 24,
    paddingBottom: 70,
  },
  pageCompact: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 60 },
  detailPanelCompact: { padding: 12, borderRadius: 13 },
  center: {
    flex: 1,
    minHeight: 500,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F5F7FB",
  },
  evidenceAcknowledgement: {
    marginTop: 12, marginBottom: 12, flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderRadius: 11, borderWidth: 1, borderColor: "#DCE6ED", padding: 13,
    backgroundColor: "#F8FAFC",
  },
  evidenceAcknowledgementChecked: { backgroundColor: "#EFFAF3", borderColor: "#8CCDB3" },
  evidenceAcknowledgementTitle: { color: "#173D32", fontSize: vsType.size.label,
    fontFamily: vsType.family, fontWeight: "700" },
  evidenceAcknowledgementText: { color: "#64748B", fontSize: vsType.size.caption,
    fontFamily: vsType.family, lineHeight: 17, marginTop: 4 },
  mobileBackButton: {
    minHeight: 62,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D7E6DF",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  mobileBackText: {
    color: "#08765A", fontSize: vsType.size.label,
    fontWeight: "700", fontFamily: vsType.family,
  },
  mobileBackDescription: {
    marginTop: 3, color: "#64748B", fontSize: vsType.size.caption,
    fontFamily: vsType.family,
  },
  centerText: {
    marginTop: 9,
    maxWidth: 520,
    color: "#64748B",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    lineHeight: 19,
    textAlign: "center",
  },
  flexOne: {
    flex: 1,
  },
  summaryMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 11, marginBottom: 13 },
  summaryMetric: { flexGrow: 1, flexBasis: 210, minWidth: 150, minHeight: 66,
    paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#FFFFFF", borderRadius: 13, borderWidth: 1, borderColor: "#D8E9E0" },
  summaryIcon: { width: 44, height: 44, borderRadius: 11, backgroundColor: "#E2F5EA",
    alignItems: "center", justifyContent: "center" },
  summaryCopy: { flex: 1, gap: 1 },
  summaryLabel: { color: "#284D40", fontSize: vsType.size.meta, fontFamily: vsType.family, fontWeight: "700" },
  summaryValue: { color: "#123F32", fontSize: vsType.size.titleSmall, fontFamily: vsType.family, fontWeight: "800" },
  queueHeading: { flexDirection: "row", alignItems: "center", gap: 8,
    paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: "#E8F0EB", marginBottom: 11 },
  queueTitle: { color: "#153D32", fontFamily: vsType.family, fontWeight: "800",
    fontSize: vsType.size.card, lineHeight: 22 },
  queueSubheading: { color: "#647E71", fontSize: vsType.size.caption, fontFamily: vsType.family, lineHeight: 17, marginTop: 3 },
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
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    marginTop: 3,
    color: "#173D32",
    fontSize: designUi.type.page.fontSize,
    fontWeight: designUi.type.page.fontWeight, lineHeight: designUi.type.page.lineHeight,},
  subtitle: {
    marginTop: 5,
    maxWidth: 760,
    color: "#64748B",
    fontSize: designUi.type.body.fontSize,
    lineHeight: designUi.type.body.lineHeight, fontWeight: designUi.type.body.fontWeight,},
  refreshButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#DCE8E1",
    backgroundColor: "#FFFFFF",
  },
  refreshButtonText: {
    color: "#08765A",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
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
    fontSize: vsType.size.label, fontFamily: vsType.family,
    fontWeight: "800",
  },
  noticeText: {
    marginTop: 3,
    color: "#475569",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    lineHeight: 17,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 11,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 35,
    paddingHorizontal: 8,
    borderRadius: 8,
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
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "700",
  },
  filterButtonTextActive: {
    color: "#FFFFFF",
  },
  countBadge: {
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F8F7",
  },
  countBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.17)",
  },
  countBadgeText: {
    color: "#475569",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },
  countBadgeTextActive: {
    color: "#FFFFFF",
  },
  searchWrap: {
    minHeight: 42,
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
    fontSize: vsType.size.label, fontFamily: vsType.family,
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
    fontSize: vsType.size.meta, fontFamily: vsType.family,
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
    fontSize: designUi.type.section.fontSize,
    fontWeight: designUi.type.section.fontWeight,
    textAlign: "center", lineHeight: designUi.type.section.lineHeight,},
  workspace: { gap: 13 },
  workspaceWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  queue: {
    gap: 9, padding: 13, minWidth: 0, backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: "#D8E9E0", borderRadius: 14,
  },
  queueWide: { width: 380, flexShrink: 0 },
  queuePrivacyLine: { flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: "#F4FAF6", padding: 9, borderRadius: 8, marginBottom: 2 },
  queuePrivacyText: { flex: 1, color: "#527568", fontSize: vsType.size.micro,
    fontFamily: vsType.family, lineHeight: 15 },
  queueFooter: { marginTop: 7, borderTopWidth: 1, borderTopColor: "#E8F0EB",
    paddingTop: 12, alignItems: "center", gap: 5 },
  queueFooterLabel: { color: "#647E71", fontSize: vsType.size.caption, fontFamily: vsType.family },
  queueCard: { padding: 13, borderRadius: 11, borderWidth: 1,
    borderColor: "#E2EAE5", backgroundColor: "#FFFFFF" },
  queueCardActive: {
    borderColor: "#08765A",
    backgroundColor: "#EFFAF3",
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
    backgroundColor: "#E1F4EA",
  },
  avatarText: {
    color: "#08765A",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    fontWeight: "800",
  },
  residentName: {
    color: "#173D32",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    fontWeight: "800",
  },
  residentMeta: {
    marginTop: 2,
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
  },
  statusChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusChipText: {
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
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
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "700",
  },
  scoreValue: {
    color: "#173D32",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "800",
  },
  evidenceStatusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  evidenceStatusText: { color: "#08765A", fontSize: vsType.size.caption, fontFamily: vsType.family, fontWeight: "600" },
  evidenceStatusWarning: { color: "#B45309" },
  queueDate: {
    marginTop: 6,
    color: "#94A3B8",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
  },
  detailPanel: { padding: 14, borderRadius: 14, borderWidth: 1,
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
    backgroundColor: "#EAE9FF",
  },
  detailTitle: {
    color: "#173D32",
    fontSize: vsType.size.card, fontFamily: vsType.family,
    fontWeight: "800",
  },
  detailMeta: {
    marginTop: 3,
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
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
    fontSize: vsType.size.label, fontFamily: vsType.family,
    fontWeight: "800",
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
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "700",
  },
  infoValue: {
    flex: 1,
    color: "#173D32",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
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
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "700",
  },
  scoreCardValue: {
    marginTop: 3,
    color: "#173D32",
    fontSize: vsType.size.section, fontFamily: vsType.family,
    fontWeight: "800",
  },
  scoreCardDecision: {
    marginTop: 3,
    color: "#4F46E5",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "800",
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
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 16,
  },
  helperText: {
    marginBottom: 10,
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
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
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },
  methodButtonTextActive: {
    color: "#0F766E",
  },
  inputLabel: {
    marginBottom: 6,
    color: "#334155",
    fontSize: designUi.type.label.fontSize,
    fontWeight: designUi.type.label.fontWeight, lineHeight: designUi.type.label.lineHeight,},
  notesInput: {
    minHeight: 105,
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    color: "#173D32",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
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
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "800",
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
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "800",
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
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },
  resolvedNotesText: {
    marginTop: 4,
    color: "#334155",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 17,
  },

  // Approved Resident Identity Reviews composition. Scope confined to this page.
  reviewDetailRoot: { gap: 11 },
  detailAvatarText: { color: "#4844A8", fontSize: vsType.size.section,
    fontFamily: vsType.family, fontWeight: "800" },
  detailTabRow: { flexDirection: "row", gap: 13, alignItems: "center",
    borderBottomWidth: 1, borderBottomColor: "#E7EEE9", flexWrap: "wrap" },
  detailTab: { minHeight: 43, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 8, gap: 6, borderBottomWidth: 3,
    borderBottomColor: "transparent" },
  detailTabActive: { borderBottomColor: "#08765A" },
  detailTabText: { color: "#64748B", fontSize: vsType.size.meta,
    fontFamily: vsType.family, fontWeight: "600" },
  detailTabTextActive: { color: "#08765A", fontWeight: "800" },
  reviewTopGrid: { gap: 10 },
  reviewTopGridWide: { flexDirection: "row", alignItems: "stretch" },
  reviewEvidencePanel: { minWidth: 0, padding: 11, backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: "#DBE7E0", borderRadius: 12, flex: 1 },
  reviewEvidenceWide: { flex: 1, minWidth: 0 },
  reviewAiPanel: { padding: 13, backgroundColor: "#FFFFFF", borderWidth: 1,
    borderColor: "#DBE7E0", borderRadius: 12, minWidth: 0 },
  reviewAiNarrow: { width: 242, flexShrink: 0 },
  panelHeading: { minHeight: 26, flexDirection: "row", flexWrap: "wrap", alignItems: "center",
    gap: 7, marginBottom: 9 },
  panelHeadingText: { color: "#173D32", fontSize: vsType.size.label,
    fontFamily: vsType.family, fontWeight: "800", flex: 1 },
  reviewAiScoreBox: { backgroundColor: "#E6F5ED", borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 13, gap: 3, marginBottom: 11 },
  reviewAiScoreLabel: { color: "#2C6750", fontSize: vsType.size.caption,
    fontFamily: vsType.family, fontWeight: "700" },
  reviewAiScore: { color: "#0E6C49", fontSize: vsType.size.title,
    fontFamily: vsType.family, fontWeight: "800" },
  reviewAiScoreDescription: { color: "#4E7362", fontSize: vsType.size.caption,
    lineHeight: 16, fontFamily: vsType.family },
  reviewAiWarnings: { padding: 10, backgroundColor: "#FFF9E9",
    borderColor: "#F9E8B9", borderWidth: 1, borderRadius: 9,
    flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 9 },
  reviewAiWarningText: { flex: 1, color: "#925B0B", fontSize: vsType.size.caption,
    lineHeight: 16, fontFamily: vsType.family },
  reviewNotice: { backgroundColor: "#FFFAE9", borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row",
    alignItems: "flex-start", gap: 8 },
  reviewNoticeText: { flex: 1, color: "#725B2B", fontSize: vsType.size.caption,
    lineHeight: 17, fontFamily: vsType.family },
  reviewBottomGrid: { gap: 11 },
  reviewBottomGridWide: { flexDirection: "row", alignItems: "flex-start" },
  reviewBottomChild: { flex: 1, minWidth: 0 },
  reviewSummaryPanel: { padding: 13, backgroundColor: "#FFFFFF", borderWidth: 1,
    borderColor: "#DBE7E0", borderRadius: 12, minWidth: 0 },
  reviewSummaryMessage: { color: "#536B60", fontSize: vsType.size.caption,
    fontFamily: vsType.family, lineHeight: 17, marginTop: 11,
    borderTopWidth: 1, borderTopColor: "#E8EFEA", paddingTop: 9 },
  reviewValidationPanel: { padding: 13, backgroundColor: "#FFFFFF", borderWidth: 1,
    borderColor: "#DBE7E0", borderRadius: 12, minWidth: 0 },
  reviewCheckboxRow: { flexDirection: "row", alignItems: "flex-start",
    gap: 8, marginVertical: 11, minHeight: 34 },
  reviewCheckboxText: { flex: 1, color: "#355548", fontSize: vsType.size.meta,
    fontFamily: vsType.family, lineHeight: 18, fontWeight: "600" },
  reviewFieldLabel: { color: "#355548", fontSize: vsType.size.caption,
    fontFamily: vsType.family, fontWeight: "700", marginBottom: 6, marginTop: 8 },
  reviewSelectField: { minHeight: 42, borderColor: "#CADDD2", borderWidth: 1,
    backgroundColor: "#FFFFFF", borderRadius: 9, flexDirection: "row",
    alignItems: "center", gap: 8, paddingHorizontal: 11 },
  reviewSelectText: { flex: 1, color: "#213D33", fontSize: vsType.size.meta,
    fontFamily: vsType.family, fontWeight: "600" },
  reviewPlaceholder: { color: "#71867A", fontWeight: "400" },
  reviewSelectOptions: { borderWidth: 1, borderColor: "#C9E1D3",
    backgroundColor: "#FFFFFF", borderRadius: 8, padding: 4, marginTop: 5 },
  reviewSelectOption: { flexDirection: "row", alignItems: "center",
    minHeight: 39, paddingHorizontal: 9, gap: 7, borderRadius: 6 },
  reviewSelectOptionSelected: { backgroundColor: "#E9F5EE" },
  reviewSelectOptionText: { flex: 1, fontSize: vsType.size.meta,
    fontFamily: vsType.family, fontWeight: "600", color: "#264D3E" },
  reviewNotesInput: { minHeight: 74, maxHeight: 135, padding: 10,
    borderRadius: 9, borderWidth: 1, borderColor: "#CADDD2",
    color: "#173D32", backgroundColor: "#FFFFFF",
    fontFamily: vsType.family, fontSize: vsType.size.meta,
    lineHeight: 18, outlineStyle: "none" } as any,
  reviewNoteHint: { color: "#71867A", fontSize: vsType.size.caption,
    fontFamily: vsType.family, lineHeight: 16, marginTop: 8 },
  reviewFooterActions: { flexDirection: "row", flexWrap: "wrap",
    justifyContent: "flex-end", gap: 11, paddingTop: 13,
    borderTopWidth: 1, borderTopColor: "#E6EEE9" },
  reviewInformationPanel: { padding: 18, borderWidth: 1,
    borderColor: "#DBE7E0", borderRadius: 12,
    backgroundColor: "#FFFFFF", minHeight: 300 },

});
