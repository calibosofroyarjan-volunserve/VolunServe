import { Ionicons } from "@expo/vector-icons";
import polyline from "@mapbox/polyline";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../lib/firebase";

type UserLocation = {
  latitude: number;
  longitude: number;
};

type IncidentSeverity = "low" | "medium" | "high" | "critical";
type IncidentStatus = "reported" | "assigned" | "in_progress" | "resolved";
type VolunteerStatus = "available" | "responding" | "offline";

type Incident = {
  id: string;
  latitude: number;
  longitude: number;
  type?: string;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  reportedBy?: string;
  assignedVolunteerId?: string;
  assignedVolunteerName?: string;
  distanceKm?: number;
  etaMinutes?: number;
  createdAt?: any;
};

type EvacuationCenter = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  capacity?: number;
  occupied?: number;
};

type Volunteer = {
  id: string;
  name?: string;
  latitude: number;
  longitude: number;
  status?: VolunteerStatus;
  assignedIncidentId?: string;
  updatedAt?: any;
};

type Resident = {
  id: string;
  name?: string;
  latitude: number;
  longitude: number;
  role?: string;
  updatedAt?: any;
};

type RouteStats = {
  distanceKm: number;
  etaMinutes: number;
};

type PredictionResult = {
  riskScore: number;
  riskLevel: "Low" | "Moderate" | "High" | "Critical";
  demandScore: number;
  volunteerPressure: string;
  recommendation: string;
};

