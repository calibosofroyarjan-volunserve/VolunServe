import React, { useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { mapsDirectionsUrl } from "../lib/emergencyMapTypes";
import {
  centerUpdatedLabel,
  reportedSpaceText,
  useVerifiedEvacuationCenters,
  type VerifiedEvacuationCenter,
} from "../lib/useVerifiedEvacuationCenters";

function shelterMapHtml(centers: VerifiedEvacuationCenter[]): string {
  const data = JSON.stringify(centers.map(center => ({
    lat: center.latitude, lng: center.longitude, name: center.name,
  }))).replace(/</g, "\\u003c");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" rel="stylesheet">' +
    '<style>html,body,#map{height:100%;width:100%;margin:0;background:#E6F1EA}' +
    '.marker{font-size:23px;background:#fff;border:2px solid #138262;border-radius:50%;' +
    'width:42px;height:42px;display:grid;place-items:center;box-shadow:0 3px 10px #0002}' +
    '</style></head><body><div id="map"></div>' +
    '<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>' +
    '<script>(function(){const sites=' + data + ';' +
    'if(!window.maplibregl)return;' +
    'try{const map=new maplibregl.Map({container:"map",style:"https://tiles.openfreemap.org/styles/liberty",' +
    'center:[121.0453,14.8139],zoom:12});' +
    'map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");' +
    'const bounds=new maplibregl.LngLatBounds();' +
    'sites.forEach(function(site){const el=document.createElement("div");el.className="marker";' +
    'el.textContent="🏠";new maplibregl.Marker({element:el}).setLngLat([site.lng,site.lat])' +
    '.setPopup(new maplibregl.Popup({offset:17}).setText(site.name+" · LGU verified active"))' +
    '.addTo(map);bounds.extend([site.lng,site.lat]);});' +
    'if(sites.length)map.fitBounds(bounds,{padding:48,maxZoom:14,duration:0});' +
    '}catch(e){document.body.textContent="Map unavailable. Use the directions links below.";}' +
    '})();</script></body></html>';
}

export default function VerifiedEvacuationCenters() {
  const { centers, loading, error } = useVerifiedEvacuationCenters();
  const [expanded, setExpanded] = useState(false);
  const mapHtml = useMemo(() => shelterMapHtml(centers), [centers]);
  return (
    <View style={{ backgroundColor:"#F8FBF9", borderWidth:1, borderColor:"#CFDFD7",
      borderRadius:16, marginVertical:15, overflow:"hidden" }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
        onPress={() => setExpanded(value => !value)}
        style={{ paddingHorizontal:17, paddingVertical:16, flexDirection:"row", gap:11, alignItems:"center" }}>
        <View style={{ width:40,height:40,borderRadius:12,backgroundColor:"#DDF2E8",
          justifyContent:"center",alignItems:"center" }}><Text style={{fontSize:20}}>🏠</Text></View>
        <View style={{flex:1,minWidth:0}}>
          <Text style={{fontSize:16,fontWeight:"800",color:"#124935"}}>LGU-Verified Evacuation Centers</Text>
          <Text style={{fontSize:11.5,color:"#5B7669",marginTop:3}}>
            {loading ? "Loading LGU shelter records…" :
              error ? "Shelter directory unavailable" :
              String(centers.length) + " verified active centers · view map and directions"}
          </Text>
        </View>
        <Text style={{fontSize:20,color:"#277557"}}>{expanded ? "−" : "+"}</Text>
      </Pressable>
      {expanded && <View style={{borderTopWidth:1,borderColor:"#DDE9E1",padding:14,gap:11}}>
        <Text style={{fontSize:11.5,lineHeight:17,color:"#60766D"}}>
          Only active shelters verified by the LGU are shown. Capacity is from the last LGU update,
          not live occupancy. Contact the LGU before travelling if conditions are changing.
        </Text>
        {error ? <Text accessibilityRole="alert" style={{color:"#AA4A38"}}>{error}</Text> :
          loading ? <Text style={{color:"#647A70"}}>Checking verified shelter records…</Text> :
          centers.length === 0 ? <Text style={{color:"#647A70"}}>
            No LGU-verified active evacuation center is currently listed. This does not mean no shelters exist.
          </Text> : <>
            {React.createElement("iframe" as any, {
              title:"Map of currently LGU-verified active evacuation centers in San Jose del Monte",
              srcDoc:mapHtml, sandbox:"allow-scripts", referrerPolicy:"no-referrer",
              style:{width:"100%",height:"250px",border:"0",borderRadius:"11px",display:"block"},
            })}
            {centers.map(center => {
              const url = mapsDirectionsUrl(center.latitude,center.longitude);
              return <View key={center.id}
                style={{backgroundColor:"#FFFFFF",padding:13,borderRadius:11,
                  borderWidth:1,borderColor:"#DDEAE0",gap:5}}>
                <Text style={{fontSize:14,fontWeight:"800",color:"#174F3B"}}>{center.name}</Text>
                <Text style={{fontSize:12,color:"#527365"}}>{center.address || center.barangay}</Text>
                <Text style={{fontSize:11,color:"#607D6F"}}>{reportedSpaceText(center)}</Text>
                <Text style={{fontSize:10.5,color:"#809387"}}>{centerUpdatedLabel(center)}</Text>
                {url && <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)}
                  style={{alignSelf:"flex-start",paddingVertical:8,paddingHorizontal:11,
                    backgroundColor:"#107958",borderRadius:8,marginTop:3}}>
                  <Text style={{color:"#FFFFFF",fontSize:11.5,fontWeight:"700"}}>Get directions in Google Maps ↗</Text>
                </Pressable>}
              </View>;
            })}
          </>}
      </View>}
    </View>
  );
}
