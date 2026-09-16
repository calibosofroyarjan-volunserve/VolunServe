import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CaseChat from "./CaseChat.web";
import { ResponsePanel, useResponseFlow } from "./ResponseFlow.web";

import { db } from "../../lib/firebase";
import {
  activeModeForProfile,
  hasVolunteerAccess,
  isApprovedProfile,
} from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type CaseRow = {
  id: string;
  reporterUid?: string;
  reporterProfilePictureUrl?: string;
  profilePictureUrl?: string; // legacy compatibility only
  title?: string;
  category?: string;
  location?: string;
  reporterName?: string;
  reporterEmail?: string;
  reporterBarangay?: string;
  reporterAddress?: string;
  contactNumber?: string;
  emergencyContact?: string;
  details?: string;
  needs?: string;
  needsNote?: string;
  affectedPeople?: number | string;
  assistanceTypes?: string[];
  requiredSkills?: string[];
  neededGoods?: string[];
  attachments?: Array<{
    url?: string;
    type?: string;
    name?: string;
    contentType?: string;
  }>;
  assignedVolunteerIds?: string[];
  severity?: "low" | "medium" | "high" | "critical" | string;
  status?: string;
  verificationStatus?: string;
  latitude?: number | null;
  longitude?: number | null;
  requiredVolunteers?: number;
  assignedVolunteersCount?: number;
  createdAt?: any;
};

type CenterRow = {
  id: string;
  name?: string;
  address?: string;
  barangay?: string;
  status?: string;
  latitude?: number | null;
  longitude?: number | null;
  capacity?: number;
  occupied?: number;
};

type BrowserLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
};

type SelectedMapItem =
  | { kind: "incident"; id: string }
  | { kind: "center"; id: string }
  | null;

const SJDM_CENTER = {
  latitude: 14.813,
  longitude: 121.045,
};

const mapDocument = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link
    rel="stylesheet"
    href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css"
  />
  <style>
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      background: #eaf2f7;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #notice {
      position: absolute;
      z-index: 9999;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      padding: 9px 12px;
      border-radius: 10px;
      background: rgba(255,255,255,.95);
      box-shadow: 0 8px 28px rgba(15,23,42,.14);
      color: #334155;
      font-size: 13px;
      pointer-events: none;
    }

    .pin {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border: 3px solid #fff;
      border-radius: 999px 999px 999px 5px;
      transform: rotate(-45deg);
      box-shadow: 0 5px 15px rgba(15,23,42,.28);
      color: #fff;
      font-size: 16px;
      font-weight: 900;
      cursor: pointer;
    }

    .pin > span {
      transform: rotate(45deg);
      line-height: 1;
    }

    .center-pin {
      background: #2563eb;
    }

    .user-pin {
      width: 22px;
      height: 22px;
      border: 4px solid white;
      border-radius: 999px;
      background: #2563eb;
      box-shadow:
        0 0 0 8px rgba(37,99,235,.18),
        0 5px 16px rgba(15,23,42,.25);
    }

    .maplibregl-popup-content {
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(15,23,42,.16);
      color: #0f172a;
      font-size: 12px;
      font-weight: 700;
      padding: 9px 11px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="notice">Loading live response map…</div>

  <script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
  <script>
    const notice = document.getElementById("notice");

    if (!window.maplibregl) {
      notice.textContent =
        "Map library unavailable. Check the browser connection.";
    } else {
      const map = new maplibregl.Map({
        container: "map",
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [
          ${SJDM_CENTER.longitude},
          ${SJDM_CENTER.latitude}
        ],
        zoom: 12.5,
        attributionControl: true,
      });

      map.addControl(
        new maplibregl.NavigationControl(),
        "top-left"
      );

      let incidentMarkers = [];
      let centerMarkers = [];
      let responderMarkers = [];
      let residentMarkers = [];
      let userMarker = null;
      let hasFitted = false;
      let lastLocation = null;

      function validPoint(latitude, longitude) {
        return (
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          Math.abs(latitude) <= 90 &&
          Math.abs(longitude) <= 180
        );
      }

      function incidentColor(severity, status) {
        if (status === "reported") return "#ef4444";
        if (severity === "critical") return "#7f1d1d";
        if (severity === "high") return "#dc2626";
        if (severity === "medium") return "#f59e0b";
        return "#16a34a";
      }

      function makeIncidentElement(item) {
        const element = document.createElement("div");
        element.className = "pin";
        element.style.background = incidentColor(
          item.severity,
          item.status
        );
        element.innerHTML = "<span>!</span>";
        return element;
      }

      function makeCenterElement() {
        const element = document.createElement("div");
        element.className = "pin center-pin";
        element.innerHTML = "<span>⌂</span>";
        return element;
      }

      function makeUserElement() {
        const element = document.createElement("div");
        element.className = "user-pin";
        return element;
      }

      function makeResidentElement() {
        const element = document.createElement("div");
        element.className = "pin";
        element.style.background = "#0f9f85";
        element.innerHTML = "<span>R</span>";
        return element;
      }

      function clearMarkers() {
        for (const marker of incidentMarkers) {
          marker.remove();
        }

        for (const marker of centerMarkers) {
          marker.remove();
        }

        for (const marker of responderMarkers) {
          marker.remove();
        }

        for (const marker of residentMarkers) {
          marker.remove();
        }

        incidentMarkers = [];
        centerMarkers = [];
        responderMarkers = [];
        residentMarkers = [];
      }

      function accuracyGeometry(location) {
        const empty = {
          type: "FeatureCollection",
          features: [],
        };

        if (
          !location ||
          !Number.isFinite(location.accuracy) ||
          location.accuracy < 0
        ) {
          return empty;
        }

        const lat = location.latitude * Math.PI / 180;
        const lng = location.longitude * Math.PI / 180;
        const distance = location.accuracy / 6371008.8;
        const ring = [];

        for (let i = 0; i <= 64; i++) {
          const bearing = i * 2 * Math.PI / 64;

          const y = Math.asin(
            Math.sin(lat) * Math.cos(distance) +
            Math.cos(lat) *
              Math.sin(distance) *
              Math.cos(bearing)
          );

          const x = lng + Math.atan2(
            Math.sin(bearing) *
              Math.sin(distance) *
              Math.cos(lat),
            Math.cos(distance) -
              Math.sin(lat) * Math.sin(y)
          );

          ring.push([
            x * 180 / Math.PI,
            y * 180 / Math.PI
          ]);
        }

        return {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [ring],
          },
        };
      }

      function updateLocation(location, follow) {
        lastLocation = location;

        if (
          !location ||
          !validPoint(location.latitude, location.longitude)
        ) {
          if (userMarker) {
            userMarker.remove();
          }

          userMarker = null;

          map.getSource("gps-accuracy")?.setData({
            type: "FeatureCollection",
            features: [],
          });

          return;
        }

        if (!userMarker) {
          userMarker = new maplibregl.Marker({
            element: makeUserElement(),
          })
            .setLngLat([
              location.longitude,
              location.latitude
            ])
            .setPopup(
              new maplibregl.Popup({
                offset: 18,
              }).setText("Your latest location")
            )
            .addTo(map);
        }

        userMarker.setLngLat([
          location.longitude,
          location.latitude
        ]);

        map.getSource("gps-accuracy")?.setData(
          accuracyGeometry(location)
        );

        if (follow) {
          map.easeTo({
            center: [
              location.longitude,
              location.latitude
            ],
            duration: 500,
          });
        }
      }

      function render(payload) {
        clearMarkers();

        const bounds = new maplibregl.LngLatBounds();
        let pointCount = 0;

        for (const item of payload.incidents || []) {
          if (!validPoint(item.latitude, item.longitude)) {
            continue;
          }

          const element = makeIncidentElement(item);

          element.addEventListener("click", () => {
            parent.postMessage(
              {
                kind: "select-map-item",
                entityType: "incident",
                id: item.id,
              },
              "*"
            );
          });

          const popup = new maplibregl.Popup({
            offset: 22,
            closeButton: false,
          }).setText(
            (item.title || "Disaster case") +
            " · " +
            String(item.status || "reported")
              .replaceAll("_", " ")
          );

          const marker = new maplibregl.Marker({ element })
            .setLngLat([
              item.longitude,
              item.latitude
            ])
            .setPopup(popup)
            .addTo(map);

          incidentMarkers.push(marker);
          bounds.extend([
            item.longitude,
            item.latitude
          ]);
          pointCount += 1;
        }

        for (const item of payload.centers || []) {
          if (!validPoint(item.latitude, item.longitude)) {
            continue;
          }

          const element = makeCenterElement();

          element.addEventListener("click", () => {
            parent.postMessage(
              {
                kind: "select-map-item",
                entityType: "center",
                id: item.id,
              },
              "*"
            );
          });

          const popup = new maplibregl.Popup({
            offset: 22,
            closeButton: false,
          }).setText(item.name || "Evacuation center");

          const marker = new maplibregl.Marker({ element })
            .setLngLat([
              item.longitude,
              item.latitude
            ])
            .setPopup(popup)
            .addTo(map);

          centerMarkers.push(marker);
          bounds.extend([
            item.longitude,
            item.latitude
          ]);
          pointCount += 1;
        }

        for (const person of payload.responders || []) {
          if (
            !validPoint(person.latitude, person.longitude)
          ) {
            continue;
          }

          const element = makeCenterElement();

          element.style.background = person.stale
            ? "#64748b"
            : "#7c3aed";

          element.innerHTML = "<span>V</span>";

          const marker = new maplibregl.Marker({ element })
            .setLngLat([
              person.longitude,
              person.latitude
            ])
            .setPopup(
              new maplibregl.Popup({
                offset: 22,
              }).setText(
                person.name +
                (
                  person.stale
                    ? " · older reading · "
                    : " · shared · "
                ) +
                new Date(person.lastShared)
                  .toLocaleTimeString()
              )
            )
            .addTo(map);

          responderMarkers.push(marker);
          bounds.extend([
            person.longitude,
            person.latitude
          ]);
          pointCount += 1;
        }

        for (const person of payload.residents || []) {
          if (
            !validPoint(person.latitude, person.longitude)
          ) {
            continue;
          }

          const element = makeResidentElement();

          element.style.background = person.stale
            ? "#64748b"
            : "#0f9f85";

          const marker = new maplibregl.Marker({ element })
            .setLngLat([
              person.longitude,
              person.latitude
            ])
            .setPopup(
              new maplibregl.Popup({
                offset: 22,
              }).setText(
                (person.name || "Resident") +
                (
                  person.stale
                    ? " · older resident location · "
                    : " · resident live location · "
                ) +
                new Date(person.lastShared)
                  .toLocaleTimeString()
              )
            )
            .addTo(map);

          residentMarkers.push(marker);
          bounds.extend([
            person.longitude,
            person.latitude
          ]);
          pointCount += 1;
        }

        if (
          lastLocation &&
          validPoint(
            lastLocation.latitude,
            lastLocation.longitude
          )
        ) {
          bounds.extend([
            lastLocation.longitude,
            lastLocation.latitude
          ]);
          pointCount += 1;
        }

        if (
          (payload.fit || !hasFitted) &&
          pointCount > 0
        ) {
          map.fitBounds(bounds, {
            padding: 55,
            maxZoom: 16,
            duration: 600,
          });

          hasFitted = true;
        }
      }

      window.addEventListener("message", (event) => {
        if (event.source !== parent) return;

        const data = event.data;

        if (data?.kind === "set-map-data") {
          render(data);
        } else if (
          data?.kind === "update-user-location"
        ) {
          updateLocation(
            data.location,
            data.follow === true
          );
        }
      });

      map.on("load", () => {
        map.addSource("gps-accuracy", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });

        map.addLayer({
          id: "gps-accuracy-fill",
          type: "fill",
          source: "gps-accuracy",
          paint: {
            "fill-color": "#2563eb",
            "fill-opacity": 0.12,
          },
        });

        map.addLayer({
          id: "gps-accuracy-outline",
          type: "line",
          source: "gps-accuracy",
          paint: {
            "line-color": "#2563eb",
            "line-width": 1.5,
            "line-opacity": 0.6,
          },
        });

        notice.style.display = "none";

        parent.postMessage(
          { kind: "response-map-ready" },
          "*"
        );
      });

      map.on("error", (event) => {
        console.error(
          "Map error",
          event?.error || event
        );
      });
    }
  </script>
