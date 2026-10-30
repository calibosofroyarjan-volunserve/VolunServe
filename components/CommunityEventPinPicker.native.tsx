import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, Text, TextInput, View } from "react-native";
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";
import { lookUpEventVenue } from "../lib/eventVenueLookup";
import {
  SJDM_EVENT_BOUNDARY,
  SJDM_EVENT_BOUNDS,
  SJDM_EVENT_OUTSIDE_MASK,
  validSjdmEventPin,
} from "../lib/sjdmEventPinBoundary";

type Venue = { latitude: number; longitude: number };
type Props = {
  barangay?: string;
  venue?: string;
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
};
const CENTER: Venue = {latitude:14.813,longitude:121.045};
const valid = validSjdmEventPin;
const toNativeRing = (ring: ReadonlyArray<ReadonlyArray<number>>) =>
  ring.map(([longitude,latitude])=>({latitude,longitude}));
const borderRings = SJDM_EVENT_BOUNDARY.geometry.type === "Polygon"
  ? SJDM_EVENT_BOUNDARY.geometry.coordinates as number[][][]
  : (SJDM_EVENT_BOUNDARY.geometry.coordinates as number[][][][])[0];
const mapCenter: Venue = {
  latitude: (SJDM_EVENT_BOUNDS.north + SJDM_EVENT_BOUNDS.south)/2,
  longitude: (SJDM_EVENT_BOUNDS.east + SJDM_EVENT_BOUNDS.west)/2,
};
const tidy = (latitude: number,longitude: number): Venue => ({
  latitude:Number(latitude.toFixed(6)),longitude:Number(longitude.toFixed(6)),
});
const equal = (a: Venue|null,b: Venue|null) => !!a&&!!b&&a.latitude===b.latitude&&a.longitude===b.longitude;

