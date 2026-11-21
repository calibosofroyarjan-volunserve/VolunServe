import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { communitySocialRequest, memberLastSeen, type CommunityMember } from "../../lib/communitySocial";

type Mode = "resident" | "volunteer";
type Member = CommunityMember;
type Filter = "all" | Mode | "online" | "offline";
const GREEN = "#087D62";
const Avatar=({person,size=54}:{person:Member;size?:number})=>{
  const [failed,setFailed]=useState(false);
  return <View style={{width:size,height:size}}>
    {person.avatarUrl&&!failed ? <Image source={{uri:person.avatarUrl}}
      onError={()=>setFailed(true)} style={{width:size,height:size,borderRadius:size/2}}/> :
      <View style={[styles.avatarFallback,{width:size,height:size,borderRadius:size/2}]}>
        <Text style={styles.avatarInitial}>{person.name.slice(0,1).toUpperCase()}</Text>
      </View>}
    <View style={[styles.onlineDot,!person.online&&styles.offlineDot]}/>
  </View>;
};
export default function CommunityOnline({uid}:{uid?:string|null}) {
  const router=useRouter();
  const {width}=useWindowDimensions();
  const compact=width<760;
  const [members,setMembers]=useState<Member[]>([]);
  const [filter,setFilter]=useState<Filter>("all");
  const [expanded,setExpanded]=useState(false);
  const [pageSize,setPageSize]=useState(24);
  const [search,setSearch]=useState("");
  const [directoryListed,setDirectoryListed]=useState(false);
  const [visible,setVisible]=useState(false);
  const [showLastSeen,setShowLastSeen]=useState(false);
  const [acceptChats,setAcceptChats]=useState(false);
  const [settingLoading,setSettingLoading]=useState(true);
  const [switching,setSwitching]=useState(false);
  const [savingPreference,setSavingPreference]=useState<""|"showLastSeen"|"acceptChats"|"directoryListed">("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{
    if(!uid){setLoading(false);setMembers([]);return;}
    try {
      const payload=await communitySocialRequest<{members:Member[]}>("/api/community/directory");
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
    communitySocialRequest<{visible:boolean;showLastSeen:boolean;acceptChats:boolean;directoryListed:boolean}>("/api/community/directory/self")
      .then(p=>{if(active){setVisible(p.visible===true);setDirectoryListed(p.directoryListed===true);setShowLastSeen(p.showLastSeen===true);setAcceptChats(p.acceptChats===true);}})
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
      const result=await communitySocialRequest<{visible:boolean}>("/api/community/presence/visibility","POST",{visible:!visible});
      setVisible(result.visible===true);
      await load();
      setError("");
    }catch(reason){setError(reason instanceof Error?reason.message:"Online setting unavailable.");}
    finally{setSwitching(false);}
  },[switching,visible,load]);
  const updatePreference=useCallback(async(key:"showLastSeen"|"acceptChats"|"directoryListed")=>{
    if(savingPreference)return;
    setSavingPreference(key);
    const next=key==="showLastSeen"?!showLastSeen:key==="directoryListed"?!directoryListed:!acceptChats;
    try {
      await communitySocialRequest("/api/community/directory/preferences","POST",{[key]:next});
      if(key==="showLastSeen")setShowLastSeen(next);
      else if(key==="directoryListed")setDirectoryListed(next);
      else setAcceptChats(next);
      setError("");await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"Cannot save privacy setting.");}
    finally{setSavingPreference("");}
  },[showLastSeen,acceptChats,directoryListed,savingPreference,load]);
  const filtered=useMemo(()=>members.filter(member=>{
    const byRole=filter==="all"||(filter==="online"&&member.online)||
      (filter==="offline"&&!member.online)||member.mode===filter;
    const term=search.trim().toLowerCase();
    return byRole&&(!term||member.name.toLowerCase().includes(term)||
      member.badge.toLowerCase().includes(term));
  }),[members,filter,search]);
  const displayed=filtered.slice(0,expanded?pageSize:compact?6:9);
  const residents=members.filter(m=>m.online&&m.mode==="resident").length;
  const volunteers=members.filter(m=>m.online&&m.mode==="volunteer").length;
  const tabs:[Filter,string][]=[["all","All Members"],["resident","Residents"],["volunteer","Volunteers"],["online","Online"],["offline","Offline"]];
  return <View style={styles.panel}>
    <View style={[styles.headingRow,compact&&styles.mobileHeading]}>
      <View style={styles.headingCopy}>
        <View style={styles.iconBox}><Ionicons name="people-outline" size={21} color={GREEN}/></View>
        <View style={{flex:1,minWidth:0}}>
          <Text style={styles.title}>Community Members</Text>
          <Text style={styles.subtitle}>Approved members who opted in to public profiles, including offline residents and volunteers.</Text>
        </View>
      </View>
      <View style={styles.headingActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open private message inbox"
          onPress={()=>router.push("/(tabs)/community-inbox" as Href)} style={styles.viewAll}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={GREEN}/>
          <Text style={styles.viewAllText}>Inbox</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={()=>{setExpanded(v=>!v);setPageSize(24);}} style={styles.viewAll}>
          <Text style={styles.viewAllText}>{expanded?"Show Fewer":"View All Members"}</Text>
          <Ionicons name={expanded?"chevron-up":"arrow-forward"} size={15} color={GREEN}/>
        </Pressable>
      </View>
    </View>
    <View style={styles.countRow}>
      <View style={styles.countChip}><Ionicons name="people-outline" size={13} color={GREEN}/>
        <Text style={styles.countText}>{members.length} Listed Members</Text></View>
      <View style={styles.countChip}><View style={styles.chipDot}/>
        <Text style={styles.countText}>{residents} Residents</Text></View>
      <View style={styles.countChip}><View style={styles.chipDot}/>
        <Text style={styles.countText}>{volunteers} Volunteers</Text></View>
    </View>
    <View style={styles.searchRow}>
      <Ionicons name="search-outline" size={17} color="#68867B"/>
      <TextInput value={search} onChangeText={value=>{setSearch(value);setPageSize(24);}}
        placeholder="Search members by name or role" placeholderTextColor="#899E95"
        accessibilityLabel="Search community members" autoCapitalize="none"
        style={styles.searchInput}/>
      {Boolean(search)&&<Pressable accessibilityRole="button" accessibilityLabel="Clear member search"
        onPress={()=>setSearch("")}><Ionicons name="close-circle" size={18} color="#81978C"/></Pressable>}
    </View>
    <View style={styles.filterRow}>
      {tabs.map(([key,text])=><Pressable accessibilityRole="button"
        accessibilityState={{selected:filter===key}} key={key}
        onPress={()=>{setFilter(key);setPageSize(24);}}
        style={[styles.filter,filter===key&&styles.filterActive]}>
        <Text style={[styles.filterText,filter===key&&styles.filterTextActive]}>{text}</Text>
      </Pressable>)}
    </View>
    {loading?<View style={styles.empty}><ActivityIndicator color={GREEN}/><Text style={styles.emptyText}>Loading community members...</Text></View> :
      error?<View style={styles.empty}>
        <Ionicons name="cloud-offline-outline" size={24} color="#718C87"/>
        <Text style={styles.emptyText}>{error}</Text>
        <Pressable onPress={()=>void load()} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable>
      </View> : displayed.length ? <View style={[styles.grid,compact&&styles.gridMobile]}>
        {displayed.map(member=><View key={member.key} style={[styles.memberCard,compact&&styles.memberMobile]}>
          <Pressable accessibilityRole="button"
            accessibilityLabel={`View profile of ${member.name}, ${member.badge}`}
            onPress={()=>member.isSelf?router.push("/profile"):
              router.push({pathname:"/(tabs)/community-member-profile",params:{member:member.key}} as Href)}
            style={styles.memberMain}>
            <Avatar person={member} size={compact?47:53}/>
            <Text style={styles.memberName} numberOfLines={2}>{member.name}</Text>
            <Text style={styles.memberBadge} numberOfLines={1}>{member.badge}</Text>
            <Text style={[styles.memberOnline,!member.online&&styles.memberOffline]} numberOfLines={2}>
              {memberLastSeen(member)}
            </Text>
          </Pressable>
          {member.isSelf?<Text style={styles.ownBadge}>Your profile</Text>:
            <Pressable accessibilityRole="button" accessibilityLabel={`Chat with ${member.name}`}
              disabled={!acceptChats||!(visible||directoryListed)||!member.acceptChats}
              onPress={()=>router.push({pathname:"/(tabs)/community-chat",params:{member:member.key}} as Href)}
              style={[styles.chatButton,(!acceptChats||!(visible||directoryListed)||!member.acceptChats)&&styles.chatDisabled]}>
              <Ionicons name="chatbubble-outline" size={13}
                color={(!acceptChats||!(visible||directoryListed)||!member.acceptChats)?"#879D94":GREEN}/>
              <Text style={[styles.chatText,(!acceptChats||!(visible||directoryListed)||!member.acceptChats)&&styles.chatTextDisabled]}>
                {member.acceptChats?"Chat":"Chat Off"}
              </Text>
            </Pressable>}
        </View>)}
      </View> : <View style={styles.empty}>
        <Ionicons name="people-outline" size={26} color="#9BAFA7"/>
        <Text style={styles.emptyText}>No public members match these filters. Try another search or invite members to opt in.</Text>
      </View>}
    {expanded&&displayed.length<filtered.length&&<Pressable accessibilityRole="button"
      onPress={()=>setPageSize(n=>n+24)} style={styles.showMore}>
      <Text style={styles.showMoreText}>Show More Members ({filtered.length-displayed.length} remaining)</Text>
      <Ionicons name="chevron-down" size={16} color={GREEN}/>
    </Pressable>}
    <View style={[styles.consent,compact&&styles.consentMobile]}>
      <View style={{flex:1,minWidth:0}}>
        <Text style={styles.consentTitle}>Show my profile while online</Text>
        <Text style={styles.consentDescription}>Optional. Display your public name, photo and active Resident/Volunteer mode while online.</Text>
      </View>
      <Pressable accessibilityRole="switch" accessibilityState={{checked:visible,disabled:settingLoading||switching}}
        disabled={settingLoading||switching} onPress={()=>void toggle()}
        style={[styles.toggle,visible&&styles.toggleOn]}>
        <View style={[styles.toggleThumb,visible&&styles.toggleThumbOn]}/>
      </Pressable>
    </View>
    <View style={styles.directoryChoice}>
      <View style={styles.privacyOptionCopy}>
        <Text style={styles.consentTitle}>Keep my profile in Members Directory</Text>
        <Text style={styles.consentDescription}>
          Optional. Keep your public name, photo and account badge visible even while offline.
          You can turn this off anytime. Private email, phone, address and identity documents remain hidden.
        </Text>
      </View>
      <Pressable accessibilityRole="switch" accessibilityLabel="Keep my profile in Members Directory"
        accessibilityState={{checked:directoryListed,disabled:settingLoading||Boolean(savingPreference)}}
        disabled={settingLoading||Boolean(savingPreference)}
        onPress={()=>void updatePreference("directoryListed")}
        style={[styles.toggle,directoryListed&&styles.toggleOn]}>
        <View style={[styles.toggleThumb,directoryListed&&styles.toggleThumbOn]}/>
      </Pressable>
    </View>
    <View style={styles.privacyGrid}>
      <View style={styles.privacyOption}>
        <View style={styles.privacyOptionCopy}>
          <Text style={styles.consentTitle}>Share Last Seen</Text>
          <Text style={styles.consentDescription}>Optional. Show when you were last active after going offline.</Text>
        </View>
        <Pressable accessibilityRole="switch" accessibilityLabel="Share Last Seen"
          accessibilityState={{checked:showLastSeen,disabled:settingLoading||Boolean(savingPreference)}}
          disabled={settingLoading||Boolean(savingPreference)} onPress={()=>void updatePreference("showLastSeen")}
          style={[styles.toggle,showLastSeen&&styles.toggleOn]}>
          <View style={[styles.toggleThumb,showLastSeen&&styles.toggleThumbOn]}/>
        </Pressable>
      </View>
      <View style={styles.privacyOption}>
        <View style={styles.privacyOptionCopy}>
          <Text style={styles.consentTitle}>Allow Private Messages</Text>
          <Text style={styles.consentDescription}>Optional. Members who also allow chat can message you.</Text>
        </View>
        <Pressable accessibilityRole="switch" accessibilityLabel="Allow Private Messages"
          accessibilityState={{checked:acceptChats,disabled:settingLoading||Boolean(savingPreference)}}
          disabled={settingLoading||Boolean(savingPreference)} onPress={()=>void updatePreference("acceptChats")}
          style={[styles.toggle,acceptChats&&styles.toggleOn]}>
          <View style={[styles.toggleThumb,acceptChats&&styles.toggleThumbOn]}/>
        </Pressable>
      </View>
    </View>
    {(!(visible||directoryListed)||!acceptChats)&&<Text style={styles.chatHint}>
      To chat, enable your online profile or directory listing, plus Private Messages. The recipient must also allow chat.
    </Text>}
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
  headingActions:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:7},
  viewAll:{flexDirection:"row",alignItems:"center",gap:6,padding:9},
  viewAllText:{color:GREEN,fontSize:11,fontWeight:"800"},
  countRow:{flexDirection:"row",flexWrap:"wrap",gap:9},
  searchRow:{flexDirection:"row",alignItems:"center",gap:9,paddingHorizontal:13,
    backgroundColor:"#F8FBF9",borderWidth:1,borderColor:"#DEEBE5",borderRadius:10,minHeight:44},
  searchInput:{fontSize:12,color:"#274F40",flex:1,minHeight:43,paddingVertical:9},
  showMore:{alignSelf:"center",paddingHorizontal:16,paddingVertical:11,borderRadius:9,
    backgroundColor:"#ECF7F1",flexDirection:"row",alignItems:"center",gap:7},
  showMoreText:{fontSize:11.5,fontWeight:"800",color:GREEN},
  directoryChoice:{padding:13,backgroundColor:"#F6FAF8",borderRadius:11,
    borderWidth:1,borderColor:"#DDEAE2",flexDirection:"row",alignItems:"center",gap:15},
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
  memberMobile:{minWidth:120,flexBasis:"47%",paddingVertical:10,paddingHorizontal:6},
  memberMain:{alignItems:"center",gap:6,width:"100%"},
  memberOffline:{color:"#7E938A"},
  offlineDot:{backgroundColor:"#9AAFAA"},
  ownBadge:{color:"#8AA69C",fontWeight:"700",fontSize:10,marginTop:4},
  chatButton:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6,
    backgroundColor:"#E8F6F0",borderRadius:8,paddingHorizontal:12,paddingVertical:9,marginTop:6,width:"100%"},
  chatDisabled:{backgroundColor:"#F0F4F2"},
  chatText:{color:GREEN,fontSize:11,fontWeight:"800"},
  chatTextDisabled:{color:"#879D94"},
  privacyGrid:{flexDirection:"row",gap:10,flexWrap:"wrap"},
  privacyOption:{flexGrow:1,flexBasis:"46%",minWidth:240,backgroundColor:"#F6FAF8",borderRadius:11,
    padding:12,flexDirection:"row",alignItems:"center",gap:12,borderWidth:1,borderColor:"#E5EFEA"},
  privacyOptionCopy:{flex:1,minWidth:0},
  chatHint:{fontSize:10.5,color:"#7C9189",lineHeight:16},
  avatarFallback:{backgroundColor:"#2B765F",alignItems:"center",justifyContent:"center"},
  avatarInitial:{fontSize:22,fontWeight:"800",color:"white"},
  onlineDot:{position:"absolute",right:0,bottom:1,width:13,height:13,borderRadius:7,
    backgroundColor:"#0DBB78",borderWidth:2,borderColor:"white"},
  memberName:{fontSize:11.5,lineHeight:16,fontWeight:"800",color:"#23443C",textAlign:"center",minHeight:32},
  memberBadge:{fontSize:9.2,color:"#607D72",fontWeight:"700",textAlign:"center"},
  memberOnline:{fontSize:9.5,color:"#078456",fontWeight:"800",textAlign:"center",lineHeight:13},
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