</body>
</html>
`;

function numericCoordinate(value: unknown) {
  const number =
    typeof value === "number" ? value : Number(value);

  return Number.isFinite(number) ? number : null;
}

function hasCoordinates(item: {
  latitude?: number | null;
  longitude?: number | null;
}) {
  const latitude = numericCoordinate(item.latitude);
  const longitude = numericCoordinate(item.longitude);

  return (
    latitude !== null &&
    longitude !== null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function coordinateLabel(item: {
  latitude?: number | null;
  longitude?: number | null;
}) {
  const latitude = numericCoordinate(item.latitude);
  const longitude = numericCoordinate(item.longitude);

  if (
    latitude === null ||
    longitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return "Not captured";
  }

  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function timestampMillis(value: any) {
  return value?.toMillis?.() || 0;
}

function statusLabel(value?: string) {
  return String(value || "reported")
    .replaceAll("_", " ")
    .toUpperCase();
}

function safeHttpUrl(value: unknown) {
  const url = String(value ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function initialsFor(name?: string) {
  const parts = String(name || "Resident")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "R";

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function verificationLabel(value?: string) {
  const normalized = normalize(value);

  if (["verified", "validated", "approved"].includes(normalized)) {
    return "ADMIN VERIFIED";
  }

  if (["pending", "pending_review", "pending_verification"].includes(normalized)) {
    return "VERIFICATION PENDING";
  }

  if (["rejected", "declined"].includes(normalized)) {
    return "VERIFICATION REJECTED";
  }

  return value ? statusLabel(value) : "VERIFICATION NOT RECORDED";
}

export default function WebMapTracking() {
  const { user, profile, loading } = useUserSession();
  const router = useRouter();

  const params = useLocalSearchParams<{
    caseId?: string;
  }>();

  const focusedCaseId =
    typeof params.caseId === "string" ? params.caseId : "";

  const isAdministrator = ["admin", "superadmin"].includes(
    profile?.role || "",
  );

  const isVolunteerMode =
    activeModeForProfile(profile) === "volunteer" &&
    hasVolunteerAccess(profile);

  const missionMode =
    !!focusedCaseId && isVolunteerMode && !isAdministrator;

  const isResidentMode =
    !isAdministrator && !isVolunteerMode;

  const isFocused = useIsFocused();

  const [tracking, setTracking] = useState(false);
  const [followMe, setFollowMe] = useState(true);
  const [gpsError, setGpsError] = useState("");
  const [clock, setClock] = useState(Date.now());

  const frame = useRef<HTMLIFrameElement>(null);
  const firstFit = useRef(false);

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [centers, setCenters] = useState<CenterRow[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const [userLocation, setUserLocation] =
    useState<BrowserLocation | null>(null);

  const [locating, setLocating] = useState(false);
  const [search, setSearch] = useState("");
  const [showIncidents, setShowIncidents] = useState(true);
  const [showCenters, setShowCenters] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const [selected, setSelected] =
    useState<SelectedMapItem>(null);

  const [error, setError] = useState("");

  const [residentAssignments, setResidentAssignments] =
    useState<any[]>([]);
  const [residentResponderLocations, setResidentResponderLocations] =
    useState<any[]>([]);
  const [residentSharedLocations, setResidentSharedLocations] =
    useState<any[]>([]);
  const [residentShareCaseId, setResidentShareCaseId] =
    useState("");
  const [residentShareSentAt, setResidentShareSentAt] =
    useState(0);
  const [liveNow, setLiveNow] = useState(Date.now());

  const latestUserLocation = useRef<BrowserLocation | null>(null);
  const residentWriteQueue = useRef<Promise<unknown>>(
    Promise.resolve(),
  );

  latestUserLocation.current = userLocation;

  const flow = useResponseFlow(
    user,
    profile,
    cases,
    userLocation,
    tracking,
    setTracking,
    isFocused,
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => setLiveNow(Date.now()),
      10000,
    );

    return () => window.clearInterval(timer);
  }, []);

  const missionAssignment = useMemo(
    () =>
      missionMode
        ? flow.assignments.find(
            (assignment) =>
              assignment.caseId === focusedCaseId &&
              [
                "accepted",
                "responding",
                "on_site",
                "completed",
              ].includes(normalize(assignment.status)),
          ) || null
        : null,
    [flow.assignments, missionMode, focusedCaseId],
  );

  const missionAssignmentStatus = normalize(
    missionAssignment?.status,
  );

  // If a volunteer opens the generic Live Response Map while an accepted or
  // active mission exists, take them straight back to that mission instead of
  // showing an empty generic volunteer map.
  useEffect(() => {
    if (
      !isVolunteerMode ||
      isAdministrator ||
      focusedCaseId ||
      loading
    ) {
      return;
    }

    const activeAssignment = flow.assignments.find(
      (assignment) =>
        typeof assignment.caseId === "string" &&
        ["accepted", "responding", "on_site"].includes(
          normalize(assignment.status),
        ),
    );

    if (activeAssignment?.caseId) {
      router.replace(
        `/map-tracking?caseId=${encodeURIComponent(
          activeAssignment.caseId,
        )}` as any,
      );
    }
  }, [
    flow.assignments,
    isVolunteerMode,
    isAdministrator,
    focusedCaseId,
    loading,
    router,
  ]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow
      ) {
        return;
      }

      const data = event.data;

      if (data?.kind === "response-map-ready") {
        firstFit.current = false;
        setMapReady(true);
        return;
      }

      if (
        data?.kind === "select-map-item" &&
        (
          data.entityType === "incident" ||
          data.entityType === "center"
        ) &&
        typeof data.id === "string"
      ) {
        setSelected({
          kind: data.entityType,
          id: data.id,
        });
      }
    };

    window.addEventListener("message", receive);

    return () =>
      window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    if (
      !user ||
      !profile ||
      !isApprovedProfile(profile)
    ) {
      setCases([]);
      setError("");
      return;
    }

    // Volunteer emergency response is mission-scoped.
    // Read the exact assigned case document instead of querying the
    // whole disasterCases collection. This matches Firestore's
    // document-level authorization and avoids exposing unrelated cases.
    if (missionMode) {
      const caseRef = doc(db, "disasterCases", focusedCaseId);

      return onSnapshot(
        caseRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            setCases([]);
            setError("Assigned incident was not found.");
            return;
          }

          setCases([
            {
              id: snapshot.id,
              ...(snapshot.data() as Omit<CaseRow, "id">),
            },
          ]);
          setError("");
        },
        (cause) => {
          console.error("assigned disaster case listener", cause);
          setCases([]);
          setError(
            "Could not open this assigned incident. Check that this volunteer is assigned to the case and that Firestore rules are deployed.",
          );
        },
      );
    }

    // A volunteer should not browse exact resident incident data from a
    // generic map. Emergency cases are opened from Volunteer Tasks.
    if (isVolunteerMode && !isAdministrator) {
      setCases([]);
      setError("");
      return;
    }

    const casesQuery = isAdministrator
      ? query(collection(db, "disasterCases"))
      : query(
          collection(db, "disasterCases"),
          where("reporterUid", "==", user.uid),
        );

    return onSnapshot(
      casesQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<CaseRow, "id">),
          }))
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() || 0) -
              (a.createdAt?.toMillis?.() || 0),
          );

        setCases(next);
        setError("");
      },
      (cause) => {
        console.error("disasterCases map listener", cause);
        setError(
          "Could not load disaster cases. Check Firestore permissions and your connection.",
        );
      },
    );
  }, [
    profile,
    user,
    isAdministrator,
    isVolunteerMode,
    missionMode,
    focusedCaseId,
  ]);

  useEffect(() => {
    if (missionMode) {
      setCenters([]);
      return;
    }

    return onSnapshot(
      collection(db, "evacuation_centers"),
      (snapshot) => {
        setCenters(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<CenterRow, "id">),
          })),
        );
      },
      (cause) => {
        console.error(
          "evacuation_centers map listener",
          cause,
        );

        setError(
          "Could not load evacuation centers. Check Firestore permissions and your connection.",
        );
      },
    );
  }, [missionMode]);

  const visibleCases = useMemo(() => {
    if (missionMode) {
      return cases.filter(
        (item) =>
          item.id === focusedCaseId &&
          hasCoordinates(item) &&
          normalize(item.status) !== "closed",
      );
    }

    if (!showIncidents) return [];

    const needle = normalize(search);

    return cases.filter((item) => {
      if (!hasCoordinates(item)) return false;

      const status = normalize(
        item.status || "reported",
      );

      if (status === "closed") return false;

      if (
        !showResolved &&
        status === "resolved"
      ) {
        return false;
      }

      if (!needle) return true;

      return [
        item.title,
        item.category,
        item.location,
        item.severity,
        item.status,
      ]
        .map(normalize)
        .some((value) => value.includes(needle));
    });
  }, [
    cases,
    search,
    showIncidents,
    showResolved,
    missionMode,
    focusedCaseId,
  ]);

  const visibleCenters = useMemo(() => {
    if (missionMode || !showCenters) return [];

    const needle = normalize(search);

    return centers.filter((item) => {
      if (!hasCoordinates(item)) return false;
      if (!needle) return true;

      return [
        item.name,
        item.address,
        item.barangay,
        item.status,
      ]
        .map(normalize)
        .some((value) => value.includes(needle));
    });
  }, [centers, search, showCenters, missionMode]);

  const missionCase = useMemo(
    () =>
      missionMode
        ? cases.find((item) => item.id === focusedCaseId) || null
        : null,
    [cases, missionMode, focusedCaseId],
  );

  useEffect(() => {
    if (missionMode && missionCase) {
      setSelected({
        kind: "incident",
        id: missionCase.id,
      });
    }
  }, [missionMode, missionCase?.id]);

  const selectedCase = useMemo(() => {
    if (missionMode) {
      return missionCase;
    }

    if (selected?.kind !== "incident") {
      return null;
    }

    return (
      cases.find(
        (item) => item.id === selected.id,
      ) || null
    );
  }, [cases, selected, missionMode, missionCase]);

  const selectedCenter = useMemo(() => {
    if (selected?.kind !== "center") {
      return null;
    }

    return (
      centers.find(
        (item) => item.id === selected.id,
      ) || null
    );
  }, [centers, selected]);

  // Resident convenience: open the most relevant active request automatically
  // so the assigned responder status and live location are immediately visible.
  useEffect(() => {
    if (!isResidentMode || selected || cases.length === 0) {
      return;
    }

    const active =
      cases.find((item) =>
        ["assigned", "in_progress"].includes(
          normalize(item.status),
        ),
      ) ||
      cases.find((item) =>
        ["validated", "reported"].includes(
          normalize(item.status),
        ),
      );

    if (active) {
      setSelected({
        kind: "incident",
        id: active.id,
      });
    }
  }, [isResidentMode, cases, selected]);

  const residentCoordinationCaseId = isResidentMode
    ? residentShareCaseId || selectedCase?.id || ""
    : "";

  const residentCoordinationCase = useMemo(
    () =>
      residentCoordinationCaseId
        ? cases.find(
            (item) => item.id === residentCoordinationCaseId,
          ) || null
        : null,
    [cases, residentCoordinationCaseId],
  );

  // A resident reads assignments only for their own selected case.
  useEffect(() => {
    setResidentAssignments([]);

    if (
      !isResidentMode ||
      !user ||
      !profile ||
      !isApprovedProfile(profile) ||
      !residentCoordinationCaseId
    ) {
      return;
    }

    const assignmentsQuery = query(
      collection(db, "responseAssignments"),
      where("caseId", "==", residentCoordinationCaseId),
    );

    return onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        setResidentAssignments(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        );
      },
      (cause) => {
        console.error("resident response assignments", cause);
        setResidentAssignments([]);
      },
    );
  }, [
    isResidentMode,
    user?.uid,
    profile,
    residentCoordinationCaseId,
  ]);

  const residentPrimaryAssignment = useMemo(() => {
    if (!residentCoordinationCaseId) return null;

    const rows = residentAssignments.filter(
      (assignment) =>
        assignment.caseId === residentCoordinationCaseId,
    );

    for (const status of [
      "on_site",
      "responding",
      "accepted",
      "completed",
      "offered",
      "declined",
      "cancelled",
    ]) {
      const match = rows.find(
        (assignment) =>
          normalize(assignment.status) === status,
      );

      if (match) return match;
    }

    return rows[0] || null;
  }, [
    residentAssignments,
    residentCoordinationCaseId,
  ]);

  const residentShareAssignment = useMemo(
    () =>
      residentAssignments.find(
        (assignment) =>
          assignment.caseId === residentCoordinationCaseId &&
          ["accepted", "responding", "on_site"].includes(
            normalize(assignment.status),
          ),
      ) || null,
    [
      residentAssignments,
      residentCoordinationCaseId,
    ],
  );

  // Resident sees only the live GPS documents of responders actively assigned
  // to the selected case. Each document id is the volunteer uid.
  useEffect(() => {
    setResidentResponderLocations([]);

    if (!isResidentMode || !residentCoordinationCaseId) {
      return;
    }

    const activeAssignments = residentAssignments.filter(
      (assignment) =>
        assignment.caseId === residentCoordinationCaseId &&
        ["responding", "on_site"].includes(
          normalize(assignment.status),
        ) &&
        typeof assignment.volunteerId === "string" &&
        assignment.volunteerId,
    );

    if (activeAssignments.length === 0) {
      return;
    }

    const disposers = activeAssignments.map(
      (assignment) =>
        onSnapshot(
          doc(
            db,
            "responseLocations",
            assignment.volunteerId,
          ),
          (snapshot) => {
            setResidentResponderLocations((current) => {
              const next = current.filter(
                (item) =>
                  item.id !== assignment.volunteerId,
              );

              if (!snapshot.exists()) {
                return next;
              }

              const data = snapshot.data();

              if (
                data.caseId !== residentCoordinationCaseId ||
                data.volunteerId !== assignment.volunteerId
              ) {
                return next;
              }

              return [
                ...next,
                {
                  id: snapshot.id,
                  ...data,
                },
              ];
            });
          },
          (cause) => {
            console.error(
              "resident responder location",
              cause,
            );
          },
        ),
    );

    return () => {
      disposers.forEach((dispose) => dispose());
    };
  }, [
    isResidentMode,
    residentAssignments,
    residentCoordinationCaseId,
  ]);

  const residentResponderPins = useMemo(
    () =>
      residentResponderLocations
        .map((point) => {
          const assignment = residentAssignments.find(
            (item) =>
              item.volunteerId === point.volunteerId &&
              item.caseId === point.caseId,
          );

          const lastShared = timestampMillis(
            point.updatedAt,
          );

          return {
            ...point,
            name:
              assignment?.volunteerName ||
              "Assigned responder",
            lastShared,
            stale:
              lastShared > 0 &&
              liveNow - lastShared > 30000,
          };
        })
        .filter(
          (point) =>
            point.caseId === residentCoordinationCaseId &&
            Number.isFinite(point.latitude) &&
            Number.isFinite(point.longitude) &&
            point.lastShared > 0 &&
            liveNow - point.lastShared < 120000,
        ),
    [
      residentResponderLocations,
      residentAssignments,
      residentCoordinationCaseId,
      liveNow,
    ],
  );

  // Admin can see all opt-in resident live locations. An assigned volunteer
  // can see only the resident attached to the current mission.
  useEffect(() => {
    setResidentSharedLocations([]);

    if (
      !user ||
      !profile ||
      !isApprovedProfile(profile)
    ) {
      return;
    }

    if (isAdministrator) {
      return onSnapshot(
        collection(db, "residentResponseLocations"),
        (snapshot) =>
          setResidentSharedLocations(
            snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })),
          ),
        (cause) => {
          console.error(
            "admin resident live locations",
            cause,
          );
          setResidentSharedLocations([]);
        },
      );
    }

    if (
      missionMode &&
      missionCase?.reporterUid &&
      missionAssignment &&
      ["accepted", "responding", "on_site"].includes(
        missionAssignmentStatus,
      )
    ) {
      return onSnapshot(
        doc(
          db,
          "residentResponseLocations",
          missionCase.reporterUid,
        ),
        (snapshot) => {
          if (!snapshot.exists()) {
            setResidentSharedLocations([]);
            return;
          }

          const data = snapshot.data();

          if (
            data.caseId !== focusedCaseId ||
            data.residentId !== missionCase.reporterUid
          ) {
            setResidentSharedLocations([]);
            return;
          }

          setResidentSharedLocations([
            {
              id: snapshot.id,
              ...data,
            },
          ]);
        },
        (cause) => {
          console.error(
            "volunteer resident live location",
            cause,
          );
          setResidentSharedLocations([]);
        },
      );
    }
  }, [
    user?.uid,
    profile,
    isAdministrator,
    missionMode,
    missionCase?.reporterUid,
    missionAssignment?.id,
    missionAssignmentStatus,
    focusedCaseId,
  ]);

  const residentLivePins = useMemo(
    () =>
      residentSharedLocations
        .map((point) => {
          const incident =
            cases.find(
              (item) => item.id === point.caseId,
            ) || missionCase;

          const lastShared = timestampMillis(
            point.updatedAt,
          );

          return {
            ...point,
            name:
              incident?.reporterName ||
              "Resident",
            lastShared,
            stale:
              lastShared > 0 &&
              liveNow - lastShared > 30000,
          };
        })
        .filter(
          (point) =>
            Number.isFinite(point.latitude) &&
            Number.isFinite(point.longitude) &&
            point.lastShared > 0 &&
            liveNow - point.lastShared < 120000,
        ),
    [
      residentSharedLocations,
      cases,
      missionCase,
      liveNow,
    ],
  );

  const mapResponderPins = isResidentMode
    ? residentResponderPins
    : flow.responders;

  const residentShareCanPublish =
    isResidentMode &&
    !!user &&
    !!residentShareCaseId &&
    !!residentCoordinationCase &&
    !!residentShareAssignment &&
    tracking &&
    isFocused &&
    ["assigned", "in_progress"].includes(
      normalize(residentCoordinationCase.status),
    ) &&
    ["accepted", "responding", "on_site"].includes(
      normalize(residentShareAssignment.status),
    );

  // Optional resident live GPS. This is separate from the fixed emergency pin
  // and is written only after the resident explicitly enables sharing.
  useEffect(() => {
    if (
      !residentShareCanPublish ||
      !user ||
      !residentShareAssignment
    ) {
      return;
    }

    let stopped = false;
    let pending = false;

    const locationRef = doc(
      db,
      "residentResponseLocations",
      user.uid,
    );

    const assignmentId = residentShareAssignment.id;
    const caseId = residentShareCaseId;

    setResidentShareSentAt(0);

    const publish = () => {
      const point = latestUserLocation.current;

      if (
        stopped ||
        pending ||
        !point ||
        Date.now() - point.timestamp > 30000
      ) {
        return;
      }

      pending = true;

      residentWriteQueue.current =
        residentWriteQueue.current
          .catch(() => {})
          .then(async () => {
            if (stopped) return;

            await setDoc(locationRef, {
              residentId: user.uid,
              assignmentId,
              caseId,
              latitude: point.latitude,
              longitude: point.longitude,
              accuracy: point.accuracy,
              updatedAt: serverTimestamp(),
            });

            if (!stopped) {
              setResidentShareSentAt(Date.now());
              setGpsError("");
            }
          })
          .catch((cause) => {
            console.error(
              "resident live location publish",
              cause,
            );

            if (!stopped) {
              setGpsError(
                "Could not share your live location. Check your connection and try again.",
              );
            }
          })
          .finally(() => {
            pending = false;
          });
    };

    publish();

    const timer = window.setInterval(
      publish,
      10000,
    );

    return () => {
      stopped = true;
      window.clearInterval(timer);

      residentWriteQueue.current =
        residentWriteQueue.current
          .catch(() => {})
          .then(() => deleteDoc(locationRef))
          .catch(() => {
            // If offline, Admin/Volunteer hides readings older than two minutes.
          });
    };
  }, [
    residentShareCanPublish,
    user?.uid,
    residentShareAssignment?.id,
    residentShareCaseId,
  ]);

  useEffect(() => {
    if (
      residentShareCaseId &&
      !tracking &&
      !locating
    ) {
      setResidentShareCaseId("");
    }
  }, [
    residentShareCaseId,
    tracking,
    locating,
  ]);

  useEffect(() => {
    if (!residentShareCaseId) return;

    const validCase =
      residentCoordinationCase &&
      ["assigned", "in_progress"].includes(
        normalize(residentCoordinationCase.status),
      );

    const validAssignment =
      residentShareAssignment &&
      ["accepted", "responding", "on_site"].includes(
        normalize(residentShareAssignment.status),
      );

    if (!validCase || !validAssignment || !isFocused) {
      setResidentShareCaseId("");
      setTracking(false);
      setUserLocation(null);
    }
  }, [
    residentShareCaseId,
    residentCoordinationCase?.status,
    residentShareAssignment?.status,
    isFocused,
  ]);

  const beginResidentSharing = () => {
    if (
      !isResidentMode ||
      !selectedCase ||
      !residentShareAssignment ||
      !["assigned", "in_progress"].includes(
        normalize(selectedCase.status),
      )
    ) {
      return;
    }

    setResidentShareCaseId(selectedCase.id);
    setUserLocation(null);
    setFollowMe(true);
    setGpsError("");
    setTracking(true);
  };

  const stopResidentSharing = () => {
    setResidentShareCaseId("");
    setTracking(false);
    setLocating(false);
    setUserLocation(null);
    setGpsError("");

    if (user?.uid) {
      deleteDoc(
        doc(
          db,
          "residentResponseLocations",
          user.uid,
        ),
      ).catch(() => {});
    }
  };

  const residentResponderLastShared =
    residentResponderPins.reduce(
      (latest, point) =>
        Math.max(latest, point.lastShared || 0),
      0,
    );

  const residentDisplayedAssignment =
    isResidentMode &&
    selectedCase?.id === residentCoordinationCaseId
      ? residentPrimaryAssignment
      : null;

  const residentCanStartShare =
    isResidentMode &&
    !!selectedCase &&
    selectedCase.id === residentCoordinationCaseId &&
    !!residentShareAssignment &&
    ["assigned", "in_progress"].includes(
      normalize(selectedCase.status),
    );

  const adminChatAssignment = useMemo(() => {
    if (!isAdministrator || !selectedCase) return null;

    const rows = flow.assignments.filter(
      (assignment) => assignment.caseId === selectedCase.id,
    );

    for (const status of [
      "on_site",
      "responding",
      "accepted",
      "completed",
    ]) {
      const match = rows.find(
        (assignment) => normalize(assignment.status) === status,
      );

      if (match) return match;
    }

    return null;
  }, [
    isAdministrator,
    selectedCase?.id,
    flow.assignments,
  ]);

  const caseChatAssignment = missionMode
    ? missionAssignment
    : isResidentMode
      ? residentDisplayedAssignment
      : isAdministrator
        ? adminChatAssignment
        : null;

  const caseChatAvailable =
    !!selectedCase &&
    !!caseChatAssignment &&
    ["accepted", "responding", "on_site", "completed"].includes(
      normalize(caseChatAssignment.status),
    );

  const caseChatViewerRole: "resident" | "volunteer" | "admin" =
    isAdministrator
      ? "admin"
      : missionMode
        ? "volunteer"
        : "resident";

  const postMapData = (fit: boolean) => {
    frame.current?.contentWindow?.postMessage(
      {
        kind: "set-map-data",
        responders: mapResponderPins,
        residents: residentLivePins,

        incidents: visibleCases.map((item) => ({
          id: item.id,
          title: item.title || "Disaster case",
          status: item.status || "reported",
          severity: item.severity || "medium",
          latitude: numericCoordinate(item.latitude),
          longitude: numericCoordinate(item.longitude),
        })),

        centers: visibleCenters.map((item) => ({
          id: item.id,
          name: item.name || "Evacuation center",
          latitude: numericCoordinate(item.latitude),
          longitude: numericCoordinate(item.longitude),
        })),

        fit,
      },
      "*",
    );
  };

  useEffect(() => {
    if (!mapReady) return;

    const shouldFit = !firstFit.current;

    postMapData(shouldFit);
    firstFit.current = true;
  }, [
    mapReady,
    visibleCases,
    visibleCenters,
    mapResponderPins,
    residentLivePins,
  ]);

  useEffect(() => {
    if (!mapReady) return;

    frame.current?.contentWindow?.postMessage(
      {
        kind: "update-user-location",
        location: userLocation,
        follow: tracking && followMe,
      },
      "*",
    );
  }, [
    mapReady,
    userLocation,
    tracking,
    followMe,
  ]);

  useEffect(() => {
    if (
      !isFocused ||
      !user ||
      !profile ||
      !isApprovedProfile(profile)
    ) {
      setTracking(false);
      setLocating(false);
      setUserLocation(null);
      setResidentShareCaseId("");
    }
  }, [
    isFocused,
    user?.uid,
    profile?.role,
    profile?.status,
  ]);

  useEffect(() => {
    if (
      !tracking ||
      !isFocused ||
      !user ||
      !profile ||
      !isApprovedProfile(profile)
    ) {
      return;
    }

    if (
      !window.isSecureContext ||
      !navigator.geolocation
    ) {
      setGpsError(
        "Location requires HTTPS (or localhost) and a supported browser.",
      );

      setTracking(false);
      return;
    }

    let active = true;
    let watchId: number | null = null;

    setLocating(true);
    setGpsError("");

    const stopForPageExit = () => {
      active = false;

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }

      setTracking(false);
      setLocating(false);
    };

    try {
      watchId =
        navigator.geolocation.watchPosition(
          (position) => {
            if (!active) return;

            const {
              latitude,
              longitude,
              accuracy,
            } = position.coords;

            if (
              !Number.isFinite(latitude) ||
              !Number.isFinite(longitude) ||
              Math.abs(latitude) > 90 ||
              Math.abs(longitude) > 180
            ) {
              setGpsError(
                "Invalid location reading. Waiting for a new reading.",
              );
              return;
            }

            setUserLocation({
              latitude,
              longitude,
              accuracy:
                Number.isFinite(accuracy) &&
                accuracy >= 0
                  ? accuracy
                  : null,
              timestamp: Number.isFinite(
                position.timestamp,
              )
                ? position.timestamp
                : Date.now(),
            });

            setClock(Date.now());
            setLocating(false);
            setGpsError("");
          },
          (cause) => {
            if (!active) return;

            setLocating(false);

            if (cause.code === 1) {
              active = false;

              if (watchId !== null) {
                navigator.geolocation.clearWatch(
                  watchId,
                );
              }

              setTracking(false);

              setGpsError(
                "Location permission denied. Allow location in browser settings, then start again.",
              );
            } else {
              setGpsError(
                cause.code === 3
                  ? "Location timed out. Waiting for another reading; the last pin may be outdated."
                  : "Location unavailable. Waiting for another reading; the last pin may be outdated.",
              );
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          },
        );
    } catch {
      active = false;
      setTracking(false);
      setLocating(false);

      setGpsError(
        "Could not start location tracking. Check browser location permissions.",
      );
    }

    const timer = window.setInterval(
      () => setClock(Date.now()),
      10000,
    );

    window.addEventListener(
      "pagehide",
      stopForPageExit,
    );

    return () => {
      active = false;

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }

      window.clearInterval(timer);

      window.removeEventListener(
        "pagehide",
        stopForPageExit,
      );
    };
  }, [
    tracking,
    isFocused,
    user?.uid,
    profile?.role,
    profile?.status,
  ]);

  const toggleTracking = () => {
    if (tracking) {
      if (residentShareCaseId) {
        stopResidentSharing();
        return;
      }

      setTracking(false);
      setLocating(false);
      setGpsError("");
    } else {
      setUserLocation(null);
      setFollowMe(true);
      setGpsError("");
      setTracking(true);
    }
  };

  if (loading) {
    return (
      <main className="response-map-page">
        <style>{css}</style>

        <section className="state-card">
          Loading live response map…
        </section>
      </main>
    );
  }

  if (
    !user ||
    !profile ||
    !isApprovedProfile(profile)
  ) {
    return (
      <main className="response-map-page">
        <style>{css}</style>

        <section className="state-card">
          <h1>Approved account required</h1>

          <p>
            Sign in with an approved VolunServe account
            to open the response map.
          </p>

          <a href="/login">Go to sign in</a>
        </section>
      </main>
    );
  }

  const roleDescription = isAdministrator
    ? "Admin view · active disaster cases and responder positions"
    : missionMode
      ? "Assigned mission · exact incident location and response controls"
      : isVolunteerMode
        ? "Volunteer response workspace · open a mission from Volunteer Tasks"
        : "Resident view · track your assigned responder and optionally share your live location";

  return (
    <main className="response-map-page">
      <style>{css}</style>

      <header className="map-header">
        <div>
          <span className="eyebrow">
            {missionMode
              ? "VOLUNSERVE · ACTIVE EMERGENCY RESPONSE"
              : "VOLUNSERVE · LIVE RESPONSE MAP"}
          </span>

          <h1>
            {missionMode ? "Response Map" : "Map Tracking"}
          </h1>
          <p>{roleDescription}</p>
        </div>

        <div className="live-badge">
          <span />
          LIVE FIRESTORE
        </div>
      </header>

      <ResponsePanel
        flow={flow}
        cases={cases}
      />

      {missionMode ? (
        <section
          className="toolbar mission-toolbar"
          aria-label="Mission map controls"
        >
          <div className="mission-toolbar-copy">
            <strong>
              {missionCase?.title || "Assigned emergency"}
            </strong>
            <span>
              {missionCase && hasCoordinates(missionCase)
                ? `GPS destination · ${coordinateLabel(missionCase)}`
                : missionCase?.location ||
                  missionCase?.reporterAddress ||
                  "Waiting for incident GPS…"}
            </span>
          </div>

          <div className="toolbar-actions">
            <button
              type="button"
              className={
                followMe && tracking
                  ? "chip active"
                  : "chip"
              }
              aria-pressed={followMe && tracking}
              disabled={!tracking}
              onClick={() =>
                setFollowMe((value) => !value)
              }
            >
              Follow Me:{" "}
              {followMe && tracking ? "On" : "Off"}
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setFollowMe(false);
                postMapData(true);
              }}
              disabled={!missionCase}
            >
              Fit mission
            </button>
          </div>
        </section>
      ) : (
        <section
          className="toolbar"
          aria-label="Map controls"
        >
          <label className="search-box">
            <span>⌕</span>

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search incident, barangay or evacuation center…"
              aria-label="Search map"
            />
          </label>

          <div className="filter-group">
            <button
              type="button"
              className={
                showIncidents
                  ? "chip active danger"
                  : "chip"
              }
              onClick={() =>
                setShowIncidents((value) => !value)
              }
            >
              ● Incidents
            </button>

            <button
              type="button"
              className={
                showCenters
                  ? "chip active blue"
                  : "chip"
              }
              onClick={() =>
                setShowCenters((value) => !value)
              }
            >
              ◆ Evacuation centers
            </button>

            <button
              type="button"
              className={
                showResolved
                  ? "chip active"
                  : "chip"
              }
              onClick={() =>
                setShowResolved((value) => !value)
              }
            >
              ✓ Resolved
            </button>
          </div>

          <div className="toolbar-actions">
            {!isResidentMode && (
              <button
                type="button"
                className="secondary-button"
                onClick={toggleTracking}
                aria-pressed={tracking}
              >
                {tracking
                  ? "■ Stop Tracking"
                  : "◎ Start Tracking"}
              </button>
            )}

            <button
              type="button"
              className={
                followMe && tracking
                  ? "chip active"
                  : "chip"
              }
              aria-pressed={followMe && tracking}
              disabled={!tracking}
              onClick={() =>
                setFollowMe((value) => !value)
              }
            >
              Follow Me:{" "}
              {followMe && tracking ? "On" : "Off"}
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setFollowMe(false);
                postMapData(true);
              }}
            >
              Fit visible pins
            </button>
          </div>
        </section>
      )}

      {error && (
        <div
          className="error"
          role="alert"
        >
          {error}
        </div>
      )}

      <div
        className="tracking-status"
        role="status"
      >
        <strong>
          {tracking
            ? locating
              ? "Finding your location…"
              : residentShareCaseId
                ? "Resident live GPS active"
                : missionMode
                  ? "Response GPS active"
                  : "Tracking started"
            : missionMode
              ? missionAssignmentStatus === "completed"
                ? "Mission completed"
                : ["responding", "on_site"].includes(
                      missionAssignmentStatus,
                    )
                  ? "Response GPS paused"
                  : "Response GPS off"
              : residentShareCaseId
                ? "Resident live GPS paused"
                : "Tracking stopped"}
        </strong>

        <span>
          {residentShareCanPublish
            ? residentShareSentAt
              ? "Your live location is shared only with the assigned responder and authorized Admin · last sent " +
                new Date(residentShareSentAt).toLocaleTimeString("en-PH")
              : "Resident live sharing started · waiting for a fresh GPS reading…"
            : flow.canShare
              ? "Live volunteer location is being shared with authorized Admin."
              : missionMode
                ? missionAssignmentStatus === "completed"
                  ? "Mission completed · live GPS sharing ended automatically."
                  : ["responding", "on_site"].includes(
                        missionAssignmentStatus,
                      )
                    ? "GPS sharing is paused. Press Resume sharing to continue."
                    : missionAssignmentStatus === "accepted"
                      ? "GPS is not shared until you press Respond & Share GPS."
                      : "GPS sharing is currently off for this mission."
                : isResidentMode
                  ? "Select your emergency case to view responder status. Live location sharing is optional."
                  : "Local map only · location is not shared with admin."}
        </span>

        {userLocation &&
          !(missionMode && missionAssignmentStatus === "completed") && (
          <span>
            {tracking
              ? "Last reading"
              : "Last known location"}
            :{" "}
            {new Date(
              userLocation.timestamp,
            ).toLocaleTimeString("en-PH")}

            {userLocation.accuracy !== null
              ? " · Accuracy ±" +
                Math.round(userLocation.accuracy) +
                " m"
              : ""}

            {tracking &&
            clock - userLocation.timestamp > 60000
              ? " · No recent reading"
              : ""}
          </span>
        )}

        {gpsError && (
          <span className="gps-error">
            {gpsError}
          </span>
        )}
      </div>

      <section className="map-layout">
        <div className="map-card">
          <iframe
            ref={frame}
            title="VolunServe live disaster response map"
            srcDoc={mapDocument}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />

          <div className="legend">
            <strong>Map Legend</strong>

            {(flow.admin || isResidentMode) && (
              <span>
                <i
                  className="legend-dot"
                  style={{
                    background: "#7c3aed",
                  }}
                />
                {isResidentMode
                  ? "Assigned responder"
                  : "Shared volunteer"}
              </span>
            )}

            {(flow.admin || missionMode) && (
              <span>
                <i
                  className="legend-dot"
                  style={{
                    background: "#0f9f85",
                  }}
                />
                Resident live location
              </span>
            )}

            <span>
              <i className="legend-dot incident" />
              {missionMode
                ? "Assigned incident"
                : isResidentMode
                  ? "Your emergency case"
                  : "Disaster case"}
            </span>

            {!missionMode && (
              <span>
                <i className="legend-dot center" />
                Evacuation center
              </span>
            )}

            {(!isResidentMode || tracking) && (
              <span>
                <i className="legend-dot me" />
                My location
              </span>
            )}
          </div>
        </div>

        <aside className="details-card">
          {selectedCase ? (
            <>
              <span
                className={`severity severity-${normalize(
                  selectedCase.severity || "medium",
                )}`}
              >
                {String(
                  selectedCase.severity || "medium",
                ).toUpperCase()}
              </span>

              <h2>
                {selectedCase.title || "Disaster case"}
              </h2>

              <p className="detail-type">
                {selectedCase.category ||
                  "Uncategorized incident"}
              </p>

              {isResidentMode && (
                <div className="resident-response-card">
                  <div className="resident-response-head">
                    <div>
                      <strong>Response coordination</strong>
                      <span>
                        {residentDisplayedAssignment
                          ? residentDisplayedAssignment.volunteerName ||
                            "Assigned responder"
                          : "Waiting for an assigned responder"}
                      </span>
                    </div>

                    {residentDisplayedAssignment && (
                      <span className="resident-response-status">
                        {statusLabel(
                          residentDisplayedAssignment.status,
                        )}
                      </span>
                    )}
                  </div>

                  {residentDisplayedAssignment ? (
                    <>
                      <p>
                        {["responding", "on_site"].includes(
                          normalize(
                            residentDisplayedAssignment.status,
                          ),
                        )
                          ? residentResponderLastShared
                            ? "Responder live location updated " +
                              new Date(
                                residentResponderLastShared,
                              ).toLocaleTimeString("en-PH") +
                              "."
                            : "Responder GPS is active, but no fresh location is available yet."
                          : normalize(
                                residentDisplayedAssignment.status,
                              ) === "accepted"
                            ? "The responder accepted your request. Live responder GPS will appear after they start responding."
                            : normalize(
                                  residentDisplayedAssignment.status,
                                ) === "completed"
                              ? "The responder completed the mission. Live GPS sharing has ended."
                              : "Admin is coordinating this response."}
                      </p>

                      {residentCanStartShare && (
                        <div className="resident-share-actions">
                          {residentShareCaseId === selectedCase.id ? (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={stopResidentSharing}
                            >
                              ■ Stop sharing my live location
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="primary-button"
                              onClick={beginResidentSharing}
                            >
                              ◎ Share My Live Location
                            </button>
                          )}

                          <small>
                            Optional. Only your assigned responder and
                            authorized Admin can see this moving pin while
                            the response is active.
                          </small>
                        </div>
                      )}
                    </>
                  ) : (
                    <p>
                      Your fixed emergency location remains on the map.
                      Live responder tracking becomes available after an
                      assigned volunteer accepts and starts responding.
                    </p>
                  )}
                </div>
              )}

              {missionMode && (
                <div className="mission-detail-stack">
                  <div className="resident-identity-card">
                    <div className="resident-avatar" aria-hidden="true">
                      {safeHttpUrl(
                        selectedCase.reporterProfilePictureUrl ||
                          selectedCase.profilePictureUrl,
                      ) ? (
                        <img
                          src={safeHttpUrl(
                            selectedCase.reporterProfilePictureUrl ||
                              selectedCase.profilePictureUrl,
                          )}
                          alt=""
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span>
                          {initialsFor(selectedCase.reporterName)}
                        </span>
                      )}
                    </div>

                    <div className="resident-identity-copy">
                      <div className="resident-title-row">
                        <div>
                          <strong>Resident / Reporter</strong>
                          <h3>
                            {selectedCase.reporterName ||
                              "Not provided"}
                          </h3>
                        </div>

                        <span
                          className={`verification-pill verification-${normalize(
                            selectedCase.verificationStatus || "unknown",
                          )}`}
                        >
                          {verificationLabel(
                            selectedCase.verificationStatus,
                          )}
                        </span>
                      </div>

                      <div className="resident-contact-grid">
                        <div>
                          <b>Contact</b>
                          {selectedCase.contactNumber ? (
                            <a
                              href={`tel:${selectedCase.contactNumber}`}
                            >
                              {selectedCase.contactNumber}
                            </a>
                          ) : (
                            <span>No contact number</span>
                          )}
                        </div>

                        <div>
                          <b>Email</b>
                          <span>
                            {selectedCase.reporterEmail ||
                              "Not provided"}
                          </span>
                        </div>

                        <div>
                          <b>Barangay</b>
                          <span>
                            {selectedCase.reporterBarangay ||
                              "Not provided"}
                          </span>
                        </div>

                        <div>
                          <b>Home / saved address</b>
                          <span>
                            {selectedCase.reporterAddress ||
                              "Not provided"}
                          </span>
                        </div>

                        <div>
                          <b>Emergency contact</b>
                          <span>
                            {selectedCase.emergencyContact ||
                              "Not provided"}
                          </span>
                        </div>

                        <div>
                          <b>People affected</b>
                          <span>
                            {selectedCase.affectedPeople ??
                              "Not specified"}
                          </span>
                        </div>
                      </div>

                      {!safeHttpUrl(
                        selectedCase.reporterProfilePictureUrl ||
                          selectedCase.profilePictureUrl,
                      ) && (
                        <small className="resident-photo-note">
                          Profile photo not included in this case snapshot.
                        </small>
                      )}
                    </div>
                  </div>

                  <div>
                    <strong>Resident live location</strong>
                    <span>
                      {residentLivePins.length > 0
                        ? "Resident is sharing a live location · last update " +
                          new Date(
                            Math.max(
                              ...residentLivePins.map(
                                (point) => point.lastShared || 0,
                              ),
                            ),
                          ).toLocaleTimeString("en-PH")
                        : "Resident is not sharing a live location. Use the fixed emergency pin as the destination."}
                    </span>
                  </div>

                  <div>
                    <strong>Incident details</strong>
                    <span>
                      {selectedCase.details ||
                        "No additional description"}
                    </span>
                  </div>

                  <div>
                    <strong>Assistance needed</strong>
                    <span>
                      {Array.isArray(
                        selectedCase.assistanceTypes,
                      ) &&
                      selectedCase.assistanceTypes.length
                        ? selectedCase.assistanceTypes.join(
                            ", ",
                          )
                        : selectedCase.needs ||
                          "Not specified"}
                    </span>
                  </div>

                  <div>
                    <strong>Required skills</strong>
                    <span>
                      {Array.isArray(
                        selectedCase.requiredSkills,
                      ) &&
                      selectedCase.requiredSkills.length
                        ? selectedCase.requiredSkills.join(
                            ", ",
                          )
                        : "Not specified"}
                    </span>
                  </div>

                  <div>
                    <strong>Goods / supplies</strong>
                    <span>
                      {Array.isArray(
                        selectedCase.neededGoods,
                      ) &&
                      selectedCase.neededGoods.length
                        ? selectedCase.neededGoods.join(
                            ", ",
                          )
                        : "Not specified"}
                    </span>
                  </div>

                  {selectedCase.needsNote && (
                    <div>
                      <strong>Response instructions</strong>
                      <span>{selectedCase.needsNote}</span>
                    </div>
                  )}

                  {Array.isArray(
                    selectedCase.attachments,
                  ) &&
                    selectedCase.attachments.some(
                      (attachment) =>
                        safeHttpUrl(attachment?.url),
                    ) && (
                      <div>
                        <strong>Resident evidence</strong>
                        <div className="evidence-grid">
                          {selectedCase.attachments.map(
                            (attachment, index) => {
                              const url = safeHttpUrl(
                                attachment?.url,
                              );

                              if (!url) return null;

                              const looksLikeImage =
                                String(
                                  attachment?.type ||
                                    attachment?.contentType ||
                                    "",
                                )
                                  .toLowerCase()
                                  .includes("image") ||
                                /\.(png|jpe?g|webp|gif)(\?|$)/i.test(
                                  url,
                                );

                              return (
                                <a
                                  className="evidence-card"
                                  key={index}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {looksLikeImage ? (
                                    <img
                                      src={url}
                                      alt={`Incident evidence ${index + 1}`}
                                      loading="lazy"
                                    />
                                  ) : (
                                    <span className="evidence-file-icon">
                                      ▶
                                    </span>
                                  )}
                                  <span>
                                    {attachment?.name ||
                                      `Evidence ${index + 1}`}
                                  </span>
                                </a>
                              );
                            },
                          )}
                        </div>
                      </div>
                    )}
                </div>
              )}

              {caseChatAvailable && caseChatAssignment && (
                <CaseChat
                  caseId={selectedCase.id}
                  assignmentId={caseChatAssignment.id}
                  assignmentStatus={caseChatAssignment.status}
                  caseStatus={selectedCase.status}
                  user={user}
                  profile={profile}
                  viewerRole={caseChatViewerRole}
                />
              )}

              {missionMode && !hasCoordinates(selectedCase) && (
                <div className="error" role="alert" style={{ marginTop: 14 }}>
                  This test case has no saved GPS coordinates yet. Add valid latitude and longitude to the disaster case before testing navigation and live response.
                </div>
              )}

              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>
                    {statusLabel(selectedCase.status)}
                  </dd>
                </div>

                <div>
                  <dt>
                    {missionMode
                      ? "Reported address / landmark"
                      : "Location"}
                  </dt>
                  <dd>
                    {selectedCase.location ||
                      selectedCase.reporterAddress ||
                      "Location pending"}
                  </dd>
                </div>

                {!missionMode && (
                  <div>
                    <dt>Volunteers</dt>
                    <dd>
                      {selectedCase.assignedVolunteersCount ||
                        0}

                      {Number.isFinite(
                        selectedCase.requiredVolunteers,
                      )
                        ? ` / ${selectedCase.requiredVolunteers}`
                        : ""}
                    </dd>
                  </div>
                )}

                <div>
                  <dt>Coordinates</dt>
                  <dd>{coordinateLabel(selectedCase)}</dd>
                </div>
              </dl>
            </>
          ) : selectedCenter ? (
            <>
              <span className="severity center-badge">
                EVACUATION CENTER
              </span>

              <h2>
                {selectedCenter.name ||
                  "Evacuation center"}
              </h2>

              <p className="detail-type">
                {selectedCenter.address ||
                  selectedCenter.barangay ||
                  "Address pending"}
              </p>

              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>
                    {String(
                      selectedCenter.status ||
                        "available",
                    ).toUpperCase()}
                  </dd>
                </div>

                <div>
                  <dt>Occupancy</dt>
                  <dd>
                    {selectedCenter.occupied ?? 0}

                    {Number.isFinite(
                      selectedCenter.capacity,
                    )
                      ? ` / ${selectedCenter.capacity}`
                      : ""}
                  </dd>
                </div>

                <div>
                  <dt>Coordinates</dt>
                  <dd>{coordinateLabel(selectedCenter)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="details-empty">
              <div className="details-icon">⌖</div>

              <h2>
                {missionMode
                  ? "Loading assigned incident"
                  : "Select a map pin"}
              </h2>

              <p>
                {missionMode
                  ? "Open this response from Volunteer Tasks. The assigned resident location will appear here."
                  : "Click an incident or evacuation-center pin to view its current response details."}
              </p>
            </div>
          )}

          <div className="stats">
            <div>
              <strong>
                {missionMode
                  ? missionCase
                    ? "1"
                    : "0"
                  : visibleCases.length}
              </strong>
              <span>
                {missionMode ? "assigned mission" : "visible cases"}
              </span>
            </div>

            <div>
              <strong>
                {missionMode
                  ? statusLabel(missionCase?.status)
                  : visibleCenters.length}
              </strong>
              <span>
                {missionMode ? "case status" : "centers"}
              </span>
            </div>
          </div>

          {userLocation && (
            <p className="gps-note">
              The blue circle shows estimated location
              accuracy. {missionMode
                ? "Live sharing only runs after Respond & Share GPS and stops when the response ends"
                : "Tracking runs while this map is open"}
              {userLocation.accuracy !== null
                ? ` · accuracy ±${Math.round(
                    userLocation.accuracy,
                  )} m`
                : ""}
              .
            </p>
          )}
        </aside>
      </section>
    </main>
  );
}

const css = `
.mission-toolbar {
  justify-content: space-between;
  align-items: center;
}

