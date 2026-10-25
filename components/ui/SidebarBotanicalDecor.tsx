import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Path,
  Ellipse,
} from "react-native-svg";

/**
 * Decorative foliage for the VolunServe role navigation.
 *
 * Low-contrast vector leaves sit BEHIND navigation content.
 * Purely visual: no touches, fake photos, extra text, or effects on routes.
 */
export default function SidebarBotanicalDecor() {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={styles.layer}
    >
      <View style={styles.upperMist} />
      <View style={styles.bottomMist} />

      {/* A soft vine that grows from the lower-left corner. */}
      <Svg width={315} height={425} viewBox="0 0 315 425" style={styles.bottomFoliage}>
        <Defs>
          <SvgLinearGradient id="botanicalLeaf" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#A4F8D6" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#64D6B7" stopOpacity={0.055} />
          </SvgLinearGradient>
        </Defs>
        <Path d="M-34 425 C7 367 37 319 76 285 C118 246 130 218 158 177 C184 139 214 112 246 82" fill="none" stroke="#9FF3D1" strokeWidth={4.5} opacity={0.13} strokeLinecap="round" />
        <Path d="M47 313 C87 316 137 347 175 380" fill="none" stroke="#8FEAC8" strokeWidth={3} opacity={0.12} strokeLinecap="round" />
        <Path d="M106 254 C83 211 54 182 19 177" fill="none" stroke="#A7F3D8" strokeWidth={3} opacity={0.12} strokeLinecap="round" />
        <Path d="M154 183 C179 193 216 204 248 198" fill="none" stroke="#83E8C5" strokeWidth={2.6} opacity={0.13} strokeLinecap="round" />
        <Path d="M196 127 C175 100 160 64 166 24" fill="none" stroke="#83E8C5" strokeWidth={2.6} opacity={0.12} strokeLinecap="round" />
        <Path d="M30 343 C-20 328 -35 286 -22 267 C20 261 47 301 30 343Z" fill="url(#botanicalLeaf)" />
        <Path d="M73 285 C22 267 17 217 33 199 C76 211 92 251 73 285Z" fill="url(#botanicalLeaf)" />
        <Path d="M96 265 C122 220 169 215 180 228 C164 267 130 288 96 265Z" fill="url(#botanicalLeaf)" />
        <Path d="M130 217 C104 174 100 142 115 130 C149 148 159 188 130 217Z" fill="url(#botanicalLeaf)" />
        <Path d="M153 179 C178 141 220 143 234 157 C214 188 187 205 153 179Z" fill="url(#botanicalLeaf)" />
        <Path d="M193 130 C188 92 201 60 225 50 C239 82 228 114 193 130Z" fill="url(#botanicalLeaf)" />
        <Path d="M166 61 C142 40 139 4 150 -8 C176 5 187 37 166 61Z" fill="url(#botanicalLeaf)" />
        <Path d="M20 179 C-5 134 -41 119 -59 130 C-45 171 -14 193 20 179Z" fill="url(#botanicalLeaf)" />
        <Path d="M48 314 C52 345 26 378 4 384 C-6 355 13 328 48 314Z" fill="url(#botanicalLeaf)" />
        <Path d="M82 324 C111 308 146 317 162 339 C134 355 102 349 82 324Z" fill="url(#botanicalLeaf)" />
        <Path d="M115 339 C125 365 111 395 86 411 C77 382 89 350 115 339Z" fill="url(#botanicalLeaf)" />
        <Path d="M145 356 C177 341 211 349 221 370 C190 391 164 385 145 356Z" fill="url(#botanicalLeaf)" />
        <Ellipse cx="225" cy="81" rx="19" ry="7" transform="rotate(-37 225 81)" fill="#87E7C5" opacity={0.10} />
      </Svg>

      {/* A second, faint branch adds botanical identity without crowding text. */}
      <Svg width={185} height={330} viewBox="0 0 185 330" style={styles.rightFoliage}>
        <Path d="M210 -12 C138 55 154 98 106 145 C77 173 72 225 17 273" fill="none" stroke="#7FE5C5" strokeWidth={3.5} opacity={0.075} strokeLinecap="round" />
        <Path d="M138 77 C113 39 79 27 63 35 C76 72 106 88 138 77Z" fill="#8CF2D0" opacity={0.085} />
        <Path d="M143 84 C179 71 199 79 215 97 C191 119 161 114 143 84Z" fill="#8CF2D0" opacity={0.07} />
        <Path d="M110 142 C100 110 65 92 45 103 C54 132 85 157 110 142Z" fill="#8CF2D0" opacity={0.085} />
        <Path d="M95 169 C120 150 155 151 172 174 C151 196 117 193 95 169Z" fill="#8CF2D0" opacity={0.075} />
        <Path d="M70 224 C46 188 18 183 -3 199 C12 226 42 241 70 224Z" fill="#8CF2D0" opacity={0.09} />
        <Path d="M50 250 C66 222 92 219 114 236 C101 260 75 272 50 250Z" fill="#8CF2D0" opacity={0.08} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    zIndex: 0,
  },
  upperMist: {
    position: "absolute",
    width: 210,
    height: 290,
    right: -137,
    top: -30,
    borderRadius: 150,
    backgroundColor: "rgba(121, 245, 198, 0.035)",
  },
  bottomMist: {
    position: "absolute",
    width: 285,
    height: 320,
    left: -156,
    bottom: -138,
    borderRadius: 160,
    backgroundColor: "rgba(51, 201, 164, 0.055)",
  },
  bottomFoliage: {
    position: "absolute",
    left: -65,
    bottom: -22,
  },
  rightFoliage: {
    position: "absolute",
    right: -76,
    top: "28%",
  },
});
