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

type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

type RouteStep = {
  distanceMeters: number;
  durationSeconds: number;
  name: string;
  type: string;
  modifier: string;
  location: [number, number] | null;
};

type RoadRoute = {
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  fetchedAt: number;
  origin: RouteCoordinate;
  destination: RouteCoordinate;
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

    .user-marker {
      position: relative;
      width: 30px;
      height: 30px;
    }

    .user-pin {
      position: absolute;
      inset: 0;
      width: 22px;
      height: 22px;
      margin: auto;
      border: 4px solid white;
      border-radius: 999px;
      background: #2563eb;
      box-shadow:
        0 0 0 8px rgba(37,99,235,.18),
        0 5px 16px rgba(15,23,42,.25);
    }

    .user-label,
    .destination-label {
      position: absolute;
      left: 50%;
      bottom: 36px;
      transform: translateX(-50%);
      white-space: nowrap;
      padding: 5px 8px;
      border-radius: 8px;
      background: rgba(255,255,255,.96);
      box-shadow: 0 5px 18px rgba(15,23,42,.16);
      color: #0f2740;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .02em;
      pointer-events: none;
    }

    .destination-marker {
      position: relative;
      width: 32px;
      height: 32px;
    }

    .destination-marker .pin {
      position: absolute;
      inset: 0;
    }

    .destination-label {
      bottom: 39px;
      color: #b42318;
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
      let responderMarkers = new Map();
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
        if (item.destination) {
          const wrapper = document.createElement("div");
          wrapper.className = "destination-marker";

          const pin = document.createElement("div");
          pin.className = "pin";
          pin.style.background = "#ef4444";
          pin.innerHTML = "<span>⌂</span>";

          const label = document.createElement("div");
          label.className = "destination-label";
          label.textContent = "RESIDENT DESTINATION";

          wrapper.appendChild(pin);
          wrapper.appendChild(label);
          return wrapper;
        }

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
        const wrapper = document.createElement("div");
        wrapper.className = "user-marker";

        const dot = document.createElement("div");
        dot.className = "user-pin";

        const label = document.createElement("div");
        label.className = "user-label";
        label.textContent = "YOU · START";

        wrapper.appendChild(dot);
        wrapper.appendChild(label);
        return wrapper;
      }

      function makeResidentElement() {
        const element = document.createElement("div");
        element.className = "pin";
        element.style.background = "#0f9f85";
        element.innerHTML = "<span>R</span>";
        return element;
      }

      function makeResponderElement(stale) {
        const element = document.createElement("div");
        element.className = "pin";
        element.style.background = stale ? "#64748b" : "#7c3aed";
        element.innerHTML = "<span>V</span>";
        return element;
      }

      function animateResponderMarker(marker, longitude, latitude) {
        const current = marker.getLngLat();
        const startLng = current.lng;
        const startLat = current.lat;
        const deltaLng = longitude - startLng;
        const deltaLat = latitude - startLat;

        if (
          Math.abs(deltaLng) < 0.0000001 &&
          Math.abs(deltaLat) < 0.0000001
        ) {
          return;
        }

        if (marker.__volunserveAnimation) {
          cancelAnimationFrame(marker.__volunserveAnimation);
        }

        const started = performance.now();
        const duration = 900;

        const step = (now) => {
          const raw = Math.min(1, (now - started) / duration);
          const eased = 1 - Math.pow(1 - raw, 3);

          marker.setLngLat([
            startLng + deltaLng * eased,
            startLat + deltaLat * eased,
          ]);

          if (raw < 1) {
            marker.__volunserveAnimation = requestAnimationFrame(step);
          } else {
            marker.__volunserveAnimation = null;
          }
        };

        marker.__volunserveAnimation = requestAnimationFrame(step);
      }

      function syncResponderMarkers(people, bounds) {
        const activeIds = new Set();
        let count = 0;

        for (const person of people || []) {
          if (!validPoint(person.latitude, person.longitude)) {
            continue;
          }

          const id = String(
            person.id ||
            person.volunteerId ||
            person.assignmentId ||
            "responder-" + count
          );

          activeIds.add(id);

          let marker = responderMarkers.get(id);

          if (!marker) {
            const element = makeResponderElement(person.stale);

            marker = new maplibregl.Marker({ element })
              .setLngLat([person.longitude, person.latitude])
              .setPopup(
                new maplibregl.Popup({ offset: 22 })
              )
              .addTo(map);

            responderMarkers.set(id, marker);
          } else {
            const element = marker.getElement();
            element.style.background = person.stale
              ? "#64748b"
              : "#7c3aed";

            animateResponderMarker(
              marker,
              person.longitude,
              person.latitude
            );
          }

          marker.getPopup()?.setText(
            (person.name || "Assigned responder") +
            (person.stale ? " · older reading · " : " · live · ") +
            new Date(person.lastShared).toLocaleTimeString()
          );

          bounds.extend([person.longitude, person.latitude]);
          count += 1;
        }

        for (const [id, marker] of responderMarkers.entries()) {
          if (!activeIds.has(id)) {
            if (marker.__volunserveAnimation) {
              cancelAnimationFrame(marker.__volunserveAnimation);
            }
            marker.remove();
            responderMarkers.delete(id);
          }
        }

        return count;
      }

      function clearMarkers() {
        for (const marker of incidentMarkers) {
          marker.remove();
        }

        for (const marker of centerMarkers) {
          marker.remove();
        }

        for (const marker of residentMarkers) {
          marker.remove();
        }

        incidentMarkers = [];
        centerMarkers = [];
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

        pointCount += syncResponderMarkers(
          payload.responders || [],
          bounds
        );

        const routeSource = map.getSource("response-route");
        if (routeSource) {
          routeSource.setData(
            payload.route || {
              type: "FeatureCollection",
              features: [],
            }
          );
        }

        const routeCoordinates =
          payload.route?.geometry?.coordinates || [];

        for (const coordinate of routeCoordinates) {
          if (
            Array.isArray(coordinate) &&
            validPoint(coordinate[1], coordinate[0])
          ) {
            bounds.extend([coordinate[0], coordinate[1]]);
          }
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
        map.addSource("response-route", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });

        map.addLayer({
          id: "response-route-casing",
          type: "line",
          source: "response-route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": 8,
            "line-opacity": 0.94,
          },
        });

        map.addLayer({
          id: "response-route-line",
          type: "line",
          source: "response-route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#2563eb",
            "line-width": 6,
            "line-opacity": 0.96,
          },
        });

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

function haversineMeters(
  first: RouteCoordinate,
  second: RouteCoordinate,
) {
  const earthRadius = 6371008.8;
  const toRadians = (value: number) => value * Math.PI / 180;

  const lat1 = toRadians(first.latitude);
  const lat2 = toRadians(second.latitude);
  const deltaLat = toRadians(second.latitude - first.latitude);
  const deltaLng = toRadians(second.longitude - first.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadius * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a),
  );
}

