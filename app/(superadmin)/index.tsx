
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type SourceKey = "users" | "disasterCases" | "assistanceRequests" | "volunteerEvents";
type UserRow = { role?: string; status?: string };
const SOURCES: {key:SourceKey;label:string;icon:IconName}[] = [
  {key:"users",label:"Registered Accounts",icon:"people-outline"},
  {key:"disasterCases",label:"Emergency Reports",icon:"alert-circle-outline"},
  {key:"assistanceRequests",label:"Assistance Requests",icon:"hand-left-outline"},
  {key:"volunteerEvents",label:"Community Events",icon:"calendar-outline"},
];
const ROLE_TYPES = [
  {key:"resident",name:"Residents",color:"#079870"},
  {key:"volunteer",name:"Volunteers",color:"#328FBE"},
  {key:"admin",name:"LGU Admins",color:"#527AC1"},
  {key:"superadmin",name:"Super Admins",color:"#9274B5"},
  {key:"other",name:"Other / Pending",color:"#889EA0"},
];
const ACTIONS:{name:string;description:string;icon:IconName;route:string}[]=[
  {name:"Admin Accounts",description:"Review authorized administrators",icon:"shield-checkmark-outline",route:"/(superadmin)/admin-accounts"},
  {name:"All Records",description:"Inspect permitted system records",icon:"albums-outline",route:"/(superadmin)/all-records"},
  {name:"Audit Logs",description:"Review administrative activity",icon:"time-outline",route:"/(superadmin)/admin-logs"},
  {name:"System Settings",description:"Configure official platform settings",icon:"settings-outline",route:"/(superadmin)/system-settings"},
];
export default function SuperAdminDashboard() {
  const {width}=useWindowDimensions();
  const compact=width<760;
  const {user,profile}=useUserSession();
  const allowed=!!user&&profile?.role==="superadmin"&&profile?.status==="approved";
  const [counts,setCounts]=useState<Partial<Record<SourceKey,number>>>({});
  const [failed,setFailed]=useState<SourceKey[]>([]);
  const [users,setUsers]=useState<UserRow[]|null>(null);
  const [chart,setChart]=useState<"roles"|"operations">("roles");
  useEffect(()=>{
    if(!allowed) {setCounts({});setFailed([]);setUsers(null);return;}
    const off=SOURCES.map(item=>onSnapshot(collection(db,item.key),snapshot=>{
      setCounts(old=>({...old,[item.key]:snapshot.size}));
      setFailed(old=>old.filter(key=>key!==item.key));
      if(item.key==="users")setUsers(snapshot.docs.map(doc=>doc.data() as UserRow));
    },error=>{
      console.warn("Overview collection could not load",item.key,error.code);
      setFailed(old=>old.includes(item.key)?old:[...old,item.key]);
      if(item.key==="users")setUsers(null);
    }));
    return ()=>off.forEach(fn=>fn());
  },[allowed]);
  const roles=useMemo(()=>{
    const groups:Record<string,number>={resident:0,volunteer:0,admin:0,superadmin:0,other:0};
    for(const row of users||[]){
      const role=String(row.role||"").toLowerCase();
      if(role!=="other"&&Object.prototype.hasOwnProperty.call(groups,role))groups[role]++;
      else groups.other++;
    }
    return ROLE_TYPES.map(item=>({...item,value:groups[item.key]}));
  },[users]);
  const allUsers=users?.length||0;
  const approved=users?.filter(item=>item.status==="approved").length||0;
  const approvalPercent=allUsers?Math.round(100*approved/allUsers):0;
  const operations=SOURCES.filter(item=>item.key!=="users");
  const chartData=chart==="roles"?roles.map(item=>({id:item.key,label:item.name,value:item.value,color:item.color,loaded:users!==null,failed:failed.includes("users")})):
    operations.map(item=>({id:item.key,label:item.label,value:counts[item.key]||0,color:"#0B9976",loaded:counts[item.key]!==undefined,failed:failed.includes(item.key)}));
  const chartMax=Math.max(1,...chartData.map(item=>item.value));
  const synced=SOURCES.filter(item=>counts[item.key]!==undefined&&!failed.includes(item.key)).length;
  const open=(path:string)=>router.push(path as Href);
  return <ScrollView style={[styles.screen,Platform.OS==="web"&&styles.webScroll]} contentContainerStyle={[styles.container,compact&&styles.containerCompact]} accessibilityLabel="Super Admin dashboard" showsVerticalScrollIndicator>
    <LinearGradient colors={["#073C37","#056F5B","#16A17C"]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.pill}><Ionicons name="shield-checkmark" size={14} color="#C3FBE6"/><Text style={styles.pillText}>SUPER ADMIN · PLATFORM GOVERNANCE</Text></View>
        <View style={styles.syncPill}><View style={styles.syncDot}/><Text style={styles.syncText}>{synced}/4 data sources</Text></View>
      </View>
      <Text style={[styles.heroTitle,compact&&styles.heroTitleMobile]}>System Overview</Text>
      <Text style={styles.heroDesc}>A single place to review platform accounts, operational records and administrator access. The LGU Admin handles case decisions and donations.</Text>
    </LinearGradient>

    <View style={styles.sectionRow}>
      <View style={{flex:1}}>
        <Text style={styles.eyebrow}>REAL-TIME MONITORING</Text>
        <Text style={styles.heading}>Platform metrics</Text>
        <Text style={styles.body}>Values come from authorized Firestore collections, not sample data.</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" style={styles.outlineButton} onPress={()=>open("/(superadmin)/all-records")}>
        <Text style={styles.outlineText}>All Records</Text><Ionicons name="arrow-forward" size={15} color="#08745D"/>
      </TouchableOpacity>
    </View>
    <View style={styles.kpiGrid}>
      {SOURCES.map((source,index)=>{
        const error=failed.includes(source.key),loaded=counts[source.key]!==undefined;
        return <View key={source.key} style={[styles.kpiCard,compact&&styles.kpiCompact]}>
          <View style={[styles.kpiIcon,{backgroundColor:index%2===0?"#E1F6EA":"#EAF1FC"}]}>
            <Ionicons name={source.icon} color={index%2===0?"#08795C":"#4479AE"} size={20}/>
          </View>
          {error?<Text style={styles.kpiError}>Unavailable</Text>:loaded?
            <Text style={styles.kpiNumber}>{counts[source.key]?.toLocaleString("en-PH")}</Text>:
            <ActivityIndicator style={{alignSelf:"flex-start",marginVertical:13}} color="#128766"/>}
          <Text style={styles.kpiLabel}>{source.label}</Text>
          <Text style={styles.kpiCaption}>{error?"Access or connection error":"Live record count"}</Text>
        </View>;
      })}
    </View>
    <View style={[styles.dashboardRow,compact&&styles.dashboardStack]}>
      <View style={[styles.panel,{flex:1}]}>
        <View style={styles.sectionRow}><View style={{flex:1}}>
          <Text style={styles.eyebrow}>DASHBOARD ANALYTICS</Text>
          <Text style={styles.panelHeading}>Records comparison</Text>
          <Text style={styles.body}>Counted categories; no artificial percentages or trends.</Text>
        </View></View>
        <View style={styles.tabRow}>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{selected:chart==="roles"}} onPress={()=>setChart("roles")} style={[styles.tab,chart==="roles"&&styles.tabActive]}>
            <Text style={[styles.tabText,chart==="roles"&&styles.tabTextActive]}>Accounts by role</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{selected:chart==="operations"}} onPress={()=>setChart("operations")} style={[styles.tab,chart==="operations"&&styles.tabActive]}>
            <Text style={[styles.tabText,chart==="operations"&&styles.tabTextActive]}>Operation records</Text>
          </TouchableOpacity>
        </View>
        {chartData.map(item=><View key={item.id} style={styles.barItem}>
          <View style={styles.barHeading}><Text style={styles.barTitle}>{item.label}</Text><Text style={styles.barValue}>{item.failed?"Unavailable":!item.loaded?"Loading…":String(item.value)}</Text></View>
          <View style={styles.barTrack}>{item.loaded&&!item.failed&&
            <View style={[styles.barFill,{width:String(item.value/chartMax*100)+"%",backgroundColor:item.color}]}/>}</View>
        </View>)}
        {failed.length>0&&<Text style={styles.inlineWarning}>Some counters cannot be loaded. Check Super Admin Firestore permissions before defense.</Text>}
        <Text style={styles.footnote}>{chart==="roles"?"Role totals include all records in users, including inactive accounts.":"Operations are total records, not a monthly trend."}</Text>
      </View>
      <View style={[styles.panel,styles.approvalPanel,compact&&styles.approvalPanelMobile]}>
        <Text style={styles.eyebrow}>ACCOUNT ACCESS</Text>
        <Text style={styles.panelHeading}>Account approval rate</Text>
        <Text style={styles.percent}>{users===null?"—":String(approvalPercent)+"%"}</Text>
        <View style={styles.barTrack}>{users!==null&&<View style={[styles.barFill,{width:String(approvalPercent)+"%",backgroundColor:"#109875"}]}/>}</View>
        <Text style={styles.body}>{users===null?"Waiting for account records.":String(approved)+" of "+String(allUsers)+" accounts are approved."}</Text>
        <View style={styles.divider}/>
        <View style={styles.guidance}><Ionicons name="shield-checkmark-outline" size={19} color="#118565"/><Text style={styles.guidanceText}>Only independently authorized LGU personnel should receive Admin access. Review credentials before assigning a privileged role.</Text></View>
        <TouchableOpacity accessibilityRole="button" style={styles.actionLink} onPress={()=>open("/(superadmin)/admin-accounts")}><Text style={styles.actionLinkText}>Review Admin Access</Text><Ionicons name="arrow-forward" size={17} color="#0B8466"/></TouchableOpacity>
      </View>
    </View>

    <View style={styles.sectionRow}>
      <View style={{flex:1}}><Text style={styles.eyebrow}>GOVERNANCE</Text><Text style={styles.heading}>Management workspaces</Text>
      <Text style={styles.body}>Focused entry points; the sidebar remains the primary navigation.</Text></View>
    </View>
    <View style={styles.actionsGrid}>
      {ACTIONS.map(item=><TouchableOpacity key={item.name} accessibilityRole="button" accessibilityLabel={"Open "+item.name} onPress={()=>open(item.route)} style={styles.actionCard}>
        <View style={styles.actionIcon}><Ionicons name={item.icon} size={20} color="#08816A"/></View>
        <View style={{flex:1,minWidth:0}}><Text style={styles.actionTitle}>{item.name}</Text><Text style={styles.actionDescription}>{item.description}</Text></View>
        <Ionicons name="chevron-forward" size={18} color="#86A69B"/>
      </TouchableOpacity>)}
    </View>
    <Text style={styles.footer}>VolunServe · System governance only · Operational decisions belong to authorized LGU Admins</Text>
  </ScrollView>;
}
const styles=StyleSheet.create({
  screen:{flex:1,minHeight:0,backgroundColor:"#F5FAF7"},
  webScroll:{overflowY:"scroll",scrollbarWidth:"auto",scrollbarColor:"#A1BDB0 #F5FAF7"} as any,
  container:{alignSelf:"center",width:"100%",maxWidth:1280,paddingTop:24,paddingBottom:70,paddingHorizontal:26},
  containerCompact:{paddingHorizontal:13,paddingTop:13},
  hero:{borderRadius:20,padding:26,marginBottom:26,overflow:"hidden"},
  heroTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10},
  pill:{flexDirection:"row",alignItems:"center",gap:8},
  pillText:{color:"#C8FBE5",fontSize:10,fontWeight:"800",letterSpacing:1},
  syncPill:{backgroundColor:"rgba(255,255,255,.14)",paddingHorizontal:10,paddingVertical:7,borderRadius:30,flexDirection:"row",alignItems:"center",gap:7},
  syncDot:{width:7,height:7,borderRadius:4,backgroundColor:"#B3FCE2"},syncText:{color:"#FFFFFF",fontSize:10,fontWeight:"700"},
  heroTitle:{fontSize:30,lineHeight:40,fontWeight:"900",color:"#FFFFFF",letterSpacing:-.6,marginTop:20},
  heroTitleMobile:{fontSize:25,lineHeight:32},
  heroDesc:{maxWidth:740,color:"#DEF8EA",fontSize:12,lineHeight:21,marginTop:7},
  eyebrow:{fontWeight:"800",fontSize:10,letterSpacing:1.1,color:"#078363",marginBottom:6},
  heading:{fontSize:20,fontWeight:"900",letterSpacing:-.35,color:"#163F32"},
  body:{color:"#71887F",fontSize:11,lineHeight:18,marginTop:5},
  sectionRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:13,flexWrap:"wrap",marginBottom:15},
  outlineButton:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#CDE9DD",paddingHorizontal:14,paddingVertical:10,borderRadius:10,flexDirection:"row",alignItems:"center",gap:9},
  outlineText:{color:"#08745D",fontSize:11,fontWeight:"800"},
  kpiGrid:{flexDirection:"row",flexWrap:"wrap",gap:12,marginBottom:22},
  kpiCard:{flexGrow:1,flexBasis:205,minWidth:165,backgroundColor:"#FFFFFF",borderRadius:15,borderWidth:1,borderColor:"#E2EEE7",minHeight:155,padding:15},
  kpiCompact:{flexBasis:145,minWidth:125},
  kpiIcon:{width:36,height:36,borderRadius:10,alignItems:"center",justifyContent:"center",marginBottom:11},
  kpiNumber:{color:"#153D31",fontSize:26,fontWeight:"900"},
  kpiError:{color:"#AF712D",fontSize:12,fontWeight:"800",marginVertical:10},
  kpiLabel:{color:"#2C5444",fontSize:12,fontWeight:"800",marginTop:4},
  kpiCaption:{color:"#899E94",fontSize:10,marginTop:6},
  dashboardRow:{flexDirection:"row",alignItems:"stretch",gap:13,marginBottom:26},
  dashboardStack:{flexDirection:"column"},
  panel:{backgroundColor:"#FFFFFF",borderRadius:17,borderWidth:1,borderColor:"#E0ECE5",padding:20,minWidth:0},
  panelHeading:{fontSize:17,color:"#173C30",fontWeight:"900"},
  approvalPanel:{width:290,maxWidth:"100%"},
  approvalPanelMobile:{width:"100%"},
  tabRow:{alignSelf:"flex-start",flexDirection:"row",flexWrap:"wrap",gap:5,backgroundColor:"#F0F6F1",borderRadius:11,padding:4,marginVertical:16},
  tab:{borderRadius:8,paddingHorizontal:12,paddingVertical:9},
  tabActive:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#D7E8DD"},
  tabText:{fontSize:11,fontWeight:"700",color:"#67857A"},
  tabTextActive:{color:"#067C61",fontWeight:"800"},
  barItem:{marginBottom:16,gap:8},
  barHeading:{flexDirection:"row",justifyContent:"space-between",gap:12},
  barTitle:{fontSize:12,color:"#395A4E",fontWeight:"700"},
  barValue:{fontSize:11,color:"#164E3E",fontWeight:"900"},
  barTrack:{height:12,borderRadius:9,backgroundColor:"#EAF2EB",overflow:"hidden"},
  barFill:{height:"100%",borderRadius:9},
  footnote:{color:"#84998E",fontSize:10,lineHeight:16,marginTop:2},
  inlineWarning:{fontSize:11,color:"#A36520",lineHeight:17,marginTop:3},
  percent:{fontSize:40,letterSpacing:-1,fontWeight:"900",color:"#0C8969",marginTop:20,marginBottom:10},
  divider:{height:1,backgroundColor:"#E3EFE9",marginVertical:20},
  guidance:{flexDirection:"row",gap:9,backgroundColor:"#F1F9F4",borderRadius:11,padding:11},
  guidanceText:{flex:1,fontSize:10,lineHeight:17,color:"#467261"},
  actionLink:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:18},
  actionLinkText:{fontSize:11,fontWeight:"800",color:"#0B8466"},
  actionsGrid:{flexDirection:"row",gap:12,flexWrap:"wrap"},
  actionCard:{flexBasis:250,flexGrow:1,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DDEAE3",borderRadius:14,padding:15,minHeight:96,flexDirection:"row",alignItems:"center",gap:12},
  actionIcon:{width:41,height:41,borderRadius:11,backgroundColor:"#E5F6EE",alignItems:"center",justifyContent:"center"},
  actionTitle:{fontSize:13,fontWeight:"900",color:"#1B4435"},actionDescription:{fontSize:10,color:"#7A9586",marginTop:4,lineHeight:17},
  footer:{fontSize:10,color:"#9AAEA2",textAlign:"center",marginTop:29,lineHeight:17},
});
