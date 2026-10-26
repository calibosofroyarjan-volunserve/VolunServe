import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import InteractiveEventPinMap from "./InteractiveEventPinMap.web";

type Venue = { latitude: number; longitude: number };
type Props = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number | null, longitude: number | null) => void;
};

const CENTER: Venue = { latitude: 14.8139, longitude: 121.0453 };
const GOOGLE_JS_KEY = String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_JS_API_KEY || "").trim();
let googleScriptPromise: Promise<any> | null = null;

function validVenue(lat: number, lng: number) {
  // Matches the Node proposal API's broad SJDM-area coordinate guard.
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= 14.65 && lat <= 15.0 && lng >= 120.88 && lng <= 121.30;
}
function tidy(lat: number, lng: number): Venue {
  return { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) };
}
function same(a: Venue | null, b: Venue | null) {
  return !!a && !!b && a.latitude === b.latitude && a.longitude === b.longitude;
}
function parseGoogleLocation(raw: string): Venue | null {
  const input = raw.trim();
  // Accept decimal coordinates or coordinate-bearing (full, not shortened) Maps URLs.
  const patterns = [
    /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|destination|ll)=(-?\d{1,2}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/i,
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
  ];
  for (const expression of patterns) {
    const match = input.match(expression);
    if (match) return tidy(Number(match[1]), Number(match[2]));
  }
  return null;
}
function loadGoogleMaps(key: string): Promise<any> {
  const g = (globalThis as any).google;
  if (g?.maps?.Map) return Promise.resolve(g);
  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const doc = (globalThis as any).document;
      if (!doc) { reject(new Error("Browser document unavailable")); return; }
      const script = doc.createElement("script");
      script.src = "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(key) + "&v=weekly";
      script.async = true;
      script.onload = () => {
        const loaded = (globalThis as any).google;
        loaded?.maps?.Map ? resolve(loaded) : reject(new Error("Maps JavaScript API unavailable"));
      };
      script.onerror = () => reject(new Error("Google Maps could not load"));
      doc.head.appendChild(script);
    }).catch((error) => {
      googleScriptPromise = null;
      throw error;
    });
  }
  return googleScriptPromise;
}

