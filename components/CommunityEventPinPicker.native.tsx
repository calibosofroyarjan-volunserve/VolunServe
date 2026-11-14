import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, Text, TextInput, View } from "react-native";
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";
import { lookUpEventVenue } from "../lib/eventVenueLookup";
import {
  boundaryBounds, boundaryRings, insideSjdmBoundary, loadSjdmBoundary,
  sjdmSafeCenter, SJDM_MASK_EXTERIOR, type SjdmBoundary,
} from "../lib/sjdmMapBoundary";

type Venue = { latitude: number; longitude: number };
type Props = {
  barangay?: string;
  venue?: string;
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
};
const CENTER: Venue = {latitude:14.8139,longitude:121.0453};
const valid = (boundary:SjdmBoundary|null,a:number,b:number) =>
  !!boundary && insideSjdmBoundary(boundary,a,b);
const tidy = (latitude: number,longitude: number): Venue => ({
  latitude:Number(latitude.toFixed(6)),longitude:Number(longitude.toFixed(6)),
});
const equal = (a: Venue|null,b: Venue|null) => !!a&&!!b&&a.latitude===b.latitude&&a.longitude===b.longitude;

export default function CommunityEventPinPicker({latitude,longitude,barangay="",venue="",onChange}:Props) {
  const [cityBoundary,setCityBoundary] = useState<SjdmBoundary|null>(null);
  const saved:Venue|null = latitude!==null&&longitude!==null&&valid(cityBoundary,latitude,longitude)?tidy(latitude,longitude):null;
  const [draft,setDraft] = useState<Venue|null>(null);
  const lastValidPinRef=useRef<Venue|null>(draft);
  lastValidPinRef.current=draft;
  const [notice,setNotice] = useState("");
  useEffect(()=>{
    let active=true;
    void loadSjdmBoundary().then(boundary=>{
      if(!active)return;
      setCityBoundary(boundary);
      if(!boundary)setNotice("SJDM city boundary unavailable. Pin selection is disabled.");
    }).catch(()=>{
      if(active)setNotice("SJDM city boundary unavailable. Pin selection is disabled.");
    });
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(!cityBoundary)return;
    if(latitude!==null&&longitude!==null){
      if(valid(cityBoundary,latitude,longitude))setDraft(tidy(latitude,longitude));
      else {
        setDraft(null);
        onChange(null,null);
        setNotice("Old meeting point is outside the SJDM border. Choose an in-city pin.");
      }
    }
  },[cityBoundary]);
  useEffect(()=>{
    if(!cityBoundary||!barangay.trim()||!venue.trim())return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      void lookUpEventVenue(barangay,venue,controller.signal).then(result=>{
        if(controller.signal.aborted)return;
        if(result.status==="found"&&valid(cityBoundary,result.point.latitude,result.point.longitude)){
          setDraft(result.point);
          setNotice("Suggested venue pin found. Verify it on the map and confirm.");
        }else setNotice("Exact venue was not found automatically. Tap the correct venue on the map.");
      }).catch(()=>{if(!controller.signal.aborted)setNotice("Venue lookup unavailable. Select the pin on the map.");});
    },900);
    return ()=>{controller.abort();clearTimeout(timer);};
  },[barangay,venue,cityBoundary]);
  const [manual,setManual] = useState("");
  const mapRef = useRef<MapView|null>(null);
  const selected = draft||saved||(cityBoundary?sjdmSafeCenter(cityBoundary):CENTER);
  const confirmed = equal(saved,draft);

  const pick = (a:number,b:number) => {
    if(!valid(cityBoundary,a,b)){setNotice("Outside SJDM city border. Pumili ng pin sa loob ng outlined city lamang.");return false;}
    const point=tidy(a,b);
    setDraft(point);
    lastValidPinRef.current=point;
    if(saved&&!equal(saved,point))onChange(null,null);
    setNotice("Pin selected. Confirm the event venue before submitting.");
    return true;
  };
  useEffect(()=>{
    if(!cityBoundary)return;
    const box=boundaryBounds(cityBoundary);
    // Same camera restriction as the Volunteer map; the polygon below
    // masks the surrounding cities. Viewport bounds alone are not a border.
    mapRef.current?.setMapBoundaries(
      {latitude:box.north,longitude:box.east},
      {latitude:box.south,longitude:box.west},
    );
    mapRef.current?.animateToRegion({
      ...sjdmSafeCenter(cityBoundary),
      latitudeDelta:box.north-box.south+0.012,
      longitudeDelta:box.east-box.west+0.012,
    },300);
  },[cityBoundary]);
  useEffect(()=>{
    if(!draft||!valid(cityBoundary,draft.latitude,draft.longitude))return;
    mapRef.current?.animateToRegion({...draft,latitudeDelta:0.015,longitudeDelta:0.015},300);
  },[draft?.latitude,draft?.longitude,cityBoundary]);

  const locate=async()=>{
    setNotice("Select the actual event venue on the map, not your current GPS.");
  };
  const useCoordinates=()=>{
    const match=manual.trim().match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
    if(!match){setNotice("Enter exact coordinates, like 14.813900, 121.045300.");return;}
    pick(Number(match[1]),Number(match[2]));
  };
  const confirm=()=>{
    if(!draft||!valid(cityBoundary,draft.latitude,draft.longitude)){setNotice("Choose a pin inside the SJDM city boundary first.");return;}
    onChange(draft.latitude,draft.longitude);
    setNotice("Event meeting point confirmed for Admin review and Volunteer navigation.");
  };
  return <View style={{marginTop:16,padding:13,borderRadius:12,borderWidth:1,borderColor:"#CFE4DF",backgroundColor:"#F7FBFA"}}>
    <Text style={{fontWeight:"800",color:"#143F42",fontSize:14}}>Event Location & GPS Meeting Point *</Text>
    <Text style={{color:"#526C76",fontSize:12,marginVertical:9}}>
      Select your event venue above, tap or drag its exact pin, then confirm the meeting point. Admin will review it before Volunteers see the route.
    </Text>
    {!cityBoundary ? (
      <Text accessibilityRole="alert" style={{padding:15,color:"#835A48",backgroundColor:"#F0F5F0"}}>
        Loading the verified SJDM city boundary. Pin selection is disabled until it loads.
      </Text>
    ) : (
    <MapView ref={mapRef} provider={Platform.OS==="android"?PROVIDER_GOOGLE:undefined}
      style={{height:270,width:"100%",borderRadius:10}}
      minZoomLevel={11}
      initialRegion={{...selected,latitudeDelta:0.13,longitudeDelta:0.17}}
      onPress={event=>pick(event.nativeEvent.coordinate.latitude,event.nativeEvent.coordinate.longitude)}>
      <Polygon
        coordinates={SJDM_MASK_EXTERIOR.map(([longitude,latitude])=>({latitude,longitude}))}
        holes={boundaryRings(cityBoundary).map(rings=>
          rings[0].map(([longitude,latitude])=>({latitude,longitude})))}
        fillColor="rgba(231,238,234,1)" strokeColor="transparent" strokeWidth={0}
        tappable={false}
      />
      {boundaryRings(cityBoundary).map((rings,index)=>(
        <Polygon key={index}
          coordinates={rings[0].map(([longitude,latitude])=>({latitude,longitude}))}
          strokeColor="#07815E" strokeWidth={4}
          fillColor="rgba(10,139,106,0.06)" tappable={false}
        />
      ))}
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
    )}
    <Text style={{color:"#3E7D60",fontSize:11,marginTop:8}}>
      SJDM city border only · Outside locations are masked and cannot be selected.
    </Text>
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
    <Text style={{fontSize:10,color:"#7A9196",marginTop:10}}>Only the confirmed event venue is shared. Live device GPS is not published. Google Maps navigation opens for Volunteers after Admin approval.</Text>
  </View>;
}
