import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useRouter } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AssistanceLocationMap from "../../components/AssistanceLocationMap";
import { createAdminLog } from "../../lib/adminLogger";
import { db } from "../../lib/firebase";
import {
  isAdminProfile,
  isApprovedProfile,
} from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type AssistanceStatus =
  | "submitted"
  | "reviewed"
  | "approved"
  | "rejected"
  | "assigned"
  | "in_progress"
  | "delivered"
  | "closed";

type AssistanceType =
  | "food"
  | "water"
  | "medical"
  | "shelter"
  | "evacuation"
  | "transportation"
  | "other";

type Urgency = "normal" | "urgent" | "critical";

type RequestFilter =
  | "queue"
  | "submitted"
  | "reviewed"
  | "all";

type AssistanceRequest = {
  id: string;
  requestId: string;
  requesterUid: string;
  requesterName: string;
  requesterEmail: string;
  requesterBarangay: string;
  contactNumber: string;
  beneficiaryType: "self" | "someone_else";
  assistanceType: AssistanceType;
  urgency: Urgency;
  description: string;
  location: string;
  latitude: number;
  longitude: number;
  gpsAccuracyMeters: number;
  locationCapturedAt?: any;
  status: AssistanceStatus;
  linkedCaseId: string;
  assignedVolunteerId: string;
  assignedVolunteerName: string;
  adminNote: string;
  reviewedAt?: any;
  assignedAt?: any;
  deliveredAt?: any;
  closedAt?: any;
  createdAt?: any;
  updatedAt?: any;
};

const FILTERS: {
  value: RequestFilter;
  label: string;
}[] = [
  {
    value: "queue",
    label: "Review Queue",
  },
  {
    value: "submitted",
    label: "Submitted",
  },
  {
    value: "reviewed",
    label: "Reviewed",
  },
  {
    value: "all",
    label: "All Requests",
  },
];

const assistanceLabel = (value: AssistanceType) => {
  const labels: Record<AssistanceType, string> = {
    food: "Food",
    water: "Water",
    medical: "Medical",
    shelter: "Shelter",
    evacuation: "Evacuation",
    transportation: "Transportation",
    other: "Other",
  };

  return labels[value] || "Other";
};

const statusLabel = (value: AssistanceStatus) =>
  value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");

const formatDate = (value: any) => {
  const date = value?.toDate?.() || null;

  return date
    ? date.toLocaleString()
    : "Date pending";
};

const urgencyColor = (urgency: Urgency) => {
  if (urgency === "critical") {
    return "#DC2626";
  }

  if (urgency === "urgent") {
    return "#EA580C";
  }

  return "#0284C7";
};

const statusColor = (status: AssistanceStatus) => {
  if (status === "submitted") {
    return "#D97706";
  }

  if (status === "reviewed") {
    return "#2563EB";
  }

  if (status === "approved") {
    return "#059669";
  }

  if (status === "rejected") {
    return "#DC2626";
  }

  if (status === "assigned") {
    return "#7C3AED";
  }

  if (status === "in_progress") {
    return "#0891B2";
  }

  if (status === "delivered") {
    return "#16A34A";
  }

  return "#475569";
};