.mission-toolbar-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mission-toolbar-copy strong {
  color: #0f2740;
  font-size: 14px;
}

.mission-toolbar-copy span {
  color: #64748b;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-detail-stack {
  display: grid;
  gap: 8px;
  margin: 12px 0 14px;
}

.mission-detail-stack > div {
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

.mission-detail-stack strong,
.mission-detail-stack span,
.mission-detail-stack small {
  display: block;
}

.mission-detail-stack strong {
  margin-bottom: 4px;
  color: #475569;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.mission-detail-stack span {
  color: #0f2740;
  font-weight: 650;
}

.mission-detail-stack small {
  margin-top: 3px;
  color: #64748b;
}

.resident-response-card {
  margin: 0 0 14px;
  padding: 14px;
  border: 1px solid #cfe3e0;
  border-radius: 14px;
  background: #f7fcfb;
}

.resident-response-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.resident-response-head > div {
  min-width: 0;
}

.resident-response-head strong,
.resident-response-head span {
  display: block;
}

.resident-response-head strong {
  color: #0f766e;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.resident-response-head > div > span {
  margin-top: 3px;
  color: #0f2740;
  font-size: 14px;
  font-weight: 850;
  overflow-wrap: anywhere;
}

.resident-response-status {
  flex: 0 0 auto;
  padding: 5px 8px;
  border-radius: 999px;
  background: #e6f7f4;
  color: #0f766e !important;
  font-size: 9px !important;
  font-weight: 900;
  letter-spacing: .04em;
}

.resident-response-card p {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 11px;
  line-height: 1.5;
}

.resident-share-actions {
  margin-top: 12px;
  display: grid;
  gap: 7px;
}

.resident-share-actions button {
  width: 100%;
}

.resident-share-actions small {
  color: #64748b;
  font-size: 10px;
  line-height: 1.45;
}

.resident-identity-card {
  display: grid !important;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  padding: 14px !important;
  background: #ffffff !important;
}

.resident-avatar {
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 2px solid #dbe8ee;
  border-radius: 999px;
  background: #e7f6f4;
  color: #0f766e;
  font-size: 22px;
  font-weight: 900;
}

.resident-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.resident-identity-copy {
  min-width: 0;
}

.resident-title-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
}

