import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import {
  db,
} from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";

import {
  useUserSession,
} from "../../lib/useUserSession";

type Announcement = {
  id: string;

  title: string;
  message: string;

  audience?: string;
  priority?: string;

  imageUrl?: string;
  linkUrl?: string;

  publishAt?: any;
  createdAt?: any;
  updatedAt?: any;

  createdBy?: string;
};

export default function AnnouncementsScreen() {
  const {
    loading: sessionLoading,
    user,
    profile,
  } = useUserSession();

  const [announcements, setAnnouncements] =
    useState<Announcement[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const canReadAnnouncements = Boolean(user && isApprovedProfile(profile));

  const barangay =
    typeof profile?.barangay === "string"
      ? profile.barangay.trim()
      : "";

  // One audience-constrained Firestore listener is genuinely realtime.
  // A local clock tick only makes future-dated system notices visible when due;
  // it does NOT reconnect Firebase or trigger repeated reads.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Never query Firestore while Firebase Auth or the account profile is loading:
    // an unauthenticated listener can fail once with permission-denied and remain dead.
    if (sessionLoading) return;
    if (!canReadAnnouncements) {
      setAnnouncements([]);
      setLoading(false);
      setError(user
        ? "We couldn't verify access to your announcements. Reopen your account session and try again."
        : "Sign in to view your community announcements.");
      return;
    }

    if (refreshKey === 0) {
      setLoading(true);
    }
    setError("");

    // Critical: the active Cloud Firestore LIST rule requires a constrained
    // audience. Querying by publishAt alone causes permission-denied. This
    // single-field "in" query needs no new composite index or Rules release.
    const allowedAudiences = barangay ? ["all", barangay] : ["all"];
    const announcementQuery = query(
      collection(db, "announcements"),
      where("audience", "in", allowedAudiences)
    );

    const unsubscribe = onSnapshot(
      announcementQuery,
      (snapshot) => {
        const rows: Announcement[] = snapshot.docs.map((snapshotDoc) => {
          const data = snapshotDoc.data();
          return {
            id: snapshotDoc.id,
            title: typeof data.title === "string" ? data.title : "Announcement",
            message: typeof data.message === "string" ? data.message : "",
            audience: typeof data.audience === "string" ? data.audience : "",
            priority: typeof data.priority === "string" ? data.priority : "normal",
            imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
            linkUrl: typeof data.linkUrl === "string" ? data.linkUrl : "",
            publishAt: data.publishAt,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
          };
        });

        setAnnouncements(rows);
        setLoading(false);
        setError("");
      },
      (snapshotError: any) => {
        // Surface actionable text; never expose raw Firestore stack traces to users.
        const code = String(snapshotError?.code || "").toLowerCase();
        const message =
          code === "permission-denied" || code === "unauthenticated"
            ? "Your session cannot access announcements. Sign in again and check that your account is approved."
            : code === "failed-precondition"
              ? "Announcements are temporarily unavailable because a required database index is missing. Contact system support."
              : code === "unavailable" || code === "deadline-exceeded"
                ? "Could not connect to announcements. Check your connection, then tap Retry."
                : "Announcements could not be loaded. Tap Retry to reconnect.";
        console.warn("Announcement feed listener failed", { code: code || "unknown" });
        setError(message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [sessionLoading, user?.uid, canReadAnnouncements, barangay, refreshKey]);

  /*
   * USER VISIBILITY
   *
   * Super Admin announcement:
   *   audience = "all"
   *
   * Local Admin announcement:
   *   audience = Admin barangay
   *
   * Resident / Volunteer sees:
   *   GLOBAL
   *   +
   *   their own BARANGAY
   */
  const visibleAnnouncements =
    useMemo(() => {
      const normalizedBarangay =
        barangay.toLowerCase();

      const published = announcements.filter(
        (announcement) => {
          const audience =
            (
              announcement.audience || ""
            )
              .trim()
              .toLowerCase();

          const value = announcement.publishAt;
          const publishedAt = typeof value?.toMillis === "function"
            ? value.toMillis() : Number.NaN;
          if (!Number.isFinite(publishedAt) || publishedAt > nowMs) return false;
          return audience === "all" ||
            (normalizedBarangay.length > 0 && audience === normalizedBarangay);
        }
      );
      return published.sort((first, second) => {
        const a = typeof first.publishAt?.toMillis === "function"
          ? first.publishAt.toMillis() : 0;
        const b = typeof second.publishAt?.toMillis === "function"
          ? second.publishAt.toMillis() : 0;
        return b - a;
      });
    }, [
      announcements,
      barangay,
      nowMs,
    ]);

  if (sessionLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#087F78"
        />

        <Text style={styles.loadingText}>
          Loading announcements...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      {/* HEADER */}

      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          VOLUNSERVE UPDATES
        </Text>

        <Text style={styles.title}>
          Announcements
        </Text>

        <Text style={styles.subtitle}>
          View official VolunServe updates and
          announcements relevant to your area.
        </Text>
      </View>

      {/* AREA INFO */}

      <View style={styles.areaCard}>
        <Text style={styles.areaLabel}>
          YOUR ANNOUNCEMENT FEED
        </Text>

        <Text style={styles.areaValue}>
          Global
          {barangay
            ? ` + ${barangay}`
            : ""}
        </Text>

        <Text style={styles.areaHelp}>
          Global announcements are published by
          the Super Admin. Local announcements
          are published by the Admin assigned to
          your area.
        </Text>
      </View>

      {/* ERROR */}

      {error ? (
        <View style={styles.errorCard}>
          <Text accessibilityRole="alert" style={styles.errorText}>
            {error}
          </Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry loading announcements"
            onPress={() => setRefreshKey(value => value + 1)}
            style={{ marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: "#FDE8E8", alignSelf: "flex-start" }}>
            <Text style={{ color: "#991B1B", fontWeight: "800" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* EMPTY */}

      {!error &&
      visibleAnnouncements.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>
              !
            </Text>
          </View>

          <Text style={styles.emptyTitle}>
            No announcements yet
          </Text>

          <Text style={styles.emptyText}>
            There are currently no published
            announcements for your area.
          </Text>
        </View>
      ) : null}

      {/* ANNOUNCEMENTS */}

      {visibleAnnouncements.map(
        (announcement) => {
          const isGlobal =
            (
              announcement.audience || ""
            )
              .trim()
              .toLowerCase() === "all";

          return (
            <View
              key={announcement.id}
              style={styles.announcementCard}
            >
              <View style={styles.cardTopRow}>
                <View
                  style={[
                    styles.scopeBadge,

                    isGlobal
                      ? styles.globalBadge
                      : styles.localBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.scopeBadgeText,

                      isGlobal
                        ? styles.globalBadgeText
                        : styles.localBadgeText,
                    ]}
                  >
                    {isGlobal
                      ? "GLOBAL"
                      : "LOCAL"}
                  </Text>
                </View>

                <Text style={styles.dateText}>
                  {formatDate(
                    announcement.publishAt ||
                      announcement.createdAt
                  )}
                </Text>
              </View>

              <Text style={styles.cardTitle}>
                {announcement.title}
              </Text>

              <Text style={styles.cardMessage}>
                {announcement.message}
              </Text>

              <View style={styles.cardFooter}>
                <Text style={styles.audienceLabel}>
                  {isGlobal
                    ? "Visible system-wide"
                    : announcement.audience ||
                      barangay}
                </Text>
              </View>
            </View>
          );
        }
      )}
    </ScrollView>
  );
}

function formatDate(value: any) {
  if (!value) {
    return "";
  }

  try {
    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : new Date(value);

    return date.toLocaleString(
      undefined,
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    );
  } catch {
    return "";
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F6F8F7",
  },

  content: {
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",

    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 60,
  },

  center: {
    flex: 1,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#F6F8F7",
  },

  loadingText: {
    marginTop: 10,

    color: "#64748B",
    fontWeight: "600",
  },

  header: {
    marginBottom: 18,
  },

  eyebrow: {
    color: "#087F78",

    fontSize: 11,
    fontWeight: "700",

    letterSpacing: 1.3,
  },

  title: {
    color: "#173D32",

    fontSize: 28,
    fontWeight: "700",

    marginTop: 5,
  },

  subtitle: {
    color: "#64748B",

    fontSize: 14,
    lineHeight: 21,

    marginTop: 6,
  },

  areaCard: {
    backgroundColor: "#EAF8F6",

    borderWidth: 1,
    borderColor: "#C7EAE5",

    borderRadius: 15,

    padding: 16,

    marginBottom: 18,
  },

  areaLabel: {
    color: "#087F78",

    fontSize: 10,
    fontWeight: "900",

    letterSpacing: 1,
  },

  areaValue: {
    color: "#123047",

    fontSize: 17,
    fontWeight: "900",

    marginTop: 5,
  },

  areaHelp: {
    color: "#587174",

    fontSize: 12,
    lineHeight: 18,

    marginTop: 5,
  },

  errorCard: {
    backgroundColor: "#FEF2F2",

    borderWidth: 1,
    borderColor: "#FECACA",

    borderRadius: 12,

    padding: 14,

    marginBottom: 16,
  },

  errorText: {
    color: "#B91C1C",

    fontSize: 13,
    fontWeight: "700",
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",

    borderWidth: 1,
    borderColor: "#E2E8F0",

    borderRadius: 16,

    padding: 30,

    alignItems: "center",
  },

  emptyIcon: {
    width: 45,
    height: 45,

    borderRadius: 23,

    backgroundColor: "#EAF8F6",

    alignItems: "center",
    justifyContent: "center",

    marginBottom: 12,
  },

  emptyIconText: {
    color: "#087F78",

    fontSize: 20,
    fontWeight: "900",
  },

  emptyTitle: {
    color: "#123047",

    fontSize: 17,
    fontWeight: "900",
  },

  emptyText: {
    color: "#64748B",

    fontSize: 13,

    marginTop: 5,

    textAlign: "center",
  },

  announcementCard: {
    backgroundColor: "#FFFFFF",

    borderWidth: 1,
    borderColor: "#E2E8F0",

    borderRadius: 16,

    padding: 18,

    marginBottom: 13,
  },

  cardTopRow: {
    flexDirection: "row",

    justifyContent: "space-between",
    alignItems: "center",

    gap: 10,

    marginBottom: 12,
  },

  scopeBadge: {
    borderRadius: 999,

    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  globalBadge: {
    backgroundColor: "#EDE9FE",
  },

  localBadge: {
    backgroundColor: "#DDF7F3",
  },

  scopeBadgeText: {
    fontSize: 9,
    fontWeight: "900",

    letterSpacing: 0.7,
  },

  globalBadgeText: {
    color: "#6D28D9",
  },

  localBadgeText: {
    color: "#087F78",
  },

  dateText: {
    color: "#94A3B8",

    fontSize: 11,
    fontWeight: "700",
  },

  cardTitle: {
    color: "#123047",

    fontSize: 18,
    fontWeight: "900",
  },

  cardMessage: {
    color: "#475569",

    fontSize: 14,
    lineHeight: 22,

    marginTop: 7,
  },

  cardFooter: {
    marginTop: 15,

    paddingTop: 12,

    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
  },

  audienceLabel: {
    color: "#64748B",

    fontSize: 11,
    fontWeight: "700",
  },
});