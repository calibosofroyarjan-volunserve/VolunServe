import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
    collection,
    onSnapshot,
    orderBy,
    query,
    Timestamp,
    where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { db } from "../../lib/firebase";
import { usePublicSettings } from "../../lib/usePublicSettings";
import { useUserSession } from "../../lib/useUserSession";

type Announcement = {
  id: string;
  title?: string;
  message?: string;
  audience?: string;
  priority?: "normal" | "urgent";
  publishAt?: any;
};

type CaseItem = {
  id: string;
  title?: string;
  category?: string;
  location?: string;
  severity?: string;
  status?: string;
  createdAt?: any;
};

type VolunteerEvent = {
  id: string;
  status?: string;
  createdAt?: any;
};

type NotificationItem = {
  id: string;
  read?: boolean;
};

type ServiceCardData = {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  colors: [string, string];
  iconBackground: string;
  foreground: string;
};

const serviceCards: ServiceCardData[] = [
  {
    title: "Emergency Report",
    description: "Report hazards and emergencies in your area.",
    icon: "warning",
    href: "/disaster-response",
    colors: ["#FFF4F5", "#FFE4E8"],
    iconBackground: "#EF3340",
    foreground: "#B91C2A",
  },
  {
    title: "Request Assistance",
    description: "Ask for support for you or someone in need.",
    icon: "people",
    href: "/resident",
    colors: ["#FFF9ED", "#FFE9C7"],
    iconBackground: "#F28C13",
    foreground: "#A85A05",
  },
  {
    title: "Live Operations Map",
    description: "View incidents and response zones in real time.",
    icon: "location",
    href: "/map-tracking",
    colors: ["#F0FDFA", "#D5F7EF"],
    iconBackground: "#079A78",
    foreground: "#076E60",
  },
  {
    title: "Volunteer Tasks",
    description: "Find events and join ongoing community missions.",
    icon: "people-circle",
    href: "/volunteer",
    colors: ["#EFF7FF", "#DCEEFF"],
    iconBackground: "#1677E8",
    foreground: "#145EBA",
  },
];