.resident-title-row h3 {
  margin: 0;
  color: #0f2740;
  font-size: 18px;
  line-height: 1.2;
  overflow-wrap: normal;
  word-break: normal;
}

.verification-pill {
  flex: 0 0 auto;
  display: inline-flex !important;
  align-items: center;
  min-height: 24px;
  padding: 4px 7px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #f8fafc;
  color: #475569 !important;
  font-size: 9px !important;
  font-weight: 900 !important;
  letter-spacing: .04em;
}

.verification-pill.verification-verified,
.verification-pill.verification-validated,
.verification-pill.verification-approved {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #15803d !important;
}

.resident-contact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin-top: 10px;
}

.resident-contact-grid > div {
  min-width: 0;
}

.resident-contact-grid b {
  display: block;
  margin-bottom: 2px;
  color: #64748b;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.resident-contact-grid span,
.resident-contact-grid a {
  display: block;
  overflow-wrap: break-word;
  word-break: normal;
  color: #0f2740;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.resident-contact-grid a {
  color: #0f766e;
}

.resident-photo-note {
  display: block !important;
  margin-top: 9px !important;
  color: #a16207 !important;
  font-size: 10px !important;
}

.evidence-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.evidence-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #d8e3ea;
  border-radius: 9px;
  background: #fff;
  color: #0f766e;
  text-decoration: none;
  font-size: 10px;
  font-weight: 800;
}

