import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

/**
 * Public event meeting-point map. The road route is requested only after the
 * visitor explicitly requests GPS directions. No visitor GPS is saved.
 *
 * Basemap: OpenFreeMap / OpenStreetMap data rendered with MapLibre.
 * Road route: OSRM (traffic-independent estimate; external service).
 */
type Point = { latitude: number; longitude: number };
type Props = {
  eventId: string;
  title: string;
  category: string;
  destination: Point;
  origin?: Point | null;
  height?: number;
};
type RoadRoute = { coordinates: number[][]; distanceMeters: number; durationSeconds: number };
const SJDM = { latitude: 14.813, longitude: 121.045 };
const valid = (point?: Point | null) =>
  !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
  Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
const toDistance = (m: number) =>
  m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(1) + " km";
const venueSymbol = (category: string) => ({
  "Clean-up Drive": "🧹", "Tree Planting": "🌱", "Feeding Program": "🍲",
  "Pet Welfare": "🐾", "Community Outreach": "🤝",
}[category] || "📍");

/** The generated iframe contains numbers and a fixed icon only, never user HTML. */
function mapHtml(destination: Point, origin: Point | null, route: RoadRoute | null, icon: string) {
  const payload = JSON.stringify({
    venue: [destination.longitude, destination.latitude],
    source: origin ? [origin.longitude, origin.latitude] : null,
    route: route?.coordinates || null,
    icon,
  }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" />
  <style>
    html,body,#map{width:100%;height:100%;margin:0;background:#E8F1EC}
    .marker{width:39px;height:39px;border:3px solid #fff;border-radius:50% 50% 50% 8px;
      transform:rotate(-45deg);display:grid;place-items:center;background:#116D55;
      box-shadow:0 5px 15px #173e324d}
    .marker span{transform:rotate(45deg);font-size:21px;line-height:1}
    .origin{width:19px;height:19px;background:#3777DE;border:4px solid white;border-radius:99px;
      box-shadow:0 0 0 8px #3777de30}
    #credit{position:absolute;bottom:8px;left:9px;background:#ffffffef;border-radius:6px;
      padding:5px 8px;font:11px system-ui;color:#35584b;pointer-events:none}
    #fallback{display:none;position:absolute;inset:0;place-items:center;text-align:center;
      background:#e8f1ec;padding:18px;font:13px system-ui;color:#295848}
  </style>
</head><body>
  <div id="map"></div><div id="credit">OpenStreetMap / OpenFreeMap · OSRM road routing</div>
  <div id="fallback">Map tiles are unavailable. Use Open in Google Maps for directions.</div>
  <script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"><\/script>
  <script>
    (() => {
      const data = ${payload};
      const fallback = () => { document.getElementById("fallback").style.display = "grid"; };
      if (typeof maplibregl === "undefined") { fallback(); return; }
      try {
        const map = new maplibregl.Map({
          container: "map", style: "https://tiles.openfreemap.org/styles/liberty",
          center: data.venue, zoom: 13.8, attributionControl: true, interactive: true
        });
        map.addControl(new maplibregl.NavigationControl({showCompass:false}), "top-right");
        const venue = document.createElement("div");
        venue.className = "marker";
        const symbol = document.createElement("span");
        symbol.textContent = data.icon;
        venue.appendChild(symbol);
        new maplibregl.Marker({element:venue}).setLngLat(data.venue)
          .setPopup(new maplibregl.Popup({offset:25}).setText("Event meeting point"))
          .addTo(map);
        if (data.source) {
          const source = document.createElement("div");
          source.className = "origin";
          new maplibregl.Marker({element:source}).setLngLat(data.source)
            .setPopup(new maplibregl.Popup({offset:17}).setText("Your permitted location"))
            .addTo(map);
        }
        map.on("load", () => {
          if (data.route && data.route.length > 1) {
            map.addSource("volunserve-road-route", {
              type:"geojson", data:{type:"Feature",properties:{},
                geometry:{type:"LineString",coordinates:data.route}}
            });
            map.addLayer({id:"route-casing",type:"line",source:"volunserve-road-route",
              paint:{"line-color":"#FFFFFF","line-width":9,"line-opacity":0.93}});
            map.addLayer({id:"route",type:"line",source:"volunserve-road-route",
              paint:{"line-color":"#097D66","line-width":5}});
            const bounds = new maplibregl.LngLatBounds();
            for (const p of data.route) bounds.extend(p);
            map.fitBounds(bounds,{padding:56,maxZoom:15.5,duration:0});
          } else if (data.source) {
            const bounds = new maplibregl.LngLatBounds();
            bounds.extend(data.venue); bounds.extend(data.source);
            map.fitBounds(bounds,{padding:52,maxZoom:14.5,duration:0});
          }
        });
        map.on("error", e => {
          if (e?.error?.message?.includes("style")) fallback();
        });
      } catch (_) { fallback(); }
    })();
  <\/script>
</body></html>`;
}

export default function CommunityEventRoadMap({
  eventId, title, category, destination, origin = null, height = 270,
}: Props) {
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [status, setStatus] = useState<"place" | "loading" | "ready" | "unavailable">("place");
  const sourceLat = origin?.latitude;
  const sourceLng = origin?.longitude;

  useEffect(() => {
    setRoute(null);
    if (!valid(origin) || !valid(destination)) {
      setStatus("place");
      return;
    }
    const controller = new AbortController();
    const loadRoute = async () => {
      setStatus("loading");
      try {
        const coords =
          `${origin!.longitude},${origin!.latitude};${destination.longitude},${destination.latitude}`;
        const response = await fetch(
          "https://router.project-osrm.org/route/v1/driving/" + coords +
          "?overview=full&geometries=geojson&steps=false&alternatives=false",
          { signal: controller.signal, headers: { Accept: "application/json" } }
        );
        if (!response.ok) throw new Error("Road directions unavailable");
        const data = await response.json();
        const entry = data?.routes?.[0];
        const points = entry?.geometry?.coordinates;
        if (!Array.isArray(points) || points.length < 2 || points.length > 20000 ||
            !points.every((p: unknown) => Array.isArray(p) && p.length === 2 &&
              Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
              Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90) ||
            !Number.isFinite(entry.distance) || !Number.isFinite(entry.duration)) {
          throw new Error("Invalid road routing data");
        }
        if (controller.signal.aborted) return;
        setRoute({
          coordinates: points, distanceMeters: entry.distance,
          durationSeconds: entry.duration,
        });
        setStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus("unavailable");
        setRoute(null);
      }
    };
    void loadRoute();
    return () => controller.abort();
  }, [eventId, destination.latitude, destination.longitude, sourceLat, sourceLng]);

  const doc = useMemo(
    () => mapHtml(destination, valid(origin) ? origin : null, route, venueSymbol(category)),
    [destination.latitude, destination.longitude, sourceLat, sourceLng, category, route]
  );
  if (!valid(destination)) return null;
  return (
    <View style={styles.wrapper}>
      {React.createElement("iframe" as any, {
        key: eventId + "-" + (route ? "route" : "venue") +
          "-" + destination.latitude + "-" + destination.longitude,
        title: "Interactive road map to " + title,
        srcDoc: doc, loading: "lazy", sandbox: "allow-scripts",
        referrerPolicy: "no-referrer",
        style: { width: "100%", height: height + "px", border: "0", display: "block", borderRadius: "12px" },
      })}
      <View style={styles.captionRow}>
        <View style={styles.captionIcon}>
          <Text style={styles.captionEmoji}>{venueSymbol(category)}</Text>
        </View>
        <View style={styles.captionText}>
          <Text style={styles.captionTitle}>
            {status === "ready" && route ? `${toDistance(route.distanceMeters)} · about ${Math.max(1, Math.round(route.durationSeconds / 60))} min`
              : status === "loading" ? "Calculating road route…" :
                status === "unavailable" ? "In-app road route unavailable" : "Confirmed event venue pin"}
          </Text>
          <Text style={styles.captionSub}>
            {status === "ready"
              ? "OSRM estimate · no live traffic · external navigation available"
              : status === "unavailable"
                ? "Use Open in Google Maps to navigate. Your location is not stored."
                : status === "loading"
                  ? "Using GPS only for this route request; no Firestore write"
                  : "Select Show Route Here for a road preview from your GPS."}
          </Text>
        </View>
        {status === "loading" && <ActivityIndicator size="small" color="#23765F" />}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  wrapper: { backgroundColor: "#F8FBF8", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#DAE8DE", minWidth: 0 },
  captionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 13, paddingVertical: 12, gap: 11 },
  captionIcon: { backgroundColor: "#E3F2E9", width: 37, height: 37, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  captionEmoji: { fontSize: 21 },
  captionText: { flex: 1, minWidth: 0 },
  captionTitle: { fontSize: 13, fontWeight: "700", color: "#164934" },
  captionSub: { fontSize: 11, color: "#708779", lineHeight: 17, marginTop: 3 },
});
