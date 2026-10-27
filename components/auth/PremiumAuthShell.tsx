import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Image, ImageBackground, Platform, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";

/**
 * Dual VolunServe entry: exact reference-inspired photo-card composition.
 * The two screens share only visual layout; role-based authentication and
 * authoritative route permissions stay inside their existing controllers.
 */
export const authCornerCut = (n: number) => Platform.OS === "web"
  ? ({ clipPath: "polygon(" + n + "px 0, calc(100% - " + n +
      "px) 0, 100% " + n + "px, 100% calc(100% - " + n +
      "px), calc(100% - " + n + "px) 100%, " + n +
      "px 100%, 0 calc(100% - " + n + "px), 0 " + n + "px)" } as any)
  : ({ borderRadius: 10 } as any);

// Photo crops use the user's supplied reference images; no external image URL.
const COVER = {
  resident: require("../../assets/images/auth-resident-hero.webp"),
  admin: require("../../assets/images/auth-admin-hero.webp"),
};

type Props = { active: "resident" | "admin"; children: React.ReactNode };

export default function PremiumAuthShell({active, children}: Props) {
  const router = useRouter();
  const {width} = useWindowDimensions();
  const small = width < 540;
  const resident = active === "resident";
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled">
      <LinearGradient pointerEvents="none"
        colors={["#E8FAF0", "#F4FFF8", "#D7F2E6"]}
        start={{x:0,y:0}} end={{x:1,y:1}}
        style={StyleSheet.absoluteFillObject} />
      <View style={[styles.viewport, small && styles.viewportSmall]}>
        <View style={styles.brand}>
          <Image source={require("../../assets/images/logo.png")}
            style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={styles.brandName}>VolunServe</Text>
            <Text style={styles.brandCaption}>COMMUNITY RESPONSE & VOLUNTEERING</Text>
          </View>
        </View>
        <View style={styles.switcher} accessibilityLabel="Choose account sign-in">
          <TouchableOpacity accessibilityRole="tab"
            accessibilityLabel="Resident and Volunteer Login"
            accessibilityState={{selected: resident}}
            style={[styles.switchTab,resident && styles.selectedTab]}
            onPress={()=>{if (!resident) router.replace("/login");}}>
            <Ionicons name="people-outline" color={resident?"#FFFFFF":"#286A55"} size={16}/>
            <Text style={[styles.switchText,resident && styles.selectedText]}>Residents & Volunteers</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab"
            accessibilityLabel="LGU and System Administrator Login"
            accessibilityState={{selected: !resident}}
            style={[styles.switchTab,!resident && styles.selectedTab]}
            onPress={()=>{if (resident) router.replace("/admin-login");}}>
            <Ionicons name="business-outline" color={!resident?"#FFFFFF":"#286A55"} size={16}/>
            <Text style={[styles.switchText,!resident && styles.selectedText]}>LGU & System Admin</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.photoFrame}>
            <ImageBackground source={COVER[active]} style={styles.photo}
              imageStyle={styles.photoImage} resizeMode="cover">
              <LinearGradient colors={["rgba(9,73,52,0.10)", "rgba(8,66,48,0.24)"]}
                style={StyleSheet.absoluteFillObject} />
              <View style={styles.leafDecoration}>
                <Ionicons name="leaf-outline" size={48} color="rgba(245,255,245,.60)"/>
              </View>
            </ImageBackground>
            <Svg style={styles.wave} width="100%" height={90} viewBox="0 0 700 90"
              preserveAspectRatio="none" pointerEvents="none">
              <Path d="M0 25 C110 68 188 90 305 74 C430 53 496 22 700 32 L700 90 L0 90 Z"
                fill="#E8FBEF"/>
            </Svg>
          </View>
          <View style={styles.heroIcon}>
            <LinearGradient colors={["#0F7654","#004B39"]} style={styles.heroIconGradient}>
              <Ionicons name={resident?"people":"shield-checkmark"} color="#FFFFFF" size={39}/>
            </LinearGradient>
          </View>
          <View style={styles.header}>
            <Text style={[styles.heading,small && styles.headingSmall]}>
              {resident?"Resident & Volunteer Login":"LGU & System\nAdministration Login"}
            </Text>
            <Text style={styles.subheading}>
              {resident
                ?"Access community services, join events, request assistance, and make a difference."
                :"Access administrative tools, manage operations, and maintain the VolunServe platform."}
            </Text>
          </View>
          <View style={[styles.form,small&&styles.formSmall]}>
            {children}
          </View>
          <View style={styles.roles}>
            {resident ? (
              <>
                <Role icon="home" label={"Basic\nResident"}/>
                <Role icon="shield-checkmark" label={"Verified\nResident"}/>
                <Role icon="people" label="Volunteer"/>
              </>
            ) : (
              <>
                <Role icon="business" label={"LGU\nAdmin"}/>
                <View style={styles.roleDivider}/>
                <Role icon="settings" label={"Super\nAdmin"}/>
              </>
            )}
          </View>
        </View>
        <Text style={styles.legal}>VolunServe · City of San Jose del Monte, Bulacan</Text>
      </View>
    </ScrollView>
  );
}

