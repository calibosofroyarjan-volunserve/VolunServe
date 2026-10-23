import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

type Props = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
};

const CENTER = { latitude: 14.8139, longitude: 121.0453 }; // SJDM city center
const inRange = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

export default function CommunityEventPinPicker({ latitude, longitude, onChange }: Props) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [notice, setNotice] = useState("");
  const lat = latitude ?? CENTER.latitude;
  const lng = longitude ?? CENTER.longitude;
  // The iframe is sandboxed and never receives authentication tokens.
  const srcDoc = useMemo(() => `<!doctype html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <style>html,body,#map{height:100%;margin:0} .note{position:absolute;top:8px;right:8px;background:white;padding:6px 9px;z-index:1000;border-radius:7px;font:12px Arial;box-shadow:0 1px 7px #888}</style>
    </head><body><div id="map"></div><div class="note">Tap map to set event venue</div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
    (function(){
      if(!window.L) { document.getElementById("map").textContent="Map unavailable. Use device GPS or manual coordinate entry.";return; }
      var map=L.map('map').setView([${lat},${lng}],${latitude != null && longitude != null ? 16 : 13});
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
      var marker=${latitude != null && longitude != null ? `L.marker([${lat},${lng}],{draggable:true}).addTo(map)` : "null"};
      function pin(lat,lng){
        if (!marker) marker=L.marker([lat,lng],{draggable:true}).addTo(map);
        else marker.setLatLng([lat,lng]);
        marker.off('dragend').on('dragend',function(){var p=marker.getLatLng();pin(p.lat,p.lng);});
        parent.postMessage({type:'volunserve-event-venue-pin',latitude:lat,longitude:lng},'*');
      }
      if(marker)marker.on('dragend',function(){var p=marker.getLatLng();pin(p.lat,p.lng);});
      map.on('click',function(e){pin(e.latlng.lat,e.latlng.lng);});
      window.addEventListener('message',function(e){
        if(e.data&&e.data.type==='volunserve-set-event-venue-pin'){
          var latitude=Number(e.data.latitude),longitude=Number(e.data.longitude);
          if(isFinite(latitude)&&isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180){
            if(!marker)marker=L.marker([latitude,longitude],{draggable:true}).addTo(map);
            else marker.setLatLng([latitude,longitude]);
            marker.off('dragend').on('dragend',function(){var p=marker.getLatLng();pin(p.lat,p.lng);});
            map.setView([latitude,longitude],16);
          }
        }
      });
      setTimeout(function(){map.invalidateSize()},150);
    })();
    </script></body></html>`, []); // Map remains mounted while parent updates chosen pin.
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "volunserve-event-venue-pin") return;
      const a = Number(event.data.latitude), b = Number(event.data.longitude);
      if (inRange(a, b)) { onChange(Number(a.toFixed(6)), Number(b.toFixed(6))); setNotice(""); }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onChange]);
  useEffect(() => {
    if (latitude == null || longitude == null || !inRange(latitude,longitude)) return;
    frame.current?.contentWindow?.postMessage({type:"volunserve-set-event-venue-pin",latitude,longitude},"*");
  }, [latitude,longitude]);

  const locate = () => {
    if (!navigator.geolocation) { setNotice("Location services are not available."); return; }
    setNotice("Requesting location permission...");
    navigator.geolocation.getCurrentPosition(
      (p) => { onChange(Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6))); setNotice("GPS captured. For another venue, tap its exact meeting point on the map."); },
      () => setNotice("GPS unavailable. Allow location permission or tap the map manually."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  return <View style={{marginTop:14,padding:12,borderRadius:12,borderWidth:1,borderColor:"#D3E8E5",backgroundColor:"#F7FBFA"}}>
    <Text style={{fontWeight:"800",color:"#143F42",marginBottom:5}}>Event GPS meeting point *</Text>
    <Text style={{fontSize:12,color:"#526C76",marginBottom:9}}>Tap the exact location on the map, or use your current GPS only if you are at the event venue. Admin will review the location before publishing.</Text>
    {React.createElement("iframe" as any, {ref:frame,srcDoc,sandbox:"allow-scripts",title:"Pin the precise Community Event meeting point",style:{width:"100%",height:"270px",border:"1px solid #CDE5DD",borderRadius:"10px",backgroundColor:"#E5EFE9"}})}
    <Pressable onPress={locate} style={{alignSelf:"flex-start",backgroundColor:"#087F75",paddingHorizontal:14,paddingVertical:11,borderRadius:8,marginTop:10}}>
      <Text style={{color:"#FFFFFF",fontWeight:"800",fontSize:12}}>Use My Current GPS</Text>
    </Pressable>
    {latitude != null && longitude != null ? <Text style={{color:"#11665C",marginTop:8,fontWeight:"700",fontSize:12}}>Pinned: {latitude.toFixed(6)}, {longitude.toFixed(6)}</Text> : <Text style={{color:"#986516",fontSize:12,marginTop:8}}>No GPS pin selected yet.</Text>}
    {!!notice && <Text style={{marginTop:6,color:"#486F77",fontSize:12}}>{notice}</Text>}
    <Text style={{fontSize:10,color:"#738C94",marginTop:7}}>Map tiles © OpenStreetMap contributors. GPS is saved only as the event venue, not as your live movement.</Text>
  </View>;
}
