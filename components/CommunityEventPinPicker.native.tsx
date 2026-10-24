import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, Text, TextInput, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";

type Venue = { latitude: number; longitude: number };
type Props = {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
};
const CENTER: Venue = {latitude:14.8139,longitude:121.0453};
const valid = (a: number,b: number) => Number.isFinite(a)&&Number.isFinite(b)&&a>=14.65&&a<=15.0&&b>=120.88&&b<=121.30;
const tidy = (latitude: number,longitude: number): Venue => ({
  latitude:Number(latitude.toFixed(6)),longitude:Number(longitude.toFixed(6)),
});
const equal = (a: Venue|null,b: Venue|null) => !!a&&!!b&&a.latitude===b.latitude&&a.longitude===b.longitude;

export default function CommunityEventPinPicker({latitude,longitude,onChange}:Props) {
  const saved:Venue|null = latitude!==null&&longitude!==null&&valid(latitude,longitude)?tidy(latitude,longitude):null;
  const [draft,setDraft] = useState<Venue|null>(saved);
  const [notice,setNotice] = useState("");
  const [manual,setManual] = useState("");
  const mapRef = useRef<MapView|null>(null);
  const selected = draft||saved||CENTER;
  const confirmed = equal(saved,draft);

  const pick = (a:number,b:number) => {
    if(!valid(a,b)){setNotice("Pumili ng meeting point within the SJDM area.");return;}
    const point=tidy(a,b);
    setDraft(point);
    if(saved&&!equal(saved,point))onChange(null,null);
    setNotice("Pin selected. Confirm the event venue before submitting.");
  };
  useEffect(()=>{
    if(!draft)return;
    mapRef.current?.animateToRegion({...draft,latitudeDelta:0.015,longitudeDelta:0.015},300);
  },[draft?.latitude,draft?.longitude]);

  const locate=async()=>{
    try {
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=="granted"){setNotice("GPS permission denied. You can still tap the map or enter coordinates.");return;}
      const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      pick(pos.coords.latitude,pos.coords.longitude);
    } catch {setNotice("GPS not available. Tap the map or enter coordinates.");}
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
      Select your event venue above, tap or drag its exact pin, then confirm the meeting point. Admin will review it before Volunteers see the route.
    </Text>
    <MapView ref={mapRef} provider={Platform.OS==="android"?PROVIDER_GOOGLE:undefined}
      style={{height:270,width:"100%",borderRadius:10}}
      initialRegion={{...selected,latitudeDelta:0.055,longitudeDelta:0.055}}
      onPress={event=>pick(event.nativeEvent.coordinate.latitude,event.nativeEvent.coordinate.longitude)}>
      {draft?<Marker draggable coordinate={draft}
        onDragEnd={event=>pick(event.nativeEvent.coordinate.latitude,event.nativeEvent.coordinate.longitude)}
        title="Event Meeting Point"/>:null}
    </MapView>
    <View style={{flexDirection:"row",flexWrap:"wrap",gap:9,marginTop:11}}>
      <Pressable onPress={()=>void locate()} style={{padding:12,backgroundColor:"#087F75",borderRadius:8}}>
        <Text style={{fontSize:12,color:"#FFFFFF",fontWeight:"800"}}>Use My Current GPS</Text>
      </Pressable>
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