export default function CommunityEventPinPicker({ latitude, longitude, onChange }: Props) {
  const saved = latitude !== null && longitude !== null && validVenue(latitude, longitude)
    ? tidy(latitude, longitude) : null;
  const savedRef = useRef<Venue | null>(saved);
  savedRef.current = saved;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [draft, setDraft] = useState<Venue | null>(saved);
  const draftRef = useRef<Venue | null>(draft);
  draftRef.current = draft;
  const [manual, setManual] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [mapMode, setMapMode] = useState<"loading" | "google" | "preview">(
    GOOGLE_JS_KEY ? "loading" : "preview"
  );
  const mapContainer = useRef<any>(null);
  const mapInstance = useRef<any>(null);
  const markerInstance = useRef<any>(null);
  const googleRef = useRef<any>(null);
  const confirmed = same(saved, draft);

  const pick = (lat: number, lng: number) => {
    if (!validVenue(lat, lng)) {
      setMessage("Pumili ng location sa San Jose del Monte area. Hindi tatanggapin ang pin na malayo sa service area.");
      return false;
    }
    const next = tidy(lat, lng);
    setDraft(next);
    draftRef.current = next;
    setMessage("Pin selected. Confirm this meeting point before submitting your proposal.");
    if (savedRef.current && !same(savedRef.current, next)) onChangeRef.current(null, null);
    return true;
  };

  useEffect(() => {
    if (!GOOGLE_JS_KEY) return;
    let active = true;
    loadGoogleMaps(GOOGLE_JS_KEY).then((g) => {
      if (!active || !mapContainer.current) return;
      googleRef.current = g;
      const point = draft || savedRef.current || CENTER;
      const map = new g.maps.Map(mapContainer.current, {
        center: { lat: point.latitude, lng: point.longitude },
        zoom: draft || savedRef.current ? 16 : 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling: "greedy",
      });
      mapInstance.current = map;
      map.addListener("click", (event: any) => {
        if (event.latLng) pick(event.latLng.lat(), event.latLng.lng());
      });
      setMapMode("google");
    }).catch(() => {
      if (active) {
        setMapMode("preview");
        setMessage("Google Maps did not load. You can still tap the interactive map to select your event venue.");
      }
    });
    return () => {
      active = false;
      const g = googleRef.current;
      if (g?.maps?.event && mapInstance.current) {
        g.maps.event.clearInstanceListeners(mapInstance.current);
      }
      if (markerInstance.current?.setMap) markerInstance.current.setMap(null);
      markerInstance.current = null;
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const g = googleRef.current;
    if (!map || !g) return;
    if (!draft) {
      if (markerInstance.current) markerInstance.current.setMap(null);
      markerInstance.current = null;
      return;
    }
    const position = {lat: draft.latitude, lng: draft.longitude};
    if (!markerInstance.current) {
      const marker = new g.maps.Marker({map, position, draggable: true, title:"Event meeting point"});
      marker.addListener("dragend", (event: any) => {
        // A rejected drag must visually snap back to the last accepted venue.
        // Otherwise the marker can disagree with the confirmed proposal coordinates.
        if (!event.latLng || !pick(event.latLng.lat(), event.latLng.lng())) {
          const lastValid = draftRef.current;
          if (lastValid) marker.setPosition({ lat: lastValid.latitude, lng: lastValid.longitude });
        }
      });
      markerInstance.current = marker;
    } else markerInstance.current.setPosition(position);
    map.panTo(position);
    map.setZoom(16);
  }, [draft?.latitude, draft?.longitude, mapMode]);

  const locate = () => {
    const geo = (globalThis as any).navigator?.geolocation;
    if (!geo) { setMessage("GPS unavailable. Tap the map to select the venue, or enter coordinates."); return; }
    setMessage("Requesting current device location...");
    geo.getCurrentPosition(
      (result: any) => pick(result.coords.latitude, result.coords.longitude),
      () => setMessage("Device location unavailable. Tap the map to select the actual event meeting point."),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0},
    );
  };
  const useManual = () => {
    const coords = parseGoogleLocation(manual);
    if (!coords) {
      setMessage("Use exact latitude, longitude or a full coordinate-bearing Google Maps URL. Shortened links are not supported.");
      return;
    }
    pick(coords.latitude, coords.longitude);
  };
  const confirm = () => {
    if (!draft || !validVenue(draft.latitude,draft.longitude)) {
      setMessage("Pumili muna ng valid event venue pin.");
      return;
    }
    onChange(draft.latitude, draft.longitude);
    setMessage("Confirmed ang event meeting point. Ito ang map location na irereview ng Admin at gagamitin ng Volunteer.");
  };

  const title = { fontWeight: "700" as const, color: "#123F34" };
  const buttonText = { fontWeight: "700" as const, color: "#FFFFFF", fontSize: 12 };
  const button = { paddingHorizontal: 15, paddingVertical: 12, borderRadius: 9, backgroundColor: "#0D7458" };
  return (
    <View style={{
      marginTop: 15, padding: 17, borderRadius: 15, borderWidth: 1,
      borderColor: "#D6E7DE", backgroundColor: "#FAFCFA",
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <View style={{
          height: 33, width: 33, borderRadius: 10, backgroundColor: "#E0F1E8",
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 18 }}>📍</Text>
        </View>
        <View style={{ flex: 1, minWidth: 190 }}>
          <Text style={{ ...title, fontSize: 15 }}>Event Meeting Point *</Text>
          <Text style={{ fontSize: 11.5, lineHeight: 17, color: "#688073", marginTop: 2 }}>
            Tap the exact event venue on the map, then confirm the location.
          </Text>
        </View>
        <Text style={{
          color: "#2E755B", fontSize: 10, fontWeight: "700",
          backgroundColor: "#E5F3EB", borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8,
        }}>SAN JOSE DEL MONTE</Text>
      </View>

      <View style={{ borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#D6E5D9" }}>
        {GOOGLE_JS_KEY ? React.createElement("div" as any, {
          ref: mapContainer, role: "application",
          "aria-label": "Interactive Google Maps. Click or drag to select the event meeting point.",
          style: { width: "100%", height: "315px", display: mapMode === "google" || mapMode === "loading" ? "block" : "none" },
        }) : null}
        {mapMode === "preview" ? (
          <InteractiveEventPinMap
            latitude={draft?.latitude ?? null}
            longitude={draft?.longitude ?? null}
            onPick={pick}
          />
        ) : null}
      </View>
      {mapMode === "loading" && (
        <Text style={{ fontSize: 12, color: "#5A7567", paddingVertical: 8 }}>
          Loading interactive venue map…
        </Text>
      )}
      {mapMode === "google" && (
        <Text style={{ fontSize: 11.5, color: "#3E7D60", paddingVertical: 9 }}>
          Tap any location on Google Maps, or drag the pin to adjust it.
        </Text>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 13 }}>
        <Pressable accessibilityRole="button" onPress={locate} style={button}>
          <Text style={buttonText}>◎ Use Current GPS</Text>
        </Pressable>
        <Pressable accessibilityRole="link"
          onPress={() => void Linking.openURL("https://www.google.com/maps/@14.8139,121.0453,13z")}
          style={{ ...button, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D1E4D9" }}>
          <Text style={{ ...buttonText, color: "#245F4C" }}>Open Google Maps ↗</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: manualOpen }}
          onPress={() => setManualOpen(value => !value)}
          style={{ ...button, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D1E4D9" }}>
          <Text style={{ ...buttonText, color: "#245F4C" }}>
            {manualOpen ? "Hide Coordinates" : "Enter Coordinates"}
          </Text>
        </Pressable>
      </View>

      {manualOpen && (
        <View style={{ marginTop: 13, padding: 12, borderRadius: 10, backgroundColor: "#F0F7F2" }}>
          <Text style={{ ...title, fontSize: 12, marginBottom: 7 }}>
            Advanced · Paste coordinates or a Google Maps URL
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TextInput value={manual} onChangeText={setManual}
              placeholder="14.813900, 121.045300"
              placeholderTextColor="#80978A" autoCapitalize="none"
              accessibilityLabel="Exact event venue coordinates or full Google Maps URL"
              style={{ flexGrow: 1, flexBasis: 220, minWidth: 160, paddingHorizontal: 12, paddingVertical: 10,
                borderWidth: 1, borderColor: "#C9DDD1", borderRadius: 9,
                backgroundColor: "#FFFFFF", fontSize: 12, color: "#163F32" }} />
            <Pressable accessibilityRole="button" onPress={useManual} style={button}>
              <Text style={buttonText}>Set Pin</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={{
        marginTop: 15, paddingHorizontal: 13, paddingVertical: 12,
        borderRadius: 10, borderWidth: 1,
        borderColor: confirmed ? "#B7DBCA" : draft ? "#D1DFCD" : "#E0E7E0",
        backgroundColor: confirmed ? "#EAF6EE" : "#FFFFFF",
        flexDirection: "row", alignItems: "center", gap: 11,
      }}>
        <Text style={{ fontSize: 21, color: confirmed ? "#087A5D" : "#7B8E83" }}>
          {confirmed ? "✓" : draft ? "⌖" : "○"}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={{ ...title, fontSize: 12.5 }}>
            {confirmed ? "Meeting point confirmed" :
              draft ? "Pin selected — confirm below" : "Select an event pin on the map"}
          </Text>
          {draft && (
            <Text selectable style={{ fontSize: 11, color: "#607F6E", marginTop: 4 }}>
              {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}
            </Text>
          )}
        </View>
      </View>

      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !draft || confirmed }}
        disabled={!draft || confirmed} onPress={confirm}
        style={{
          marginTop: 11, minHeight: 47, padding: 12, borderRadius: 10,
          backgroundColor: !draft || confirmed ? "#9BC8B6" : "#0B7659",
          justifyContent: "center", alignItems: "center",
        }}>
        <Text style={{ ...buttonText, fontSize: 13 }}>
          {confirmed ? "Location Confirmed ✓" : "Confirm Meeting Point"}
        </Text>
      </Pressable>
      {!!message && (
        <Text accessibilityRole="alert"
          style={{ fontSize: 11.5, lineHeight: 18, color: "#476D5D", marginTop: 9 }}>
          {message}
        </Text>
      )}
      <Text style={{ fontSize: 10.5, lineHeight: 17, color: "#779084", marginTop: 11 }}>
        Only the confirmed meeting point is submitted for LGU review. Your current GPS is never
        shared as live tracking when proposing an event.
      </Text>
    </View>
  );
}