function Role({icon,label}:{icon: React.ComponentProps<typeof Ionicons>["name"];label:string}) {
  return <View style={styles.role}>
    <Ionicons name={icon} color="#07513D" size={30}/>
    <Text style={styles.roleText}>{label}</Text>
  </View>;
}

const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:"#E8FBEF"},
  scroll:{flexGrow:1,alignItems:"center",justifyContent:"center",padding:18,paddingVertical:30},
  viewport:{width:"100%",maxWidth:720,alignItems:"center"},
  viewportSmall:{maxWidth:620},
  brand:{flexDirection:"row",alignItems:"center",gap:9,marginBottom:13},
  logo:{width:40,height:40},brandName:{color:"#064D3C",fontSize:22,
    fontWeight:"900",letterSpacing:-0.55},
  brandCaption:{color:"#338065",fontSize:8.5,fontWeight:"900",letterSpacing:1.1},
  switcher:{width:"100%",maxWidth:620,flexDirection:"row",gap:4,padding:4,
    backgroundColor:"rgba(255,255,255,.90)",borderRadius:17,
    borderColor:"#B9DDCC",borderWidth:1,marginBottom:15},
  switchTab:{flex:1,flexDirection:"row",gap:6,alignItems:"center",justifyContent:"center",
    borderRadius:12,minHeight:45,paddingHorizontal:6},
  selectedTab:{backgroundColor:"#087A5A"},
  switchText:{fontSize:12,color:"#245B48",fontWeight:"800",textAlign:"center"},
  selectedText:{color:"#FFFFFF"},
  card:{width:"100%",maxWidth:700,backgroundColor:"#E8FBEF",borderRadius:30,
    overflow:"hidden",borderWidth:1,borderColor:"#C6E4D4",
    shadowColor:"#0F5B47",shadowOffset:{width:0,height:12},
    shadowOpacity:0.18,shadowRadius:28,elevation:7},
  photoFrame:{height:202,position:"relative",overflow:"hidden"},
  photo:{width:"100%",height:202},photoImage:{width:"100%"},
  leafDecoration:{position:"absolute",top:13,left:15},
  wave:{position:"absolute",bottom:0,left:0,right:0},
  heroIcon:{alignSelf:"center",width:102,height:102,borderRadius:52,marginTop:-48,
    backgroundColor:"#FFFFFF",padding:6,borderWidth:2,borderColor:"#C8E7D8",
    overflow:"hidden",shadowColor:"#07412F",shadowOpacity:0.16,shadowRadius:9,elevation:5},
  heroIconGradient:{flex:1,borderRadius:48,alignItems:"center",justifyContent:"center"},
  header:{alignItems:"center",paddingHorizontal:26,paddingTop:4,paddingBottom:15},
  heading:{fontSize:31,lineHeight:37,textAlign:"center",color:"#0B4936",
    fontWeight:"800",letterSpacing:-0.7},
  headingSmall:{fontSize:25,lineHeight:31},
  subheading:{fontSize:15,lineHeight:22,color:"#556F62",textAlign:"center",
    maxWidth:540,marginTop:10},
  form:{width:"100%",maxWidth:650,alignSelf:"center",paddingHorizontal:40,
    paddingTop:5,paddingBottom:18,gap:10},
  formSmall:{paddingHorizontal:22},
  roles:{flexDirection:"row",justifyContent:"space-evenly",alignItems:"center",
    gap:10,paddingHorizontal:24,paddingTop:10,paddingBottom:24},
  role:{flex:1,alignItems:"center",justifyContent:"center",gap:6},
  roleText:{color:"#154C3E",fontSize:13,lineHeight:18,fontWeight:"700",
    textAlign:"center"},
  roleDivider:{height:52,width:1,backgroundColor:"#C6DED4"},
  legal:{color:"#588576",fontSize:10,textAlign:"center",marginTop:17},
});
