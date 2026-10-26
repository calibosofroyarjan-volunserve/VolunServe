import React, { useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";

type Props = {
  latitude: number | null;
  longitude: number | null;
  onPick: (latitude: number, longitude: number) => void;
};
const FALLBACK_CENTER = { latitude: 14.8139, longitude: 121.0453 };
const isPoint = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === "number" && typeof lng === "number" &&
  Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function iframeDocument(token: string, latitude: number, longitude: number) {
  // Embed numbers + an unpredictable instance token; no user-supplied HTML.
  const initial = JSON.stringify({ token, latitude, longitude }).replace(/</g, "\\u003c");
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
  <div id="map"></div><div id="hint">Tap anywhere to place the event pin</div>
  <div id="fallback">Map is unavailable. Use Current GPS or Enter Coordinates below.</div>
  <script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"><\/script>
  <script>
    (() => {
      const initial = ${initial};
      const token = initial.token;
      let map, marker = null;
      const showFallback = () => { document.getElementById("fallback").style.display = "grid"; };
      const valid = (lat,lng) => typeof lat === "number" && typeof lng === "number" &&
        Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
      function pinElement() {
        const el = document.createElement("div");el.className="pin";
        const label=document.createElement("span");label.textContent="●";el.appendChild(label);return el;
      }
      function move(lat,lng,notify) {
        if (!valid(lat,lng) || !map) return;
        // Mirror backend's existing SJDM service-area bounds. An out-of-area
        // click reports validation feedback but never displays a false venue pin.
        if (lat < 14.65 || lat > 15.0 || lng < 120.88 || lng > 121.30) {
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
        if (notify) parent.postMessage({kind:"volunserve:event-pin:select",token,latitude:lat,longitude:lng},"*");
        map.easeTo({center:[lng,lat],duration:280});
      }
      window.addEventListener("message", event => {
        if (event.source !== parent || event.data?.kind !== "volunserve:event-pin:sync" ||
            event.data?.token !== token) return;
        const p=event.data;
        if (p.latitude == null || p.longitude == null) {
          if (marker) {marker.remove();marker=null;}
        } else move(p.latitude,p.longitude,false);
      });
      if (!window.maplibregl) {showFallback();return;}
      try {
        map = new maplibregl.Map({container:"map",
          style:"https://tiles.openfreemap.org/styles/liberty",
          center:[initial.longitude,initial.latitude],zoom:14,attributionControl:true});
        map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");
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
    latitude: isPoint(latitude, longitude) ? latitude! : FALLBACK_CENTER.latitude,
    longitude: isPoint(latitude, longitude) ? longitude! : FALLBACK_CENTER.longitude,
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
      latitude: isPoint(latitude, longitude) ? latitude : null,
      longitude: isPoint(latitude, longitude) ? longitude : null,
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
        Interactive OpenStreetMap map · Tap to place, drag to adjust. Map locations require final confirmation.
      </Text>
    </View>
  );
}
