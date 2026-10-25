import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgGradient,
  Path,
  Stop,
} from "react-native-svg";

/**
 * Reference-matched botanical hero artwork. Pure vector decoration:
 * campaign numbers, donation totals and headings stay as real React Native
 * text in donation.tsx, never baked into the background or fabricated here.
 */
export default function DonationHeroArt() {
  return (
    <View pointerEvents="none" accessible={false} style={styles.layer}>
      <LinearGradient
        colors={["#D7FFE8", "#F8FFF4", "#DFFCEC", "#91EDC7", "#2ED49A", "#078B60"]}
        locations={[0, 0.25, 0.45, 0.67, 0.86, 1]}
        start={{ x: 0, y: 0.08 }}
        end={{ x: 1, y: 0.78 }}
        style={StyleSheet.absoluteFillObject}
      />

      <Svg
        viewBox="0 0 1200 215"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
        style={StyleSheet.absoluteFillObject}
      >
        <Defs>
          <SvgGradient id="foliageDeep" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#003F2B" />
            <Stop offset="0.5" stopColor="#047C4E" />
            <Stop offset="1" stopColor="#36D58D" />
          </SvgGradient>
          <SvgGradient id="foliageLight" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#5BE5A0" />
            <Stop offset="1" stopColor="#C9FFE2" />
          </SvgGradient>
          <SvgGradient id="skylineFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#168968" stopOpacity="0.20" />
            <Stop offset="1" stopColor="#0AA16F" stopOpacity="0.06" />
          </SvgGradient>
        </Defs>

        {/* Soft pale editorial washes and angular translucent green shapes. */}
        <Path d="M-55 0 H560 L399 144 L165 216 H-55Z" fill="#FFFFFF" opacity="0.20" />
        <Path d="M406 0 H1090 L934 97 L740 125 L554 208 L342 156Z" fill="#FFFFFF" opacity="0.20" />
        <Path d="M714 -30 L1016 -18 L915 213 L806 175Z" fill="#64E9B6" opacity="0.15" />
        <Path d="M1082 -12 L1220 20 L1220 215 L972 215Z" fill="#007B55" opacity="0.14" />
        <Ellipse cx="478" cy="-24" rx="260" ry="94" fill="#FFFFFF" opacity="0.19" />
        <Ellipse cx="940" cy="240" rx="360" ry="95" fill="#76F0BE" opacity="0.18" />

        {/* Left botanical silhouettes: broad mint leaves framing the emblem. */}
        <G stroke="#1CA66E" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.35">
          <Path d="M-18 240 Q83 118 120 -25" />
          <Path d="M42 153 Q6 102 -13 88" />
          <Path d="M66 110 Q119 83 167 38" />
          <Path d="M11 214 Q88 177 134 177" />
          <Path d="M105 49 Q70 17 63 -18" />
        </G>
        <G fill="url(#foliageLight)" opacity="0.60">
          <Path d="M7 139 C-34 106 -38 51 7 28 C54 63 42 117 7 139Z" />
          <Path d="M50 125 C56 61 110 26 164 39 C133 97 93 124 50 125Z" />
          <Path d="M-10 215 C20 165 80 157 111 181 C84 225 44 241 -10 215Z" />
          <Path d="M91 67 C57 54 40 17 53 -24 C98 -10 114 24 91 67Z" />
        </G>
        <G fill="url(#foliageDeep)" opacity="0.31">
          <Path d="M-16 91 C-4 39 32 18 57 27 C43 80 18 94 -16 91Z" />
          <Path d="M14 180 C22 126 63 109 96 127 C84 167 51 188 14 180Z" />
          <Path d="M122 76 C133 36 163 19 190 31 C175 70 150 83 122 76Z" />
        </G>

        {/* Stylized skyline matching the reference's soft civic silhouette. */}
        <G fill="url(#skylineFade)">
          <Path d="M590 157 H609 V108 H618 V89 H632 V107 H646 V157 H663
            V111 H672 V81 H678 V58 H688 V43 H696 V58 H703 V83 H712 V157
            H738 V125 H748 V90 H755 V63 H766 V88 H778 V156 H798
            V119 H813 V75 H823 V62 H831 V75 H843 V154
            H867 V114 H875 V102 H885 V87 H894 V102 H902 V156 H931 V132 H946 V156 Z" />
          <Path d="M670 60 Q687 36 704 60Z M743 89 Q762 57 783 89Z M810 77 Q827 49 843 77Z" />
        </G>
        <G fill="#1C8F69" opacity="0.09">
          <Path d="M545 156 H584 V133 H595 V155 H968 V215 H545Z" />
          <Path d="M814 112 L845 94 L874 112 L874 154 H814Z" />
        </G>
        <G stroke="#128C68" strokeWidth="1.6" strokeOpacity="0.12" fill="none">
          <Path d="M689 39 V25 M680 52 H697 M763 61 V39 M828 60 V44" />
          <Path d="M568 160 H980" />
        </G>

        {/* Floating leaves in the mid-to-lower foreground. */}
        <G stroke="#0B9C64" strokeWidth="2.7" opacity="0.38" fill="none">
          <Path d="M572 223 Q612 174 645 167 Q681 166 711 124" />
          <Path d="M625 181 Q610 149 611 132" />
          <Path d="M663 151 Q703 158 728 146" />
        </G>
        <G fill="url(#foliageLight)" opacity="0.63">
          <Path d="M626 182 C584 183 567 150 583 126 C620 132 640 153 626 182Z" />
          <Path d="M646 169 C659 126 693 108 725 125 C704 158 681 175 646 169Z" />
          <Path d="M692 152 C697 117 723 97 751 105 C738 136 717 151 692 152Z" />
          <Path d="M572 211 C591 181 624 173 645 186 C626 218 600 225 572 211Z" />
        </G>

        {/* Dense top-right and bottom-right botanical details. */}
        <G stroke="#006944" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.64">
          <Path d="M1230 -27 Q1124 92 1113 231" />
          <Path d="M1157 62 Q1090 49 1052 1" />
          <Path d="M1127 116 Q1192 97 1227 52" />
          <Path d="M1115 179 Q1058 155 1023 122" />
          <Path d="M1090 239 Q1062 186 1015 180" />
        </G>
        <G fill="url(#foliageDeep)" opacity="0.88">
          <Path d="M1177 47 C1120 43 1095 -2 1109 -37 C1156 -27 1185 8 1177 47Z" />
          <Path d="M1136 90 C1085 94 1053 61 1059 21 C1102 19 1133 47 1136 90Z" />
          <Path d="M1151 139 C1154 83 1194 57 1236 70 C1220 117 1191 139 1151 139Z" />
          <Path d="M1115 176 C1064 182 1033 149 1044 111 C1085 107 1113 137 1115 176Z" />
          <Path d="M1189 213 C1167 162 1199 120 1245 121 C1240 170 1222 200 1189 213Z" />
          <Path d="M1089 221 C1042 229 1016 206 1018 175 C1059 169 1081 190 1089 221Z" />
        </G>
        <G fill="url(#foliageLight)" opacity="0.59">
          <Path d="M1206 58 C1166 41 1153 11 1168 -18 C1214 0 1231 28 1206 58Z" />
          <Path d="M1093 95 C1053 82 1034 54 1043 22 C1083 40 1096 66 1093 95Z" />
          <Path d="M1162 188 C1132 160 1134 131 1160 113 C1192 142 1191 164 1162 188Z" />
          <Path d="M1044 213 C1001 200 990 167 1009 140 C1048 153 1065 184 1044 213Z" />
        </G>
        <G fill="#FFFFFF" opacity="0.20">
          <Circle cx="1026" cy="24" r="5" />
          <Circle cx="124" cy="14" r="4" />
          <Circle cx="815" cy="18" r="3" />
        </G>
      </Svg>

      {/* White-rimmed rotated tile with a single heart-in-open-hand pictogram. */}
      <View style={styles.emblemShadow}>
        <View style={styles.emblemRim}>
          <LinearGradient
            colors={["#034730", "#087A4C", "#1DCF86"]}
            start={{ x: 0.16, y: 0.12 }}
            end={{ x: 0.84, y: 1 }}
            style={styles.emblemInner}
          >
            <Svg viewBox="0 0 112 112" width="112" height="112">
              <Path
                d="M56 48 C47 36 33 36 27 47 C18 66 44 83 56 90 C69 82 95 64 85 47 C79 36 65 36 56 48Z"
                fill="#FFFFFF"
              />
              <Path
                d="M17 78 C23 72 29 72 35 76 L45 84 L61 84 L76 72 C81 69 86 72 83 78
                   C76 91 64 101 48 103 L34 105 C28 104 22 99 17 96Z"
                fill="#F4FFF8"
              />
              <Path
                d="M20 76 L33 77 L45 86 L59 87 M79 77 C86 71 90 61 95 59 C100 57 103 62 100 68
                   C96 88 78 104 57 107"
                fill="none"
                stroke="#F4FFF8"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </LinearGradient>
        </View>
      </View>

      <View style={styles.rightHeart}>
        <Ionicons name="heart" size={43} color="rgba(255,255,255,0.96)" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow: "hidden", borderRadius: 20 },
  emblemShadow: {
    position: "absolute",
    left: 19,
    top: 13,
    width: 140,
    height: 140,
    transform: [{ rotate: "-11deg" }],
    borderRadius: 29,
    shadowColor: "#00452E",
    shadowOpacity: 0.36,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 9 },
    elevation: 8,
  },
  emblemRim: {
    flex: 1,
    padding: 7,
    borderRadius: 29,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#EFFFEF",
  },
  emblemInner: {
    flex: 1,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  rightHeart: { position: "absolute", top: 15, right: 24 },
});