export default function MapTracking() {
  const router = useRouter();
  const user = auth.currentUser;

  const CURRENT_USER_ID = user?.uid ?? "";
  const CURRENT_USER_NAME =
    user?.displayName ?? user?.email ?? "Resident User";

  const [userRole, setUserRole] = useState<"resident" | "volunteer" | "admin">(
    "resident"
  );

  const [location, setLocation] = useState<UserLocation | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [centers, setCenters] = useState<EvacuationCenter[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [routeCoords, setRouteCoords] = useState<UserLocation[]>([]);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);
  const [assignedIncidentRoute, setAssignedIncidentRoute] = useState<UserLocation[]>([]);
  const [assignedIncidentStats, setAssignedIncidentStats] = useState<RouteStats | null>(null);

  const [customPin, setCustomPin] = useState<UserLocation | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<
    (UserLocation & { label: string }) | null
  >(null);

  const [mode, setMode] = useState<"map" | "simulation">("map");

  const [loading, setLoading] = useState(true);
  const [watching, setWatching] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const mapRef = useRef<MapView | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const lastSyncRef = useRef(0);
  const watchingRef = useRef(false);
  const userRoleRef = useRef<"resident" | "volunteer" | "admin">("resident");
  const modeRef = useRef<"map" | "simulation">("map");
  const firestoreUnsubscribersRef = useRef<Array<() => void>>([]);
  const lastResidentRouteFetchRef = useRef(0);
  const lastVolunteerRouteFetchRef = useRef(0);

  // The map should NOT snap back to GPS while the user is panning/searching.
  // Recenter enables follow mode again; touching the map disables it.
  const followUserRef = useRef(false);

  // Draggable Map Legend. The whole legend card can be dragged.
  // Use only public Animated APIs so TypeScript does not complain about
  // private methods such as _getValue / __getValue.
  const legendPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const legendPanResponder = useRef(
    PanResponder.create({
      // A normal tap should still reach the expand/collapse button.
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,

      // Begin dragging only after the finger has actually moved.
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,

      onPanResponderGrant: () => {
        // Move the current base position into the offset, then let dx/dy
        // describe only the new drag. This is the public replacement for
        // reading Animated.Value through _getValue / __getValue.
        legendPan.extractOffset();
      },

      onPanResponderMove: Animated.event(
        [null, { dx: legendPan.x, dy: legendPan.y }],
        { useNativeDriver: false }
      ),

      onPanResponderRelease: () => {
        legendPan.flattenOffset();
      },

      onPanResponderTerminate: () => {
        legendPan.flattenOffset();
      },

      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  function calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function toggleSimulationMode() {
    if (mode === "map") {
      followUserRef.current = false;
      modeRef.current = "simulation";
      setMode("simulation");
      setCustomPin((previous) => previous ?? location);

      if (location) {
        mapRef.current?.animateCamera(
          { center: location, zoom: 18, pitch: 0, heading: 0 },
          { duration: 600 }
        );
      }
    } else {
      modeRef.current = "map";
      setMode("map");

      mapRef.current?.animateCamera(
        { pitch: 0, heading: 0 },
        { duration: 450 }
      );
    }
  }

  function getVolunteerPinColor(status?: VolunteerStatus) {
    if (status === "responding") return "#F59E0B";
    if (status === "offline") return "#94A3B8";
    return "#13A66A";
  }

  function getIncidentPinColor(severity?: IncidentSeverity) {
    if (severity === "critical") return "#7f1d1d";
    if (severity === "high") return "#dc2626";
    if (severity === "medium") return "#d97706";
    return "#15803d";
  }

  function getSeverityWeight(severity?: IncidentSeverity) {
    if (severity === "critical") return 4;
    if (severity === "high") return 3;
    if (severity === "medium") return 2;
    return 1;
  }

  const availableVolunteersCount = useMemo(
    () => volunteers.filter((v) => v.status === "available").length,
    [volunteers]
  );

  const respondingVolunteersCount = useMemo(
    () => volunteers.filter((v) => v.status === "responding").length,
    [volunteers]
  );

  const activeIncidentsCount = useMemo(
    () => incidents.filter((i) => i.status !== "resolved").length,
    [incidents]
  );

  const nearestCenter = useMemo(() => {
    if (!location || centers.length === 0) return null;

    const availableCenters = centers.filter((center) => {
      const capacity = center.capacity ?? 0;
      const occupied = center.occupied ?? 0;
      return capacity === 0 || occupied < capacity;
    });

    if (availableCenters.length === 0) return null;

    let nearest = availableCenters[0];
    let minDistance = calculateDistanceKm(
      location.latitude,
      location.longitude,
      nearest.latitude,
      nearest.longitude
    );

    for (const center of availableCenters) {
      const distance = calculateDistanceKm(
        location.latitude,
        location.longitude,
        center.latitude,
        center.longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearest = center;
      }
    }

    return {
      ...nearest,
      distanceKm: minDistance,
    };
  }, [location, centers]);

  const myAssignedIncident = useMemo(() => {
    if (userRole !== "volunteer" || !CURRENT_USER_ID) return null;

    return (
      incidents.find(
        (incident) =>
          incident.assignedVolunteerId === CURRENT_USER_ID &&
          incident.status !== "resolved"
      ) ?? null
    );
  }, [incidents, userRole, CURRENT_USER_ID]);

  const criticalNearbyIncident = useMemo(() => {
    if (!location) return null;

    return (
      incidents.find((incident) => {
        const dist = calculateDistanceKm(
          location.latitude,
          location.longitude,
          incident.latitude,
          incident.longitude
        );
        return incident.severity === "critical" && incident.status !== "resolved" && dist <= 2;
      }) ?? null
    );
  }, [location, incidents]);

  const prediction = useMemo<PredictionResult>(() => {
    const unresolved = incidents.filter((i) => i.status !== "resolved");
    const severityLoad = unresolved.reduce(
      (sum, item) => sum + getSeverityWeight(item.severity),
      0
    );

    const occupancyPressure = centers.reduce((sum, center) => {
      const cap = center.capacity ?? 0;
      const occ = center.occupied ?? 0;
      if (cap <= 0) return sum;
      return sum + Math.min(1, occ / cap);
    }, 0);

    const avgCenterPressure =
      centers.length > 0 ? occupancyPressure / centers.length : 0;

    let localThreat = 0;
    if (location) {
      for (const incident of unresolved) {
        const dist = calculateDistanceKm(
          location.latitude,
          location.longitude,
          incident.latitude,
          incident.longitude
        );
        if (dist <= 5) {
          localThreat += getSeverityWeight(incident.severity) * (1 / Math.max(dist, 0.5));
        }
      }
    }

    const volunteerPenalty =
      availableVolunteersCount === 0
        ? 8
        : Math.max(0, severityLoad - availableVolunteersCount * 2);

    const demandScore = Number(
      (
        severityLoad * 1.8 +
        localThreat * 1.4 +
        avgCenterPressure * 6 +
        volunteerPenalty
      ).toFixed(2)
    );

    let riskLevel: PredictionResult["riskLevel"] = "Low";
    if (demandScore >= 25) riskLevel = "Critical";
    else if (demandScore >= 16) riskLevel = "High";
    else if (demandScore >= 8) riskLevel = "Moderate";

    const volunteerPressure =
      availableVolunteersCount === 0
        ? "No available volunteers"
        : availableVolunteersCount <= 2
        ? "Volunteer capacity is tight"
        : "Volunteer capacity is stable";

    const recommendation =
      riskLevel === "Critical"
        ? "Immediate response required. Prioritize critical incidents, dispatch nearest volunteers, and prepare overflow evacuation routing."
        : riskLevel === "High"
        ? "High pressure predicted. Keep volunteers moving, monitor center occupancy, and escalate unresolved high-severity incidents."
        : riskLevel === "Moderate"
        ? "Situation is manageable but rising. Monitor nearby incidents and maintain volunteer readiness."
        : "Current field pressure is stable. Continue live monitoring and preventive routing.";

    return {
      riskScore: demandScore,
      riskLevel,
      demandScore,
      volunteerPressure,
      recommendation,
    };
  }, [incidents, centers, location, availableVolunteersCount]);

  useEffect(() => {
    if (!user) {
      setLocationError("Please log in first before using live tracking.");
      setLoading(false);
      return;
    }

    initialize();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      watchingRef.current = false;

      firestoreUnsubscribersRef.current.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.log("Firestore unsubscribe error:", error);
        }
      });

      firestoreUnsubscribersRef.current = [];
    };
  }, []);

  useEffect(() => {
    userRoleRef.current = userRole;
  }, [userRole]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (location && nearestCenter && userRole === "resident") {
      const now = Date.now();
      const shouldRefresh =
        routeCoords.length === 0 ||
        now - lastResidentRouteFetchRef.current >= 10000;

      if (shouldRefresh) {
        lastResidentRouteFetchRef.current = now;

        fetchRoute(
          location.latitude,
          location.longitude,
          nearestCenter.latitude,
          nearestCenter.longitude,
          setRouteCoords,
          setRouteStats
        );
      }
    } else if (userRole === "resident") {
      setRouteCoords([]);
      setRouteStats(null);
    }
  }, [location, nearestCenter, userRole, routeCoords.length]);

  useEffect(() => {
    if (location && myAssignedIncident && userRole === "volunteer") {
      const now = Date.now();
      const shouldRefresh =
        assignedIncidentRoute.length === 0 ||
        now - lastVolunteerRouteFetchRef.current >= 10000;

      if (shouldRefresh) {
        lastVolunteerRouteFetchRef.current = now;

        fetchRoute(
          location.latitude,
          location.longitude,
          myAssignedIncident.latitude,
          myAssignedIncident.longitude,
          setAssignedIncidentRoute,
          setAssignedIncidentStats
        );
      }
    } else if (userRole === "volunteer") {
      setAssignedIncidentRoute([]);
      setAssignedIncidentStats(null);
    }
  }, [location, myAssignedIncident, userRole, assignedIncidentRoute.length]);

  async function initialize() {
    try {
      setLocationError(null);

      const resolvedRole = await loadUserRole();
      userRoleRef.current = resolvedRole;
      setUserRole(resolvedRole);

      firestoreUnsubscribersRef.current = [
        subscribeToIncidents(),
        subscribeToCenters(),
        subscribeToVolunteers(),
        subscribeToResidents(),
      ];

      await getInitialLocation();
    } catch (error) {
      console.log("Initialize error:", error);
      setLocationError("Failed to initialize the live map. Please try again.");
      setLoading(false);
    }
  }

  async function loadUserRole(): Promise<"resident" | "volunteer" | "admin"> {
    try {
      if (!CURRENT_USER_ID) return "resident";

      const userDocRef = doc(db, "users", CURRENT_USER_ID);
      const snap = await getDoc(userDocRef);

      if (snap.exists()) {
        const raw = snap.data() as any;
        const role = raw.role ?? "resident";

        if (role === "resident" || role === "volunteer" || role === "admin") {
          return role;
        }

        return "resident";
      }

      await setDoc(
        userDocRef,
        {
          name: CURRENT_USER_NAME,
          email: user?.email ?? "",
          role: "resident",
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      return "resident";
    } catch (error) {
      console.log("Load user role error:", error);
      return "resident";
    }
  }

  async function getInitialLocation() {
    try {
      setLoading(true);
      setLocationError(null);

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        setLocationError(
          "Location permission is required. Allow location access, then tap Retry."
        );
        return;
      }

      let initialLocation: UserLocation | null = null;

      try {
        const lastKnown = await Location.getLastKnownPositionAsync();

        if (lastKnown) {
          initialLocation = {
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
          };

          setLocation(initialLocation);
        }
      } catch (error) {
        console.log("Last known location unavailable:", error);
      }

      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        initialLocation = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };

        setLocation(initialLocation);
      } catch (error) {
        console.log("Current location error:", error);

        if (!initialLocation) {
          setLocationError(
            "Unable to get your GPS location. Turn on Location/GPS and tap Retry."
          );
          return;
        }
      }

      if (!initialLocation) {
        setLocationError(
          "Unable to get your GPS location. Turn on Location/GPS and tap Retry."
        );
        return;
      }

      await syncLiveLocation(initialLocation, true);
      await startLiveTracking();
    } catch (error) {
      console.log("Location error:", error);
      setLocationError(
        "Failed to get your current location. Check GPS permission and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function startLiveTracking() {
    try {
      if (watchingRef.current) return;

      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1500,
          distanceInterval: 2,
        },
        async (pos) => {
          const updatedLoc = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };

          setLocation(updatedLoc);

          if (followUserRef.current && modeRef.current === "map") {
            mapRef.current?.animateCamera(
              { center: updatedLoc },
              { duration: 650 }
            );
          }

          const now = Date.now();

          if (now - lastSyncRef.current >= 3000) {
            lastSyncRef.current = now;
            await syncLiveLocation(updatedLoc, false);
          }
        }
      );

      watchingRef.current = true;
      setWatching(true);
    } catch (error) {
      console.log("Watch location error:", error);
      watchingRef.current = false;
      setWatching(false);
    }
  }

  async function syncLiveLocation(
    coords: UserLocation,
    initializeVolunteerRecord: boolean
  ) {
    try {
      if (!CURRENT_USER_ID) return;

      const role = userRoleRef.current;

      if (role === "volunteer") {
        const volunteerRef = doc(
          db,
          "volunteers_live_locations",
          CURRENT_USER_ID
        );

        const payload: any = {
          name: CURRENT_USER_NAME,
          latitude: coords.latitude,
          longitude: coords.longitude,
          updatedAt: serverTimestamp(),
        };

        // Preserve responding/offline state during GPS updates.
        // Only a brand-new volunteer document starts as available.
        if (initializeVolunteerRecord) {
          const existing = await getDoc(volunteerRef);

          if (!existing.exists()) {
            payload.status = "available";
            payload.assignedIncidentId = "";
          }
        }

        await setDoc(volunteerRef, payload, { merge: true });
      } else {
        await setDoc(
          doc(db, "users_live_locations", CURRENT_USER_ID),
          {
            name: CURRENT_USER_NAME,
            role,
            latitude: coords.latitude,
            longitude: coords.longitude,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (error) {
      console.log("Sync live location error:", error);
    }
  }

  function subscribeToIncidents() {
    const q = query(collection(db, "incidents"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      const data: Incident[] = snapshot.docs.map((docSnap) => {
        const raw = docSnap.data() as any;
        return {
          id: docSnap.id,
          latitude: Number(raw.latitude ?? 0),
          longitude: Number(raw.longitude ?? 0),
          type: raw.type ?? "emergency",
          severity: raw.severity ?? "medium",
          status: raw.status ?? "reported",
          reportedBy: raw.reportedBy ?? "",
          assignedVolunteerId: raw.assignedVolunteerId ?? "",
          assignedVolunteerName: raw.assignedVolunteerName ?? "",
          distanceKm: Number(raw.distanceKm ?? 0),
          etaMinutes: Number(raw.etaMinutes ?? 0),
          createdAt: raw.createdAt,
        };
      });

      setIncidents(data);
    });
  }

  function subscribeToCenters() {
    return onSnapshot(collection(db, "evacuation_centers"), (snapshot) => {
      const data: EvacuationCenter[] = snapshot.docs.map((docSnap) => {
        const raw = docSnap.data() as any;
        return {
          id: docSnap.id,
          name: raw.name ?? "Evacuation Center",
          latitude: Number(raw.latitude ?? 0),
          longitude: Number(raw.longitude ?? 0),
          capacity: Number(raw.capacity ?? 0),
          occupied: Number(raw.occupied ?? 0),
        };
      });

      setCenters(data);
    });
  }

  function subscribeToVolunteers() {
    return onSnapshot(collection(db, "volunteers_live_locations"), (snapshot) => {
      const data: Volunteer[] = snapshot.docs.map((docSnap) => {
        const raw = docSnap.data() as any;
        return {
          id: docSnap.id,
          name: raw.name ?? "Volunteer",
          latitude: Number(raw.latitude ?? 0),
          longitude: Number(raw.longitude ?? 0),
          status: raw.status ?? "available",
          assignedIncidentId: raw.assignedIncidentId ?? "",
          updatedAt: raw.updatedAt,
        };
      });

      setVolunteers(data);
    });
  }

  function subscribeToResidents() {
    return onSnapshot(collection(db, "users_live_locations"), (snapshot) => {
      const data: Resident[] = snapshot.docs.map((docSnap) => {
        const raw = docSnap.data() as any;
        return {
          id: docSnap.id,
          name: raw.name ?? "Resident",
          latitude: Number(raw.latitude ?? 0),
          longitude: Number(raw.longitude ?? 0),
          role: raw.role ?? "resident",
          updatedAt: raw.updatedAt,
        };
      });

      setResidents(data);
    });
  }

  async function fetchRoute(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    setCoords: React.Dispatch<React.SetStateAction<UserLocation[]>>,
    setStats: React.Dispatch<React.SetStateAction<RouteStats | null>>
  ) {
    const useFallbackRoute = () => {
      const directDistance = calculateDistanceKm(
        startLat,
        startLng,
        endLat,
        endLng
      );

      setCoords([
        { latitude: startLat, longitude: startLng },
        { latitude: endLat, longitude: endLng },
      ]);

      setStats({
        distanceKm: Number(directDistance.toFixed(2)),
        etaMinutes: Math.max(1, Math.ceil((directDistance / 25) * 60)),
      });
    };

    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=polyline`
      );

      if (!response.ok) {
        useFallbackRoute();
        return;
      }

      const data = await response.json();

      if (!data?.routes?.length) {
        useFallbackRoute();
        return;
      }

      const route = data.routes[0];
      const points = polyline.decode(route.geometry) as number[][];
      const coords = points.map((point) => ({
        latitude: point[0],
        longitude: point[1],
      }));

      setCoords(coords);
      setStats({
        distanceKm: Number((route.distance / 1000).toFixed(2)),
        etaMinutes: Math.ceil(route.duration / 60),
      });
    } catch (error) {
      console.log("Fetch route error, using fallback route:", error);
      useFallbackRoute();
    }
  }

  async function findNearestAvailableVolunteer(incidentLoc: UserLocation) {
    const volunteerSnapshot = await getDocs(collection(db, "volunteers_live_locations"));

    const availableVolunteers: Volunteer[] = volunteerSnapshot.docs
      .map((docSnap) => {
        const raw = docSnap.data() as any;
        return {
          id: docSnap.id,
          name: raw.name ?? "Volunteer",
          latitude: Number(raw.latitude ?? 0),
          longitude: Number(raw.longitude ?? 0),
          status: raw.status ?? "available",
          assignedIncidentId: raw.assignedIncidentId ?? "",
        };
      })
      .filter((volunteer) => volunteer.status === "available");

    if (availableVolunteers.length === 0) return null;

    let nearest = availableVolunteers[0];
    let minDistance = calculateDistanceKm(
      incidentLoc.latitude,
      incidentLoc.longitude,
      nearest.latitude,
      nearest.longitude
    );

    for (const volunteer of availableVolunteers) {
      const distance = calculateDistanceKm(
        incidentLoc.latitude,
        incidentLoc.longitude,
        volunteer.latitude,
        volunteer.longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearest = volunteer;
      }
    }

    return {
      ...nearest,
      volunteerDistanceKm: minDistance,
    };
  }

  async function getVolunteerRouteStats(
    volunteer: Volunteer,
    incidentLoc: UserLocation
  ): Promise<RouteStats> {
    const fallbackDistance = calculateDistanceKm(
      volunteer.latitude,
      volunteer.longitude,
      incidentLoc.latitude,
      incidentLoc.longitude
    );

    const fallbackStats: RouteStats = {
      distanceKm: Number(fallbackDistance.toFixed(2)),
      etaMinutes: Math.max(1, Math.ceil((fallbackDistance / 25) * 60)),
    };

    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${volunteer.longitude},${volunteer.latitude};${incidentLoc.longitude},${incidentLoc.latitude}?overview=false`
      );

      if (!response.ok) return fallbackStats;

      const data = await response.json();
      if (!data?.routes?.length) return fallbackStats;

      const route = data.routes[0];

      return {
        distanceKm: Number((route.distance / 1000).toFixed(2)),
        etaMinutes: Math.ceil(route.duration / 60),
      };
    } catch (error) {
      console.log("Volunteer route stats error, using fallback:", error);
      return fallbackStats;
    }
  }

  async function reportIncident() {
    if (!location) {
      Alert.alert("Location missing", "Current location is not available.");
      return;
    }

    if (!CURRENT_USER_ID) {
      Alert.alert("Login required", "Please log in before reporting an incident.");
      return;
    }

    try {
      const incidentLoc = customPin ?? {
        latitude: location.latitude,
        longitude: location.longitude,
      };

      const nearbyCriticalCount = incidents.filter((incident) => {
        if (incident.status === "resolved") return false;
        const dist = calculateDistanceKm(
          incidentLoc.latitude,
          incidentLoc.longitude,
          incident.latitude,
          incident.longitude
        );
        return incident.severity === "critical" && dist <= 3;
      }).length;

      const predictedSeverity: IncidentSeverity =
        nearbyCriticalCount >= 2
          ? "critical"
          : availableVolunteersCount === 0
          ? "high"
          : "high";

      const incidentRef = await addDoc(collection(db, "incidents"), {
        latitude: incidentLoc.latitude,
        longitude: incidentLoc.longitude,
        type: "flood",
        severity: predictedSeverity,
        status: "reported",
        reportedBy: CURRENT_USER_ID,
        assignedVolunteerId: "",
        assignedVolunteerName: "",
        distanceKm: 0,
        etaMinutes: 0,
        aiRiskScore: prediction.riskScore,
        aiRiskLevel: prediction.riskLevel,
        aiRecommendation: prediction.recommendation,
        createdAt: serverTimestamp(),
      });

      const nearestVolunteer = await findNearestAvailableVolunteer(incidentLoc);

      if (nearestVolunteer) {
        const volunteerStats = await getVolunteerRouteStats(
          nearestVolunteer,
          incidentLoc
        );

        await updateDoc(doc(db, "incidents", incidentRef.id), {
          status: "assigned",
          assignedVolunteerId: nearestVolunteer.id,
          assignedVolunteerName: nearestVolunteer.name ?? "Volunteer",
          distanceKm:
            volunteerStats?.distanceKm ?? nearestVolunteer.volunteerDistanceKm,
          etaMinutes: volunteerStats?.etaMinutes ?? 0,
        });

        await setDoc(
          doc(db, "volunteers_live_locations", nearestVolunteer.id),
          {
            status: "responding",
            assignedIncidentId: incidentRef.id,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        Alert.alert(
          "Emergency Reported",
          `Nearest volunteer assigned: ${nearestVolunteer.name}\nETA: ${
            volunteerStats?.etaMinutes ?? "N/A"
          } min\nPredicted pressure: ${prediction.riskLevel}`
        );
      } else {
        Alert.alert(
          "Emergency Reported",
          "No available volunteer found. Incident saved for admin monitoring."
        );
      }

      setCustomPin(null);
    } catch (error) {
      console.log("Report incident error:", error);
      Alert.alert("Error", "Failed to report emergency.");
    }
  }

  async function acceptAssignedIncident() {
    if (!myAssignedIncident || !CURRENT_USER_ID) return;

    try {
      await updateDoc(doc(db, "incidents", myAssignedIncident.id), {
        status: "in_progress",
      });

      await setDoc(
        doc(db, "volunteers_live_locations", CURRENT_USER_ID),
        {
          status: "responding",
          assignedIncidentId: myAssignedIncident.id,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      Alert.alert("Accepted", "Incident status updated to in progress.");
    } catch (error) {
      console.log("Accept incident error:", error);
      Alert.alert("Error", "Failed to accept assigned incident.");
    }
  }

  async function markIncidentResolved(incidentId: string, volunteerId?: string) {
    try {
      await updateDoc(doc(db, "incidents", incidentId), {
        status: "resolved",
      });

      if (volunteerId) {
        await setDoc(
          doc(db, "volunteers_live_locations", volunteerId),
          {
            status: "available",
            assignedIncidentId: "",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      Alert.alert("Success", "Incident marked as resolved.");
    } catch (error) {
      console.log("Resolve incident error:", error);
      Alert.alert("Error", "Failed to update incident.");
    }
  }

  async function handleSearch() {
    const rawQuery = searchQuery.trim();
    const term = rawQuery.toLowerCase();

    if (!term) {
      recenterMap();
      return;
    }

    setSearching(true);
    followUserRef.current = false;

    try {
      // 1) Search VolunServe live/Firebase data first.
      const centerMatch = centers.find((center) =>
        center.name.toLowerCase().includes(term)
      );

      const volunteerMatch = volunteers.find((volunteer) =>
        (volunteer.name ?? "").toLowerCase().includes(term)
      );

      const residentMatch = residents.find((resident) =>
        (resident.name ?? "").toLowerCase().includes(term)
      );

      const incidentMatch = incidents.find((incident) => {
        const searchable = [
          incident.type ?? "",
          incident.severity ?? "",
          incident.status ?? "",
          incident.assignedVolunteerName ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(term);
      });

      const databaseMatch =
        centerMatch ?? volunteerMatch ?? residentMatch ?? incidentMatch;

      if (databaseMatch) {
        const result = {
          latitude: databaseMatch.latitude,
          longitude: databaseMatch.longitude,
          label: rawQuery,
        };

        setSearchResult(result);
        mapRef.current?.animateCamera(
          { center: result, zoom: 17, pitch: 0, heading: 0 },
          { duration: 750 }
        );
        return;
      }

      // 2) If it is not in Firebase, use the device geocoder for a real
      // place/address search. We try the raw query first, then city/country
      // hints because VolunServe is a local disaster-response platform.
      const queriesToTry = [
        rawQuery,
        `${rawQuery}, San Jose del Monte, Bulacan, Philippines`,
        `${rawQuery}, Philippines`,
      ];

      let geocoded: { latitude: number; longitude: number } | null = null;

      for (const candidate of queriesToTry) {
        try {
          const results = await Location.geocodeAsync(candidate);
          if (results.length > 0) {
            geocoded = results[0];
            break;
          }
        } catch (geocodeError) {
          console.log("Geocode attempt failed:", candidate, geocodeError);
        }
      }

      if (!geocoded) {
        Alert.alert(
          "No result found",
          `Could not find "${rawQuery}". Try a more complete place or address.`
        );
        return;
      }

      const result = {
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
        label: rawQuery,
      };

      setSearchResult(result);
      mapRef.current?.animateCamera(
        { center: result, zoom: 17, pitch: 0, heading: 0 },
        { duration: 800 }
      );
    } catch (error) {
      console.log("Search error:", error);
      Alert.alert(
        "Search unavailable",
        "The location could not be searched right now. Please check your connection and try again."
      );
    } finally {
      setSearching(false);
    }
  }

  function recenterMap() {
    if (!location) return;

    followUserRef.current = mode === "map";
    setSearchResult(null);

    mapRef.current?.animateCamera(
      {
        center: location,
        zoom: 16,
        pitch: 0,
        heading: 0,
      },
      { duration: 650 }
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
        <ActivityIndicator size="large" color="#0A9B78" />
        <Text style={styles.loadingTitle}>Map Tracking</Text>
        <Text style={styles.loadingText}>Loading live map and location...</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.center}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />

        <View style={styles.locationErrorIcon}>
          <Ionicons name="location-outline" size={32} color="#0A9B78" />
        </View>

        <Text style={styles.loadingTitle}>Location needed</Text>

        <Text style={styles.locationErrorText}>
          {locationError ??
            "Location is unavailable. Turn on GPS and allow location access."}
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={getInitialLocation}
          style={styles.retryButton}
        >
          <Ionicons name="refresh" size={18} color="#FFFFFF" />
          <Text style={styles.retryButtonText}>Retry Location</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={styles.goBackButton}
        >
          <Text style={styles.goBackButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const latestResolvableIncident =
    incidents.find(
      (incident) =>
        incident.status === "assigned" || incident.status === "in_progress"
    ) ?? null;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />

      {/* =====================================================
          TOP HEADER — MATCHES THE REFERENCE DESIGN
      ===================================================== */}

      <SafeAreaView edges={["top"]} style={styles.topArea}>
        <View style={styles.titleRow}>
          <TouchableOpacity
            activeOpacity={0.65}
            onPress={() => router.back()}
            style={styles.topIconButton}
          >
            <Ionicons name="chevron-back" size={27} color="#111827" />
          </TouchableOpacity>

          <Text style={styles.pageTitle}>Map Tracking</Text>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setShowControls((prev) => !prev)}
            style={[
              styles.topIconButton,
              showControls && styles.topIconButtonActive,
            ]}
          >
            <Ionicons
              name="options-outline"
              size={23}
              color={showControls ? "#0A9B78" : "#111827"}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={19} color="#98A2B3" />

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            editable={!searching}
            returnKeyType="search"
            placeholder="Search location or incident..."
            placeholderTextColor="#A6AFBC"
            style={styles.searchInput}
          />

          {searching ? (
            <ActivityIndicator size="small" color="#0A9B78" />
          ) : searchQuery.length > 0 ? (
            <TouchableOpacity
              activeOpacity={0.65}
              onPress={() => {
                setSearchQuery("");
                setSearchResult(null);
              }}
              style={styles.clearSearchButton}
            >
              <Ionicons name="close-circle" size={19} color="#A6AFBC" />
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>

      {/* =====================================================
          MAP
      ===================================================== */}

      <View style={styles.mapArea}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          showsUserLocation={true}
          showsMyLocationButton={false}
          followsUserLocation={false}
          customMapStyle={LIGHT_MAP_STYLE}
          initialRegion={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.012,
            longitudeDelta: 0.012,
          }}
          scrollEnabled={true}
          zoomEnabled={true}
          rotateEnabled={true}
          pitchEnabled={true}
          onPanDrag={() => {
            // Once the user drags the map, stop automatic GPS camera following.
            followUserRef.current = false;
          }}
          onPress={(e) => {
            // Normal live markers are database/GPS data and should not move.
            // Only Simulation Mode creates/moves a manual pin.
            if (mode !== "simulation") return;
            followUserRef.current = false;
            setCustomPin(e.nativeEvent.coordinate);
          }}
        >
          {/* Manual simulation pin */}
          {customPin && mode === "simulation" && (
            <Marker
              coordinate={customPin}
              draggable={true}
              onDragStart={() => {
                followUserRef.current = false;
              }}
              onDragEnd={(event) => {
                setCustomPin(event.nativeEvent.coordinate);
              }}
              title="Simulation Pin"
              description="Drag this pin or tap the map to move it"
            >
              <MapPin color="#111827" icon="pin" />
            </Marker>
          )}

          {searchResult && (
            <Marker
              coordinate={searchResult}
              title={searchResult.label}
              description="Search result"
            >
              <MapPin color="#7C3AED" icon="search" />
            </Marker>
          )}

          {/* Other live residents */}
          {residents
            .filter((resident) => resident.id !== CURRENT_USER_ID)
            .map((resident) => (
              <Marker
                key={resident.id}
                coordinate={{
                  latitude: resident.latitude,
                  longitude: resident.longitude,
                }}
                title={resident.name ?? "Resident"}
                description="Resident live location"
              >
                <RoundMapMarker color="#64748B" icon="person" />
              </Marker>
            ))}

          {/* Relief / responding volunteers */}
          {volunteers.map((volunteer) => (
            <Marker
              key={volunteer.id}
              coordinate={{
                latitude: volunteer.latitude,
                longitude: volunteer.longitude,
              }}
              title={volunteer.name ?? "Volunteer"}
              description={`Status: ${volunteer.status ?? "available"}`}
            >
              <MapPin
                color={getVolunteerPinColor(volunteer.status)}
                icon={
                  volunteer.status === "responding"
                    ? "flame"
                    : volunteer.status === "offline"
                    ? "person"
                    : "shield-checkmark"
                }
              />
            </Marker>
          ))}

          {/* Evacuation centers */}
          {centers.map((center) => (
            <Marker
              key={center.id}
              coordinate={{
                latitude: center.latitude,
                longitude: center.longitude,
              }}
              title={center.name}
              description={
                center.capacity
                  ? `Capacity: ${center.occupied ?? 0}/${center.capacity}`
                  : "Evacuation Center"
              }
            >
              <MapPin
                color={
                  nearestCenter && center.id === nearestCenter.id
                    ? "#1677E8"
                    : "#2E8BEA"
                }
                icon="home"
              />
            </Marker>
          ))}

          {/* Disaster / active incident markers */}
          {incidents.map((incident) => {
            const isActive =
              incident.status === "assigned" || incident.status === "in_progress";

            const markerColor = isActive
              ? "#F7931A"
              : incident.status === "resolved"
              ? "#13A66A"
              : getIncidentPinColor(incident.severity);

            return (
              <Marker
                key={incident.id}
                coordinate={{
                  latitude: incident.latitude,
                  longitude: incident.longitude,
                }}
                title={`${incident.type ?? "Emergency"} (${
                  incident.status ?? "reported"
                })`}
                description={`Severity: ${incident.severity ?? "medium"}${
                  incident.assignedVolunteerName
                    ? ` | Assigned: ${incident.assignedVolunteerName}`
                    : ""
                }`}
              >
                <MapPin
                  color={markerColor}
                  icon={
                    incident.status === "resolved"
                      ? "checkmark"
                      : isActive
                      ? "flame"
                      : "warning"
                  }
                />
              </Marker>
            );
          })}

          {/* Resident route to nearest evacuation center */}
          {userRole === "resident" && routeCoords.length > 0 && (
            <Polyline
              coordinates={routeCoords}
              strokeWidth={5}
              strokeColor="#1677E8"
            />
          )}

          {/* Volunteer route to assigned incident */}
          {userRole === "volunteer" && assignedIncidentRoute.length > 0 && (
            <Polyline
              coordinates={assignedIncidentRoute}
              strokeWidth={5}
              strokeColor="#F7931A"
            />
          )}
        </MapView>

        {/* Critical nearby incident banner */}
        {criticalNearbyIncident && (
          <View style={styles.criticalBanner}>
            <View style={styles.criticalIcon}>
              <Ionicons name="warning" size={16} color="#FFFFFF" />
            </View>

            <Text numberOfLines={2} style={styles.criticalText}>
              Critical incident detected within 2 km of your location
            </Text>
          </View>
        )}

        {/* ===================================================
            MAP LEGEND
        =================================================== */}

        <Animated.View
          {...legendPanResponder.panHandlers}
          style={[
            styles.legendCard,
            !legendExpanded && styles.legendCardCollapsed,
            { transform: legendPan.getTranslateTransform() },
          ]}
        >
          <View style={styles.legendHeader}>
            <View>
              <Text style={styles.legendTitle}>Map Legend</Text>

              {legendExpanded && (
                <Text style={styles.legendHint}>Drag to move</Text>
              )}
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setLegendExpanded((prev) => !prev)}
              style={styles.legendToggleButton}
            >
              <Ionicons
                name={legendExpanded ? "chevron-down" : "chevron-up"}
                size={18}
                color="#667085"
              />
            </TouchableOpacity>
          </View>

          {legendExpanded && (
            <View style={styles.legendGrid}>
              <LegendItem
                color="#E93136"
                icon="warning"
                label="Disaster Report"
              />

              <LegendItem
                color="#F7931A"
                icon="flame"
                label="Active Incident"
              />

              <LegendItem
                color="#13A66A"
                icon="shield-checkmark"
                label="Relief Operation"
              />

              <LegendItem
                color="#1677E8"
                icon="home"
                label="Evacuation Center"
              />
            </View>
          )}
        </Animated.View>

        {/* Recenter current location button */}
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={recenterMap}
          style={styles.recenterButton}
        >
          <Ionicons name="locate" size={24} color="#101828" />
        </TouchableOpacity>

        {/* ===================================================
            OPTIONAL ADVANCED / THESIS CONTROLS
            Hidden by default so the normal screen stays clean.
        =================================================== */}

        {showControls && (
          <View pointerEvents="box-none" style={styles.controlsBackdrop}>
            <View pointerEvents="auto" style={styles.controlsCard}>
              <View style={styles.controlsHeader}>
                <View>
                  <Text style={styles.controlsTitle}>Map Controls</Text>
                  <Text style={styles.controlsSubtitle}>
                    Live monitoring & pin simulation
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.65}
                  onPress={() => setShowControls(false)}
                  style={styles.controlsClose}
                >
                  <Ionicons name="close" size={22} color="#344054" />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.controlsScroll}
              >
                <View style={styles.metricsGrid}>
                  <MetricTile
                    value={String(activeIncidentsCount)}
                    label="Active Incidents"
                  />
                  <MetricTile
                    value={String(availableVolunteersCount)}
                    label="Available"
                  />
                  <MetricTile
                    value={String(respondingVolunteersCount)}
                    label="Responding"
                  />
                  <MetricTile
                    value={String(centers.length)}
                    label="Evac Centers"
                  />
                </View>

                <View style={styles.riskCard}>
                  <View style={styles.riskTopRow}>
                    <Text style={styles.riskLabel}>Predicted Risk</Text>

                    <View style={styles.riskPill}>
                      <Text style={styles.riskPillText}>
                        {prediction.riskLevel}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.riskScore}>
                    Pressure score: {prediction.riskScore}
                  </Text>

                  <Text style={styles.riskDescription}>
                    {prediction.volunteerPressure}
                  </Text>

                  <Text style={styles.riskRecommendation}>
                    {prediction.recommendation}
                  </Text>
                </View>

                {showOverlay && (
                  <View style={styles.commandCard}>
                    <Text style={styles.commandTitle}>
                      Live Command Intelligence
                    </Text>

                    <InfoRow label="Role" value={userRole} />

                    {userRole === "resident" && nearestCenter && (
                      <>
                        <View style={styles.commandDivider} />

                        <Text style={styles.commandSubheading}>
                          Nearest Evacuation Center
                        </Text>

                        <InfoRow label="Center" value={nearestCenter.name} />

                        <InfoRow
                          label="Distance"
                          value={`${nearestCenter.distanceKm.toFixed(2)} km`}
                        />

                        {routeStats && (
                          <>
                            <InfoRow
                              label="Route"
                              value={`${routeStats.distanceKm} km`}
                            />

                            <InfoRow
                              label="ETA"
                              value={`${routeStats.etaMinutes} min`}
                            />
                          </>
                        )}

                        {(nearestCenter.capacity ?? 0) > 0 && (
                          <InfoRow
                            label="Capacity"
                            value={`${nearestCenter.occupied ?? 0}/${
                              nearestCenter.capacity
                            }`}
                          />
                        )}
                      </>
                    )}

                    {userRole === "volunteer" && myAssignedIncident && (
                      <>
                        <View style={styles.commandDivider} />

                        <Text style={styles.commandSubheading}>
                          Assigned Incident
                        </Text>

                        <InfoRow
                          label="Type"
                          value={myAssignedIncident.type ?? "Emergency"}
                        />

                        <InfoRow
                          label="Severity"
                          value={myAssignedIncident.severity ?? "medium"}
                        />

                        <InfoRow
                          label="Status"
                          value={myAssignedIncident.status ?? "assigned"}
                        />

                        {assignedIncidentStats && (
                          <>
                            <InfoRow
                              label="Route"
                              value={`${assignedIncidentStats.distanceKm} km`}
                            />

                            <InfoRow
                              label="ETA"
                              value={`${assignedIncidentStats.etaMinutes} min`}
                            />
                          </>
                        )}
                      </>
                    )}
                  </View>
                )}

                <View style={styles.controlButtonRow}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setShowOverlay((prev) => !prev)}
                    style={styles.secondaryControlButton}
                  >
                    <Ionicons
                      name={showOverlay ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="#344054"
                    />

                    <Text style={styles.secondaryControlText}>
                      {showOverlay ? "Hide Details" : "Show Details"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={toggleSimulationMode}
                    style={styles.secondaryControlButton}
                  >
                    <Ionicons
                      name={mode === "map" ? "navigate-outline" : "map-outline"}
                      size={18}
                      color="#344054"
                    />

                    <Text style={styles.secondaryControlText}>
                      {mode === "map" ? "Pin Simulation" : "Normal Map"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {userRole === "resident" && (
                  <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={reportIncident}
                    style={styles.primaryEmergencyButton}
                  >
                    <Ionicons name="warning" size={19} color="#FFFFFF" />
                    <Text style={styles.primaryEmergencyText}>
                      Report Emergency
                    </Text>
                  </TouchableOpacity>
                )}

                {userRole === "volunteer" &&
                  myAssignedIncident?.status === "assigned" && (
                    <TouchableOpacity
                      activeOpacity={0.82}
                      onPress={acceptAssignedIncident}
                      style={styles.primaryGreenButton}
                    >
                      <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                      <Text style={styles.primaryActionText}>
                        Accept Assigned Incident
                      </Text>
                    </TouchableOpacity>
                  )}

                {(userRole === "volunteer" || userRole === "admin") &&
                  latestResolvableIncident && (
                    <TouchableOpacity
                      activeOpacity={0.82}
                      onPress={() =>
                        markIncidentResolved(
                          latestResolvableIncident.id,
                          latestResolvableIncident.assignedVolunteerId || undefined
                        )
                      }
                      style={styles.resolveButton}
                    >
                      <Ionicons
                        name="checkmark-done"
                        size={20}
                        color="#0A9B78"
                      />

                      <Text style={styles.resolveButtonText}>
                        Resolve Latest Active Incident
                      </Text>
                    </TouchableOpacity>
                  )}
              </ScrollView>
            </View>
          </View>
        )}

      </View>
    </View>
  );
}

/* ============================================================
   SMALL UI COMPONENTS
============================================================ */

function MapPin({
  color,
  icon,
}: {
  color: string;
  icon: any;
}) {
  return (
    <View style={styles.markerContainer}>
      <View style={[styles.markerBubble, { backgroundColor: color }]}>
        <Ionicons name={icon} size={16} color="#FFFFFF" />
      </View>

      <View style={[styles.markerTail, { borderTopColor: color }]} />
    </View>
  );
}

function RoundMapMarker({
  color,
  icon,
}: {
  color: string;
  icon: any;
}) {
  return (
    <View
      style={[
        styles.roundMarker,
        {
          backgroundColor: color,
        },
      ]}
    >
      <Ionicons name={icon} size={12} color="#FFFFFF" />
    </View>
  );
}

function LegendItem({
  color,
  icon,
  label,
}: {
  color: string;
  icon: any;
  label: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={11} color="#FFFFFF" />
      </View>

      <Text numberOfLines={1} style={styles.legendItemText}>
        {label}
      </Text>
    </View>
  );
}

function MetricTile({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <View style={styles.metricTile}>
      <Text numberOfLines={1} style={styles.metricTileValue}>
        {value}
      </Text>

      <Text numberOfLines={1} style={styles.metricTileLabel}>
        {label}
      </Text>
    </View>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.infoRowValue}>
        {value}
      </Text>
    </View>
  );
}

/* ============================================================
   SOFT GOOGLE MAP STYLE
============================================================ */

const LIGHT_MAP_STYLE = [
  {
    elementType: "geometry",
    stylers: [{ color: "#EEF2F4" }],
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#667085" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#FFFFFF" }],
  },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#E6ECE8" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#D7EDDC" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#FFFFFF" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#E1E7EA" }],
  },
  {
    featureType: "road.arterial",
    elementType: "labels.text.fill",
    stylers: [{ color: "#7A8795" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#F7F8F9" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#D9EAF2" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#78909C" }],
  },
];

/* ============================================================
   STYLES
============================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  /* Loading */

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#FFFFFF",
  },

  loadingTitle: {
    marginTop: 14,
    color: "#101828",
    fontSize: 18,
    fontWeight: "800",
  },

  loadingText: {
    marginTop: 5,
    color: "#667085",
    fontSize: 13,
  },

  locationErrorIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#E8F7F3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  locationErrorText: {
    marginTop: 8,
    maxWidth: 300,
    color: "#667085",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },

  retryButton: {
    marginTop: 20,
    minWidth: 170,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#0A9B78",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  goBackButton: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },

  goBackButtonText: {
    color: "#475467",
    fontSize: 13,
    fontWeight: "700",
  },

  /* Header */

  topArea: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F4",
    zIndex: 50,
  },

  titleRow: {
    height: 54,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  topIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },

  topIconButtonActive: {
    backgroundColor: "#ECF8F4",
  },

  pageTitle: {
    color: "#101828",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.25,
  },

  searchWrapper: {
    height: 43,
    marginHorizontal: 17,
    marginBottom: 13,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#E6EAF0",
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },

  searchInput: {
    flex: 1,
    height: "100%",
    marginLeft: 8,
    color: "#344054",
    fontSize: 13,
    paddingVertical: 0,
  },

  clearSearchButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Map */

  mapArea: {
    flex: 1,
    position: "relative",
    backgroundColor: "#EDF2F4",
  },

  criticalBanner: {
    position: "absolute",
    top: 13,
    left: 16,
    right: 16,
    minHeight: 45,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(185, 28, 28, 0.94)",
    zIndex: 15,
    shadowColor: "#7F1D1D",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 6,
  },

  criticalIcon: {
    width: 28,
    height: 28,
    marginRight: 9,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },

  criticalText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },

  /* Custom map markers */

  markerContainer: {
    width: 38,
    height: 45,
    alignItems: "center",
    justifyContent: "flex-start",
  },

  markerBubble: {
    width: 32,
    height: 32,
    borderRadius: 17,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 5,
  },

  markerTail: {
    marginTop: -3,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },

  roundMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 3,
    elevation: 4,
  },

  /* Legend */

  legendCard: {
    position: "absolute",
    left: 16,
    bottom: 19,
    width: 235,
    minHeight: 114,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 13,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.95)",
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 12,
  },

  legendCardCollapsed: {
    minHeight: 0,
    paddingBottom: 11,
    width: 176,
  },

  legendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  legendToggleButton: {
    width: 34,
    height: 34,
    marginRight: -8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },

  legendTitle: {
    color: "#101828",
    fontSize: 15,
    fontWeight: "800",
  },

  legendHint: {
    marginTop: 1,
    color: "#98A2B3",
    fontSize: 9.5,
  },

  legendGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 9,
  },

  legendItem: {
    width: "50%",
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 4,
  },

  legendIcon: {
    width: 20,
    height: 20,
    marginRight: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  legendItemText: {
    flex: 1,
    color: "#475467",
    fontSize: 9.5,
    fontWeight: "600",
  },

  recenterButton: {
    position: "absolute",
    right: 17,
    bottom: 73,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E7EC",
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 13,
  },

  /* Advanced controls overlay */

  controlsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 14,
    justifyContent: "flex-start",
    backgroundColor: "rgba(15,23,42,0.18)",
    zIndex: 40,
  },

  controlsCard: {
    width: "100%",
    maxHeight: "91%",
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 15,
  },

  controlsHeader: {
    paddingHorizontal: 17,
    paddingTop: 16,
    paddingBottom: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F2F5",
  },

  controlsTitle: {
    color: "#101828",
    fontSize: 17,
    fontWeight: "800",
  },

  controlsSubtitle: {
    marginTop: 2,
    color: "#98A2B3",
    fontSize: 10.5,
  },

  controlsClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F8FA",
  },

  controlsScroll: {
    padding: 15,
    paddingBottom: 18,
  },

  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 9,
  },

  metricTile: {
    width: "48.5%",
    minHeight: 65,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#F7F9FB",
    borderWidth: 1,
    borderColor: "#EEF1F4",
  },

  metricTileValue: {
    color: "#101828",
    fontSize: 17,
    fontWeight: "800",
  },

  metricTileLabel: {
    marginTop: 4,
    color: "#667085",
    fontSize: 10.5,
  },

  riskCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 15,
    backgroundColor: "#FFF8E8",
    borderWidth: 1,
    borderColor: "#FDE8B2",
  },

  riskTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  riskLabel: {
    color: "#7A4D00",
    fontSize: 13,
    fontWeight: "800",
  },

  riskPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#F59E0B",
  },

  riskPillText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "800",
  },

  riskScore: {
    marginTop: 8,
    color: "#7A4D00",
    fontSize: 11.5,
    fontWeight: "700",
  },

  riskDescription: {
    marginTop: 3,
    color: "#8A6121",
    fontSize: 11,
  },

  riskRecommendation: {
    marginTop: 7,
    color: "#6B4F1D",
    fontSize: 10.5,
    lineHeight: 15,
  },

  commandCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 15,
    backgroundColor: "#F7FBFA",
    borderWidth: 1,
    borderColor: "#DCEFEA",
  },

  commandTitle: {
    marginBottom: 8,
    color: "#0D594A",
    fontSize: 13.5,
    fontWeight: "800",
  },

  commandDivider: {
    height: 1,
    marginVertical: 9,
    backgroundColor: "#E0ECE9",
  },

  commandSubheading: {
    marginBottom: 5,
    color: "#0D594A",
    fontSize: 11.5,
    fontWeight: "800",
  },

  infoRow: {
    minHeight: 25,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  infoRowLabel: {
    width: "36%",
    color: "#667085",
    fontSize: 10.5,
  },

  infoRowValue: {
    flex: 1,
    color: "#344054",
    textAlign: "right",
    fontSize: 10.5,
    fontWeight: "700",
  },

  controlButtonRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 9,
  },

  secondaryControlButton: {
    flex: 1,
    minHeight: 43,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F9FB",
    borderWidth: 1,
    borderColor: "#E4E7EC",
  },

  secondaryControlText: {
    marginLeft: 6,
    color: "#344054",
    fontSize: 10.5,
    fontWeight: "700",
  },

  primaryEmergencyButton: {
    minHeight: 48,
    marginTop: 11,
    paddingHorizontal: 14,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E93136",
  },

  primaryEmergencyText: {
    marginLeft: 8,
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "800",
  },

  primaryGreenButton: {
    minHeight: 48,
    marginTop: 11,
    paddingHorizontal: 14,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0A9B78",
  },

  primaryActionText: {
    marginLeft: 8,
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "800",
  },

  resolveButton: {
    minHeight: 48,
    marginTop: 9,
    paddingHorizontal: 14,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECF8F4",
    borderWidth: 1,
    borderColor: "#BFE8DD",
  },

  resolveButtonText: {
    marginLeft: 8,
    color: "#0A7B61",
    fontSize: 11.5,
    fontWeight: "800",
  },

});