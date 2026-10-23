import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";

type Props = { latitude: number | null; longitude: number | null; onChange: (lat: number, lng: number) => void; };
export default function CommunityEventPinPicker({ latitude, longitude, onChange }: Props) {
  const [notice, setNotice] = useState("");
  const loc = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") { setNotice("Location permission denied. Tap the map to place the event pin."); return; }
      const p = await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      onChange(Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6)));
      setNotice("GPS captured. Adjust the marker to the actual event venue.");
    } catch { setNotice("GPS unavailable. Tap the map to mark the meeting point."); }
  };
  return <View style={{marginTop:14,padding:12,borderRadius:12,borderWidth:1,borderColor:"#D3E8E5",backgroundColor:"#F7FBFA"}}>
    <Text style={{fontWeight:"800",color:"#143F42",marginBottom:5}}>Event GPS meeting point *</Text>
    <Text style={{fontSize:12,color:"#526C76",marginBottom:9}}>Tap the map or drag the pin to the actual event venue.</Text>
    <MapView style={{width:"100%",height:260,borderRadius:10}} initialRegion={{latitude:latitude ?? 14.8139,longitude:longitude ?? 121.0453,latitudeDelta:0.065,longitudeDelta:0.065}} onPress={e=>onChange(Number(e.nativeEvent.coordinate.latitude.toFixed(6)),Number(e.nativeEvent.coordinate.longitude.toFixed(6)))}>
      {latitude!=null&&longitude!=null?<Marker coordinate={{latitude,longitude}} draggable onDragEnd={e=>onChange(Number(e.nativeEvent.coordinate.latitude.toFixed(6)),Number(e.nativeEvent.coordinate.longitude.toFixed(6)))}/>:null}
    </MapView>
    <Pressable onPress={()=>void loc()} style={{alignSelf:"flex-start",backgroundColor:"#087F75",padding:12,borderRadius:8,marginTop:10}}><Text style={{color:"#FFFFFF",fontWeight:"800"}}>Use My Current GPS</Text></Pressable>
    {latitude!=null&&longitude!=null?<Text style={{color:"#11665C",marginTop:8}}>Pinned: {latitude.toFixed(6)}, {longitude.toFixed(6)}</Text>:<Text style={{color:"#986516",marginTop:8}}>No GPS pin selected yet.</Text>}
    {!!notice&&<Text style={{color:"#486F77",marginTop:7}}>{notice}</Text>}
  </View>;
}
