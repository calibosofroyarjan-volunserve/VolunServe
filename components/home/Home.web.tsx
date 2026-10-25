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
  Alert,
  Image,
  ImageBackground,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { db } from "../../lib/firebase";
import {
  activeModeForProfile,
  hasResidentAccess,
  hasVolunteerAccess,
  logoutUser,
  setActiveUserMode,
} from "../../lib/firebaseAuth";
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

type VolunteerAssignmentSummary = {
  id: string;
  caseId?: string;
  caseTitle?: string;
  status?: string;
  createdAt?: any;
  updatedAt?: any;
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

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [cases, setCases] = useState<DisasterCase[]>([]);
  const [assistanceRequests, setAssistanceRequests] = useState<
    AssistanceRequest[]
  >([]);
  const [assignments, setAssignments] = useState<VolunteerAssignmentSummary[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherState | null>(null);

  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState(false);
  const [mobileSlide, setMobileSlide] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
  const activeMode = activeModeForProfile(profile);
  const volunteerMode = activeMode === "volunteer" && hasVolunteerAccess(profile);
  const canSwitchMode =
    hasResidentAccess(profile) && hasVolunteerAccess(profile);
  const profileRole = volunteerMode ? "Volunteer" : "Resident";
  const profileVerified = profile?.identityVerified === true || profile?.identityStatus === "verified";
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
      setAssignments([]);
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

    let unsubscribeAssignments = () => {};

    if (volunteerMode) {
      unsubscribeAssignments = onSnapshot(
        query(
          collection(db, "responseAssignments"),
          where("volunteerId", "==", user.uid)
        ),
        (snapshot) => {
          setAssignments(
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...(item.data() as Omit<VolunteerAssignmentSummary, "id">),
              }))
              .sort(
                (left, right) =>
                  Math.max(toMillis(right.updatedAt), toMillis(right.createdAt)) -
                  Math.max(toMillis(left.updatedAt), toMillis(left.createdAt))
              )
          );
        },
        () => setAssignments([])
      );
    } else {
      setAssignments([]);
    }

    return () => {
      unsubscribeCases();
      unsubscribeAssistance();
      unsubscribeNotifications();
      unsubscribeAssignments();
    };
  }, [user, volunteerMode]);

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
  const latestAssignment = assignments[0];

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
    hasVolunteerAccess(profile)
      ? latestAssignment
        ? formatStatus(latestAssignment.status)
        : "No assignments"
      : "Not enrolled";

  const handleModeSwitch = async () => {
    if (!user || !canSwitchMode) return;
    setProfileMenuOpen(false);

    const nextMode = volunteerMode ? "resident" : "volunteer";
    try {
      await setActiveUserMode(nextMode);
      router.replace("/(tabs)");
    } catch (error: any) {
      Alert.alert(
        "Unable to switch mode",
        error?.message || "Please try again."
      );
    }
  };

  const openAccountDestination = (destination: "profile" | "my-cases" | "settings") => {
    setProfileMenuOpen(false);
    if (destination === "settings") {
      router.push({ pathname: "/profile", params: { edit: "1" } });
    } else {
      router.push(destination === "profile" ? "/profile" : "/my-cases");
    }
  };

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    if (loggingOut || !window.confirm("Are you sure you want to log out of VolunServe?")) return;
    setLoggingOut(true);
    try {
      await logoutUser();
      router.replace("/login");
    } catch (error: any) {
      Alert.alert("Log out failed", error?.message || "Please try again.");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.page, narrow && styles.pageMobile]}>
          {profileMenuOpen && !narrow ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Close account menu"
              onPress={() => setProfileMenuOpen(false)} style={styles.profileMenuDismiss} />
          ) : null}
          {narrow ? (
            <ImageBackground
              source={require("../../assets/images/sjdm-aerial.png")}
              resizeMode="cover"
              style={styles.mobileHero}
              imageStyle={styles.mobileHeroImage}
            >
              <View style={styles.mobileHeroShade} />
              <View style={styles.mobileHeroBody}>
                {mobileSlide === 0 ? (
                  <>
                    <Text style={styles.mobileHeroEyebrow}>
                      {volunteerMode ? "VOLUNTEER OPERATIONS CENTER" : "RESIDENT OPERATIONS CENTER"}
                    </Text>
                    <Text style={styles.mobileHeroGreeting} numberOfLines={2}>Good day, {firstName}!</Text>
                    <Text style={styles.mobileHeroDescription}>Here&apos;s what&apos;s happening in San Jose del Monte today.</Text>
                    <View style={styles.mobileWeatherCard}>
                      <Ionicons name="location-outline" size={19} color="#FFFFFF" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.mobileWeatherLocation} numberOfLines={2}>San Jose del Monte, Bulacan</Text>
                        <Text style={styles.mobileWeatherMeta} numberOfLines={1}>
                          {weather ? new Date(weather.dataTime).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PHT" : "Weather update pending"}
                        </Text>
                      </View>
                      <Ionicons name={weather?.icon || "cloud-outline"} size={25} color="#FFD54A" />
                      <View>
                        <Text style={styles.mobileWeatherTemp}>{weather ? Math.round(weather.temperature) + "°C" : "--"}</Text>
                        <Text style={styles.mobileWeatherLabel} numberOfLines={1}>{weather?.label || (weatherLoading ? "Loading" : "Unavailable")}</Text>
                      </View>
                    </View>
                    <Pressable accessibilityRole="link" accessibilityLabel="Open-Meteo weather source" onPress={() => window.open("https://open-meteo.com/", "_blank", "noopener,noreferrer")}>
                      <Text style={styles.mobileWeatherSource}>Weather by Open-Meteo</Text>
                    </Pressable>
                  </>
                ) : mobileSlide === 1 ? (
                  <>
                    <Text style={styles.mobileHeroEyebrow}>COMMUNITY OVERVIEW</Text>
                    <Text style={styles.mobileHeroGreeting}>Your community at a glance</Text>
                    <Text style={styles.mobileHeroDescription}>Generally stable conditions across San Jose del Monte today. Local teams remain on alert and monitoring.</Text>
                    <Text style={styles.mobileHeroSlogan}>Together for a Safer Tomorrow</Text>
                    <Image source={require("../../assets/images/sjdm-rising-city.png")} style={styles.mobileSmallSeal} resizeMode="contain" />
                  </>
                ) : (
                  <>
                    <Text style={styles.mobileHeroEyebrow}>COMMUNITY UPDATES</Text>
                    <Text style={styles.mobileHeroGreeting}>Stay connected with VolunServe</Text>
                    <Text style={styles.mobileHeroDescription}>
                      {announcements.length ? `${announcements.length} published updates available.` : "No published updates yet. Official announcements will appear here."}
                    </Text>
                    <Pressable style={styles.mobileSlideAction} onPress={() => router.push("/announcements")}>
                      <Text style={styles.mobileSlideActionText}>View announcements</Text>
                      <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                    </Pressable>
                  </>
                )}
              </View>
              <View style={styles.mobileSlideControls}>
                <Pressable accessibilityRole="button" accessibilityLabel="Previous slide" onPress={() => setMobileSlide((index) => (index + 2) % 3)} style={styles.mobileSlideArrow}>
                  <Ionicons name="chevron-back" color="#FFFFFF" size={18}/>
                </Pressable>
                <View style={styles.mobileSlideDots}>
                  {[0,1,2].map((i) => (
                    <Pressable key={i} accessibilityLabel={`Open slide ${i + 1}`} accessibilityRole="button" onPress={() => setMobileSlide(i)} style={[styles.mobileSlideDot, mobileSlide === i && styles.mobileSlideDotActive]} />
                  ))}
                </View>
                <Text style={styles.mobileSlideCount}>{mobileSlide + 1} / 3</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Next slide" onPress={() => setMobileSlide((index) => (index + 1) % 3)} style={styles.mobileSlideArrow}>
                  <Ionicons name="chevron-forward" color="#FFFFFF" size={18}/>
                </Pressable>
              </View>
            </ImageBackground>
          ) : (
          <>
            <View style={styles.desktopHeaderStrip}>
            <View style={[styles.heroTop, narrow && styles.heroTopNarrow]}>
              <View style={styles.operationalPill}>
                <View style={styles.operationalDot} />
                <Text style={styles.operationalText}>System operational</Text>
              </View>

              <View style={styles.topActions}>
                {compact && canSwitchMode && volunteerMode ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Switch to ${volunteerMode ? "Resident" : "Volunteer"} Mode`}
                    style={({ pressed }) => [
                      styles.modeSwitchButton,
                      pressed && styles.pressed,
                    ]}
                    onPress={handleModeSwitch}
                  >
                    <Ionicons
                      name="swap-horizontal"
                      size={21}
                      color="#122B55"
                    />
                    {!narrow ? (
                      <Text style={styles.modeSwitchText}>
                        {volunteerMode ? "Resident" : "Volunteer"}
                      </Text>
                    ) : null}
                  </Pressable>
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
                  accessibilityLabel={profileMenuOpen ? "Close account menu" : "Open account menu"}
                  accessibilityState={{ expanded: profileMenuOpen }}
                  style={({ pressed }) => [
                    styles.profileButton,
                    profileMenuOpen && styles.profileButtonOpen,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setProfileMenuOpen(current => !current)}
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
            {profileMenuOpen ? (
              <View style={styles.profileDropdown}>
                <View style={styles.dropdownIdentity}>
                  {profile?.profilePictureUrl ? (
                    <Image source={{ uri: profile.profilePictureUrl }} style={styles.dropdownAvatar} />
                  ) : (
                    <View style={styles.dropdownAvatarFallback}>
                      <Text style={styles.dropdownAvatarInitial}>{profileInitial}</Text>
                    </View>
                  )}
                  <View style={styles.dropdownIdentityCopy}>
                    <Text numberOfLines={1} style={styles.dropdownName}>{displayName}</Text>
                    <Text style={styles.dropdownRole}>{volunteerMode ? "Volunteer Account" : "Resident Account"}</Text>
                  </View>
                  {profileVerified ? (
                    <View style={styles.dropdownVerified}>
                      <Ionicons name="checkmark-circle" size={12} color="#087B55" />
                      <Text style={styles.dropdownVerifiedText}>Verified</Text>
                    </View>
                  ) : null}
                </View>
                <ProfileDropdownAction icon="person-outline" title="My Profile"
                  onPress={() => openAccountDestination("profile")} />
                {!volunteerMode ? (
                  <ProfileDropdownAction icon="document-text-outline" title="My Reports"
                    onPress={() => openAccountDestination("my-cases")} />
                ) : null}
                <ProfileDropdownAction icon="settings-outline" title="Account Settings"
                  onPress={() => openAccountDestination("settings")} />
                {canSwitchMode ? (
                  <ProfileDropdownAction icon="swap-horizontal" title={`Switch to ${volunteerMode ? "Resident" : "Volunteer"} Mode`}
                    onPress={() => void handleModeSwitch()} />
                ) : null}
                <View style={styles.dropdownDivider} />
                <ProfileDropdownAction icon="log-out-outline" title={loggingOut ? "Logging out..." : "Log Out"}
                  destructive disabled={loggingOut} onPress={() => void handleLogout()} />
              </View>
            ) : null}

            </View>
          <ImageBackground
            source={require("../../assets/images/sjdm-aerial.png")}
            resizeMode="cover"
            style={[styles.hero, compact && styles.heroCompact]}
            imageStyle={[
              styles.heroImage,
              { objectPosition: "center 82%" } as any,
            ]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(5,32,45,0.72)", "rgba(8,51,55,0.15)", "rgba(5,34,44,0.65)"]}
              start={{ x: 0, y: 0.45 }} end={{ x: 1, y: 0.58 }}
              style={styles.heroGradientOverlay}
            />
            {/* Same original SJDM aerial photo; subtly lighten the existing cloud area. */}
            <LinearGradient pointerEvents="none"
              colors={["rgba(244,251,255,0.23)", "rgba(245,251,252,0.08)", "rgba(255,255,255,0)"]}
              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
              style={styles.heroSkyHighlight}
            />
            <View style={[styles.heroContent, compact && styles.heroContentCompact]}>
              <View style={styles.heroLeft}>
                <Text style={styles.eyebrow}>
                  {volunteerMode
                    ? "VOLUNTEER OPERATIONS CENTER"
                    : "RESIDENT OPERATIONS CENTER"}
                </Text>
                <Text style={[styles.greeting, narrow && styles.greetingNarrow]}>
                  Good day, <Text style={styles.greetingAccent}>{firstName}!</Text>
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
                <Text style={styles.heroRightTitle}>A Safer, Stronger{`\n`}San Jose del Monte</Text>
                <Text style={styles.heroRightText}>
                  One community. One platform. Greater impact.
                </Text>
                <View style={styles.heroRightAccent} />
              </View>
            </View>
          </ImageBackground>
          </>
          )}

          <View style={[styles.mainGrid, compact && styles.mainGridCompact]}>
            <View style={[styles.panel, narrow && styles.mobilePanel]}>
              <PanelTitle
                icon="document-text"
                title="Your Current Activity"
                subtitle={
                  volunteerMode
                    ? "Your response assignments and volunteer activity."
                    : "Your recent reports, requests, and volunteer access."
                }
                action="View All"
                onAction={() => router.push(volunteerMode ? "/volunteer-impact" : "/my-cases")}
              />

              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#177CF2" />
                  <Text style={styles.loadingText}>Loading your activity…</Text>
                </View>
              ) : (
                <>
                  {volunteerMode ? (
                    <>
                      <ActivityRow
                        icon="shield-checkmark-outline"
                        iconBackground="#EEF1FF"
                        iconColor="#316FEA"
                        title="Volunteer Assignment Status"
                        subtitle={
                          latestAssignment
                            ? latestAssignment.caseTitle ||
                              "Open your volunteer tasks for details."
                            : "No active assignments."
                        }
                        status={volunteerStatus}
                        onPress={() => router.push("/volunteer")}
                      />
                      <ActivityRow
                        icon="ribbon-outline"
                        iconBackground="#E6F8F4"
                        iconColor="#079B8B"
                        title="Volunteer Progress"
                        subtitle="Review your verified contributions and response history."
                        status="View progress"
                        onPress={() => router.push("/volunteer-impact")}
                      />
                      <ActivityRow
                        icon="document-outline"
                        iconBackground="#E8F3FF"
                        iconColor="#177CF2"
                        title="Certificates"
                        subtitle="View your issued volunteer certificates."
                        status="View certificates"
                        onPress={() => router.push("/certificate")}
                        last
                      />
                    </>
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
                        title="Volunteer Access"
                        subtitle={
                          hasVolunteerAccess(profile)
                            ? "Volunteer access approved. Switch modes when you want to respond."
                            : "Apply as a volunteer to receive response assignments."
                        }
                        status={
                          hasVolunteerAccess(profile)
                            ? "Approved"
                            : "Not enrolled"
                        }
                        onPress={() => router.push("/volunteer-application")}
                        last
                      />
                    </>
                  )}
                </>
              )}
            </View>

            <View style={[styles.panel, narrow && styles.mobilePanel]}>
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
                  <View style={styles.emptyUpdatesArtwork}>
                    <Ionicons name="document-text-outline" size={53} color="#A9D2E8" />
                    <View style={styles.emptyUpdatesCheck}>
                      <Ionicons name="checkmark" size={19} color="#FFFFFF" />
                    </View>
                  </View>
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

          <View style={[styles.emergencyPanel, narrow && styles.mobilePanel]}>
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
              <ContactCard kind="local" />
              <ContactCard kind="national" />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ProfileDropdownAction({
  icon, title, onPress, destructive = false, disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.dropdownAction, pressed && styles.dropdownActionPressed]}>
      <Ionicons name={icon} size={19} color={destructive ? "#D82D40" : "#1B3662"} />
      <Text style={[styles.dropdownActionText, destructive && styles.dropdownActionDanger]}>{title}</Text>
    </Pressable>
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
          <Ionicons name={icon} size={22} color="#008E7B" />
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
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.activityRow,
        mobile && styles.mobileActivityRow,
        !last && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.activityIcon, { backgroundColor: iconBackground }]}>
        <Ionicons name={icon} size={23} color={iconColor} />
      </View>
      <View style={styles.activityCopy}>
        <Text style={styles.activityTitle}>{title}</Text>
        <Text style={styles.activitySubtitle} numberOfLines={mobile ? 2 : 1}>
          {subtitle}
        </Text>
      </View>
      <View style={[
        styles.statusPill,
        mobile && styles.mobileStatusPill,
        /pending|awaiting/i.test(status) && styles.statusPillPending,
        /approved|verified|complete/i.test(status) && styles.statusPillApproved,
      ]}>
        <Text style={[
          styles.statusText,
          /pending|awaiting/i.test(status) && styles.statusTextPending,
          /approved|verified|complete/i.test(status) && styles.statusTextApproved,
        ]} numberOfLines={1}>{status}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#8CA3BB" />
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

function ContactCard({ kind }: { kind: "local" | "national" }) {
  const local = kind === "local";
  const dial = (phone: string) => {
    void Linking.openURL(`tel:${phone.replace(/[^+\d]/g, "")}`).catch(() => {});
  };
  return (
    <LinearGradient
      colors={local ? ["#FFF4F5", "#FFE9ED"] : ["#F2F9FF", "#E0F1FE"]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[styles.contactCard, local ? styles.localContactCard : styles.nationalContactCard]}
    >
      <View style={[styles.contactIcon, !local && styles.nationalContactIcon]}>
        <Ionicons name={local ? "medkit" : "call"} size={28}
          color={local ? "#EE334B" : "#167BF2"} />
      </View>
      <View style={styles.contactCopy}>
        <Text style={[styles.contactTitle, local && styles.localContactTitle]}>
          {local ? "CDRRMO – San Jose del Monte" : "National Emergency Hotline"}
        </Text>
        {local ? (
          <>
            <Text style={styles.contactAgency}>City Disaster Risk Reduction and Management Office</Text>
            <View style={styles.contactNumberGrid}>
              <Pressable accessibilityRole="link"
                accessibilityLabel="Call CDRRMO landline 044-306-6234"
                onPress={() => dial("0443066234")} style={styles.contactNumberGroup}>
                <Ionicons name="call" size={19} color="#F03A4E" />
                <View style={styles.contactNumberCopy}>
                  <Text style={styles.contactNumberLabel}>Landline</Text>
                  <Text style={styles.contactLocalNumberStrong}>044-306-6234</Text>
                </View>
              </Pressable>
              <View style={styles.contactNumberDivider} />
              <Pressable accessibilityRole="link"
                accessibilityLabel="Call CDRRMO mobile 0932-600-0119"
                onPress={() => dial("09326000119")} style={styles.contactNumberGroup}>
                <Ionicons name="phone-portrait-outline" size={19} color="#F03A4E" />
                <View style={styles.contactNumberCopy}>
                  <Text style={styles.contactNumberLabel}>Phone Number</Text>
                  <Text style={styles.contactLocalNumberStrong}>0932-600-0119</Text>
                </View>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Pressable accessibilityRole="link" accessibilityLabel="Call National Emergency Hotline 911"
              onPress={() => dial("911")}>
              <Text style={styles.nationalHotlineValue}>911</Text>
            </Pressable>
            <Text style={styles.contactSubtitle}>Available nationwide 24/7</Text>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  mobileHero: {
    minHeight: 335, borderRadius: 18, overflow: "hidden",
    backgroundColor: "#174F63", justifyContent: "space-between", padding: 17,
  },
  mobileHeroImage: { borderRadius: 18 },
  mobileHeroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2, 21, 32, 0.55)" },
  mobileHeroBody: { zIndex: 1, paddingTop: 6, minHeight: 245, justifyContent: "center" },
  mobileHeroEyebrow: { color: "#E9F9FC", fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginBottom: 8 },
  mobileHeroGreeting: { color: "#FFFFFF", fontSize: 29, lineHeight: 34, fontWeight: "900", letterSpacing: -0.6 },
  mobileHeroDescription: { color: "#FFFFFF", fontSize: 12.5, lineHeight: 18.5, fontWeight: "600", marginTop: 8, maxWidth: 370 },
  mobileWeatherCard: {
    flexDirection: "row", alignItems: "center", gap: 7, marginTop: 15,
    backgroundColor: "rgba(4, 35, 53, 0.84)", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 11,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.28)",
  },
  mobileWeatherLocation: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  mobileWeatherMeta: { color: "#D0EAF1", fontSize: 8.5, marginTop: 3 },
  mobileWeatherTemp: { color: "#FFFFFF", fontWeight: "900", fontSize: 19 },
  mobileWeatherLabel: { color: "#FFFFFF", fontSize: 9, maxWidth: 66 },
  mobileWeatherSource: { color: "#EAF6F8", fontSize: 9, textDecorationLine: "underline", marginTop: 6 },
  mobileHeroSlogan: { marginTop: 16, fontSize: 11, color: "#FFFFFF", fontWeight: "800" },
  mobileSmallSeal: { width: 64, height: 64, marginTop: 14, borderRadius: 32 },
  mobileSlideAction: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 8, padding: 11, backgroundColor: "#087F70", borderRadius: 10, marginTop: 18 },
  mobileSlideActionText: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "800" },
  mobileSlideControls: { flexDirection: "row", alignItems: "center", justifyContent: "center", zIndex: 2, gap: 10, marginTop: 10 },
  mobileSlideArrow: { width: 31, height: 31, borderRadius: 16, backgroundColor: "rgba(10,30,46,0.6)", borderColor: "rgba(255,255,255,0.45)", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  mobileSlideDots: { flexDirection: "row", alignItems: "center", gap: 6 },
  mobileSlideDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.45)" },
  mobileSlideDotActive: { width: 20, backgroundColor: "#FFFFFF" },
  mobileSlideCount: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  mobilePanel: { padding: 13, borderRadius: 17 },
  mobileActivityRow: { gap: 8, paddingHorizontal: 0, paddingVertical: 10 },
  mobileStatusPill: { minWidth: 70, maxWidth: 92, paddingHorizontal: 6 },
  screen: {
    flex: 1,
    backgroundColor: "#EEF8FD",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  pageMobile: { paddingHorizontal: 11, paddingTop: 11 },
  page: {
    width: "100%",
    maxWidth: 1700,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  hero: {
    minHeight: 302,
    overflow: "hidden",
    borderRadius: 20,
    paddingHorizontal: 30,
    paddingTop: 18,
    paddingBottom: 20,
    justifyContent: "space-between",
  },
  heroCompact: {
    minHeight: 520,
  },
  heroImage: {
    borderRadius: 20,
  },
  heroGradientOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 20 },
  heroSkyHighlight: { position: "absolute", top: 0, left: "30%", width: "48%", height: "53%", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3, 18, 31, 0.20)",
  },
  desktopHeaderStrip: {
    zIndex: 80,
    overflow: "visible",
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 3,
    paddingBottom: 13,
  },
  profileMenuDismiss: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 70,
  },
  profileDropdown: {
    position: "absolute",
    top: 57,
    right: 3,
    width: 300,
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E5EDF3",
    padding: 11,
    zIndex: 90,
    shadowColor: "#112F4C",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 25,
    elevation: 20,
  },
  dropdownIdentity: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 5, paddingVertical: 9,
    paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#EAF0F4",
    marginBottom: 7,
  },
  dropdownAvatar: { width: 38, height: 38, borderRadius: 19 },
  dropdownAvatarFallback: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center", backgroundColor: "#E1F1FD",
  },
  dropdownAvatarInitial: { color: "#1178CE", fontSize: 19, fontWeight: "900" },
  dropdownIdentityCopy: { flex: 1, minWidth: 0 },
  dropdownName: { fontSize: 12.5, fontWeight: "900", color: "#102850" },
  dropdownRole: { fontSize: 10.5, color: "#647C9B", marginTop: 3 },
  dropdownVerified: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 7, paddingVertical: 5,
    borderRadius: 16, backgroundColor: "#DDF8EB",
  },
  dropdownVerifiedText: { color: "#087B55", fontSize: 9, fontWeight: "800" },
  dropdownAction: {
    flexDirection: "row", alignItems: "center", gap: 13,
    minHeight: 45, paddingHorizontal: 12, borderRadius: 11,
  },
  dropdownActionPressed: { backgroundColor: "#F0F8F8" },
  dropdownActionText: { color: "#1A3156", fontSize: 12.5, fontWeight: "700" },
  dropdownActionDanger: { color: "#D53242" },
  dropdownDivider: { height: 1, backgroundColor: "#E7EDF2", marginVertical: 8, marginHorizontal: 9 },
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
  modeSwitchButton: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(224,232,240,0.95)",
  },
  modeSwitchText: {
    color: "#122B55",
    fontSize: 12,
    fontWeight: "800",
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
  profileButtonOpen: { borderColor: "#77C9C0", backgroundColor: "#FFFFFF" },
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
    gap: 18,
    flex: 1,
    paddingTop: 16,
    paddingBottom: 4,
  },
  heroContentCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 18,
  },
  heroLeft: {
    flex: 1.4,
    minWidth: 0,
    maxWidth: 650,
    paddingTop: 2,
  },
  eyebrow: {
    color: "#E4FFF5",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    opacity: 0.96,
  },
  greeting: {
    marginTop: 7,
    color: "#FFFFFF",
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "800",
    letterSpacing: -1.1,
    textShadowColor: "rgba(0,0,0,0.24)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  greetingAccent: { color: "#75F2BC" },
  greetingNarrow: {
    fontSize: 38,
    lineHeight: 44,
  },
  heroSubtitle: {
    marginTop: 7,
    color: "#F3FFFD",
    fontSize: 14,
    lineHeight: 20,
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
    width: 204,
    minWidth: 204,
    height: 214,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginTop: 4,
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
    width: 262,
    minWidth: 210,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingRight: 2,
    paddingTop: 4,
  },
  heroRightCompact: {
    width: "100%",
    minWidth: 0,
    paddingRight: 0,
    paddingTop: 0,
  },
  citySeal: {
    width: 174,
    height: 174,
    borderRadius: 87,
  },
  citySealCompact: {
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  citySealGlow: {
    position: "absolute",
    width: 202,
    height: 202,
    borderRadius: 101,
    backgroundColor: "rgba(255, 183, 44, 0.09)",
    borderWidth: 2,
    borderColor: "rgba(255, 180, 35, 0.88)",
    zIndex: 1,
  },
  citySealGlowCompact: {
    width: 176,
    height: 176,
    borderRadius: 88,
  },
  citySealFrame: {
    width: 178,
    height: 178,
    borderRadius: 89,
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
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroRightText: {
    marginTop: 7,
    maxWidth: 260,
    color: "#F0FFF9",
    fontSize: 12,
    lineHeight: 19,
    textShadowColor: "rgba(0,0,0,0.28)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  heroRightAccent: { marginTop: 14, width: 48, height: 4, borderRadius: 3, backgroundColor: "#82F39D" },
  sloganRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(5,82,66,0.75)",
    borderWidth: 1,
    borderColor: "rgba(167,249,207,0.35)",
    borderRadius: 22,
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
    padding: 21,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DEEDF2",
    shadowColor: "#0D506A",
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DDF8F2",
  },
  panelHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  panelTitle: {
    color: "#102C50",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  panelSubtitle: {
    marginTop: 4,
    color: "#6B8297",
    fontSize: 11,
    lineHeight: 17,
  },
  viewAll: {
    color: "#1178F3",
    fontSize: 11.5,
    fontWeight: "800",
  },
  activityRow: {
    minHeight: 77,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 12,
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
    color: "#12315A",
    fontSize: 12.5,
    fontWeight: "800",
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
    fontWeight: "800",
  },
  statusPillPending: { backgroundColor: "#FFF0E7" },
  statusTextPending: { color: "#CE6D1B" },
  statusPillApproved: { backgroundColor: "#E0F8EF" },
  statusTextApproved: { color: "#077953" },
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
  emptyUpdatesArtwork: {
    width: 112, height: 90, borderRadius: 26,
    backgroundColor: "#F1F9FD", alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  emptyUpdatesCheck: {
    position: "absolute", right: 17, bottom: 12,
    width: 29, height: 29, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#009A78", borderWidth: 2, borderColor: "#FFFFFF",
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
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#FFF9FA",
    borderWidth: 1,
    borderColor: "#F8DDE3",
    shadowColor: "#0D506A",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
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
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#F4DCE0",
    backgroundColor: "#FFF7F6",
  },
  localContactCard: { borderColor: "#F4DCE0" },
  nationalContactCard: { borderColor: "#D6EAFB" },
  contactIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE3E8",
  },
  nationalContactIcon: { backgroundColor: "#DDEFFC" },
  localContactTitle: { color: "#8F1528" },
  contactAgency: { color: "#6B5261", fontSize: 10.5, marginTop: 3 },
  contactNumberGrid: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center",
    gap: 11, marginTop: 13,
  },
  contactNumberGroup: {
    flexDirection: "row", alignItems: "center", gap: 7, minWidth: 130,
  },
  contactNumberDivider: {
    width: 1, height: 31, backgroundColor: "#F6BFCA",
  },
  contactNumberCopy: { gap: 2 },
  contactNumberLabel: { color: "#5B6580", fontSize: 10 },
  nationalHotlineValue: {
    marginTop: 2, fontSize: 30, lineHeight: 34,
    color: "#E92F47", fontWeight: "900",
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
    marginTop: 4,
    color: "#142D55",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  contactLocalNumber: { color: "#24405B", fontSize: 12.5, lineHeight: 20 },
  contactLocalNumberStrong: { fontWeight: "900", fontSize: 14, color: "#143052" },
  contactCallAction: {
    width: 43, height: 43, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#F9C5CC", backgroundColor: "#FFFFFF",
  },
  nationalCallAction: { borderColor: "#BEDDFF" },
  contactSubtitle: {
    marginTop: 2,
    color: "#6A7FA3",
    fontSize: 10.5,
  },
  pressed: {
    opacity: 0.72,
  },
});
