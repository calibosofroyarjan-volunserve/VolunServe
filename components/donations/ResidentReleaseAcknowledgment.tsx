import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { auth } from "../../lib/firebase";
import WalletBrandLogo from "./WalletBrandLogo";

type Release = {
  id:string; campaignId:string; campaignTitle:string; status:string;
  amount:number; method?:string;walletLast4?:string;
  simulationReference?:string;simulatedAt?:string;
  releaseProcessor?:string;deliveryStatus?:string;
  acknowledgedAt?:string;acknowledgmentNote?:string;
};
const ROOT="https://volunserve.onrender.com/api/funds/my-releases";
const peso=(value:number) => "₱"+Number(value||0).toLocaleString("en-PH",{
  minimumFractionDigits:2,maximumFractionDigits:2,
});
export default function ResidentReleaseAcknowledgment({enabled}:{enabled:boolean}) {
  const [releases,setReleases]=useState<Release[]>([]);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [disputeId,setDisputeId]=useState("");
  const [disputeNote,setDisputeNote]=useState("");
  const request=useCallback(async(path:string,body?:Record<string,unknown>)=>{
    const token=await auth.currentUser?.getIdToken();
    if(!token)throw new Error("Your session has expired. Please sign in again.");
    const response=await fetch(ROOT+path,{
      method:body?"POST":"GET",
      headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    const json=await response.json().catch(()=>null);
    if(!response.ok || !json?.ok)throw new Error(json?.message||
      (response.status===404?"Fund release records are not deployed yet.":"Unable to load release records."));
    return json;
  },[]);
  const refresh=useCallback(async()=>{
    setLoading(true);
    try {
      const data=await request("");
      setReleases(Array.isArray(data.releases)?data.releases:[]);
      setError("");
    }catch(e:any){setError(e?.message||"Unable to load records.");}
    finally{setLoading(false);}
  },[request]);
  useEffect(()=>{if(enabled)void refresh();},[enabled,refresh]);
  const decide=async(id:string,decision:"acknowledge"|"dispute")=>{
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try {
      await request("/"+id+"/acknowledge",{decision,
        note:decision==="dispute"?disputeNote:"Release instruction reviewed; no actual funds received."});
      setDisputeId("");setDisputeNote("");
      setNotice(decision==="acknowledge"?
        "Release notice acknowledged. The LGU Admin can see your response.":
        "Dispute submitted to the LGU for review.");
      await refresh();
    }catch(e:any){setError(e?.message||"Unable to save your response.");}
    finally{setBusy(false);}
  };
  if(!enabled)return null;
  return <View style={st.container}>
    <View style={st.head}>
      <View style={st.icon}><Ionicons name="shield-checkmark-outline" color="#078D69" size={21}/></View>
      <View style={st.flex}>
        <Text style={st.title}>My assistance releases</Text>
        <Text style={st.muted}>
          Track LGU-approved assistance releases and respond to notices linked to your verified request.
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={()=>void refresh()} disabled={loading||busy} style={st.refresh}>
        {loading?<ActivityIndicator size="small" color="#08775D"/>:
          <Ionicons name="refresh-outline" size={17} color="#08775D"/>}
        <Text style={st.refreshText}>Refresh</Text>
      </Pressable>
    </View>
    {!!error&&<Text style={st.error}>{error}</Text>}
    {!!notice&&<Text style={st.success}>{notice}</Text>}
    {!releases.length&&!loading?<Text style={st.empty}>
      No assistance release notices are available yet.
    </Text>:releases.map(r=><View key={r.id} style={st.card}>
      <View style={st.cardHeader}>
        <View style={st.flex}>
          <Text style={st.campaign}>{r.campaignTitle||"Donation campaign"}</Text>
          <Text style={st.amount}>{peso(r.amount)}</Text>
        </View>
        <Text style={st.status}>{r.status==="simulated_sent"?"Awaiting your review":
          r.status==="acknowledged_demo"?"Notice acknowledged":r.status==="disputed"?"Issue reported":r.status}</Text>
      </View>
      <View style={st.walletRow}>
        {(r.method==="gcash"||r.method==="maya")?
          <WalletBrandLogo brand={r.method} width={78} height={24}/>:
          <Text style={st.muted}>E-wallet</Text>}
        <Text style={st.muted}>Destination ending •••• {r.walletLast4||"—"}</Text>
      </View>
      <Text style={st.muted}>Release reference: {r.simulationReference||"—"}</Text>
      {!!r.simulatedAt&&<Text style={st.muted}>
        Recorded: {new Date(r.simulatedAt).toLocaleString("en-PH")}
      </Text>}
      <View style={st.noticeBox}>
        <Ionicons name="information-circle-outline" size={17} color="#17785C"/>
        <Text style={st.noticeText}>
          Test-only release record. No actual wallet transfer has occurred. Confirming this notice is not proof of receiving money.
        </Text>
      </View>
      {r.status==="simulated_sent"&&<>
        <View style={st.actions}>
          <Pressable style={[st.approve,busy&&st.disabled]} disabled={busy} accessibilityRole="button"
            onPress={()=>void decide(r.id,"acknowledge")}>
            <Text style={st.approveText}>Confirm notice reviewed</Text>
          </Pressable>
          <Pressable style={st.reject} accessibilityRole="button"
            onPress={()=>setDisputeId(disputeId===r.id?"":r.id)}>
            <Text style={st.rejectText}>Report an issue</Text>
          </Pressable>
        </View>
        {disputeId===r.id&&<View style={st.dispute}>
          <Text style={st.label}>Describe your concern</Text>
          <TextInput multiline value={disputeNote} onChangeText={setDisputeNote}
            accessibilityLabel="Reason for reporting an issue"
            placeholder="Explain the issue with the record…"
            style={st.input}/>
          <Pressable style={[st.reject,(busy||disputeNote.trim().length<10)&&st.disabled]}
            disabled={busy||disputeNote.trim().length<10}
            accessibilityRole="button" onPress={()=>void decide(r.id,"dispute")}>
            <Text style={st.rejectText}>Submit issue</Text>
          </Pressable>
        </View>}
      </>}
      {!!r.acknowledgmentNote&&r.status!=="simulated_sent"&&
        <Text style={st.muted}>Resident response: {r.acknowledgmentNote}</Text>}
    </View>)}
  </View>;
}
const st=StyleSheet.create({
  container:{borderWidth:1,borderColor:"#D9EAE2",borderRadius:15,backgroundColor:"#FFFFFF",
    padding:17,gap:12,marginVertical:12},
  head:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:12},
  icon:{width:40,height:40,borderRadius:10,backgroundColor:"#E7F9F0",
    justifyContent:"center",alignItems:"center"},
  flex:{flex:1,minWidth:0},
  title:{fontFamily:"DonationInterBold",fontSize:16,color:"#1A453C"},
  muted:{fontFamily:"DonationInterRegular",fontSize:11,color:"#708A83",lineHeight:18,marginTop:4},
  refresh:{flexDirection:"row",gap:6,alignItems:"center",backgroundColor:"#F0FAF4",
    padding:9,borderRadius:9},
  refreshText:{fontFamily:"DonationInterSemiBold",fontSize:10.5,color:"#0A8061"},
  error:{padding:9,borderRadius:8,backgroundColor:"#FFF2E9",color:"#A14023",fontSize:11},
  success:{padding:9,borderRadius:8,backgroundColor:"#E9F9F1",color:"#0D7555",fontSize:11},
  empty:{fontFamily:"DonationInterRegular",fontSize:11.5,color:"#82978D",padding:12},
  card:{borderTopWidth:1,borderTopColor:"#EAF0ED",paddingVertical:12,gap:8},
  cardHeader:{flexDirection:"row",justifyContent:"space-between",gap:8,flexWrap:"wrap",alignItems:"center"},
  walletRow:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:12,
    backgroundColor:"#F7FAF9",borderRadius:10,padding:9},
  campaign:{fontFamily:"DonationInterSemiBold",fontSize:12,color:"#284B45"},
  amount:{fontFamily:"DonationInterBold",fontSize:18,color:"#105B49",marginTop:4},
  demo:{fontFamily:"DonationInterRegular",fontSize:10,color:"#64887A"},
  status:{fontFamily:"DonationInterSemiBold",fontSize:10,color:"#0C8763",
    backgroundColor:"#E9F8EF",padding:8,borderRadius:8,overflow:"hidden"},
  noticeBox:{flexDirection:"row",gap:7,backgroundColor:"#F1F8F4",borderRadius:8,padding:9},
  noticeText:{fontFamily:"DonationInterRegular",flex:1,color:"#527C67",fontSize:10.8,lineHeight:18},
  actions:{flexDirection:"row",flexWrap:"wrap",gap:9},
  approve:{paddingHorizontal:12,paddingVertical:11,backgroundColor:"#08785D",borderRadius:9},
  approveText:{fontFamily:"DonationInterSemiBold",fontSize:11,color:"#FFFFFF"},
  reject:{paddingHorizontal:12,paddingVertical:11,borderWidth:1,
    borderColor:"#CBDDD5",borderRadius:9,alignSelf:"flex-start"},
  rejectText:{fontFamily:"DonationInterSemiBold",fontSize:11,color:"#416A5C"},
  dispute:{gap:8},
  label:{fontFamily:"DonationInterSemiBold",fontSize:11,color:"#3B685A"},
  input:{minHeight:68,textAlignVertical:"top",borderWidth:1,borderColor:"#DDE8E1",
    borderRadius:8,padding:10,fontSize:11,color:"#284A42"},
  disabled:{opacity:0.45},
});
