import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect } from "expo-router";
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
type ProposalStatus = "pending" | "approved" | "rejected";
type Filter = ProposalStatus | "all";
type Proposal = {
  id: string;
  title: string;
  description: string;
  category: string;
  barangay: string;
  location: string;
  date: string;
  time: string;
  capacity: number;
  proposedBy: string;
  proposerName?: string;
  status: ProposalStatus;
  adminNote?: string;
  createdAt?: unknown;
  coverPhotoUrl?: string;
  coverImageUrl?: string;
  imageUrl?: string;
  photoUrls?: string[];
  imageUrls?: string[];
  volunteerTasks?: string;
  lookingFor?: string;
  whatToBring?: string;
};

type PersonProfile = {
  uid: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  barangay?: string;
  profilePictureUrl?: string;
  identityVerified?: boolean;
  identityStatus?: string;
  volunteerAccess?: boolean;
  volunteerStatus?: string;
};

type Participation = {
  id: string;
  eventId: string;
  uid: string;
  fullName?: string;
  status: string;
  attendanceVerified?: boolean;
  checkedInAt?: unknown;
  checkedOutAt?: unknown;
};

function validImageUrl(value: unknown): string {
  return typeof value === "string" && /^https:\/\//i.test(value)
    ? value
    : "";
}

function eventPhotos(item: Proposal): string[] {
  const provided = [
    item.coverPhotoUrl,
    item.coverImageUrl,
    item.imageUrl,
    ...(Array.isArray(item.photoUrls) ? item.photoUrls : []),
    ...(Array.isArray(item.imageUrls) ? item.imageUrls : []),
  ];
  return [...new Set(provided.map(validImageUrl).filter(Boolean))].slice(0, 5);
}

function personName(person: PersonProfile | undefined, fallback: string): string {
  if (!person) return fallback;
  return String(person.fullName || [person.firstName, person.lastName].filter(Boolean).join(" ") || fallback);
}

function initials(value: string): string {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "?";
}

function attendanceLabel(item: Participation): string {
  if (item.attendanceVerified) return "Verified";
  if (item.checkedOutAt) return "Timed out";
  if (item.checkedInAt) return "Timed in";
  return "Joined";
}

