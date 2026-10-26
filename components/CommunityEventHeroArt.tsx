import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";

/**
 * Premium calendar-themed community header illustration using UI elements only.
 * No generated photos, altered LGU seals or remote assets.
 * Decorative only; the real event counts and labels remain accessible text.
 */
export default function CommunityEventHeroArt({compact=false}:{compact?:boolean}) {
  return <View style={s.layer} pointerEvents="none" accessible={false}>
    <LinearGradient
      colors={["#D5FBEF","#F3FFF9","#E6FFF2","#B2F4DB","#58DDAF","#119F75"]}
      locations={[0,0.22,0.42,0.66,0.86,1]}
      start={{x:0,y:0.15}} end={{x:1,y:0.75}}
      style={StyleSheet.absoluteFillObject}/>
    <View style={s.upperWash}/>
    <View style={s.rightCircle}/>
    <View style={s.rightCircleInner}/>
    <View style={s.leftHalo}/>
    <View style={s.footerGrid}>
      {Array.from({length:15},(_,i)=>
        <View key={i} style={[s.gridDash,{height:18+(i%4)*11,opacity:0.09+(i%3)*0.03}]}/>)}
    </View>
    <View style={[s.calendarTile,compact&&s.calendarTileCompact]}>
      <View style={s.calendarRim}>
        <LinearGradient colors={["#036C50","#08A879","#2CCF96"]}
          start={{x:0,y:0}} end={{x:1,y:1}} style={s.calendarFace}>
          <View style={s.calendarTop}>
            <Ionicons name="calendar-clear" color="#FFFFFF" size={compact?35:52}/>
          </View>
          <View style={s.calendarCheck}>
            <Ionicons name="checkmark" color="#087B56" size={compact?11:14}/>
          </View>
        </LinearGradient>
      </View>
    </View>
    {!compact&&<View style={s.cornerDetail}>
      <Ionicons name="leaf-outline" color="rgba(255,255,255,0.88)" size={29}/>
    </View>}
  </View>;
}
const s=StyleSheet.create({
  layer:{...StyleSheet.absoluteFillObject,overflow:"hidden",borderRadius:18},
  upperWash:{position:"absolute",left:-100,top:-115,width:520,height:290,
    borderRadius:240,backgroundColor:"rgba(255,255,255,0.23)",transform:[{rotate:"-18deg"}]},
  rightCircle:{position:"absolute",right:-75,top:-80,width:320,height:320,
    borderRadius:160,borderWidth:35,borderColor:"rgba(3,106,74,0.11)"},
  rightCircleInner:{position:"absolute",right:65,bottom:-95,width:180,height:180,
    borderRadius:90,backgroundColor:"rgba(1,101,66,0.08)"},
  leftHalo:{position:"absolute",left:-80,bottom:-135,width:280,height:280,
    borderRadius:140,borderWidth:38,borderColor:"rgba(26,188,124,0.11)"},
  footerGrid:{position:"absolute",left:"44%",bottom:0,flexDirection:"row",gap:8,alignItems:"flex-end"},
  gridDash:{width:13,borderTopLeftRadius:4,borderTopRightRadius:4,backgroundColor:"#047F65"},
  calendarTile:{position:"absolute",left:25,top:24,width:120,height:120,
    borderRadius:26,transform:[{rotate:"-9deg"}],
    shadowColor:"#0B7550",shadowOpacity:0.24,shadowRadius:14,shadowOffset:{width:0,height:7},elevation:3},
  calendarTileCompact:{left:14,top:19,width:77,height:77,borderRadius:18},
  calendarRim:{flex:1,padding:6,backgroundColor:"#FFFFFF",borderRadius:25},
  calendarFace:{flex:1,borderRadius:19,alignItems:"center",justifyContent:"center"},
  calendarTop:{alignItems:"center",justifyContent:"center"},
  calendarCheck:{position:"absolute",bottom:9,right:9,width:23,height:23,borderRadius:12,
    alignItems:"center",justifyContent:"center",backgroundColor:"#FFFFFF"},
  cornerDetail:{position:"absolute",right:20,top:15},
});
