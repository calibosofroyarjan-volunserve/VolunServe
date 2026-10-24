import Ionicons from "@expo/vector-icons/Ionicons";
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { db } from "../lib/firebase";

// LIVE LOCATION IS SEPARATE from the public event meeting-point pin.
// Never put the resident's live coordinates in communityEvents or user profiles.
// Firestore allows only the event proposer and joined approved volunteers to read,
// with an expiry check, and never permits collection-wide list queries.
type EventStatus = "upcoming" | "active" | "completed" | "cancelled";
type LivePoint = {
  eventId: string;
  residentId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  updatedAt?: unknown;
  expiresAt?: Timestamp;
};
type Coords = { latitude: number; longitude: number };
type Props = {
  eventId: string;
  ownerUid?: string;
  currentUid?: string;
  status: EventStatus;
  isResidentOwner: boolean;
  isJoinedVolunteer: boolean;
};

const POINT_TTL_MS = 110_000;
const PUBLISH_THROTTLE_MS = 12_000;
const validCoordinates = (latitude: number, longitude: number) =>
  Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
  Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
const validPoint = (value: any): value is LivePoint =>
  !!value &&
  typeof value.latitude === "number" &&
  typeof value.longitude === "number" &&
  validCoordinates(value.latitude, value.longitude) &&
  value.expiresAt?.toMillis?.() > Date.now();
const mapsTarget = (p: Coords) => `${p.latitude},${p.longitude}`;
const mapsRoute = (point: Coords, origin: Coords | null) =>
  "https://www.google.com/maps/dir/?api=1&destination=" +
  encodeURIComponent(mapsTarget(point)) +
  (origin ? "&origin=" + encodeURIComponent(mapsTarget(origin)) : "") +
  "&travelmode=walking&dir_action=navigate";
const distanceMeters = (a: Coords, b: Coords) => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const sinLat = Math.sin(dLat / 2), sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(a.latitude * rad) *
    Math.cos(b.latitude * rad) * sinLon * sinLon;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
};
const geoApi = () =>
  Platform.OS === "web" ? (globalThis as any).navigator?.geolocation : undefined;