.evidence-card img {
  width: 100%;
  height: 84px;
  display: block;
  object-fit: cover;
  background: #e2e8f0;
}

.evidence-card > span:last-child {
  display: block;
  padding: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evidence-file-icon {
  height: 84px;
  display: grid !important;
  place-items: center;
  background: #f1f5f9;
  color: #475569 !important;
  font-size: 24px;
}

.evidence-links {
  display: flex !important;
  flex-wrap: wrap;
  gap: 6px;
}

.evidence-links a {
  display: inline-flex;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: white;
  color: #0f766e;
  text-decoration: none;
  font-size: 11px;
  font-weight: 800;
}

.tracking-status {
  width: min(1380px, 100%);
  margin: 0 auto 14px;
  padding: 12px 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  border: 1px solid #cce9e5;
  border-radius: 12px;
  background: #f0faf8;
  color: #0f766e;
  font-size: 12px;
}

.tracking-status .gps-error {
  color: #9f1239;
  width: 100%;
}

.response-map-page {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 26px;
  background:
    radial-gradient(
      circle at top right,
      rgba(13,148,136,.09),
      transparent 32%
    ),
    #f4f8fb;
  color: #0f2740;
  font: 14px/1.45 Inter, ui-sans-serif, system-ui,
    -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

.response-map-page * {
  box-sizing: border-box;
}

.response-map-page button,
.response-map-page input {
  font: inherit;
}

.response-map-page button {
  cursor: pointer;
}

.response-map-page button:disabled {
  opacity: .6;
  cursor: wait;
}

.map-header,
.toolbar,
.map-layout,
.error,
.state-card {
  width: min(1380px, 100%);
  margin-left: auto;
  margin-right: auto;
}

.map-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.map-header h1 {
  margin: 5px 0 3px;
  font-size: clamp(27px, 3vw, 40px);
  letter-spacing: -1.2px;
  line-height: 1.05;
}

.map-header p {
  margin: 0;
  color: #64748b;
}

.eyebrow {
  color: #0f766e;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1.7px;
}

.live-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  padding: 9px 12px;
  border: 1px solid #cce9e5;
  border-radius: 999px;
  background: #ecfdf8;
  color: #0f766e;
  font-size: 11px;
  font-weight: 900;
}

.live-badge span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #16a34a;
  box-shadow: 0 0 0 4px rgba(22,163,74,.12);
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr);
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.search-box {
  height: 46px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border: 1px solid #d9e4eb;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 5px 18px rgba(15,23,42,.04);
}