function formatRoadDistance(meters?: number | null) {
  if (!Number.isFinite(meters) || meters == null || meters < 0) {
    return "—";
  }

  if (meters < 1000) {
    return `${Math.max(0, Math.round(meters))} m`;
  }

  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

function formatDriveTime(seconds?: number | null) {
  if (!Number.isFinite(seconds) || seconds == null || seconds < 0) {
    return "—";
  }

  const minutes = Math.max(1, Math.round(seconds / 60));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  return remaining
    ? `${hours} hr ${remaining} min`
    : `${hours} hr`;
}

function navigationArrow(modifier?: string) {
  const value = normalize(modifier);

  if (value.includes("left")) return "↰";
  if (value.includes("right")) return "↱";
  if (value.includes("uturn")) return "↶";
  if (value.includes("straight")) return "↑";

  return "↑";
}

function routeStepInstruction(step?: RouteStep | null) {
  if (!step) return "Continue toward the destination";

  const road = step.name.trim();
  const modifier = normalize(step.modifier);
  const type = normalize(step.type);

  if (type === "arrive") {
    return road
      ? `Arrive at the destination via ${road}`
      : "Arrive at the destination";
  }

  if (type === "depart") {
    if (modifier.includes("left")) {
      return road ? `Start left onto ${road}` : "Start by heading left";
    }

    if (modifier.includes("right")) {
      return road ? `Start right onto ${road}` : "Start by heading right";
    }

    return road ? `Start on ${road}` : "Start toward the destination";
  }

  if (type.includes("roundabout") || type === "rotary") {
    return road
      ? `Enter the roundabout toward ${road}`
      : "Enter the roundabout";
  }

  if (type === "merge") {
    return road ? `Merge onto ${road}` : "Merge ahead";
  }

  if (type === "fork") {
    if (modifier.includes("left")) {
      return road ? `Keep left toward ${road}` : "Keep left at the fork";
    }

    if (modifier.includes("right")) {
      return road ? `Keep right toward ${road}` : "Keep right at the fork";
    }

    return road ? `Continue toward ${road}` : "Continue at the fork";
  }

  if (type === "turn" || type === "end of road" || type === "new name") {
    if (modifier.includes("left")) {
      return road ? `Turn left onto ${road}` : "Turn left";
    }

    if (modifier.includes("right")) {
      return road ? `Turn right onto ${road}` : "Turn right";
    }

    if (modifier.includes("uturn")) {
      return road ? `Make a U-turn toward ${road}` : "Make a U-turn";
    }
  }

  if (modifier.includes("left")) {
    return road ? `Keep left onto ${road}` : "Keep left";
  }

  if (modifier.includes("right")) {
    return road ? `Keep right onto ${road}` : "Keep right";
  }

  return road ? `Continue on ${road}` : "Continue toward the destination";
}

function validRouteCoordinate(
  coordinate: RouteCoordinate | null | undefined,
): coordinate is RouteCoordinate {
  return !!coordinate &&
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    Math.abs(coordinate.latitude) <= 90 &&
    Math.abs(coordinate.longitude) <= 180;
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
  const lastRouteFitKey = useRef("");

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
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [navigationActive, setNavigationActive] = useState(false);

  const latestUserLocation = useRef<BrowserLocation | null>(null);
  const routeCache = useRef<RoadRoute | null>(null);
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

  const residentPreferredCase = useMemo(() => {
    if (!isResidentMode) return null;

    if (selectedCase) return selectedCase;

    return (
      cases.find((item) =>
        ["assigned", "in_progress"].includes(
          normalize(item.status),
        ),
      ) ||
      cases.find((item) =>
        ["validated", "reported"].includes(
          normalize(item.status),
        ),
      ) ||
      cases[0] ||
      null
    );
  }, [isResidentMode, selectedCase, cases]);

  const residentCoordinationCaseId = isResidentMode
    ? residentShareCaseId || residentPreferredCase?.id || ""
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

  const residentAssignmentVolunteerIds = useMemo(
    () =>
      Array.from(
        new Set(
          (residentCoordinationCase?.assignedVolunteerIds || [])
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ),
      ),
    [residentCoordinationCase?.assignedVolunteerIds],
  );

  // Resident assignment reads use deterministic exact document ids.
  // This matches Firestore document-level authorization and avoids the
  // collection query that can fail even when the resident owns the case.
  useEffect(() => {
    setResidentAssignments([]);

    if (
      !isResidentMode ||
      !user ||
      !profile ||
      !isApprovedProfile(profile) ||
      !residentCoordinationCaseId ||
      residentAssignmentVolunteerIds.length === 0
    ) {
      return;
    }

    const disposers = residentAssignmentVolunteerIds.map(
      (volunteerId) => {
        const assignmentId =
          `${residentCoordinationCaseId}_${volunteerId}`;

        return onSnapshot(
          doc(db, "responseAssignments", assignmentId),
          (snapshot) => {
            setResidentAssignments((current) => {
              const withoutCurrent = current.filter(
                (item) => item.id !== assignmentId,
              );

              if (!snapshot.exists()) {
                return withoutCurrent;
              }

              const data = snapshot.data();

              if (
                data.caseId !== residentCoordinationCaseId ||
                data.volunteerId !== volunteerId
              ) {
                return withoutCurrent;
              }

              return [
                ...withoutCurrent,
                {
                  id: snapshot.id,
                  ...data,
                },
              ];
            });
          },
          (cause) => {
            console.error(
              "resident exact response assignment",
              assignmentId,
              cause,
            );
          },
        );
      },
    );

    return () => {
      disposers.forEach((dispose) => dispose());
    };
  }, [
    isResidentMode,
    user?.uid,
    profile,
    residentCoordinationCaseId,
    residentAssignmentVolunteerIds.join("|"),
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
    isResidentMode ? residentPrimaryAssignment : null;

  const residentCanStartShare =
    isResidentMode &&
    !!selectedCase &&
    selectedCase.id === residentCoordinationCaseId &&
    !!residentShareAssignment &&
    ["assigned", "in_progress"].includes(
      normalize(selectedCase.status),
    );

  const routeResponderPoint = useMemo(() => {
    if (!isResidentMode || !residentDisplayedAssignment) {
      return null;
    }

    return (
      residentResponderPins.find(
        (point) =>
          point.volunteerId ===
          residentDisplayedAssignment.volunteerId,
      ) ||
      residentResponderPins[0] ||
      null
    );
  }, [
    isResidentMode,
    residentDisplayedAssignment?.volunteerId,
    residentResponderPins,
  ]);

  const routeOrigin = useMemo<RouteCoordinate | null>(() => {
    if (isResidentMode && routeResponderPoint) {
      return {
        latitude: Number(routeResponderPoint.latitude),
        longitude: Number(routeResponderPoint.longitude),
      };
    }

    if (missionMode && userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      };
    }

    return null;
  }, [
    isResidentMode,
    routeResponderPoint?.latitude,
    routeResponderPoint?.longitude,
    missionMode,
    userLocation?.latitude,
    userLocation?.longitude,
  ]);

  const routeDestination = useMemo<RouteCoordinate | null>(() => {
    // If the resident explicitly shares a fresh moving location for this
    // mission, use it as the live destination. Otherwise, fall back to the
    // fixed emergency GPS pin saved with the report.
    if (missionMode) {
      const liveResident =
        residentLivePins.find(
          (point) => point.caseId === focusedCaseId,
        ) || null;

      if (liveResident) {
        return {
          latitude: Number(liveResident.latitude),
          longitude: Number(liveResident.longitude),
        };
      }

      if (missionCase && hasCoordinates(missionCase)) {
        return {
          latitude: Number(missionCase.latitude),
          longitude: Number(missionCase.longitude),
        };
      }
    }

    if (isResidentMode && residentCoordinationCase) {
      if (
        residentShareCaseId === residentCoordinationCase.id &&
        userLocation &&
        Date.now() - userLocation.timestamp < 60000
      ) {
        return {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
        };
      }

      if (hasCoordinates(residentCoordinationCase)) {
        return {
          latitude: Number(residentCoordinationCase.latitude),
          longitude: Number(residentCoordinationCase.longitude),
        };
      }
    }

    return null;
  }, [
    missionMode,
    focusedCaseId,
    residentLivePins,
    missionCase?.id,
    missionCase?.latitude,
    missionCase?.longitude,
    isResidentMode,
    residentCoordinationCase?.id,
    residentCoordinationCase?.latitude,
    residentCoordinationCase?.longitude,
    residentShareCaseId,
    userLocation?.latitude,
    userLocation?.longitude,
    userLocation?.timestamp,
  ]);

  const usingResidentLiveDestination =
    missionMode &&
    residentLivePins.some(
      (point) => point.caseId === focusedCaseId,
    );

  const residentUsingOwnLiveDestination =
    isResidentMode &&
    !!residentCoordinationCase &&
    residentShareCaseId === residentCoordinationCase.id &&
    !!userLocation &&
    Date.now() - userLocation.timestamp < 60000;

  const routeStatus = normalize(
    missionMode
      ? missionAssignment?.status
      : residentDisplayedAssignment?.status,
  );

  const routeShouldBeLive =
    ["responding", "on_site"].includes(routeStatus) &&
    validRouteCoordinate(routeOrigin) &&
    validRouteCoordinate(routeDestination);

  useEffect(() => {
    if (!routeShouldBeLive || !routeOrigin || !routeDestination) {
      setRoadRoute(null);
      setRouteLoading(false);
      setRouteError("");
      return;
    }

    const cached = routeCache.current;
    const now = Date.now();

    if (cached) {
      const originMoved = haversineMeters(
        cached.origin,
        routeOrigin,
      );
      const destinationMoved = haversineMeters(
        cached.destination,
        routeDestination,
      );

      if (
        originMoved < 20 &&
        destinationMoved < 20 &&
        now - cached.fetchedAt < 30000
      ) {
        setRoadRoute(cached);
        return;
      }
    }

    const controller = new AbortController();

    const loadRoute = async () => {
      setRouteLoading(true);
      setRouteError("");

      try {
        const coordinates =
          `${routeOrigin.longitude},${routeOrigin.latitude};` +
          `${routeDestination.longitude},${routeDestination.latitude}`;

        const url =
          `https://router.project-osrm.org/route/v1/driving/${coordinates}` +
          `?overview=full&geometries=geojson&steps=true&alternatives=false`;

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Routing request failed (${response.status}).`);
        }

        const data = await response.json();
        const route = data?.routes?.[0];

        if (
          !route ||
          !Number.isFinite(route.distance) ||
          !Number.isFinite(route.duration) ||
          route.geometry?.type !== "LineString" ||
          !Array.isArray(route.geometry?.coordinates) ||
          route.geometry.coordinates.length < 2
        ) {
          throw new Error("No drivable road route was returned.");
        }

        const steps: RouteStep[] = Array.isArray(route.legs)
          ? route.legs.flatMap((leg: any) =>
              Array.isArray(leg?.steps)
                ? leg.steps.map((step: any) => ({
                    distanceMeters: Number.isFinite(step?.distance)
                      ? step.distance
                      : 0,
                    durationSeconds: Number.isFinite(step?.duration)
                      ? step.duration
                      : 0,
                    name: String(step?.name || ""),
                    type: String(step?.maneuver?.type || ""),
                    modifier: String(step?.maneuver?.modifier || ""),
                    location:
                      Array.isArray(step?.maneuver?.location) &&
                      step.maneuver.location.length >= 2 &&
                      Number.isFinite(step.maneuver.location[0]) &&
                      Number.isFinite(step.maneuver.location[1])
                        ? [
                            step.maneuver.location[0],
                            step.maneuver.location[1],
                          ] as [number, number]
                        : null,
                  }))
                : [],
            )
          : [];

        const nextRoute: RoadRoute = {
          geometry: {
            type: "LineString",
            coordinates: route.geometry.coordinates,
          },
          distanceMeters: route.distance,
          durationSeconds: route.duration,
          steps,
          fetchedAt: Date.now(),
          origin: routeOrigin,
          destination: routeDestination,
        };

        routeCache.current = nextRoute;
        setRoadRoute(nextRoute);
      } catch (problem) {
        if (controller.signal.aborted) return;

        console.error("road route", problem);
        setRoadRoute(null);
        setRouteError(
          "Road route is temporarily unavailable. Keep GPS active and try again when the connection improves.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setRouteLoading(false);
        }
      }
    };

    void loadRoute();

    return () => controller.abort();
  }, [
    routeShouldBeLive,
    routeOrigin?.latitude,
    routeOrigin?.longitude,
    routeDestination?.latitude,
    routeDestination?.longitude,
  ]);

  const currentNavigationStep = useMemo(() => {
    if (!roadRoute?.steps?.length) return null;

    return (
      roadRoute.steps.find(
        (step) =>
          normalize(step.type) !== "arrive" &&
          step.distanceMeters > 3,
      ) ||
      roadRoute.steps[0] ||
      null
    );
  }, [roadRoute]);

  const nextNavigationStep = useMemo(() => {
    if (!roadRoute?.steps?.length || !currentNavigationStep) {
      return null;
    }

    const index = roadRoute.steps.indexOf(currentNavigationStep);
    return index >= 0
      ? roadRoute.steps[index + 1] || null
      : null;
  }, [roadRoute, currentNavigationStep]);

  const canStartInAppNavigation =
    missionMode &&
    ["responding", "on_site"].includes(missionAssignmentStatus) &&
    tracking &&
    !!userLocation &&
    validRouteCoordinate(routeDestination);

  // Clean mission flow: once the volunteer starts responding and GPS is
  // available, in-app navigation becomes active automatically. There is no
  // separate Google Maps / Start Navigation step for the responder.
  useEffect(() => {
    if (canStartInAppNavigation && isFocused) {
      setNavigationActive(true);
      // Keep start + destination + the whole road route visible.
      setFollowMe(false);
      return;
    }

    setNavigationActive(false);
  }, [canStartInAppNavigation, isFocused]);

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
        route: roadRoute
          ? {
              type: "Feature",
              properties: {},
              geometry: roadRoute.geometry,
            }
          : {
              type: "FeatureCollection",
              features: [],
            },

        incidents: visibleCases.map((item) => ({
          id: item.id,
          title: item.title || "Disaster case",
          status: item.status || "reported",
          severity: item.severity || "medium",
          latitude: numericCoordinate(item.latitude),
          longitude: numericCoordinate(item.longitude),
          destination:
            (missionMode || isResidentMode) &&
            selectedCase?.id === item.id,
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

    const routeFitKey = roadRoute
      ? [
          roadRoute.origin.latitude.toFixed(5),
          roadRoute.origin.longitude.toFixed(5),
          roadRoute.destination.latitude.toFixed(5),
          roadRoute.destination.longitude.toFixed(5),
        ].join("|")
      : "";

    const shouldFit =
      !firstFit.current ||
      (!!routeFitKey && routeFitKey !== lastRouteFitKey.current);

    postMapData(shouldFit);
    firstFit.current = true;

    if (routeFitKey) {
      lastRouteFitKey.current = routeFitKey;
    }
  }, [
    mapReady,
    visibleCases,
    visibleCenters,
    mapResponderPins,
    residentLivePins,
    roadRoute,
  ]);

  useEffect(() => {
    if (!mapReady) return;

    frame.current?.contentWindow?.postMessage(
      {
        kind: "update-user-location",
        location: userLocation,
        follow: tracking && followMe && !roadRoute,
      },
      "*",
    );
  }, [
    mapReady,
    userLocation,
    tracking,
    followMe,
    roadRoute,
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

  const volunteerFlowIndex =
    missionAssignmentStatus === "completed"
      ? 4
      : missionAssignmentStatus === "on_site"
        ? 3
        : missionAssignmentStatus === "responding"
          ? 2
          : missionAssignmentStatus === "accepted"
            ? 1
            : 0;

  const residentAssignmentStatus = normalize(
    residentDisplayedAssignment?.status,
  );

  const residentFlowIndex =
    residentAssignmentStatus === "completed"
      ? 4
      : residentAssignmentStatus === "on_site"
        ? 3
        : residentAssignmentStatus === "responding"
          ? 2
          : residentAssignmentStatus === "accepted"
            ? 1
            : residentDisplayedAssignment
              ? 1
              : 0;

  const pageTitle = missionMode
    ? "Volunteer Response Map"
    : isResidentMode
      ? "Resident Map Tracking"
      : "Live Response Map";

  const pageSubtitle = missionMode
    ? "Respond, navigate, arrive, and complete the mission in one clear flow."
    : isResidentMode
      ? "Track your assigned responder, road distance, and estimated arrival in real time."
      : "Monitor active incidents, responders, and evacuation centers.";

  return (
    <main
      className={`response-map-page ${
        missionMode
          ? "volunteer-map-mode"
          : isResidentMode
            ? "resident-map-mode"
            : "admin-map-mode"
      }`}
    >
      <style>{css}</style>

      <header className="map-header clean-map-header">
        <div>
          <span className="eyebrow">
            {missionMode
              ? "VOLUNSERVE · VOLUNTEER MODE"
              : isResidentMode
                ? "VOLUNSERVE · RESIDENT MODE"
                : "VOLUNSERVE · RESPONSE COORDINATION"}
          </span>
          <h1>{pageTitle}</h1>
          <p>{pageSubtitle}</p>
        </div>

        <div
          className={`clean-live-badge ${
            missionMode
              ? tracking && ["responding", "on_site"].includes(missionAssignmentStatus)
                ? "active"
                : ""
              : isResidentMode
                ? residentResponderLastShared
                  ? "active"
                  : ""
                : "active"
          }`}
        >
          <span />
          {missionMode
            ? missionAssignmentStatus === "completed"
              ? "MISSION COMPLETE"
              : tracking && ["responding", "on_site"].includes(missionAssignmentStatus)
                ? "LIVE RESPONSE"
                : statusLabel(missionAssignmentStatus || "accepted")
            : isResidentMode
              ? residentResponderLastShared
                ? "RESPONDER LIVE"
                : "RESPONSE STATUS"
              : "LIVE"}
        </div>
      </header>

      {(isAdministrator || missionMode) && (
        <ResponsePanel flow={flow} cases={cases} />
      )}

      {(error || gpsError) && (
        <div className="clean-alert" role="alert">
          {error || gpsError}
        </div>
      )}

      {missionMode && missionCase && (
        <section className="clean-flow-card" aria-label="Volunteer response flow">
          <div className="clean-flow-summary">
            <div>
              <span className="clean-kicker">ACTIVE MISSION</span>
              <h2>{missionCase.title || "Emergency response"}</h2>
              <div className="clean-destination-line">
                <span>DESTINATION</span>
                <strong>
                  {usingResidentLiveDestination
                    ? "Resident live location"
                    : missionCase.location ||
                      missionCase.reporterAddress ||
                      "Resident destination"}
                </strong>
              </div>
            </div>

            <div className="clean-summary-person">
              <span>Resident</span>
              <strong>{missionCase.reporterName || "Resident"}</strong>
              <small>{missionCase.contactNumber || "No contact number"}</small>
            </div>

            <div className="clean-summary-metric">
              <span>Distance</span>
              <strong>
                {roadRoute
                  ? formatRoadDistance(roadRoute.distanceMeters)
                  : routeLoading
                    ? "…"
                    : "—"}
              </strong>
            </div>

            <div className="clean-summary-metric">
              <span>ETA</span>
              <strong>
                {roadRoute
                  ? formatDriveTime(roadRoute.durationSeconds)
                  : routeLoading
                    ? "…"
                    : "—"}
              </strong>
            </div>
          </div>

        </section>
      )}

      {isResidentMode && residentCoordinationCase && (
        <section className="clean-flow-card resident-clean-flow" aria-label="Resident response flow">
          <div className="clean-flow-summary">
            <div>
              <span className="clean-kicker">YOUR EMERGENCY RESPONSE</span>
              <h2>{residentCoordinationCase.title || "Emergency request"}</h2>
              <p>
                {residentUsingOwnLiveDestination
                  ? "Your live shared location is the current response destination"
                  : residentCoordinationCase.location ||
                    residentCoordinationCase.reporterAddress ||
                    "Saved emergency location"}
              </p>
            </div>

            <div className="clean-summary-person">
              <span>Assigned responder</span>
              <strong>
                {residentDisplayedAssignment
                  ? residentDisplayedAssignment.volunteerName || "Assigned responder"
                  : "Waiting for assignment"}
              </strong>
              <small>
                {residentDisplayedAssignment
                  ? statusLabel(residentDisplayedAssignment.status)
                  : "Admin is coordinating your request"}
              </small>
            </div>

            <div className="clean-summary-metric">
              <span>Distance</span>
              <strong>
                {roadRoute
                  ? formatRoadDistance(roadRoute.distanceMeters)
                  : routeLoading
                    ? "…"
                    : "—"}
              </strong>
            </div>

            <div className="clean-summary-metric">
              <span>ETA</span>
              <strong>
                {roadRoute
                  ? formatDriveTime(roadRoute.durationSeconds)
                  : routeLoading
                    ? "…"
                    : "—"}
              </strong>
            </div>
          </div>

          <div className="clean-flow-steps">
            {["Assigned", "On the way", "Arrived", "Complete"].map(
              (label, index) => {
                const step = index + 1;
                const complete = residentFlowIndex > step;
                const current = residentFlowIndex === step;

                return (
                  <div
                    key={label}
                    className={`clean-flow-step ${complete ? "done" : ""} ${
                      current ? "current" : ""
                    }`}
                  >
                    <i>{complete ? "✓" : step}</i>
                    <span>{label}</span>
                  </div>
                );
              },
            )}
          </div>
        </section>
      )}

      {!missionMode && !isResidentMode && (
        <section className="toolbar admin-map-toolbar" aria-label="Admin map controls">
          <label className="search-box">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search incident, barangay or evacuation center…"
              aria-label="Search map"
            />
          </label>

          <div className="filter-group">
            <button
              type="button"
              className={showIncidents ? "chip active danger" : "chip"}
              onClick={() => setShowIncidents((value) => !value)}
            >
              ● Incidents
            </button>
            <button
              type="button"
              className={showCenters ? "chip active blue" : "chip"}
              onClick={() => setShowCenters((value) => !value)}
            >
              ◆ Evacuation centers
            </button>
            <button
              type="button"
              className={showResolved ? "chip active" : "chip"}
              onClick={() => setShowResolved((value) => !value)}
            >
              ✓ Resolved
            </button>
          </div>
        </section>
      )}

      <section className="map-layout clean-map-layout">
        <div className="map-card clean-map-card">
          <iframe
            ref={frame}
            title="VolunServe live disaster response map"
            srcDoc={mapDocument}
            sandbox="allow-scripts allow-same-origin"
          />

          {missionMode &&
            navigationActive &&
            ["responding", "on_site"].includes(missionAssignmentStatus) && (
              <div className="navigation-hud clean-navigation-hud" role="status">
                <div className="navigation-hud-turn">
                  <span className="navigation-arrow">
                    {navigationArrow(currentNavigationStep?.modifier)}
                  </span>
                  <div>
                    <small>NEXT DIRECTION</small>
                    <strong>
                      {roadRoute
                        ? routeStepInstruction(currentNavigationStep)
                        : routeLoading
                          ? "Calculating route…"
                          : "Waiting for road route…"}
                    </strong>
                    {currentNavigationStep && (
                      <span>
                        In {formatRoadDistance(currentNavigationStep.distanceMeters)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="navigation-hud-progress">
                  <strong>
                    {roadRoute
                      ? formatRoadDistance(roadRoute.distanceMeters)
                      : "—"}
                  </strong>
                  <span>
                    {roadRoute
                      ? `${formatDriveTime(roadRoute.durationSeconds)} remaining`
                      : "Waiting for route"}
                  </span>
                </div>
              </div>
            )}

          <div className="clean-map-legend">
            {isResidentMode && (
              <span><i className="legend-dot responder-dot" /> Volunteer</span>
            )}
            {missionMode && (
              <span><i className="legend-dot me" /> You</span>
            )}
            {(missionMode || isResidentMode) && (
              <span><i className="legend-dot incident" /> Resident / incident</span>
            )}
            {(missionMode || isResidentMode) && roadRoute && (
              <span><i className="legend-route-line" /> Road route</span>
            )}
            {!missionMode && !isResidentMode && (
              <>
                <span><i className="legend-dot incident" /> Incident</span>
                <span><i className="legend-dot center" /> Evacuation center</span>
              </>
            )}
          </div>
        </div>

        <aside className="details-card clean-details-card">
          {missionMode && selectedCase ? (
            <>
              <div className="clean-side-heading">
                <div>
                  <span className="clean-kicker">LIVE NAVIGATION</span>
                  <h2>
                    {missionAssignmentStatus === "on_site"
                      ? "You are on site"
                      : missionAssignmentStatus === "completed"
                        ? "Mission completed"
                        : "Navigation to resident"}
                  </h2>
                </div>
                <span className={`clean-status-pill status-${normalize(missionAssignmentStatus)}`}>
                  {statusLabel(missionAssignmentStatus || "accepted")}
                </span>
              </div>

              <div className="clean-destination-card">
                <span>GOING TO</span>
                <strong>
                  {usingResidentLiveDestination
                    ? "Resident live location"
                    : selectedCase.location ||
                      selectedCase.reporterAddress ||
                      "Resident emergency location"}
                </strong>
                <small>
                  {usingResidentLiveDestination
                    ? "Your current GPS is the start point. The blue road line follows the resident's fresh shared location while sharing remains active."
                    : "Your current GPS is the start point. The blue road line leads to the reported emergency location."}
                </small>
              </div>

              <div className="clean-metrics-grid">
                <div>
                  <span>Distance</span>
                  <strong>
                    {roadRoute
                      ? formatRoadDistance(roadRoute.distanceMeters)
                      : routeLoading
                        ? "…"
                        : "—"}
                  </strong>
                </div>
                <div>
                  <span>ETA</span>
                  <strong>
                    {roadRoute
                      ? formatDriveTime(roadRoute.durationSeconds)
                      : routeLoading
                        ? "…"
                        : "—"}
                  </strong>
                </div>
                <div>
                  <span>GPS</span>
                  <strong>{flow.canShare ? "LIVE" : tracking ? "READY" : "OFF"}</strong>
                </div>
              </div>

              {["responding", "on_site"].includes(missionAssignmentStatus) && (
                <div className="clean-next-turn">
                  <span className="navigation-arrow">
                    {navigationArrow(currentNavigationStep?.modifier)}
                  </span>
                  <div>
                    <small>NEXT DIRECTION</small>
                    <strong>
                      {roadRoute
                        ? routeStepInstruction(currentNavigationStep)
                        : routeLoading
                          ? "Calculating route…"
                          : routeError || "Waiting for a fresh GPS route…"}
                    </strong>
                  </div>
                </div>
              )}

              <div className="clean-person-card">
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
                    <span>{initialsFor(selectedCase.reporterName)}</span>
                  )}
                </div>
                <div>
                  <span>Resident</span>
                  <strong>{selectedCase.reporterName || "Resident"}</strong>
                  <small>
                    {selectedCase.contactNumber || "No contact number"}
                  </small>
                </div>
              </div>

              <div className="clean-info-block">
                <strong>Incident</strong>
                <p>{selectedCase.details || "No additional description"}</p>
              </div>

              <div className="clean-info-block">
                <strong>Assistance needed</strong>
                <p>
                  {Array.isArray(selectedCase.assistanceTypes) &&
                  selectedCase.assistanceTypes.length
                    ? selectedCase.assistanceTypes.join(", ")
                    : selectedCase.needs || "Not specified"}
                </p>
              </div>

              {selectedCase.needsNote && (
                <div className="clean-info-block attention">
                  <strong>Response instructions</strong>
                  <p>{selectedCase.needsNote}</p>
                </div>
              )}

              {missionAssignmentStatus === "accepted" && (
                <p className="clean-help-text">
                  Press <strong>Respond &amp; Share GPS</strong> above. GPS sharing and
                  in-app navigation will start together automatically.
                </p>
              )}

              {["responding", "on_site"].includes(missionAssignmentStatus) && (
                <p className="clean-help-text success">
                  Your responder location is being shared during this active mission.
                  Navigation stays inside VolunServe.
                </p>
              )}
            </>
          ) : isResidentMode && selectedCase ? (
            <>
              <div className="clean-side-heading">
                <div>
                  <span className="clean-kicker">RESPONDER STATUS</span>
                  <h2>
                    {residentDisplayedAssignment
                      ? residentDisplayedAssignment.volunteerName || "Assigned responder"
                      : "Waiting for responder"}
                  </h2>
                </div>
                {residentDisplayedAssignment && (
                  <span className={`clean-status-pill status-${residentAssignmentStatus}`}>
                    {statusLabel(residentDisplayedAssignment.status)}
                  </span>
                )}
              </div>

              {residentDisplayedAssignment &&
                ["responding", "on_site"].includes(residentAssignmentStatus) && (
                  <div className="clean-metrics-grid">
                    <div>
                      <span>Distance</span>
                      <strong>
                        {roadRoute
                          ? formatRoadDistance(roadRoute.distanceMeters)
                          : routeLoading
                            ? "…"
                            : "—"}
                      </strong>
                    </div>
                    <div>
                      <span>ETA</span>
                      <strong>
                        {roadRoute
                          ? formatDriveTime(roadRoute.durationSeconds)
                          : routeLoading
                            ? "…"
                            : "—"}
                      </strong>
                    </div>
                    <div>
                      <span>Volunteer GPS</span>
                      <strong>{residentResponderLastShared ? "LIVE" : "WAITING"}</strong>
                    </div>
                  </div>
                )}

              <div className="clean-resident-message">
                {residentAssignmentStatus === "completed"
                  ? "The volunteer marked the mission complete. Confirm the assistance from My Reports."
                  : residentAssignmentStatus === "on_site"
                    ? "Your volunteer has arrived at your location."
                    : residentAssignmentStatus === "responding"
                      ? residentResponderLastShared
                        ? "Your volunteer is on the way. The map and ETA update from their live GPS."
                        : "Your volunteer is on the way. Waiting for a fresh GPS update."
                      : residentAssignmentStatus === "accepted"
                        ? "Your volunteer accepted the assignment and will appear on the map when the response starts."
                        : "Admin is coordinating your emergency response."}
              </div>

              {routeError && residentAssignmentStatus === "responding" && (
                <p className="route-warning">{routeError}</p>
              )}

              {residentCanStartShare &&
                ["accepted", "responding", "on_site"].includes(
                  normalize(residentShareAssignment?.status),
                ) && (
                  <div className="clean-optional-share">
                    <div>
                      <strong>Share my moving location</strong>
                      <small>
                        Optional. If you move away from the original emergency pin, sharing updates the responder's route to your fresh location.
                      </small>
                    </div>
                    {residentShareCaseId === selectedCase.id ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={stopResidentSharing}
                      >
                        Stop sharing
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={beginResidentSharing}
                      >
                        Share location
                      </button>
                    )}
                  </div>
                )}

              <div className="clean-info-block">
                <strong>Original reported location</strong>
                <p>
                  {selectedCase.location ||
                    selectedCase.reporterAddress ||
                    "Emergency location saved"}
                </p>
              </div>
            </>
          ) : selectedCase ? (
            <>
              <span className={`severity severity-${normalize(selectedCase.severity || "medium")}`}>
                {String(selectedCase.severity || "medium").toUpperCase()}
              </span>
              <h2>{selectedCase.title || "Disaster case"}</h2>
              <p className="detail-type">{selectedCase.location || "Location pending"}</p>
              <div className="clean-info-block">
                <strong>Status</strong>
                <p>{statusLabel(selectedCase.status)}</p>
              </div>
              <div className="clean-info-block">
                <strong>Reporter</strong>
                <p>{selectedCase.reporterName || "Not provided"}</p>
              </div>
              <div className="clean-info-block">
                <strong>Details</strong>
                <p>{selectedCase.details || "No description provided"}</p>
              </div>
            </>
          ) : selectedCenter ? (
            <>
              <span className="severity center-badge">EVACUATION CENTER</span>
              <h2>{selectedCenter.name || "Evacuation center"}</h2>
              <p className="detail-type">
                {selectedCenter.address || selectedCenter.barangay || "Address pending"}
              </p>
              <div className="clean-info-block">
                <strong>Status</strong>
                <p>{String(selectedCenter.status || "available").toUpperCase()}</p>
              </div>
              <div className="clean-info-block">
                <strong>Occupancy</strong>
                <p>
                  {selectedCenter.occupied ?? 0}
                  {Number.isFinite(selectedCenter.capacity)
                    ? ` / ${selectedCenter.capacity}`
                    : ""}
                </p>
              </div>
            </>
          ) : (
            <div className="details-empty">
              <div className="details-icon">⌖</div>
              <h2>Select a map pin</h2>
              <p>Choose an incident or evacuation center to view the details.</p>
            </div>
          )}
        </aside>
      </section>

      {caseChatAvailable && selectedCase && caseChatAssignment && (
        <details className="clean-chat-card">
          <summary>
            <span>Case chat</span>
            <small>Optional communication with the other side</small>
          </summary>
          <CaseChat
            caseId={selectedCase.id}
            assignmentId={caseChatAssignment.id}
            assignmentStatus={caseChatAssignment.status}
            caseStatus={selectedCase.status}
            user={user}
            profile={profile}
            viewerRole={caseChatViewerRole}
          />
        </details>
      )}
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

.resident-responder-banner {
  width: min(1380px, 100%);
  margin: 0 auto 14px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid #d9d0f4;
  border-radius: 14px;
  background: linear-gradient(135deg, #faf8ff, #ffffff);
  box-shadow: 0 7px 24px rgba(76,29,149,.07);
}

.resident-responder-banner-main,
.resident-responder-banner-status {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.resident-responder-banner-main > strong {
  color: #4c1d95;
  font-size: 17px;
}

.resident-responder-banner-main > small,
.resident-responder-banner-status > small {
  color: #64748b;
  font-size: 10px;
}

.resident-responder-kicker {
  color: #7c3aed;
  font-size: 9px;
  font-weight: 950;
  letter-spacing: .09em;
}

.resident-responder-banner-status {
  align-items: flex-end;
  text-align: right;
}

.resident-responder-banner-status > strong {
  color: #0f2740;
  font-size: 16px;
}

.live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .05em;
}

.live-indicator i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #94a3b8;
}

.live-indicator.active {
  color: #15803d;
}

.live-indicator.active i {
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34,197,94,.12);
}

.legend-route-line {
  width: 18px;
  height: 4px;
  display: inline-block;
  border-radius: 999px;
  background: #7c3aed;
  box-shadow: 0 0 0 2px #fff;
}

.route-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-top: 12px;
}

.route-metrics > div {
  padding: 9px 8px;
  border: 1px solid #e4def7;
  border-radius: 10px;
  background: #fff;
}

.route-metrics strong,
.route-metrics span {
  display: block;
}

.route-metrics strong {
  color: #5b21b6;
  font-size: 13px;
}

.route-metrics span {
  margin-top: 2px;
  color: #64748b;
  font-size: 9px;
}

.route-warning {
  margin: 9px 0 0 !important;
  padding: 8px 9px;
  border: 1px solid #fed7aa;
  border-radius: 9px;
  background: #fff7ed;
  color: #9a3412 !important;
}

.mission-navigation-card {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-color: #d9d0f4 !important;
  background: #faf8ff !important;
}

.mission-navigation-card > div {
  min-width: 0;
}

.mission-navigation-card .primary-button,
.mission-navigation-card .secondary-button {
  flex: 0 0 auto;
}

.navigation-stop-button {
  border-color: #fecaca !important;
  background: #fff1f2 !important;
  color: #be123c !important;
}

.navigation-card-step {
  margin-top: 10px;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 10px;
  border: 1px solid #c4b5fd;
  border-radius: 10px;
  background: #ffffff;
}

.navigation-card-step > span {
  flex: 0 0 auto;
  color: #6d28d9;
  font-size: 26px;
  font-weight: 900;
  line-height: 1;
}

.navigation-card-step b,
.navigation-card-step small {
  display: block;
}

.navigation-card-step b {
  color: #312e81;
  font-size: 12px;
  line-height: 1.35;
}

.navigation-card-step small {
  margin-top: 3px;
  color: #64748b;
  font-size: 10px;
}

.navigation-paused-note {
  display: block;
  margin-top: 8px;
  color: #b45309 !important;
  font-weight: 800;
}

.navigation-hud {
  position: absolute;
  z-index: 8;
  top: 16px;
  left: 50%;
  width: min(620px, calc(100% - 110px));
  transform: translateX(-50%);
  overflow: hidden;
  border: 1px solid rgba(196,181,253,.95);
  border-radius: 16px;
  background: rgba(255,255,255,.96);
  box-shadow: 0 14px 38px rgba(15,23,42,.18);
  backdrop-filter: blur(10px);
}

.navigation-hud-turn {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
}

.navigation-arrow {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: #6d28d9;
  color: #fff;
  font-size: 30px;
  font-weight: 900;
}

.navigation-hud-turn small,
.navigation-hud-turn strong,
.navigation-hud-turn span {
  display: block;
}

.navigation-hud-turn small {
  color: #7c3aed;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .08em;
}

.navigation-hud-turn strong {
  margin-top: 2px;
  color: #111827;
  font-size: 17px;
  line-height: 1.25;
}

.navigation-hud-turn span {
  margin-top: 3px;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.navigation-hud-progress {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid #ede9fe;
  background: #f5f3ff;
}

.navigation-hud-progress strong {
  color: #5b21b6;
  font-size: 20px;
}

.navigation-hud-progress span {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.navigation-next-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-top: 1px solid #ede9fe;
  color: #475569;
  font-size: 11px;
}

.navigation-next-step span {
  color: #7c3aed;
  font-weight: 900;
  text-transform: uppercase;
}

.navigation-next-step strong {
  font-weight: 800;
}

.navigation-arrival-note {
  padding: 10px 16px;
  border-top: 1px solid #bbf7d0;
  background: #f0fdf4;
  color: #166534;
  font-size: 11px;
  font-weight: 800;
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

@media (max-width: 760px) {
  .resident-responder-banner {
    align-items: flex-start;
    flex-direction: column;
  }

  .resident-responder-banner-status {
    align-items: flex-start;
    text-align: left;
  }

  .route-metrics {
    grid-template-columns: 1fr;
  }

  .mission-navigation-card {
    align-items: stretch;
    flex-direction: column;
  }

  .mission-navigation-card .primary-button,
  .mission-navigation-card .secondary-button {
    width: 100%;
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

  .navigation-hud {
    top: 10px;
    width: calc(100% - 24px);
  }

  .navigation-hud-turn {
    grid-template-columns: 46px minmax(0, 1fr);
    gap: 9px;
    padding: 11px 12px;
  }

  .navigation-arrow {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    font-size: 24px;
  }

  .navigation-hud-turn strong {
    font-size: 14px;
  }

  .navigation-hud-progress,
  .navigation-next-step,
  .navigation-arrival-note {
    padding-left: 12px;
    padding-right: 12px;
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


/* =========================================================
   FINAL CLEAN RESIDENT / VOLUNTEER TRACKING DESIGN
   ========================================================= */
.response-map-page {
  --vs-navy: #12345b;
  --vs-blue: #2563eb;
  --vs-teal: #0f8f83;
  --vs-green: #16a36a;
  --vs-red: #e94b58;
  --vs-border: #dce7ee;
  --vs-muted: #64748b;
  --vs-bg: #f5f9fb;
}

.clean-map-header {
  align-items: center;
  gap: 18px;
  margin-bottom: 14px;
  padding: 18px 20px;
  border: 1px solid var(--vs-border);
  border-radius: 18px;
  background: linear-gradient(135deg, #ffffff, #f3fbfa);
  box-shadow: 0 10px 30px rgba(15, 39, 64, .06);
}

.clean-map-header h1 {
  margin: 4px 0 3px;
  color: var(--vs-navy);
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1.05;
}

.clean-map-header p {
  margin: 0;
  color: var(--vs-muted);
}

.clean-live-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid #d7e3ea;
  border-radius: 999px;
  background: #fff;
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .04em;
}

.clean-live-badge span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #94a3b8;
}

.clean-live-badge.active {
  border-color: #b8e7d2;
  background: #edfdf5;
  color: #08794f;
}

.clean-live-badge.active span {
  background: #16a36a;
  box-shadow: 0 0 0 5px rgba(22,163,106,.12);
}

.clean-alert {
  margin: 0 0 12px;
  padding: 11px 13px;
  border: 1px solid #fecaca;
  border-radius: 12px;
  background: #fff5f5;
  color: #b42318;
  font-size: 13px;
  font-weight: 700;
}

.clean-flow-card {
  margin-bottom: 14px;
  overflow: hidden;
  border: 1px solid var(--vs-border);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15,39,64,.05);
}

.clean-flow-summary {
  display: grid;
  grid-template-columns: minmax(240px, 1.7fr) minmax(180px, 1fr) 120px 120px;
  gap: 12px;
  align-items: center;
  padding: 16px 18px;
}

.clean-flow-summary h2 {
  margin: 3px 0 2px;
  color: var(--vs-navy);
  font-size: 18px;
}

.clean-flow-summary p,
.clean-summary-person small {
  margin: 0;
  color: var(--vs-muted);
  font-size: 12px;
}

.clean-destination-line {
  margin-top: 8px;
}

.clean-destination-line span,
.clean-destination-card > span {
  display: block;
  color: #708399;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.clean-destination-line strong {
  display: block;
  margin-top: 2px;
  color: #0f2740;
  font-size: 13px;
  line-height: 1.35;
}

.clean-kicker,
.clean-summary-person > span,
.clean-summary-metric > span {
  display: block;
  color: #708399;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.clean-summary-person,
.clean-summary-metric {
  min-width: 0;
  padding: 10px 12px;
  border-left: 1px solid #e7eef3;
}

.clean-summary-person strong,
.clean-summary-metric strong {
  display: block;
  margin-top: 3px;
  color: var(--vs-navy);
  font-size: 15px;
}

.clean-summary-metric strong {
  font-size: 20px;
}

.clean-flow-steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid #e8eff4;
  background: #f9fcfd;
}

.clean-flow-step {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  padding: 10px;
  color: #7a8da1;
  font-size: 12px;
  font-weight: 800;
}

.clean-flow-step:not(:last-child)::after {
  content: "";
  position: absolute;
  top: 50%;
  right: -14%;
  width: 28%;
  height: 2px;
  background: #dbe5eb;
}

.clean-flow-step i {
  position: relative;
  z-index: 1;
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  border: 2px solid #cbd8e0;
  border-radius: 50%;
  background: #fff;
  font-style: normal;
  font-size: 11px;
}

.clean-flow-step.done,
.clean-flow-step.current {
  color: #0f766e;
}

.clean-flow-step.done i {
  border-color: #16a36a;
  background: #16a36a;
  color: #fff;
}

.clean-flow-step.current i {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
  box-shadow: 0 0 0 5px rgba(37,99,235,.10);
}

.clean-map-layout {
  grid-template-columns: minmax(0, 1.75fr) minmax(300px, .72fr);
  gap: 14px;
  align-items: stretch;
}

.clean-map-card {
  min-height: 620px;
  border-radius: 18px;
  border: 1px solid var(--vs-border);
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(15,39,64,.08);
}

.clean-map-card iframe {
  min-height: 620px;
}

.clean-navigation-hud {
  top: 14px;
  left: 14px;
  right: auto;
  width: min(430px, calc(100% - 28px));
  border: 1px solid rgba(37,99,235,.18);
  border-radius: 16px;
  background: rgba(255,255,255,.96);
  backdrop-filter: blur(12px);
}

.clean-map-legend {
  position: absolute;
  z-index: 4;
  left: 14px;
  bottom: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  max-width: calc(100% - 28px);
  padding: 9px 11px;
  border: 1px solid rgba(203,213,225,.9);
  border-radius: 12px;
  background: rgba(255,255,255,.94);
  box-shadow: 0 8px 22px rgba(15,23,42,.10);
  color: #475569;
  font-size: 10px;
  font-weight: 800;
}

.clean-map-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.responder-dot {
  background: #7c3aed !important;
}

.clean-details-card {
  min-height: 620px;
  padding: 18px;
  border: 1px solid var(--vs-border);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(15,39,64,.06);
}

.clean-side-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.clean-side-heading h2 {
  margin: 4px 0 0;
  color: var(--vs-navy);
  font-size: 19px;
}

.clean-status-pill {
  flex: 0 0 auto;
  padding: 6px 9px;
  border-radius: 999px;
  background: #eef4f7;
  color: #51677b;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.status-responding,
.status-on_site {
  background: #e7f8f3;
  color: #087963;
}

.status-completed {
  background: #eaf7ee;
  color: #19734b;
}

.clean-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}

.clean-destination-card {
  margin: 12px 0 14px;
  padding: 12px 13px;
  border: 1px solid #dbe8f5;
  border-radius: 12px;
  background: #f7fbff;
}

.clean-destination-card strong,
.clean-destination-card small {
  display: block;
}

.clean-destination-card strong {
  margin-top: 4px;
  color: var(--vs-navy);
  font-size: 14px;
  line-height: 1.35;
}

.clean-destination-card small {
  margin-top: 5px;
  color: var(--vs-muted);
  font-size: 10.5px;
  line-height: 1.45;
}

.clean-metrics-grid > div {
  min-width: 0;
  padding: 11px 9px;
  border: 1px solid #e1e9ef;
  border-radius: 12px;
  background: #f9fcfd;
  text-align: center;
}

.clean-metrics-grid span,
.clean-metrics-grid strong {
  display: block;
}

.clean-metrics-grid span {
  color: #73879a;
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
}

.clean-metrics-grid strong {
  margin-top: 4px;
  color: var(--vs-navy);
  font-size: 17px;
}

.clean-next-turn {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
  padding: 13px;
  border: 1px solid #cfe0ff;
  border-radius: 13px;
  background: #f3f7ff;
}

.clean-next-turn > div {
  min-width: 0;
}

.clean-next-turn small,
.clean-next-turn strong {
  display: block;
}

.clean-next-turn small {
  color: #5f7792;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .06em;
}

.clean-next-turn strong {
  margin-top: 3px;
  color: #163b67;
  font-size: 13px;
}

.clean-person-card {
  display: flex;
  gap: 11px;
  align-items: center;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid #e2eaf0;
  border-radius: 13px;
  background: #fff;
}

.clean-person-card > div:last-child {
  min-width: 0;
}

.clean-person-card span,
.clean-person-card strong,
.clean-person-card small {
  display: block;
}

.clean-person-card span {
  color: #7b8da0;
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
}

.clean-person-card strong {
  margin-top: 2px;
  color: var(--vs-navy);
}

.clean-person-card small {
  margin-top: 2px;
  color: var(--vs-muted);
}

.clean-info-block {
  padding: 12px 0;
  border-top: 1px solid #e9eef2;
}

.clean-info-block strong {
  display: block;
  margin-bottom: 4px;
  color: #2f455b;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.clean-info-block p {
  margin: 0;
  color: #52687c;
  font-size: 12px;
  line-height: 1.5;
}

.clean-info-block.attention {
  margin-top: 4px;
  padding: 11px;
  border: 1px solid #fde4b7;
  border-radius: 11px;
  background: #fff9ed;
}

.clean-help-text,
.clean-resident-message {
  margin: 12px 0 0;
  padding: 11px 12px;
  border-radius: 11px;
  background: #f1f6fb;
  color: #496177;
  font-size: 12px;
  line-height: 1.5;
}

.clean-help-text.success,
.clean-resident-message {
  background: #eefaf5;
  color: #276554;
}

.clean-optional-share {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #dce8ee;
  border-radius: 12px;
  background: #f9fcfd;
}

.clean-optional-share strong,
.clean-optional-share small {
  display: block;
}

.clean-optional-share strong {
  color: #29445f;
  font-size: 12px;
}

.clean-optional-share small {
  margin-top: 3px;
  color: #718499;
  font-size: 10px;
  line-height: 1.4;
}

.clean-chat-card {
  margin-top: 14px;
  border: 1px solid var(--vs-border);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15,39,64,.05);
}

.clean-chat-card > summary {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  cursor: pointer;
  list-style: none;
  color: var(--vs-navy);
  font-weight: 900;
}

.clean-chat-card > summary::-webkit-details-marker {
  display: none;
}

.clean-chat-card > summary small {
  color: #7b8da0;
  font-size: 10px;
  font-weight: 700;
}

.admin-map-toolbar {
  margin-bottom: 14px;
}

.response-map-page.volunteer-map-mode .mission-action-bar {
  margin-bottom: 14px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(15,39,64,.05);
}

.response-map-page.volunteer-map-mode .mission-action-copy strong {
  color: var(--vs-navy);
}

@media (max-width: 1100px) {
  .clean-flow-summary {
    grid-template-columns: 1fr 1fr;
  }

  .clean-summary-metric,
  .clean-summary-person {
    border-left: 0;
    border-top: 1px solid #e7eef3;
  }

  .clean-map-layout {
    grid-template-columns: 1fr;
  }

  .clean-details-card,
  .clean-map-card,
  .clean-map-card iframe {
    min-height: 520px;
  }
}

@media (max-width: 680px) {
  .clean-map-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .clean-flow-summary {
    grid-template-columns: 1fr;
  }

  .clean-summary-person,
  .clean-summary-metric {
    border-left: 0;
    border-top: 1px solid #e7eef3;
  }

  .clean-flow-steps {
    grid-template-columns: repeat(2, 1fr);
  }

  .clean-flow-step:nth-child(2)::after {
    display: none;
  }

  .clean-map-card,
  .clean-map-card iframe,
  .clean-details-card {
    min-height: 460px;
  }

  .clean-metrics-grid {
    grid-template-columns: 1fr;
  }

  .clean-optional-share {
    align-items: stretch;
    flex-direction: column;
  }

  .clean-chat-card > summary {
    flex-direction: column;
  }
}

`