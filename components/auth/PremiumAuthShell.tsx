import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import Svg, { Path } from "react-native-svg";
import {
  Image, ImageBackground, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from "react-native";

const COVER = {
  resident: require("../../assets/images/auth-resident-hero.webp"),
  admin: require("../../assets/images/auth-admin-hero.webp"),
};

/**
 * Shared premium login frame. Both sign-in routes use the same visual shell;
 * only their permitted authentication methods differ.
 *
 * Sharp/chamfered geometry is CSS clip-path on web. Native gets safe,
 * accessible near-square corners instead of unsupported browser styles.
 */
const SLIDES = [
  require("../../assets/images/slide1.jpg"),
  require("../../assets/images/slide2.jpg"),
  require("../../assets/images/slide3.jpg"),
];

export const authCornerCut = (n: number) => Platform.OS === "web"
  ? ({
      clipPath: "polygon(" + n + "px 0, calc(100% - " + n +
        "px) 0, 100% " + n + "px, 100% calc(100% - " + n +
        "px), calc(100% - " + n + "px) 100%, " + n +
        "px 100%, 0 calc(100% - " + n + "px), 0 " + n + "px)",
    } as any)
  : ({ borderRadius: 9 } as any);

type Props = { active: "resident" | "admin"; children: React.ReactNode };

export default function PremiumAuthShell({ active, children }: Props) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const compact = width < 900;
  const narrow = width < 480;
  const [slide, setSlide] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => setSlide(current => (current + 1) % SLIDES.length), 6500);
    return () => clearInterval(timer);
  }, []);

  const heroHeight = compact ? (narrow ? 325 : 355) : Math.max(height, 710);
  const selected = active === "resident";

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={[styles.split, compact && styles.splitCompact]}>
        <View style={[styles.hero, { minHeight: heroHeight }, compact && styles.heroCompact]}>
          <Image source={SLIDES[slide]} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={["rgba(5,41,32,0.42)", "rgba(0,44,38,0.64)", "rgba(0,43,37,0.98)"]}
            locations={[0, 0.46, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[styles.heroContent, compact && styles.heroContentCompact]}>
            <View style={styles.brand}>
              <Image source={require("../../assets/images/logo.png")} resizeMode="contain" style={styles.logo} />
              <View style={styles.brandText}>
                <Text style={[styles.brandTitle, compact && styles.brandTitleCompact]}>VolunServe</Text>
                <Text style={styles.brandSub}>City Disaster Response Platform</Text>
              </View>
            </View>

            <View style={[styles.heroTextWrap, compact && styles.heroTextCompact]}>
              <View style={[styles.heroBadge, authCornerCut(10)]}>
                <Ionicons name="shield-checkmark" color="#066B55" size={17} />
                <Text style={styles.heroBadgeText}>BUILT FOR A SAFER COMMUNITY</Text>
              </View>
              <Text style={[styles.headline, compact && styles.headlineCompact]}>
                Report Emergencies{"\n"}
                <Text style={styles.headlineMint}>Build Safer Communities</Text>
              </Text>
              <Text style={[styles.heroCopy, compact && styles.heroCopyCompact]}>
                Send important incident details, get the help you need, and stay connected with local responders.
              </Text>
            </View>

            {!compact && (
              <View style={styles.heroBottom}>
                <View style={styles.featureRow}>
                  {([
                    { icon: "alert-circle-outline", title: "Emergency Reports", subtitle: "Report and get help quickly.", tint: "#FF9E96" },
                    { icon: "people-outline", title: "Request Assistance", subtitle: "Get support when you need it.", tint: "#7BF4D3" },
                    { icon: "calendar-outline", title: "Community Events", subtitle: "Join and support local activities.", tint: "#C3FF91" },
                  ] as const).map(feature => (
                    <View key={feature.title} style={[styles.feature, authCornerCut(12)]}>
                      <View style={[styles.featureIcon, authCornerCut(8)]}>
                        <Ionicons name={feature.icon} size={25} color={feature.tint} />
                      </View>
                      <View style={styles.featureWords}>
                        <Text style={styles.featureTitle}>{feature.title}</Text>
                        <Text style={styles.featureSub}>{feature.subtitle}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <View style={styles.heroFooter}>
                  <Text style={styles.tagline}>Stronger People.{"\n"}Safer Communities.</Text>
                  <View style={styles.dots}>
                    {SLIDES.map((_, index) => (
                      <TouchableOpacity key={index} accessibilityRole="button"
                        accessibilityLabel={"Show hero image " + (index + 1)}
                        accessibilityState={{ selected: slide === index }}
                        onPress={() => setSlide(index)}
                        style={[styles.dot, slide === index && styles.dotActive]} />
                    ))}
                  </View>
                </View>
              </View>
            )}
          </View>
          <LinearGradient
            colors={["rgba(18,148,109,0.45)", "rgba(9,102,76,0.04)"]}
            start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={[styles.cornerWash, authCornerCut(26)]}
          />
        </View>

        {/* The left-side slideshow remains exactly as in the original live shell. */}
        <View style={[styles.right, compact && styles.rightCompact]}>
          <View style={styles.switcher} accessibilityLabel="Choose account sign-in">
            <TouchableOpacity accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel="Resident & Volunteer Login"
              onPress={() => { if (!selected) router.replace("/login"); }}
              style={[styles.switchTab, selected && styles.selectedTab]}>
              <Ionicons name="people-outline" color={selected ? "#FFFFFF" : "#286A55"} size={16} />
              <Text style={[styles.switchText, selected && styles.selectedText]}>Residents & Volunteers</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="tab"
              accessibilityState={{ selected: !selected }}
              accessibilityLabel="LGU & System Administration Login"
              onPress={() => { if (selected) router.replace("/admin-login"); }}
              style={[styles.switchTab, !selected && styles.selectedTab]}>
              <Ionicons name="business-outline" color={!selected ? "#FFFFFF" : "#286A55"} size={16} />
              <Text style={[styles.switchText, !selected && styles.selectedText]}>LGU & System Admin</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.formCard}>
            <View style={styles.photoFrame}>
              <ImageBackground
                source={COVER[active]}
                imageStyle={styles.photoImage}
                style={styles.photo}
                resizeMode="cover"
              >
                <LinearGradient colors={["rgba(9,73,52,0.08)", "rgba(8,66,48,0.17)"]}
                  style={StyleSheet.absoluteFillObject} />
              </ImageBackground>
              <Svg style={styles.wave} width="100%" height={68} viewBox="0 0 700 90"
                preserveAspectRatio="none" pointerEvents="none">
                <Path d="M0 25 C110 68 188 90 305 74 C430 53 496 22 700 32 L700 90 L0 90 Z"
                  fill="#E8FBEF" />
              </Svg>
            </View>
            <View style={styles.heroIcon}>
              <LinearGradient colors={["#0F7654", "#004B39"]} style={styles.heroIconGradient}>
                <Ionicons name={selected ? "people" : "shield-checkmark"}
                  color="#FFFFFF" size={32} />
              </LinearGradient>
            </View>
            <View style={styles.formHeading}>
              <Text style={[styles.formTitle, narrow && styles.formTitleNarrow]}>
                {selected ? "Resident & Volunteer Login" : "LGU & System\nAdministration Login"}
              </Text>
              <Text style={styles.formSubtitle}>
                {selected
                  ? "Access community services, join events, request assistance, and make a difference."
                  : "Access administrative tools, manage operations, and maintain the VolunServe platform."}
              </Text>
            </View>
            <View style={[styles.formFields, narrow && styles.formFieldsNarrow]}>
              {children}
            </View>
            <View style={styles.roleRow}>
              {selected ? (
                <>
                  <AuthRole icon="home" label={"Basic\nResident"} />
                  <AuthRole icon="shield-checkmark" label={"Verified\nResident"} />
                  <AuthRole icon="people" label="Volunteer" />
                </>
              ) : (
                <>
                  <AuthRole icon="business" label={"LGU\nAdmin"} />
                  <View style={styles.roleSeparator} />
                  <AuthRole icon="settings" label={"Super\nAdmin"} />
                </>
              )}
            </View>
          </View>
          <Text style={styles.location}>VolunServe · City of San Jose del Monte, Bulacan</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function AuthRole({ icon, label }: {icon: React.ComponentProps<typeof Ionicons>["name"]; label: string}) {
  return (
    <View style={styles.role}>
      <Ionicons name={icon} size={25} color="#07513D" />
      <Text style={styles.roleText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#E8F4EF" },
  scroll: { flexGrow: 1 },
  split: { flexDirection: "row", width: "100%", flex: 1, alignItems: "stretch" },
  splitCompact: { flexDirection: "column" },
  hero: { flex: 1.33, backgroundColor: "#064B3B", overflow: "hidden", minWidth: 0 },
  heroCompact: { flex: 0, width: "100%" },
  heroContent: { flex: 1, paddingHorizontal: 47, paddingTop: 36, paddingBottom: 34, justifyContent: "space-between" },
  heroContentCompact: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 26 },
  brand: { flexDirection: "row", alignItems: "center", gap: 13 },
  logo: { width: 74, height: 74 },
  brandText: { flex: 1 },
  brandTitle: { color: "#FFFFFF", fontSize: 33, fontWeight: "900", letterSpacing: -1.4 },
  brandTitleCompact: { fontSize: 25 },
  brandSub: { color: "#E1FFF3", fontWeight: "600", fontSize: 13 },
  heroTextWrap: { marginTop: 56 },
  heroTextCompact: { marginTop: 12 },
  heroBadge: { alignSelf: "flex-start", flexDirection: "row", gap: 8, alignItems: "center",
    backgroundColor: "#CBFFEB", paddingHorizontal: 16, paddingVertical: 11, marginBottom: 25 },
  heroBadgeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.7, color: "#13594C" },
  headline: { fontSize: 40, lineHeight: 49, fontWeight: "900", letterSpacing: -1.3, color: "#FFFFFF" },
  headlineCompact: { fontSize: 25, lineHeight: 32 },
  headlineMint: { color: "#83F3CD" },
  heroCopy: { color: "#EEFFF8", fontSize: 16, lineHeight: 25, marginTop: 18, maxWidth: 570 },
  heroCopyCompact: { fontSize: 12, lineHeight: 17, marginTop: 7 },
  heroBottom: { gap: 26 },
  featureRow: { flexDirection: "row", gap: 10 },
  feature: { flex: 1, minWidth: 0, minHeight: 112, flexDirection: "row",
    alignItems: "center", gap: 10, backgroundColor: "rgba(0,55,47,0.77)",
    borderWidth: 1, borderColor: "#59C5A8", paddingHorizontal: 13, paddingVertical: 12 },
  featureIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(105,232,190,0.14)" },
  featureWords: { flex: 1, minWidth: 0, gap: 6 },
  featureTitle: { fontSize: 12, fontWeight: "900", color: "#FFFFFF" },
  featureSub: { fontSize: 11, lineHeight: 16, color: "#D5F9EB" },
  heroFooter: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 15 },
  tagline: { fontSize: 22, fontWeight: "500", fontStyle: "italic", color: "#EBFFF7", lineHeight: 29 },
  dots: { flexDirection: "row", alignItems: "center", gap: 7, paddingBottom: 8 },
  dot: { height: 7, width: 7, borderRadius: 4, backgroundColor: "#A5CBBB" },
  dotActive: { width: 25, backgroundColor: "#7AFFCF" },
  cornerWash: { position: "absolute", bottom: -90, left: -70, right: -50, height: 105, transform: [{rotate: "-5deg"}] },
  // Right-side form only: this section can change without touching the slideshow.
  right: {flex: 1, minWidth: 0, justifyContent: "center", alignItems: "center",
    paddingHorizontal: 22, paddingVertical: 16, backgroundColor: "#E8F7F1"},
  rightCompact: {paddingHorizontal: 13, paddingVertical: 20},
  switcher: {width: "100%", maxWidth: 620, flexDirection: "row", gap: 4, padding: 4,
    backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1,
    borderColor: "#C4E2D2", marginBottom: 12},
  switchTab: {flex: 1, minHeight: 43, borderRadius: 11, flexDirection: "row",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4, gap: 6},
  selectedTab: {backgroundColor: "#087A5A"},
  switchText: {fontSize: 11, color: "#245B48", fontWeight: "800", textAlign: "center"},
  selectedText: {color: "#FFFFFF"},
  formCard: {width: "100%", maxWidth: 620, backgroundColor: "#E8FBEF",
    borderRadius: 21, overflow: "hidden", borderWidth: 1, borderColor: "#C6E4D4",
    shadowColor: "#0F5B47", shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.12, shadowRadius: 18, elevation: 4},
  photoFrame: {height: 141, position: "relative", overflow: "hidden"},
  photo: {width: "100%", height: 141},
  photoImage: {width: "100%"},
  wave: {position: "absolute", left: 0, bottom: -1, right: 0},
  heroIcon: {alignSelf: "center", width: 82, height: 82, borderRadius: 43,
    marginTop: -40, backgroundColor: "#FFFFFF", padding: 5,
    borderWidth: 2, borderColor: "#C8E7D8", overflow: "hidden",
    shadowColor: "#07412F", shadowOpacity: 0.16, shadowRadius: 7, elevation: 5},
  heroIconGradient: {flex: 1, borderRadius: 40,
    alignItems: "center", justifyContent: "center"},
  formHeading: {alignItems: "center", paddingHorizontal: 15, paddingTop: 2, paddingBottom: 8},
  formTitle: {fontFamily: Platform.select({web: "Georgia, serif", ios: "Georgia", android: "serif"}),
    fontSize: 26, lineHeight: 31, letterSpacing: -0.6, color: "#0B4936",
    fontWeight: "800", textAlign: "center"},
  formTitleNarrow: {fontSize: 24, lineHeight: 29},
  formSubtitle: {fontSize: 12, lineHeight: 18, color: "#556F62",
    marginTop: 6, maxWidth: 440, textAlign: "center"},
  formFields: {width: "100%", paddingHorizontal: 26, paddingTop: 6, paddingBottom: 10, gap: 8},
  formFieldsNarrow: {paddingHorizontal: 17},
  roleRow: {flexDirection: "row", justifyContent: "space-evenly",
    alignItems: "center", gap: 6, paddingHorizontal: 12,
    paddingTop: 5, paddingBottom: 14},
  role: {flex: 1, alignItems: "center", gap: 4},
  roleText: {color: "#154C3E", fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 14},
  roleSeparator: {height: 38, width: 1, backgroundColor: "#C6DED4"},
  location: {textAlign: "center", paddingTop: 11, fontSize: 10, color: "#6C8B80"},
});
