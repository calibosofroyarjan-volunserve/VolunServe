import React, { useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import { SJDM_REFERENCE_GEOMETRY } from "../constants/sjdmBoundaryReference";
import { insideSjdmBoundary, sjdmOutsideMask, type SjdmBoundary } from "../lib/sjdmMapBoundary";

type Props = {
  latitude: number | null;
  longitude: number | null;
  onPick: (latitude: number, longitude: number) => void;
};
const FALLBACK_CENTER = { latitude: 14.8139, longitude: 121.0453 };
// Same city polygon and outside shading as the working Volunteer/Emergency maps.
const SJDM_CITY: SjdmBoundary = {
  type: "Feature",
  properties: {
    source: "geoBoundaries ADM3 simplified CC BY 4.0",
    city: "City of San Jose del Monte",
    province: "Bulacan",
  },
  geometry: SJDM_REFERENCE_GEOMETRY as unknown as SjdmBoundary["geometry"],
};
const SJDM_MASK = sjdmOutsideMask(SJDM_CITY);
const withinSjdm = (lat: number, lng: number) =>
  insideSjdmBoundary(SJDM_CITY, lat, lng);
const isPoint = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === "number" && typeof lng === "number" &&
  Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function iframeDocument(token: string, latitude: number, longitude: number) {
  // Embed numbers + an unpredictable instance token; no user-supplied HTML.
  const initial = JSON.stringify({ token, latitude, longitude, city: SJDM_CITY, outside: SJDM_MASK }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css">
  <style>
    html,body,#map{height:100%;width:100%;margin:0;background:#E6F1E9}
    .pin{width:34px;height:34px;display:grid;place-items:center;border:3px solid white;
      border-radius:50% 50% 50% 8px;transform:rotate(-45deg);background:#0C8065;
      box-shadow:0 5px 16px #163b3366;cursor:grab}
    .pin span{font:18px system-ui;line-height:1;transform:rotate(45deg);color:white}
    #hint{position:absolute;left:10px;top:10px;z-index:5;background:#ffffffee;color:#254F40;
      padding:9px 13px;border-radius:9px;box-shadow:0 3px 10px #122b2420;font:600 12px system-ui;
      pointer-events:none}
    #fallback{display:none;position:absolute;inset:0;place-items:center;padding:22px;
      text-align:center;background:#E7F0E9;color:#46665B;font:13px system-ui}
  </style></head><body>
  <div id="map"></div><div id="hint">Select a pin inside the green SJDM border</div>
  <div id="fallback">Map is unavailable. Use Current GPS or Enter Coordinates below.</div>
  <script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"><\/script>
  <script>
    (() => {
      const initial = ${initial};
      const token = initial.token;
      let map, marker = null;
      let acceptedPoint = null;
      const showFallback = () => { document.getElementById("fallback").style.display = "grid"; };
      const valid = (lat,lng) => typeof lat === "number" && typeof lng === "number" &&
        Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
      // Follow the exact geoBoundaries polygon, never the much larger old SJDM rectangle.
      const ring = initial.city.geometry.coordinates[0];
      function insideCity(lat, lng) {
        if (!valid(lat,lng)) return false;
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i], b = ring[j];
          if ((a[1] > lat) !== (b[1] > lat) &&
              lng < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        return inside;
      }
      function pinElement() {
        const el = document.createElement("div");el.className="pin";
        const label=document.createElement("span");label.textContent="●";el.appendChild(label);return el;
      }
      function move(lat,lng,notify) {
        if (!valid(lat,lng) || !map) return;
        // Keep the broad backend region check as a preliminary guard, but only
        // accept points within the actual SJDM city polygon used by Emergency.
        if (lat < 14.65 || lat > 15.0 || lng < 120.88 || lng > 121.30 ||
            !insideCity(lat, lng)) {
          document.getElementById("hint").textContent = "Outside SJDM border — select inside the green outline";
          if (marker && acceptedPoint) marker.setLngLat(acceptedPoint);
          if (notify) parent.postMessage({kind:"volunserve:event-pin:select",token,latitude:lat,longitude:lng},"*");
          return;
        }
        if (!marker) {
          marker = new maplibregl.Marker({element:pinElement(),draggable:true})
            .setLngLat([lng,lat]).addTo(map);
          marker.on("dragend", () => {
            const p=marker.getLngLat();move(p.lat,p.lng,true);
          });
        } else marker.setLngLat([lng,lat]);
        acceptedPoint = [lng,lat];
        document.getElementById("hint").textContent = "Meeting point inside San Jose del Monte";
        if (notify) parent.postMessage({kind:"volunserve:event-pin:select",token,latitude:lat,longitude:lng},"*");
        map.easeTo({center:[lng,lat],duration:280});
      }
      window.addEventListener("message", event => {
        if (event.source !== parent || event.data?.kind !== "volunserve:event-pin:sync" ||
            event.data?.token !== token) return;
        const p=event.data;
        if (p.latitude == null || p.longitude == null) {
          if (marker) {marker.remove();marker=null;}
          acceptedPoint = null;
        } else move(p.latitude,p.longitude,false);
      });
      if (!window.maplibregl) {showFallback();return;}
      try {
        map = new maplibregl.Map({container:"map",
          style:"https://tiles.openfreemap.org/styles/liberty",
          center:[121.045,14.813], zoom:13, attributionControl:true,
          renderWorldCopies:false,
          maxBounds:[[121.005,14.758],[121.178,14.877]],
          minZoom:11.3,maxZoom:19});
        map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),"top-left");
        map.on("load", () => {
          map.addSource("sjdm-outside", {type:"geojson",data:initial.outside});
          map.addLayer({id:"sjdm-outside-shade",type:"fill",source:"sjdm-outside",
            paint:{"fill-color":"#334155","fill-opacity":0.50}});
          map.addSource("sjdm-boundary", {type:"geojson",data:initial.city});
          map.addLayer({id:"sjdm-fill",type:"fill",source:"sjdm-boundary",
            paint:{"fill-color":"#0d9488","fill-opacity":0.07}});
          map.addLayer({id:"sjdm-outline",type:"line",source:"sjdm-boundary",
            paint:{"line-color":"#047857","line-width":3}});
          map.fitBounds([[121.013,14.767],[121.169,14.869]],{padding:20,duration:0});
          // A previously saved valid location is still visible on the map.
          if (insideCity(initial.latitude,initial.longitude) &&
              (Math.abs(initial.latitude-14.8139)>0.000001 ||
               Math.abs(initial.longitude-121.0453)>0.000001)) {
            map.easeTo({center:[initial.longitude,initial.latitude],zoom:16,duration:0});
          }
        });
        map.on("click", event => move(event.lngLat.lat,event.lngLat.lng,true));
        map.on("error", event => {
          if (String(event?.error?.message||"").includes("style")) showFallback();
        });
      } catch (_) { showFallback(); }
    })();
  <\/script>
  </body></html>`;
}

/** Interactive web fallback. A Google Maps browser key is not required. */
export default function InteractiveEventPinMap({ latitude, longitude, onPick }: Props) {
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const frame = useRef<any>(null);
  const token = useRef("pin-" + Math.random().toString(36).slice(2) + "-" + Date.now());
  const firstPoint = useRef({
    latitude: isPoint(latitude, longitude) && withinSjdm(latitude!, longitude!) ? latitude! : FALLBACK_CENTER.latitude,
    longitude: isPoint(latitude, longitude) && withinSjdm(latitude!, longitude!) ? longitude! : FALLBACK_CENTER.longitude,
  });
  const [source] = useState(() =>
    iframeDocument(token.current, firstPoint.current.latitude, firstPoint.current.longitude)
  );

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (data?.kind !== "volunserve:event-pin:select" || data?.token !== token.current) return;
      if (!isPoint(data.latitude, data.longitude)) return;
      onPickRef.current(data.latitude, data.longitude);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const sync = () => {
    frame.current?.contentWindow?.postMessage({
      kind: "volunserve:event-pin:sync",
      token: token.current,
      latitude: isPoint(latitude, longitude) && withinSjdm(latitude!, longitude!) ? latitude : null,
      longitude: isPoint(latitude, longitude) && withinSjdm(latitude!, longitude!) ? longitude : null,
    }, "*");
  };
  useEffect(sync, [latitude, longitude]);

  return (
    <View style={{width:"100%",backgroundColor:"#EAF2EC",borderRadius:12,overflow:"hidden"}}>
      {React.createElement("iframe" as any, {
        ref: frame,
        title: "Interactive map — tap to choose an event meeting point",
        srcDoc: source,
        sandbox: "allow-scripts",
        onLoad: sync,
        style: {width:"100%",height:"315px",display:"block",border:"0"},
      })}
      <Text style={{fontSize:11,lineHeight:17,color:"#607C6D",paddingVertical:8,paddingHorizontal:11}}>
        SJDM border only · Tap inside the green outline, drag to adjust, then confirm. Outside areas are shaded.
      </Text>
    </View>
  );
}
