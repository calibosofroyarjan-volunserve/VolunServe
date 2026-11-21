import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { auth } from "../../lib/firebase";

type Member = {
  key:string; name:string; avatarUrl?:string; mode:"resident"|"volunteer";
  verified:boolean; badge:string; online:boolean;
};
export default function CommunityMemberProfile() {
  const router=useRouter();
  const {width}=useWindowDimensions();
  const compact=width<760;
  const {member:raw}=useLocalSearchParams<{member?:string}>();
  const member=typeof raw==="string"?raw:"";
  const [data,setData]=useState<Member|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let alive=true;
    setLoading(true);setData(null);setError("");
    if(!/^[a-f0-9]{24}$/.test(member)){
      setLoading(false);setError("Invalid community profile link.");
      return()=>{alive=false;};
    }
    const fetchProfile=async()=>{
      try {
        const user=auth.currentUser;
        if(!user)throw new Error("Sign in to view public member profiles.");
        const token=await user.getIdToken();
        const response=await fetch(
          `https://volunserve.onrender.com/api/community/members/${encodeURIComponent(member)}`,
          {headers:{Authorization:`Bearer ${token}`}},
        );
        const result=await response.json();
        if(!response.ok||!result.ok)throw new Error(result.message||"Profile unavailable.");
        if(alive)setData(result.member);
      }catch(reason){if(alive)setError(reason instanceof Error?reason.message:"Profile unavailable.");}
      finally{if(alive)setLoading(false);}
    };
    void fetchProfile();
    return()=>{alive=false;};
  },[member]);
  const back=()=>router.canGoBack()?router.back():router.replace("/(tabs)");
  return <ScrollView style={styles.screen} contentContainerStyle={[styles.page,compact&&styles.pageMobile]}>
    <View style={styles.shell}>
      <Pressable accessibilityRole="button" onPress={back} style={styles.back}>
        <Ionicons name="arrow-back" size={18} color="#087F68"/>
        <Text style={styles.backText}>Back to Community Online</Text>
      </Pressable>
      <View style={styles.header}>
        <Text style={styles.title}>Community Member Profile</Text>
        <Text style={styles.subtitle}>Verified presence and voluntary public details</Text>
      </View>
      {loading?<View style={styles.feedback}><ActivityIndicator color="#087F68"/>
        <Text style={styles.message}>Loading public profile...</Text></View>:
        error?<View style={styles.feedback}>
          <Ionicons name="information-circle-outline" size={34} color="#78958A"/>
          <Text style={styles.message}>{error}</Text>
          <Pressable onPress={back} style={styles.returnButton}><Text style={styles.returnText}>Return to Home</Text></Pressable>
        </View>:
        data?<><View style={styles.profileCard}>
          <View style={styles.cover}><Text style={styles.coverBrand}>VolunServe</Text></View>
          <View style={[styles.profileBody,compact&&styles.profileMobile]}>
            {data.avatarUrl?<Image source={{uri:data.avatarUrl}} style={styles.avatar}/>:
              <View style={styles.avatarFallback}>
                <Text style={styles.initial}>{data.name.charAt(0).toUpperCase()}</Text>
              </View>}
            <View style={styles.identity}>
              <Text style={styles.name}>{data.name}</Text>
              <View style={styles.badges}>
                <View style={styles.roleBadge}>
                  <Ionicons name={data.mode==="volunteer"?"heart-outline":"people-outline"} size={14} color="#087F68"/>
                  <Text style={styles.roleText}>{data.badge}</Text>
                </View>
                <View style={styles.onlineBadge}><View style={styles.onlineDot}/>
                  <Text style={styles.onlineText}>Online</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.infoCard}>
          <View style={styles.infoHeading}><Ionicons name="person-circle-outline" size={21} color="#087F68"/>
            <Text style={styles.infoTitle}>Public Information</Text></View>
          <View style={styles.row}><Text style={styles.label}>Name</Text><Text style={styles.value}>{data.name}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Current Mode</Text><Text style={styles.value}>{data.mode==="volunteer"?"Volunteer":"Resident"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Account Badge</Text><Text style={styles.value}>{data.badge}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Presence</Text><Text style={styles.value}>Online · Opted in</Text></View>
        </View>
        <View style={styles.privacy}>
          <Ionicons name="shield-checkmark-outline" size={19} color="#567E71"/>
          <Text style={styles.privacyText}>This user chose to appear online. Private email, phone number, home address, identity documents, location, and attendance records are not shared. Their profile disappears from this directory when they opt out or disconnect.</Text>
        </View>
        </>:null}
    </View>
  </ScrollView>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#F4F9F6"},
  page:{paddingHorizontal:22,paddingTop:22,paddingBottom:45,alignItems:"center"},
  pageMobile:{paddingHorizontal:12,paddingTop:15},
  shell:{width:"100%",maxWidth:1000,gap:16},
  back:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:8,paddingVertical:8},
  backText:{fontSize:12,fontWeight:"800",color:"#087F68"},
  header:{gap:5},title:{fontSize:26,fontWeight:"800",color:"#193E34"},
  subtitle:{fontSize:12,color:"#658276"},
  profileCard:{backgroundColor:"white",borderRadius:15,borderWidth:1,borderColor:"#DCE9E3",overflow:"hidden"},
  cover:{height:112,backgroundColor:"#06503E",alignItems:"flex-end",padding:23},
  coverBrand:{fontSize:20,fontWeight:"900",color:"#A9DDC8"},
  profileBody:{flexDirection:"row",alignItems:"center",paddingHorizontal:25,paddingBottom:19,gap:21},
  profileMobile:{flexDirection:"column",alignItems:"flex-start",gap:8,paddingHorizontal:15},
  avatar:{width:108,height:108,borderRadius:54,borderWidth:4,borderColor:"white",marginTop:-43},
  avatarFallback:{width:108,height:108,borderRadius:54,borderWidth:4,borderColor:"white",marginTop:-43,
    backgroundColor:"#2E765E",alignItems:"center",justifyContent:"center"},
  initial:{fontSize:40,fontWeight:"800",color:"white"},
  identity:{flex:1,gap:9,minWidth:0,paddingTop:7},
  name:{fontSize:23,fontWeight:"800",color:"#193D34"},
  badges:{flexDirection:"row",flexWrap:"wrap",gap:9},
  roleBadge:{backgroundColor:"#E9F7F0",padding:9,borderRadius:8,flexDirection:"row",alignItems:"center",gap:7},
  roleText:{fontSize:11,fontWeight:"800",color:"#09795D"},
  onlineBadge:{backgroundColor:"#F1F8F4",paddingHorizontal:11,paddingVertical:8,
    borderRadius:8,flexDirection:"row",alignItems:"center",gap:7},
  onlineDot:{width:8,height:8,borderRadius:4,backgroundColor:"#0EBA78"},
  onlineText:{fontSize:11,fontWeight:"800",color:"#087B55"},
  infoCard:{padding:20,backgroundColor:"white",borderWidth:1,borderColor:"#DDE8E1",borderRadius:14,gap:12},
  infoHeading:{flexDirection:"row",gap:8,alignItems:"center",paddingBottom:5},
  infoTitle:{fontSize:16,fontWeight:"800",color:"#1A4437"},
  row:{flexDirection:"row",justifyContent:"space-between",gap:12,paddingVertical:12,
    borderBottomWidth:1,borderBottomColor:"#ECF1EE"},
  label:{fontSize:12,color:"#66857A",flex:1},
  value:{fontSize:12,color:"#1D4739",fontWeight:"700",flex:1,textAlign:"right"},
  privacy:{backgroundColor:"#EDF6F0",borderRadius:11,padding:15,flexDirection:"row",gap:10},
  privacyText:{flex:1,fontSize:12,lineHeight:19,color:"#58776B"},
  feedback:{padding:38,backgroundColor:"white",borderWidth:1,borderColor:"#DDE8E3",
    borderRadius:14,alignItems:"center",gap:14},
  message:{textAlign:"center",fontSize:13,color:"#638277",lineHeight:21},
  returnButton:{backgroundColor:"#087F68",borderRadius:8,padding:12},
  returnText:{color:"white",fontWeight:"800",fontSize:12},
});