export default function CommunityEventLiveLocation({
  eventId,
  ownerUid,
  currentUid,
  status,
  isResidentOwner,
  isJoinedVolunteer,
}: Props) {
  const canShare = !!currentUid && !!ownerUid &&
    currentUid === ownerUid && isResidentOwner &&
    (status === "upcoming" || status === "active");
  const canView = canShare ||
    (!!currentUid && isJoinedVolunteer &&
      (status === "upcoming" || status === "active"));
  const [point, setPoint] = useState<LivePoint | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [ownPosition, setOwnPosition] = useState<Coords | null>(null);
  const [findingPosition, setFindingPosition] = useState(false);
  const watchRef = useRef<number | null>(null);
  const sharingRef = useRef(false);
  const writeInFlightRef = useRef(false);
  const lastPublishRef = useRef(0);
  const pendingWriteRef = useRef<Promise<void> | null>(null);
  const lastPositionRef = useRef<any>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationRef = doc(db, "communityEventLiveLocations", eventId);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!canView) {
      setPoint(null);
      return;
    }
    return onSnapshot(
      locationRef,
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : null;
        setPoint(data && validPoint(data) ? data as LivePoint : null);
      },
      (error) => {
        setPoint(null);
        setNotice(
          error.code === "permission-denied"
            ? "Live GPS access is restricted to the event organizer and joined volunteers."
            : "Live GPS is unavailable right now. Use the event's official meeting-point map."
        );
      }
    );
  }, [canView, eventId]);

  const stopWatch = () => {
    sharingRef.current = false;
    if (watchRef.current != null) {
      geoApi()?.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (heartbeatRef.current != null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    setSharing(false);
  };

  const clearAfterPendingWrite = async () => {
    try { await pendingWriteRef.current; } catch { /* best-effort cleanup */ }
    await deleteDoc(locationRef);
  };

  const stopSharing = async () => {
    stopWatch();
    setBusy(true);
    try {
      await clearAfterPendingWrite();
      setPoint(null);
      setNotice("Live GPS sharing stopped. Your last location was cleared.");
    } catch {
      setNotice("Sharing stopped on this device. The last position automatically expires shortly if it cannot be cleared.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    // Leaving the event view or switching modes ends live sharing.
    // If a browser closes abruptly, the Firestore expiry prevents ongoing access.
    return () => {
      const wasSharing = sharingRef.current;
      sharingRef.current = false;
      if (watchRef.current != null) {
        geoApi()?.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      if (heartbeatRef.current != null) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (wasSharing) {
        void (async () => {
          try { await pendingWriteRef.current; } catch { /* ignore */ }
          await deleteDoc(doc(db, "communityEventLiveLocations", eventId));
        })().catch(() => {});
      }
    };
  }, [eventId]);

  useEffect(() => {
    if (!canShare && sharingRef.current) {
      stopWatch();
      void clearAfterPendingWrite().catch(() => {});
    }
  }, [canShare]);

  const startSharing = () => {
    if (!canShare || sharingRef.current) return;
    const geo = geoApi();
    if (!geo || Platform.OS !== "web") {
      setNotice("Live GPS needs a browser with location access (HTTPS).");
      return;
    }
    setNotice("");
    setBusy(true);
    sharingRef.current = true;
    setSharing(true);
    lastPublishRef.current = 0;
    const onPosition = async (position: any) => {
      if (!sharingRef.current) return;
      lastPositionRef.current = position;
      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);
      if (!validCoordinates(latitude, longitude)) {
        setNotice("Invalid device GPS coordinates. Move outdoors and try again.");
        return;
      }
      if (writeInFlightRef.current || Date.now() - lastPublishRef.current < PUBLISH_THROTTLE_MS) return;
      writeInFlightRef.current = true;
      lastPublishRef.current = Date.now();
      try {
        const write = setDoc(locationRef, {
          eventId,
          residentId: currentUid,
          latitude,
          longitude,
          accuracyMeters: Math.max(0, Math.min(5000, Math.round(Number(position.coords.accuracy) || 0))),
          updatedAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + POINT_TTL_MS),
        });
        pendingWriteRef.current = write;
        await write;
        if (sharingRef.current) {
          setBusy(false);
          setNotice("Live location is being shared only with joined volunteers in this event.");
        }
      } catch (error: any) {
        stopWatch();
        setBusy(false);
        setNotice(
          error?.code === "permission-denied"
            ? "Sharing blocked by Firestore rules. Deploy the updated event GPS rules first."
            : "Unable to update your GPS. The last shared point will expire shortly."
        );
        void clearAfterPendingWrite().catch(() => {});
      } finally {
        writeInFlightRef.current = false;
        pendingWriteRef.current = null;
      }
    };
    const onGeoError = (error: any) => {
      stopWatch();
      setBusy(false);
      setNotice(
        error?.code === 1
          ? "Location permission denied. Allow GPS access in your browser to share."
          : "Unable to get a reliable GPS fix. Check device location and try again."
      );
      void clearAfterPendingWrite().catch(() => {});
    };
    try {
      heartbeatRef.current = setInterval(() => {
        if (sharingRef.current && lastPositionRef.current) {
          void onPosition(lastPositionRef.current);
        }
      }, 45_000);
      watchRef.current = geo.watchPosition(onPosition, onGeoError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20_000,
      });
    } catch {
      onGeoError(null);
    }
  };

  const locateVolunteer = () => {
    const geo = geoApi();
    if (!geo) {
      setNotice("This browser cannot access GPS. Google Maps can still provide directions.");
      return;
    }
    setFindingPosition(true);
    geo.getCurrentPosition(
      (position: any) => {
        setOwnPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setFindingPosition(false);
      },
      () => {
        setFindingPosition(false);
        setNotice("Your GPS is unavailable or permission was denied. External Google Maps directions still work.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 20_000 }
    );
  };

  const activeExpiry = point?.expiresAt?.toMillis?.() ?? 0;
  const activePoint = point && activeExpiry > now ? point : null;
  if (!canView) return null;

  const map = activePoint && Platform.OS === "web"
    ? React.createElement("iframe" as any, {
        key: `${eventId}:${activePoint.latitude.toFixed(5)}:${activePoint.longitude.toFixed(5)}`,
        title: "Private live GPS position of the event organizer",
        src: `https://maps.google.com/maps?q=${encodeURIComponent(mapsTarget(activePoint))}&z=17&output=embed`,
        loading: "lazy",
        referrerPolicy: "strict-origin-when-cross-origin",
        style: { display: "block", width: "100%", height: "230px", border: 0, borderRadius: "10px" },
      })
    : null;

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Ionicons name="navigate-circle-outline" size={22} color="#07877A" />
        <View style={styles.headingText}>
          <Text style={styles.title}>Resident Live GPS</Text>
          <Text style={styles.subtitle}>
            {canShare
              ? "Optional, private sharing for volunteers who have joined this event"
              : "Only visible to joined volunteers while the organizer shares GPS"}
          </Text>
        </View>
        <View style={[styles.pill, activePoint ? styles.pillOn : styles.pillOff]}>
          <Text style={[styles.pillText, activePoint && styles.pillTextOn]}>
            {activePoint ? "LIVE" : "OFF"}
          </Text>
        </View>
      </View>

      {canShare && (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy && !sharing}
            onPress={() => void (sharing ? stopSharing() : startSharing())}
            style={[styles.button, sharing ? styles.stopButton : styles.startButton]}
          >
            {busy && !sharing ? <ActivityIndicator size="small" color="white" /> :
              <Ionicons name={sharing ? "stop-circle-outline" : "location-outline"} size={19} color="white" />}
            <Text style={styles.buttonText}>{sharing ? "Stop Sharing Location" : "Start Sharing My GPS"}</Text>
          </Pressable>
          <Text style={styles.helper}>
            GPS sharing is off by default, stops when you leave this event page, and expires in about 2 minutes without updates. Your location is NOT published on the public event map.
          </Text>
        </View>
      )}

      {activePoint ? (
        <>
          {map}
          <Text style={styles.info}>
            Resident GPS: {activePoint.latitude.toFixed(5)}, {activePoint.longitude.toFixed(5)} · accuracy ±{Math.round(activePoint.accuracyMeters || 0)} m
          </Text>
          <Text style={styles.helper}>
            Updated within the last 2 minutes. Live GPS is approximate; confirm your meetup with the organizer. Google Maps processes the displayed map coordinates.
          </Text>
          {isJoinedVolunteer && (
            <View style={styles.actions}>
              <Pressable onPress={locateVolunteer} disabled={findingPosition}
                accessibilityRole="button" style={styles.outlineButton}>
                <Ionicons name="locate-outline" size={17} color="#087F75" />
                <Text style={styles.outlineText}>{findingPosition ? "Locating..." : "Locate Me (private)"}</Text>
              </Pressable>
              {ownPosition && (
                <Text style={styles.info}>
                  Your GPS is about {distanceMeters(ownPosition, activePoint).toLocaleString()} m from the resident's latest point. Your own location is not uploaded.
                </Text>
              )}
              <Pressable accessibilityRole="button"
                onPress={() => void Linking.openURL(mapsRoute(activePoint, ownPosition))}
                style={styles.button}>
                <Ionicons name="navigate-outline" size={17} color="white" />
                <Text style={styles.buttonText}>Navigate to Resident GPS</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : (
        <Text style={styles.noLocation}>
          {isJoinedVolunteer
            ? "The resident is not sharing a live position. Navigate using the confirmed event meeting-point map below."
            : "Live GPS is off. You can start sharing when volunteers need help finding your location."}
        </Text>
      )}
      {!!notice && <Text style={styles.message}>{notice}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 16, padding: 15, borderWidth: 1, borderColor: "#B7E4D8", borderRadius: 14, backgroundColor: "#F1FBF7", gap: 10, minWidth: 0 },
  heading: { flexDirection: "row", gap: 9, alignItems: "center" },
  headingText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "900", color: "#123F4A" },
  subtitle: { fontSize: 11, color: "#587A81", marginTop: 3, lineHeight: 16 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  pillOn: { backgroundColor: "#CCF4E4" },
  pillOff: { backgroundColor: "#E8EDF0" },
  pillText: { color: "#617783", fontWeight: "900", fontSize: 10 },
  pillTextOn: { color: "#07876C" },
  actions: { gap: 9, marginTop: 4 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, minHeight: 43, borderRadius: 9, paddingHorizontal: 12, backgroundColor: "#078C80" },
  startButton: { backgroundColor: "#078C80" },
  stopButton: { backgroundColor: "#B53545" },
  buttonText: { fontSize: 12, fontWeight: "900", color: "white" },
  outlineButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 42, borderRadius: 9, paddingHorizontal: 12, backgroundColor: "white", borderWidth: 1, borderColor: "#94CFC0" },
  outlineText: { color: "#076E69", fontWeight: "800", fontSize: 12 },
  helper: { fontSize: 11, lineHeight: 17, color: "#647F87" },
  info: { fontSize: 11, color: "#245768", fontWeight: "700", lineHeight: 17 },
  noLocation: { fontSize: 12, color: "#627A83", lineHeight: 18, marginVertical: 7 },
  message: { fontSize: 11, color: "#315D68", lineHeight: 17 },
});
