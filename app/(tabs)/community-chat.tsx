import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { communitySocialRequest, memberLastSeen, philippinesTime,
  type CommunityMember, type CommunityMessage } from "../../lib/communitySocial";

type ThreadResponse={member:CommunityMember;messages:CommunityMessage[];canSend:boolean;blockedByMe:boolean};
const GREEN="#087F68";
export default function CommunityChat() {
  const router=useRouter();
  const {width}=useWindowDimensions();
  const mobile=width<760;
  const params=useLocalSearchParams<{member?:string}>();
  const key=typeof params.member==="string"?params.member:"";
  const [peer,setPeer]=useState<CommunityMember|null>(null);
  const [messages,setMessages]=useState<CommunityMessage[]>([]);
  const [canSend,setCanSend]=useState(false);
  const [blocked,setBlocked]=useState(false);
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [text,setText]=useState("");
  const [error,setError]=useState("");
  const [feedback,setFeedback]=useState("");
  const [busy,setBusy]=useState(false);
  const [reportOpen,setReportOpen]=useState(false);
  const listRef=useRef<ScrollView>(null);
  const fetchThread=useCallback(async()=>{
    if(!/^[a-f0-9]{24}$/.test(key)){setError("Invalid member link.");setLoading(false);return;}
    try {
      const data=await communitySocialRequest<ThreadResponse>("/api/community/chats/"+key);
      setPeer(data.member);
      setMessages(Array.isArray(data.messages)?data.messages:[]);
      setBlocked(data.blockedByMe===true);
      setCanSend(data.canSend===true);
      setError("");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Conversation unavailable.");
    }finally{setLoading(false);}
  },[key]);
  useEffect(()=>{
    setLoading(true);void fetchThread();
    const interval=setInterval(()=>void fetchThread(),10000);
    return()=>clearInterval(interval);
  },[fetchThread]);
  const send=useCallback(async()=>{
    const value=text.trim();
    if(!value||sending||!canSend||busy)return;
    setSending(true);setFeedback("");
    try {
      await communitySocialRequest("/api/community/chats/"+key,"POST",{text:value});
      setText("");
      await fetchThread();
      listRef.current?.scrollToEnd({animated:true});
    }catch(reason){
      setFeedback(reason instanceof Error?reason.message:"Message could not be sent.");
    }finally{setSending(false);}
  },[text,sending,canSend,busy,key,fetchThread]);
  const changeBlock=useCallback(async()=>{
    if(busy)return;setBusy(true);setFeedback("");
    try {
      await communitySocialRequest("/api/community/chats/"+key+"/block","POST",{blocked:!blocked});
      await fetchThread();
      setFeedback(blocked?"Member unblocked.":"Member blocked. You can still read previous messages.");
    }catch(reason){setFeedback(reason instanceof Error?reason.message:"Could not change block setting.");}
    finally{setBusy(false);}
  },[busy,key,blocked,fetchThread]);
  const submitReport=useCallback(async(reason:string)=>{
    if(busy)return;
    setBusy(true);setFeedback("");
    try{
      await communitySocialRequest("/api/community/chats/"+key+"/report","POST",{reason});
      setReportOpen(false);setFeedback("Report submitted for review.");
    }catch(error){setFeedback(error instanceof Error?error.message:"Report could not be submitted.");}
    finally{setBusy(false);}
  },[busy,key]);
  const back=()=>router.push("/(tabs)/community-inbox" as Href);
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==="ios"?"padding":undefined}>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.page,mobile&&styles.pageMobile]}>
      <View style={styles.shell}>
        <Pressable onPress={back} style={styles.back}>
          <Ionicons name="arrow-back" size={18} color={GREEN}/><Text style={styles.backText}>Messages</Text>
        </Pressable>
        <View style={styles.card}>
          {loading&&!peer?<View style={styles.loading}><ActivityIndicator color={GREEN}/><Text style={styles.muted}>Loading conversation...</Text></View>:
            error&&!peer?<View style={styles.loading}>
              <Ionicons name="information-circle-outline" size={29} color="#7BA394"/>
              <Text style={styles.muted}>{error}</Text>
              <Pressable onPress={back} style={styles.smallAction}><Text style={styles.smallActionText}>Back to Inbox</Text></Pressable>
            </View>:
            peer?<><View style={[styles.header,mobile&&styles.mobileHeader]}>
              {peer.avatarUrl?<Image source={{uri:peer.avatarUrl}} style={styles.avatar}/>:
                <View style={styles.avatarFallback}>
                  <Text style={styles.initial}>{peer.name.charAt(0).toUpperCase()}</Text>
                </View>}
              <View style={styles.peerCopy}>
                <Text style={styles.name} numberOfLines={1}>{peer.name}</Text>
                <Text style={styles.badge}>{peer.badge}</Text>
                <Text style={[styles.status,!peer.online&&styles.offline]} numberOfLines={2}>
                  {memberLastSeen(peer)}
                </Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable accessibilityRole="button" onPress={()=>void fetchThread()} style={styles.iconAction}>
                  <Ionicons name="refresh-outline" size={18} color={GREEN}/>
                </Pressable>
                <Pressable accessibilityRole="button"
                  onPress={()=>router.push({pathname:"/(tabs)/community-member-profile",params:{member:key}} as Href)}
                  style={styles.iconAction}>
                  <Ionicons name="person-circle-outline" size={19} color={GREEN}/>
                </Pressable>
              </View>
            </View>
            <View style={styles.safetyBar}>
              <Ionicons name="lock-closed-outline" size={16} color="#547D6F"/>
              <Text style={styles.safetyText}>One-to-one conversation. Chat is not an emergency-reporting channel.</Text>
            </View>
            <View style={styles.messageArea}>
              {messages.length? <ScrollView ref={listRef} style={styles.messagesScroll} contentContainerStyle={styles.messagesContent}>
                {messages.map(m=><View key={m.id}
                  style={[styles.messageBubble,m.fromMe?styles.fromMe:styles.fromPeer]}>
                  <Text style={[styles.messageText,m.fromMe&&styles.myMessageText]}>{m.text}</Text>
                  {m.sentAt?<Text style={[styles.time,m.fromMe&&styles.myTime]}>{philippinesTime(m.sentAt)}</Text>:null}
                </View>)}
                {messages.length>=40?<Text style={styles.oldNotice}>Showing the 40 most recent messages.</Text>:null}
              </ScrollView>:
              <View style={styles.empty}><Ionicons name="chatbubble-ellipses-outline" size={32} color="#9BBBAE"/>
                <Text style={styles.emptyTitle}>Start a conversation</Text>
                <Text style={styles.muted}>Say hello and coordinate respectfully with your community member.</Text>
              </View>}
            </View>
            {!canSend?<View style={styles.readOnly}>
              <Ionicons name="information-circle-outline" size={17} color="#758E83"/>
              <Text style={styles.readOnlyText}>Messaging is available by default to approved community members. If this chat is read-only, one account has paused messages or a member has blocked the other.</Text>
            </View>:null}
            <View style={[styles.composer,mobile&&styles.mobileComposer]}>
              <TextInput value={text} onChangeText={setText} placeholder="Write a message..."
                editable={canSend&&!sending&&!busy} placeholderTextColor="#8A9C94"
                multiline maxLength={500} style={styles.input} accessibilityLabel="Your private message"/>
              <Pressable accessibilityRole="button" accessibilityLabel="Send message"
                disabled={!text.trim()||!canSend||sending||busy}
                onPress={()=>void send()}
                style={[styles.send,(!text.trim()||!canSend||sending||busy)&&styles.sendDisabled]}>
                <Ionicons name="send" size={19} color="white"/>
                {!mobile?<Text style={styles.sendText}>{sending?"Sending...":"Send"}</Text>:null}
              </Pressable>
            </View>
            {feedback?<Text style={styles.feedback}>{feedback}</Text>:null}
            <View style={styles.footer}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void changeBlock()}
                style={styles.footerButton}>
                <Ionicons name={blocked?"checkmark-circle-outline":"ban-outline"} size={15} color="#8E524C"/>
                <Text style={styles.blockText}>{blocked?"Unblock Member":"Block Member"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={()=>setReportOpen(!reportOpen)} style={styles.footerButton}>
                <Ionicons name="flag-outline" size={15} color="#8E524C"/>
                <Text style={styles.blockText}>Report Conversation</Text>
              </Pressable>
            </View>
            {reportOpen?<View style={styles.report}>
              <Text style={styles.reportTitle}>Why are you reporting this chat?</Text>
              <View style={styles.reportOptions}>
                {(["spam","harassment","inappropriate","other"] as const).map(reason=>
                  <Pressable key={reason} disabled={busy} onPress={()=>void submitReport(reason)}
                    style={styles.reportOption}>
                    <Text style={styles.reportOptionText}>{reason==="inappropriate"?"Inappropriate Content":
                      reason.charAt(0).toUpperCase()+reason.slice(1)}</Text>
                  </Pressable>)}
              </View>
            </View>:null}
          </>:null}
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#F2F8F5"},
  scroll:{flex:1},
  page:{paddingVertical:18,paddingHorizontal:17,alignItems:"center"},
  pageMobile:{paddingHorizontal:8,paddingVertical:9},
  shell:{width:"100%",maxWidth:970,gap:11},
  back:{alignSelf:"flex-start",padding:9,flexDirection:"row",alignItems:"center",gap:8},
  backText:{color:GREEN,fontSize:12,fontWeight:"800"},
  card:{backgroundColor:"#FFFFFF",borderRadius:16,borderWidth:1,borderColor:"#DDEBE4",overflow:"hidden"},
  loading:{padding:46,alignItems:"center",gap:13},
  muted:{fontSize:12,color:"#789288",textAlign:"center",lineHeight:19},
  header:{flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:18,paddingVertical:15,
    borderBottomWidth:1,borderBottomColor:"#EAF0EB"},
  mobileHeader:{paddingHorizontal:11},
  avatar:{height:53,width:53,borderRadius:27},
  avatarFallback:{height:53,width:53,borderRadius:27,backgroundColor:"#2D7860",alignItems:"center",justifyContent:"center"},
  initial:{fontWeight:"800",fontSize:23,color:"white"},
  peerCopy:{flex:1,minWidth:0,gap:3},
  name:{fontSize:16,fontWeight:"800",color:"#154136"},
  badge:{fontSize:10,fontWeight:"700",color:GREEN},
  status:{fontSize:10.5,color:"#078B63"},
  offline:{color:"#718C80"},
  headerActions:{flexDirection:"row",gap:5},
  iconAction:{padding:9,backgroundColor:"#F0F8F3",borderRadius:9},
  safetyBar:{flexDirection:"row",alignItems:"center",gap:9,backgroundColor:"#F1F8F3",paddingHorizontal:15,paddingVertical:10},
  safetyText:{fontSize:11,color:"#6E8C7F",flex:1},
  messageArea:{minHeight:230,maxHeight:450,paddingHorizontal:15,paddingVertical:14},
  messagesScroll:{maxHeight:430},
  messagesContent:{gap:11,paddingVertical:5},
  messageBubble:{maxWidth:"82%",paddingHorizontal:13,paddingVertical:10,borderRadius:12,gap:8},
  fromMe:{alignSelf:"flex-end",backgroundColor:"#087F68",borderBottomRightRadius:3},
  fromPeer:{alignSelf:"flex-start",backgroundColor:"#EDF4F0",borderBottomLeftRadius:3},
  messageText:{fontSize:12.5,color:"#20483B",lineHeight:19},
  myMessageText:{color:"white"},
  time:{fontSize:9,color:"#718B7F",textAlign:"right"},
  myTime:{color:"#D2EBE2"},
  oldNotice:{textAlign:"center",fontSize:10,color:"#94A59D"},
  empty:{alignItems:"center",justifyContent:"center",minHeight:230,padding:25,gap:12},
  emptyTitle:{fontSize:16,fontWeight:"800",color:"#335B4D"},
  readOnly:{backgroundColor:"#F8F7F2",flexDirection:"row",gap:9,padding:12,alignItems:"center"},
  readOnlyText:{fontSize:11,lineHeight:16,color:"#6B8077",flex:1},
  composer:{flexDirection:"row",alignItems:"flex-end",gap:10,
    padding:13,borderTopWidth:1,borderTopColor:"#E8EFEA"},
  mobileComposer:{padding:9,gap:7},
  input:{flex:1,maxHeight:110,minHeight:45,paddingHorizontal:12,paddingVertical:9,borderRadius:10,
    borderWidth:1,borderColor:"#DBE8E0",fontSize:13,color:"#26483B",backgroundColor:"#FAFCFB"},
  send:{backgroundColor:GREEN,borderRadius:10,minHeight:45,paddingHorizontal:14,
    flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7},
  sendDisabled:{backgroundColor:"#B5CEC3"},
  sendText:{fontWeight:"800",fontSize:12,color:"white"},
  feedback:{fontSize:11,color:"#7A5749",paddingHorizontal:16,paddingBottom:7},
  footer:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:14,paddingHorizontal:14,paddingVertical:11,
    borderTopWidth:1,borderTopColor:"#ECF1EC"},
  footerButton:{flexDirection:"row",alignItems:"center",gap:6,padding:6},
  blockText:{fontSize:11,color:"#8E524C",fontWeight:"700"},
  report:{padding:16,backgroundColor:"#FCF6F4",gap:10},
  reportTitle:{fontSize:12,fontWeight:"800",color:"#6B433C"},
  reportOptions:{flexDirection:"row",flexWrap:"wrap",gap:7},
  reportOption:{backgroundColor:"white",borderRadius:7,padding:10,borderWidth:1,borderColor:"#E8CFC8"},
  reportOptionText:{color:"#8D4D45",fontSize:11,fontWeight:"700"},
  smallAction:{padding:10,backgroundColor:"#E8F6ED",borderRadius:8},
  smallActionText:{fontSize:12,color:GREEN,fontWeight:"800"},
});
