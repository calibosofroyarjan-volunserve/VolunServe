import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";
import {
  ScrollView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type ModuleCardProps = {
  title: string;
  description: string;
  icon: IconName;
  iconBackground: string;
  iconColor: string;
  onPress: () => void;
};

export default function SuperAdminDashboard() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const {user,profile} = useUserSession();
  const isSuperAdmin = !!user && profile?.role === "superadmin" && profile?.status === "approved";
  const [counts,setCounts] = useState<Record<string,number>>({});
  const [approvedCount,setApprovedCount] = useState<number|null>(null);
  const [failedSources,setFailedSources] = useState<string[]>([]);
  const [loadedSources,setLoadedSources] = useState<string[]>([]);
  useEffect(()=>{
    if(!isSuperAdmin)return;
    const sources=[["users","Registered Accounts"],["disasterCases","Emergency Reports"],["assistanceRequests","Assistance Requests"],["volunteerEvents","Community Events"]];
    const unsubscribers=sources.map(([name,label])=>onSnapshot(collection(db,name),snapshot=>{
      setCounts(old=>({...old,[name]:snapshot.size}));
      if(name==="users")setApprovedCount(snapshot.docs.filter(doc=>doc.data().status==="approved").length);
      setLoadedSources(old=>old.includes(name)?old:[...old,name]);
      setFailedSources(old=>old.filter(item=>item!==name));
    },error=>{
      console.warn("Dashboard summary unavailable:",name,error.code);
      setFailedSources(old=>old.includes(name)?old:[...old,name]);
      setLoadedSources(old=>old.includes(name)?old:[...old,name]);
    }));
    return ()=>unsubscribers.forEach(unsubscribe=>unsubscribe());
  },[isSuperAdmin]);
  const stats=useMemo(()=>[
    {key:"users",label:"Registered Accounts"},
    {key:"disasterCases",label:"Emergency Reports"},
    {key:"assistanceRequests",label:"Assistance Requests"},
    {key:"volunteerEvents",label:"Community Events"},
  ],[]);

  const openRoute = (route: string) => {
    router.push(route as Href);
  };

  return (
    <ScrollView
      style={[styles.screen, Platform.OS === "web" && styles.webScrollBar]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={true}
      accessibilityLabel="Super Admin dashboard content"
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, compact && styles.titleCompact]}>
            Super Admin Dashboard
          </Text>

          <Text style={styles.subtitle}>
            Manage system access, records, security, and settings.
          </Text>
        </View>

        {!compact ? (
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={16} color="#078F82" />
            <Text style={styles.roleBadgeText}>SUPER ADMIN</Text>
          </View>
        ) : null}
      </View>

      <View style={{backgroundColor:"#FFFFFF",padding:18,borderRadius:16,borderWidth:1,borderColor:"#DCEAE8",marginBottom:24}}>
        <Text style={styles.sectionTitle}>System Overview · Live Records</Text>
        <Text style={{fontSize:12,color:"#637F84",marginBottom:16}}>Real-time Firestore totals, not sample data. Each bar compares the number of records in its collection.</Text>
        {stats.map(item=>{
          const errored=failedSources.includes(item.key);
          const loaded=loadedSources.includes(item.key);
          const value=counts[item.key]??0;
          const max=Math.max(1,...Object.values(counts));
          return <View key={item.key} style={{marginBottom:14,gap:6}}>
            <View style={{flexDirection:"row",justifyContent:"space-between",gap:14}}>
              <Text style={{fontWeight:"700",fontSize:12,color:"#294A57"}}>{item.label}</Text>
              <Text style={{fontWeight:"800",fontSize:12,color:errored?"#B45309":"#078F82"}}>
                {errored?"Unavailable":!loaded?"Loading...":String(value)}
              </Text>
            </View>
            <View style={{height:12,backgroundColor:"#ECF5F1",borderRadius:9,overflow:"hidden"}}>
              {!errored&&loaded?<View style={{height:"100%",width:`${value/max*100}%`,backgroundColor:"#0D9970",borderRadius:9}}/>:null}
            </View>
          </View>
        })}
        {approvedCount!==null&&!failedSources.includes("users")&&
          <Text style={{fontSize:12,fontWeight:"700",color:"#285C4B",marginTop:4}}>
            Approved accounts: {approvedCount} of {counts.users??0} ({(counts.users??0)>0?Math.round(100*approvedCount/(counts.users??1)):0}%)
          </Text>}
        {failedSources.length>0&&<Text style={{fontSize:11,color:"#A06420",marginTop:9}}>Some figures cannot be loaded. Check Super Admin permissions and the deployed Firestore rules.</Text>}
      </View>

      <Text style={styles.sectionTitle}>System Management</Text>

      <View style={[styles.grid, compact && styles.gridCompact]}>
        <ModuleCard
          title="Admin Accounts"
          description="Manage operational admin access."
          icon="people"
          iconBackground="#E6F7F1"
          iconColor="#078F82"
          onPress={() => openRoute("/(superadmin)/admin-accounts")}
        />

        <ModuleCard
          title="All Records"
          description="View system-wide records."
          icon="document-text-outline"
          iconBackground="#EDF5FF"
          iconColor="#2472CA"
          onPress={() => openRoute("/(superadmin)/all-records")}
        />

        <ModuleCard
          title="Audit Logs"
          description="Review system activity logs."
          icon="time-outline"
          iconBackground="#E8F8F0"
          iconColor="#07906C"
          onPress={() => openRoute("/(superadmin)/admin-logs")}
        />

        <ModuleCard
          title="System Settings"
          description="Manage platform settings."
          icon="settings"
          iconBackground="#FFF4E7"
          iconColor="#D97A14"
          onPress={() => openRoute("/(superadmin)/system-settings")}
        />
      </View>
    </ScrollView>
  );
}

function ModuleCard({
  title,
  description,
  icon,
  iconBackground,
  iconColor,
  onPress,
}: ModuleCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.82}
      onPress={onPress}
    >
      <View style={styles.cardMain}>
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: iconBackground,
            },
          ]}
        >
          <Ionicons name={icon} size={27} color={iconColor} />
        </View>

        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>

      <View style={styles.arrowButton}>
        <Ionicons name="arrow-forward" size={20} color="#078F82" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#F2F9FC",
  },
  webScrollBar: {
    overflowY: "scroll",
    scrollbarWidth: "auto",
    scrollbarColor: "#8CA3B2 #F2F9FC",
  } as any,
  content: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    paddingHorizontal: 28,
    paddingTop: 35,
    paddingBottom: 64,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 34,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: {
    color: "#0E2D4E",
    fontSize: 30,
    lineHeight: 39,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  titleCompact: { fontSize: 25, lineHeight: 32 },
  subtitle: {
    color: "#657D92",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
  },
  roleBadge: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#A7EDCE",
    backgroundColor: "#E7FBF2",
  },
  roleBadgeText: {
    color: "#08766C",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  sectionTitle: {
    color: "#0E2D4E",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  gridCompact: {
    flexDirection: "column",
  },
  card: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 0,
    minHeight: 205,
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCEAE8",
    padding: 18,
  },
  cardMain: { alignItems: "flex-start" },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  cardTitle: {
    color: "#0E2D4E",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 21,
  },
  cardDescription: {
    color: "#657D92",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    maxWidth: 230,
  },
  arrowButton: {
    alignSelf: "flex-start",
    marginTop: 13,
    alignItems: "center",
    justifyContent: "center",
  },
});
