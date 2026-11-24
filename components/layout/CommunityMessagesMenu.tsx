import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet,
  Text, useWindowDimensions, View,
} from "react-native";
import {
  communitySocialRequest, philippinesTime,
  type CommunityConversation,
} from "../../lib/communitySocial";

// Shared Resident/Volunteer header control. Reuses the existing authenticated
// private-chat API and never reads private chat collections from the client.
// Unread badges intentionally omitted until server-side read receipts exist.
type Props = {
  uid?: string | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  compact?: boolean;
  popupTop?: number;
};
const GREEN = "#087D62";
export default function CommunityMessagesMenu({
  uid, open, onToggle, onClose, compact = false, popupTop,
}: Props) {
  const router = useRouter();
  const {width} = useWindowDimensions();
  const [conversations, setConversations] = useState<CommunityConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const result=await communitySocialRequest<{conversations:CommunityConversation[]}>("/api/community/chats");
      setConversations(Array.isArray(result.conversations) ? result.conversations : []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load conversations.");
    } finally {
      setLoading(false);
    }
  },[uid]);

  useEffect(() => {
    setConversations([]);
    setError("");
  },[uid]);
  useEffect(() => {
    if (!open || !uid) return;
    void refresh();
    const interval=setInterval(() => {void refresh();}, 18000);
    return () => clearInterval(interval);
  },[open,uid,refresh]);

  const navigate = (href: Href) => {
    onClose();
    router.push(href);
  };
  const recent=conversations.slice(0,5);
  const small=compact || width<700;

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={open ? "Close messages" : "Open messages"}
      accessibilityState={{expanded: open}}
      disabled={!uid}
      onPress={onToggle}
      style={[styles.trigger,small&&styles.smallTrigger,open&&styles.triggerOpen]}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={small?21:23} color="#122B55"/>
    </Pressable>
    <Modal visible={open&&Boolean(uid)} transparent animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close messages menu"
          onPress={onClose} style={StyleSheet.absoluteFillObject}/>
        <View style={[styles.popover,{
          top: popupTop ?? (small?67:76),
          right: small?9:213,
          width: Math.min(small?365:375,width-18),
        }]}>
          <View style={styles.heading}>
            <View style={{flex:1,minWidth:0}}>
              <Text style={styles.title}>Messages</Text>
              <Text style={styles.subtitle}>Recent private conversations</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh messages"
              onPress={() => void refresh()} style={styles.headingAction}>
              <Ionicons name="refresh-outline" size={17} color={GREEN}/>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Close messages"
              onPress={onClose} style={styles.headingAction}>
              <Ionicons name="close-outline" size={19} color="#6B7F84"/>
            </Pressable>
          </View>
          {loading&&!conversations.length ? (
            <View style={styles.empty}>
              <ActivityIndicator color={GREEN}/>
              <Text style={styles.emptyText}>Loading conversations...</Text>
            </View>
          ) : error ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={24} color="#829A90"/>
              <Text style={styles.emptyText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => void refresh()}
                style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable>
            </View>
          ) : recent.length ? (
            <ScrollView style={styles.list} nestedScrollEnabled
              showsVerticalScrollIndicator={recent.length>=5}>
              {recent.map(conversation => (
                <Pressable key={conversation.peer.key}
                  accessibilityRole="button"
                  accessibilityLabel={"Open conversation with "+conversation.peer.name}
                  onPress={() => navigate({pathname:"/(tabs)/community-chat",
                    params:{member:conversation.peer.key}} as Href)}
                  style={styles.conversation}>
                  {conversation.peer.avatarUrl ? (
                    <Image source={{uri:conversation.peer.avatarUrl}} style={styles.avatar}/>
                  ) : (
                    <View style={styles.fallback}>
                      <Text style={styles.initial}>
                        {(conversation.peer.name||"M").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.copy}>
                    <Text style={styles.name} numberOfLines={1}>{conversation.peer.name}</Text>
                    <Text style={styles.preview} numberOfLines={1}>
                      {conversation.lastSenderIsMe?"You: ":""}{conversation.lastMessage||"Open conversation"}
                    </Text>
                  </View>
                  {conversation.lastMessageAt ? (
                    <Text style={styles.date} numberOfLines={2}>
                      {philippinesTime(conversation.lastMessageAt)}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={28} color="#90B2A5"/>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptyText}>
                Open Community Members, choose Message, and make sure both accounts allow private messages.
              </Text>
            </View>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="View all messages"
            onPress={() => navigate("/(tabs)/community-inbox" as Href)}
            style={styles.allMessages}>
            <Text style={styles.allText}>View All Messages</Text>
            <Ionicons name="arrow-forward" size={17} color={GREEN}/>
          </Pressable>
          <Text style={styles.privacy}>Private chats are visible only to their participants.</Text>
        </View>
      </View>
    </Modal>
  </>;
}
const styles=StyleSheet.create({
  trigger:{width:48,height:48,borderRadius:12,alignItems:"center",justifyContent:"center",
    backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E2EAF0"},
  smallTrigger:{height:42,width:42,borderRadius:10},
  triggerOpen:{borderColor:"#72C5AD",backgroundColor:"#F3FAF7"},
  overlay:{flex:1,backgroundColor:"rgba(13,35,40,0.07)"},
  popover:{position:"absolute",maxHeight:"80%",backgroundColor:"#FFFFFF",
    borderWidth:1,borderColor:"#DFE9E5",borderRadius:16,padding:12,
    elevation:24,shadowColor:"#12382C",shadowOpacity:0.16,
    shadowRadius:21,shadowOffset:{width:0,height:8}},
  heading:{flexDirection:"row",alignItems:"center",gap:7,paddingBottom:11,
    borderBottomWidth:1,borderBottomColor:"#E9F0ED"},
  title:{fontSize:16,fontWeight:"800",color:"#153D34"},
  subtitle:{fontSize:11,color:"#6B837A",marginTop:3},
  headingAction:{padding:7},
  list:{maxHeight:350},
  conversation:{flexDirection:"row",alignItems:"center",gap:10,
    minHeight:64,borderBottomWidth:1,borderBottomColor:"#EDF2EF",paddingVertical:10,paddingHorizontal:4},
  avatar:{height:41,width:41,borderRadius:21},
  fallback:{height:41,width:41,borderRadius:21,backgroundColor:"#2B765F",alignItems:"center",justifyContent:"center"},
  initial:{fontSize:18,fontWeight:"800",color:"#FFFFFF"},
  copy:{flex:1,minWidth:0,gap:4},
  name:{fontSize:12,fontWeight:"800",color:"#183F34"},
  preview:{fontSize:11,color:"#6B8479"},
  date:{maxWidth:80,fontSize:9,color:"#82968D",textAlign:"right",flexShrink:1},
  empty:{minHeight:155,padding:18,gap:10,alignItems:"center",justifyContent:"center"},
  emptyTitle:{fontSize:13,fontWeight:"800",color:"#2E594A"},
  emptyText:{fontSize:11,textAlign:"center",lineHeight:17,color:"#718B80"},
  retry:{padding:8},retryText:{fontSize:12,fontWeight:"800",color:GREEN},
  allMessages:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,
    marginTop:8,paddingVertical:11,borderRadius:8,backgroundColor:"#EFF8F3"},
  allText:{fontSize:12,fontWeight:"800",color:GREEN},
  privacy:{marginTop:10,textAlign:"center",color:"#879B92",fontSize:10},
});