.search-box span {
  color: #64748b;
  font-size: 22px;
}

.search-box input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: #0f2740;
  background: transparent;
}

.search-box input::placeholder {
  color: #94a3b8;
}

.filter-group,
.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.chip,
.secondary-button,
.primary-button {
  min-height: 42px;
  border-radius: 11px;
  border: 1px solid #d6e1e8;
  padding: 9px 12px;
  background: #fff;
  color: #475569;
  font-weight: 800;
}

.chip.active {
  background: #eff8f7;
  color: #0f766e;
  border-color: #b8ddd8;
}

.chip.active.danger {
  background: #fff1f2;
  color: #dc2626;
  border-color: #fecdd3;
}

.chip.active.blue {
  background: #eff6ff;
  color: #2563eb;
  border-color: #bfdbfe;
}

.primary-button {
  background: #0f766e;
  color: #fff;
  border-color: #0f766e;
}

.secondary-button {
  color: #0f766e;
}

.error {
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid #fecaca;
  border-radius: 12px;
  background: #fff1f2;
  color: #9f1239;
  font-weight: 700;
}

.map-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(350px, 390px);
  gap: 18px;
  align-items: stretch;
}

.map-card,
.details-card,
.state-card {
  border: 1px solid #dce6ec;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 12px 35px rgba(15,23,42,.07);
}

