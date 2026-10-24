import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";

type Venue = { latitude: number; longitude: number };
type Props = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number | null, longitude: number | null) => void;
};

const CENTER: Venue = { latitude: 14.8139, longitude: 121.0453 };
const GOOGLE_JS_KEY = String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_JS_API_KEY || "").trim();
const GOOGLE_EMBED_KEY = String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY || "").trim();
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
function googlePreview(lat: number, lng: number) {
  const point = encodeURIComponent(String(lat) + "," + String(lng));
  return GOOGLE_EMBED_KEY
    ? "https://www.google.com/maps/embed/v1/place?key=" +
      encodeURIComponent(GOOGLE_EMBED_KEY) + "&q=" + point + "&zoom=16"
    : "https://maps.google.com/maps?q=" + point + "&z=16&output=embed";
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
  const [manual, setManual] = useState("");
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
      return;
    }
    const next = tidy(lat, lng);
    setDraft(next);
    setMessage("Pin selected. Click Confirm Event Pin below para ma-save sa proposal.");
    if (savedRef.current && !same(savedRef.current, next)) onChangeRef.current(null, null);
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
        setMessage("Google Maps interactive mode unavailable. You can still enter GPS coordinates or use device location.");
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
        if (event.latLng) pick(event.latLng.lat(), event.latLng.lng());
      });
      markerInstance.current = marker;
    } else markerInstance.current.setPosition(position);
    map.panTo(position);
    map.setZoom(16);
  }, [draft?.latitude, draft?.longitude, mapMode]);

  const locate = () => {
    const geo = (globalThis as any).navigator?.geolocation;
    if (!geo) { setMessage("GPS unavailable. Puwede mong ilagay ang Google Maps coordinates sa baba."); return; }
    setMessage("Requesting current device location...");
    geo.getCurrentPosition(
      (result: any) => pick(result.coords.latitude, result.coords.longitude),
      () => setMessage("Location permission denied/unavailable. Use manual Google Maps coordinates instead."),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0},
    );
  };
  const useManual = () => {
    const coords = parseGoogleLocation(manual);
    if (!coords) {
      setMessage("I-paste ang exact latitude, longitude (example: 14.813900, 121.045300) o full Google Maps URL na may coordinates. Hindi supported ang shortened maps.app.goo.gl link.");
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

  const previewPoint = draft || saved || CENTER;
  const title = {fontWeight:"800" as const,color:"#143F42"};
  const actionText = {fontWeight:"800" as const,color:"#FFFFFF",fontSize:12};
  const action = {paddingHorizontal:13,paddingVertical:12,borderRadius:8,backgroundColor:"#087F75"};
  return <View style={{marginTop:16,padding:14,borderRadius:14,borderWidth:1,borderColor:"#D3E8E5",backgroundColor:"#F7FBFA"}}>
    <Text style={{...title,fontSize:15}}>Event Location & GPS Meeting Point *</Text>
    <Text style={{fontSize:12,color:"#526C76",marginTop:5,marginBottom:12}}>
      1. Set the venue above. 2. Select its exact pin. 3. Confirm it before submitting. Admin reviews the pinned venue, then Volunteers can navigate there.
    </Text>
    <View style={{borderWidth:1,borderColor:"#D1E5E7",borderRadius:10,overflow:"hidden",backgroundColor:"#E6F2EE"}}>
      {GOOGLE_JS_KEY ? React.createElement("div" as any,{
        ref:mapContainer,
        role:"application",
        "aria-label":"Google Maps venue pin picker. Click a location to select an event pin.",
        style:{width:"100%",height:"285px",display:mapMode==="preview"?"none":"block"}
      }) : null}
      {mapMode==="preview" ? React.createElement("iframe" as any,{
        src:googlePreview(previewPoint.latitude,previewPoint.longitude),
        title:"Google Maps event location preview",
        loading:"lazy",
        allowFullScreen:true,
        style:{display:"block",border:"0",width:"100%",height:"285px"}
      }) : null}
    </View>
    {mapMode === "loading" ? <Text style={{fontSize:12,color:"#526C76",marginTop:7}}>Loading Google Maps...</Text> : null}
    {mapMode === "google" ?
      <Text style={{fontSize:11,color:"#0A7567",marginTop:7}}>Google Maps interactive: click or drag the pin, then Confirm Event Pin.</Text> :
      <Text style={{fontSize:11,color:"#57737D",marginTop:7}}>Google Maps preview. For clickable pin selection inside VolunServe, configure a Google Maps JavaScript API key. GPS or coordinates work without it.</Text>}
    <View style={{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:12}}>
      <Pressable onPress={locate} style={action}><Text style={actionText}>Use My Current GPS</Text></Pressable>
      <Pressable onPress={()=>void Linking.openURL("https://www.google.com/maps/@14.8139,121.0453,13z")} style={{...action,backgroundColor:"#EEF7FF",borderWidth:1,borderColor:"#B7D9EC"}}>
        <Text style={{...actionText,color:"#17628D"}}>Find Venue in Google Maps ↗</Text>
      </Pressable>
    </View>
    <Text style={{...title,marginTop:15,marginBottom:6,fontSize:12}}>Paste GPS coordinates or a full Google Maps URL</Text>
    <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>
      <TextInput value={manual} onChangeText={setManual} placeholder="14.813900, 121.045300" placeholderTextColor="#79949F"
        accessibilityLabel="Event venue coordinates or full Google Maps URL"
        autoCapitalize="none" style={{flexGrow:1,flexBasis:220,minWidth:160,paddingHorizontal:12,paddingVertical:10,borderWidth:1,borderColor:"#C7DCDC",borderRadius:9,backgroundColor:"#FFFFFF",fontSize:12,color:"#143F42"}}/>
      <Pressable onPress={useManual} style={action}><Text style={actionText}>Set Pin</Text></Pressable>
    </View>
    <View style={{marginTop:13,padding:11,backgroundColor:"#FFFFFF",borderRadius:10,borderWidth:1,borderColor:confirmed?"#77CCB2":"#F4D4A4"}}>
      <Text style={{fontSize:12,fontWeight:"800",color:confirmed?"#087F75":"#966316"}}>
        {confirmed ? "✓ Confirmed event pin" : draft ? "Pin selected — confirm to save" : "No event pin confirmed"}
      </Text>
      {draft ? <Text style={{color:"#355F68",fontSize:12,marginTop:4}}>
        {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}
      </Text> : null}
    </View>
    <Pressable disabled={!draft || confirmed} onPress={confirm}
      style={{marginTop:10,padding:14,backgroundColor:!draft||confirmed?"#93BDB7":"#087F75",borderRadius:10,alignItems:"center"}}>
      <Text style={{...actionText,fontSize:13}}>{confirmed?"Location Confirmed ✓":"Confirm Event Pin"}</Text>
    </Pressable>
    {!!message ? <Text accessibilityRole="alert" style={{fontSize:12,color:"#425F6B",marginTop:8}}>{message}</Text> : null}
    <Text style={{fontSize:10,color:"#758C91",marginTop:12}}>
      Your live location is never published. Only the confirmed event meeting point is saved. Google Maps provides map display and external navigation.
    </Text>
  </View>;
}
