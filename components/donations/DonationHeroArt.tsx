import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";

/** Abstract, vector-only decoration. No generated photos or fabricated project imagery. */
export default function DonationHeroArt() {
  return (
    <View pointerEvents="none" accessible={false} style={styles.layer}>
      <LinearGradient colors={["#E0FAEC", "#FAFFFC", "#B6EFD6", "#43BA8E"]}
        locations={[0, 0.38, 0.77, 1]} start={{x:0,y:0}} end={{x:1,y:0}}
        style={StyleSheet.absoluteFillObject} />
      <Svg viewBox="0 0 1000 260" width="100%" height="100%"
        preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFillObject}>
        <Circle cx="900" cy="200" r="240" fill="#36B98A" opacity={0.17}/>
        <Circle cx="790" cy="30" r="135" fill="#FFFFFF" opacity={0.25}/>
        <Circle cx="65" cy="20" r="155" fill="#3CAD7C" opacity={0.16}/>
        <Path d="M-10 290 Q 85 168 165 18" stroke="#087C59" strokeWidth="7" opacity=".23" fill="none"/>
        <Path d="M1000 292 Q 895 153 894 -15" stroke="#126F55" strokeWidth="8" opacity=".25" fill="none"/>
        <Path d="M-16 172 Q 29 89 82 126 Q 74 174 -16 172Z" fill="#13885B" opacity=".31"/>
        <Path d="M34 225 Q 55 157 123 174 Q 110 232 34 225Z" fill="#37A877" opacity=".31"/>
        <Path d="M85 127 Q 89 54 151 49 Q 146 105 85 127Z" fill="#228D67" opacity=".28"/>
        <Path d="M120 77 Q 91 20 106 -35 Q 154 3 120 77Z" fill="#55B889" opacity=".30"/>
        <Path d="M961 219 Q 891 190 891 146 Q 953 137 961 219Z" fill="#076B50" opacity=".37"/>
        <Path d="M931 143 Q 944 78 1008 70 Q 998 121 931 143Z" fill="#147E57" opacity=".32"/>
        <Path d="M912 87 Q 871 30 891 -32 Q 934 3 912 87Z" fill="#0D8860" opacity=".32"/>
        <Path d="M968 249 Q 989 199 1051 206 Q 1028 261 968 249Z" fill="#147E57" opacity=".34"/>
        <Ellipse cx="575" cy="48" rx="5" ry="10" fill="#3DBB91" opacity=".11"/>
        <Ellipse cx="695" cy="222" rx="7" ry="12" fill="#2DAF85" opacity=".12"/>
      </Svg>
      <View style={styles.emblem}>
        <LinearGradient colors={["#087E59","#36C48D"]} style={styles.emblemGradient}>
          <Ionicons name="heart" size={39} color="#FFFFFF" />
          <Ionicons name="hand-left-outline" size={41} color="#EDFFF5" style={styles.hand}/>
        </LinearGradient>
      </View>
      <View style={styles.rightHeart}><Ionicons name="heart" size={54} color="rgba(255,255,255,0.67)"/></View>
    </View>
  );
}
const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow:"hidden", borderRadius:20 },
  emblem: { position:"absolute", left:-16, top:22, width:123, height:123,
    transform:[{rotate:"-13deg"}], borderRadius:28, borderWidth:6,
    borderColor:"rgba(255,255,255,.7)", overflow:"hidden",
    shadowColor:"#065F46",shadowOpacity:.14,shadowRadius:18, elevation:4 },
  emblemGradient: { flex:1, alignItems:"center",justifyContent:"center" },
  hand: { marginTop:-13 },
  rightHeart:{position:"absolute",right:25,top:21},
});