const progressSteps = [
  { key: "reported", label: "Submitted" },
  { key: "validated", label: "Validated" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
];

const toMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const formatDate = (value: any) => {
  const milliseconds = toMillis(value);
  if (!milliseconds) return "Recently submitted";
  return new Date(milliseconds).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatStatus = (value?: string) =>
  String(value || "reported")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const getProgressIndex = (status?: string) => {
  if (status === "closed") return progressSteps.length - 1;
  const index = progressSteps.findIndex((step) => step.key === status);
  return index < 0 ? 0 : index;
};

export default function WebHome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, profile } = useUserSession();
  const { settings } = usePublicSettings();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [events, setEvents] = useState<VolunteerEvent[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isNarrow = width < 860;
  const isCompact = width < 1260;
  const composedName = [
    profile?.firstName,
    profile?.middleName,
    profile?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayName =
    composedName ||
    profile?.fullName?.trim() ||
    user?.displayName?.trim() ||
    profile?.email?.split("@")[0] ||
    user?.email?.split("@")[0] ||
    "VolunServe Member";
  const firstName = profile?.firstName?.trim() || displayName.split(" ")[0];
  const profileRole =
    profile?.role === "volunteer" ? "Volunteer" : "Community Member";
  const profileInitial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    const announcementsQuery = query(
      collection(db, "announcements"),
      where("publishAt", "<=", Timestamp.now()),
      orderBy("publishAt", "desc")
    );

    return onSnapshot(
      announcementsQuery,
      (snapshot) => {
        const nextAnnouncements = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<Announcement, "id">),
          }))
          .filter(
            (item) =>
              !item.audience ||
              item.audience === "all" ||
              item.audience === profile?.role
          );
        setAnnouncements(nextAnnouncements);
      },
      () => setAnnouncements([])
    );
  }, [profile?.role]);

  useEffect(() => {
    if (!user) {
      setCases([]);
      setNotifications([]);
      setLoading(false);
      return;
    }

    let pendingLoads = 2;
    const markLoaded = () => {
      pendingLoads -= 1;
      if (pendingLoads <= 0) setLoading(false);
    };

    const casesQuery = query(
      collection(db, "disasterCases"),
      where("reporterUid", "==", user.uid)
    );
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid)
    );

    const unsubscribeCases = onSnapshot(
      casesQuery,
      (snapshot) => {
        const nextCases = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<CaseItem, "id">),
          }))
          .sort(
            (left, right) =>
              toMillis(right.createdAt) - toMillis(left.createdAt)
          );
        setCases(nextCases);
        markLoaded();
      },
      () => {
        setCases([]);
        markLoaded();
      }
    );

    const unsubscribeNotifications = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        setNotifications(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<NotificationItem, "id">),
          }))
        );
        markLoaded();
      },
      () => {
        setNotifications([]);
        markLoaded();
      }
    );

    return () => {
      unsubscribeCases();
      unsubscribeNotifications();
    };
  }, [user]);

  useEffect(
    () =>
      onSnapshot(
        collection(db, "volunteerEvents"),
        (snapshot) => {
          const nextEvents = snapshot.docs
            .map((item) => ({
              id: item.id,
              ...(item.data() as Omit<VolunteerEvent, "id">),
            }))
            .filter((item) => item.status !== "completed")
            .sort(
              (left, right) =>
                toMillis(right.createdAt) - toMillis(left.createdAt)
            );
          setEvents(nextEvents);
        },
        () => setEvents([])
      ),
    []
  );

  const latestCase = cases[0];
  const activeCases = useMemo(
    () =>
      cases.filter(
        (item) =>
          !["resolved", "closed"].includes(item.status || "reported")
      ),
    [cases]
  );
  const pendingCases = useMemo(
    () =>
      cases.filter((item) =>
        ["reported", "validated"].includes(item.status || "reported")
      ),
    [cases]
  );
  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.page}>
          <View style={[styles.topBar, isNarrow && styles.topBarNarrow]}>
            <View style={styles.topBarCopy}>
              <Text style={styles.eyebrow}>RESIDENT OPERATIONS CENTER</Text>
              <Text style={styles.pageTitle}>Good day, {firstName}</Text>
              <Text style={styles.pageSubtitle}>
                Here is the latest safety and community response activity.
              </Text>
            </View>

            <View style={styles.topActions}>
              {!isNarrow ? (
                <View style={styles.operationalPill}>
                  <View style={styles.operationalDot} />
                  <Text style={styles.operationalText}>System operational</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open notifications"
                style={({ pressed }) => [
                  styles.notificationButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => router.push("/notifications")}
              >
                <Ionicons
                  name="notifications-outline"
                  size={23}
                  color="#183153"
                />
                {unreadCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                style={({ pressed }) => [
                  styles.headerProfile,
                  pressed && styles.pressed,
                ]}
                onPress={() => router.push("/profile")}
              >
                {profile?.profilePictureUrl ? (
                  <Image
                    source={{ uri: profile.profilePictureUrl }}
                    resizeMode="cover"
                    style={styles.headerAvatarImage}
                  />
                ) : (
                  <View style={styles.headerAvatarFallback}>
                    <Text style={styles.headerAvatarText}>{profileInitial}</Text>
                  </View>
                )}
                <View style={styles.headerProfileCopy}>
                  <Text style={styles.headerProfileName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={styles.headerProfileRole}>{profileRole}</Text>
                </View>
                <Ionicons name="chevron-down" size={16} color="#60728A" />
              </Pressable>
            </View>
          </View>

          <View style={[styles.heroRow, isCompact && styles.stack]}>
            <LinearGradient
              colors={["#046E71", "#058C88", "#0BAA8E"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={[styles.heroCopy, isNarrow && styles.heroCopyNarrow]}>
                <View style={styles.heroLabel}>
                  <Ionicons
                    name="shield-checkmark"
                    size={16}
                    color="#CFFCF0"
                  />
                  <Text style={styles.heroLabelText}>{settings.cityName}</Text>
                </View>
                <Text style={styles.heroTitle}>
                  Together for a Safer Community
                </Text>
                <Text style={styles.heroText}>
                  Report incidents, request help, follow response updates, and
                  support your community—all in one place.
                </Text>
                <View style={styles.heroButtons}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryHeroButton,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => router.push("/disaster-response")}
                  >
                    <Ionicons name="warning" size={18} color="#C51F31" />
                    <Text style={styles.primaryHeroButtonText}>
                      Report Emergency
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryHeroButton,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => router.push("/map-tracking")}
                  >
                    <Ionicons name="map-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.secondaryHeroButtonText}>
                      Open Live Map
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Image
                source={require("../../assets/images/volunserve_family_ph_flag.png")}
                resizeMode="contain"
                style={[styles.heroImage, isNarrow && styles.heroImageNarrow]}
              />
              <View pointerEvents="none" style={styles.heroGlow} />
            </LinearGradient>

            <View
              style={[styles.emergencyCard, isCompact && styles.fullWidth]}
            >
              <View style={styles.emergencyIcon}>
                <Ionicons name="call" size={23} color="#FFFFFF" />
              </View>
              <Text style={styles.emergencyLabel}>
                OFFICIAL EMERGENCY CONTACT
              </Text>
              <Text style={styles.emergencyTitle}>
                {settings.emergencyHotline}
              </Text>
              <Text style={styles.emergencyText}>
                For life-threatening emergencies, contact your local response
                office immediately.
              </Text>
              <View style={styles.noticeRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={17}
                  color="#9F1239"
                />
                <Text style={styles.noticeText}>
                  {settings.publicServiceNotice}
                </Text>
              </View>
            </View>
          </View>

          <SectionHeader
            title="Main Services"
            subtitle="Choose the service you need"
          />

          <View style={[styles.serviceGrid, isNarrow && styles.stack]}>
            {serviceCards.map((service) => (
              <Pressable
                key={service.title}
                style={({ pressed }) => [
                  styles.serviceCard,
                  isNarrow && styles.fullWidth,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => router.push(service.href as any)}
              >
                <LinearGradient
                  colors={service.colors}
                  style={styles.serviceGradient}
                >
                  <View
                    style={[
                      styles.serviceIcon,
                      { backgroundColor: service.iconBackground },
                    ]}
                  >
                    <Ionicons name={service.icon} size={27} color="#FFFFFF" />
                  </View>
                  <View style={styles.serviceCopy}>
                    <Text
                      style={[
                        styles.serviceTitle,
                        { color: service.foreground },
                      ]}
                    >
                      {service.title}
                    </Text>
                    <Text style={styles.serviceDescription}>
                      {service.description}
                    </Text>
                  </View>
                  <View style={styles.arrowCircle}>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color={service.foreground}
                    />
                  </View>
                </LinearGradient>
              </Pressable>
            ))}
          </View>

          <View style={styles.statsGrid}>
            <StatCard
              label="Active Reports"
              value={activeCases.length}
              icon="alert-circle-outline"
              background="#FFF1F2"
              color="#D72D3F"
              isNarrow={isNarrow}
            />
            <StatCard
              label="Awaiting Review"
              value={pendingCases.length}
              icon="time-outline"
              background="#FFF7E7"
              color="#C76A08"
              isNarrow={isNarrow}
            />
            <StatCard
              label="Available Missions"
              value={events.length}
              icon="calendar-outline"
              background="#EAF8F3"
              color="#078F6F"
              isNarrow={isNarrow}
            />
            <StatCard
              label="Unread Updates"
              value={unreadCount}
              icon="notifications-outline"
              background="#EDF5FF"
              color="#176FD1"
              isNarrow={isNarrow}
            />
          </View>

          <View style={[styles.contentGrid, isCompact && styles.stack]}>
            <View style={styles.primaryColumn}>
              <View style={styles.panel}>
                <View style={styles.panelHeader}>
                  <View>
                    <Text style={styles.panelEyebrow}>RESPONSE TRACKER</Text>
                    <Text style={styles.panelTitle}>Latest Report Status</Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.textButton,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => router.push("/my-cases")}
                  >
                    <Text style={styles.textButtonLabel}>View all reports</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color="#078F82"
                    />
                  </Pressable>
                </View>

                {loading ? (
                  <View style={styles.loadingBlock}>
                    <ActivityIndicator color="#078F82" />
                    <Text style={styles.loadingText}>
                      Loading your latest report...
                    </Text>
                  </View>
                ) : latestCase ? (
                  <>
                    <View style={styles.caseSummary}>
                      <View style={styles.caseIcon}>
                        <Ionicons name="warning" size={24} color="#FFFFFF" />
                      </View>
                      <View style={styles.caseCopy}>
                        <View style={styles.caseTitleRow}>
                          <Text style={styles.caseTitle} numberOfLines={1}>
                            {latestCase.title ||
                              latestCase.category ||
                              "Emergency Report"}
                          </Text>
                          <View style={styles.verifiedPill}>
                            <Ionicons
                              name="shield-checkmark"
                              size={14}
                              color="#087F5B"
                            />
                            <Text style={styles.verifiedText}>
                              {formatStatus(latestCase.status)}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.caseMeta}>
                          {latestCase.location || "Location pending"} ·{" "}
                          {formatDate(latestCase.createdAt)}
                        </Text>
                        <Text style={styles.caseDescription}>
                          Severity: {formatStatus(latestCase.severity || "medium")}.
                          Follow the status below for official response updates.
                        </Text>
                      </View>
                    </View>

                    <ReportProgress
                      status={latestCase.status}
                      compact={isNarrow}
                    />

                    <View
                      style={[
                        styles.panelActions,
                        isNarrow && styles.stack,
                      ]}
                    >
                      <Pressable
                        style={({ pressed }) => [
                          styles.outlineAction,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => router.push("/my-cases")}
                      >
                        <Ionicons
                          name="document-text-outline"
                          size={18}
                          color="#1269CB"
                        />
                        <Text style={styles.outlineActionText}>
                          View Report Details
                        </Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.solidAction,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => router.push("/map-tracking")}
                      >
                        <Ionicons name="map" size={18} color="#FFFFFF" />
                        <Text style={styles.solidActionText}>View on Map</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={30}
                        color="#078F82"
                      />
                    </View>
                    <Text style={styles.emptyTitle}>
                      No reports submitted yet
                    </Text>
                    <Text style={styles.emptyText}>
                      Your emergency and disaster reports will appear here with
                      live status updates.
                    </Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.emptyButton,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => router.push("/disaster-response")}
                    >
                      <Text style={styles.emptyButtonText}>Create a report</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.donationCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => router.push("/donation")}
              >
                <LinearGradient
                  colors={["#6E35D7", "#A638D5", "#D5489D"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.donationGradient}
                >
                  <View style={styles.donationIcon}>
                    <Ionicons name="heart" size={28} color="#E32647" />
                  </View>
                  <View style={styles.donationCopy}>
                    <Text style={styles.donationTitle}>
                      Your support brings hope
                    </Text>
                    <Text style={styles.donationText}>
                      Support relief operations and community recovery programs.
                    </Text>
                  </View>
                  {!isNarrow ? (
                    <View style={styles.donationButton}>
                      <Text style={styles.donationButtonText}>Donate now</Text>
                      <Ionicons
                        name="arrow-forward"
                        size={17}
                        color="#7331C8"
                      />
                    </View>
                  ) : null}
                </LinearGradient>
              </Pressable>
            </View>

            <View
              style={[styles.sideColumn, isCompact && styles.fullWidth]}
            >
              <View style={styles.panel}>
                <View style={styles.panelHeader}>
                  <View>
                    <Text style={styles.panelEyebrow}>OFFICIAL UPDATES</Text>
                    <Text style={styles.panelTitle}>Announcements</Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.iconButton,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => router.push("/announcements")}
                  >
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#078F82"
                    />
                  </Pressable>
                </View>

                {announcements.length ? (
                  announcements.slice(0, 3).map((announcement, index) => (
                    <Pressable
                      key={announcement.id}
                      style={({ pressed }) => [
                        styles.announcementRow,
                        index > 0 && styles.rowBorder,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => router.push("/announcements")}
                    >
                      <View
                        style={[
                          styles.announcementIcon,
                          announcement.priority === "urgent" &&
                            styles.urgentAnnouncementIcon,
                        ]}
                      >
                        <Ionicons
                          name={
                            announcement.priority === "urgent"
                              ? "warning"
                              : "megaphone"
                          }
                          size={18}
                          color={
                            announcement.priority === "urgent"
                              ? "#D52E42"
                              : "#078F82"
                          }
                        />
                      </View>
                      <View style={styles.announcementCopy}>
                        <View style={styles.announcementTitleRow}>
                          <Text
                            style={styles.announcementTitle}
                            numberOfLines={1}
                          >
                            {announcement.title || "VolunServe Update"}
                          </Text>
                          {announcement.priority === "urgent" ? (
                            <Text style={styles.urgentLabel}>URGENT</Text>
                          ) : null}
                        </View>
                        <Text
                          style={styles.announcementMessage}
                          numberOfLines={2}
                        >
                          {announcement.message ||
                            "Open to view this announcement."}
                        </Text>
                        <Text style={styles.announcementDate}>
                          {formatDate(announcement.publishAt)}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <View style={styles.smallEmptyState}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={28}
                      color="#078F82"
                    />
                    <Text style={styles.smallEmptyTitle}>
                      No current announcements
                    </Text>
                    <Text style={styles.smallEmptyText}>
                      Official notices will appear here.
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.safetyCard}>
                <View style={styles.safetyIcon}>
                  <Ionicons
                    name="lock-closed"
                    size={20}
                    color="#176FD1"
                  />
                </View>
                <View style={styles.safetyCopy}>
                  <Text style={styles.safetyTitle}>Your privacy matters</Text>
                  <Text style={styles.safetyText}>
                    Exact locations are visible only to authorized responders
                    assigned to your request.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
  onPress,
}: {
  title: string;
  subtitle: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {action && onPress ? (
        <Pressable
          style={({ pressed }) => pressed && styles.pressed}
          onPress={onPress}
        >
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
  background,
  color,
  isNarrow,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  background: string;
  color: string;
  isNarrow: boolean;
}) {
  return (
    <View style={[styles.statCard, isNarrow && styles.statCardNarrow]}>
      <View style={[styles.statIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={21} color={color} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

function ReportProgress({ status, compact }: { status?: string; compact: boolean }) {
  const progressIndex = getProgressIndex(status);

  return (
    <View style={[styles.progress, compact && styles.progressCompact]}>
      {progressSteps.map((step, index) => {
        const complete = index <= progressIndex;
        return (
          <React.Fragment key={step.key}>
            <View style={styles.progressStep}>
              <View
                style={[
                  styles.progressCircle,
                  complete && styles.progressCircleComplete,
                ]}
              >
                {index < progressIndex ? (
                  <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                ) : (
                  <Text
                    style={[
                      styles.progressNumber,
                      complete && styles.progressNumberComplete,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.progressLabel,
                  complete && styles.progressLabelComplete,
                ]}
              >
                {step.label}
              </Text>
            </View>
            {index < progressSteps.length - 1 ? (
              <View
                style={[
                  styles.progressLine,
                  index < progressIndex && styles.progressLineComplete,
                ]}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F3F7FA" },
  scrollContent: { flexGrow: 1, paddingBottom: 34 },
  page: {
    width: "100%",
    maxWidth: 1480,
    alignSelf: "center",
    paddingHorizontal: 28,
    paddingTop: 22,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 20,
  },
  topBarNarrow: { alignItems: "flex-start" },
  topBarCopy: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: "#078F82",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  pageTitle: {
    marginTop: 5,
    color: "#10233F",
    fontSize: 30,
    fontWeight: "900",
  },
  pageSubtitle: {
    marginTop: 4,
    color: "#66758A",
    fontSize: 14,
    lineHeight: 20,
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  operationalPill: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: "#E7F8F1",
    borderWidth: 1,
    borderColor: "#C7EDDF",
  },
  operationalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#08A473",
  },
  operationalText: { color: "#08765B", fontSize: 12, fontWeight: "800" },
  notificationButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DFE7EE",
    shadowColor: "#17324D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  notificationBadge: {
    position: "absolute",
    right: -3,
    top: -4,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF3340",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  notificationBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  headerProfile: {
    minWidth: 196,
    maxWidth: 235,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 9,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DFE7EE",
    shadowColor: "#17324D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  headerAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#E7F8F4",
  },
  headerAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#078F82",
  },
  headerAvatarText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  headerProfileCopy: { flex: 1, minWidth: 0 },
  headerProfileName: { color: "#17243A", fontSize: 11.5, fontWeight: "900" },
  headerProfileRole: { marginTop: 2, color: "#7A8798", fontSize: 9.5 },
  heroRow: { flexDirection: "row", gap: 18 },
  stack: { flexDirection: "column" },
  fullWidth: { width: "100%", maxWidth: undefined },
  hero: {
    flex: 1,
    minHeight: 288,
    overflow: "hidden",
    borderRadius: 26,
    padding: 32,
    justifyContent: "center",
    shadowColor: "#046E71",
    shadowOffset: { width: 0, height: 13 },
    shadowOpacity: 0.17,
    shadowRadius: 24,
  },
  heroCopy: { width: "62%", maxWidth: 620, zIndex: 2 },
  heroCopyNarrow: { width: "100%" },
  heroLabel: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  heroLabelText: { color: "#D9FFF5", fontSize: 11, fontWeight: "800" },
  heroTitle: {
    marginTop: 18,
    color: "#FFFFFF",
    fontSize: 33,
    lineHeight: 39,
    fontWeight: "900",
    maxWidth: 520,
  },
  heroText: {
    marginTop: 12,
    color: "#D8F8F2",
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 540,
  },
  heroButtons: {
    marginTop: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryHeroButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  primaryHeroButtonText: { color: "#B91C2A", fontSize: 13, fontWeight: "900" },
  secondaryHeroButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
  },
  secondaryHeroButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  heroImage: {
    position: "absolute",
    right: -5,
    bottom: -12,
    width: "40%",
    height: "93%",
    zIndex: 1,
  },
  heroImageNarrow: { opacity: 0.3, right: -55, width: "65%" },
  heroGlow: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    right: -120,
    top: -130,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  emergencyCard: {
    width: 300,
    minHeight: 288,
    borderRadius: 26,
    padding: 23,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F0D5D9",
    shadowColor: "#7F1D1D",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  emergencyIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF3340",
  },
  emergencyLabel: {
    marginTop: 18,
    color: "#C0263A",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  emergencyTitle: {
    marginTop: 7,
    color: "#17243A",
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "900",
  },
  emergencyText: {
    marginTop: 8,
    color: "#65758B",
    fontSize: 12,
    lineHeight: 19,
  },
  noticeRow: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    paddingTop: 16,
  },
  noticeText: { flex: 1, color: "#8A4653", fontSize: 10.5, lineHeight: 16 },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionTitle: { color: "#152844", fontSize: 20, fontWeight: "900" },
  sectionSubtitle: { marginTop: 3, color: "#758398", fontSize: 12 },
  sectionAction: { color: "#078F82", fontSize: 12, fontWeight: "900" },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  serviceCard: {
    minWidth: 230,
    flexGrow: 1,
    flexBasis: 250,
    maxWidth: "49%",
    borderRadius: 19,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DFE7EE",
    shadowColor: "#183153",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
  },
  serviceGradient: {
    minHeight: 116,
    flexDirection: "row",
    alignItems: "center",
    padding: 17,
  },
  serviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceCopy: { flex: 1, minWidth: 0, paddingHorizontal: 14 },
  serviceTitle: { fontSize: 15, fontWeight: "900" },
  serviceDescription: {
    marginTop: 6,
    color: "#5E6D81",
    fontSize: 11.5,
    lineHeight: 17,
  },
  arrowCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  statsGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: 190,
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 15,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E1E8EF",
  },
  statCardNarrow: { minWidth: "47%" },
  statIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { color: "#152844", fontSize: 23, fontWeight: "900" },
  statLabel: {
    marginTop: 2,
    color: "#6C7A8D",
    fontSize: 11,
    fontWeight: "700",
  },
  contentGrid: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  primaryColumn: { flex: 1, minWidth: 0, gap: 14 },
  sideColumn: { width: 380, gap: 14 },
  panel: {
    padding: 20,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DFE7EE",
    shadowColor: "#183153",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 14,
  },
  panelEyebrow: {
    color: "#078F82",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  panelTitle: {
    marginTop: 4,
    color: "#172944",
    fontSize: 18,
    fontWeight: "900",
  },
  textButton: { flexDirection: "row", alignItems: "center", gap: 5 },
  textButtonLabel: { color: "#078F82", fontSize: 11.5, fontWeight: "900" },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7F8F4",
  },
  loadingBlock: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 9, color: "#758398", fontSize: 12 },
  caseSummary: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 16,
    borderRadius: 17,
    backgroundColor: "#FAFCFE",
    borderWidth: 1,
    borderColor: "#E5EBF1",
  },
  caseIcon: {
    width: 49,
    height: 49,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF3340",
  },
  caseCopy: { flex: 1, minWidth: 0 },
  caseTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  caseTitle: {
    flex: 1,
    minWidth: 0,
    color: "#17243A",
    fontSize: 16,
    fontWeight: "900",
  },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#DDF8EC",
  },
  verifiedText: { color: "#087F5B", fontSize: 9.5, fontWeight: "900" },
  caseMeta: {
    marginTop: 6,
    color: "#617188",
    fontSize: 11.5,
    fontWeight: "700",
  },
  caseDescription: {
    marginTop: 7,
    color: "#55667D",
    fontSize: 11.5,
    lineHeight: 18,
  },
  progress: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 25,
  },
  progressCompact: { paddingHorizontal: 0 },
  progressStep: { width: 72, alignItems: "center" },
  progressCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5ECF2",
  },
  progressCircleComplete: { backgroundColor: "#08A473" },
  progressNumber: { color: "#6A788B", fontSize: 11, fontWeight: "900" },
  progressNumberComplete: { color: "#FFFFFF" },
  progressLabel: {
    marginTop: 7,
    color: "#718095",
    fontSize: 9.5,
    fontWeight: "700",
    textAlign: "center",
  },
  progressLabelComplete: { color: "#078765", fontWeight: "900" },
  progressLine: {
    flex: 1,
    height: 3,
    marginTop: 14,
    marginHorizontal: -14,
    backgroundColor: "#E5ECF2",
  },
  progressLineComplete: { backgroundColor: "#08A473" },
  panelActions: { flexDirection: "row", gap: 10 },
  outlineAction: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#F3F8FE",
    borderWidth: 1,
    borderColor: "#BDD8F7",
  },
  outlineActionText: { color: "#1269CB", fontSize: 12, fontWeight: "900" },
  solidAction: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#087BEA",
  },
  solidActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  emptyState: {
    minHeight: 168,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7F8F4",
  },
  emptyTitle: {
    marginTop: 12,
    color: "#17243A",
    fontSize: 15,
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 6,
    maxWidth: 390,
    color: "#6B7A8E",
    fontSize: 11.5,
    lineHeight: 18,
    textAlign: "center",
  },
  emptyButton: {
    marginTop: 14,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 17,
    borderRadius: 11,
    backgroundColor: "#078F82",
  },
  emptyButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  donationCard: {
    overflow: "hidden",
    borderRadius: 20,
    shadowColor: "#7331C8",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  donationGradient: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    padding: 20,
  },
  donationIcon: {
    width: 53,
    height: 53,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  donationCopy: { flex: 1, minWidth: 0 },
  donationTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  donationText: {
    marginTop: 5,
    color: "#F3E8FF",
    fontSize: 11.5,
    lineHeight: 17,
  },
  donationButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  donationButtonText: { color: "#7331C8", fontSize: 11.5, fontWeight: "900" },
  announcementRow: { flexDirection: "row", gap: 11, paddingVertical: 13 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#E7EDF2" },
  announcementIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E6F8F4",
  },
  urgentAnnouncementIcon: { backgroundColor: "#FFF0F2" },
  announcementCopy: { flex: 1, minWidth: 0 },
  announcementTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  announcementTitle: {
    flex: 1,
    color: "#17243A",
    fontSize: 12.5,
    fontWeight: "900",
  },
  urgentLabel: { color: "#D52E42", fontSize: 8.5, fontWeight: "900" },
  announcementMessage: {
    marginTop: 4,
    color: "#617188",
    fontSize: 10.5,
    lineHeight: 16,
  },
  announcementDate: {
    marginTop: 5,
    color: "#94A0AF",
    fontSize: 9.5,
    fontWeight: "700",
  },
  smallEmptyState: { minHeight: 200, alignItems: "center", justifyContent: "center" },
  smallEmptyTitle: {
    marginTop: 8,
    color: "#21334E",
    fontSize: 13,
    fontWeight: "900",
  },
  smallEmptyText: { marginTop: 4, color: "#7A8798", fontSize: 10.5 },
  safetyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#EBF5FF",
    borderWidth: 1,
    borderColor: "#D2E8FB",
  },
  safetyIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  safetyCopy: { flex: 1 },
  safetyTitle: { color: "#174E91", fontSize: 12.5, fontWeight: "900" },
  safetyText: {
    marginTop: 5,
    color: "#476789",
    fontSize: 10.5,
    lineHeight: 16,
  },
  pressed: { opacity: 0.72 },
  cardPressed: { opacity: 0.83, transform: [{ scale: 0.99 }] },
});