.map-card {
  position: relative;
  min-width: 0;
  height: clamp(620px, 74vh, 860px);
  min-height: 620px;
  overflow: hidden;
}

.map-card iframe {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 100%;
  border: 0;
  background: #eaf2f7;
}

.legend {
  position: absolute;
  left: 18px;
  bottom: 18px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 11px;
  max-width: calc(100% - 36px);
  padding: 10px 12px;
  border: 1px solid rgba(226,232,240,.9);
  border-radius: 13px;
  background: rgba(255,255,255,.94);
  box-shadow: 0 8px 26px rgba(15,23,42,.13);
  backdrop-filter: blur(8px);
  font-size: 11px;
  color: #475569;
}

.legend strong {
  color: #0f2740;
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  display: inline-block;
  border-radius: 999px;
}

.legend-dot.incident {
  background: #ef4444;
}

.legend-dot.center {
  background: #2563eb;
}

.legend-dot.me {
  background: #2563eb;
  box-shadow: 0 0 0 3px rgba(37,99,235,.17);
}

.details-card {
  height: clamp(620px, 74vh, 860px);
  min-height: 620px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.details-card::-webkit-scrollbar {
  width: 8px;
}

.details-card::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: #cbd5e1;
  background-clip: padding-box;
}

.details-card::-webkit-scrollbar-track {
  background: transparent;
}