export default function CommunityEventPinPicker({latitude,longitude,barangay="",venue="",onChange}:Props) {
  const saved:Venue|null = latitude!==null&&longitude!==null&&valid(latitude,longitude)?tidy(latitude,longitude):null;
  const [draft,setDraft] = useState<Venue|null>(saved);
  useEffect(()=>{
    if(latitude!==null&&longitude!==null&&!valid(latitude,longitude)){
      onChange(null,null);
      setDraft(null);
      setNotice("The previous pin was outside SJDM. Select a pin inside the city border.");
    }
  },[latitude,longitude]);
  const lastValidPinRef=useRef<Venue|null>(draft);
  lastValidPinRef.current=draft;
  const [notice,setNotice] = useState("");
  useEffect(()=>{
    if(!barangay.trim()||!venue.trim())return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      void lookUpEventVenue(barangay,venue,controller.signal).then(result=>{
        if(controller.signal.aborted)return;
        if(result.status==="found"&&valid(result.point.latitude,result.point.longitude)){
          setDraft(result.point);
          setNotice("Suggested venue pin found. Verify it on the map and confirm.");
        }else setNotice("Exact venue was not found automatically. Tap the correct venue on the map.");
      }).catch(()=>{if(!controller.signal.aborted)setNotice("Venue lookup unavailable. Select the pin on the map.");});
    },900);
    return ()=>{controller.abort();clearTimeout(timer);};
  },[barangay,venue]);
  const [manual,setManual] = useState("");
  const mapRef = useRef<MapView|null>(null);
  const selected = draft||saved||CENTER;
  const confirmed = equal(saved,draft);

  const pick = (a:number,b:number) => {
    if(!valid(a,b)){setNotice("Outside SJDM border. Select a pin inside the green city boundary.");return false;}
    const point=tidy(a,b);
    setDraft(point);
    lastValidPinRef.current=point;
    if(saved&&!equal(saved,point))onChange(null,null);
    setNotice("Pin selected. Confirm the event venue before submitting.");
    return true;
  };
  useEffect(()=>{
    if(!draft)return;
    mapRef.current?.animateToRegion({...draft,latitudeDelta:0.015,longitudeDelta:0.015},300);
  },[draft?.latitude,draft?.longitude]);

  const locate=async()=>{
    setNotice("Select the actual event venue on the map, not your current GPS.");
  };
  const useCoordinates=()=>{
    const match=manual.trim().match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
    if(!match){setNotice("Enter exact coordinates, like 14.813900, 121.045300.");return;}
    pick(Number(match[1]),Number(match[2]));
  };
  const confirm=()=>{
    if(!draft||!valid(draft.latitude,draft.longitude)){setNotice("Choose a valid location first.");return;}
    onChange(draft.latitude,draft.longitude);
    setNotice("Event meeting point confirmed for Admin review and Volunteer navigation.");
  };
  return <View style={{marginTop:16,padding:13,borderRadius:12,borderWidth:1,borderColor:"#CFE4DF",backgroundColor:"#F7FBFA"}}>
    <Text style={{fontWeight:"800",color:"#143F42",fontSize:14}}>Event Location & GPS Meeting Point *</Text>
    <Text style={{color:"#526C76",fontSize:12,marginVertical:9}}>
      The map is limited to the SJDM city border. Choose the venue inside the green outline and confirm its pin; Admin reviews it before Volunteer directions.
    </Text>
    <MapView ref={mapRef} provider={Platform.OS==="android"?PROVIDER_GOOGLE:undefined}
      style={{height:270,width:"100%",borderRadius:10}}
      initialRegion={{
        ...mapCenter,
        latitudeDelta: (SJDM_EVENT_BOUNDS.north-SJDM_EVENT_BOUNDS.south)*1.25,
        longitudeDelta: (SJDM_EVENT_BOUNDS.east-SJDM_EVENT_BOUNDS.west)*1.25,
      }}
      onMapReady={()=>{
        mapRef.current?.setMapBoundaries(
          {latitude:SJDM_EVENT_BOUNDS.north,longitude:SJDM_EVENT_BOUNDS.east},
          {latitude:SJDM_EVENT_BOUNDS.south,longitude:SJDM_EVENT_BOUNDS.west},
        );
      }}
      onPress={event=>pick(event.nativeEvent.coordinate.latitude,event.nativeEvent.coordinate.longitude)}>
      <Polygon
        coordinates={toNativeRing(SJDM_EVENT_OUTSIDE_MASK.geometry.coordinates[0])}
        holes={SJDM_EVENT_OUTSIDE_MASK.geometry.coordinates.slice(1).map(toNativeRing)}
        fillColor="rgba(231,239,233,0.92)"
        strokeColor="rgba(231,239,233,0)"
      />
      {borderRings?.[0]&&<Polygon
        coordinates={toNativeRing(borderRings[0])}
        holes={borderRings.slice(1).map(toNativeRing)}
        fillColor="rgba(4,120,87,0.04)"
        strokeColor="#047857"
        strokeWidth={3}
      />}
      {draft?<Marker draggable coordinate={draft}
        onDragEnd={event=>{
          const next=event.nativeEvent.coordinate;
          if(!pick(next.latitude,next.longitude)){
            const last=lastValidPinRef.current;
            if(last)setDraft({...last});
          }
        }}
        title="Event Meeting Point"/>:null}
    </MapView>
    <View style={{flexDirection:"row",flexWrap:"wrap",gap:9,marginTop:11}}>
      <Pressable onPress={()=>void Linking.openURL("https://www.google.com/maps/@14.8139,121.0453,13z")}
        style={{padding:12,backgroundColor:"#E7F1FC",borderRadius:8}}>
        <Text style={{fontSize:12,color:"#17628D",fontWeight:"800"}}>Find Venue in Google Maps ↗</Text>
      </Pressable>
    </View>
    <Text style={{fontWeight:"800",fontSize:12,color:"#143F42",marginTop:13}}>Or enter exact coordinates</Text>
    <View style={{flexDirection:"row",gap:8,marginTop:7}}>
      <TextInput value={manual} onChangeText={setManual} autoCapitalize="none" placeholder="14.813900, 121.045300"
        placeholderTextColor="#7C98A1" accessibilityLabel="Enter event latitude and longitude"
        style={{flex:1,padding:10,borderWidth:1,borderColor:"#CADFDC",borderRadius:8,backgroundColor:"#FFFFFF",color:"#143F42"}}/>
      <Pressable onPress={useCoordinates} style={{backgroundColor:"#087F75",padding:12,borderRadius:8,justifyContent:"center"}}>
        <Text style={{color:"#FFFFFF",fontWeight:"800"}}>Set Pin</Text>
      </Pressable>
    </View>
    <Text style={{fontWeight:"800",fontSize:12,color:confirmed?"#087F75":"#956119",marginTop:12}}>
      {confirmed?"✓ Confirmed event pin":draft?"Pin selected — not yet confirmed":"No pin confirmed"}
    </Text>
    {draft?<Text style={{fontSize:12,color:"#385F66",marginTop:4}}>{draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}</Text>:null}
    <Pressable disabled={!draft||confirmed} onPress={confirm}
      style={{marginTop:10,padding:14,alignItems:"center",backgroundColor:!draft||confirmed?"#93BDB7":"#087F75",borderRadius:9}}>
      <Text style={{color:"#FFFFFF",fontWeight:"800"}}>{confirmed?"Location Confirmed ✓":"Confirm Event Pin"}</Text>
    </Pressable>
    {!!notice&&<Text accessibilityRole="alert" style={{fontSize:12,color:"#486A73",marginTop:9}}>{notice}</Text>}
    <Text style={{fontSize:10,color:"#7A9196",marginTop:10}}>SJDM boundary: geoBoundaries simplified reference (not a legal survey). Only the confirmed in-city meeting point is shared. Live GPS is not published.</Text>
  </View>;
}
