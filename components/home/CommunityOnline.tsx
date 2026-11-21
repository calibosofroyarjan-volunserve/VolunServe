import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { auth } from "../../lib/firebase";

type Mode = "resident" | "volunteer";
export type Member = {
  key: string; name: string; avatarUrl?: string; mode: Mode;
  verified: boolean; badge: "Basic Resident" | "Verified Resident" | "Volunteer"; online: true;
};
type Filter = "all" | Mode;
const API = "https://volunserve.onrender.com";
const GREEN = "#087D62";
async function authorizedRequest(path:string, method:"GET"|"POST"="GET", body?:object) {
  const user=auth.currentUser;
  if(!user)throw new Error("Please sign in to view community members.");
  const token=await user.getIdToken();
  const response=await fetch(API+path,{
    method,headers:{"Authorization":`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  const payload=await response.json();
  if(!response.ok||!payload.ok)throw new Error(payload.message||"Community status unavailable.");
  return payload;
}
const Avatar=({person,size=54}:{person:Member;size?:number})=>{
  const [failed,setFailed]=useState(false);
  return <View style={{width:size,height:size}}>
    {person.avatarUrl&&!failed ? <Image source={{uri:person.avatarUrl}}
      onError={()=>setFailed(true)} style={{width:size,height:size,borderRadius:size/2}}/> :
      <View style={[styles.avatarFallback,{width:size,height:size,borderRadius:size/2}]}>
        <Text style={styles.avatarInitial}>{person.name.slice(0,1).toUpperCase()}</Text>
      </View>}
    <View style={styles.onlineDot}/>
  </View>;
};
export default function CommunityOnline({uid}:{uid?:string|null}) {
  const router=useRouter();
  const {width}=useWindowDimensions();
  const compact=width<760;
  const [members,setMembers]=useState<Member[]>([]);
  const [filter,setFilter]=useState<Filter>("all");
  const [expanded,setExpanded]=useState(false);
  const [visible,setVisible]=useState(false);
  const [settingLoading,setSettingLoading]=useState(true);
  const [switching,setSwitching]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{
    if(!uid){setLoading(false);setMembers([]);return;}
    try {
      const payload=await authorizedRequest("/api/community/presence");
      setMembers(Array.isArray(payload.members)?payload.members:[]);
      setError("");
    } catch(reason){
      setError(reason instanceof Error?reason.message:"Unable to load online members.");
    } finally {setLoading(false);}
  },[uid]);
  useEffect(()=>{
    let active=true;
    setSettingLoading(true);setVisible(false);
    if(!uid){setSettingLoading(false);return()=>{active=false;};}
    authorizedRequest("/api/community/presence/self")
      .then(p=>{if(active)setVisible(p.visible===true);})
      .catch(()=>{if(active)setVisible(false);})
      .finally(()=>{if(active)setSettingLoading(false);});
    return()=>{active=false;};
  },[uid]);
  useEffect(()=>{
    void load();
    if(!uid)return;
    const interval=setInterval(()=>{void load();},35000);
    return()=>clearInterval(interval);
  },[load,uid]);
  const toggle=useCallback(async()=>{
    if(switching)return;
    setSwitching(true);
    try {
      const result=await authorizedRequest("/api/community/presence/visibility","POST",{visible:!visible});
      setVisible(result.visible===true);
      await load();
      setError("");
    }catch(reason){setError(reason instanceof Error?reason.message:"Online setting unavailable.");}
    finally{setSwitching(false);}
  },[switching,visible,load]);
  const filtered=useMemo(()=>members.filter(member=>filter==="all"||member.mode===filter),[members,filter]);
  const displayed=expanded?filtered:filtered.slice(0,compact?6:9);
  const residents=members.filter(m=>m.mode==="resident").length;
  const volunteers=members.filter(m=>m.mode==="volunteer").length;
  const tabs:[Filter,string][]=[["all","All Members"],["resident","Residents"],["volunteer","Volunteers"]];
  return <View style={styles.panel}>
    <View style={[styles.headingRow,compact&&styles.mobileHeading]}>
      <View style={styles.headingCopy}>
        <View style={styles.iconBox}><Ionicons name="people-outline" size={21} color={GREEN}/></View>
        <View style={{flex:1,minWidth:0}}>
          <Text style={styles.title}>Online Members</Text>
          <Text style={styles.subtitle}>See community members who chose to appear online.</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={()=>{setExpanded(v=>!v);}}
        style={styles.viewAll}>
        <Text style={styles.viewAllText}>{expanded?"Show Less":"View All Online"}</Text>
        <Ionicons name={expanded?"chevron-up":"arrow-forward"} size={15} color={GREEN}/>
      </Pressable>
    </View>
    <View style={styles.countRow}>
      <View style={styles.countChip}><View style={styles.chipDot}/>
        <Text style={styles.countText}>{residents} Residents</Text></View>
      <View style={styles.countChip}><View style={styles.chipDot}/>
        <Text style={styles.countText}>{volunteers} Volunteers</Text></View>
    </View>
    <View style={styles.filterRow}>
      {tabs.map(([key,text])=><Pressable accessibilityRole="button"
        accessibilityState={{selected:filter===key}} key={key}
        onPress={()=>{setFilter(key);setExpanded(false);}}
        style={[styles.filter,filter===key&&styles.filterActive]}>
        <Text style={[styles.filterText,filter===key&&styles.filterTextActive]}>{text}</Text>
      </Pressable>)}
    </View>
    {loading?<View style={styles.empty}><ActivityIndicator color={GREEN}/><Text style={styles.emptyText}>Loading online members...</Text></View> :
      error?<View style={styles.empty}>
        <Ionicons name="cloud-offline-outline" size={24} color="#718C87"/>
        <Text style={styles.emptyText}>{error}</Text>
        <Pressable onPress={()=>void load()} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable>
      </View> : displayed.length ? <View style={[styles.grid,compact&&styles.gridMobile]}>
        {displayed.map(member=><Pressable key={member.key} accessibilityRole="button"
          accessibilityLabel={`View public profile of ${member.name}, ${member.badge}`}
          onPress={()=>router.push({pathname:"/(tabs)/community-member-profile",params:{member:member.key}} as Href)}
          style={[styles.memberCard,compact&&styles.memberMobile]}>
          <Avatar person={member} size={compact?47:53}/>
          <Text style={styles.memberName} numberOfLines={2}>{member.name}</Text>
          <Text style={styles.memberBadge} numberOfLines={1}>{member.badge}</Text>
          <Text style={styles.memberOnline}>● Online</Text>
        </Pressable>)}
      </View> : <View style={styles.empty}>
        <Ionicons name="people-outline" size={26} color="#9BAFA7"/>
        <Text style={styles.emptyText}>No visible {filter==="all"?"members":filter==="resident"?"residents":"volunteers"} online right now.</Text>
      </View>}
    <View style={[styles.consent,compact&&styles.consentMobile]}>
      <View style={{flex:1,minWidth:0}}>
        <Text style={styles.consentTitle}>Show my profile while online</Text>
        <Text style={styles.consentDescription}>Optional. Only your public name, photo and current Resident/Volunteer mode are shown. Turning this off hides you from the directory.</Text>
      </View>
      <Pressable accessibilityRole="switch" accessibilityState={{checked:visible,disabled:settingLoading||switching}}
        disabled={settingLoading||switching} onPress={()=>void toggle()}
        style={[styles.toggle,visible&&styles.toggleOn]}>
        <View style={[styles.toggleThumb,visible&&styles.toggleThumbOn]}/>
      </Pressable>
    </View>
  </View>;
}
const styles=StyleSheet.create({
  panel:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DFEBE7",
    borderRadius:18,padding:18,gap:13},
  headingRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},
  mobileHeading:{flexWrap:"wrap"},
  headingCopy:{flexDirection:"row",alignItems:"center",gap:12,flex:1,minWidth:0},
  iconBox:{backgroundColor:"#E5F7F1",height:42,width:42,borderRadius:21,alignItems:"center",justifyContent:"center"},
  title:{color:"#153D35",fontSize:17,fontWeight:"800"},
  subtitle:{color:"#69847D",fontSize:11.5,marginTop:5,lineHeight:17},
  viewAll:{flexDirection:"row",alignItems:"center",gap:6,padding:9},
  viewAllText:{color:GREEN,fontSize:11,fontWeight:"800"},
  countRow:{flexDirection:"row",flexWrap:"wrap",gap:9},
  countChip:{flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:10,paddingVertical:6,
    backgroundColor:"#F1F8F5",borderRadius:9},
  chipDot:{width:7,height:7,borderRadius:4,backgroundColor:"#0DBB78"},
  countText:{fontSize:11,color:"#42695E",fontWeight:"700"},
  filterRow:{flexDirection:"row",gap:7,flexWrap:"wrap",borderBottomWidth:1,borderBottomColor:"#EDF2F0",paddingBottom:12},
  filter:{paddingHorizontal:12,paddingVertical:9,borderRadius:8,backgroundColor:"#F3F6F5"},
  filterActive:{backgroundColor:GREEN},
  filterText:{fontSize:11,fontWeight:"700",color:"#59736D"},
  filterTextActive:{color:"#FFFFFF"},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:10},
  gridMobile:{gap:7},
  memberCard:{flexBasis:"15%",flexGrow:1,minWidth:134,maxWidth:220,backgroundColor:"#F9FCFA",
    borderWidth:1,borderColor:"#E4EEE9",borderRadius:12,paddingVertical:14,paddingHorizontal:7,
    alignItems:"center",gap:6},
  memberMobile:{minWidth:96,flexBasis:"29%",paddingVertical:10,paddingHorizontal:4},
  avatarFallback:{backgroundColor:"#2B765F",alignItems:"center",justifyContent:"center"},
  avatarInitial:{fontSize:22,fontWeight:"800",color:"white"},
  onlineDot:{position:"absolute",right:0,bottom:1,width:13,height:13,borderRadius:7,
    backgroundColor:"#0DBB78",borderWidth:2,borderColor:"white"},
  memberName:{fontSize:11.5,lineHeight:16,fontWeight:"800",color:"#23443C",textAlign:"center",minHeight:32},
  memberBadge:{fontSize:9.2,color:"#607D72",fontWeight:"700",textAlign:"center"},
  memberOnline:{fontSize:9.5,color:"#078456",fontWeight:"800"},
  empty:{alignItems:"center",justifyContent:"center",minHeight:126,gap:9,padding:15},
  emptyText:{textAlign:"center",fontSize:12,color:"#748A83",lineHeight:18},
  retry:{padding:9},retryText:{color:GREEN,fontWeight:"800",fontSize:12},
  consent:{marginTop:4,padding:13,backgroundColor:"#F2F9F6",borderRadius:11,
    flexDirection:"row",alignItems:"center",gap:15},
  consentMobile:{padding:11},
  consentTitle:{fontSize:12,fontWeight:"800",color:"#235046"},
  consentDescription:{fontSize:10.5,lineHeight:16,color:"#67847A",marginTop:5},
  toggle:{width:49,height:27,backgroundColor:"#CDDAD4",borderRadius:15,padding:3,justifyContent:"center"},
  toggleOn:{backgroundColor:GREEN},
  toggleThumb:{width:21,height:21,borderRadius:11,backgroundColor:"white"},
  toggleThumbOn:{alignSelf:"flex-end"},
});