const GREEN = "#078F82";
const INK = "#173247";
const MUTED = "#64798A";
function millis(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return Number(value.toMillis()) || 0;
  }
  return 0;
}
function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (
    text.includes("permission-denied") ||
    text.includes("insufficient permissions")
  ) {
    return "Permission denied. Community Events Firestore rules must be configured first.";
  }
  return text;
}
function formatSchedule(date: string, time: string): string {
  const parsed = new Date(`${date}T${time || "00:00"}:00`);
  if (Number.isNaN(parsed.getTime())) {
    return `${date} ${time}`;
  }
  return parsed.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
export default function CommunityEventAdminScreen() {
  const { loading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const authorized = Boolean(
    profile &&
    isApprovedProfile(profile) &&
    (
      profile.role === "admin" ||
      profile.role === "superadmin"
    )
  );
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [selectedPersonUid, setSelectedPersonUid] = useState<string | null>(null);
  const [people, setPeople] = useState<Record<string, PersonProfile>>({});
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [participants, setParticipants] = useState<Participation[]>([]);
  const [participantsBusy, setParticipantsBusy] = useState(false);
  const [participantsError, setParticipantsError] = useState("");
  // Listen to Resident proposals.
  useEffect(() => {
    if (!user || !authorized) {
      setFetching(false);
      return;
    }
    setFetching(true);
    return onSnapshot(
      collection(db, "communityEventProposals"),
      (snapshot) => {
        setProposals(
          snapshot.docs.map((item) => ({
            ...item.data(),
            id: item.id,
          } as Proposal))
        );
        setFetching(false);
        setLoadError("");
      },
      (error) => {
        setFetching(false);
        setLoadError(messageOf(error));
      }
    );
  }, [user?.uid, authorized]);
  const counts = useMemo(() => ({
    pending: proposals.filter(
      (item) => item.status === "pending"
    ).length,
    approved: proposals.filter(
      (item) => item.status === "approved"
    ).length,
    rejected: proposals.filter(
      (item) => item.status === "rejected"
    ).length,
  }), [proposals]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return proposals
      .filter((item) =>
        filter === "all" || item.status === filter
      )
      .filter((item) =>
        [
          item.title,
          item.category,
          item.barangay,
          item.location,
          item.proposerName,
        ].some((value) =>
          String(value || "").toLowerCase().includes(term)
        )
      )
      .sort(
        (a, b) =>
          millis(b.createdAt) - millis(a.createdAt)
      );
  }, [proposals, filter, search]);
  const selectedProposal = proposals.find((item) => item.id === selectedProposalId) || null;
  const selectedPerson = selectedPersonUid ? people[selectedPersonUid] : undefined;

  // Read only profiles needed for visible proposal cards, not the full user directory.
  useEffect(() => {
    if (!user || !authorized) return;
    const uids = [...new Set(visible.slice(0, 40).map((item) => item.proposedBy).filter(Boolean))]
      .filter((uid) => !(uid in people));
    if (!uids.length) return;
    let active = true;
    void Promise.all(uids.map(async (uid) => {
      try {
        const snapshot = await getDoc(doc(db, "users", uid));
        return { uid, ...(snapshot.exists() ? snapshot.data() : {}) } as PersonProfile;
      } catch {
        return { uid } as PersonProfile;
      }
    })).then((results) => {
      if (!active) return;
      setPeople((before) => {
        const next = { ...before };
        results.forEach((person) => { next[person.uid] = person; });
        return next;
      });
    });
    return () => { active = false; };
  }, [user?.uid, authorized, visible]);

  // Query only the selected published event's participants.
  useEffect(() => {
    if (!user || !authorized || !selectedProposal || selectedProposal.status !== "approved") {
      setParticipants([]);
      setParticipantsBusy(false);
      setParticipantsError("");
      return;
    }
    setParticipants([]);
    setParticipantsBusy(true);
    return onSnapshot(
      query(collection(db, "communityEventParticipants"), where("eventId", "==", selectedProposal.id)),
      (snapshot) => {
        setParticipants(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as Participation))
          .filter((entry) => entry.status === "joined"));
        setParticipantsBusy(false);
        setParticipantsError("");
      },
      (error) => {
        setParticipantsBusy(false);
        setParticipantsError(messageOf(error));
      }
    );
  }, [user?.uid, authorized, selectedProposal?.id, selectedProposal?.status]);

  // Show actual profile photos next to joined volunteers when available.
  useEffect(() => {
    if (!user || !authorized) return;
    const missing = [...new Set(participants.slice(0, 50).map((item) => item.uid).filter(Boolean))]
      .filter((uid) => !(uid in people));
    if (!missing.length) return;
    let active = true;
    void Promise.all(missing.map(async (uid) => {
      try {
        const snapshot = await getDoc(doc(db, "users", uid));
        return { uid, ...(snapshot.exists() ? snapshot.data() : {}) } as PersonProfile;
      } catch {
        return { uid } as PersonProfile;
      }
    })).then((results) => {
      if (!active) return;
      setPeople((before) => {
        const next = { ...before };
        results.forEach((person) => { next[person.uid] = person; });
        return next;
      });
    });
    return () => { active = false; };
  }, [user?.uid, authorized, participants]);

  const openProfile = async (uid: string) => {
    if (!uid) return;
    setSelectedPersonUid(uid);
    setProfileError("");
    if (people[uid]) return;
    setProfileBusy(true);
    try {
      const snapshot = await getDoc(doc(db, "users", uid));
      if (!snapshot.exists()) throw new Error("Account profile not found.");
      setPeople((before) => ({
        ...before,
        [uid]: { uid, ...snapshot.data() } as PersonProfile,
      }));
    } catch (error) {
      setProfileError(messageOf(error));
    } finally {
      setProfileBusy(false);
    }
  };

  const renderAvatar = (uid: string, fallback: string, size = 44) => {
    const person = people[uid];
    const url = validImageUrl(person?.profilePictureUrl);
    return url ? (
      <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#E5F6F1" }} />
    ) : (
      <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={styles.avatarInitials}>{initials(personName(person, fallback))}</Text>
      </View>
    );
  };

  // Admin approval and publishing are completed together.
  const approveAndPublish = async (item: Proposal) => {
    if (!user || !authorized || busyId) return;
    setNotice("");
    setActionError("");
    setBusyId(item.id);
    try {
      await runTransaction(db, async (tx) => {
        const proposalRef = doc(
          db,
          "communityEventProposals",
          item.id
        );
        const eventRef = doc(
          db,
          "communityEvents",
          item.id
        );
        const proposalSnap = await tx.get(proposalRef);
        const eventSnap = await tx.get(eventRef);
        if (
          !proposalSnap.exists() ||
          proposalSnap.data().status !== "pending"
        ) {
          throw new Error(
            "This proposal is no longer pending."
          );
        }
        if (eventSnap.exists()) {
          throw new Error(
            "This proposal already has a published event."
          );
        }
        const proposal = proposalSnap.data();
        const capacity = Number(proposal.capacity);
        if (
          !Number.isInteger(capacity) ||
          capacity < 1 ||
          capacity > 500
        ) {
          throw new Error(
            "Invalid volunteer capacity. Review the proposal first."
          );
        }
        if (
          !proposal.title ||
          !proposal.location ||
          !proposal.date ||
          !proposal.time ||
          !proposal.proposedBy
        ) {
          throw new Error(
            "Proposal is incomplete and cannot be published."
          );
        }
        const eventDate = new Date(
          `${proposal.date}T${proposal.time}:00`
        );
        if (
          Number.isNaN(eventDate.getTime()) ||
          eventDate.getTime() <= Date.now()
        ) {
          throw new Error(
            "The proposed event date has already passed."
          );
        }
        // Proposal ID is reused as Event ID to prevent duplicates.
        tx.set(eventRef, {
          title: proposal.title,
          description: proposal.description || "",
          category: proposal.category || "Other",
          barangay: proposal.barangay || "",
          location: proposal.location,
          date: proposal.date,
          time: proposal.time,
          capacity,
          participantsCount: 0,
          status: "upcoming",
          publicationStatus: "published",
          sourceProposalId: item.id,
          proposedBy: proposal.proposedBy,
          proposerName:
            proposal.proposerName || "Resident",
          approvedBy: user.uid,
          approvedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tx.update(proposalRef, {
          status: "approved",
          adminNote:
            "Approved and published as an official Community Event.",
          publishedEventId: item.id,
          reviewedBy: user.uid,
          reviewedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      setNotice(
        `Published successfully: ${item.title}`
      );
    } catch (error) {
      setActionError(messageOf(error));
    } finally {
      setBusyId("");
    }
  };
  // Reject with mandatory Admin reason.
  const rejectProposal = async (item: Proposal) => {
    if (!user || !authorized || busyId) return;
    if (rejectReason.trim().length < 5) {
      setActionError(
        "Provide a rejection reason of at least 5 characters."
      );
      return;
    }
    setBusyId(item.id);
    setNotice("");
    setActionError("");
    try {
      await runTransaction(db, async (tx) => {
        const proposalRef = doc(
          db,
          "communityEventProposals",
          item.id
        );
        const snapshot = await tx.get(proposalRef);
        if (
          !snapshot.exists() ||
          snapshot.data().status !== "pending"
        ) {
          throw new Error(
            "This proposal is no longer pending."
          );
        }
        tx.update(proposalRef, {
          status: "rejected",
          adminNote: rejectReason.trim(),
          reviewedBy: user.uid,
          reviewedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      setRejectId(null);
      setRejectReason("");
      setNotice(
        `Proposal rejected: ${item.title}`
      );
    } catch (error) {
      setActionError(messageOf(error));
    } finally {
      setBusyId("");
    }
  };
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GREEN} />
      </View>
    );
  }
  if (!user || !authorized) {
    return <Redirect href="/(tabs)" />;
  }
  return (
    <>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        compact && styles.compact,
      ]}
    >
      <View style={styles.heading}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>
            VOLUNSERVE • ADMIN/LGU
          </Text>
          <Text style={styles.title}>
            Community Event Proposals
          </Text>
          <Text style={styles.subtitle}>
            Review Resident suggestions and publish official events.
          </Text>
        </View>
        <View style={styles.headingIcon}>
          <Ionicons
            name="calendar-outline"
            color={GREEN}
            size={26}
          />
        </View>
      </View>
      <View style={styles.stats}>
        {([
          {
            label: "Pending Review",
            value: counts.pending,
            icon: "time-outline",
          },
          {
            label: "Published",
            value: counts.approved,
            icon: "checkmark-circle-outline",
          },
          {
            label: "Rejected",
            value: counts.rejected,
            icon: "close-circle-outline",
          },
        ] as const).map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Ionicons
              name={stat.icon}
              size={18}
              color={GREEN}
            />
            <Text style={styles.statNumber}>
              {stat.value}
            </Text>
            <Text style={styles.statLabel}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.toolbar}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search event, barangay, or Resident"
          placeholderTextColor="#93A4B1"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {([
            "pending",
            "approved",
            "rejected",
            "all",
          ] as Filter[]).map((item) => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[
                styles.chip,
                filter === item && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  filter === item &&
                    styles.chipTextActive,
                ]}
              >
                {item === "all"
                  ? "All"
                  : item[0].toUpperCase() +
                    item.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {!!notice && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {notice}
          </Text>
        </View>
      )}
      {!!actionError && (
        <View style={styles.error}>
          <Text style={styles.errorText}>
            {actionError}
          </Text>
        </View>
      )}
      {!!loadError && (
        <View style={styles.error}>
          <Text style={styles.errorText}>
            {loadError}
          </Text>
        </View>
      )}
      {fetching ? (
        <ActivityIndicator
          color={GREEN}
          style={{ marginTop: 28 }}
        />
      ) : !loadError && visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="calendar-clear-outline"
            size={30}
            color="#94A7AF"
          />
          <Text style={styles.emptyText}>
            No {filter === "all" ? "" : `${filter} `}
            proposals found.
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {visible.map((item) => (
            <View
              key={item.id}
              style={styles.card}
            >
              <View style={styles.cardTop}>
                {eventPhotos(item).length ? (
                  <Image source={{ uri: eventPhotos(item)[0] }} style={styles.cardCover} />
                ) : (
                  <View style={styles.cardIcon}>
                    <Ionicons name="image-outline" size={22} color={GREEN} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.category}>
                    {item.category ||
                      "Community Service"}
                  </Text>
                  <Text style={styles.cardTitle}>
                    {item.title}
                  </Text>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>
                    {String(
                      item.status || "pending"
                    ).toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.proposerLine}>
                  {renderAvatar(item.proposedBy, item.proposerName || "Resident", 30)}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.proposerLabel}>Proposed by</Text>
                    <Text style={styles.proposerName} numberOfLines={1}>
                      {personName(people[item.proposedBy], item.proposerName || "Resident")}
                    </Text>
                  </View>
                  <Pressable style={styles.inlineButton} onPress={() => void openProfile(item.proposedBy)}>
                    <Text style={styles.inlineButtonText}>View Profile</Text>
                  </Pressable>
                </View>
              <Text style={styles.meta}>
                <Ionicons
                  name="location-outline"
                  size={13}
                />{" "}
                {item.location}, {item.barangay}
              </Text>
              <Text style={styles.meta}>
                <Ionicons
                  name="calendar-outline"
                  size={13}
                />{" "}
                {formatSchedule(
                  item.date,
                  item.time
                )}
              </Text>
              <Text style={styles.meta}>
                <Ionicons
                  name="people-outline"
                  size={13}
                />{" "}
                {item.capacity || 0} volunteer slots
              </Text>
              <View style={styles.descriptionBox}>
                <Text style={styles.description}>
                  {item.description ||
                    "No description provided."}
                </Text>
              </View>
              {!!item.adminNote && (
                <Text style={styles.adminNote}>
                  Admin note: {item.adminNote}
                </Text>
              )}
                <Pressable style={styles.detailsButton} onPress={() => setSelectedProposalId(item.id)}>
                  <Ionicons name="eye-outline" size={16} color={GREEN} />
                  <Text style={styles.detailsButtonText}>View Event Details{item.status === "approved" ? " & Participants" : ""}</Text>
                  <Ionicons name="chevron-forward" size={15} color={GREEN} />
                </Pressable>
              {item.status === "pending" && (
                <>
                  {rejectId === item.id && (
                    <TextInput
                      value={rejectReason}
                      onChangeText={setRejectReason}
                      placeholder="Reason for rejection (required)"
                      placeholderTextColor="#93A4B1"
                      multiline
                      maxLength={500}
                      style={styles.reasonInput}
                    />
                  )}
                  <View style={styles.actions}>
                    {rejectId === item.id ? (
                      <>
                        <Pressable
                          disabled={!!busyId}
                          style={styles.outlineButton}
                          onPress={() => {
                            setRejectId(null);
                            setRejectReason("");
                          }}
                        >
                          <Text style={styles.outlineText}>
                            Cancel
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={!!busyId}
                          style={[
                            styles.rejectButton,
                            !!busyId && styles.disabled,
                          ]}
                          onPress={() =>
                            void rejectProposal(item)
                          }
                        >
                          <Text style={styles.buttonText}>
                            {busyId
                              ? "Saving..."
                              : "Confirm Rejection"}
                          </Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable
                          disabled={!!busyId}
                          style={styles.outlineButton}
                          onPress={() => {
                            setRejectId(item.id);
                            setRejectReason("");
                          }}
                        >
                          <Text style={styles.outlineText}>
                            Reject
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={!!busyId}
                          style={[
                            styles.approveButton,
                            !!busyId && styles.disabled,
                          ]}
                          onPress={() =>
                            void approveAndPublish(item)
                          }
                        >
                          <Text style={styles.buttonText}>
                            {busyId
                              ? "Processing..."
                              : "Approve & Publish"}
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </>
              )}
            </View>
          ))}
        </View>
      )}
      </ScrollView>

      {/* Admin review: actual photo URLs only, never generated placeholders. */}
      <Modal
        visible={selectedProposal !== null && selectedPersonUid === null}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedProposalId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.detailPanel, compact && styles.detailPanelCompact]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>COMMUNITY EVENT REVIEW</Text>
                <Text style={styles.modalTitle}>{selectedProposal?.title || "Event details"}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setSelectedProposalId(null)} accessibilityLabel="Close event details">
                <Ionicons name="close" size={22} color={INK} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
              {selectedProposal && (
                <>
                  {eventPhotos(selectedProposal).length > 0 ? (
                    <>
                      <Image source={{ uri: eventPhotos(selectedProposal)[0] }} style={styles.detailCover} resizeMode="cover" />
                      {eventPhotos(selectedProposal).length > 1 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
                          {eventPhotos(selectedProposal).slice(1).map((url) => (
                            <Image key={url} source={{ uri: url }} style={styles.smallPhoto} />
                          ))}
                        </ScrollView>
                      )}
                    </>
                  ) : (
                    <View style={styles.noPhoto}>
                      <Ionicons name="images-outline" size={27} color="#96A9A7" />
                      <Text style={styles.missingText}>No event photos submitted yet</Text>
                    </View>
                  )}
                  <View style={styles.detailPills}>
                    <Text style={styles.statusBadge}>{selectedProposal.status.toUpperCase()}</Text>
                    <Text style={styles.categoryBadge}>{selectedProposal.category}</Text>
                  </View>
                  <Text style={styles.detailMeta}><Ionicons name="calendar-outline" size={15} color={MUTED} />{"  "}{formatSchedule(selectedProposal.date, selectedProposal.time)}</Text>
                  <Text style={styles.detailMeta}><Ionicons name="location-outline" size={15} color={MUTED} />{"  "}{selectedProposal.location}, {selectedProposal.barangay}</Text>
                  <Text style={styles.detailMeta}><Ionicons name="people-outline" size={15} color={MUTED} />{"  "}{selectedProposal.capacity} volunteer slots</Text>

                  <Text style={styles.detailHeading}>Proposed by</Text>
                  <View style={styles.profileRow}>
                    {renderAvatar(selectedProposal.proposedBy, selectedProposal.proposerName || "Resident", 46)}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.profileRowName}>{personName(people[selectedProposal.proposedBy], selectedProposal.proposerName || "Resident")}</Text>
                      <Text style={styles.profileRowSub}>{people[selectedProposal.proposedBy]?.barangay || selectedProposal.barangay}</Text>
                    </View>
                    <Pressable style={styles.inlineButton} onPress={() => void openProfile(selectedProposal.proposedBy)}>
                      <Text style={styles.inlineButtonText}>View Profile</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.detailHeading}>About this event</Text>
                  <Text style={styles.bodyText}>{selectedProposal.description || "No event description provided."}</Text>
                  <Text style={styles.detailHeading}>Looking for volunteers to help with</Text>
                  <Text style={styles.bodyText}>{selectedProposal.lookingFor?.trim() || "Not provided yet."}</Text>
                  <Text style={styles.detailHeading}>What volunteers will do</Text>
                  <Text style={styles.bodyText}>{selectedProposal.volunteerTasks?.trim() || "Not provided yet."}</Text>
                  <Text style={styles.detailHeading}>What to bring</Text>
                  <Text style={styles.bodyText}>{selectedProposal.whatToBring?.trim() || "Not provided yet."}</Text>

                  {selectedProposal.status === "approved" && (
                    <>
                      <View style={styles.participantHeader}>
                        <Text style={styles.detailHeading}>Joined volunteers ({participants.length})</Text>
                        {participantsBusy && <ActivityIndicator size="small" color={GREEN} />}
                      </View>
                      {!!participantsError && <Text style={styles.errorText}>{participantsError}</Text>}
                      {!participantsBusy && !participantsError && participants.length === 0 && (
                        <Text style={styles.bodyText}>No joined volunteers yet.</Text>
                      )}
                      {participants.map((participant) => (
                        <View key={participant.id} style={styles.profileRow}>
                          {renderAvatar(participant.uid, participant.fullName || "Volunteer", 42)}
                          <View style={{ flex: 1 }}>
                            <Text style={styles.profileRowName}>{personName(people[participant.uid], participant.fullName || "Volunteer")}</Text>
                            <Text style={styles.profileRowSub}>{attendanceLabel(participant)}</Text>
                          </View>
                          <Pressable style={styles.inlineButton} onPress={() => void openProfile(participant.uid)}>
                            <Text style={styles.inlineButtonText}>View Profile</Text>
                          </Pressable>
                        </View>
                      ))}
                    </>
                  )}

                  {selectedProposal.adminNote ? (
                    <Text style={styles.adminNote}>Admin note: {selectedProposal.adminNote}</Text>
                  ) : null}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Admin-only profile preview: no sensitive identity document URLs. */}
      <Modal
        visible={selectedPersonUid !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedPersonUid(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.profilePanel}>
            <Pressable style={[styles.closeButton, { alignSelf: "flex-end" }]} onPress={() => setSelectedPersonUid(null)} accessibilityLabel="Close profile">
              <Ionicons name="close" size={22} color={INK} />
            </Pressable>
            {selectedPersonUid && (
              <>
                <View style={styles.profileCenter}>
                  {renderAvatar(selectedPersonUid, "Member", 86)}
                  <Text style={styles.profileBigName}>{personName(selectedPerson, "Member")}</Text>
                  <Text style={styles.profileRowSub}>{selectedPerson?.barangay || "Barangay not specified"}</Text>
                </View>
                {profileBusy && <ActivityIndicator color={GREEN} style={{ marginTop: 8 }} />}
                {!!profileError && <Text style={styles.errorText}>{profileError}</Text>}
                {!profileBusy && !profileError && selectedPerson && (
                  <>
                    <View style={styles.profileFact}><Text style={styles.profileFactLabel}>Resident identity</Text><Text style={styles.profileFactValue}>{selectedPerson.identityVerified || selectedPerson.identityStatus === "verified" ? "Verified" : "Not verified"}</Text></View>
                    <View style={styles.profileFact}><Text style={styles.profileFactLabel}>Volunteer status</Text><Text style={styles.profileFactValue}>{selectedPerson.volunteerAccess && selectedPerson.volunteerStatus === "approved" ? "Approved volunteer" : "Resident"}</Text></View>
                    <Text style={styles.profilePrivacy}>Only basic account information is shown here. Identity documents and private contact details are not displayed.</Text>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  cardCover: { width: 43, height: 43, borderRadius: 11, backgroundColor: "#E5F6F1" },
  avatarFallback: { backgroundColor: "#DCF3EC", alignItems: "center", justifyContent: "center" },
  avatarInitials: { color: GREEN, fontSize: 13, fontWeight: "900" },
  proposerLine: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10, marginTop: 2 },
  proposerLabel: { fontSize: 9, color: MUTED },
  proposerName: { fontSize: 12, fontWeight: "800", color: INK },
  inlineButton: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#C9DED7", borderRadius: 8 },
  inlineButtonText: { color: GREEN, fontWeight: "800", fontSize: 11 },
  detailsButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: "#CFE6DE", backgroundColor: "#F2FAF7", borderRadius: 9, minHeight: 38, marginTop: 12 },
  detailsButtonText: { fontSize: 12, color: GREEN, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(18,39,49,0.62)", alignItems: "center", justifyContent: "center", padding: 12 },
  detailPanel: { backgroundColor: "white", width: "100%", maxWidth: 680, maxHeight: "92%", borderRadius: 16, padding: 20 },
  detailPanelCompact: { padding: 13 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  modalTitle: { fontSize: 21, fontWeight: "900", color: INK },
  closeButton: { padding: 7, borderRadius: 9 },
  detailCover: { width: "100%", height: 218, borderRadius: 12, backgroundColor: "#E6EEEB" },
  photoStrip: { flexDirection: "row", gap: 8, paddingTop: 9 },
  smallPhoto: { width: 105, height: 76, borderRadius: 9, backgroundColor: "#E6EEEB" },
  noPhoto: { height: 140, backgroundColor: "#F3F8F6", borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 8 },
  missingText: { color: MUTED, fontSize: 12 },
  detailPills: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 12 },
  statusBadge: { paddingVertical: 6, paddingHorizontal: 10, color: "#08735E", backgroundColor: "#E5F6EE", overflow: "hidden", borderRadius: 7, fontSize: 10, fontWeight: "900" },
  categoryBadge: { color: GREEN, fontWeight: "800", fontSize: 11 },
  detailMeta: { color: MUTED, fontSize: 12, marginBottom: 6 },
  detailHeading: { color: INK, fontSize: 14, fontWeight: "900", marginTop: 19, marginBottom: 8 },
  bodyText: { color: "#435D69", fontSize: 12, lineHeight: 19 },
  profileRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#F7FAF9", borderColor: "#E1ECE8", borderWidth: 1, borderRadius: 11, padding: 10, gap: 10, marginBottom: 8 },
  profileRowName: { color: INK, fontWeight: "800", fontSize: 12 },
  profileRowSub: { color: MUTED, fontSize: 11, marginTop: 3 },
  participantHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  profilePanel: { width: "100%", maxWidth: 400, backgroundColor: "white", padding: 20, borderRadius: 16 },
  profileCenter: { alignItems: "center", gap: 7, marginTop: 4, marginBottom: 14 },
  profileBigName: { color: INK, fontSize: 19, fontWeight: "900", marginTop: 6 },
  profileFact: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderTopWidth: 1, borderTopColor: "#E5EFEB", paddingVertical: 13 },
  profileFactLabel: { color: MUTED, fontSize: 12 },
  profileFactValue: { color: INK, fontWeight: "800", fontSize: 12 },
  profilePrivacy: { color: MUTED, fontSize: 10, lineHeight: 16, marginTop: 11 },
  screen: {
    flex: 1,
    backgroundColor: "#F5F9F8",
  },
  content: {
    width: "100%",
    maxWidth: 1190,
    alignSelf: "center",
    padding: 22,
    paddingBottom: 36,
  },
  compact: {
    padding: 13,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 13,
  },
  eyebrow: {
    color: GREEN,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    fontSize: 23,
    fontWeight: "900",
    color: INK,
    marginTop: 3,
  },
  subtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 3,
  },
  headingIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5F7F1",
    borderRadius: 13,
  },
  stats: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 14,
  },
  stat: {
    flex: 1,
    padding: 12,
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E9E7",
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "900",
    color: INK,
    marginTop: 2,
  },
  statLabel: {
    fontSize: 10,
    color: MUTED,
    marginTop: 2,
  },
  toolbar: {
    marginBottom: 12,
  },
  search: {
    minHeight: 43,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#DFE8E6",
    backgroundColor: "white",
    paddingHorizontal: 12,
    fontSize: 12,
    color: INK,
  },
  filters: {
    gap: 7,
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 3,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#DCE8E4",
  },
  chipActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "800",
    color: MUTED,
  },
  chipTextActive: {
    color: "white",
  },
  notice: {
    backgroundColor: "#E7F6F1",
    padding: 12,
    borderRadius: 9,
    marginBottom: 10,
  },
  noticeText: {
    fontSize: 12,
    color: "#0C7566",
  },
  error: {
    backgroundColor: "#FFF0EC",
    padding: 12,
    borderRadius: 9,
    marginBottom: 10,
  },
  errorText: {
    fontSize: 12,
    color: "#B42318",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 12,
  },
  card: {
    flexGrow: 1,
    flexBasis: 320,
    maxWidth: 560,
    borderWidth: 1,
    borderColor: "#DEE8E6",
    backgroundColor: "white",
    borderRadius: 14,
    padding: 15,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 10,
  },
  cardIcon: {
    width: 43,
    height: 43,
    borderRadius: 11,
    backgroundColor: "#E5F6F1",
    justifyContent: "center",
    alignItems: "center",
  },
  category: {
    fontSize: 10,
    color: GREEN,
    fontWeight: "800",
  },
  cardTitle: {
    fontSize: 14,
    color: INK,
    fontWeight: "900",
    marginTop: 3,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#E3F6EB",
  },
  statusText: {
    color: "#08735E",
    fontSize: 9,
    fontWeight: "900",
  },
  meta: {
    fontSize: 11,
    color: MUTED,
    marginBottom: 5,
  },
  descriptionBox: {
    backgroundColor: "#F4F9F8",
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  description: {
    fontSize: 11.5,
    color: "#425D6A",
    lineHeight: 17,
  },
  adminNote: {
    fontSize: 11,
    color: "#64798A",
    marginTop: 8,
  },
  reasonInput: {
    minHeight: 66,
    borderWidth: 1,
    borderColor: "#E7CCC6",
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    fontSize: 12,
    textAlignVertical: "top",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  },
  outlineButton: {
    flexGrow: 1,
    minHeight: 38,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#C8DAD5",
  },
  outlineText: {
    fontSize: 12,
    color: "#496978",
    fontWeight: "800",
  },
  approveButton: {
    flexGrow: 1,
    minHeight: 38,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: GREEN,
    paddingHorizontal: 13,
    borderRadius: 9,
  },
  rejectButton: {
    flexGrow: 1,
    minHeight: 38,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#C83F40",
    paddingHorizontal: 13,
    borderRadius: 9,
  },
  buttonText: {
    fontSize: 12,
    color: "white",
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.55,
  },
  empty: {
    minHeight: 170,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#DEE8E6",
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    color: MUTED,
  },
});