.details-card h2 {
  margin: 9px 0 4px;
  color: #0f2740;
  font-size: 22px;
  line-height: 1.15;
}

.detail-type {
  margin: 0 0 18px;
  color: #64748b;
}

.severity {
  align-self: flex-start;
  padding: 6px 9px;
  border-radius: 999px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .6px;
}

.severity-low {
  background: #f0fdf4;
  color: #15803d;
}

.severity-medium {
  background: #fff7ed;
  color: #c2410c;
}

.severity-high {
  background: #fff1f2;
  color: #dc2626;
}

.severity-critical {
  background: #7f1d1d;
  color: #fff;
}

.center-badge {
  background: #eff6ff;
  color: #1d4ed8;
}

.details-card dl {
  margin: 0;
}

.details-card dl > div {
  padding: 13px 0;
  border-bottom: 1px solid #e7eef3;
}

.details-card dt {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .5px;
}

.details-card dd {
  margin: 3px 0 0;
  color: #0f2740;
  font-weight: 750;
  overflow-wrap: anywhere;
}

.details-empty {
  margin: auto 0;
  padding: 28px 8px;
  text-align: center;
}

.details-icon {
  width: 58px;
  height: 58px;
  margin: 0 auto 12px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: #eef8f7;
  color: #0f766e;
  font-size: 30px;
}

.details-empty h2 {
  margin: 0 0 6px;
}

.details-empty p {
  margin: 0;
  color: #64748b;
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: auto;
  padding-top: 18px;
}

.stats > div {
  padding: 12px;
  border-radius: 12px;
  background: #f5f9fb;
}

.stats strong {
  display: block;
  font-size: 20px;
  color: #0f766e;
}

.stats span {
  color: #64748b;
  font-size: 11px;
}

.gps-note {
  margin: 12px 0 0;
  padding: 10px 11px;
  border-radius: 10px;
  background: #eff6ff;
  color: #475569;
  font-size: 11px;
}

.state-card {
  max-width: 720px;
  margin-top: 50px;
  padding: 28px;
}

.state-card h1 {
  margin-top: 0;
}

.state-card p {
  color: #64748b;
}

.state-card a {
  color: #0f766e;
  font-weight: 800;
}

.response-map-page :is(button,input,a):focus-visible {
  outline: 3px solid rgba(20,184,166,.35);
  outline-offset: 2px;
}

@media (max-width: 1280px) {
  .map-layout {
    grid-template-columns: minmax(0, 1fr) minmax(330px, 360px);
    gap: 14px;
  }
}

@media (max-width: 1120px) {
  .toolbar {
    grid-template-columns: 1fr;
  }

  .filter-group,
  .toolbar-actions {
    flex-wrap: wrap;
  }
}

@media (max-width: 1080px) {
  .response-map-page {
    padding: 18px;
  }

  .map-layout {
    grid-template-columns: 1fr;
  }

  .map-card {
    height: 560px;
    min-height: 560px;
  }

  .details-card {
    height: auto;
    min-height: auto;
    max-height: none;
    overflow-y: visible;
  }

  .map-card iframe {
    height: 100%;
    min-height: 100%;
  }

  .map-header {
    align-items: flex-start;
  }
}

@media (max-width: 620px) {
  .response-map-page {
    padding: 12px;
  }

  .map-header {
    flex-direction: column;
  }

  .filter-group,
  .toolbar-actions {
    width: 100%;
  }

  .chip,
  .secondary-button,
  .primary-button {
    flex: 1 1 auto;
  }

  .map-card {
    height: 470px;
    min-height: 470px;
  }

  .map-card iframe {
    height: 100%;
    min-height: 100%;
  }

  .legend {
    right: 12px;
    left: 12px;
    bottom: 12px;
  }
}
@media (max-width: 680px) {
  .resident-identity-card {
    grid-template-columns: 52px minmax(0, 1fr);
  }

  .resident-avatar {
    width: 50px;
    height: 50px;
    font-size: 16px;
  }

  .resident-title-row {
    flex-direction: column;
  }

  .resident-contact-grid,
  .evidence-grid {
    grid-template-columns: 1fr;
  }
}

`;