import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Defs, G, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";

/**
 * Quiet botanical header artwork. Decorations are deliberately restricted to
 * the edges; the centre is left clear for accessible headings and the genuine
 * Firebase campaign statistics rendered by donation.tsx.
 */
export default function DonationHeroArt({ compact = false }: { compact?: boolean }) {
  return (
    <View pointerEvents="none" accessible={false} style={styles.layer}>
      <LinearGradient
        colors={["#D4FFE4", "#F5FFF5", "#F1FFF8", "#B5F4D8", "#41D89C", "#0D996D"]}
        locations={[0, 0.25, 0.48, 0.72, 0.89, 1]}
        start={{ x: 0, y: 0.35 }}
        end={{ x: 1, y: 0.55 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Svg
        viewBox="0 0 1200 190"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
        style={StyleSheet.absoluteFillObject}
      >
        <Defs>
          <SvgGradient id="mintLeaf" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#BBFFDD" />
            <Stop offset="1" stopColor="#27B879" />
          </SvgGradient>
          <SvgGradient id="deepLeaf" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#003E2B" />
            <Stop offset="1" stopColor="#18935D" />
          </SvgGradient>
          <SvgGradient id="skyline" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0C906E" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#0D9065" stopOpacity="0.035" />
          </SvgGradient>
        </Defs>

        {/* One translucent wash instead of the previous distracting zigzags. */}
        <Path d="M0 0 H805 Q635 95 470 190 H0Z" fill="#FFFFFF" opacity="0.19" />
        <Path d="M550 0 H1200 V190 H850 Q760 95 550 0Z" fill="#FFFFFF" opacity="0.06" />

        {/* Faint civic skyline in the whitespace between copy and statistics. */}
        <G fill="url(#skyline)">
          <Path d="M592 160 H610 V119 H623 V96 H632 V119 H643 V160
            H669 V93 H677 V68 H684 V57 H692 V68 H700 V93 H709 V160
            H730 V128 H741 V107 H751 V89 H760 V107 H771 V160
            H790 V119 H800 V83 H812 V69 H824 V83 H831 V160
            H849 V130 H859 V112 H868 V112 H868 V160 H894 V143 H906 V160Z" />
          <Path d="M672 93 Q687 74 702 93Z M795 83 Q812 62 828 83Z" />
        </G>

        {/* Small leaves frame the emblem only; never cover the header copy. */}
        <G stroke="#1A9F70" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.25">
          <Path d="M-8 189 Q46 104 79 -25" />
          <Path d="M21 135 Q-5 95 -27 91" />
          <Path d="M50 79 Q84 58 102 13" />
          <Path d="M42 164 Q77 142 120 152" />
        </G>
        <G fill="url(#mintLeaf)" opacity="0.48">
          <Path d="M5 125 C-31 93 -28 54 3 38 C39 63 38 102 5 125Z" />
          <Path d="M51 94 C48 50 77 20 113 23 C109 63 88 89 51 94Z" />
          <Path d="M22 164 C43 125 83 117 108 139 C91 165 54 180 22 164Z" />
          <Path d="M71 32 C42 20 34 -5 42 -27 C73 -12 86 10 71 32Z" />
        </G>
        <G fill="url(#deepLeaf)" opacity="0.19">
          <Path d="M-9 68 C7 23 34 12 55 22 C36 64 13 81 -9 68Z" />
          <Path d="M8 195 C29 157 65 151 89 170 C64 202 31 211 8 195Z" />
        </G>

        {/* Deep botanical corner on the far right, kept behind no label. */}
        <G stroke="#004F36" strokeWidth="4" strokeLinecap="round" opacity="0.53" fill="none">
          <Path d="M1216 -20 Q1131 60 1129 204" />
          <Path d="M1165 55 Q1122 43 1084 -9" />
          <Path d="M1140 102 Q1190 83 1215 32" />
          <Path d="M1129 157 Q1093 136 1062 112" />
        </G>
        <G fill="url(#deepLeaf)" opacity="0.77">
          <Path d="M1169 47 C1128 37 1108 1 1122 -26 C1165 -14 1182 15 1169 47Z" />
          <Path d="M1137 83 C1097 91 1071 64 1079 32 C1114 26 1136 48 1137 83Z" />
          <Path d="M1147 122 C1153 80 1186 59 1222 68 C1210 104 1181 128 1147 122Z" />
          <Path d="M1130 168 C1090 171 1062 147 1069 117 C1104 112 1128 133 1130 168Z" />
          <Path d="M1201 201 C1175 173 1183 136 1217 120 C1242 155 1235 182 1201 201Z" />
        </G>
        <G fill="url(#mintLeaf)" opacity="0.58">
          <Path d="M1198 43 C1180 9 1192 -13 1219 -24 C1231 10 1227 33 1198 43Z" />
          <Path d="M1096 96 C1069 80 1060 57 1077 36 C1103 53 1113 75 1096 96Z" />
          <Path d="M1182 175 C1156 146 1163 122 1187 108 C1203 131 1205 157 1182 175Z" />
        </G>
      </Svg>

      <View style={[styles.emblem, compact && styles.emblemCompact]}>
        <View style={styles.emblemRim}>
          <LinearGradient
            colors={["#035638", "#087D54", "#19BF7E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.emblemFill}
          >
            <Svg viewBox="0 0 100 100" width="75%" height="75%">
              <Path
                d="M50 31 C43 22 32 22 27 30 C18 44 36 57 50 64 C64 57 82 44 73 30 C68 22 57 22 50 31Z"
                fill="#FFFFFF"
              />
              <Path
                d="M15 69 Q23 63 31 67 L43 75 H56 Q62 75 67 71 L80 61 Q85 58 89 62 Q92 65 87 70
                  L73 84 Q67 91 55 90 L39 89 L23 82 L15 81Z"
                fill="#FFFFFF"
              />
              <Path
                d="M17 79 L29 86 Q35 90 43 91 L60 91"
                fill="none"
                stroke="#DAFFE9"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </Svg>
          </LinearGradient>
        </View>
      </View>
      {!compact && (
        <View style={styles.cornerHeart}>
          <Ionicons name="heart" size={33} color="rgba(255,255,255,0.89)" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow: "hidden", borderRadius: 18 },
  emblem: {
    position: "absolute", left: 24, top: 25, width: 121, height: 121,
    transform: [{ rotate: "-9deg" }], borderRadius: 26,
    shadowColor: "#085941", shadowOpacity: 0.22, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  emblemCompact: { left: 13, top: 22, width: 81, height: 81, borderRadius: 18 },
  emblemRim: {
    flex: 1, padding: 6, backgroundColor: "#FFFFFF",
    borderRadius: 26, borderWidth: 1, borderColor: "#FFFFFF",
  },
  emblemFill: {
    flex: 1, borderRadius: 20, alignItems: "center",
    justifyContent: "center", overflow: "hidden",
  },
  cornerHeart: { position: "absolute", top: 14, right: 21 },
});
