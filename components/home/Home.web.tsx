import { Ionicons } from "@expo/vector-icons";
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
  ImageBackground,
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

type DisasterCase = {
  id: string;
  title?: string;
  category?: string;
  location?: string;
  severity?: string;
  status?: string;
  createdAt?: any;
};

type AssistanceRequest = {
  id: string;
  assistanceType?: string;
  location?: string;
  status?: string;
  createdAt?: any;
};

type CaseInvitation = {
  id: string;
  caseId?: string;
  status?: string;
  invitedAt?: any;
};

type NotificationItem = {
  id: string;
  read?: boolean;
};

type WeatherState = {
  dataTime: number;
  temperature: number;
  code: number;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

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
  if (!milliseconds) return "Recently";

  return new Date(milliseconds).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatStatus = (value?: string) =>
  String(value || "pending")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const weatherDescription = (
  code: number
): Pick<WeatherState, "label" | "icon"> => {
  if (code === 0) return { label: "Clear sky", icon: "sunny" };
  if ([1, 2].includes(code)) {
    return { label: "Partly cloudy", icon: "partly-sunny" };
  }
  if (code === 3) return { label: "Cloudy", icon: "cloudy" };
  if ([45, 48].includes(code)) return { label: "Foggy", icon: "cloudy" };
  if ([51, 53, 55, 56, 57].includes(code)) {
    return { label: "Drizzle", icon: "rainy" };
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { label: "Rain", icon: "rainy" };
  }
  if ([95, 96, 99].includes(code)) {
    return { label: "Thunderstorm", icon: "thunderstorm" };
  }
  return { label: "Weather update", icon: "partly-sunny" };
};

export default function WebHome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, profile } = useUserSession();
  const { settings } = usePublicSettings();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [cases, setCases] = useState<DisasterCase[]>([]);
  const [assistanceRequests, setAssistanceRequests] = useState<
    AssistanceRequest[]
  >([]);
  const [invitations, setInvitations] = useState<CaseInvitation[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherState | null>(null);

  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState(false);

  const compact = width < 1040;
  const narrow = width < 760;

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
      setAssistanceRequests([]);
      setNotifications([]);
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribeCases = onSnapshot(
      query(
        collection(db, "disasterCases"),
        where("reporterUid", "==", user.uid)
      ),
      (snapshot) => {
        setCases(
          snapshot.docs
            .map((item) => ({
              id: item.id,
              ...(item.data() as Omit<DisasterCase, "id">),
            }))
            .sort(
              (left, right) =>
                toMillis(right.createdAt) - toMillis(left.createdAt)
            )
        );
        setLoading(false);
      },
      () => {
        setCases([]);
        setLoading(false);
      }
    );

    const unsubscribeAssistance = onSnapshot(
      query(
        collection(db, "assistanceRequests"),
        where("requesterUid", "==", user.uid)
      ),
      (snapshot) => {
        setAssistanceRequests(
          snapshot.docs
            .map((item) => ({
              id: item.id,
              ...(item.data() as Omit<AssistanceRequest, "id">),
            }))
            .sort(
              (left, right) =>
                toMillis(right.createdAt) - toMillis(left.createdAt)
            )
        );
      },
      () => setAssistanceRequests([])
    );

    const unsubscribeNotifications = onSnapshot(
      query(
        collection(db, "notifications"),
        where("userId", "==", user.uid)
      ),
      (snapshot) => {
        setNotifications(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<NotificationItem, "id">),
          }))
        );
      },
      () => setNotifications([])
    );

    let unsubscribeInvitations = () => {};

    if (profile?.role === "volunteer") {
      unsubscribeInvitations = onSnapshot(
        query(
          collection(db, "caseInvitations"),
          where("volunteerId", "==", user.uid)
        ),
        (snapshot) => {
          setInvitations(
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...(item.data() as Omit<CaseInvitation, "id">),
              }))
              .sort(
                (left, right) =>
                  toMillis(right.invitedAt) - toMillis(left.invitedAt)
              )
          );
        },
        () => setInvitations([])
      );
    } else {
      setInvitations([]);
    }

    return () => {
      unsubscribeCases();
      unsubscribeAssistance();
      unsubscribeNotifications();
      unsubscribeInvitations();
    };
  }, [user, profile?.role]);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    let lastAttempt = 0;

    const loadWeather = async () => {
      if (disposed || controller || document.visibilityState === "hidden") return;
      lastAttempt = Date.now();
      const request = new AbortController();
      controller = request;
      const timeout = setTimeout(() => request.abort(), 12000);
      setWeatherLoading(true);
      try {
        const response = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=14.813&longitude=121.045&current=temperature_2m,weather_code,is_day&temperature_unit=celsius&timeformat=unixtime&timezone=Asia%2FManila",
          { signal: request.signal, cache: "no-store" }
        );
        if (!response.ok) throw new Error("Weather request failed");
        const data = await response.json();
        const current = data?.current;
        if (
          typeof current?.temperature_2m !== "number" ||
          !Number.isFinite(current.temperature_2m) ||
          !Number.isInteger(current.weather_code) ||
          typeof current.time !== "number" ||
          !Number.isFinite(current.time) || current.time <= 0
        ) throw new Error("Invalid weather response");
        const description = weatherDescription(current.weather_code);
        if (current.is_day === 0 && current.weather_code === 0) {
          description.icon = "moon";
        } else if (current.is_day === 0 && [1, 2].includes(current.weather_code)) {
          description.icon = "cloudy-night";
        }
        if (!disposed) {
          setWeather({
            temperature: current.temperature_2m,
            code: current.weather_code,
            dataTime: current.time * 1000,
            ...description,
          });
          setWeatherError(false);
        }
      } catch {
        // Keep the last successful reading; never replace a failed request with 0°C.
        if (!disposed) setWeatherError(true);
      } finally {
        clearTimeout(timeout);
        controller = null;
        if (!disposed) setWeatherLoading(false);
      }
    };

    const resume = () => {
      // Focus and visibility events can fire together.
      if (Date.now() - lastAttempt >= 30000) void loadWeather();
    };
    const online = () => void loadWeather();
    void loadWeather();
    const timer = setInterval(() => void loadWeather(), 10 * 60 * 1000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", online);

    return () => {
      disposed = true;
      clearInterval(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", online);
    };
  }, []);

  const latestCase = cases[0];
  const latestAssistance = assistanceRequests[0];
  const latestInvitation = invitations[0];

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  const reportStatus = latestCase
    ? formatStatus(latestCase.status)
    : "No reports";

  const assistanceStatus = latestAssistance
    ? formatStatus(latestAssistance.status)
    : "No requests";

  const volunteerStatus =
    profile?.role === "volunteer"
      ? latestInvitation
        ? formatStatus(latestInvitation.status)
        : "No assignments"
      : "Not enrolled";

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.page}>
          <ImageBackground
            source={require("../../assets/images/sjdm-aerial.png")}
            resizeMode="cover"
            style={[styles.hero, compact && styles.heroCompact]}
            imageStyle={[
              styles.heroImage,
              { objectPosition: "center 82%" } as any,
            ]}
          >
            <View style={styles.heroOverlay} />

            <View style={[styles.heroTop, narrow && styles.heroTopNarrow]}>
              <View style={styles.operationalPill}>
                <View style={styles.operationalDot} />
                <Text style={styles.operationalText}>System operational</Text>
              </View>

              <View style={styles.topActions}>
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
                    color="#122B55"
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
                    styles.profileButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => router.push("/profile")}
                >
                  {profile?.profilePictureUrl ? (
                    <Image
                      source={{ uri: profile.profilePictureUrl }}
                      style={styles.profileImage}
                    />
                  ) : (
                    <View style={styles.profileFallback}>
                      <Text style={styles.profileInitial}>{profileInitial}</Text>
                    </View>
                  )}
                  {!narrow ? (
                    <View style={styles.profileCopy}>
                      <Text style={styles.profileName} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <Text style={styles.profileRole}>{profileRole}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-down" size={16} color="#183153" />
                </Pressable>
              </View>
            </View>

            <View style={[styles.heroContent, compact && styles.heroContentCompact]}>
              <View style={styles.heroLeft}>
                <Text style={styles.eyebrow}>RESIDENT OPERATIONS CENTER</Text>
                <Text style={[styles.greeting, narrow && styles.greetingNarrow]}>
                  Good day, {firstName}!
                </Text>
                <Text style={styles.heroSubtitle}>
                  Here&apos;s what&apos;s happening in San Jose del Monte today.
                </Text>

                <View style={[styles.locationWeather, narrow && styles.locationWeatherNarrow]}>
                  <View style={styles.locationSection}>
                    <Ionicons name="location" size={22} color="#FFFFFF" />
                    <Text style={styles.locationText} numberOfLines={1}>
                      San Jose del Monte, Bulacan
                    </Text>
                  </View>

                  <View style={styles.weatherSection}>
                    {weather ? (
                      <>
                        <Ionicons name={weather.icon} size={29} color="#FFD54A" />
                        <Text style={styles.temperatureText}>
                          {Math.round(weather.temperature)}°C
                        </Text>
                        <Text style={styles.weatherLabel}>{weather.label}</Text>
                      </>
                    ) : (
                      <Text style={styles.weatherLabel}>
                        {weatherLoading ? "Loading weather…" : "Weather unavailable"}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.weatherMeta}>
                  <Text style={styles.weatherMetaText}>
                    {weather
                      ? "Weather data: " + new Date(weather.dataTime).toLocaleString("en-PH", {
                          timeZone: "Asia/Manila", month: "short", day: "numeric",
                          hour: "numeric", minute: "2-digit",
                        }) + " PHT"
                      : "SJDM weather"}
                    {weatherLoading ? " · Updating…" : weatherError ? " · Update unavailable" : ""}
                  </Text>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Weather data by Open-Meteo"
                    onPress={() => window.open("https://open-meteo.com/", "_blank", "noopener,noreferrer")}
                  >
                    <Text style={styles.weatherSource}>Weather by Open-Meteo</Text>
                  </Pressable>
                </View>
              </View>

              <View style={[styles.heroCenter, compact && styles.heroCenterCompact]}>
                <View style={[styles.citySealGlow, compact && styles.citySealGlowCompact]} />
                <View style={[styles.citySealFrame, compact && styles.citySealFrameCompact]}>
                  <Image
                    source={require("../../assets/images/sjdm-rising-city.png")}
                    resizeMode="cover"
                    style={[styles.citySeal, compact && styles.citySealCompact]}
                  />
                </View>
              </View>

              <View style={[styles.heroRight, compact && styles.heroRightCompact]}>
                <Text style={styles.heroRightTitle}>Your community{`\n`}at a glance</Text>
                <Text style={styles.heroRightText}>
                  Generally stable conditions across San Jose del Monte today.
                  Local teams remain on alert and monitoring.
                </Text>
                <View style={styles.sloganRow}>
                  <View style={styles.sloganLine} />
                  <Text style={styles.slogan}>Together for a Safer Tomorrow</Text>
                </View>
              </View>
            </View>
          </ImageBackground>

          <View style={[styles.mainGrid, compact && styles.mainGridCompact]}>
            <View style={styles.panel}>
              <PanelTitle
                icon="document-text"
                title="Your Current Activity"
                subtitle="A quick summary of your recent reports, requests, and volunteer involvement."
              />

              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#177CF2" />
                  <Text style={styles.loadingText}>Loading your activity…</Text>
                </View>
              ) : (
                <>
                  <ActivityRow
                    icon="document-text-outline"
                    iconBackground="#E8F3FF"
                    iconColor="#177CF2"
                    title="Latest Report Status"
                    subtitle={
                      latestCase
                        ? latestCase.title ||
                          latestCase.category ||
                          "Emergency report"
                        : "No reports yet."
                    }
                    status={reportStatus}
                    onPress={() => router.push("/my-cases")}
                  />
                  <ActivityRow
                    icon="people-outline"
                    iconBackground="#E6F8F4"
                    iconColor="#079B8B"
                    title="Assistance Request Status"
                    subtitle={
                      latestAssistance
                        ? latestAssistance.assistanceType ||
                          latestAssistance.location ||
                          "Assistance request"
                        : "No requests yet."
                    }
                    status={assistanceStatus}
                    onPress={() => router.push("/resident")}
                  />
                  <ActivityRow
                    icon="shield-checkmark-outline"
                    iconBackground="#EEF1FF"
                    iconColor="#316FEA"
                    title="Volunteer Assignment Status"
                    subtitle={
                      profile?.role === "volunteer"
                        ? latestInvitation
                          ? "Open your volunteer tasks for details."
                          : "No active assignments."
                        : "Apply as a volunteer to receive assignments."
                    }
                    status={volunteerStatus}
                    onPress={() => router.push("/volunteer-application")}
                    last
                  />
                </>
              )}
            </View>

            <View style={styles.panel}>
              <PanelTitle
                icon="megaphone"
                title="Community Updates"
                subtitle="Important announcements from the local response team."
                action="View All"
                onAction={() => router.push("/announcements")}
              />

              {announcements.length ? (
                announcements.slice(0, 3).map((announcement, index) => (
                  <UpdateRow
                    key={announcement.id}
                    announcement={announcement}
                    last={index === Math.min(announcements.length, 3) - 1}
                    onPress={() => router.push("/announcements")}
                  />
                ))
              ) : (
                <View style={styles.emptyUpdates}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={30}
                    color="#0B9B83"
                  />
                  <View style={styles.emptyUpdatesCopy}>
                    <Text style={styles.emptyUpdatesTitle}>
                      No published updates
                    </Text>
                    <Text style={styles.emptyUpdatesText}>
                      Official announcements will appear here.
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          <View style={styles.emergencyPanel}>
            <View style={styles.emergencyHeader}>
              <View style={styles.emergencyHeadingIcon}>
                <Ionicons name="call" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.emergencyHeaderCopy}>
                <Text style={styles.emergencyTitle}>Emergency Contacts</Text>
                <Text style={styles.emergencySubtitle}>
                  For life-threatening situations, contact official emergency
                  services immediately.
                </Text>
              </View>
            </View>

            <View style={[styles.contactGrid, narrow && styles.contactGridNarrow]}>
              <ContactCard
                title="Official Local Response Contact"
                value={settings.emergencyHotline}
                subtitle="Local emergency response information"
              />
              <ContactCard
                title="National Emergency Hotline"
                value="911"
                subtitle="Available nationwide 24/7"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function PanelTitle({
  icon,
  title,
  subtitle,
  action,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.panelHeader}>
      <View style={styles.panelHeaderLeft}>
        <View style={styles.panelIcon}>
          <Ionicons name={icon} size={22} color="#177CF2" />
        </View>
        <View style={styles.panelHeaderCopy}>
          <Text style={styles.panelTitle}>{title}</Text>
          <Text style={styles.panelSubtitle}>{subtitle}</Text>
        </View>
      </View>

      {action && onAction ? (
        <Pressable onPress={onAction} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.viewAll}>{action}  ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ActivityRow({
  icon,
  iconBackground,
  iconColor,
  title,
  subtitle,
  status,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBackground: string;
  iconColor: string;
  title: string;
  subtitle: string;
  status: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.activityRow,
        !last && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.activityIcon, { backgroundColor: iconBackground }]}>
        <Ionicons name={icon} size={23} color={iconColor} />
      </View>
      <View style={styles.activityCopy}>
        <Text style={styles.activityTitle}>{title}</Text>
        <Text style={styles.activitySubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.statusPill}>
        <Text style={styles.statusText} numberOfLines={1}>
          {status}
        </Text>
      </View>
    </Pressable>
  );
}

function UpdateRow({
  announcement,
  onPress,
  last,
}: {
  announcement: Announcement;
  onPress: () => void;
  last?: boolean;
}) {
  const urgent = announcement.priority === "urgent";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.updateRow,
        !last && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
    >
      <View
        style={[
          styles.updateIcon,
          urgent ? styles.updateIconUrgent : styles.updateIconNormal,
        ]}
      >
        <Ionicons
          name={urgent ? "warning-outline" : "information-circle-outline"}
          size={25}
          color={urgent ? "#F03447" : "#167AF4"}
        />
      </View>
      <View style={styles.updateCopy}>
        <Text style={styles.updateTitle} numberOfLines={1}>
          {announcement.title || "VolunServe Update"}
        </Text>
        <Text style={styles.updateMessage} numberOfLines={2}>
          {announcement.message || "Open this announcement to view details."}
        </Text>
      </View>
      <Text style={styles.updateDate}>{formatDate(announcement.publishAt)}</Text>
    </Pressable>
  );
}

function ContactCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <View style={styles.contactCard}>
      <View style={styles.contactIcon}>
        <Ionicons name="call" size={24} color="#F13447" />
      </View>
      <View style={styles.contactCopy}>
        <Text style={styles.contactTitle}>{title}</Text>
        <Text style={styles.contactValue} numberOfLines={2}>
          {value}
        </Text>
        <Text style={styles.contactSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EFF8FD",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  page: {
    width: "100%",
    maxWidth: 1520,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  hero: {
    minHeight: 365,
    overflow: "hidden",
    borderRadius: 0,
    paddingHorizontal: 34,
    paddingTop: 18,
    paddingBottom: 24,
    justifyContent: "space-between",
  },
  heroCompact: {
    minHeight: 520,
  },
  heroImage: {
    borderRadius: 0,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3, 18, 31, 0.20)",
  },
  heroTop: {
    zIndex: 3,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
  },
  heroTopNarrow: {
    justifyContent: "space-between",
  },
  operationalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "rgba(235, 255, 248, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(178, 229, 213, 0.95)",
  },
  operationalDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#0AA679",
  },
  operationalText: {
    color: "#08735C",
    fontSize: 12,
    fontWeight: "800",
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notificationButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(224,232,240,0.95)",
  },
  notificationBadge: {
    position: "absolute",
    right: -3,
    top: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF3340",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  profileButton: {
    minHeight: 50,
    minWidth: 198,
    maxWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(224,232,240,0.95)",
  },
  profileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  profileFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#068D88",
  },
  profileInitial: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: "#0F2552",
    fontSize: 12,
    fontWeight: "900",
  },
  profileRole: {
    marginTop: 2,
    color: "#6B7F9B",
    fontSize: 10,
  },
  heroContent: {
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 26,
    flex: 1,
    paddingTop: 26,
    paddingBottom: 2,
  },
  heroContentCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 18,
  },
  heroLeft: {
    flex: 1.25,
    minWidth: 0,
    maxWidth: 650,
    paddingTop: 18,
  },
  eyebrow: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.3,
    opacity: 0.92,
  },
  greeting: {
    marginTop: 7,
    color: "#FFFFFF",
    fontSize: 47,
    lineHeight: 52,
    fontWeight: "900",
    letterSpacing: -1.4,
    textShadowColor: "rgba(0,0,0,0.24)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  greetingNarrow: {
    fontSize: 38,
    lineHeight: 44,
  },
  heroSubtitle: {
    marginTop: 4,
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.22)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  locationWeather: {
    marginTop: 16,
    alignSelf: "flex-start",
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexWrap: "wrap",
    gap: 12,
    maxWidth: "100%",
    borderRadius: 13,
    backgroundColor: "rgba(22, 91, 171, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  locationWeatherNarrow: {
    alignSelf: "stretch",
  },
  locationSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  locationText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  weatherMeta: {
    marginTop: 7,
    gap: 3,
  },
  weatherMetaText: {
    color: "#FFFFFF",
    fontSize: 11,
  },
  weatherSource: {
    color: "#FFFFFF",
    fontSize: 10,
    textDecorationLine: "underline",
  },
  weatherDivider: {
    width: 1,
    height: 30,
    marginHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  weatherSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  temperatureText: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
  },
  weatherLabel: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 11,
    fontWeight: "600",
  },
  heroCenter: {
    width: 226,
    minWidth: 226,
    height: 230,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginTop: 22,
  },
  heroCenterCompact: {
    width: "100%",
    minWidth: 0,
    height: 170,
    alignItems: "flex-start",
    justifyContent: "center",
    marginTop: 0,
  },
  heroRight: {
    width: 330,
    minWidth: 290,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingRight: 8,
    paddingTop: 22,
  },
  heroRightCompact: {
    width: "100%",
    minWidth: 0,
    paddingRight: 0,
    paddingTop: 0,
  },
  citySeal: {
    width: 184,
    height: 184,
    borderRadius: 92,
  },
  citySealCompact: {
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  citySealGlow: {
    position: "absolute",
    width: 212,
    height: 212,
    borderRadius: 106,
    backgroundColor: "rgba(255, 165, 0, 0.18)",
    borderWidth: 3,
    borderColor: "rgba(255, 180, 35, 0.88)",
    zIndex: 1,
  },
  citySealGlowCompact: {
    width: 176,
    height: 176,
    borderRadius: 88,
  },
  citySealFrame: {
    width: 188,
    height: 188,
    borderRadius: 94,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    zIndex: 2,
  },
  citySealFrameCompact: {
    width: 154,
    height: 154,
    borderRadius: 77,
  },
  heroRightTitle: {
    marginTop: 0,
    color: "#FFFFFF",
    fontSize: 27,
    lineHeight: 29,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.30)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroRightText: {
    marginTop: 7,
    maxWidth: 310,
    color: "rgba(255,255,255,0.97)",
    fontSize: 12.5,
    lineHeight: 18,
    textShadowColor: "rgba(0,0,0,0.28)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  sloganRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sloganLine: {
    width: 38,
    height: 2,
    backgroundColor: "#F3C92A",
  },
  slogan: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  mainGrid: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 16,
  },
  mainGridCompact: {
    flexDirection: "column",
  },
  panel: {
    flex: 1,
    minWidth: 0,
    padding: 20,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3EDF5",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    paddingBottom: 12,
  },
  panelHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    gap: 12,
  },
  panelIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDF5FF",
  },
  panelHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  panelTitle: {
    color: "#092665",
    fontSize: 18,
    fontWeight: "900",
  },
  panelSubtitle: {
    marginTop: 3,
    color: "#6A7FA3",
    fontSize: 11.5,
    lineHeight: 16,
  },
  viewAll: {
    color: "#1178F3",
    fontSize: 11.5,
    fontWeight: "800",
  },
  activityRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 11,
    paddingHorizontal: 4,
  },
  updateRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5EDF5",
  },
  rowPressed: {
    opacity: 0.72,
  },
  activityIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  activityCopy: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    color: "#092665",
    fontSize: 13,
    fontWeight: "900",
  },
  activitySubtitle: {
    marginTop: 3,
    color: "#6A7FA3",
    fontSize: 11.5,
  },
  statusPill: {
    minWidth: 104,
    maxWidth: 150,
    minHeight: 29,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: "#F0F5FA",
  },
  statusText: {
    color: "#123A78",
    fontSize: 10.5,
    fontWeight: "700",
  },
  updateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  updateIconUrgent: {
    backgroundColor: "#FFF0F2",
  },
  updateIconNormal: {
    backgroundColor: "#EDF5FF",
  },
  updateCopy: {
    flex: 1,
    minWidth: 0,
  },
  updateTitle: {
    color: "#092665",
    fontSize: 12.5,
    fontWeight: "900",
  },
  updateMessage: {
    marginTop: 3,
    color: "#58709B",
    fontSize: 11.5,
    lineHeight: 16,
  },
  updateDate: {
    width: 118,
    textAlign: "right",
    color: "#6980A8",
    fontSize: 10.5,
    lineHeight: 15,
  },
  loadingRow: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: "#6A7FA3",
    fontSize: 12,
  },
  emptyUpdates: {
    minHeight: 210,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyUpdatesCopy: {
    alignItems: "center",
  },
  emptyUpdatesTitle: {
    color: "#092665",
    fontSize: 14,
    fontWeight: "900",
  },
  emptyUpdatesText: {
    marginTop: 4,
    color: "#6A7FA3",
    fontSize: 12,
  },
  emergencyPanel: {
    marginTop: 16,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E3EDF5",
  },
  emergencyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  emergencyHeadingIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F23447",
  },
  emergencyHeaderCopy: {
    flex: 1,
  },
  emergencyTitle: {
    color: "#092665",
    fontSize: 18,
    fontWeight: "900",
  },
  emergencySubtitle: {
    marginTop: 2,
    color: "#6A7FA3",
    fontSize: 11.5,
  },
  contactGrid: {
    flexDirection: "row",
    gap: 14,
  },
  contactGridNarrow: {
    flexDirection: "column",
  },
  contactCard: {
    flex: 1,
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE8F3",
    backgroundColor: "#FFFFFF",
  },
  contactIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0F2",
  },
  contactCopy: {
    flex: 1,
    minWidth: 0,
  },
  contactTitle: {
    color: "#092665",
    fontSize: 12.5,
    fontWeight: "900",
  },
  contactValue: {
    marginTop: 3,
    color: "#1178F3",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
  },
  contactSubtitle: {
    marginTop: 2,
    color: "#6A7FA3",
    fontSize: 10.5,
  },
  pressed: {
    opacity: 0.72,
  },
});
