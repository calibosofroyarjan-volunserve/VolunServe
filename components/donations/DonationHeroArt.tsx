import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";

/**
 * Premium botanical decoration built from vector shapes only.
 * The hero's titles, counters and real campaign amounts remain native,
 * accessible text outside this non-interactive illustration.
 */
export default function DonationHeroArt() {
  return (
    <View pointerEvents="none" accessible={false} style={styles.layer}>
      <LinearGradient
        colors={["#B8F5D9", "#F6FFF9", "#DAFAE9", "#70E3B0", "#087B5B"]}
        locations={[0, 0.24, 0.52, 0.81, 1]}
        start={{ x: 0, y: 0.12 }}
        end={{ x: 1, y: 0.87 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Svg viewBox="0 0 1200 260" width="100%" height="100%"
        preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFillObject}>
        <Defs>
          <SvgGradient id="leaf1" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#084E38" stopOpacity="0.98" />
            <Stop offset="1" stopColor="#3EDC8C" stopOpacity="0.76" />
          </SvgGradient>
          <SvgGradient id="leaf2" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#16946C" stopOpacity="0.76" />
            <Stop offset="1" stopColor="#D1FFDF" stopOpacity="0.52" />
          </SvgGradient>
          <SvgGradient id="mist" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.1" />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.43" />
            <Stop offset="1" stopColor="#0C7C57" stopOpacity="0.05" />
          </SvgGradient>
        </Defs>
        <Path d="M-32 238 Q186 25 495 36 Q720 45 960 -44" stroke="#FFFFFF" strokeWidth="45" strokeOpacity=".19" fill="none"/>
        <Path d="M105 315 Q428 116 808 113 Q1068 122 1240 -6" stroke="url(#mist)" strokeWidth="48" fill="none"/>
        <Circle cx="1180" cy="34" r="197" fill="#0E6D4D" opacity=".14"/>
        <Circle cx="1086" cy="190" r="170" fill="#21CD85" opacity=".14"/>
        <Circle cx="380" cy="-68" r="120" fill="#FFFFFF" opacity=".3"/>

        {/* Left leaf fan */}
        <G stroke="#117E5C" strokeWidth="4.4" strokeLinecap="round" fill="none" opacity=".48">
          <Path d="M-24 267 Q94 148 130 -30"/>
          <Path d="M33 217 Q10 173 -12 161"/>
          <Path d="M61 165 Q98 123 138 128"/>
          <Path d="M84 121 Q44 61 9 36"/>
          <Path d="M112 52 Q161 5 206 6"/>
        </G>
        <G fill="url(#leaf1)">
          <Path d="M15 184 C-32 142 -22 88 30 82 C66 119 47 162 15 184Z" opacity=".71"/>
          <Path d="M41 201 C59 151 105 134 137 151 C116 208 82 226 41 201Z" opacity=".58"/>
          <Path d="M77 126 C27 121 -4 89 5 41 C62 47 86 73 77 126Z" opacity=".66"/>
          <Path d="M102 91 C120 35 166 11 215 31 C181 83 144 96 102 91Z" opacity=".47"/>
          <Path d="M-10 258 C31 225 80 228 96 260Z" opacity=".65"/>
        </G>
        <G fill="url(#leaf2)">
          <Path d="M29 175 C16 130 36 102 68 96 C82 142 58 161 29 175Z"/>
          <Path d="M91 146 C112 102 146 91 174 115 C142 151 116 160 91 146Z"/>
          <Path d="M151 45 C160 6 185 -6 213 8 C201 38 176 50 151 45Z"/>
        </G>

        {/* Layered leafy corner at right, richer but kept away from data text */}
        <G stroke="#0D7551" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".62">
          <Path d="M1220 310 Q1081 191 1096 -35"/>
          <Path d="M1182 259 Q1125 203 1057 184"/>
          <Path d="M1114 153 Q1171 98 1197 58"/>
          <Path d="M1100 89 Q1050 54 1034 -1"/>
        </G>
        <G fill="url(#leaf1)">
          <Path d="M1179 258 C1120 231 1104 179 1142 155 C1187 172 1208 214 1179 258Z"/>
          <Path d="M1127 208 C1070 219 1035 183 1041 141 C1097 128 1123 156 1127 208Z"/>
          <Path d="M1138 134 C1139 78 1184 51 1234 65 C1220 121 1179 149 1138 134Z"/>
          <Path d="M1094 78 C1040 68 1023 28 1038 -21 C1085 -5 1112 33 1094 78Z"/>
          <Path d="M1220 190 C1165 185 1149 145 1169 118 C1213 124 1235 150 1220 190Z"/>
        </G>
        <G fill="url(#leaf2)">
          <Path d="M1083 213 C1028 218 999 180 1008 148 C1058 139 1080 165 1083 213Z"/>
          <Path d="M1151 109 C1150 58 1180 30 1215 35 C1211 77 1186 104 1151 109Z"/>
          <Path d="M1067 41 C1026 40 1003 20 1009 -9 C1045 -11 1068 9 1067 41Z"/>
        </G>

        {/* Abstract city identity; intentionally not a factual location photo */}
        <G fill="#117F5B" opacity=".11">
          <Path d="M710 162 L720 162 L720 124 L727 124 L727 96 L744 96 L744 122 L754 122 L754 162
          L762 162 L762 129 L777 129 L777 109 L790 109 L790 162
          L799 162 L799 141 L811 141 L811 89 L822 75 L835 89 L835 140 L849 140 L849 162
          L865 162 L865 109 L876 109 L876 97 L893 97 L893 160 L914 160 L914 143 L936 143 L936 160 Z"/>
        </G>
        <G fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeOpacity=".21">
          <Path d="M692 163 H962"/>
          <Path d="M820 75 V60"/>
          <Path d="M870 107 H890"/>
        </G>
        <Ellipse cx="757" cy="31" rx="4" ry="7" fill="#098B63" opacity=".19"/>
        <Ellipse cx="1010" cy="103" rx="6" ry="10" fill="#FFFFFF" opacity=".25"/>
      </Svg>

      <View style={styles.emblemShadow}>
        <LinearGradient colors={["#BFF7DA", "#FFFFFF"]} style={styles.emblemBorder}>
          <LinearGradient colors={["#064D35", "#068B57", "#2CD28C"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.emblemGradient}>
            <Ionicons name="heart" size={44} color="#FFFFFF" />
            <Ionicons name="hand-left-outline" size={43} color="#EEFFF5" style={styles.hand} />
          </LinearGradient>
        </LinearGradient>
      </View>
      <View style={styles.rightHeart}>
        <Ionicons name="heart" size={50} color="rgba(255,255,255,0.88)"/>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow: "hidden", borderRadius: 20 },
  emblemShadow: {
    position: "absolute", left: -14, top: 28, width: 126, height: 126,
    transform: [{ rotate: "-13deg" }], borderRadius: 30,
    shadowColor: "#00583E", shadowOpacity: 0.35,
    shadowRadius: 18, shadowOffset: { width: 1, height: 9 }, elevation: 8,
  },
  emblemBorder: { flex: 1, padding: 6, borderRadius: 30 },
  emblemGradient: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 24 },
  hand: { marginTop: -15 },
  rightHeart: { position: "absolute", right: 23, top: 18 },
});
