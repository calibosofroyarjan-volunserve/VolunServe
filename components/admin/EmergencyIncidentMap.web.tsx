import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";

type Assignment = {
  id: string;
  volunteerId?: string;
  volunteerName?: string;
  status?: string;
};

type Props = {
  caseId: string;
  latitude: number;
  longitude: number;
  assignments: Assignment[];
};

type GpsPoint = {
  assignmentId: string;
  caseId: string;
  volunteerId: string;
  latitude: number;
  longitude: number;
  updatedAt: number;
};

const MAP_HTML = \`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css"/>
  <style>
    html,body,#map{width:100%;height:100%;margin:0;background:#e8f1ed;font-family:system-ui,sans-serif}
    .legend{position:absolute;top:12px;left:12px;z-index:2;background:#fff;border:1px solid #dce7df;border-radius:10px;padding:9px 12px;color:#154434;font-size:12px;font-weight:700;box-shadow:0 4px 18px #102d2415}
    .legend span{display:inline-block;width:9px;height:9px;border-radius:50%;background:#0b8b68;margin-right:5px}
    .legend span.volunteer{background:#2563eb;margin-left:10px}
    #notice{position:absolute;left:12px;right:12px;bottom:12px;z-index:2;border-radius:8px;padding:8px;background:#fff; color:#475569;font-size:12px;display:none}
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="legend"><span></span>Incident location <span class="volunteer"></span>Volunteer GPS (when active)</div>
  <div id="notice">Map tiles could not load. Use Open Full Live Map.</div>
  <script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
  <script>
  (function () {
    var map=null, incidentPin=null, responderPins=[], pending=null;
    var notice=document.getElementById("notice");
    function pointValid(lat,lon) {
      return typeof lat==="number" && typeof lon==="number" &&
        Number.isFinite(lat) && Number.isFinite(lon) &&
        lat>=-90 && lat<=90 && lon>=-180 && lon<=180;
    }
    function update(data) {
      if (!map || !data || !data.incident) { pending=data; return; }
      var spot=data.incident;
      if (!pointValid(spot.latitude,spot.longitude)) return;
      if (incidentPin) incidentPin.remove();
      incidentPin=new maplibregl.Marker({color:"#0b8b68"})
        .setLngLat([spot.longitude,spot.latitude])
        .setPopup(new maplibregl.Popup().setText("Resident incident location"))
        .addTo(map);
      responderPins.forEach(function(pin){pin.remove();});
      responderPins=[];
      var bounds=new maplibregl.LngLatBounds([spot.longitude,spot.latitude],[spot.longitude,spot.latitude]);
      (Array.isArray(data.volunteers)?data.volunteers:[]).forEach(function(volunteer){
        if(!pointValid(volunteer.latitude,volunteer.longitude))return;
        var pin=new maplibregl.Marker({color:"#2563eb"})
          .setLngLat([volunteer.longitude,volunteer.latitude])
          .setPopup(new maplibregl.Popup().setText("Assigned Volunteer: "+String(volunteer.name||"Volunteer")))
          .addTo(map);
        responderPins.push(pin);
        bounds.extend([volunteer.longitude,volunteer.latitude]);
      });
      if(responderPins.length)map.fitBounds(bounds,{padding:85,maxZoom:15,duration:350});
      else map.flyTo({center:[spot.longitude,spot.latitude],zoom:14.5,duration:350});
    }
    window.addEventListener("message",function(event){
      if(event.source!==parent)return;
      if(event.data && event.data.kind==="volunserve-incident-preview")update(event.data);
    });
    try {
      if(typeof maplibregl==="undefined")throw Error("Map tiles unavailable");
      map=new maplibregl.Map({container:"map",style:"https://tiles.openfreemap.org/styles/liberty",
        center:[121.045,14.813],zoom:12.7,attributionControl:true});
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");
      map.on("load",function(){
        if(pending)update(pending);
        parent.postMessage({kind:"volunserve-incident-preview-ready"},"*");
      });
    } catch(e){notice.style.display="block";}
  })();
  </script>
</body>
</html>\`;

const milliseconds = (value: any): number =>
  typeof value?.toMillis === "function" ? value.toMillis()
    : typeof value === "number" ? value
    : value instanceof Date ? value.getTime() : 0;

export default function EmergencyIncidentMap({ caseId, latitude, longitude, assignments }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [points, setPoints] = useState<Record<string, GpsPoint>>({});
  const [clock, setClock] = useState(Date.now());
  const [gpsError, setGpsError] = useState(false);

  const active = useMemo(
    () => assignments.filter(item => item.volunteerId && ["responding","on_site"].includes(String(item.status||""))),
    [assignments],
  );
  const activeKey = active.map(item => item.id + ":" + item.volunteerId).join("|");

  useEffect(() => {
    setPoints({});
    setGpsError(false);
    if (!caseId || !active.length) return;
    const unsubscribers = active.map(item => onSnapshot(
      doc(db, "responseLocations", String(item.volunteerId)),
      snapshot => {
        const data = snapshot.data();
        if (!data || String(data.caseId||"") !== caseId ||
          String(data.assignmentId||"") !== item.id) {
          setPoints(current => {
            const next={...current}; delete next[item.id]; return next;
          });
          return;
        }
        const latitude = Number(data.latitude), longitude=Number(data.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        setPoints(current => ({
          ...current,
          [item.id]: {
            assignmentId:item.id,caseId,volunteerId:String(item.volunteerId),
            latitude,longitude,updatedAt:milliseconds(data.updatedAt),
          },
        }));
      },
      () => setGpsError(true),
    ));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [caseId, activeKey]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const volunteers = active.flatMap(item => {
    const p=points[item.id];
    return p && p.caseId===caseId && p.updatedAt>0 &&
      clock-p.updatedAt<120000
      ? [{latitude:p.latitude,longitude:p.longitude,name:item.volunteerName||"Volunteer",updatedAt:p.updatedAt}]
      : [];
  });

  const send = useCallback(() => {
    frame.current?.contentWindow?.postMessage({
      kind: "volunserve-incident-preview",
      incident:{latitude,longitude},
      volunteers,
    }, "*");
  }, [latitude,longitude,JSON.stringify(volunteers)]);

  useEffect(() => {
    const listener=(event:MessageEvent)=>{
      if(event.source===frame.current?.contentWindow &&
        event.data?.kind==="volunserve-incident-preview-ready") send();
    };
    window.addEventListener("message",listener);
    return () => window.removeEventListener("message",listener);
  }, [send]);
  useEffect(() => { send(); }, [send]);

  const newest = volunteers.reduce((max,v)=>Math.max(max,v.updatedAt),0);
  return (
    <View style={{borderRadius:12,overflow:"hidden",borderWidth:1,borderColor:"#DCE8E2",backgroundColor:"#FFFFFF"}}>
      {React.createElement("iframe" as any,{
        ref:frame,title:"Emergency incident location and assigned Volunteer map",
        srcDoc:MAP_HTML,onLoad:send,loading:"lazy",
        style:{display:"block",width:"100%",height:365,border:0}
      })}
      <View style={{paddingHorizontal:14,paddingVertical:11,backgroundColor:"#F7FBF9"}}>
        <Text style={{fontWeight:"800",color:"#194B3C",fontSize:12}}>
          {newest ? "Volunteer GPS last updated: "+new Date(newest).toLocaleString("en-PH")
            : "Incident location shown • Waiting for an active, consented Volunteer GPS update"}
        </Text>
        {gpsError && <Text style={{color:"#9A3412",fontSize:11,marginTop:3}}>GPS feed unavailable. Open the full live map to check tracking.</Text>}
      </View>
    </View>
  );
}