export default function AdminRequests() {
  const router = useRouter();

  const {
    loading: sessionLoading,
    user,
    profile,
  } = useUserSession();

  const [requests, setRequests] = useState<
    AssistanceRequest[]
  >([]);

  const [loadingRequests, setLoadingRequests] =
    useState(true);

  const [loadError, setLoadError] = useState("");

  const [filter, setFilter] =
    useState<RequestFilter>("queue");

  const [search, setSearch] = useState("");

  const [selectedRequest, setSelectedRequest] =
    useState<AssistanceRequest | null>(null);

  const [adminNote, setAdminNote] = useState("");

  const [processing, setProcessing] = useState(false);

  const isAuthorized = isAdminProfile(profile);

  React.useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    const requestsQuery = query(
      collection(db, "assistanceRequests"),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(
      requestsQuery,
      (snapshot) => {
        const nextRequests = snapshot.docs.map(
          (item) => ({
            id: item.id,
            ...(item.data() as Omit<
              AssistanceRequest,
              "id"
            >),
          })
        );

        setRequests(nextRequests);
        setLoadingRequests(false);
        setLoadError("");

        setSelectedRequest((current) => {
          if (!current) {
            return null;
          }

          return (
            nextRequests.find(
              (item) => item.id === current.id
            ) || null
          );
        });
      },
      (error) => {
        console.log(
          "assistance requests snapshot error:",
          error
        );

        setLoadingRequests(false);

        setLoadError(
          "Assistance requests could not be loaded. Check your connection and Firestore permissions."
        );
      }
    );
  }, [isAuthorized]);

  const metrics = useMemo(
    () => ({
      submitted: requests.filter(
        (item) => item.status === "submitted"
      ).length,

      reviewed: requests.filter(
        (item) => item.status === "reviewed"
      ).length,

      critical: requests.filter(
        (item) =>
          item.urgency === "critical" &&
          ![
            "rejected",
            "delivered",
            "closed",
          ].includes(item.status)
      ).length,
    }),
    [requests]
  );

  const visibleRequests = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    return requests.filter((item) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "queue" &&
          ["submitted", "reviewed"].includes(
            item.status
          )) ||
        item.status === filter;

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        item.requestId,
        item.requesterName,
        item.requesterEmail,
        item.requesterBarangay,
        item.contactNumber,
        item.location,
        item.assistanceType,
        item.urgency,
        item.status,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(normalizedSearch)
        );
    });
  }, [filter, requests, search]);

  const openRequest = (
    request: AssistanceRequest
  ) => {
    setSelectedRequest(request);
    setAdminNote(request.adminNote || "");
  };

  const closeRequest = () => {
    if (processing) {
      return;
    }

    setSelectedRequest(null);
    setAdminNote("");
  };

  const openGoogleMaps = async (
    request: AssistanceRequest
  ) => {
    if (
      !Number.isFinite(request.latitude) ||
      !Number.isFinite(request.longitude)
    ) {
      Alert.alert(
        "Location Unavailable",
        "This request does not contain valid GPS coordinates."
      );

      return;
    }

    const url =
      "https://www.google.com/maps/search/?api=1&query=" +
      `${request.latitude},${request.longitude}`;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "Map Error",
        "Google Maps could not be opened."
      );
    }
  };

  const applyStatus = async (
    nextStatus: "reviewed" | "approved" | "rejected"
  ) => {
    if (!selectedRequest || !user || !profile) {
      return;
    }

    if (
      nextStatus === "approved" &&
      selectedRequest.status !== "reviewed"
    ) {
      Alert.alert(
        "Review Required",
        "Mark the request as reviewed before approving it."
      );

      return;
    }

    if (
      nextStatus === "rejected" &&
      !adminNote.trim()
    ) {
      Alert.alert(
        "Reason Required",
        "Enter the reason for rejecting this request."
      );

      return;
    }

    try {
      setProcessing(true);

      const changes: Record<string, any> = {
        status: nextStatus,
        adminNote: adminNote.trim(),
        updatedAt: serverTimestamp(),
      };

      if (
        nextStatus === "reviewed" ||
        (nextStatus === "rejected" &&
          selectedRequest.status === "submitted")
      ) {
        changes.reviewedAt = serverTimestamp();
      }

      await updateDoc(
        doc(
          db,
          "assistanceRequests",
          selectedRequest.id
        ),
        changes
      );

      await createAdminLog({
        actionType: `assistance_request_${nextStatus}`,
        targetType: "assistanceRequest",
        targetId: selectedRequest.id,
        adminUid: user.uid,
        adminName:
          profile.fullName ||
          profile.email ||
          "Administrator",
        description: `${statusLabel(
          nextStatus
        )} assistance request ${
          selectedRequest.requestId ||
          selectedRequest.id
        } for ${selectedRequest.requesterName}.`,
      });

      setSelectedRequest((current) =>
        current
          ? {
              ...current,
              status: nextStatus,
              adminNote: adminNote.trim(),
            }
          : null
      );

      Alert.alert(
        "Request Updated",
        `The assistance request is now ${statusLabel(
          nextStatus
        ).toLowerCase()}.`
      );
    } catch (error: any) {
      console.log(
        "assistance request update error:",
        error
      );

      Alert.alert(
        "Update Failed",
        error?.message ||
          "The request could not be updated. Check your connection and permissions."
      );
    } finally {
      setProcessing(false);
    }
  };

  if (sessionLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#078F82"
        />

        <Text style={styles.centerText}>
          Checking administrator access...
        </Text>
      </View>
    );
  }

  if (
    !user ||
    !profile ||
    !isApprovedProfile(profile)
  ) {
    return <Redirect href="/login" />;
  }

  if (!isAuthorized) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top"]}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[
            "#064E3B",
            "#078F82",
            "#0F766E",
          ]}
          start={{
            x: 0,
            y: 0,
          }}
          end={{
            x: 1,
            y: 1,
          }}
          style={styles.hero}
        >
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>
              Assistance Requests
            </Text>

            <Text style={styles.heroSubtitle}>
              Review resident needs, verify GPS
              locations, and manage approval.
            </Text>
          </View>

          <View style={styles.heroIcon}>
            <Ionicons
              name="hand-left"
              size={27}
              color="#FFFFFF"
            />
          </View>
        </LinearGradient>

        <View style={styles.metricGrid}>
          <MetricCard
            icon="mail-unread-outline"
            label="Submitted"
            value={metrics.submitted}
            color="#D97706"
          />

          <MetricCard
            icon="eye-outline"
            label="Reviewed"
            value={metrics.reviewed}
            color="#2563EB"
          />

          <MetricCard
            icon="alert-circle-outline"
            label="Critical"
            value={metrics.critical}
            color="#DC2626"
          />
        </View>

        <View style={styles.searchBox}>
          <Ionicons
            name="search-outline"
            size={20}
            color="#64748B"
          />

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, barangay, type, or reference"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />

          {!!search && (
            <TouchableOpacity
              onPress={() => setSearch("")}
            >
              <Ionicons
                name="close-circle"
                size={20}
                color="#94A3B8"
              />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((item) => {
            const active = filter === item.value;

            return (
              <TouchableOpacity
                key={item.value}
                style={[
                  styles.filterChip,
                  active &&
                    styles.filterChipActive,
                ]}
                onPress={() =>
                  setFilter(item.value)
                }
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active &&
                      styles.filterChipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.listHeadingRow}>
          <Text style={styles.listHeading}>
            Requests
          </Text>

          <Text style={styles.resultCount}>
            {visibleRequests.length} result
            {visibleRequests.length === 1
              ? ""
              : "s"}
          </Text>
        </View>

        {!!loadError && (
          <View style={styles.errorBox}>
            <Ionicons
              name="warning-outline"
              size={20}
              color="#B45309"
            />

            <Text style={styles.errorText}>
              {loadError}
            </Text>
          </View>
        )}

        {loadingRequests ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator
              size="large"
              color="#078F82"
            />

            <Text style={styles.loadingText}>
              Loading assistance requests...
            </Text>
          </View>
        ) : visibleRequests.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="file-tray-outline"
                size={31}
                color="#078F82"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No matching requests
            </Text>

            <Text style={styles.emptySubtitle}>
              New resident assistance requests will
              appear here in real time.
            </Text>
          </View>
        ) : (
          visibleRequests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onPress={() =>
                openRequest(request)
              }
              onOpenMap={() =>
                openGoogleMaps(request)
              }
            />
          ))
        )}
      </ScrollView>

      <Modal
        visible={!!selectedRequest}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeRequest}
      >
        <SafeAreaView
          style={styles.modalSafeArea}
          edges={["top", "bottom"]}
        >
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={
              Platform.OS === "ios"
                ? "padding"
                : undefined
            }
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>
                  Request Details
                </Text>

                <Text
                  style={styles.modalReference}
                  numberOfLines={1}
                >
                  {selectedRequest?.requestId ||
                    selectedRequest?.id}
                </Text>
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close request details"
                style={styles.closeButton}
                onPress={closeRequest}
                disabled={processing}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color="#0F172A"
                />
              </TouchableOpacity>
            </View>

            {selectedRequest && (
              <ScrollView
                contentContainerStyle={
                  styles.modalContent
                }
                showsVerticalScrollIndicator={
                  false
                }
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.modalBadgeRow}>
                  <StatusBadge
                    status={
                      selectedRequest.status
                    }
                  />

                  <UrgencyBadge
                    urgency={
                      selectedRequest.urgency
                    }
                  />
                </View>

                <View style={styles.detailsCard}>
                  <DetailRow
                    icon="person-outline"
                    label="Resident"
                    value={
                      selectedRequest.requesterName
                    }
                  />

                  <DetailRow
                    icon="mail-outline"
                    label="Email"
                    value={
                      selectedRequest.requesterEmail ||
                      "Not provided"
                    }
                  />

                  <DetailRow
                    icon="call-outline"
                    label="Contact"
                    value={
                      selectedRequest.contactNumber
                    }
                  />

                  <DetailRow
                    icon="business-outline"
                    label="Barangay"
                    value={
                      selectedRequest.requesterBarangay ||
                      "Not provided"
                    }
                  />

                  <DetailRow
                    icon="people-outline"
                    label="Beneficiary"
                    value={
                      selectedRequest.beneficiaryType ===
                      "self"
                        ? "Requester"
                        : "Someone else"
                    }
                  />

                  <DetailRow
                    icon="medkit-outline"
                    label="Assistance Needed"
                    value={assistanceLabel(
                      selectedRequest.assistanceType
                    )}
                  />

                  <DetailRow
                    icon="time-outline"
                    label="Submitted"
                    value={formatDate(
                      selectedRequest.createdAt
                    )}
                    last
                  />
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>
                    Situation Description
                  </Text>

                  <Text
                    style={styles.descriptionText}
                  >
                    {selectedRequest.description}
                  </Text>
                </View>

                <View style={styles.sectionCard}>
                  <View
                    style={styles.sectionHeaderRow}
                  >
                    <View
                      style={
                        styles.sectionHeaderCopy
                      }
                    >
                      <Text
                        style={styles.sectionTitle}
                      >
                        Assistance Location
                      </Text>

                      <Text
                        style={styles.locationText}
                      >
                        {selectedRequest.location}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.mapButton}
                      onPress={() =>
                        openGoogleMaps(
                          selectedRequest
                        )
                      }
                    >
                      <Ionicons
                        name="navigate"
                        size={17}
                        color="#FFFFFF"
                      />

                      <Text
                        style={
                          styles.mapButtonText
                        }
                      >
                        Google Maps
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {Number.isFinite(
                    selectedRequest.latitude
                  ) &&
                  Number.isFinite(
                    selectedRequest.longitude
                  ) ? (
                    <AssistanceLocationMap
                      latitude={
                        selectedRequest.latitude
                      }
                      longitude={
                        selectedRequest.longitude
                      }
                      title={
                        selectedRequest.requesterName
                      }
                    />
                  ) : (
                    <View
                      style={styles.noLocationBox}
                    >
                      <Ionicons
                        name="location-outline"
                        size={26}
                        color="#94A3B8"
                      />

                      <Text
                        style={
                          styles.noLocationText
                        }
                      >
                        Valid GPS coordinates are
                        unavailable.
                      </Text>
                    </View>
                  )}

                  <Text
                    style={styles.accuracyText}
                  >
                    GPS accuracy: approximately{" "}
                    {Math.round(
                      selectedRequest.gpsAccuracyMeters ||
                        0
                    )}{" "}
                    meters
                  </Text>
                </View>

                {[
                  "submitted",
                  "reviewed",
                ].includes(
                  selectedRequest.status
                ) && (
                  <View
                    style={styles.sectionCard}
                  >
                    <Text
                      style={styles.sectionTitle}
                    >
                      Administrator Note
                    </Text>

                    <Text
                      style={styles.noteHelp}
                    >
                      A rejection reason is required.
                      A review note is optional.
                    </Text>

                    <TextInput
                      value={adminNote}
                      onChangeText={setAdminNote}
                      placeholder="Enter review notes or rejection reason"
                      placeholderTextColor="#94A3B8"
                      multiline
                      maxLength={500}
                      textAlignVertical="top"
                      style={styles.noteInput}
                      editable={!processing}
                    />

                    <Text
                      style={
                        styles.characterCount
                      }
                    >
                      {adminNote.length}/500
                    </Text>
                  </View>
                )}

                {selectedRequest.status ===
                  "submitted" && (
                  <View style={styles.actionRow}>
                    <ActionButton
                      icon="close-circle-outline"
                      label="Reject"
                      color="#DC2626"
                      disabled={processing}
                      onPress={() =>
                        applyStatus("rejected")
                      }
                    />

                    <ActionButton
                      icon="eye-outline"
                      label="Mark Reviewed"
                      color="#2563EB"
                      disabled={processing}
                      loading={processing}
                      onPress={() =>
                        applyStatus("reviewed")
                      }
                    />
                  </View>
                )}

                {selectedRequest.status ===
                  "reviewed" && (
                  <View style={styles.actionRow}>
                    <ActionButton
                      icon="close-circle-outline"
                      label="Reject"
                      color="#DC2626"
                      disabled={processing}
                      onPress={() =>
                        applyStatus("rejected")
                      }
                    />

                    <ActionButton
                      icon="checkmark-circle-outline"
                      label="Approve"
                      color="#059669"
                      disabled={processing}
                      loading={processing}
                      onPress={() =>
                        applyStatus("approved")
                      }
                    />
                  </View>
                )}

                {![
                  "submitted",
                  "reviewed",
                ].includes(
                  selectedRequest.status
                ) && (
                  <View
                    style={
                      styles.completedNotice
                    }
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={21}
                      color="#0369A1"
                    />

                    <Text
                      style={
                        styles.completedNoticeText
                      }
                    >
                      This request is already{" "}
                      {statusLabel(
                        selectedRequest.status
                      ).toLowerCase()}
                      .
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View
        style={[
          styles.metricIcon,
          {
            backgroundColor: `${color}16`,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={color}
        />
      </View>

      <Text style={styles.metricValue}>
        {value}
      </Text>

      <Text style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

function RequestCard({
  request,
  onPress,
  onOpenMap,
}: {
  request: AssistanceRequest;
  onPress: () => void;
  onOpenMap: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.requestCard}
      onPress={onPress}
    >
      <View
        style={[
          styles.urgencyStripe,
          {
            backgroundColor: urgencyColor(
              request.urgency
            ),
          },
        ]}
      />

      <View style={styles.requestContent}>
        <View style={styles.requestTopRow}>
          <View style={styles.requestTitleCopy}>
            <Text
              style={styles.requestName}
              numberOfLines={1}
            >
              {request.requesterName ||
                "Resident"}
            </Text>

            <Text
              style={styles.requestReference}
              numberOfLines={1}
            >
              {request.requestId || request.id}
            </Text>
          </View>

          <StatusBadge status={request.status} />
        </View>

        <View style={styles.requestTypeRow}>
          <View
            style={[
              styles.typeIcon,
              {
                backgroundColor: `${urgencyColor(
                  request.urgency
                )}14`,
              },
            ]}
          >
            <Ionicons
              name="medkit-outline"
              size={18}
              color={urgencyColor(
                request.urgency
              )}
            />
          </View>

          <View style={styles.requestTypeCopy}>
            <Text style={styles.requestType}>
              {assistanceLabel(
                request.assistanceType
              )}{" "}
              Assistance
            </Text>

            <Text
              style={[
                styles.requestUrgency,
                {
                  color: urgencyColor(
                    request.urgency
                  ),
                },
              ]}
            >
              {request.urgency.toUpperCase()}{" "}
              PRIORITY
            </Text>
          </View>
        </View>

        <View style={styles.requestMetaRow}>
          <Ionicons
            name="location-outline"
            size={16}
            color="#64748B"
          />

          <Text
            style={styles.requestMetaText}
            numberOfLines={2}
          >
            {request.location}
          </Text>
        </View>

        <View style={styles.requestMetaRow}>
          <Ionicons
            name="time-outline"
            size={16}
            color="#64748B"
          />

          <Text style={styles.requestMetaText}>
            {formatDate(request.createdAt)}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={styles.cardMapButton}
            onPress={(event) => {
              event.stopPropagation();
              onOpenMap();
            }}
          >
            <Ionicons
              name="map-outline"
              size={17}
              color="#078F82"
            />

            <Text
              style={styles.cardMapButtonText}
            >
              View Map
            </Text>
          </TouchableOpacity>

          <View style={styles.detailsLink}>
            <Text
              style={styles.detailsLinkText}
            >
              View Details
            </Text>

            <Ionicons
              name="chevron-forward"
              size={17}
              color="#078F82"
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function StatusBadge({
  status,
}: {
  status: AssistanceStatus;
}) {
  const color = statusColor(status);

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: `${color}14`,
        },
      ]}
    >
      <View
        style={[
          styles.badgeDot,
          {
            backgroundColor: color,
          },
        ]}
      />

      <Text
        style={[
          styles.badgeText,
          {
            color,
          },
        ]}
      >
        {statusLabel(status)}
      </Text>
    </View>
  );
}

function UrgencyBadge({
  urgency,
}: {
  urgency: Urgency;
}) {
  const color = urgencyColor(urgency);

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: `${color}14`,
        },
      ]}
    >
      <Ionicons
        name="alert-circle"
        size={13}
        color={color}
      />

      <Text
        style={[
          styles.badgeText,
          {
            color,
          },
        ]}
      >
        Priority: {urgency}
      </Text>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.detailRow,
        last && styles.detailRowLast,
      ]}
    >
      <View style={styles.detailIcon}>
        <Ionicons
          name={icon}
          size={18}
          color="#078F82"
        />
      </View>

      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>
          {label}
        </Text>

        <Text style={styles.detailValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
  disabled,
  loading = false,
}: {
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  label: string;
  color: string;
  onPress: () => void;
  disabled: boolean;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        {
          backgroundColor: color,
        },
        disabled && styles.actionButtonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color="#FFFFFF"
        />
      ) : (
        <Ionicons
          name={icon}
          size={19}
          color="#FFFFFF"
        />
      )}

      <Text style={styles.actionButtonText}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    backgroundColor: "#F3F7FA",
  },

  container: {
    padding: 18,
    paddingBottom: 50,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F7FA",
    padding: 24,
  },

  centerText: {
    color: "#64748B",
    fontWeight: "700",
    marginTop: 10,
  },

  hero: {
    minHeight: 126,
    borderRadius: 22,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(255,255,255,0.16)",
    marginRight: 12,
  },

  heroCopy: {
    flex: 1,
  },

  heroTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "900",
  },

  heroSubtitle: {
    color: "#D1FAE5",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },

  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(255,255,255,0.16)",
    marginLeft: 10,
  },

  metricGrid: {
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
    marginBottom: 14,
  },

  metricCard: {
    flex: 1,
    minHeight: 102,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },

  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  metricValue: {
    color: "#0F172A",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 8,
  },

  metricLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },

  searchBox: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE5EC",
    paddingHorizontal: 14,
  },

  searchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 13,
  },

  filterRow: {
    gap: 8,
    paddingVertical: 12,
  },

  filterChip: {
    minHeight: 38,
    paddingHorizontal: 15,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE5EC",
    alignItems: "center",
    justifyContent: "center",
  },

  filterChipActive: {
    backgroundColor: "#078F82",
    borderColor: "#078F82",
  },

  filterChipText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },

  filterChipTextActive: {
    color: "#FFFFFF",
  },

  listHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  listHeading: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
  },

  resultCount: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginBottom: 12,
  },

  errorText: {
    flex: 1,
    color: "#92400E",
    fontSize: 12,
    lineHeight: 17,
  },

  loadingCard: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  loadingText: {
    color: "#64748B",
    fontWeight: "700",
    marginTop: 10,
  },

  emptyCard: {
    minHeight: 230,
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#E5F8F3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },

  emptyTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
  },

  emptySubtitle: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
  },

  requestCard: {
    flexDirection: "row",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },

  urgencyStripe: {
    width: 5,
  },

  requestContent: {
    flex: 1,
    padding: 14,
  },

  requestTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  requestTitleCopy: {
    flex: 1,
  },

  requestName: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },

  requestReference: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 3,
  },

  requestTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13,
  },

  typeIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  requestTypeCopy: {
    flex: 1,
  },

  requestType: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "800",
  },

  requestUrgency: {
    fontSize: 9,
    fontWeight: "900",
    marginTop: 3,
  },

  requestMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 9,
  },

  requestMetaText: {
    flex: 1,
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
  },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
    marginTop: 13,
    paddingTop: 11,
  },

  cardMapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },

  cardMapButtonText: {
    color: "#078F82",
    fontSize: 11,
    fontWeight: "800",
  },

  detailsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  detailsLinkText: {
    color: "#078F82",
    fontSize: 11,
    fontWeight: "900",
  },

  badge: {
    minHeight: 27,
    borderRadius: 14,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  badgeText: {
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  modalSafeArea: {
    flex: 1,
    backgroundColor: "#F3F7FA",
  },

  modalHeader: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },

  modalHeaderCopy: {
    flex: 1,
  },

  modalTitle: {
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "900",
  },

  modalReference: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 3,
  },

  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },

  modalContent: {
    padding: 18,
    paddingBottom: 50,
  },

  modalBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },

  detailsCard: {
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },

  detailRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
  },

  detailRowLast: {
    borderBottomWidth: 0,
  },

  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5F8F3",
    marginRight: 11,
  },

  detailCopy: {
    flex: 1,
  },

  detailLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "800",
  },

  detailValue: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },

  sectionCard: {
    padding: 15,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },

  descriptionText: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },

  sectionHeaderCopy: {
    flex: 1,
  },

  locationText: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  mapButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: "#078F82",
  },

  mapButtonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  noLocationBox: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
  },

  noLocationText: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 7,
  },

  accuracyText: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 9,
  },

  noteHelp: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },

  noteInput: {
    minHeight: 105,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 13,
    backgroundColor: "#F8FAFC",
    color: "#0F172A",
    fontSize: 13,
    lineHeight: 19,
    padding: 12,
    marginTop: 11,
  },

  characterCount: {
    color: "#94A3B8",
    fontSize: 10,
    textAlign: "right",
    marginTop: 6,
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },

  actionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  actionButtonDisabled: {
    opacity: 0.58,
  },

  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  completedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },

  completedNoticeText: {
    flex: 1,
    color: "#075985",
    fontSize: 12,
    fontWeight: "700",
  },
});