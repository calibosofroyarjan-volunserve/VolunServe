import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useRouter, type Href } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
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

type EventStatus =
  | "upcoming"
  | "active"
  | "completed"
  | "cancelled";

type EventItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  barangay?: string;
  category?: string;
  status: EventStatus;
  publicationStatus: string;
  capacity: number;
  participantsCount?: number;
  description?: string;
  proposedBy?: string;
  proposerName?: string;
  approvedBy?: string;
  imageUrl?: string;
  coverImageUrl?: string;
  photoUrl?: string;
};

type Participant = {
  id: string;
  uid: string;
  eventId: string;
  fullName?: string;
  status: "joined" | "declined";
  joinedAt?: unknown;
  checkedInAt?: unknown;
  checkedOutAt?: unknown;
  attendanceVerified?: boolean;
  attendanceVerifiedAt?: unknown;
  assignedRole?: string;
  preferredRole?: string;
  // Present on some legacy participant records; otherwise read the user profile.
  profilePictureUrl?: string;
  photoURL?: string;
};

type Filter =
  | "all"
  | "upcoming"
  | "active"
  | "completed";

// Render certificate reconciliation (Spark-compatible): authenticated Admin only.
// This never changes attendance timestamps and must run AFTER a successful
// Firestore completion/verification transaction, not inside one.
const CERTIFICATE_BACKEND_URL = "https://volunserve.onrender.com";
const CERTIFICATE_SYNC_TIMEOUT_MS = 100_000;

type CertificateSyncResult = {
  ok: boolean;
  dryRun?: boolean;
  issuedCount?: number;
  alreadyExistingCount?: number;
  eligibleCount?: number;
  failedCount?: number;
  skippedCount?: number;
  message?: string;
  reason?: string;
};

async function reconcileCommunityCertificates(
  idToken: string,
  eventId: string,
  participantId?: string,
): Promise<CertificateSyncResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CERTIFICATE_SYNC_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${CERTIFICATE_BACKEND_URL}/api/admin/community-certificates/reconcile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          eventId,
          ...(participantId ? { participantId } : {}),
          execute: true,
        }),
        signal: controller.signal,
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | CertificateSyncResult
      | null;
    if (!response.ok || payload?.ok !== true || payload.dryRun !== false) {
      const detail = payload?.message || payload?.reason || `HTTP ${response.status}`;
      throw new Error(`Certificate sync failed (${detail}).`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function certificateSyncSummary(result: CertificateSyncResult): string {
  return `Certificates: ${result.issuedCount ?? 0} issued, ` +
    `${result.alreadyExistingCount ?? 0} already existing, ` +
    `${result.skippedCount ?? 0} skipped.`;
}

const GREEN = "#078F82";
const INK = "#112D46";
const MUTED = "#637893";

function asDate(value: unknown): Date | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value
  ) {
    const fn = value.toDate;

    if (typeof fn === "function") {
      const result = fn.call(value);

      return result instanceof Date &&
        !Number.isNaN(result.getTime())
        ? result
        : null;
    }
  }

  return null;
}

function stamp(value: unknown): string {
  const date = asDate(value);

  return date
    ? date.toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}

function schedule(event: EventItem): string {
  if (!event.date) {
    return "Schedule pending";
  }

  const date = new Date(
    `${event.date}T${event.time || "00:00"}:00`
  );

  if (Number.isNaN(date.getTime())) {
    return `${event.date} ${event.time || ""}`;
  }

  return date.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function errorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  if (
    message.includes("permission-denied") ||
    message.includes(
      "Missing or insufficient permissions"
    )
  ) {
    return "Firestore permission denied. Community Events rules must be deployed and verified first.";
  }

  return message;
}


const BORDER = "#DFE9E8";
const SURFACE = "#FFFFFF";
const NAVY = "#102E4D";

type AttendanceFilter =
  | "all"
  | "not-checked-in"
  | "checked-in"
  | "ready"
  | "verified";

type ProfileSummary = {
  uid: string;
  name: string;
  role: string;
  barangay: string;
  photo: string;
};

function safeText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function initials(value: string): string {
  return value.split(/[\s,]+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0].toUpperCase()).join("") || "V";
}

function categoryIcon(event: EventItem): React.ComponentProps<typeof Ionicons>["name"] {
  const name = `${event.title} ${event.category || ""}`.toLowerCase();
  if (/clean|waste|recycl|environment/.test(name)) return "leaf-outline";
  if (/tree|plant|garden/.test(name)) return "flower-outline";
  if (/feed|food|kitchen/.test(name)) return "restaurant-outline";
  if (/disaster|rescue|relief/.test(name)) return "shield-checkmark-outline";
  return "calendar-outline";
}

function categoryColor(event: EventItem): string {
  const name = `${event.title} ${event.category || ""}`.toLowerCase();
  if (/feed|food/.test(name)) return "#EEAD57";
  if (/disaster|rescue|relief/.test(name)) return "#6787C8";
  if (/tree|plant/.test(name)) return "#86A66F";
  return GREEN;
}

function imageFor(event: EventItem): string {
  const candidate = event.coverImageUrl || event.imageUrl || event.photoUrl || "";
  return /^https:\/\//i.test(candidate) ? candidate : "";
}

function verifiedServiceMeetsMinimum(person: Participant): boolean {
  const start = asDate(person.checkedInAt)?.getTime() ?? 0;
  const end = asDate(person.checkedOutAt)?.getTime() ?? 0;
  return person.attendanceVerified === true &&
    start > 0 && end >= start && end - start >= 30 * 60 * 1000;
}

function safeProfileImage(value: unknown): string {
  return typeof value === "string" && /^https:\/\//i.test(value.trim())
    ? value.trim()
    : "";
}

function hoursFor(person: Participant): number | null {
  const first = asDate(person.checkedInAt)?.getTime() ?? 0;
  const last = asDate(person.checkedOutAt)?.getTime() ?? 0;
  if (!first || !last || last < first) return null;
  return Math.max(0, Math.floor((last - first) / 60000));
}

function readableDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest ? `${rest}m` : ""}`.trim() : `${rest}m`;
}

function clockStamp(value: unknown): string {
  const d = asDate(value);
  return d ? d.toLocaleTimeString("en-PH", {hour: "numeric", minute: "2-digit"}) : "—";
}

function dateStamp(value: unknown): string {
  const d = asDate(value);
  return d ? d.toLocaleDateString("en-PH", {month: "short", day: "numeric", year: "numeric"}) : "";
}

function eventLabel(status: EventStatus): string {
  return status === "active" ? "ONGOING" : status.toUpperCase();
}

function participantStatus(person: Participant): {
  label: string;
  kind: "verified" | "pending" | "checked" | "idle";
} {
  if (person.attendanceVerified) return {label: "VERIFIED", kind: "verified"};
  if (person.checkedOutAt) return {label: "FOR VERIFICATION", kind: "pending"};
  if (person.checkedInAt) return {label: "CHECKED IN", kind: "checked"};
  return {label: "NOT CHECKED IN", kind: "idle"};
}

function EventArtwork({event, large = false}: {event: EventItem; large?: boolean}) {
  const [imageFailed, setImageFailed] = useState(false);
  const url = imageFor(event);
  const color = categoryColor(event);
  return (
    <View style={[styles.artwork, large && styles.artworkLarge, {backgroundColor: color + "18"}]}>
      {url && !imageFailed ? (
        <Image
          source={{uri: url}}
          resizeMode="cover"
          style={styles.artworkImage}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={[styles.artworkMark, large && styles.artworkMarkLarge, {backgroundColor: color + "20"}]}>
          <Ionicons name={categoryIcon(event)} size={large ? 58 : 28} color={color} />
        </View>
      )}
    </View>
  );
}

export default function CommunityAttendanceAdmin() {
  const router = useRouter();
  const { loading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();

  // Leave space for VolunServe's existing navigation sidebar on desktop.
  const narrow = width < 1380;
  const phone = width < 740;
  const smallHeader = width < 970;

  const allowed = Boolean(
    profile &&
      isApprovedProfile(profile) &&
      (
        profile.role === "admin" ||
        profile.role === "superadmin"
      )
  );

  const [events, setEvents] =
    useState<EventItem[]>([]);

  const [eventFilter, setEventFilter] =
    useState<Filter>("all");

  const [selectedId, setSelectedId] =
    useState("");

  const [participants, setParticipants] =
    useState<Participant[]>([]);

  const [eventsLoading, setEventsLoading] =
    useState(true);

  const [
    participantsLoading,
    setParticipantsLoading,
  ] = useState(false);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [volunteerSearch, setVolunteerSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("all");
  const [profileModal, setProfileModal] = useState<ProfileSummary | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [rosterSort, setRosterSort] = useState<"name" | "latest">("name");
  const [profilePhotos, setProfilePhotos] = useState<Record<string, string>>({});
  const profilePhotoCache = React.useRef<Record<string, string>>({});

  const [
    confirmComplete,
    setConfirmComplete,
  ] = useState(false);

  // Listen to published Community Events.
  useEffect(() => {
    if (!user || !allowed) {
      setEventsLoading(false);
      return;
    }

    setEventsLoading(true);

    return onSnapshot(
      collection(db, "communityEvents"),
      (snapshot) => {
        const records = snapshot.docs
          .map(
            (entry) =>
              ({
                id: entry.id,
                ...entry.data(),
              }) as EventItem
          )
          .filter(
            (event) =>
              event.publicationStatus === "published"
          )
          .sort((a, b) =>
            (a.date || "").localeCompare(
              b.date || ""
            )
          );

        setEvents(records);

        setSelectedId((previous) =>
          records.some(
            (item) => item.id === previous
          )
            ? previous
            : records[0]?.id || ""
        );

        setEventsLoading(false);
        setError("");
      },
      (err) => {
        setEventsLoading(false);
        setError(errorMessage(err));
      }
    );
  }, [user?.uid, allowed]);

  // Listen to volunteers for the selected event.
  useEffect(() => {
    setParticipants([]);
    setConfirmComplete(false);

    if (!user || !allowed || !selectedId) {
      setParticipantsLoading(false);
      return;
    }

    setParticipantsLoading(true);

    return onSnapshot(
      query(
        collection(
          db,
          "communityEventParticipants"
        ),
        where("eventId", "==", selectedId)
      ),
      (snapshot) => {
        setParticipants(
          snapshot.docs
            .map(
              (entry) =>
                ({
                  id: entry.id,
                  ...entry.data(),
                }) as Participant
            )
            .sort((a, b) =>
              (a.fullName || "").localeCompare(
                b.fullName || ""
              )
            )
        );

        setParticipantsLoading(false);
        setError("");
      },
      (err) => {
        setParticipantsLoading(false);
        setError(errorMessage(err));
      }
    );
  }, [user?.uid, allowed, selectedId]);

  const selected =
    events.find(
      (item) => item.id === selectedId
    ) || null;

  const visibleEvents = events.filter((item) => {
    const statusMatch = eventFilter === "all" || item.status === eventFilter;
    const search = eventSearch.trim().toLowerCase();
    const textMatch = !search || `${item.title} ${item.location} ${item.barangay || ""} ${item.category || ""}`
      .toLowerCase().includes(search);
    return statusMatch && textMatch;
  });

  const joined = useMemo(
    () =>
      participants.filter(
        (item) => item.status === "joined"
      ),
    [participants]
  );

  const verifiedCount = joined.filter(
    (item) =>
      item.attendanceVerified === true
  ).length;

  const checkedInCount = joined.filter(
    (item) => Boolean(item.checkedInAt)
  ).length;

  const verifiedMinutes = joined.reduce(
    (total, person) => total + (person.attendanceVerified ? hoursFor(person) || 0 : 0),
    0
  );
  const awaitingVerificationCount = joined.filter(
    (person) => !person.attendanceVerified && !!person.checkedInAt && !!person.checkedOutAt
  ).length;
  const serviceMinimumCount = joined.filter(verifiedServiceMeetsMinimum).length;

  // Cache profile images for the selected event; failures gracefully use initials.
  // This only reads profiles that Admin can already access through View Profile.
  useEffect(() => {
    if (!user || !allowed || participants.length === 0) return;
    const ids = [...new Set(participants
      .filter((person) => person.status === "joined" && !!person.uid)
      .map((person) => person.uid))]
      .slice(0, 60)
      .filter((uid) => !(uid in profilePhotoCache.current));
    if (!ids.length) return;
    let cancelled = false;
    const loadPhotos = async () => {
      for (let index = 0; index < ids.length; index += 8) {
        const batch = ids.slice(index, index + 8);
        const results = await Promise.allSettled(batch.map(async (uid) => {
          const snapshot = await getDoc(doc(db, "users", uid));
          const data = snapshot.exists() ? snapshot.data() : {};
          return {uid, url: safeProfileImage(data.profilePictureUrl || data.photoURL)};
        }));
        if (cancelled) return;
        const updates: Record<string, string> = {};
        results.forEach((result, i) => {
          const uid = batch[i];
          const url = result.status === "fulfilled" ? result.value.url : "";
          profilePhotoCache.current[uid] = url;
          updates[uid] = url;
        });
        setProfilePhotos((previous) => ({...previous, ...updates}));
      }
    };
    void loadPhotos();
    return () => { cancelled = true; };
  }, [participants, user?.uid, allowed]);

  const photoFor = (person: Participant) =>
    safeProfileImage(person.profilePictureUrl || person.photoURL) ||
    profilePhotos[person.uid] || "";

  const visibleVolunteers = joined.filter((person) => {
    const search = volunteerSearch.trim().toLowerCase();
    const searchable = `${person.fullName || ""} ${person.assignedRole || person.preferredRole || ""}`.toLowerCase();
    if (search && !searchable.includes(search)) return false;
    if (attendanceFilter === "verified") return person.attendanceVerified === true;
    if (attendanceFilter === "ready") return !person.attendanceVerified && !!person.checkedInAt && !!person.checkedOutAt;
    if (attendanceFilter === "checked-in") return !person.attendanceVerified && !!person.checkedInAt && !person.checkedOutAt;
    if (attendanceFilter === "not-checked-in") return !person.checkedInAt;
    return true;
  }).sort((a, b) => {
    if (rosterSort === "latest") {
      const aTime = asDate(a.checkedInAt)?.getTime() ?? 0;
      const bTime = asDate(b.checkedInAt)?.getTime() ?? 0;
      if (aTime !== bTime) return bTime - aTime;
    }
    return (a.fullName || "").localeCompare(b.fullName || "");
  });

  async function openProfile(uid: string, fallbackName: string) {
    if (!uid) return;
    setProfileModal({uid, name: fallbackName, role: "", barangay: "", photo: ""});
    setProfileError("");
    setProfileLoading(true);
    try {
      const snapshot = await getDoc(doc(db, "users", uid));
      if (!snapshot.exists()) {
        setProfileError("Profile record was not found.");
        return;
      }
      const data = snapshot.data();
      const composedName = [data.firstName, data.middleName, data.lastName]
        .filter((part) => typeof part === "string" && part.trim()).join(" ");
      setProfileModal({
        uid,
        name: safeText(data.fullName, composedName || fallbackName),
        role: safeText(data.role, "Volunteer"),
        barangay: safeText(data.barangay),
        photo: safeProfileImage(data.profilePictureUrl || data.photoURL),
      });
    } catch (reason) {
      setProfileError(errorMessage(reason));
    } finally {
      setProfileLoading(false);
    }
  }

  // The retry action is intentionally Admin-initiated. It is safe to use
  // after a Render cold start/timeout because certificate IDs are idempotent.
  async function retryCertificateSync(eventId: string) {
    if (!user || !allowed || busy) return;
    setError("");
    setNotice("");
    setBusy(`certificates:${eventId}`);
    try {
      const token = await user.getIdToken();
      const result = await reconcileCommunityCertificates(token, eventId);
      setNotice(`Certificate sync completed. ${certificateSyncSummary(result)}`);
    } catch (reason) {
      setError(
        `Certificate sync not confirmed: ${errorMessage(reason)} ` +
        "The event and attendance records were not changed. Try again later.",
      );
    } finally {
      setBusy("");
    }
  }

  // Start or complete a published event.
  async function changeStatus(
    next: "active" | "completed"
  ) {
    if (!user || !selected || busy) {
      return;
    }

    if (
      next === "completed" &&
      participantsLoading
    ) {
      setError(
        "Wait until the attendance list finishes loading before completing the event."
      );
      return;
    }

    if (
      next === "completed" &&
      joined.some(
        (person) =>
          person.checkedInAt &&
          !person.checkedOutAt
      )
    ) {
      setError(
        "Some volunteers are still checked in. Ask those volunteers to record their own Time Out before completing this event."
      );
      return;
    }

    setNotice("");
    setError("");
    setBusy(`event:${selected.id}`);

    try {
      const eventRef = doc(
        db,
        "communityEvents",
        selected.id
      );

      await runTransaction(
        db,
        async (tx) => {
          const snap = await tx.get(eventRef);

          if (!snap.exists()) {
            throw new Error(
              "Event not found."
            );
          }

          const current = snap.data();

          if (
            current.publicationStatus !==
            "published"
          ) {
            throw new Error(
              "Event is not published."
            );
          }

          if (
            next === "active" &&
            current.status !== "upcoming"
          ) {
            throw new Error(
              "Only upcoming events can be started."
            );
          }

          if (
            next === "completed" &&
            current.status !== "active"
          ) {
            throw new Error(
              "Start the event before marking it completed."
            );
          }

          if (next === "completed") {
            tx.update(eventRef, {
              status: "completed",
              completedBy: user.uid,
              completedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            tx.update(eventRef, {
              status: "active",
              updatedAt: serverTimestamp(),
            });
          }
        }
      );

      // The event transaction is already committed here. A Render failure
      // must NEVER be reported as a failed event completion.
      if (next === "completed") {
        setConfirmComplete(false);
        setNotice("Event marked completed. Checking eligible certificates...");
        try {
          const token = await user.getIdToken();
          const result = await reconcileCommunityCertificates(token, selected.id);
          setNotice(`Event marked completed. ${certificateSyncSummary(result)}`);
        } catch (reason) {
          setNotice("Event was completed successfully in Firestore.");
          setError(
            `Automatic certificate sync was not confirmed: ${errorMessage(reason)} ` +
            "Use Retry Certificate Sync on this completed event.",
          );
        }
      } else {
        setNotice("Event is now ongoing. Attendance is open.");
        setConfirmComplete(false);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }

  // Volunteers record their own Time In / Time Out in Community Events.
  // Admin can ONLY review these existing server timestamps and verify attendance.
  async function verifyAttendance(person: Participant) {
    if (!user || !allowed || !selected || busy) {
      return;
    }

    setNotice("");
    setError("");
    setBusy(`person:${person.id}`);

    try {
      const eventRef = doc(db, "communityEvents", selected.id);
      const participantRef = doc(db, "communityEventParticipants", person.id);

      const completedWhenVerified = await runTransaction(db, async (tx) => {
        const eventSnap = await tx.get(eventRef);
        const participantSnap = await tx.get(participantRef);

        if (!eventSnap.exists() || !participantSnap.exists()) {
          throw new Error("Event or volunteer record not found.");
        }

        const event = eventSnap.data();
        const participant = participantSnap.data();

        if (
          participant.eventId !== selected.id ||
          participant.status !== "joined"
        ) {
          throw new Error("This volunteer is not joined to this event.");
        }

        if (participant.attendanceVerified === true) {
          throw new Error("Attendance has already been verified.");
        }

        if (!["active", "completed"].includes(event.status)) {
          throw new Error("Start the event before verifying attendance.");
        }

        const inDate = asDate(participant.checkedInAt);
        const outDate = asDate(participant.checkedOutAt);

        if (!inDate || !outDate || outDate.getTime() < inDate.getTime()) {
          throw new Error(
            "Volunteer-recorded Time In and Time Out are required for verification."
          );
        }

        // IMPORTANT: Do not write checkedInAt or checkedOutAt here.
        // Those fields must only be recorded by the Volunteer.
        tx.update(participantRef, {
          attendanceVerified: true,
          attendanceVerifiedAt: serverTimestamp(),
          attendanceVerifiedBy: user.uid,
          updatedAt: serverTimestamp(),
        });
        return event.status === "completed";
      });

      // If the event is still active, completion will reconcile all verified
      // volunteers later. If already completed, reconcile this volunteer now.
      const successNotice = `${person.fullName || "Volunteer"} attendance verified.`;
      if (completedWhenVerified) {
        setNotice(`${successNotice} Checking certificate eligibility...`);
        try {
          const token = await user.getIdToken();
          const result = await reconcileCommunityCertificates(
            token, selected.id, person.id,
          );
          setNotice(`${successNotice} ${certificateSyncSummary(result)}`);
        } catch (reason) {
          setNotice(successNotice);
          setError(
            `Certificate sync was not confirmed: ${errorMessage(reason)} ` +
            "Attendance remains verified. Use Retry Certificate Sync for this event.",
          );
        }
      } else {
        setNotice(`${successNotice} Certificates will be checked at event completion.`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  if (!user || !allowed) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.page}>
      <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, phone && styles.contentPhone]}
        keyboardShouldPersistTaps="handled"
      >
        {/* The existing Admin navigation/sidebar is owned by the parent layout. */}
        <View style={[styles.titleRow, phone && styles.titleRowPhone]}>
          <View style={styles.pageIntro}>
            <Text style={styles.eyebrow}>VOLUNSERVE  ›  COMMUNITY EVENTS  ›  ATTENDANCE</Text>
            <Text style={styles.title}>Attendance Management</Text>
            <Text style={styles.subtitle}>
              Volunteers record their own Time In/Out. Admin reviews attendance, verifies service, and manages event status.
            </Text>
          </View>
          {!smallHeader && (
            <View style={styles.headerNote}>
              <View style={styles.headerNoteIcon}>
                <Ionicons name="calendar-outline" size={30} color={GREEN} />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.headerNoteTitle}>Participation tracking</Text>
                <Text style={styles.headerNoteBody}>Accurate attendance. Verified service.</Text>
              </View>
            </View>
          )}
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={19} color="#B42318" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {!!notice && (
          <View style={styles.noticeBox}>
            <Ionicons name="checkmark-circle-outline" size={19} color="#087264" />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        <View style={[styles.columns, narrow && styles.columnsNarrow]}>
          {/* Left: real published Community Events. */}
          <View style={[styles.panel, styles.eventPanel, !narrow && styles.leftPanel]}>
            <View style={styles.panelHeading}>
              <View style={styles.headingWithIcon}>
                <View style={styles.headingIcon}>
                  <Ionicons name="calendar-outline" color={GREEN} size={20} />
                </View>
                <Text style={styles.panelTitle}>Published Events</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/(admin)/community-events" as Href)}
                style={styles.smallAction}
              >
                <Ionicons name="arrow-forward-outline" size={14} color="#FFFFFF" />
                <Text style={styles.smallActionText}>Proposals</Text>
              </Pressable>
            </View>

            <View style={styles.searchField}>
              <Ionicons name="search-outline" size={17} color="#6E8396" />
              <TextInput
                value={eventSearch}
                onChangeText={setEventSearch}
                placeholder="Search published events..."
                placeholderTextColor="#8698A8"
                style={styles.searchInput}
                accessibilityLabel="Search published events"
              />
              {eventSearch.length > 0 && (
                <Pressable onPress={() => setEventSearch("")} accessibilityRole="button">
                  <Ionicons name="close-circle" size={18} color="#8698A8" />
                </Pressable>
              )}
            </View>

            <View style={styles.filterRow}>
              {(["all", "upcoming", "active", "completed"] as Filter[]).map((item) => {
                const count = item === "all"
                  ? events.length
                  : events.filter((event) => event.status === item).length;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setEventFilter(item)}
                    accessibilityRole="button"
                    style={[styles.chip, eventFilter === item && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, eventFilter === item && styles.chipTextActive]}>
                      {item === "all" ? "All" : item === "active" ? "Ongoing" :
                        item[0].toUpperCase() + item.slice(1)} ({count})
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {eventsLoading ? (
              <ActivityIndicator color={GREEN} style={styles.loader} />
            ) : visibleEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-clear-outline" size={27} color="#9AACB5" />
                <Text style={styles.emptyTitle}>No matching events</Text>
                <Text style={styles.emptySub}>Try another search or status filter.</Text>
              </View>
            ) : (
              visibleEvents.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => {
                    setSelectedId(event.id);
                    setError("");
                    setNotice("");
                    setVolunteerSearch("");
                    setAttendanceFilter("all");
                  }}
                  accessibilityRole="button"
                  style={[styles.eventRow, selectedId === event.id && styles.eventRowActive]}
                >
                  <EventArtwork event={event} />
                  <View style={styles.eventRowContent}>
                    <Text numberOfLines={2} style={styles.eventTitle}>{event.title}</Text>
                    <View style={styles.miniMetaRow}>
                      <Ionicons name="calendar-outline" color={MUTED} size={12} />
                      <Text numberOfLines={1} style={styles.miniMeta}>{schedule(event)}</Text>
                    </View>
                    <View style={styles.miniMetaRow}>
                      <Ionicons name="location-outline" color={MUTED} size={12} />
                      <Text numberOfLines={1} style={styles.miniMeta}>{event.location || "Venue not provided"}</Text>
                    </View>
                  </View>
                  <View style={styles.eventRowEnd}>
                    <View style={[styles.statusPill,
                      event.status === "completed" && styles.statusCompleted,
                      event.status === "active" && styles.statusActive,
                      event.status === "cancelled" && styles.statusCancelled
                    ]}>
                      <Text style={[styles.statusText,
                        event.status === "completed" && styles.statusCompletedText,
                        event.status === "active" && styles.statusActiveText,
                        event.status === "cancelled" && styles.statusCancelledText
                      ]}>{eventLabel(event.status)}</Text>
                    </View>
                    {selectedId === event.id && <Ionicons name="chevron-forward" size={17} color={GREEN} />}
                  </View>
                </Pressable>
              ))
            )}
            <View style={styles.eventPanelFooter}>
              <Ionicons name="information-circle-outline" size={15} color={MUTED} />
              <Text style={styles.mutedNote}>Showing published events from Firestore.</Text>
            </View>
          </View>

          {/* Right: selected event details, no fabricated event data. */}
          <View style={[styles.panel, styles.detailsPanel]}>
            {!selected ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={30} color="#9AACB5" />
                <Text style={styles.emptyTitle}>Choose a published event</Text>
                <Text style={styles.emptySub}>Select an event to review its attendance records.</Text>
              </View>
            ) : (
              <>
                <View style={[styles.heroRow, phone && styles.heroRowPhone]}>
                  <EventArtwork key={selected.id} event={selected} large />
                  <View style={styles.heroBody}>
                    <View style={styles.heroTitleRow}>
                      <Text style={styles.heroTitle}>{selected.title}</Text>
                      <View style={[styles.statusPill,
                        selected.status === "completed" && styles.statusCompleted,
                        selected.status === "active" && styles.statusActive,
                        selected.status === "cancelled" && styles.statusCancelled
                      ]}>
                        <Text style={[styles.statusText,
                          selected.status === "completed" && styles.statusCompletedText,
                          selected.status === "active" && styles.statusActiveText,
                          selected.status === "cancelled" && styles.statusCancelledText
                        ]}>{eventLabel(selected.status)}</Text>
                      </View>
                    </View>
                    <View style={styles.infoLine}>
                      <Ionicons name="calendar-outline" color="#51708C" size={17} />
                      <Text style={styles.infoText}>{schedule(selected)}</Text>
                    </View>
                    <View style={styles.infoLine}>
                      <Ionicons name="location-outline" color="#51708C" size={17} />
                      <Text style={styles.infoText}>
                        {selected.location || "Venue not provided"}
                        {selected.barangay ? `, ${selected.barangay}` : ""}
                      </Text>
                    </View>
                    <View style={styles.infoLine}>
                      <Ionicons name="pricetag-outline" color="#51708C" size={17} />
                      <Text style={styles.infoText}>{selected.category || "Community Service"}</Text>
                    </View>
                    <View style={styles.infoLine}>
                      <Ionicons name="people-outline" color="#51708C" size={17} />
                      <Text style={styles.infoText}>
                        {joined.length} joined {selected.capacity > 0 ? `/ ${selected.capacity} capacity` : ""}
                      </Text>
                    </View>
                    <View style={styles.infoLine}>
                      <Ionicons name="person-outline" color="#51708C" size={17} />
                      <Text style={styles.infoText}>
                        Organized by: {safeText(selected.proposerName, "Organizer not specified")}
                      </Text>
                    </View>
                  </View>
                </View>

                {(selected.description || selected.proposerName) && (
                  <View style={[styles.infoPanel, phone && styles.infoPanelPhone]}>
                    <View style={styles.descriptionBlock}>
                      <Text style={styles.miniSectionTitle}>About this event</Text>
                      <Text style={styles.descriptionText}>
                        {selected.description || "No event description provided."}
                      </Text>
                    </View>
                    {!!selected.proposerName && (
                      <View style={styles.organizerCard}>
                        <View style={styles.organizerBadge}>
                          <Text style={styles.organizerInitials}>{initials(selected.proposerName)}</Text>
                        </View>
                        <Text numberOfLines={2} style={styles.organizerName}>{selected.proposerName}</Text>
                        <Text style={styles.organizerCaption}>Event proposer</Text>
                        {!!selected.proposedBy && (
                          <Pressable
                            onPress={() => void openProfile(selected.proposedBy || "", selected.proposerName || "Organizer")}
                            style={styles.profileOutlineButton}
                            accessibilityRole="button"
                          >
                            <Ionicons name="person-outline" size={14} color={GREEN} />
                            <Text style={styles.profileOutlineText}>View Profile</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                )}

                <View style={[styles.statsRow, phone && styles.statsRowPhone]}>
                  {([
                    {label: "Joined", value: String(joined.length), icon: "people-outline" as const, tint: "#E3F5ED", ink: "#0A8875"},
                    {label: "Checked In", value: String(checkedInCount), icon: "checkmark-done-outline" as const, tint: "#E8F1FF", ink: "#336ED0"},
                    {label: "Verified", value: String(verifiedCount), icon: "shield-checkmark-outline" as const, tint: "#E3F5ED", ink: "#0A8875"},
                    {label: "Verified Hours", value: readableDuration(verifiedMinutes), icon: "time-outline" as const, tint: "#F0ECFF", ink: "#6742C3"},
                    {label: "For Review", value: String(awaitingVerificationCount), icon: "clipboard-outline" as const, tint: "#FFF5E7", ink: "#A96716"},
                  ]).map((stat) => (
                    <View key={stat.label} style={[styles.stat, phone && styles.statPhone]}>
                      <View style={[styles.statIcon, {backgroundColor: stat.tint}]}>
                        <Ionicons name={stat.icon} size={21} color={stat.ink} />
                      </View>
                      <View style={styles.statText}>
                        <Text style={styles.statLabel}>{stat.label}</Text>
                        <Text style={[styles.number, {color: stat.ink}]}>{stat.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {selected.status === "upcoming" && (
                  <Pressable
                    disabled={!!busy}
                    onPress={() => void changeStatus("active")}
                    style={[styles.primaryButton, styles.wideButton, !!busy && styles.disabled]}
                  >
                    <Ionicons name="play-circle" size={21} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>
                      {busy === `event:${selected.id}` ? "Starting..." : "Start Event"}
                    </Text>
                  </Pressable>
                )}

                {selected.status === "active" && !confirmComplete && (
                  <Pressable
                    disabled={!!busy}
                    onPress={() => setConfirmComplete(true)}
                    style={[styles.primaryButton, styles.wideButton, !!busy && styles.disabled]}
                  >
                    <Ionicons name="checkmark-done-circle-outline" color="#FFFFFF" size={20} />
                    <Text style={styles.primaryButtonText}>Mark Event Completed</Text>
                  </Pressable>
                )}

                {selected.status === "active" && confirmComplete && (
                  <View style={styles.confirmBox}>
                    <View style={styles.confirmTop}>
                      <Ionicons name="warning-outline" color="#A3610A" size={20} />
                      <Text style={styles.confirmText}>
                        Complete this event? Volunteers who are still checked in must record their own Time Out first.
                        Only Admin-verified attendance is considered for certificate eligibility.
                      </Text>
                    </View>
                    <View style={styles.buttonRow}>
                      <Pressable
                        onPress={() => setConfirmComplete(false)}
                        disabled={!!busy}
                        style={[styles.outlineButton, styles.confirmAction]}
                      >
                        <Text style={styles.outlineText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void changeStatus("completed")}
                        disabled={!!busy}
                        style={[styles.primaryButton, styles.confirmAction, !!busy && styles.disabled]}
                      >
                        <Text style={styles.primaryButtonText}>Confirm Completion</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {selected.status === "completed" && (
                  <View>
                    <View style={styles.completedNote}>
                      <Ionicons name="checkmark-circle-outline" size={17} color="#168069" />
                      <Text style={styles.completedNoteText}>
                        Event completed. Verified attendance remains available for certificate eligibility.
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry automatic certificate sync"
                      disabled={!!busy}
                      onPress={() => void retryCertificateSync(selected.id)}
                      style={[styles.outlineButton, {marginTop: 9}, !!busy && styles.disabled]}
                    >
                      <Text style={styles.outlineText}>
                        {busy === `certificates:${selected.id}`
                          ? "Checking certificates..."
                          : "Retry Certificate Sync"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* Full-width attendance section mirrors the selected dashboard concept. */}
        {!!selected && (
          <View style={[styles.panel, styles.attendancePanel]}>
            <View style={[styles.attendanceTitleRow, phone && styles.attendanceTitleRowPhone]}>
              <View style={styles.headingWithIcon}>
                <View style={styles.headingIcon}>
                  <Ionicons name="people-outline" size={20} color={NAVY} />
                </View>
                <View>
                  <Text style={styles.panelTitle}>Volunteer Attendance</Text>
                  <Text style={styles.sectionSub}>{joined.length} joined participant{joined.length === 1 ? "" : "s"}</Text>
                </View>
              </View>
              <View style={[styles.rosterControls, phone && styles.rosterControlsPhone]}>
                <View style={[styles.searchField, styles.rosterSearch, phone && styles.rosterSearchPhone]}>
                  <Ionicons name="search-outline" size={17} color="#6E8396" />
                  <TextInput
                    value={volunteerSearch}
                    onChangeText={setVolunteerSearch}
                    placeholder="Search volunteers..."
                    placeholderTextColor="#8698A8"
                    style={styles.searchInput}
                    accessibilityLabel="Search volunteers"
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={rosterSort === "name" ? "Sort by latest Time In" : "Sort by volunteer name"}
                  onPress={() => setRosterSort((current) => current === "name" ? "latest" : "name")}
                  style={styles.sortButton}
                >
                  <Ionicons name="swap-vertical-outline" color={GREEN} size={16} />
                  <Text style={styles.sortButtonText}>{rosterSort === "name" ? "Name A–Z" : "Latest Time In"}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.attendanceFilterRow}>
              {([
                ["all", "All"],
                ["not-checked-in", "Not Checked In"],
                ["checked-in", "Checked In"],
                ["ready", "For Verification"],
                ["verified", "Verified"],
              ] as [AttendanceFilter, string][]).map(([id, label]) => (
                <Pressable
                  key={id}
                  onPress={() => setAttendanceFilter(id)}
                  style={[styles.attendanceChip, attendanceFilter === id && styles.attendanceChipActive]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.attendanceChipText, attendanceFilter === id && styles.attendanceChipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {participantsLoading ? (
              <ActivityIndicator color={GREEN} style={styles.loader} />
            ) : joined.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={29} color="#9AACB5" />
                <Text style={styles.emptyTitle}>No volunteers have joined yet</Text>
                <Text style={styles.emptySub}>Joined participants will appear here automatically.</Text>
              </View>
            ) : visibleVolunteers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={27} color="#9AACB5" />
                <Text style={styles.emptyTitle}>No matching volunteers</Text>
                <Text style={styles.emptySub}>Clear the search or change the attendance filter.</Text>
              </View>
            ) : (
              phone ? (
                <View style={styles.mobileRosterList}>
                  {visibleVolunteers.map((person, index) => {
                    const state = participantStatus(person);
                    const verified = person.attendanceVerified === true;
                    const canVerify = (selected.status === "active" || selected.status === "completed") &&
                      !verified && !!person.checkedInAt && !!person.checkedOutAt;
                    const photo = photoFor(person);
                    return (
                      <View key={person.id} style={styles.mobileRosterCard}>
                        <View style={styles.mobileRosterHeading}>
                          <View style={styles.personAvatar}>
                            {photo ? <Image source={{uri: photo}} style={styles.personAvatarImage} resizeMode="cover" /> :
                              <Text style={styles.personAvatarText}>{initials(person.fullName || "Volunteer")}</Text>}
                          </View>
                          <View style={styles.mobileRosterIdentity}>
                            <Text style={styles.personName} numberOfLines={2}>{index + 1}. {person.fullName || "Volunteer"}</Text>
                            <Text style={styles.personSub} numberOfLines={2}>
                              {safeText(person.assignedRole, safeText(person.preferredRole, "Role not assigned"))}
                            </Text>
                          </View>
                          <View style={[styles.attendanceStatus,
                            state.kind === "verified" && styles.attendanceVerified,
                            state.kind === "checked" && styles.attendanceChecked,
                            state.kind === "pending" && styles.attendancePending]}>
                            <Text style={[styles.attendanceStatusText,
                              state.kind === "verified" && styles.attendanceVerifiedText,
                              state.kind === "checked" && styles.attendanceCheckedText,
                              state.kind === "pending" && styles.attendancePendingText]}>{state.label}</Text>
                          </View>
                        </View>
                        <View style={styles.mobileTimes}>
                          <View style={styles.mobileTimeBlock}>
                            <Text style={styles.mobileTimeLabel}>VOLUNTEER TIME IN</Text>
                            <Text style={styles.timeText}>{clockStamp(person.checkedInAt)}</Text>
                            <Text style={styles.timeSub}>{dateStamp(person.checkedInAt) || "Not recorded"}</Text>
                          </View>
                          <View style={styles.mobileTimeBlock}>
                            <Text style={styles.mobileTimeLabel}>VOLUNTEER TIME OUT</Text>
                            <Text style={styles.timeText}>{clockStamp(person.checkedOutAt)}</Text>
                            <Text style={styles.timeSub}>{dateStamp(person.checkedOutAt) || "Not recorded"}</Text>
                          </View>
                          <View style={styles.mobileTimeBlock}>
                            <Text style={styles.mobileTimeLabel}>DURATION</Text>
                            <Text style={styles.timeText}>{readableDuration(hoursFor(person))}</Text>
                            {verifiedServiceMeetsMinimum(person) &&
                              <Text style={styles.mobileDurationEligible}>30m minimum met</Text>}
                          </View>
                        </View>
                        <View style={styles.mobileRosterActions}>
                          <Pressable
                            onPress={() => void openProfile(person.uid, person.fullName || "Volunteer")}
                            disabled={!person.uid}
                            accessibilityRole="button"
                            style={[styles.profileOutlineButton, styles.mobileRosterButton]}
                          >
                            <Ionicons name="eye-outline" color={GREEN} size={15} />
                            <Text style={styles.profileOutlineText}>View Profile</Text>
                          </Pressable>
                          {canVerify && (
                            <Pressable
                              onPress={() => void verifyAttendance(person)}
                              disabled={!!busy}
                              accessibilityRole="button"
                              style={[styles.primaryButton, styles.mobileRosterButton, !!busy && styles.disabled]}
                            >
                              <Ionicons name="shield-checkmark-outline" color="#FFFFFF" size={15} />
                              <Text style={styles.rowActionText}>Verify Attendance</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true} nestedScrollEnabled>
                <View style={styles.table}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeadText, styles.colNumber]}>#</Text>
                    <Text style={[styles.tableHeadText, styles.colPerson]}>Volunteer</Text>
                    <Text style={[styles.tableHeadText, styles.colRole]}>Assigned Role</Text>
                    <Text style={[styles.tableHeadText, styles.colTime]}>Time In</Text>
                    <Text style={[styles.tableHeadText, styles.colTime]}>Time Out</Text>
                    <Text style={[styles.tableHeadText, styles.colHours]}>Hours</Text>
                    <Text style={[styles.tableHeadText, styles.colStatus]}>Status</Text>
                    <Text style={[styles.tableHeadText, styles.colActions]}>Actions</Text>
                  </View>
                  {visibleVolunteers.map((person, index) => {
                    const verified = person.attendanceVerified === true;
                    const hasIn = !!person.checkedInAt;
                    const hasOut = !!person.checkedOutAt;
                    const state = participantStatus(person);
                    // Admin never performs Time In/Out. It only verifies
                    // timestamps recorded by the Volunteer.
                    const canVerify = (selected.status === "active" || selected.status === "completed") && !verified && hasIn && hasOut;
                    return (
                      <View key={person.id} style={styles.tableRow}>
                        <Text style={[styles.tableText, styles.colNumber]}>{index + 1}</Text>
                        <View style={[styles.personCell, styles.colPerson]}>
                          <View style={styles.personAvatar}>
                            {photoFor(person) ?
                              <Image source={{uri: photoFor(person)}} style={styles.personAvatarImage} resizeMode="cover" /> :
                              <Text style={styles.personAvatarText}>{initials(person.fullName || "Volunteer")}</Text>}
                          </View>
                          <View style={{flex: 1}}>
                            <Text numberOfLines={2} style={styles.personName}>{person.fullName || "Volunteer"}</Text>
                            <Text style={styles.personSub}>Volunteer</Text>
                          </View>
                        </View>
                        <Text style={[styles.tableText, styles.colRole]} numberOfLines={2}>
                          {safeText(person.assignedRole, safeText(person.preferredRole, "Not assigned"))}
                        </Text>
                        <View style={styles.colTime}>
                          <Text style={styles.timeText}>{clockStamp(person.checkedInAt)}</Text>
                          {!!person.checkedInAt && <Text style={styles.timeSub}>{dateStamp(person.checkedInAt)}</Text>}
                        </View>
                        <View style={styles.colTime}>
                          <Text style={styles.timeText}>{clockStamp(person.checkedOutAt)}</Text>
                          {!!person.checkedOutAt && <Text style={styles.timeSub}>{dateStamp(person.checkedOutAt)}</Text>}
                        </View>
                        <Text style={[styles.tableText, styles.hoursText, styles.colHours]}>
                          {readableDuration(hoursFor(person))}
                        </Text>
                        <View style={styles.colStatus}>
                          <View style={[styles.attendanceStatus,
                            state.kind === "verified" && styles.attendanceVerified,
                            state.kind === "checked" && styles.attendanceChecked,
                            state.kind === "pending" && styles.attendancePending,
                          ]}>
                            <Text style={[styles.attendanceStatusText,
                              state.kind === "verified" && styles.attendanceVerifiedText,
                              state.kind === "checked" && styles.attendanceCheckedText,
                              state.kind === "pending" && styles.attendancePendingText,
                            ]}>{state.label}</Text>
                          </View>
                        </View>
                        <View style={[styles.actionsCell, styles.colActions]}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => void openProfile(person.uid, person.fullName || "Volunteer")}
                            disabled={!person.uid}
                            style={styles.profileOutlineButton}
                          >
                            <Ionicons name="eye-outline" size={14} color={GREEN} />
                            <Text style={styles.profileOutlineText}>Profile</Text>
                          </Pressable>
                          {canVerify && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Verify ${person.fullName || "volunteer"} attendance`}
                              disabled={!!busy}
                              onPress={() => void verifyAttendance(person)}
                              style={[styles.primaryButton, styles.rowAction, !!busy && styles.disabled]}
                            >
                              <Ionicons name="shield-checkmark-outline" size={14} color="#FFFFFF" />
                              <Text style={styles.rowActionText}>Verify</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
              ))}
            <View style={styles.certificateReadinessRow}>
              <View style={styles.readinessChip}>
                <Ionicons name="clipboard-outline" color="#9B651C" size={15} />
                <Text style={styles.readinessText}>{awaitingVerificationCount} waiting for Admin verification</Text>
              </View>
              <View style={styles.readinessChip}>
                <Ionicons name="ribbon-outline" color="#0A806C" size={15} />
                <Text style={styles.readinessText}>
                  {serviceMinimumCount} verified with 30+ minutes
                  {selected.status === "completed" ? " · Eligible for certificate check" : " · Certificate check after completion"}
                </Text>
              </View>
            </View>
            <View style={styles.eligibilityNotice}>
              <View style={styles.eligibilityIcon}>
                <Ionicons name="information-circle-outline" size={24} color="#3874CF" />
              </View>
              <Text style={styles.eligibilityText}>
                Volunteers record their own Time In and Time Out. Admin only reviews and verifies the recorded times; verification does not edit timestamps. Community Event certificates also require event completion and at least 30 minutes of verified service.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={profileModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Profile Details</Text>
              <Pressable onPress={() => setProfileModal(null)} accessibilityRole="button" style={styles.modalClose}>
                <Ionicons name="close-outline" color={INK} size={23} />
              </Pressable>
            </View>
            {profileLoading ? (
              <ActivityIndicator color={GREEN} style={styles.loader} />
            ) : (
              <>
                <View style={styles.modalAvatar}>
                  {profileModal?.photo ?
                    <Image source={{uri: profileModal.photo}} style={styles.modalAvatarImage} resizeMode="cover" /> :
                    <Text style={styles.modalAvatarText}>{initials(profileModal?.name || "Volunteer")}</Text>}
                </View>
                <Text style={styles.modalName}>{profileModal?.name || "Volunteer"}</Text>
                <Text style={styles.modalMeta}>Role: {profileModal?.role || "Not specified"}</Text>
                <Text style={styles.modalMeta}>
                  Barangay: {profileModal?.barangay || "Not provided"}
                </Text>
                {!!profileError && <Text style={styles.modalError}>{profileError}</Text>}
                <Text style={styles.modalFootnote}>
                  Information displayed from the existing VolunServe user profile.
                </Text>
              </>
            )}
            <Pressable style={[styles.primaryButton, styles.modalDone]} onPress={() => setProfileModal(null)}>
              <Text style={styles.primaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {flex: 1, backgroundColor: "#F6F8F7"},
  scroll: {flex: 1},
  content: {width: "100%", maxWidth: 1560, alignSelf: "center", padding: 22, paddingBottom: 42},
  contentPhone: {padding: 12, paddingBottom: 30},
  center: {flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F8F8"},
  titleRow: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18, marginBottom: 21, flexWrap: "wrap"},
  titleRowPhone: {flexDirection: "column", alignItems: "flex-start"},
  pageIntro: {flex: 1, minWidth: 0},
  eyebrow: {fontSize: 11, fontWeight: "900", letterSpacing: 0.65, color: GREEN, marginBottom: 7},
  title: {fontSize: 29, letterSpacing: -0.65, lineHeight: 35, fontWeight: "700", color: NAVY},
  subtitle: {fontSize: 13, color: MUTED, marginTop: 5, lineHeight: 20},
  headerNote: {flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#E8F6F2", borderRadius: 15, padding: 13, width: 285},
  headerNoteIcon: {width: 52, height: 52, borderRadius: 12, backgroundColor: "#DAEEE7", alignItems: "center", justifyContent: "center"},
  headerNoteTitle: {fontSize: 12, fontWeight: "900", color: "#145A4E"},
  headerNoteBody: {fontSize: 11, lineHeight: 17, color: "#477A74", marginTop: 3},
  columns: {flexDirection: "row", alignItems: "flex-start", gap: 14},
  columnsNarrow: {flexDirection: "column"},
  panel: {backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 15, shadowColor: "#244659", shadowOpacity: 0.035, shadowRadius: 12, shadowOffset: {width: 0, height: 4}, elevation: 1},
  eventPanel: {padding: 14, width: "100%"},
  leftPanel: {width: 346},
  detailsPanel: {flex: 1, width: "100%", minWidth: 0, padding: 15},
  panelHeading: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8},
  headingWithIcon: {flexDirection: "row", alignItems: "center", gap: 10},
  headingIcon: {width: 34, height: 34, borderRadius: 10, backgroundColor: "#E8F6F1", alignItems: "center", justifyContent: "center"},
  panelTitle: {fontSize: 17, fontWeight: "900", color: NAVY, letterSpacing: -0.15},
  smallAction: {backgroundColor: GREEN, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, minHeight: 34},
  smallActionText: {color: "white", fontSize: 11, fontWeight: "800"},
  searchField: {minHeight: 40, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#D9E4E8", borderRadius: 9, paddingHorizontal: 10, gap: 8, marginTop: 13, backgroundColor: "#FCFDFD"},
  searchInput: {flex: 1, minWidth: 0, fontSize: 12, color: INK, paddingVertical: 6, outlineStyle: "none"} as any,
  filterRow: {flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10, marginBottom: 12},
  chip: {borderRadius: 19, backgroundColor: "#F1F5F7", paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: "#EDF0F3"},
  chipActive: {backgroundColor: GREEN, borderColor: GREEN},
  chipText: {fontSize: 10, fontWeight: "800", color: "#506C83"},
  chipTextActive: {color: "#FFFFFF"},
  eventRow: {flexDirection: "row", minHeight: 95, alignItems: "center", gap: 8, padding: 9, borderRadius: 10, backgroundColor: "white", borderWidth: 1, borderColor: "#EDF0F3", marginBottom: 9},
  eventRowActive: {backgroundColor: "#EEFAF7", borderColor: GREEN},
  artwork: {width: 62, height: 71, borderRadius: 9, alignItems: "center", justifyContent: "center", overflow: "hidden"},
  artworkLarge: {width: 174, height: 207, borderRadius: 12},
  artworkImage: {width: "100%", height: "100%"},
  artworkMark: {width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center"},
  artworkMarkLarge: {width: 98, height: 98, borderRadius: 27},
  eventRowContent: {flex: 1, minWidth: 0},
  eventTitle: {fontSize: 12.5, lineHeight: 17, color: INK, fontWeight: "900", marginBottom: 5},
  miniMetaRow: {flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4},
  miniMeta: {fontSize: 10, color: MUTED, flexShrink: 1},
  eventRowEnd: {height: 68, alignItems: "flex-end", justifyContent: "space-between", maxWidth: 95},
  statusPill: {borderRadius: 7, backgroundColor: "#E5F5F0", alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 6},
  statusText: {color: GREEN, fontSize: 9, fontWeight: "900", letterSpacing: 0.2},
  statusActive: {backgroundColor: "#E9F0FF"},
  statusActiveText: {color: "#3668B9"},
  statusCompleted: {backgroundColor: "#F0E9FF"},
  statusCompletedText: {color: "#6745B8"},
  statusCancelled: {backgroundColor: "#FDEAE7"},
  statusCancelledText: {color: "#B44743"},
  eventPanelFooter: {flexDirection: "row", gap: 6, alignItems: "center", marginTop: 4, paddingTop: 9, borderTopWidth: 1, borderTopColor: "#EDF0F2"},
  mutedNote: {fontSize: 10, color: MUTED, flex: 1},
  loader: {paddingVertical: 25},
  emptyState: {padding: 30, minHeight: 130, gap: 6, alignItems: "center", justifyContent: "center"},
  emptyTitle: {fontSize: 13, fontWeight: "900", color: INK, textAlign: "center", marginTop: 3},
  emptySub: {fontSize: 11, color: MUTED, textAlign: "center", lineHeight: 17},
  heroRow: {flexDirection: "row", alignItems: "flex-start", gap: 15},
  heroRowPhone: {flexDirection: "column"},
  heroBody: {flex: 1, minWidth: 0},
  heroTitleRow: {flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 9},
  heroTitle: {fontSize: 21, fontWeight: "900", color: NAVY, flexShrink: 1, letterSpacing: -0.3},
  infoLine: {flexDirection: "row", alignItems: "flex-start", gap: 7, marginBottom: 8},
  infoText: {color: "#4D6782", fontSize: 11.5, lineHeight: 18, flex: 1},
  infoPanel: {flexDirection: "row", marginTop: 15, gap: 13, alignItems: "stretch"},
  infoPanelPhone: {flexDirection: "column"},
  descriptionBlock: {flex: 1, minWidth: 0, padding: 13, borderRadius: 11, backgroundColor: "#F6FAF9"},
  miniSectionTitle: {fontSize: 12.5, fontWeight: "900", color: NAVY, marginBottom: 6},
  descriptionText: {color: "#647A8A", fontSize: 11.5, lineHeight: 19},
  organizerCard: {backgroundColor: "#F8FAFD", borderWidth: 1, borderColor: "#EBF0F4", borderRadius: 11, alignItems: "center", justifyContent: "center", padding: 10, width: 144, gap: 4},
  organizerBadge: {width: 44, height: 44, borderRadius: 22, backgroundColor: "#DDE9F6", alignItems: "center", justifyContent: "center"},
  organizerInitials: {fontSize: 17, fontWeight: "900", color: NAVY},
  organizerName: {fontSize: 12, fontWeight: "900", textAlign: "center", color: NAVY},
  organizerCaption: {fontSize: 10, color: MUTED, textAlign: "center"},
  statsRow: {flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 16, marginBottom: 14},
  statsRowPhone: {gap: 7},
  stat: {flex: 1, minWidth: 127, borderWidth: 1, borderColor: "#E6ECEF", backgroundColor: "#FCFDFD", borderRadius: 11, padding: 11, flexDirection: "row", alignItems: "center", gap: 8},
  statPhone: {minWidth: "47%"},
  statIcon: {width: 43, height: 43, borderRadius: 22, alignItems: "center", justifyContent: "center"},
  statText: {flex: 1, minWidth: 0},
  statLabel: {fontSize: 10, color: MUTED, fontWeight: "700"},
  number: {fontSize: 22, fontWeight: "900", lineHeight: 28},
  primaryButton: {minHeight: 39, backgroundColor: GREEN, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7},
  wideButton: {width: "100%", minHeight: 44},
  primaryButtonText: {color: "#FFFFFF", fontSize: 12, fontWeight: "900"},
  disabled: {opacity: 0.5},
  outlineButton: {minHeight: 39, paddingHorizontal: 15, paddingVertical: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#A4CFC9", borderRadius: 9, alignItems: "center", justifyContent: "center"},
  outlineText: {fontSize: 12, color: GREEN, fontWeight: "900"},
  buttonRow: {flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, justifyContent: "flex-end", marginTop: 11},
  confirmBox: {padding: 13, backgroundColor: "#FFF7EA", borderWidth: 1, borderColor: "#F5DFC0", borderRadius: 9, marginTop: 7},
  confirmTop: {flexDirection: "row", gap: 7, alignItems: "flex-start"},
  confirmText: {color: "#875F2E", fontSize: 11.5, lineHeight: 17, flex: 1},
  confirmAction: {minWidth: 130},
  completedNote: {backgroundColor: "#E9F6F0", borderRadius: 9, padding: 12, flexDirection: "row", alignItems: "center", gap: 8},
  completedNoteText: {fontSize: 11, lineHeight: 17, color: "#16725E", flex: 1},
  attendancePanel: {marginTop: 14, padding: 17},
  attendanceTitleRow: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12},
  attendanceTitleRowPhone: {flexDirection: "column", alignItems: "stretch"},
  sectionSub: {fontSize: 10.5, color: MUTED, marginTop: 3},
  rosterControls: {flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8},
  rosterControlsPhone: {width: "100%", justifyContent: "flex-start"},
  rosterSearch: {marginTop: 0, width: 285, maxWidth: "100%"},
  rosterSearchPhone: {width: "100%"},
  sortButton: {minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 9, paddingHorizontal: 11, borderColor: "#B7DDD4", borderWidth: 1, backgroundColor: "#F3FAF7"},
  sortButtonText: {fontSize: 11, color: GREEN, fontWeight: "800"},
  attendanceFilterRow: {flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 13, marginBottom: 11},
  attendanceChip: {backgroundColor: "#F2F6F8", borderWidth: 1, borderColor: "#E5EDF0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7},
  attendanceChipActive: {backgroundColor: "#E6F6F2", borderColor: "#99D5CA"},
  attendanceChipText: {fontSize: 10.5, fontWeight: "800", color: "#5F7487"},
  attendanceChipTextActive: {color: GREEN},
  table: {minWidth: 1100, borderWidth: 1, borderColor: "#E6ECEF", borderRadius: 11, overflow: "hidden"},
  tableHeader: {minHeight: 43, backgroundColor: "#F0F5F8", flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 8},
  tableHeadText: {fontSize: 10.5, fontWeight: "900", color: "#425E78"},
  tableRow: {minHeight: 70, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: "#ECF0F2", backgroundColor: "#FFFFFF"},
  tableText: {fontSize: 11, color: "#526D84"},
  colNumber: {width: 21},
  colPerson: {width: 245},
  colRole: {width: 123},
  colTime: {width: 113},
  colHours: {width: 85},
  colStatus: {width: 134},
  colActions: {width: 195},
  personCell: {flexDirection: "row", gap: 8, alignItems: "center"},
  personAvatar: {width: 39, height: 39, borderRadius: 20, backgroundColor: "#E0EEF3", alignItems: "center", justifyContent: "center", overflow: "hidden"},
  personAvatarImage: {width: "100%", height: "100%"},
  personAvatarText: {fontSize: 12, fontWeight: "900", color: NAVY},
  personName: {color: INK, fontSize: 11, fontWeight: "900", lineHeight: 15},
  personSub: {fontSize: 10, color: MUTED, marginTop: 3},
  timeText: {fontSize: 11, fontWeight: "800", color: INK},
  timeSub: {fontSize: 9.5, color: MUTED, marginTop: 3},
  hoursText: {fontWeight: "900", color: NAVY},
  attendanceStatus: {alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 6, borderRadius: 7, backgroundColor: "#EFF3F6"},
  attendanceStatusText: {fontSize: 9, color: "#63768B", fontWeight: "900"},
  attendanceVerified: {backgroundColor: "#DDF5E9"},
  attendanceVerifiedText: {color: "#078367"},
  attendanceChecked: {backgroundColor: "#E2EDFF"},
  attendanceCheckedText: {color: "#356BC2"},
  attendancePending: {backgroundColor: "#FFF3DB"},
  attendancePendingText: {color: "#AD7121"},
  actionsCell: {flexDirection: "row", gap: 5, alignItems: "center"},
  profileOutlineButton: {minHeight: 33, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center", borderRadius: 7, borderWidth: 1, borderColor: "#9AD3CB", paddingHorizontal: 9, backgroundColor: "#FFFFFF"},
  profileOutlineText: {fontSize: 10, fontWeight: "900", color: GREEN},
  rowAction: {minHeight: 33, paddingHorizontal: 9, paddingVertical: 8},
  rowActionText: {fontSize: 10, color: "#FFFFFF", fontWeight: "900"},
  mobileRosterList: {gap: 11},
  mobileRosterCard: {padding: 13, borderWidth: 1, borderColor: "#E1ECEC", borderRadius: 12, backgroundColor: "#FFFFFF", gap: 13},
  mobileRosterHeading: {flexDirection: "row", alignItems: "flex-start", gap: 9, flexWrap: "wrap"},
  mobileRosterIdentity: {flex: 1, minWidth: 130, paddingTop: 2},
  mobileTimes: {flexDirection: "row", flexWrap: "wrap", gap: 7},
  mobileTimeBlock: {flexGrow: 1, flexBasis: 92, minWidth: 90, padding: 10, backgroundColor: "#F6F9FA", borderRadius: 9},
  mobileTimeLabel: {fontSize: 9, fontWeight: "900", color: "#71869A", marginBottom: 6},
  mobileDurationEligible: {fontSize: 9, marginTop: 4, fontWeight: "800", color: GREEN},
  mobileRosterActions: {flexDirection: "row", flexWrap: "wrap", gap: 8},
  mobileRosterButton: {flexGrow: 1},
  certificateReadinessRow: {marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 8},
  readinessChip: {flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F4F9F7", paddingVertical: 9, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: "#E0EEEA", flexGrow: 1},
  readinessText: {flexShrink: 1, fontSize: 10.5, color: "#486B64", lineHeight: 16, fontWeight: "700"},
  eligibilityNotice: {marginTop: 15, flexDirection: "row", gap: 11, padding: 12, backgroundColor: "#EAF4FF", borderRadius: 10, alignItems: "center"},
  eligibilityIcon: {width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#D7E9FF"},
  eligibilityText: {fontSize: 11, lineHeight: 17, color: "#355C88", flex: 1},
  errorBox: {backgroundColor: "#FFF0ED", borderRadius: 10, padding: 12, marginBottom: 13, flexDirection: "row", gap: 8, alignItems: "center"},
  errorText: {color: "#B42318", fontSize: 12, flex: 1},
  noticeBox: {backgroundColor: "#E8F7EF", borderRadius: 10, padding: 12, marginBottom: 13, flexDirection: "row", gap: 8, alignItems: "center"},
  noticeText: {color: "#087264", fontSize: 12, flex: 1},
  modalBackdrop: {flex: 1, backgroundColor: "#10283DA8", justifyContent: "center", alignItems: "center", padding: 20},
  modalCard: {width: "100%", maxWidth: 420, padding: 20, backgroundColor: "white", borderRadius: 17},
  modalHeader: {flexDirection: "row", alignItems: "center", justifyContent: "space-between"},
  modalTitle: {fontSize: 17, fontWeight: "900", color: NAVY},
  modalClose: {padding: 5},
  modalAvatar: {width: 74, height: 74, borderRadius: 37, backgroundColor: "#DCEFEF", alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 17, overflow: "hidden"},
  modalAvatarImage: {width: "100%", height: "100%"},
  modalAvatarText: {fontSize: 24, fontWeight: "900", color: GREEN},
  modalName: {fontSize: 19, fontWeight: "900", color: NAVY, textAlign: "center", marginTop: 10, marginBottom: 11},
  modalMeta: {fontSize: 12, color: MUTED, textAlign: "center", marginBottom: 5},
  modalError: {fontSize: 12, color: "#B42318", textAlign: "center", marginTop: 7},
  modalFootnote: {fontSize: 10, lineHeight: 15, color: "#8A9CA9", textAlign: "center", marginTop: 12},
  modalDone: {marginTop: 17},
});
