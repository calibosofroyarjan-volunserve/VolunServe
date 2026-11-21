import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { communitySocialRequest, philippinesTime, type CommunityConversation } from "../../lib/communitySocial";

const GREEN="#087F68";
export default function CommunityInbox() {
  const router=useRouter();
  const {width}=useWindowDimensions();
  const compact=width<760;
  const [conversations,setConversations]=useState<CommunityConversation[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const refresh=useCallback(async()=>{
    try {
      const data=await communitySocialRequest<{conversations:CommunityConversation[]}>("/api/community/chats");
      setConversations(Array.isArray(data.conversations)?data.conversations:[]);
      setError("");
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not load messages.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),18000);
    return()=>clearInterval(timer);},[refresh]);
  return <ScrollView style={styles.screen} contentContainerStyle={[styles.page,compact&&styles.mobilePage]}>
    <View style={styles.shell}>
      <Pressable onPress={()=>router.push("/(tabs)")} style={styles.back}>
        <Ionicons name="arrow-back" size={18} color={GREEN}/>
        <Text style={styles.backText}>Back to Home</Text>
      </Pressable>
      <View style={[styles.header,compact&&styles.mobileHeader]}>
        <View style={{flex:1,minWidth:0}}>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.subtitle}>Private conversations with approved community members.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={()=>void refresh()} style={styles.refresh}>
          <Ionicons name="refresh-outline" size={17} color={GREEN}/><Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>
      <View style={styles.panel}>
        <View style={styles.panelHeading}>
          <Ionicons name="chatbubbles-outline" size={20} color={GREEN}/>
          <Text style={styles.panelTitle}>Your Conversations</Text>
        </View>
        {loading?<View style={styles.empty}><ActivityIndicator color={GREEN}/><Text style={styles.emptyText}>Loading conversations...</Text></View>:
          error?<View style={styles.empty}><Ionicons name="cloud-offline-outline" size={25} color="#96A79E"/>
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable onPress={()=>void refresh()} style={styles.action}><Text style={styles.actionText}>Retry</Text></Pressable>
          </View>:
          conversations.length?conversations.map(c=><Pressable key={c.peer.key} accessibilityRole="button"
            onPress={()=>router.push({pathname:"/(tabs)/community-chat",params:{member:c.peer.key}} as Href)}
            style={styles.thread}>
            {c.peer.avatarUrl?<Image source={{uri:c.peer.avatarUrl}} style={styles.avatar}/>:
              <View style={styles.fallback}><Text style={styles.initial}>{c.peer.name.charAt(0).toUpperCase()}</Text></View>}
            <View style={styles.threadText}>
              <Text style={styles.name} numberOfLines={1}>{c.peer.name}</Text>
              <Text style={styles.role} numberOfLines={1}>{c.peer.badge||"Community Member"}</Text>
              <Text style={styles.preview} numberOfLines={1}>{c.lastSenderIsMe?"You: ":""}{c.lastMessage||"Start a conversation"}</Text>
            </View>
            <View style={styles.dateSection}>
              {c.lastMessageAt?<Text style={styles.date} numberOfLines={2}>{philippinesTime(c.lastMessageAt)}</Text>:null}
              <Ionicons name="chevron-forward" size={18} color="#8EA89C"/>
            </View>
          </Pressable>):
          <View style={styles.empty}><Ionicons name="chatbubble-ellipses-outline" size={36} color="#8EB5A6"/>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyText}>Open Community Members and select Message to start a private chat. Members can receive messages even while offline.</Text>
            <Pressable onPress={()=>router.push("/(tabs)")} style={styles.action}>
              <Text style={styles.actionText}>Browse Community Members</Text>
            </Pressable>
          </View>}
      </View>
      <View style={styles.privacy}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#648A7D"/>
        <Text style={styles.privacyText}>Messages are visible only to the two conversation participants through authenticated access. Chat is not an official emergency response channel. For emergencies, use Emergency Reports or the official hotline.</Text>
      </View>
    </View>
  </ScrollView>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#F5F9F7"},
  page:{paddingVertical:22,paddingHorizontal:20,alignItems:"center"},
  mobilePage:{paddingVertical:14,paddingHorizontal:11},
  shell:{width:"100%",maxWidth:980,gap:17},
  back:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:8,padding:8},
  backText:{fontWeight:"700",color:GREEN,fontSize:12},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:14},
  mobileHeader:{flexWrap:"wrap"},
  title:{fontSize:26,fontWeight:"800",color:"#143E31"},
  subtitle:{fontSize:12,color:"#6A887E",marginTop:5},
  refresh:{flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:13,paddingVertical:10,
    borderRadius:9,backgroundColor:"#E9F6F0"},
  refreshText:{fontSize:12,color:GREEN,fontWeight:"800"},
  panel:{backgroundColor:"white",borderWidth:1,borderColor:"#DCEAE3",borderRadius:16,padding:17},
  panelHeading:{flexDirection:"row",alignItems:"center",gap:9,marginBottom:12},
  panelTitle:{fontSize:16,fontWeight:"800",color:"#194436"},
  thread:{flexDirection:"row",alignItems:"center",gap:13,paddingVertical:16,
    paddingHorizontal:9,borderBottomWidth:1,borderBottomColor:"#E9F0EC"},
  avatar:{width:52,height:52,borderRadius:26},
  fallback:{width:52,height:52,borderRadius:26,backgroundColor:"#27765C",alignItems:"center",justifyContent:"center"},
  initial:{color:"white",fontWeight:"800",fontSize:22},
  threadText:{flex:1,minWidth:0,gap:4},
  name:{fontWeight:"800",fontSize:14,color:"#1C4437"},
  role:{fontSize:10,color:"#0B8A65",fontWeight:"700"},
  preview:{fontSize:12,color:"#657F74"},
  dateSection:{maxWidth:118,flexDirection:"row",alignItems:"center",gap:6},
  date:{fontSize:10,color:"#8A9D94",textAlign:"right",flexShrink:1},
  empty:{minHeight:210,padding:22,alignItems:"center",justifyContent:"center",gap:10},
  emptyTitle:{fontWeight:"800",fontSize:16,color:"#2F594A"},
  emptyText:{textAlign:"center",fontSize:12,lineHeight:19,color:"#70897F"},
  action:{paddingHorizontal:15,paddingVertical:11,backgroundColor:"#E8F5EE",borderRadius:8,marginTop:5},
  actionText:{fontWeight:"800",fontSize:12,color:GREEN},
  privacy:{flexDirection:"row",alignItems:"flex-start",gap:10,padding:15,
    backgroundColor:"#EFF6F1",borderRadius:12},
  privacyText:{fontSize:11.5,lineHeight:18,color:"#607C70",flex:1},
});
