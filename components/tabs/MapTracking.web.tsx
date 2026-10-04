import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
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
  activeLguResponderUid?: string;
  activeLguResponderName?: string;
  officialLguResponseStatus?: string;
  lguArrivalConfirmationStatus?: string;
  lguArrivalReportedAt?: any;
  lguArrivalConfirmedAt?: any;
  lguArrivalConfirmedBy?: string;
  lguArrivalAssignmentId?: string;
  lguArrivalResponderUid?: string;
  activeVolunteerSupportUid?: string;
  activeVolunteerSupportName?: string;
  activeVolunteerSupportAssignmentId?: string;
  activeResponderAssignmentId?: string;
  assignedLguPersonnelIds?: string[];
  activeLguHeartbeatAt?: any;
  activeLguStartedAt?: any;
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
  | { kind: "volunteer"; id: string }
  | null;

const BACKEND_URL = "https://volunserve.onrender.com";

const SJDM_CENTER = {
  latitude: 14.813,
  longitude: 121.045,
};

const LGU_BASE = {
  id: "csjdm-lgu-base",
  name: "LGU Base / CDRRMO",
  address:
    "Del Monte Road, Sapang Palay Proper, San Jose del Monte, 3023 Bulacan, Philippines",
  latitude: 14.838344,
  longitude: 121.046243,
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
      background: #64748b;
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

    .lgu-base-marker {
      position: relative;
      width: 32px;
      height: 32px;
    }

    .lgu-base-marker .pin {
      position: absolute;
      inset: 0;
      background: #dc2626;
    }

    .lgu-base-label {
      position: absolute;
      left: 50%;
      bottom: 39px;
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
      let baseMarkers = [];
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
        if (item.destination || item.residentPin) {
          const wrapper = document.createElement("div");
          wrapper.className = "destination-marker";

          const pin = document.createElement("div");
          pin.className = "pin";
          pin.style.background = "#16a34a";
          pin.innerHTML = "<span>R</span>";

          if (item.destination || item.residentSelf) {
            const label = document.createElement("div");
            label.className = "destination-label";
            label.textContent = item.residentSelf
              ? "RESIDENT · YOU"
              : "RESIDENT DESTINATION";
            label.style.color = "#15803d";
            wrapper.appendChild(label);
          }

          wrapper.appendChild(pin);
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

      function makeLguBaseElement() {
        const wrapper = document.createElement("div");
        wrapper.className = "lgu-base-marker";

        const label = document.createElement("div");
        label.className = "lgu-base-label";
        label.textContent = "LGU BASE";

        const pin = document.createElement("div");
        pin.className = "pin";
        pin.innerHTML = "<span>⌂</span>";

        wrapper.appendChild(label);
        wrapper.appendChild(pin);
        return wrapper;
      }

      function makeUserElement(role) {
        const wrapper = document.createElement("div");
        wrapper.className = "user-marker";

        const dot = document.createElement("div");
        dot.className = "user-pin";

        const label = document.createElement("div");
        label.className = "user-label";

        if (role === "admin") {
          dot.style.background = "#dc2626";
          dot.style.boxShadow =
            "0 0 0 8px rgba(220,38,38,.16), 0 5px 16px rgba(15,23,42,.25)";
          label.textContent = "LGU · YOU";
          label.style.color = "#b91c1c";
        } else if (role === "resident") {
          dot.style.background = "#16a34a";
          dot.style.boxShadow =
            "0 0 0 8px rgba(22,163,74,.16), 0 5px 16px rgba(15,23,42,.25)";
          label.textContent = "RESIDENT · YOU";
          label.style.color = "#15803d";
        } else {
          dot.style.background = "#2563eb";
          label.textContent = "VOLUNTEER · YOU";
        }

        wrapper.appendChild(dot);
        wrapper.appendChild(label);
        return wrapper;
      }

      function makeResidentElement() {
        const element = document.createElement("div");
        element.className = "pin";
        element.style.background = "#16a34a";
        element.innerHTML = "<span>R</span>";
        return element;
      }

      function responderRoleOf(person) {
        return person?.role === "lgu" || person?.responderRole === "lgu"
          ? "lgu"
          : "volunteer";
      }

      function responderColor(stale, role) {
        // Keep role colors stable even when a reading becomes old.
        // STALE is communicated by status text/popup, not by changing pin color.
        if (role === "lgu") return "#dc2626";
        return "#2563eb";
      }

      function makeResponderElement(stale, role) {
        const element = document.createElement("div");
        element.className = "pin";
        element.style.background = responderColor(stale, role);
        element.innerHTML = role === "lgu"
          ? "<span>L</span>"
          : "<span>V</span>";
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

      function pointDistanceMeters(a, b) {
        if (
          !a ||
          !b ||
          !validPoint(a.latitude, a.longitude) ||
          !validPoint(b.latitude, b.longitude)
        ) {
          return Infinity;
        }

        const toRad = (value) => value * Math.PI / 180;
        const earthRadius = 6371000;
        const lat1 = toRad(a.latitude);
        const lat2 = toRad(b.latitude);
        const dLat = toRad(b.latitude - a.latitude);
        const dLng = toRad(b.longitude - a.longitude);
        const h =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1) * Math.cos(lat2) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);

        return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      }

      function responderVisualOffset(person, incidentPoints) {
        const nearResident = (incidentPoints || []).some(
          (point) => pointDistanceMeters(person, point) <= 20
        );

        if (!nearResident) {
          return [0, 0];
        }

        const role = responderRoleOf(person);

        // Display-only separation. Real GPS coordinates, route calculations,
        // distance, ETA, and Firestore data remain untouched.
        return role === "lgu" ? [-20, 0] : [20, 0];
      }

      function syncResponderMarkers(people, bounds, incidentPoints = []) {
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

          const responderRole = responderRoleOf(person);
          const visualOffset = responderVisualOffset(person, incidentPoints);
          let marker = responderMarkers.get(id);

          if (!marker) {
            const element = makeResponderElement(person.stale, responderRole);
            element.style.zIndex = responderRole === "lgu" ? "40" : "35";

            if (person.selectable !== false) {
              element.addEventListener("click", () => {
                parent.postMessage(
                  {
                    kind: "select-map-item",
                    entityType: "volunteer",
                    id,
                  },
                  "*"
                );
              });
            }

            marker = new maplibregl.Marker({ element })
              .setLngLat([person.longitude, person.latitude])
              .setOffset(visualOffset)
              .setPopup(
                new maplibregl.Popup({ offset: 22 })
              )
              .addTo(map);

            responderMarkers.set(id, marker);
          } else {
            const element = marker.getElement();
            element.style.background = responderColor(
              person.stale,
              responderRole,
            );
            element.style.zIndex = responderRole === "lgu" ? "40" : "35";
            element.innerHTML = responderRole === "lgu"
              ? "<span>L</span>"
              : "<span>V</span>";
            marker.setOffset(visualOffset);

            animateResponderMarker(
              marker,
              person.longitude,
              person.latitude
            );
          }

          marker.getPopup()?.setText(
            (person.name || (responderRole === "lgu" ? "LGU responder" : "Assigned responder")) +
            (responderRole === "lgu" ? " · LGU" : " · Volunteer") +
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

        for (const marker of baseMarkers) {
          marker.remove();
        }

        for (const marker of residentMarkers) {
          marker.remove();
        }

        incidentMarkers = [];
        centerMarkers = [];
        baseMarkers = [];
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

      function updateLocation(location, follow, role) {
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
            element: makeUserElement(role),
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
        const incidentPoints = [];
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
            (item.reporterName || "Resident") +
            " · " +
            (item.title || "Emergency case") +
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
          incidentPoints.push({
            latitude: item.latitude,
            longitude: item.longitude,
          });
          bounds.extend([
            item.longitude,
            item.latitude
          ]);
          pointCount += 1;
        }

        for (const item of payload.bases || []) {
          if (!validPoint(item.latitude, item.longitude)) {
            continue;
          }

          const element = makeLguBaseElement();

          const popup = new maplibregl.Popup({
            offset: 22,
            closeButton: false,
          }).setText(
            [item.name || "LGU Base", item.address || ""]
              .filter(Boolean)
              .join(" · ")
          );

          const marker = new maplibregl.Marker({ element })
            .setLngLat([
              item.longitude,
              item.latitude
            ])
            .setPopup(popup)
            .addTo(map);

          baseMarkers.push(marker);

          // In Volunteer navigation mode the fixed LGU base remains visible,
          // but it must not force the camera to zoom away from the active
          // Volunteer -> Resident route. The responder can still pan/zoom to it.
          if (!payload.navigationView) {
            bounds.extend([
              item.longitude,
              item.latitude
            ]);
            pointCount += 1;
          }
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

        if (payload.navigationView) {
          // Keep LGU/Volunteer responder pins rendered, but do not let an old
          // or distant responder reading stretch the active navigation camera.
          // The route + destination + this device GPS define the mission view.
          const responderDisplayBounds = new maplibregl.LngLatBounds();
          syncResponderMarkers(
            payload.responders || [],
            responderDisplayBounds,
            incidentPoints
          );
        } else {
          pointCount += syncResponderMarkers(
            payload.responders || [],
            bounds,
            incidentPoints
          );
        }

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
            data.follow === true,
            data.role || "volunteer"
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
            "line-color": "#7c3aed",
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

  const currentMode = activeModeForProfile(profile);

  const accountRole = String(profile?.role || "").trim().toLowerCase();

  const isAdministrator = ["admin", "superadmin"].includes(accountRole);

  const isLguPersonnel = accountRole === "lgu_personnel";

  const isOperationalLgu = isAdministrator || isLguPersonnel;

  const isVolunteerMode =
    !isAdministrator &&
    !isLguPersonnel &&
    currentMode === "volunteer" &&
    hasVolunteerAccess(profile);

  const isResidentMode =
    !isAdministrator &&
    !isLguPersonnel &&
    currentMode === "resident";

  const missionMode =
    !!focusedCaseId && isVolunteerMode;

  // Reuse the proven LGU navigation experience for two official roles:
  // Admin direct-response and the specifically assigned LGU Personnel account.
  const adminMissionMode =
    !!focusedCaseId && isOperationalLgu;

  const lguPersonnelMissionMode =
    !!focusedCaseId && isLguPersonnel;

  const volunteerOverviewMode =
    isVolunteerMode && !missionMode;

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
  const [lguAssignmentStatus, setLguAssignmentStatus] = useState("");
  const [lguArrivalBusy, setLguArrivalBusy] = useState(false);
  const [lguArrivalMessage, setLguArrivalMessage] = useState("");
  const [lguArrivalError, setLguArrivalError] = useState("");
  const [residentArrivalBusy, setResidentArrivalBusy] = useState(false);
  const [residentArrivalMessage, setResidentArrivalMessage] = useState("");
  const [residentArrivalError, setResidentArrivalError] = useState("");

  const [adminAssignments, setAdminAssignments] = useState<any[]>([]);
  const [adminResponderLocations, setAdminResponderLocations] = useState<any[]>([]);

  const [residentAssignments, setResidentAssignments] =
    useState<any[]>([]);
  const [residentResponderLocations, setResidentResponderLocations] =
    useState<any[]>([]);
  const [residentLguLocation, setResidentLguLocation] =
    useState<any | null>(null);
  const [adminLguLocation, setAdminLguLocation] =
    useState<any | null>(null);
  const [volunteerLguLocation, setVolunteerLguLocation] =
    useState<any | null>(null);
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
  const lguWriteQueue = useRef<Promise<unknown>>(
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
          data.entityType === "center" ||
          data.entityType === "volunteer"
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

    // Authorized LGU/Admin sees active emergency cases on the command map.
    // Navigation can be opened for a focused case even when no volunteer is available.
    if (isAdministrator) {
      return onSnapshot(
        collection(db, "disasterCases"),
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
          console.error("admin disasterCases map listener", cause);
          setCases([]);
          setError(
            "Could not load emergency cases. Check Admin Firestore permissions and your connection.",
          );
        },
      );
    }

    // Dedicated LGU Personnel may open only the exact case assigned to them.
    // Firestore independently verifies assignedLguPersonnelIds for this read.
    if (lguPersonnelMissionMode) {
      const caseRef = doc(db, "disasterCases", focusedCaseId);

      return onSnapshot(
        caseRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            setCases([]);
            setError("Assigned LGU emergency case was not found.");
            return;
          }

          const data = snapshot.data() as Omit<CaseRow, "id">;
          const assignedIds = Array.isArray((data as any).assignedLguPersonnelIds)
            ? (data as any).assignedLguPersonnelIds.map(String)
            : [];

          if (
            !user?.uid ||
            !assignedIds.includes(user.uid)
          ) {
            setCases([]);
            setError(
              "This emergency is not assigned to your LGU Personnel account."
            );
            return;
          }

          setCases([
            {
              id: snapshot.id,
              ...data,
            },
          ]);
          setError("");
        },
        (cause) => {
          console.error("assigned LGU disaster case listener", cause);
          setCases([]);
          setError(
            "Could not open this assigned LGU incident. Check the active assignment and Firestore permissions."
          );
        },
      );
    }

    // A dedicated LGU Personnel account never browses unrelated emergency cases.
    if (isLguPersonnel) {
      setCases([]);
      setError(
        focusedCaseId
          ? ""
          : "Open Map & Route from your active LGU emergency assignment."
      );
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
    if (isVolunteerMode) {
      setCases([]);
      setError("");
      return;
    }

    const casesQuery = query(
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
    isLguPersonnel,
    isVolunteerMode,
    lguPersonnelMissionMode,
    missionMode,
    focusedCaseId,
  ]);

  useEffect(() => {
    if (missionMode || adminMissionMode || isResidentMode) {
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
  }, [missionMode, adminMissionMode, isResidentMode]);

  const visibleCases = useMemo(() => {
    if (missionMode || adminMissionMode) {
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
    adminMissionMode,
    focusedCaseId,
  ]);

  const visibleCenters = useMemo(() => {
    if (missionMode || adminMissionMode || isResidentMode || !showCenters) return [];

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
  }, [centers, search, showCenters, missionMode, adminMissionMode, isResidentMode]);

  const residentActiveCases = useMemo(
    () =>
      isResidentMode
        ? cases.filter((item) =>
            ["reported", "validated", "assigned", "in_progress"].includes(
              normalize(item.status),
            ),
          )
        : [],
    [cases, isResidentMode],
  );

  const residentBoundCase = useMemo(
    () =>
      isResidentMode && focusedCaseId
        ? residentActiveCases.find((item) => item.id === focusedCaseId) || null
        : null,
    [isResidentMode, focusedCaseId, residentActiveCases],
  );

  const missionCase = useMemo(
    () =>
      missionMode
        ? cases.find((item) => item.id === focusedCaseId) || null
        : null,
    [cases, missionMode, focusedCaseId],
  );

  const adminCase = useMemo(
    () =>
      adminMissionMode
        ? cases.find((item) => item.id === focusedCaseId) || null
        : null,
    [cases, adminMissionMode, focusedCaseId],
  );

  useEffect(() => {
    if (
      !lguPersonnelMissionMode ||
      !adminCase?.activeResponderAssignmentId ||
      !user?.uid
    ) {
      setLguAssignmentStatus("");
      return;
    }

    return onSnapshot(
      doc(
        db,
        "lguAssignments",
        adminCase.activeResponderAssignmentId,
      ),
      (snapshot) => {
        if (!snapshot.exists()) {
          setLguAssignmentStatus("");
          return;
        }

        const data: any = snapshot.data();

        if (String(data.personnelUid || "") !== user.uid) {
          setLguAssignmentStatus("");
          return;
        }

        setLguAssignmentStatus(
          String(data.status || "").trim().toLowerCase(),
        );
      },
      (cause) => {
        console.error("LGU assignment status listener", cause);
        setLguArrivalError(
          "Could not refresh the current LGU assignment status.",
        );
      },
    );
  }, [
    adminCase?.activeResponderAssignmentId,
    lguPersonnelMissionMode,
    user?.uid,
  ]);

  useEffect(() => {
    const focusedCase = missionCase || adminCase;
    if ((missionMode || adminMissionMode) && focusedCase) {
      setSelected({
        kind: "incident",
        id: focusedCase.id,
      });
    }
  }, [missionMode, adminMissionMode, missionCase?.id, adminCase?.id]);

  const selectedCase = useMemo(() => {
    if (missionMode) {
      return missionCase;
    }

    if (adminMissionMode) {
      return adminCase;
    }

    if (isResidentMode) {
      return residentBoundCase;
    }

    if (volunteerOverviewMode) {
      return null;
    }

    if (selected?.kind !== "incident") {
      return null;
    }

    return (
      cases.find(
        (item) => item.id === selected.id,
      ) || null
    );
  }, [
    cases,
    selected,
    missionMode,
    missionCase,
    adminMissionMode,
    adminCase,
    isResidentMode,
    residentBoundCase,
    volunteerOverviewMode,
  ]);

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

  const selectedAdminVolunteer = useMemo(() => {
    if (!isAdministrator || selected?.kind !== "volunteer") {
      return null;
    }

    const point = adminResponderLocations.find((item) => {
      const id = String(
        item.id || item.volunteerId || item.assignmentId || "",
      );
      return id === selected.id;
    });

    if (!point) return null;

    const assignment = adminAssignments.find(
      (item) =>
        item.volunteerId === point.volunteerId &&
        (!point.caseId || item.caseId === point.caseId) &&
        ["accepted", "responding", "on_site"].includes(
          normalize(item.status),
        ),
    );

    return {
      ...point,
      name: assignment?.volunteerName || point.volunteerName || "Volunteer",
      status: assignment?.status || point.status || "responding",
      caseId: point.caseId || assignment?.caseId || "",
      assignmentId: assignment?.id || point.assignmentId || "",
    };
  }, [
    isAdministrator,
    selected,
    adminResponderLocations,
    adminAssignments,
  ]);

  // Admin command-map data. This stays separate from Volunteer mission sharing,
  // so the LGU can still respond even when no volunteer is available.
  useEffect(() => {
    setAdminAssignments([]);
    setAdminResponderLocations([]);

    if (!isAdministrator || !user || !profile || !isApprovedProfile(profile)) {
      return;
    }

    const disposeAssignments = onSnapshot(
      collection(db, "responseAssignments"),
      (snapshot) => {
        setAdminAssignments(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        );
      },
      (cause) => {
        console.error("admin response assignments", cause);
      },
    );

    const disposeLocations = onSnapshot(
      collection(db, "responseLocations"),
      (snapshot) => {
        setAdminResponderLocations(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        );
      },
      (cause) => {
        console.error("admin responder locations", cause);
      },
    );

    return () => {
      disposeAssignments();
      disposeLocations();
    };
  }, [isAdministrator, user?.uid, profile]);

  // Resident response tracking is case-bound. If there is exactly one active
  // emergency, open it automatically. If there are two or more, do not guess:
  // the Resident explicitly chooses which emergency to track.
  useEffect(() => {
    if (!isResidentMode) {
      return;
    }

    if (residentBoundCase) {
      if (
        selected?.kind !== "incident" ||
        selected.id !== residentBoundCase.id
      ) {
        setSelected({
          kind: "incident",
          id: residentBoundCase.id,
        });
      }
      return;
    }

    if (!focusedCaseId && residentActiveCases.length === 1) {
      const onlyCase = residentActiveCases[0];

      setSelected({
        kind: "incident",
        id: onlyCase.id,
      });

      router.replace(
        `/map-tracking?caseId=${encodeURIComponent(onlyCase.id)}` as any,
      );
      return;
    }

    if (!focusedCaseId && selected?.kind === "incident") {
      setSelected(null);
    }
  }, [
    isResidentMode,
    focusedCaseId,
    residentActiveCases,
    residentBoundCase?.id,
    selected,
    router,
  ]);

  const residentPreferredCase = useMemo(
    () => (isResidentMode ? residentBoundCase : null),
    [isResidentMode, residentBoundCase],
  );

  const residentCoordinationCaseId = isResidentMode
    ? residentPreferredCase?.id || ""
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

  useEffect(() => {
    setResidentArrivalMessage("");
    setResidentArrivalError("");
  }, [residentCoordinationCaseId]);

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

  const residentVolunteerSupportAssignmentId = String(
    residentCoordinationCase?.activeVolunteerSupportAssignmentId || "",
  ).trim();

  // Only the case's explicitly selected optional Volunteer support assignment
  // is allowed to appear in the Resident response view. Historical/test
  // responseAssignments can no longer replace the official LGU responder.
  const residentPrimaryAssignment = useMemo(() => {
    if (
      !residentCoordinationCaseId ||
      !residentVolunteerSupportAssignmentId
    ) {
      return null;
    }

    return (
      residentAssignments.find(
        (assignment) =>
          assignment.id === residentVolunteerSupportAssignmentId &&
          assignment.caseId === residentCoordinationCaseId,
      ) || null
    );
  }, [
    residentAssignments,
    residentCoordinationCaseId,
    residentVolunteerSupportAssignmentId,
  ]);

  const residentShareAssignment = useMemo(
    () =>
      residentPrimaryAssignment &&
      ["accepted", "responding", "on_site"].includes(
        normalize(residentPrimaryAssignment.status),
      )
        ? residentPrimaryAssignment
        : null,
    [residentPrimaryAssignment],
  );

  // Resident sees only the live GPS documents of responders actively assigned
  // to the selected case. Each document id is the volunteer uid.
  useEffect(() => {
    setResidentResponderLocations([]);

    if (!isResidentMode || !residentCoordinationCaseId) {
      return;
    }

    const activeAssignments =
      residentShareAssignment &&
      ["responding", "on_site"].includes(
        normalize(residentShareAssignment.status),
      ) &&
      typeof residentShareAssignment.volunteerId === "string" &&
      residentShareAssignment.volunteerId
        ? [residentShareAssignment]
        : [];

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
    residentShareAssignment?.id,
    residentShareAssignment?.status,
    residentShareAssignment?.volunteerId,
    residentCoordinationCaseId,
  ]);

  // Resident sees the private live location of the official LGU responder
  // for their currently coordinated emergency only.
  useEffect(() => {
    setResidentLguLocation(null);

    if (!isResidentMode || !residentCoordinationCaseId) {
      return;
    }

    return onSnapshot(
      doc(
        db,
        "lguResponseLocations",
        residentCoordinationCaseId,
      ),
      (snapshot) => {
        if (!snapshot.exists()) {
          setResidentLguLocation(null);
          return;
        }

        const data = snapshot.data();

        if (
          data.caseId !== residentCoordinationCaseId ||
          data.responderRole !== "lgu"
        ) {
          setResidentLguLocation(null);
          return;
        }

        setResidentLguLocation({
          id: snapshot.id,
          ...data,
        });
      },
      (cause) => {
        console.error("resident LGU live location", cause);
        setResidentLguLocation(null);
      },
    );
  }, [
    isResidentMode,
    residentCoordinationCaseId,
  ]);

  const residentLguPin = useMemo(() => {
    if (
      !residentLguLocation ||
      !residentCoordinationCase?.activeLguResponderUid
    ) {
      return null;
    }

    const lastShared = timestampMillis(
      residentLguLocation.updatedAt,
    );

    if (
      !Number.isFinite(residentLguLocation.latitude) ||
      !Number.isFinite(residentLguLocation.longitude) ||
      lastShared <= 0
    ) {
      return null;
    }

    return {
      ...residentLguLocation,
      id: `lgu-${residentCoordinationCaseId}`,
      role: "lgu",
      responderRole: "lgu",
      name:
        String(residentLguLocation.responderName || "").trim() ||
        String(residentCoordinationCase?.activeLguResponderName || "").trim() ||
        "LGU Emergency Response",
      lastShared,
      stale: liveNow - lastShared > 30000,
    };
  }, [
    residentLguLocation,
    residentCoordinationCaseId,
    residentCoordinationCase?.activeLguResponderUid,
    residentCoordinationCase?.activeLguResponderName,
    liveNow,
  ]);

  // Admin observes the official LGU responder location for the focused case.
  // This is read-only: Admin never publishes responder GPS from this screen.
  useEffect(() => {
    setAdminLguLocation(null);

    if (!isAdministrator || !focusedCaseId) {
      return;
    }

    return onSnapshot(
      doc(
        db,
        "lguResponseLocations",
        focusedCaseId,
      ),
      (snapshot) => {
        if (!snapshot.exists()) {
          setAdminLguLocation(null);
          return;
        }

        const data = snapshot.data();

        if (
          data.caseId !== focusedCaseId ||
          data.responderRole !== "lgu"
        ) {
          setAdminLguLocation(null);
          return;
        }

        setAdminLguLocation({
          id: snapshot.id,
          ...data,
        });
      },
      (cause) => {
        console.error(
          "admin observed LGU live location",
          cause,
        );
        setAdminLguLocation(null);
      },
    );
  }, [
    isAdministrator,
    focusedCaseId,
  ]);

  const adminLguPin = useMemo(() => {
    if (
      !adminLguLocation ||
      !focusedCaseId ||
      !adminCase?.activeLguResponderUid
    ) {
      return null;
    }

    const lastShared = timestampMillis(
      adminLguLocation.updatedAt,
    );

    if (
      !Number.isFinite(adminLguLocation.latitude) ||
      !Number.isFinite(adminLguLocation.longitude) ||
      lastShared <= 0
    ) {
      return null;
    }

    return {
      ...adminLguLocation,
      id: `lgu-${focusedCaseId}`,
      role: "lgu",
      responderRole: "lgu",
      selectable: false,
      name:
        String(adminLguLocation.responderName || "").trim() ||
        String(adminCase?.activeLguResponderName || "").trim() ||
        "LGU Emergency Response",
      lastShared,
      stale: liveNow - lastShared > 30000,
    };
  }, [
    adminLguLocation,
    focusedCaseId,
    adminCase?.activeLguResponderUid,
    adminCase?.activeLguResponderName,
    liveNow,
  ]);

  // An accepted/active Volunteer may observe only the official LGU responder
  // for the same focused emergency. This is view-only coordination data.
  useEffect(() => {
    setVolunteerLguLocation(null);

    if (
      !missionMode ||
      !focusedCaseId ||
      !missionAssignment ||
      !["accepted", "responding", "on_site"].includes(
        missionAssignmentStatus,
      )
    ) {
      return;
    }

    return onSnapshot(
      doc(
        db,
        "lguResponseLocations",
        focusedCaseId,
      ),
      (snapshot) => {
        if (!snapshot.exists()) {
          setVolunteerLguLocation(null);
          return;
        }

        const data = snapshot.data();

        if (
          data.caseId !== focusedCaseId ||
          data.responderRole !== "lgu"
        ) {
          setVolunteerLguLocation(null);
          return;
        }

        setVolunteerLguLocation({
          id: snapshot.id,
          ...data,
        });
      },
      (cause) => {
        console.error(
          "volunteer observed LGU live location",
          cause,
        );
        setVolunteerLguLocation(null);
      },
    );
  }, [
    missionMode,
    focusedCaseId,
    missionAssignment?.id,
    missionAssignmentStatus,
  ]);

  const volunteerLguPin = useMemo(() => {
    if (
      !volunteerLguLocation ||
      !focusedCaseId ||
      !missionCase?.activeLguResponderUid
    ) {
      return null;
    }

    const lastShared = timestampMillis(
      volunteerLguLocation.updatedAt,
    );

    if (
      !Number.isFinite(volunteerLguLocation.latitude) ||
      !Number.isFinite(volunteerLguLocation.longitude) ||
      lastShared <= 0
    ) {
      return null;
    }

    return {
      ...volunteerLguLocation,
      id: `lgu-${focusedCaseId}`,
      role: "lgu",
      responderRole: "lgu",
      selectable: false,
      name:
        String(volunteerLguLocation.responderName || "").trim() ||
        String(missionCase?.activeLguResponderName || "").trim() ||
        "LGU Emergency Response",
      lastShared,
      stale: liveNow - lastShared > 30000,
    };
  }, [
    volunteerLguLocation,
    focusedCaseId,
    missionCase?.activeLguResponderUid,
    missionCase?.activeLguResponderName,
    liveNow,
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
            point.lastShared > 0,
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
        (snapshot) => {
          setResidentSharedLocations(
            snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })),
          );
        },
        (cause) => {
          console.error("admin resident live locations", cause);
          setResidentSharedLocations([]);
        },
      );
    }

    if (
      lguPersonnelMissionMode &&
      adminCase?.reporterUid
    ) {
      return onSnapshot(
        doc(
          db,
          "residentResponseLocations",
          adminCase.reporterUid,
        ),
        (snapshot) => {
          if (!snapshot.exists()) {
            setResidentSharedLocations([]);
            return;
          }

          const data = snapshot.data();

          if (
            data.caseId !== focusedCaseId ||
            data.residentId !== adminCase.reporterUid
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
            "LGU Personnel resident live location",
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
    isLguPersonnel,
    lguPersonnelMissionMode,
    adminCase?.reporterUid,
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

  const adminVolunteerPins = useMemo(
    () =>
      adminResponderLocations
        .flatMap((point) => {
          const assignment = adminAssignments.find(
            (item) =>
              item.volunteerId === point.volunteerId &&
              (!point.caseId || item.caseId === point.caseId) &&
              ["accepted", "responding", "on_site"].includes(
                normalize(item.status),
              ),
          );

          // Never show a blue Volunteer pin from a stray/stale location
          // document unless that Volunteer has actually accepted or is
          // actively responding to the matching emergency case.
          if (!assignment) {
            return [];
          }

          if (
            focusedCaseId &&
            String(assignment.caseId || "") !== focusedCaseId
          ) {
            return [];
          }

          const lastShared = timestampMillis(point.updatedAt);

          return [
            {
              ...point,
              id: String(point.id || point.volunteerId || ""),
              name:
                assignment.volunteerName ||
                point.volunteerName ||
                "Volunteer",
              assignmentId: assignment.id || point.assignmentId || "",
              caseId: assignment.caseId || point.caseId || "",
              status: assignment.status,
              lastShared,
              stale:
                lastShared > 0 &&
                liveNow - lastShared > 30000,
            },
          ];
        })
        .filter(
          (point) =>
            Number.isFinite(point.latitude) &&
            Number.isFinite(point.longitude) &&
            point.lastShared > 0 &&
            liveNow - point.lastShared < 120000,
        ),
    [
      adminResponderLocations,
      adminAssignments,
      liveNow,
      focusedCaseId,
    ],
  );

  // Resident map keeps the official LGU responder primary at all times.
  // An accepted/active Volunteer is optional additional support and may appear
  // beside the LGU; it never replaces the LGU responder.
  const residentActiveVolunteerAssignment =
    isResidentMode && residentShareAssignment
      ? residentShareAssignment
      : null;

  const residentActiveVolunteerPins = residentActiveVolunteerAssignment
    ? residentResponderPins
        .filter(
          (point) =>
            point.volunteerId ===
            residentActiveVolunteerAssignment.volunteerId,
        )
        .map((point) => ({
          ...point,
          selectable: false,
        }))
    : [];

  const mapResponderPins = isAdministrator
    ? [
        ...(adminLguPin ? [adminLguPin] : []),
        ...adminVolunteerPins,
      ]
    : isResidentMode
      ? [
          ...(residentLguPin
            ? [{ ...residentLguPin, selectable: false }]
            : []),
          ...residentActiveVolunteerPins,
        ]
      : missionMode
        ? [
            ...(volunteerLguPin
              ? [{ ...volunteerLguPin, selectable: false }]
              : []),
            ...flow.responders,
          ]
        : [];

  const residentShareMode: "lgu" | "volunteer" =
    residentShareAssignment ? "volunteer" : "lgu";

  const residentShareCanPublish =
    isResidentMode &&
    !!user &&
    !!residentShareCaseId &&
    !!residentCoordinationCase &&
    tracking &&
    isFocused &&
    ["reported", "validated", "assigned", "in_progress"].includes(
      normalize(residentCoordinationCase.status),
    );

  // Optional resident live GPS. This is separate from the fixed emergency pin
  // and is written only after the resident explicitly enables sharing.
  useEffect(() => {
    if (!residentShareCanPublish || !user) {
      return;
    }

    let stopped = false;
    let pending = false;

    const locationRef = doc(
      db,
      "residentResponseLocations",
      user.uid,
    );

    // When there is no accepted/responding Volunteer, the Resident may still
    // explicitly share live GPS with the LGU. If a Volunteer later becomes
    // active, this same document switches to volunteer mode automatically.
    const assignmentId = residentShareAssignment?.id || "";
    const responseMode = residentShareMode;
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
              responseMode,
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
    residentShareMode,
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
      ["reported", "validated", "assigned", "in_progress"].includes(
        normalize(residentCoordinationCase.status),
      );

    if (!validCase || !isFocused) {
      setResidentShareCaseId("");
      setTracking(false);
      setUserLocation(null);
    }
  }, [
    residentShareCaseId,
    residentCoordinationCase?.status,
    isFocused,
  ]);

  const beginResidentSharing = () => {
    if (
      !isResidentMode ||
      !selectedCase ||
      !["reported", "validated", "assigned", "in_progress"].includes(
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

  const chooseResidentCase = (caseId: string) => {
    const nextCase = residentActiveCases.find(
      (item) => item.id === caseId,
    );

    if (!nextCase) return;

    if (
      residentShareCaseId &&
      residentShareCaseId !== caseId
    ) {
      stopResidentSharing();
    }

    routeCache.current = null;
    setRoadRoute(null);
    setRouteError("");
    setSelected({
      kind: "incident",
      id: caseId,
    });

    router.replace(
      `/map-tracking?caseId=${encodeURIComponent(caseId)}` as any,
    );
  };

  const openResidentCaseChooser = () => {
    if (residentShareCaseId) {
      stopResidentSharing();
    }

    routeCache.current = null;
    setRoadRoute(null);
    setRouteError("");
    setSelected(null);

    router.replace("/map-tracking" as any);
  };

  const residentResponderLastShared = Math.max(
    residentLguPin?.lastShared || 0,
    residentResponderPins.reduce(
      (latest, point) =>
        Math.max(latest, point.lastShared || 0),
      0,
    ),
  );

  const residentDisplayedAssignment =
    isResidentMode &&
    residentPrimaryAssignment &&
    ["accepted", "responding", "on_site", "completed"].includes(
      normalize(residentPrimaryAssignment.status),
    )
      ? residentPrimaryAssignment
      : null;

  const residentCanStartShare =
    isResidentMode &&
    !!selectedCase &&
    selectedCase.id === residentCoordinationCaseId &&
    ["reported", "validated", "assigned", "in_progress"].includes(
      normalize(selectedCase.status),
    );

  const routeResponderPoint = useMemo(() => {
    if (!isResidentMode) {
      return null;
    }

    // Official LGU is always the Resident's primary route source.
    // Optional Volunteer GPS is only a fallback when no LGU GPS has ever been
    // published yet for the assigned case.
    if (residentLguPin) {
      return residentLguPin;
    }

    if (residentActiveVolunteerAssignment) {
      return (
        residentResponderPins.find(
          (point) =>
            point.volunteerId ===
            residentActiveVolunteerAssignment.volunteerId,
        ) || null
      );
    }

    return null;
  }, [
    isResidentMode,
    residentActiveVolunteerAssignment?.volunteerId,
    residentResponderPins,
    residentLguPin,
  ]);

  const routeOrigin = useMemo<RouteCoordinate | null>(() => {
    if (isResidentMode && routeResponderPoint) {
      return {
        latitude: Number(routeResponderPoint.latitude),
        longitude: Number(routeResponderPoint.longitude),
      };
    }

    if (
      isAdministrator &&
      adminMissionMode &&
      adminLguPin
    ) {
      return {
        latitude: Number(adminLguPin.latitude),
        longitude: Number(adminLguPin.longitude),
      };
    }

    if ((missionMode || adminMissionMode) && userLocation) {
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
    isAdministrator,
    adminMissionMode,
    adminLguPin?.latitude,
    adminLguPin?.longitude,
    missionMode,
    userLocation?.latitude,
    userLocation?.longitude,
  ]);

  const routeDestination = useMemo<RouteCoordinate | null>(() => {
    // If the resident explicitly shares a fresh moving location for this
    // mission, use it as the live destination. Otherwise, fall back to the
    // fixed emergency GPS pin saved with the report.
    if (adminMissionMode) {
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

      if (adminCase && hasCoordinates(adminCase)) {
        return {
          latitude: Number(adminCase.latitude),
          longitude: Number(adminCase.longitude),
        };
      }
    }

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
    adminMissionMode,
    adminCase?.id,
    adminCase?.latitude,
    adminCase?.longitude,
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
    (missionMode || adminMissionMode) &&
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
    adminMissionMode
      ? adminCase?.status
      : missionMode
        ? missionAssignment?.status
        : residentCoordinationCase?.status,
  );

  const routeShouldBeLive =
    (
      adminMissionMode
        ? ["reported", "validated", "assigned", "in_progress"].includes(routeStatus)
        : missionMode
          ? ["responding", "on_site"].includes(
              normalize(missionAssignment?.status),
            )
          : isResidentMode
            ? ["reported", "validated", "assigned", "in_progress"].includes(
                routeStatus,
              )
            : false
    ) &&
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
    (
      (
        missionMode &&
        ["responding", "on_site"].includes(missionAssignmentStatus)
      ) ||
      (
        adminMissionMode &&
        !!adminCase &&
        normalize(adminCase.status) !== "closed"
      )
    ) &&
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

  const caseChatAssignment = missionMode
    ? missionAssignment
    : isResidentMode
      ? residentDisplayedAssignment
      : null;

  const caseChatAvailable =
    !!selectedCase &&
    !!caseChatAssignment &&
    ["accepted", "responding", "on_site", "completed"].includes(
      normalize(caseChatAssignment.status),
    );

  const caseChatViewerRole: "resident" | "volunteer" =
    missionMode ? "volunteer" : "resident";

  // Resident response view always keeps exactly one green Resident pin.
  // While live sharing is active, it follows the Resident device GPS. When
  // live sharing is off, it falls back to the original emergency location.
  // Other old/test emergency pins stay hidden in this active-response view.
  const mapIncidentCases = useMemo(() => {
    // Active Resident/Volunteer/LGU mission maps should show only the focused
    // emergency destination. Rendering unrelated cases here also lets their
    // coordinates stretch fitBounds and can zoom the map out across Luzon.
    if (
      isResidentMode ||
      missionMode ||
      lguPersonnelMissionMode ||
      adminMissionMode
    ) {
      return selectedCase ? [selectedCase] : [];
    }

    return visibleCases;
  }, [
    visibleCases,
    isResidentMode,
    missionMode,
    lguPersonnelMissionMode,
    adminMissionMode,
    selectedCase,
  ]);

  const postMapData = (fit: boolean) => {
    frame.current?.contentWindow?.postMessage(
      {
        kind: "set-map-data",
        responders: mapResponderPins,
        residents: isResidentMode ? [] : residentLivePins,
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

        incidents: mapIncidentCases.map((item) => {
          const residentSelfLive =
            isResidentMode &&
            selectedCase?.id === item.id &&
            residentUsingOwnLiveDestination &&
            !!userLocation;

          return {
            id: item.id,
            title: item.title || "Disaster case",
            status: item.status || "reported",
            severity: item.severity || "medium",
            latitude: residentSelfLive
              ? userLocation!.latitude
              : numericCoordinate(item.latitude),
            longitude: residentSelfLive
              ? userLocation!.longitude
              : numericCoordinate(item.longitude),
            destination:
              (missionMode || adminMissionMode) &&
              selectedCase?.id === item.id,
            residentPin:
              isOperationalLgu || missionMode || isResidentMode,
            residentSelf: isResidentMode,
            reporterName: item.reporterName || "Resident",
          };
        }),

        bases:
          missionMode || adminMissionMode || isResidentMode
            ? [LGU_BASE]
            : [],

        // Volunteer mission camera follows the active route/destination.
        // LGU Base and LGU responder pins stay rendered as coordination
        // references, but they no longer stretch fitBounds across the map.
        navigationView: missionMode,

        // Keep active response navigation focused on the mission. Evacuation
        // centers remain available on overview maps, but they are intentionally
        // hidden from the focused Volunteer mission map so unrelated locations
        // cannot clutter or stretch the camera.
        centers: missionMode
          ? []
          : visibleCenters.map((item) => ({
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
    mapIncidentCases,
    visibleCenters,
    mapResponderPins,
    residentLivePins,
    roadRoute,
    isAdministrator,
    isResidentMode,
    missionMode,
    adminMissionMode,
    residentUsingOwnLiveDestination,
    selectedCase?.id,
  ]);

  useEffect(() => {
    if (!mapReady) return;

    frame.current?.contentWindow?.postMessage(
      {
        kind: "update-user-location",
        location:
          isAdministrator || isResidentMode
            ? null
            : userLocation,
        follow:
          !isAdministrator &&
          !isResidentMode &&
          tracking &&
          followMe &&
          !roadRoute,
        role: isOperationalLgu
          ? "admin"
          : isResidentMode
            ? "resident"
            : "volunteer",
      },
      "*",
    );
  }, [
    mapReady,
    userLocation,
    tracking,
    followMe,
    roadRoute,
    isResidentMode,
    isAdministrator,
    isOperationalLgu,
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

  const callLguBackend = async (
    path: string,
    method = "POST",
  ) => {
    if (!user) {
      throw new Error("Your LGU session has expired. Sign in again.");
    }

    const token = await user.getIdToken(true);

    const response = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload?.message ||
          payload?.error ||
          "The LGU response action could not be completed.",
      );
    }

    return payload;
  };

  const callResidentBackend = async (
    path: string,
    method = "POST",
  ) => {
    if (!user) {
      throw new Error("Your Resident session has expired. Sign in again.");
    }

    const token = await user.getIdToken(true);

    const response = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload?.message ||
          payload?.error ||
          "The Resident response action could not be completed.",
      );
    }

    return payload;
  };

  const confirmResidentLguArrival = async () => {
    if (
      !isResidentMode ||
      !residentCoordinationCase?.id ||
      residentArrivalBusy
    ) {
      return;
    }

    const currentStatus = normalize(
      residentCoordinationCase.lguArrivalConfirmationStatus,
    );

    if (currentStatus === "confirmed") {
      setResidentArrivalError("");
      setResidentArrivalMessage("LGU arrival is already confirmed.");
      return;
    }

    if (currentStatus !== "pending") {
      setResidentArrivalMessage("");
      setResidentArrivalError(
        "LGU arrival is not waiting for confirmation yet.",
      );
      return;
    }

    setResidentArrivalBusy(true);
    setResidentArrivalMessage("");
    setResidentArrivalError("");

    try {
      const payload = await callResidentBackend(
        `/api/resident/emergency-cases/${encodeURIComponent(
          residentCoordinationCase.id,
        )}/confirm-lgu-arrival`,
      );

      setResidentArrivalMessage(
        payload?.message || "LGU arrival confirmed.",
      );
    } catch (cause: any) {
      setResidentArrivalError(
        cause?.message || "Unable to confirm LGU arrival.",
      );
    } finally {
      setResidentArrivalBusy(false);
    }
  };

  const markLguArrived = async () => {
    if (
      !isLguPersonnel ||
      !adminCase?.activeResponderAssignmentId ||
      lguArrivalBusy
    ) {
      return;
    }

    if (!tracking || !userLocation) {
      setLguArrivalError(
        "Start LGU GPS before marking the responder as arrived.",
      );
      return;
    }

    setLguArrivalBusy(true);
    setLguArrivalError("");
    setLguArrivalMessage("");

    try {
      await callLguBackend(
        `/api/lgu/assignments/${encodeURIComponent(
          adminCase.activeResponderAssignmentId,
        )}/arrive`,
      );

      setLguAssignmentStatus("on_site");
      setLguArrivalMessage(
        "Arrival recorded. Resident confirmation is pending. Keep GPS active while handling the emergency.",
      );
    } catch (cause: any) {
      setLguArrivalError(
        cause?.message || "Unable to mark arrival.",
      );
    } finally {
      setLguArrivalBusy(false);
    }
  };

  const claimLguResponse = async () => {
    if (!user || !adminCase || !focusedCaseId) return false;

    // Dedicated LGU Personnel never self-claims a case. Admin assignment already
    // selected the official responder through the trusted backend.
    if (isLguPersonnel) {
      const ownerUid = String(adminCase.activeLguResponderUid || "").trim();
      const assignedIds = Array.isArray((adminCase as any).assignedLguPersonnelIds)
        ? (adminCase as any).assignedLguPersonnelIds.map(String)
        : [];

      if (
        ownerUid !== user.uid ||
        !assignedIds.includes(user.uid)
      ) {
        setGpsError(
          "This emergency is no longer assigned to your LGU Personnel account. Refresh your duty dashboard."
        );
        return false;
      }

      return true;
    }

    const caseRef = doc(db, "disasterCases", focusedCaseId);
    const responderName =
      String((profile as any)?.fullName || "").trim() ||
      "LGU Emergency Response";

    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(caseRef);
        if (!snapshot.exists()) {
          throw new Error("This emergency case is no longer available.");
        }

        const current: any = snapshot.data();
        const status = normalize(current.status || "reported");
        if (["resolved", "closed"].includes(status)) {
          throw new Error("This emergency case is already closed for live response.");
        }

        const ownerUid = String(current.activeLguResponderUid || "").trim();
        const ownerName = String(
          current.activeLguResponderName || "another LGU responder",
        ).trim();
        const heartbeatMs = timestampMillis(current.activeLguHeartbeatAt);
        const ownerIsFresh =
          !!ownerUid &&
          heartbeatMs > 0 &&
          Date.now() - heartbeatMs < 120000;

        if (ownerUid && ownerUid !== user.uid && ownerIsFresh) {
          throw new Error(
            `This case is already being handled by ${ownerName}. The live-response lock becomes available if that responder disconnects for about 2 minutes.`,
          );
        }

        const patch: any = {
          activeLguResponderUid: user.uid,
          activeLguResponderName: responderName,
          activeLguHeartbeatAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (ownerUid !== user.uid) {
          patch.activeLguStartedAt = serverTimestamp();
        }

        transaction.update(caseRef, patch);
      });

      return true;
    } catch (problem) {
      setGpsError(
        problem instanceof Error
          ? problem.message
          : "Unable to claim this LGU response. Please refresh and try again.",
      );
      return false;
    }
  };

  const releaseLguResponse = async () => {
    if (!user || !focusedCaseId) return;

    // Stopping GPS is not the same as cancelling the official LGU assignment.
    // Dedicated personnel keep ownership until the response lifecycle changes.
    if (isLguPersonnel) return;

    const caseRef = doc(db, "disasterCases", focusedCaseId);

    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(caseRef);
        if (!snapshot.exists()) return;

        const current: any = snapshot.data();
        if (String(current.activeLguResponderUid || "") !== user.uid) return;

        transaction.update(caseRef, {
          activeLguResponderUid: "",
          activeLguResponderName: "",
          activeLguHeartbeatAt: null,
          updatedAt: serverTimestamp(),
        });
      });
    } catch {
      // If release cannot reach Firestore, the 2-minute heartbeat lease allows
      // another authorized LGU responder to take over without a permanent lock.
    }
  };

  const startAdminTracking = async () => {
    if (!adminMissionMode) {
      setTracking(true);
      return;
    }

    setGpsError("");
    const claimed = await claimLguResponse();
    if (!claimed) return;

    setUserLocation(null);
    setFollowMe(false);
    setTracking(true);
  };

  // While an Admin/LGU is actively navigating an emergency, publish one
  // private official responder location for the matching Resident. Updates are
  // throttled to the same 10-second live cycle used by the Resident stream.
  useEffect(() => {
    if (
      !adminMissionMode ||
      !user ||
      !adminCase ||
      !tracking ||
      !isFocused ||
      !["reported", "validated", "assigned", "in_progress"].includes(
        normalize(adminCase.status),
      )
    ) {
      return;
    }

    let stopped = false;
    let pending = false;

    const locationRef = doc(
      db,
      "lguResponseLocations",
      focusedCaseId,
    );

    const responderName =
      String((profile as any)?.fullName || "").trim() ||
      "LGU Emergency Response";

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

      lguWriteQueue.current = lguWriteQueue.current
        .catch(() => {})
        .then(async () => {
          if (stopped) return;

          const locationPayload = {
            caseId: focusedCaseId,
            responderUid: user.uid,
            responderName,
            responderRole: "lgu",
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy: point.accuracy,
            updatedAt: serverTimestamp(),
          };

          if (isLguPersonnel) {
            if (
              String(adminCase.activeLguResponderUid || "").trim() !== user.uid
            ) {
              throw new Error(
                "LGU response ownership changed. Stop this GPS session and refresh the case."
              );
            }

            // Current rules intentionally allow assigned LGU Personnel to publish
            // only this case-scoped operational GPS document.
            await setDoc(locationRef, locationPayload);
            return;
          }

          const caseRef = doc(db, "disasterCases", focusedCaseId);

          await runTransaction(db, async (transaction) => {
            const caseSnapshot = await transaction.get(caseRef);
            if (!caseSnapshot.exists()) {
              throw new Error("Emergency case unavailable.");
            }

            const current: any = caseSnapshot.data();
            if (String(current.activeLguResponderUid || "") !== user.uid) {
              throw new Error(
                "LGU response ownership changed. Stop this GPS session and refresh the case.",
              );
            }

            transaction.update(caseRef, {
              activeLguHeartbeatAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            transaction.set(locationRef, locationPayload);
          });
        })
        .catch((cause) => {
          console.error("LGU live location publish", cause);

          if (!stopped) {
            setGpsError(
              "LGU GPS is active, but the live responder location could not be shared with the Resident.",
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

      // Preserve the last known LGU point when the responder loses signal,
      // closes the map, or logs out. Readers mark it STALE after 30 seconds.
      // Case close/resolution performs the explicit location cleanup.
      lguWriteQueue.current = lguWriteQueue.current
        .catch(() => {})
        .then(async () => {
          await releaseLguResponse();
        })
        .catch(() => {
          // If cleanup is offline, the heartbeat lease expires automatically.
        });
    };
  }, [
    adminMissionMode,
    user?.uid,
    focusedCaseId,
    adminCase?.status,
    tracking,
    isFocused,
    profile,
    isLguPersonnel,
    adminCase?.activeLguResponderUid,
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

      if (adminMissionMode) {
        void releaseLguResponse();
      }
    } else if (adminMissionMode) {
      void startAdminTracking();
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

  const residentLguResponseStatus = normalize(
    residentCoordinationCase?.officialLguResponseStatus,
  );

  const residentLguArrivalStatus = normalize(
    residentCoordinationCase?.lguArrivalConfirmationStatus,
  );

  const residentFlowIndex =
    [
      "completed",
      "completed_pending_admin_review",
      "reviewed",
    ].includes(residentLguResponseStatus)
      ? 4
      : residentLguResponseStatus === "on_site" ||
          ["pending", "confirmed"].includes(residentLguArrivalStatus)
        ? 3
        : ["responding", "acknowledged"].includes(residentLguResponseStatus)
          ? 2
          : residentLguResponseStatus === "assigned"
            ? 1
            : normalize(residentCoordinationCase?.status) === "resolved"
              ? 4
              : residentLguPin && roadRoute && roadRoute.distanceMeters < 20
                ? 3
                : residentLguPin
                  ? 2
                  : ["validated", "assigned", "in_progress"].includes(
                        normalize(residentCoordinationCase?.status),
                      )
                    ? 1
                    : 0;

  const residentNeedsCaseSelection =
    isResidentMode && !residentCoordinationCase;

  const pageTitle =
    adminMissionMode && isAdministrator
      ? "LGU Response Monitoring"
      : adminMissionMode
        ? "LGU Emergency Navigation"
    : isAdministrator
      ? "LGU Emergency Command Map"
      : missionMode
        ? "Volunteer Response Map"
        : isResidentMode
          ? "Resident Map Tracking"
          : "Volunteer Response Map";

  const pageSubtitle =
    adminMissionMode && isAdministrator
      ? "View the assigned LGU responder, Resident destination, route, ETA, and live response status. Admin does not control responder GPS."
      : adminMissionMode
        ? "Navigate from the LGU's current GPS position to the Resident's active emergency location."
    : isAdministrator
      ? "Monitor Resident emergency locations and active Volunteer responders from one clean command map."
      : missionMode
        ? "Respond, navigate, arrive, and complete the mission in one clear flow."
        : isResidentMode
          ? "Track the official LGU response and any accepted Volunteer support in real time."
          : "View evacuation centers here. Open an assigned emergency from Volunteer Tasks to start live response navigation.";

  return (
    <main
      className={`response-map-page ${
        isOperationalLgu
          ? "admin-map-mode"
          : missionMode || volunteerOverviewMode
            ? "volunteer-map-mode"
            : "resident-map-mode"
      }`}
    >
      <style>{css}</style>

      <header className="map-header clean-map-header">
        <div>
          <span className="eyebrow">
            {isAdministrator
              ? "VOLUNSERVE · LGU COMMAND"
              : isLguPersonnel
                ? "VOLUNSERVE · LGU RESPONDER"
                : isVolunteerMode
                  ? "VOLUNSERVE · VOLUNTEER MODE"
                  : "VOLUNSERVE · RESIDENT MODE"}
          </span>
          <h1>{pageTitle}</h1>
          <p>{pageSubtitle}</p>
        </div>

        <div
          className={`clean-live-badge ${
            adminMissionMode
              ? isAdministrator
                ? adminLguPin
                  ? "active"
                  : ""
                : tracking
                  ? "active"
                  : ""
              : missionMode
                ? tracking && ["responding", "on_site"].includes(missionAssignmentStatus)
                  ? "active"
                  : ""
                : isResidentMode && residentResponderLastShared
                  ? "active"
                  : ""
          }`}
        >
          <span />
          {adminMissionMode
            ? isAdministrator
              ? adminLguPin
                ? adminLguPin.stale
                  ? "LGU GPS · STALE"
                  : "LGU RESPONSE · GPS LIVE"
                : "WAITING FOR LGU GPS"
              : tracking
                ? "LGU RESPONSE · GPS LIVE"
                : "READY TO NAVIGATE"
            : isAdministrator
              ? "COMMAND MAP"
              : missionMode
                ? missionAssignmentStatus === "completed"
                  ? "MISSION COMPLETE"
                  : tracking && ["responding", "on_site"].includes(missionAssignmentStatus)
                    ? "LIVE RESPONSE"
                    : statusLabel(missionAssignmentStatus || "accepted")
                : isResidentMode
                  ? residentResponderLastShared
                    ? "RESPONDER LIVE"
                    : "RESPONSE STATUS"
                  : "READY"}
        </div>
      </header>

      {isVolunteerMode && (
        <ResponsePanel flow={flow} cases={cases} />
      )}

      {(error || gpsError) && (
        <div className="clean-alert" role="alert">
          {error || gpsError}
        </div>
      )}

      {residentNeedsCaseSelection && (
        <section
          className="resident-case-picker"
          aria-label="Choose emergency response to track"
        >
          <div className="resident-case-picker-heading">
            <span className="clean-kicker">CASE-SPECIFIC TRACKING</span>
            <h2>
              {residentActiveCases.length > 0
                ? "Choose the emergency you want to track"
                : "No active emergency to track"}
            </h2>
            <p>
              {residentActiveCases.length > 1
                ? "You have multiple active emergencies. Select one so the Resident, LGU, Volunteer, route, distance, ETA, and live GPS all stay linked to the same case."
                : residentActiveCases.length === 1
                  ? "Opening your active emergency response…"
                  : "When you have an active emergency, its official response tracking will appear here."}
            </p>
          </div>

          {residentActiveCases.length > 0 && (
            <div className="resident-case-picker-list">
              {residentActiveCases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="resident-case-option"
                  onClick={() => chooseResidentCase(item.id)}
                >
                  <span className="resident-case-option-main">
                    <strong>{item.title || "Emergency report"}</strong>
                    <small>
                      {item.location ||
                        item.reporterAddress ||
                        "Emergency location recorded"}
                    </small>
                  </span>

                  <span className="resident-case-option-side">
                    <i className={`clean-status-pill status-${normalize(item.status || "reported")}`}>
                      {statusLabel(item.status || "reported")}
                    </i>
                    <b>Track response →</b>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {adminMissionMode && adminCase && (
        <section
          className="admin-response-overview"
          aria-label="LGU direct response overview"
        >
          <div className="admin-response-overview-main">
            <span className="clean-kicker">
              {isAdministrator
                ? "LGU RESPONSE MONITORING"
                : "LGU DIRECT RESPONSE"}
            </span>
            <strong>{adminCase.title || "Emergency response"}</strong>
            <small>
              Destination:{" "}
              {usingResidentLiveDestination
                ? "Resident live shared location"
                : adminCase.location ||
                  adminCase.reporterAddress ||
                  "Saved emergency GPS pin"}
            </small>
          </div>

          <div className="admin-response-overview-status">
            <span>Route status</span>
            <strong>
              {isAdministrator
                ? adminLguPin
                  ? roadRoute
                    ? roadRoute.distanceMeters < 20
                      ? "LGU at resident destination"
                      : `${formatRoadDistance(roadRoute.distanceMeters)} · ${formatDriveTime(
                          roadRoute.durationSeconds,
                        )}`
                    : routeLoading
                      ? "Calculating LGU route…"
                      : adminLguPin.stale
                        ? "LGU GPS reading is stale"
                        : "LGU GPS received · waiting for route"
                  : "Waiting for assigned LGU GPS"
                : tracking
                  ? roadRoute
                    ? roadRoute.distanceMeters < 20
                      ? "At resident destination"
                      : `${formatRoadDistance(roadRoute.distanceMeters)} · ${formatDriveTime(
                          roadRoute.durationSeconds,
                        )}`
                    : routeLoading || locating
                      ? "Calculating route…"
                      : "GPS active · waiting for route"
                  : "Ready to navigate"}
            </strong>
            <small>
              {isAdministrator
                ? adminLguPin
                  ? `Red LGU responder → green Resident destination · last GPS ${new Date(
                      adminLguPin.lastShared,
                    ).toLocaleTimeString()}`
                  : "Admin is view-only. The route appears when the assigned LGU Personnel shares GPS."
                : tracking
                  ? "Red LGU pin → green Resident destination"
                  : "Start navigation from the Resident panel on the right."}
            </small>
          </div>
        </section>
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
              {residentActiveCases.length > 1 && (
                <button
                  type="button"
                  className="resident-change-case-button"
                  onClick={openResidentCaseChooser}
                >
                  Change emergency
                </button>
              )}
            </div>

            <div className="clean-summary-person">
              <span>Active responder</span>
              <strong>
                {residentLguPin?.name ||
                  residentCoordinationCase?.activeLguResponderName ||
                  "LGU coordinating response"}
              </strong>
              <small>
                {residentLguPin
                  ? `Official LGU responder · ${residentLguPin.stale ? "STALE" : "LIVE"}`
                  : residentCoordinationCase?.activeLguResponderUid
                    ? "Official LGU responder · WAITING GPS"
                    : "Waiting for official LGU responder"}
              </small>
              {residentActiveVolunteerAssignment && (
                <small>
                  Optional Volunteer support · {residentActiveVolunteerAssignment.volunteerName || "Volunteer"} · {statusLabel(residentActiveVolunteerAssignment.status)}
                </small>
              )}
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
            {["Coordinating", "On the way", "Arrived", "Response complete"].map(
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

      {isAdministrator && !adminMissionMode && (
        <section className="toolbar volunteer-map-toolbar" aria-label="LGU command map controls">
          <label className="search-box">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search emergency, resident, barangay or center…"
              aria-label="Search emergency map"
            />
          </label>

          <div className="filter-group">
            <button
              type="button"
              className={showIncidents ? "chip active danger" : "chip"}
              onClick={() => setShowIncidents((value) => !value)}
            >
              ● Residents / Emergencies
            </button>
            <button
              type="button"
              className={showCenters ? "chip active" : "chip"}
              onClick={() => setShowCenters((value) => !value)}
            >
              ◆ Evacuation centers
            </button>
          </div>
        </section>
      )}

      {volunteerOverviewMode && (
        <section className="toolbar volunteer-map-toolbar" aria-label="Volunteer map controls">
          <label className="search-box">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search evacuation center or barangay…"
              aria-label="Search evacuation centers"
            />
          </label>

          <div className="filter-group">
            <button
              type="button"
              className={showCenters ? "chip active blue" : "chip"}
              onClick={() => setShowCenters((value) => !value)}
            >
              ◆ Evacuation centers
            </button>
          </div>
        </section>
      )}

      {!residentNeedsCaseSelection && (
      <section className="map-layout clean-map-layout">
        <div className="map-card clean-map-card">
          <iframe
            ref={frame}
            title="VolunServe live disaster response map"
            srcDoc={mapDocument}
            sandbox="allow-scripts allow-same-origin"
          />

          {(missionMode || adminMissionMode) &&
            navigationActive &&
            (adminMissionMode || ["responding", "on_site"].includes(missionAssignmentStatus)) && (
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
            {isAdministrator && (
              <>
                <span><i className="legend-dot resident-role-dot" /> Resident</span>
                {adminMissionMode && (
                  <span><i className="legend-dot lgu-base-dot" /> LGU Base</span>
                )}
                {!!adminLguPin && (
                  <span><i className="legend-dot lgu-role-dot" /> LGU responder</span>
                )}
                {adminVolunteerPins.length > 0 && (
                  <span><i className="legend-dot responder-dot" /> Accepted Volunteer</span>
                )}
              </>
            )}
            {isLguPersonnel && (
              <>
                <span><i className="legend-dot resident-role-dot" /> Resident</span>
                <span><i className="legend-dot lgu-base-dot" /> LGU Base</span>
                <span><i className="legend-dot lgu-role-dot" /> LGU / You</span>
              </>
            )}
            {isResidentMode && (
              <>
                <span><i className="legend-dot resident-role-dot" /> Resident / You</span>
                <span><i className="legend-dot lgu-base-dot" /> LGU Base</span>
                {residentLguPin && (
                  <span><i className="legend-dot lgu-role-dot" /> LGU responder</span>
                )}
                {residentActiveVolunteerAssignment && (
                  <span><i className="legend-dot responder-dot" /> Optional Volunteer support</span>
                )}
              </>
            )}
            {missionMode && (
              <>
                <span><i className="legend-dot responder-dot" /> Volunteer / You</span>
                <span><i className="legend-dot resident-role-dot" /> Resident</span>
                <span><i className="legend-dot lgu-base-dot" /> LGU Base</span>
                {volunteerLguPin && (
                  <span><i className="legend-dot lgu-role-dot" /> LGU responder</span>
                )}
              </>
            )}
            {(missionMode || adminMissionMode || isResidentMode) && roadRoute && (
              <span><i className="legend-route-line" /> Road route</span>
            )}
            {(volunteerOverviewMode || (isAdministrator && !adminMissionMode)) && (
              <span><i className="legend-dot center" /> Evacuation center</span>
            )}
          </div>
        </div>

        <aside className="details-card clean-details-card">
          {isAdministrator && selectedAdminVolunteer ? (
            <>
              <div className="clean-side-heading">
                <div>
                  <span className="clean-kicker">VOLUNTEER PROFILE</span>
                  <h2>{selectedAdminVolunteer.name || "Volunteer"}</h2>
                </div>
                <span className={`clean-status-pill status-${normalize(selectedAdminVolunteer.status || "responding")}`}>
                  {statusLabel(selectedAdminVolunteer.status || "responding")}
                </span>
              </div>

              <div className="resident-identity-card">
                <div className="resident-avatar" aria-hidden="true">
                  <span>{initialsFor(selectedAdminVolunteer.name || "Volunteer")}</span>
                </div>
                <div>
                  <span>Approved responder</span>
                  <strong>{selectedAdminVolunteer.name || "Volunteer"}</strong>
                  <small>Blue pin · live response location</small>
                </div>
              </div>

              <div className="clean-info-block">
                <strong>Assigned case</strong>
                <p>
                  {cases.find((item) => item.id === selectedAdminVolunteer.caseId)?.title ||
                    selectedAdminVolunteer.caseId ||
                    "No active case recorded"}
                </p>
              </div>
            </>
          ) : isOperationalLgu && selectedCase ? (
            <>
              <div className="admin-case-panel">
                <div className="admin-case-heading">
                  <div>
                    <span className="clean-kicker">RESIDENT EMERGENCY</span>
                    <h2>{selectedCase.title || "Emergency case"}</h2>
                  </div>

                  <span
                    className={`clean-status-pill status-${normalize(
                      selectedCase.status || "reported",
                    )}`}
                  >
                    {statusLabel(selectedCase.status || "reported")}
                  </span>
                </div>

                <div className="admin-resident-profile">
                  <div className="resident-avatar admin-resident-avatar" aria-hidden="true">
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

                  <div className="admin-resident-copy">
                    <span className="admin-verified-badge">✓ VERIFIED RESIDENT</span>
                    <strong className="admin-resident-name">
                      {selectedCase.reporterName || "Resident"}
                    </strong>

                    <div className="admin-contact-row">
                      <span>Contact</span>
                      <b>{selectedCase.contactNumber || "Not provided"}</b>
                    </div>
                  </div>
                </div>

                <div className="admin-case-info-grid">
                  <div className="admin-case-info-card">
                    <span>Emergency location</span>
                    <strong>
                      {selectedCase.location ||
                        selectedCase.reporterAddress ||
                        "GPS-tagged emergency location"}
                    </strong>
                    <small>
                      This is the response destination saved with the emergency report.
                    </small>
                  </div>

                  <div className="admin-case-info-card">
                    <span>Incident details</span>
                    <strong>
                      {selectedCase.details || "No additional description"}
                    </strong>
                    <small>
                      {isLguPersonnel
                        ? "Review the Resident emergency details before navigating to the response location."
                        : "Review the report before dispatching the LGU or assigning a Volunteer."}
                    </small>
                  </div>
                </div>

                {["pending", "confirmed"].includes(
                  normalize(selectedCase.lguArrivalConfirmationStatus),
                ) && (
                  <div
                    className={`lgu-arrival-confirmation-strip ${
                      normalize(selectedCase.lguArrivalConfirmationStatus) ===
                      "confirmed"
                        ? "confirmed"
                        : "pending"
                    }`}
                  >
                    <span>Arrival confirmation</span>
                    <strong>
                      {normalize(selectedCase.lguArrivalConfirmationStatus) ===
                      "confirmed"
                        ? "Confirmed by Resident"
                        : "Waiting for Resident"}
                    </strong>
                  </div>
                )}

                {hasCoordinates(selectedCase) ? (
                  <div
                    className={`admin-route-card ${
                      adminMissionMode &&
                      selectedCase.id === focusedCaseId &&
                      tracking
                        ? "active"
                        : ""
                    }`}
                  >
                    <div className="admin-route-heading">
                      <div>
                        <span>LGU → RESIDENT ROUTE</span>
                        <strong>
                          {adminMissionMode &&
                          selectedCase.id === focusedCaseId
                            ? isAdministrator
                              ? adminLguPin
                                ? roadRoute
                                  ? roadRoute.distanceMeters < 20
                                    ? "LGU is at the Resident destination"
                                    : "LGU route active"
                                  : routeLoading
                                    ? "Preparing LGU route"
                                    : adminLguPin.stale
                                      ? "LGU GPS reading is stale"
                                      : "LGU GPS received"
                                : "Waiting for assigned LGU GPS"
                              : tracking
                                ? roadRoute
                                  ? roadRoute.distanceMeters < 20
                                    ? "You are at the Resident destination"
                                    : "Driving route active"
                                  : routeLoading || locating
                                    ? "Preparing navigation"
                                    : "LGU GPS active"
                                : "Direct LGU response"
                            : "Direct LGU response"}
                        </strong>
                      </div>

                      <span
                        className={`admin-route-state ${
                          adminMissionMode &&
                          selectedCase.id === focusedCaseId &&
                          (isAdministrator
                            ? !!adminLguPin
                            : tracking)
                            ? "active"
                            : ""
                        }`}
                      >
                        {adminMissionMode &&
                        selectedCase.id === focusedCaseId
                          ? isAdministrator
                            ? adminLguPin
                              ? adminLguPin.stale
                                ? "STALE"
                                : "LIVE"
                              : "WAITING"
                            : tracking
                              ? "LIVE"
                              : "READY"
                          : "READY"}
                      </span>
                    </div>

                    <p className="admin-route-explainer">
                      {isAdministrator
                        ? "Admin view only: the route starts from the assigned LGU Personnel live GPS and ends at the Resident emergency location. Admin does not start, stop, or publish responder GPS."
                        : "The route starts from this LGU device's current GPS and ends at the Resident's emergency location. If a fresh Resident live location is shared, that location becomes the destination automatically."}
                    </p>

                    <div className="admin-route-metrics">
                      <div>
                        <span>Distance</span>
                        <strong>
                          {adminMissionMode &&
                          selectedCase.id === focusedCaseId &&
                          (isAdministrator ? !!adminLguPin : tracking)
                            ? roadRoute
                              ? roadRoute.distanceMeters < 20
                                ? "At destination"
                                : formatRoadDistance(roadRoute.distanceMeters)
                              : routeLoading || locating
                                ? "…"
                                : "—"
                            : "—"}
                        </strong>
                      </div>

                      <div>
                        <span>ETA</span>
                        <strong>
                          {adminMissionMode &&
                          selectedCase.id === focusedCaseId &&
                          (isAdministrator ? !!adminLguPin : tracking)
                            ? roadRoute
                              ? roadRoute.distanceMeters < 20
                                ? "Arrived"
                                : formatDriveTime(roadRoute.durationSeconds)
                              : routeLoading || locating
                                ? "…"
                                : "—"
                            : "—"}
                        </strong>
                      </div>
                    </div>

                    {adminMissionMode &&
                      selectedCase.id === focusedCaseId &&
                      (isAdministrator
                        ? !!adminLguPin
                        : tracking) && (
                        <div
                          className={`admin-route-message ${
                            roadRoute && roadRoute.distanceMeters < 20
                              ? "arrived"
                              : ""
                          }`}
                        >
                          {roadRoute
                            ? roadRoute.distanceMeters < 20
                              ? "The LGU device is already at or extremely near the Resident destination."
                              : "Route ready. Follow the blue road line from the red LGU pin to the green Resident pin."
                            : routeLoading || (!isAdministrator && locating)
                              ? isAdministrator
                                ? "Calculating the road route from the assigned LGU responder to the Resident…"
                                : "Getting the LGU device location and calculating the road route…"
                              : isAdministrator
                                ? routeError ||
                                  (adminLguPin.stale
                                    ? "The last LGU GPS reading is old. Waiting for a fresh responder update."
                                    : "Waiting for a valid LGU route…")
                                : gpsError ||
                                  routeError ||
                                  "Waiting for a valid GPS route…"}
                        </div>
                      )}

                    {lguPersonnelMissionMode &&
                      lguAssignmentStatus === "on_site" && (
                        <div className="lgu-on-site-banner">
                          <strong>On Site</strong>
                          <span>
                            {normalize(selectedCase.lguArrivalConfirmationStatus) ===
                            "confirmed"
                              ? "Resident confirmed your arrival. Keep official GPS active while the field response is ongoing."
                              : "Arrival recorded. Resident confirmation is pending. Keep official GPS active while the field response is ongoing."}
                          </span>
                        </div>
                      )}

                    {!!lguArrivalMessage && (
                      <div className="lgu-arrival-feedback success">
                        {lguArrivalMessage}
                      </div>
                    )}

                    {!!lguArrivalError && (
                      <div className="lgu-arrival-feedback error">
                        {lguArrivalError}
                      </div>
                    )}

                    <div className="admin-route-actions">
                      {lguPersonnelMissionMode &&
                        lguAssignmentStatus === "responding" && (
                          <button
                            type="button"
                            className="lgu-arrived-button"
                            disabled={
                              lguArrivalBusy ||
                              !tracking ||
                              !userLocation
                            }
                            onClick={() => {
                              void markLguArrived();
                            }}
                          >
                            {lguArrivalBusy
                              ? "Recording Arrival…"
                              : tracking && userLocation
                                ? "✓ Mark Arrived / On Site"
                                : "Start GPS Before Arrival"}
                          </button>
                        )}

                      <button
                        type="button"
                        className="primary-button admin-route-primary"
                        disabled={
                          ["resolved", "closed"].includes(
                            normalize(selectedCase.status || "reported"),
                          ) ||
                          (
                            isAdministrator &&
                            adminMissionMode &&
                            selectedCase.id === focusedCaseId &&
                            !adminLguPin
                          )
                        }
                        onClick={() => {
                          const terminal = ["resolved", "closed"].includes(
                            normalize(selectedCase.status || "reported"),
                          );

                          if (terminal) return;

                          if (
                            adminMissionMode &&
                            selectedCase.id === focusedCaseId
                          ) {
                            if (isAdministrator) {
                              setFollowMe(false);
                              window.setTimeout(() => postMapData(true), 0);
                              return;
                            }

                            if (!tracking) {
                              void startAdminTracking();
                            } else {
                              setFollowMe(false);
                              window.setTimeout(() => postMapData(true), 0);
                            }
                            return;
                          }

                          router.push(
                            `/(admin)/admin-live-map?caseId=${encodeURIComponent(
                              selectedCase.id,
                            )}` as any,
                          );
                        }}
                      >
                        {["resolved", "closed"].includes(
                          normalize(selectedCase.status || "reported"),
                        )
                          ? "Case Closed · Navigation Unavailable"
                          : adminMissionMode &&
                              selectedCase.id === focusedCaseId &&
                              tracking
                            ? roadRoute
                              ? roadRoute.distanceMeters < 20
                                ? "Center Resident on Map"
                                : "Center Full Route on Map"
                              : routeLoading || locating
                                ? "Preparing Route…"
                                : "Refresh Route"
                            : adminMissionMode
                              ? isAdministrator
                                ? adminLguPin
                                  ? "Center LGU Response on Map"
                                  : "Waiting for LGU GPS"
                                : "Start GPS & Navigate"
                              : isAdministrator
                                ? "View LGU Response"
                                : "Navigate to Resident"}
                      </button>

                      {adminMissionMode &&
                        selectedCase.id === focusedCaseId &&
                        tracking && (
                          <button
                            type="button"
                            className="secondary-button admin-stop-route"
                            onClick={toggleTracking}
                          >
                            Stop LGU GPS
                          </button>
                        )}

                      {validRouteCoordinate(routeDestination) && (
                        <a
                          className="google-navigation-button admin-google-route"
                          href={`https://www.google.com/maps/dir/?api=1&destination=${routeDestination.latitude},${routeDestination.longitude}&travelmode=driving`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open in Google Maps
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="admin-route-card unavailable">
                    <div className="admin-route-heading">
                      <div>
                        <span>LGU → RESIDENT ROUTE</span>
                        <strong>Emergency GPS unavailable</strong>
                      </div>
                    </div>
                    <p className="admin-route-explainer">
                      This report does not have valid coordinates, so navigation
                      cannot start until the emergency location is confirmed.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : missionMode && selectedCase ? (
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
                  <span className="clean-kicker">ACTIVE RESPONDER</span>
                  <h2>
                    {residentLguPin?.name ||
                      residentCoordinationCase?.activeLguResponderName ||
                      "LGU coordinating response"}
                  </h2>
                </div>
                <span
                  className={`clean-status-pill ${
                    routeResponderPoint ? "status-responding" : ""
                  }`}
                >
                  {residentLguPin
                    ? residentLguPin.stale
                      ? "LGU STALE"
                      : "LGU LIVE"
                    : residentCoordinationCase?.activeLguResponderUid
                      ? "WAITING GPS"
                      : "WAITING"}
                </span>
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
                  <span>Responder GPS</span>
                  <strong>
                    {routeResponderPoint
                      ? routeResponderPoint.stale
                        ? "STALE"
                        : "LIVE"
                      : "WAITING"}
                  </strong>
                </div>
              </div>

              <div className="clean-resident-message">
                {residentLguPin
                  ? residentLguPin.stale
                    ? "The official LGU response is still assigned. The red LGU pin shows the responder's last known location while VolunServe waits for a fresh GPS update."
                    : "The official LGU response is active. The green pin is your location and the red LGU pin shows the responder in real time."
                  : residentCoordinationCase?.activeLguResponderUid
                    ? "An official LGU responder is assigned. Waiting for the responder's first or next GPS update."
                    : "Your green Resident pin stays visible while VolunServe waits for the official LGU response."}
              </div>

              {residentLguArrivalStatus === "pending" && (
                <div className="resident-arrival-confirm-card">
                  <div>
                    <span>LGU ARRIVAL</span>
                    <strong>Responder reports they are on site</strong>
                    <small>
                      Confirm only if the official LGU responder has reached your emergency location.
                    </small>
                  </div>

                  <button
                    type="button"
                    className="primary-button resident-confirm-arrival-button"
                    disabled={residentArrivalBusy}
                    onClick={() => {
                      void confirmResidentLguArrival();
                    }}
                  >
                    {residentArrivalBusy
                      ? "Confirming…"
                      : "Confirm Arrival"}
                  </button>
                </div>
              )}

              {residentLguArrivalStatus === "confirmed" && (
                <div className="resident-arrival-confirmed-card">
                  <strong>✓ LGU arrival confirmed</strong>
                  <span>Confirmation recorded for this emergency response.</span>
                </div>
              )}

              {!!residentArrivalMessage && (
                <div className="resident-arrival-feedback success">
                  {residentArrivalMessage}
                </div>
              )}

              {!!residentArrivalError && (
                <div className="resident-arrival-feedback error">
                  {residentArrivalError}
                </div>
              )}

              {residentActiveVolunteerAssignment && (
                <div className="clean-info-block">
                  <strong>Optional Volunteer support</strong>
                  <p>
                    {residentActiveVolunteerAssignment.volunteerName || "Volunteer"} · {statusLabel(residentActiveVolunteerAssignment.status)}. This support is additional and does not replace the official LGU responder.
                  </p>
                </div>
              )}

              {residentAssignmentStatus === "completed" && (
                <div className="clean-info-block">
                  <strong>Volunteer support completed</strong>
                  <p>Confirm the assistance from My Reports when requested.</p>
                </div>
              )}

              {routeError && routeResponderPoint && (
                <p className="route-warning">{routeError}</p>
              )}

              {residentCanStartShare && (
                  <div className="clean-optional-share">
                    <div>
                      <strong>Share my moving location</strong>
                      <small>
                        Optional. Share your live GPS with the LGU during an active emergency. If a Volunteer is actively responding, the same live location is shared only with that assigned responder.
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
              <p>Choose an available map pin to view the details.</p>
            </div>
          )}
        </aside>
      </section>
      )}

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
.resident-case-picker {
  display: grid;
  gap: 18px;
  padding: 22px;
  border: 1px solid #dbe6ef;
  border-radius: 22px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(15, 39, 64, 0.08);
}

.resident-case-picker-heading {
  max-width: 860px;
}

.resident-case-picker-heading h2 {
  margin: 5px 0 7px;
  color: #0f2740;
  font-size: clamp(22px, 2.2vw, 30px);
  line-height: 1.15;
}

.resident-case-picker-heading p {
  margin: 0;
  color: #60758a;
  font-size: 14px;
  line-height: 1.6;
}

.resident-case-picker-list {
  display: grid;
  gap: 12px;
}

.resident-case-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 18px;
  border: 1px solid #dbe6ef;
  border-radius: 16px;
  background: #fbfdff;
  color: #0f2740;
  text-align: left;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background 160ms ease;
}

.resident-case-option:hover {
  transform: translateY(-1px);
  border-color: #9fd8cc;
  background: #f4fcf9;
  box-shadow: 0 8px 22px rgba(15, 159, 133, 0.1);
}

.resident-case-option-main {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.resident-case-option-main strong {
  color: #0f2740;
  font-size: 16px;
  line-height: 1.3;
}

.resident-case-option-main small {
  color: #71859a;
  font-size: 12px;
  line-height: 1.4;
}

.resident-case-option-side {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.resident-case-option-side .clean-status-pill {
  font-style: normal;
}

.resident-case-option-side b {
  color: #0f8f79;
  font-size: 13px;
  white-space: nowrap;
}

.resident-change-case-button {
  margin-top: 10px;
  padding: 7px 10px;
  border: 1px solid #cfdce7;
  border-radius: 10px;
  background: #ffffff;
  color: #36536f;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.resident-change-case-button:hover {
  border-color: #9fcfc5;
  color: #0f8f79;
  background: #f6fcfa;
}

@media (max-width: 760px) {
  .resident-case-option {
    align-items: flex-start;
    flex-direction: column;
  }

  .resident-case-option-side {
    width: 100%;
    justify-content: space-between;
  }
}

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

.lgu-base-dot {
  background: #dc2626 !important;
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

.volunteer-map-toolbar {
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

.lgu-navigation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.google-navigation-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f766e;
  font-weight: 800;
  text-decoration: none;
}

.google-navigation-button:hover {
  background: #f8fafc;
}

.resident-role-dot {
  background: #16a34a !important;
}

.responder-dot {
  background: #2563eb !important;
}

.lgu-role-dot {
  background: #dc2626 !important;
}

.full-width-button {
  width: 100%;
  margin-top: 12px;
}


/* =========================================================
   ADMIN / LGU NAVIGATION POLISH
   ========================================================= */

.admin-response-overview {
  width: min(1380px, 100%);
  margin: 0 auto 14px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
  align-items: center;
  gap: 18px;
  padding: 15px 18px;
  border: 1px solid #d7e6ef;
  border-radius: 16px;
  background: linear-gradient(135deg, #ffffff 0%, #f7fbfd 100%);
  box-shadow: 0 8px 24px rgba(15,39,64,.05);
}

.admin-response-overview-main,
.admin-response-overview-status {
  min-width: 0;
}

.admin-response-overview-main > strong,
.admin-response-overview-main > small,
.admin-response-overview-status > span,
.admin-response-overview-status > strong,
.admin-response-overview-status > small {
  display: block;
}

.admin-response-overview-main > strong {
  margin-top: 3px;
  color: var(--vs-navy);
  font-size: 17px;
  line-height: 1.3;
}

.admin-response-overview-main > small {
  margin-top: 5px;
  color: #657b8f;
  font-size: 11px;
  line-height: 1.45;
}

.admin-response-overview-status {
  padding-left: 18px;
  border-left: 1px solid #dfe9ef;
}

.admin-response-overview-status > span {
  color: #7a8da0;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.admin-response-overview-status > strong {
  margin-top: 4px;
  color: #0f766e;
  font-size: 15px;
  line-height: 1.3;
}

.admin-response-overview-status > small {
  margin-top: 4px;
  color: #718499;
  font-size: 10px;
  line-height: 1.4;
}

/* Keep the navigation HUD fully inside the map.
   The base HUD is centered with translateX(-50%); this reset prevents clipping. */
.clean-navigation-hud {
  top: 16px !important;
  left: 16px !important;
  right: auto !important;
  width: min(390px, calc(100% - 32px)) !important;
  max-width: calc(100% - 32px) !important;
  transform: none !important;
  overflow: hidden !important;
  border-radius: 16px !important;
  box-shadow: 0 12px 32px rgba(15,23,42,.16) !important;
}

.clean-navigation-hud .navigation-hud-turn {
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 10px;
  padding: 12px 14px;
}

.clean-navigation-hud .navigation-arrow {
  width: 44px;
  height: 44px;
  border-radius: 13px;
  background: #2563eb;
  font-size: 25px;
}

.clean-navigation-hud .navigation-hud-turn strong {
  overflow-wrap: anywhere;
}

.clean-navigation-hud .navigation-hud-progress {
  padding: 10px 14px 12px;
  border-top: 1px solid #e7edf3;
  background: #f8fbff;
}

.legend-route-line {
  background: #7c3aed !important;
}

/* Give the Resident / route panel enough width to remain readable. */
.clean-map-layout {
  grid-template-columns: minmax(0, 1fr) minmax(390px, 420px);
  gap: 16px;
  align-items: start;
}

.clean-map-card {
  height: clamp(620px, 72vh, 760px);
  min-height: 620px;
}

.clean-map-card iframe {
  height: 100%;
  min-height: 100%;
}

.clean-details-card {
  position: sticky;
  top: 16px;
  height: clamp(620px, 72vh, 760px);
  min-height: 620px;
  max-height: 760px;
  padding: 0;
  overflow: hidden;
}

.clean-details-card > * {
  min-width: 0;
}

.admin-case-panel {
  height: 100%;
  overflow-y: auto;
  padding: 18px;
  scrollbar-width: thin;
  scrollbar-color: #cbd8e2 transparent;
}

.admin-case-panel::-webkit-scrollbar {
  width: 8px;
}

.admin-case-panel::-webkit-scrollbar-track {
  background: transparent;
}

.admin-case-panel::-webkit-scrollbar-thumb {
  border: 2px solid #fff;
  border-radius: 999px;
  background: #cbd8e2;
}

.admin-case-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid #e8eef2;
}

.admin-case-heading > div {
  min-width: 0;
}

.admin-case-heading h2 {
  margin: 4px 0 0;
  color: var(--vs-navy);
  font-size: 20px;
  line-height: 1.18;
  overflow-wrap: anywhere;
}

.admin-resident-profile {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 13px;
  align-items: center;
  margin-top: 14px;
  padding: 13px;
  border: 1px solid #dfe8ee;
  border-radius: 14px;
  background: #fbfdfe;
}

.admin-resident-avatar {
  width: 72px;
  height: 72px;
  border-width: 2px;
}

.admin-resident-copy {
  min-width: 0;
}

.admin-verified-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  padding: 4px 7px;
  border-radius: 999px;
  background: #e9f8f1;
  color: #087963;
  font-size: 9px;
  font-weight: 950;
  letter-spacing: .04em;
}

.admin-resident-name {
  display: block;
  margin-top: 7px;
  color: var(--vs-navy);
  font-size: 15px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.admin-contact-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
  margin-top: 5px;
}

.admin-contact-row span {
  color: #7b8da0;
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
}

.admin-contact-row b {
  min-width: 0;
  color: #4f6478;
  font-size: 11px;
  font-weight: 750;
  overflow-wrap: anywhere;
}

.admin-case-info-grid {
  display: grid;
  gap: 9px;
  margin-top: 12px;
}

.admin-case-info-card {
  padding: 12px 13px;
  border: 1px solid #e2eaf0;
  border-radius: 12px;
  background: #fff;
}

.admin-case-info-card > span,
.admin-case-info-card > strong,
.admin-case-info-card > small {
  display: block;
}

.admin-case-info-card > span {
  color: #73879a;
  font-size: 9px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.admin-case-info-card > strong {
  margin-top: 5px;
  color: #243f5a;
  font-size: 12.5px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.admin-case-info-card > small {
  margin-top: 5px;
  color: #8293a3;
  font-size: 9.5px;
  line-height: 1.45;
}

.admin-route-card {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid #d8e3ea;
  border-radius: 14px;
  background: #f9fcfd;
}

.admin-route-card.active {
  border-color: #b9d7d1;
  background: linear-gradient(180deg, #f5fcfa 0%, #ffffff 100%);
  box-shadow: 0 8px 22px rgba(15,118,110,.07);
}

.admin-route-card.unavailable {
  border-color: #f2d5d5;
  background: #fffafa;
}

.admin-route-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.admin-route-heading > div {
  min-width: 0;
}

.admin-route-heading span,
.admin-route-heading strong {
  display: block;
}

.admin-route-heading > div > span {
  color: #72879b;
  font-size: 9px;
  font-weight: 950;
  letter-spacing: .07em;
}

.admin-route-heading > div > strong {
  margin-top: 4px;
  color: var(--vs-navy);
  font-size: 14px;
  line-height: 1.3;
}

.admin-route-state {
  flex: 0 0 auto;
  padding: 5px 8px;
  border-radius: 999px;
  background: #edf3f6;
  color: #607589;
  font-size: 9px;
  font-weight: 950;
}

.admin-route-state.active {
  background: #e5f8f1;
  color: #087963;
}

.admin-route-explainer {
  margin: 9px 0 0;
  color: #607589;
  font-size: 10.5px;
  line-height: 1.5;
}

.admin-route-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 11px;
}

.admin-route-metrics > div {
  padding: 10px 11px;
  border: 1px solid #e0e8ee;
  border-radius: 11px;
  background: #fff;
}

.admin-route-metrics span,
.admin-route-metrics strong {
  display: block;
}

.admin-route-metrics span {
  color: #7a8da0;
  font-size: 8.5px;
  font-weight: 950;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.admin-route-metrics strong {
  margin-top: 4px;
  color: #173d5e;
  font-size: 15px;
}

.admin-route-message {
  margin-top: 10px;
  padding: 9px 10px;
  border: 1px solid #d9e6ef;
  border-radius: 10px;
  background: #f5f9fc;
  color: #536b80;
  font-size: 10px;
  line-height: 1.45;
}

.admin-route-message.arrived {
  border-color: #c8e7d7;
  background: #effaf4;
  color: #24704e;
}

.lgu-on-site-banner {
  display: grid;
  gap: 4px;
  margin-top: 11px;
  padding: 11px 12px;
  border: 1px solid #a7e0c2;
  border-radius: 10px;
  background: #ecfdf3;
}

.lgu-on-site-banner strong {
  color: #067647;
  font-size: 12px;
  font-weight: 900;
}

.lgu-on-site-banner span {
  color: #24704e;
  font-size: 10px;
  line-height: 1.45;
}

.lgu-arrival-feedback {
  margin-top: 9px;
  padding: 9px 10px;
  border-radius: 9px;
  font-size: 10px;
  line-height: 1.45;
}

.lgu-arrival-feedback.success {
  border: 1px solid #a7e0c2;
  background: #ecfdf3;
  color: #067647;
}

.lgu-arrival-feedback.error {
  border: 1px solid #f5b7b1;
  background: #fff1f0;
  color: #b42318;
}

.lgu-arrived-button {
  width: 100%;
  min-height: 44px;
  border: 0;
  border-radius: 10px;
  background: #175cd3;
  color: #ffffff;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.lgu-arrived-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.admin-route-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 11px;
}

.admin-route-actions .primary-button,
.admin-route-actions .secondary-button,
.admin-route-actions .google-navigation-button {
  width: 100%;
  min-height: 42px;
}

.admin-route-primary {
  font-weight: 850;
}

.admin-stop-route {
  border-color: #d8e3ea;
  background: #fff;
}

.admin-google-route {
  min-height: 42px;
  border-color: #cddde4;
  background: #fff;
}

/* Keep non-admin detail modes padded even though the shared card itself
   no longer owns the padding. */
.clean-details-card > :not(.admin-case-panel) {
  margin-left: 18px;
  margin-right: 18px;
}

.clean-details-card > :first-child:not(.admin-case-panel) {
  margin-top: 18px;
}

.clean-details-card > :last-child:not(.admin-case-panel) {
  margin-bottom: 18px;
}


.lgu-arrival-confirmation-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #d9e5ec;
  border-radius: 12px;
  background: #f8fbfd;
}

.lgu-arrival-confirmation-strip span {
  color: #60758a;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .03em;
  text-transform: uppercase;
}

.lgu-arrival-confirmation-strip strong {
  color: #7a4d00;
  font-size: 12px;
  font-weight: 900;
  text-align: right;
}

.lgu-arrival-confirmation-strip.confirmed {
  border-color: #b9dfc8;
  background: #f0fbf4;
}

.lgu-arrival-confirmation-strip.confirmed strong {
  color: #067647;
}

.resident-arrival-confirm-card {
  display: grid;
  gap: 11px;
  padding: 14px;
  border: 1px solid #b8d5ff;
  border-radius: 14px;
  background: #f5f9ff;
}

.resident-arrival-confirm-card > div {
  display: grid;
  gap: 4px;
}

.resident-arrival-confirm-card span {
  color: #175cd3;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .05em;
}

.resident-arrival-confirm-card strong {
  color: #0f2740;
  font-size: 14px;
  line-height: 1.35;
}

.resident-arrival-confirm-card small {
  color: #60758a;
  font-size: 12px;
  line-height: 1.45;
}

.resident-confirm-arrival-button {
  width: 100%;
  min-height: 42px;
}

.resident-arrival-confirmed-card {
  display: grid;
  gap: 3px;
  padding: 12px 14px;
  border: 1px solid #b9dfc8;
  border-radius: 14px;
  background: #f0fbf4;
}

.resident-arrival-confirmed-card strong {
  color: #067647;
  font-size: 13px;
  font-weight: 900;
}

.resident-arrival-confirmed-card span {
  color: #52705f;
  font-size: 12px;
}

.resident-arrival-feedback {
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.45;
}

.resident-arrival-feedback.success {
  border: 1px solid #a7e0c2;
  background: #ecfdf3;
  color: #067647;
}

.resident-arrival-feedback.error {
  border: 1px solid #f5b7b1;
  background: #fff1f0;
  color: #b42318;
}

@media (max-width: 1260px) {
  .clean-map-layout {
    grid-template-columns: minmax(0, 1fr) minmax(350px, 380px);
  }
}

@media (max-width: 1100px) {
  .admin-response-overview {
    grid-template-columns: 1fr;
  }

  .admin-response-overview-status {
    padding-top: 12px;
    padding-left: 0;
    border-top: 1px solid #dfe9ef;
    border-left: 0;
  }

  .clean-map-layout {
    grid-template-columns: 1fr;
  }

  .clean-details-card {
    position: static;
    width: 100%;
    height: auto;
    min-height: 0;
    max-height: none;
    overflow: visible;
  }

  .admin-case-panel {
    height: auto;
    overflow: visible;
  }
}

@media (max-width: 680px) {
  .admin-response-overview {
    padding: 13px;
  }

  .admin-case-panel {
    padding: 14px;
  }

  .admin-resident-profile {
    grid-template-columns: 58px minmax(0, 1fr);
  }

  .admin-resident-avatar {
    width: 56px;
    height: 56px;
  }

  .admin-route-metrics {
    grid-template-columns: 1fr;
  }

  .clean-navigation-hud {
    top: 10px !important;
    left: 10px !important;
    width: calc(100% - 20px) !important;
    max-width: calc(100% - 20px) !important;
  }
}
`
