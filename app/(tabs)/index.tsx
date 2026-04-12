import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SideDrawer from "../../components/SideDrawer";

/* 🔥 ADDED FIREBASE */
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";

export default function Dashboard() {

  const router = useRouter();
  const [drawerOpen,setDrawerOpen] = useState(false);

  /* 🔥 ANNOUNCEMENTS STATE */
  const [announcements, setAnnouncements] = useState<any[]>([]);

  /* 🔥 FETCH ANNOUNCEMENTS */
  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "announcements"));
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAnnouncements(data);
      } catch (error) {
        console.log("Error fetching announcements:", error);
      }
    };

    fetchAnnouncements();
  }, []);

  return (
    <>
      <View style={styles.root}>

        {/* HEADER */}

        <SafeAreaView edges={["top"]} style={styles.safeHeader}>

          <View style={styles.header}>

            <View style={styles.brand}>

              <Image
                source={require("../../assets/images/logo.png")}
                style={styles.logo}
              />

              <View>
                <Text style={styles.title}>
                  VolunServe
                </Text>

                <Text style={styles.subtitle}>
                  City Disaster Response Platform
                </Text>
              </View>

            </View>

            <Pressable
              style={styles.menuBtn}
              onPress={()=>setDrawerOpen(true)}
            >
              <Ionicons name="menu" size={26} color="#fff"/>
            </Pressable>

          </View>

        </SafeAreaView>

        <ScrollView contentContainerStyle={styles.container}>

          {/* 🔥 ANNOUNCEMENTS SECTION */}

          {announcements.length > 0 && (
            <>
              <Text style={styles.moduleLabel}>
                ANNOUNCEMENTS
              </Text>

              {announcements.map((item, index) => (
                <View key={index} style={styles.announcementCard}>
                  <Text style={styles.announcementTitle}>
                    {item.title}
                  </Text>
                  <Text style={styles.announcementMessage}>
                    {item.message}
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* HERO CARD */}

          <View style={styles.heroCard}>

            <View style={styles.heroTop}>

              <View style={styles.statusBadge}>
                <Ionicons name="shield-checkmark" size={16} color="#059669"/>
                <Text style={styles.statusText}>
                  CITY RESPONSE SYSTEM
                </Text>
              </View>

              <View style={styles.operational}>
                <View style={styles.greenDot}/>
                <Text style={styles.operationalText}>
                  Operational
                </Text>
              </View>

            </View>

            <Text style={styles.welcome}>
              Welcome back,
              {"\n"}Caliboso
            </Text>

            <Text style={styles.description}>
              A centralized platform for emergency reporting,
              community assistance, live monitoring and disaster
              coordination for San Jose del Monte City.
            </Text>

            {/* STATS */}

            <View style={styles.statsContainer}>

              <View style={styles.statBox}>
                <Text style={styles.statNumber}>5</Text>
                <Text style={styles.statLabel}>Services</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statNumber}>24/7</Text>
                <Text style={styles.statLabel}>Response</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statNumber}>Realtime</Text>
                <Text style={styles.statLabel}>Access</Text>
              </View>

            </View>

          </View>

          {/* MODULE TITLE */}

          <Text style={styles.moduleLabel}>
            MAIN MODULES
          </Text>

          <Text style={styles.moduleTitle}>
            Operational Services
          </Text>

          {/* MODULES */}

          <ServiceCard
            icon="home"
            color="#2563eb"
            title="Residents"
            desc="Submit aid requests and receive immediate assistance."
            onPress={()=>router.push("/resident")}
          />

          <ServiceCard
            icon="warning"
            color="#dc2626"
            title="Disaster Response"
            desc="Report hazards and emergencies with evidence."
            onPress={()=>router.push("/disaster-response")}
          />

          <ServiceCard
            icon="people"
            color="#16a34a"
            title="Volunteer"
            desc="Join response teams and help affected residents."
            onPress={()=>router.push("/volunteer")}
          />

          <ServiceCard
            icon="map"
            color="#0891b2"
            title="Map Tracking"
            desc="View incidents and response zones in real time."
            onPress={()=>router.push("/map-tracking")}
          />

          <ServiceCard
            icon="heart"
            color="#d97706"
            title="Donation"
            desc="Support disaster relief and community programs."
            onPress={()=>router.push("/donation")}
          />

        </ScrollView>

      </View>

      <SideDrawer
        visible={drawerOpen}
        onClose={()=>setDrawerOpen(false)}
        name="Caliboso"
        email=""
        role="superadmin"
      />
    </>
  );
}

/* SERVICE CARD */

function ServiceCard({icon,color,title,desc,onPress}:any){

  return(

    <Pressable
      style={styles.serviceCard}
      onPress={onPress}
    >

      <View style={[styles.iconWrap,{backgroundColor:`${color}20`}]}>
        <Ionicons name={icon} size={22} color={color}/>
      </View>

      <View style={styles.serviceText}>
        <Text style={styles.serviceTitle}>{title}</Text>
        <Text style={styles.serviceDesc}>{desc}</Text>
      </View>

      <Ionicons name="arrow-forward" size={20} color={color}/>

    </Pressable>

  )

}

/* STYLES */

const styles = StyleSheet.create({

root:{
  flex:1,
  backgroundColor:"#f1f5f9"
},

safeHeader:{
  backgroundColor:"#0f766e"
},

header:{
  flexDirection:"row",
  justifyContent:"space-between",
  alignItems:"center",
  paddingHorizontal:22,
  paddingVertical:16
},

brand:{
  flexDirection:"row",
  alignItems:"center"
},

logo:{
  width:46,
  height:46,
  borderRadius:23,
  marginRight:14,
  backgroundColor:"#fff"
},

title:{
  fontSize:22,
  fontWeight:"800",
  color:"#fff"
},

subtitle:{
  fontSize:13,
  color:"#d1fae5",
  marginTop:2
},

menuBtn:{
  width:46,
  height:46,
  borderRadius:14,
  backgroundColor:"rgba(255,255,255,0.25)",
  justifyContent:"center",
  alignItems:"center"
},

container:{
  padding:22
},

/* 🔥 NEW STYLE */

announcementCard:{
  backgroundColor:"#fef9c3",
  padding:16,
  borderRadius:14,
  marginBottom:12
},

announcementTitle:{
  fontSize:16,
  fontWeight:"800",
  marginBottom:4
},

announcementMessage:{
  fontSize:14,
  color:"#374151"
},

heroCard:{
  backgroundColor:"#ffffff",
  padding:26,
  borderRadius:20,
  marginBottom:28,
  marginTop:10,
  shadowColor:"#000",
  shadowOpacity:0.04,
  shadowRadius:10,
  elevation:2
},

heroTop:{
  flexDirection:"row",
  justifyContent:"space-between",
  alignItems:"center",
  marginBottom:12
},

statusBadge:{
  flexDirection:"row",
  alignItems:"center",
  backgroundColor:"#ecfdf5",
  paddingHorizontal:12,
  paddingVertical:6,
  borderRadius:18
},

statusText:{
  fontSize:12,
  marginLeft:6,
  color:"#059669",
  fontWeight:"700"
},

operational:{
  flexDirection:"row",
  alignItems:"center"
},

greenDot:{
  width:8,
  height:8,
  borderRadius:4,
  backgroundColor:"#16a34a",
  marginRight:6
},

operationalText:{
  fontSize:13,
  color:"#374151"
},

welcome:{
  fontSize:30,
  fontWeight:"800",
  marginTop:4,
  lineHeight:34
},

description:{
  marginTop:10,
  fontSize:15,
  color:"#6b7280",
  lineHeight:22
},

statsContainer:{
  flexDirection:"row",
  justifyContent:"space-between",
  backgroundColor:"#f8fafc",
  borderRadius:16,
  paddingVertical:18,
  paddingHorizontal:12,
  marginTop:22
},

statBox:{
  flex:1,
  alignItems:"center"
},

statNumber:{
  fontSize:22,
  fontWeight:"800",
  color:"#111827"
},

statLabel:{
  fontSize:13,
  color:"#6b7280",
  marginTop:4
},

moduleLabel:{
  fontSize:12,
  color:"#059669",
  fontWeight:"700",
  marginBottom:6,
  letterSpacing:0.6
},

moduleTitle:{
  fontSize:24,
  fontWeight:"800",
  marginBottom:20
},

serviceCard:{
  flexDirection:"row",
  alignItems:"center",
  backgroundColor:"#ffffff",
  padding:20,
  borderRadius:18,
  marginBottom:16,
  shadowColor:"#000",
  shadowOpacity:0.03,
  shadowRadius:8,
  elevation:1
},

iconWrap:{
  width:48,
  height:48,
  borderRadius:14,
  justifyContent:"center",
  alignItems:"center",
  marginRight:16
},

serviceText:{
  flex:1
},

serviceTitle:{
  fontSize:17,
  fontWeight:"700"
},

serviceDesc:{
  fontSize:14,
  color:"#6b7280",
  marginTop:3
}

});