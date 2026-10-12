import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";

import { useUserSession } from "../../lib/useUserSession";

const BACKEND_URL = "https://volunserve.onrender.com";

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

function scoreText(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Not available";
  }

  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.max(0, Math.min(100, normalized)).toFixed(1)}%`;
}

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
  const { loading: sessionLoading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();
  const wide = width >= 1050;

  const [items, setItems] = useState<IdentityReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<IdentityReview | null>(null);
  const [validationMethod, setValidationMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState<"" | "verify" | "require_retry">("");

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

  const openReview = (item: IdentityReview) => {
    setSelected(item);
    setValidationMethod(item.manualValidationMethod || "");
    setNotes(item.manualReviewNotes || "");
  };

  const saveDecision = async (
    action: "verify" | "require_retry",
  ) => {
    if (!selected || !user || saving) return;

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
        style={styles.scroll}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons
              name="shield-checkmark-outline"
              size={27}
              color="#FFFFFF"
            />
          </View>

          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>
              ADMIN · RESIDENT VERIFICATION
            </Text>
            <Text style={styles.title}>Identity Reviews</Text>
            <Text style={styles.subtitle}>
              Review AI-uncertain Resident identity cases. Automatic
              verification remains separate from manual LGU/Admin validation.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => void loadReviews()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#334155" />
            ) : (
              <Ionicons
                name="refresh-outline"
                size={19}
                color="#334155"
              />
            )}
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.privacyNotice}>
          <Ionicons
            name="lock-closed-outline"
            size={20}
            color="#0F766E"
          />
          <View style={styles.flexOne}>
            <Text style={styles.noticeTitle}>
              Privacy-preserving manual fallback
            </Text>
            <Text style={styles.noticeText}>
              The AI service processes the submitted ID and selfie for
              the 1-to-1 comparison, but this queue does not retain or
              display those private images. Manual verification must use
              an independent LGU-approved validation method.
            </Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {[
            { key: "pending" as const, label: "Pending", count: counts.pending },
            { key: "verified" as const, label: "Verified", count: counts.verified },
            {
              key: "retry_required" as const,
              label: "Retry Required",
              count: counts.retry_required,
            },
            { key: "all" as const, label: "All", count: counts.all },
          ].map((item) => {
            const active = filter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.filterButton,
                  active && styles.filterButtonActive,
                ]}
                onPress={() => setFilter(item.key)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    active && styles.filterButtonTextActive,
                  ]}
                >
                  {item.label}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    active && styles.countBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.countBadgeText,
                      active && styles.countBadgeTextActive,
                    ]}
                  >
                    {item.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.searchWrap}>
          <Ionicons
            name="search-outline"
            size={18}
            color="#64748B"
          />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search Resident, email, barangay, or verification ID"
            placeholderTextColor="#94A3B8"
          />
        </View>

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
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.centerText}>
              Loading identity reviews...
            </Text>
          </View>
        ) : filtered.length === 0 ? (
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
            <View style={[styles.queue, wide && styles.queueWide]}>
              {filtered.map((item) => {
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
                      <Text style={styles.scoreLabel}>AI face score</Text>
                      <Text style={styles.scoreValue}>
                        {scoreText(item.matchScore)}
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
            </View>

            <View
              style={[
                styles.detailPanel,
                wide && styles.detailPanelWide,
              ]}
            >
              {selected ? (
                <ReviewDetail
                  item={selected}
                  validationMethod={validationMethod}
                  setValidationMethod={setValidationMethod}
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
  item,
  validationMethod,
  setValidationMethod,
  notes,
  setNotes,
  saving,
  onVerify,
  onRetry,
}: {
  item: IdentityReview;
  validationMethod: string;
  setValidationMethod: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  saving: "" | "verify" | "require_retry";
  onVerify: () => void;
  onRetry: () => void;
}) {
  const pending = reviewBucket(item) === "pending";

  return (
    <View>
      <View style={styles.detailHeader}>
        <View style={styles.detailHeaderIcon}>
          <Ionicons
            name="person-outline"
            size={24}
            color="#4F46E5"
          />
        </View>

        <View style={styles.flexOne}>
          <Text style={styles.detailTitle}>
            {item.resident?.fullName || "Resident"}
          </Text>
          <Text style={styles.detailMeta}>
            {item.resident?.email || "No email"}
          </Text>
        </View>

        <StatusChip bucket={reviewBucket(item)} />
      </View>

      <SectionTitle
        icon="person-circle-outline"
        title="Resident Account"
      />
      <InfoLine
        label="Barangay"
        value={item.resident?.barangay || "Not set"}
      />
      <InfoLine
        label="Phone"
        value={item.resident?.phoneNumber || "Not set"}
      />
      <InfoLine
        label="Account status"
        value={item.resident?.accountStatus || "—"}
      />

      <SectionTitle
        icon="scan-outline"
        title="AI Verification Result"
      />

      <View style={styles.scoreCard}>
        <View>
          <Text style={styles.scoreCardLabel}>Face match score</Text>
          <Text style={styles.scoreCardValue}>
            {scoreText(item.matchScore)}
          </Text>
        </View>

        <View>
          <Text style={styles.scoreCardLabel}>AI decision</Text>
          <Text style={styles.scoreCardDecision}>
            {item.aiDecision || "Not available"}
          </Text>
        </View>
      </View>

      <InfoLine
        label="Verification ID"
        value={item.verificationId || "—"}
      />
      <InfoLine
        label="Submitted"
        value={formatDate(item.lastSubmissionAt || item.createdAt)}
      />

      {item.message ? (
        <View style={styles.aiMessage}>
          <Ionicons
            name="information-circle-outline"
            size={19}
            color="#0F766E"
          />
          <Text style={styles.aiMessageText}>{item.message}</Text>
        </View>
      ) : null}

      {pending ? (
        <>
          <SectionTitle
            icon="shield-checkmark-outline"
            title="Independent LGU Validation"
          />

          <Text style={styles.helperText}>
            Choose the method actually used by LGU/Admin. Do not verify
            based only on the AI score.
          </Text>

          <View style={styles.methodList}>
            {VALIDATION_METHODS.map((method) => {
              const active = validationMethod === method.value;
              return (
                <TouchableOpacity
                  key={method.value}
                  style={[
                    styles.methodButton,
                    active && styles.methodButtonActive,
                  ]}
                  onPress={() => setValidationMethod(method.value)}
                >
                  <Ionicons
                    name={method.icon}
                    size={18}
                    color={active ? "#0F766E" : "#64748B"}
                  />
                  <Text
                    style={[
                      styles.methodButtonText,
                      active && styles.methodButtonTextActive,
                    ]}
                  >
                    {method.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.inputLabel}>
            Review notes / retry reason
          </Text>

          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Add LGU validation notes. A retry decision requires a clear reason."
            placeholderTextColor="#94A3B8"
            textAlignVertical="top"
          />

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.verifyButton,
                (!validationMethod || !!saving) &&
                  styles.disabledButton,
              ]}
              disabled={!validationMethod || !!saving}
              onPress={onVerify}
            >
              {saving === "verify" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons
                  name="shield-checkmark-outline"
                  size={19}
                  color="#FFFFFF"
                />
              )}
              <Text style={styles.verifyButtonText}>
                Verify Resident
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.retryButton,
                (notes.trim().length < 5 || !!saving) &&
                  styles.disabledButton,
              ]}
              disabled={notes.trim().length < 5 || !!saving}
              onPress={onRetry}
            >
              {saving === "require_retry" ? (
                <ActivityIndicator size="small" color="#B91C1C" />
              ) : (
                <Ionicons
                  name="refresh-outline"
                  size={19}
                  color="#B91C1C"
                />
              )}
              <Text style={styles.retryButtonText}>
                Require Retry
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <SectionTitle
            icon="checkmark-circle-outline"
            title="Manual Review Decision"
          />
          <InfoLine
            label="Decision"
            value={
              item.manualReviewDecision ||
              item.decision ||
              item.status ||
              "—"
            }
          />
          <InfoLine
            label="Validation method"
            value={item.manualValidationMethod || "—"}
          />
          <InfoLine
            label="Reviewed by"
            value={item.reviewedByName || item.reviewedBy || "—"}
          />
          <InfoLine
            label="Reviewed at"
            value={formatDate(item.reviewedAt)}
          />

          {item.manualReviewNotes ? (
            <View style={styles.resolvedNotes}>
              <Text style={styles.resolvedNotesLabel}>
                Review notes
              </Text>
              <Text style={styles.resolvedNotesText}>
                {item.manualReviewNotes}
              </Text>
            </View>
          ) : null}
        </>
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
    backgroundColor: "#F5F7FB",
  },
  scroll: {
    flex: 1,
  },
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 20,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4F46E5",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: "#4F46E5",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 25,
    fontWeight: "900",
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
    color: "#334155",
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
    color: "#0F172A",
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
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5",
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
    backgroundColor: "#F1F5F9",
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
    color: "#0F172A",
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
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyCard: {
    minHeight: 270,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyTitle: {
    marginTop: 10,
    color: "#0F172A",
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
  queue: {
    gap: 9,
  },
  queueWide: {
    width: 410,
    flexShrink: 0,
  },
  queueCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  queueCardActive: {
    borderColor: "#818CF8",
    backgroundColor: "#EEF2FF",
  },
  queueTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 39,
    height: 39,
    borderRadius: 20,
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
    color: "#0F172A",
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
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
  },
  queueDate: {
    marginTop: 6,
    color: "#94A3B8",
    fontSize: 9.5,
  },
  detailPanel: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
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
    color: "#0F172A",
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
    color: "#0F172A",
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
    color: "#0F172A",
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
    color: "#0F172A",
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
    color: "#0F172A",
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
});
