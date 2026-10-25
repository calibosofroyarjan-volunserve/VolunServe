import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Channel = "gcash" | "maya";
type Request = { method:Channel; testWalletNumber:string; confirmedSandbox:true };
type Props = {
  amount:number;
  disabled:boolean;
  onSubmit:(request:Request)=>Promise<void>;
};
const php=(n:number)=>"₱"+Number(n||0).toLocaleString("en-PH",{
  minimumFractionDigits:2,maximumFractionDigits:2,
});
const mask=(n:string)=>"09•• ••• "+n.slice(-4);

/**
 * Authoritative amount, beneficiary and approval come from the secure Admin API.
 * This is an INTERNAL sandbox ledger, NOT PayMongo Disbursements / real GCash/Maya.
 * Never persist a full demo mobile number: the server retains last four only.
 */
export default function SandboxPayoutForm({amount,disabled,onSubmit}:Props) {
  const [channel,setChannel]=useState<Channel>("gcash");
  const [testNumber,setTestNumber]=useState("");
  const [stage,setStage]=useState<"entry"|"confirm">("entry");
  const [accepted,setAccepted]=useState(false);
  const valid=/^09\d{9}$/.test(testNumber);
  const reset=()=>{setStage("entry");setAccepted(false);};
  return <View style={st.wrap}>
    <View style={st.head}>
      <View style={st.flex}>
        <Text style={st.title}>Sandbox disbursement</Text>
        <Text style={st.sub}>Prepare a GCash or Maya test release to the verified beneficiary.</Text>
      </View>
      <View style={st.badge}><Text style={st.badgeText}>INTERNAL TEST</Text></View>
    </View>
    <View style={st.steps}>
      <View style={[st.step,stage==="entry"&&st.stepActive]}>
        <Text style={st.stepText}>01 · Destination</Text>
      </View>
      <View style={[st.step,stage==="confirm"&&st.stepActive]}>
        <Text style={st.stepText}>02 · Review & confirm</Text>
      </View>
    </View>
    {stage==="entry"?<>
      <View style={st.amountCard}>
        <Text style={st.label}>Authorized test release</Text>
        <Text style={st.amount}>{php(amount)}</Text>
        <Text style={st.sub}>Fixed by the reviewed and approved assistance goal</Text>
      </View>
      <Text style={st.label}>Destination e-wallet</Text>
      <View style={st.channels}>
        {(["gcash","maya"] as const).map(value=>
          <Pressable key={value} accessibilityRole="radio"
            accessibilityState={{selected:channel===value}}
            onPress={()=>setChannel(value)}
            style={[st.channel,channel===value&&st.selected]}>
            <Ionicons name="wallet-outline" size={19} color="#177B60"/>
            <Text style={st.channelName}>{value==="gcash"?"GCash":"Maya"}</Text>
            <Ionicons name={channel===value?"radio-button-on":"radio-button-off"}
              size={18} color={channel===value?"#0C8768":"#A1B5AC"}/>
          </Pressable>)}
      </View>
      <Text style={st.label}>TEST wallet mobile number</Text>
      <TextInput style={st.input} accessibilityLabel="Test wallet mobile number"
        keyboardType="phone-pad" value={testNumber} maxLength={11}
        onChangeText={value=>setTestNumber(value.replace(/\D/g,"").slice(0,11))}
        placeholder="09XXXXXXXXX" placeholderTextColor="#9CAFA7"/>
      <Text style={st.sub}>Use 11 digits beginning with 09. Enter test data only, never someone's real wallet number. The backend stores only the last 4 digits.</Text>
      {testNumber.length>0&&!valid&&<Text style={st.error}>Enter a valid 11-digit TEST mobile number starting with 09.</Text>}
      <View style={st.warning}>
        <Ionicons name="information-circle-outline" size={18} color="#16745C"/>
        <Text style={st.warningText}>This is VolunServe's internal release simulation. No PayMongo outbound transfer is submitted, and no GCash/Maya funds move.</Text>
      </View>
      <Pressable accessibilityRole="button" disabled={!valid||disabled||amount<=0}
        onPress={()=>{setAccepted(false);setStage("confirm");}}
        style={[st.primary,(!valid||disabled||amount<=0)&&st.disabled]}>
        <Text style={st.primaryText}>Review test transfer</Text>
        <Ionicons name="arrow-forward-outline" size={17} color="#FFFFFF"/>
      </Pressable>
    </>:<>
      <Text style={st.label}>Confirm sandbox release details</Text>
      <View style={st.review}>
        <View style={st.row}><Text style={st.muted}>Recipient</Text><Text style={st.value}>Verified requesting Resident</Text></View>
        <View style={st.row}><Text style={st.muted}>Channel</Text><Text style={st.value}>{channel==="gcash"?"GCash":"Maya"} (test)</Text></View>
        <View style={st.row}><Text style={st.muted}>Test wallet</Text><Text style={st.value}>{mask(testNumber)}</Text></View>
        <View style={st.row}><Text style={st.muted}>Release amount</Text><Text style={st.value}>{php(amount)}</Text></View>
        <View style={st.row}><Text style={st.muted}>Processing</Text><Text style={st.value}>VolunServe internal demo</Text></View>
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{checked:accepted}}
        style={st.checkRow} onPress={()=>setAccepted(v=>!v)}>
        <Ionicons name={accepted?"checkbox-outline":"square-outline"} size={22}
          color={accepted?"#0B8063":"#809A90"}/>
        <Text style={st.checkText}>I confirm these are test details and this action records a simulated release only. It is not a real GCash/Maya payment.</Text>
      </Pressable>
      <View style={st.buttons}>
        <Pressable accessibilityRole="button" onPress={reset} disabled={disabled} style={st.secondary}>
          <Ionicons name="arrow-back-outline" color="#0D7860" size={16}/>
          <Text style={st.secondaryText}>Edit details</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!accepted||disabled}
          style={[st.primary,(!accepted||disabled)&&st.disabled]}
          onPress={()=>void onSubmit({method:channel,testWalletNumber:testNumber,confirmedSandbox:true})}>
          {disabled?<ActivityIndicator size="small" color="#FFFFFF"/>:
            <Ionicons name="shield-checkmark-outline" color="#FFFFFF" size={17}/>}
          <Text style={st.primaryText}>Confirm demo release</Text>
        </Pressable>
      </View>
    </>}
  </View>;
}
const st=StyleSheet.create({
  wrap:{padding:15,backgroundColor:"#F9FCFA",borderWidth:1,borderColor:"#DDEDE5",borderRadius:12,gap:12},
  head:{flexDirection:"row",alignItems:"flex-start",gap:9,flexWrap:"wrap"},
  flex:{flex:1,minWidth:200},
  title:{fontFamily:"FundInterBold",fontSize:15,color:"#1D4B45"},
  sub:{fontFamily:"FundInterRegular",fontSize:11,color:"#658578",lineHeight:17},
  badge:{borderWidth:1,borderColor:"#CDEBDF",borderRadius:8,backgroundColor:"#EAF8EF",paddingHorizontal:9,paddingVertical:6},
  badgeText:{fontFamily:"FundInterSemiBold",fontSize:9,color:"#168568",letterSpacing:0.6},
  steps:{flexDirection:"row",flexWrap:"wrap",gap:7},
  step:{backgroundColor:"#F0F5F1",borderRadius:8,paddingHorizontal:11,paddingVertical:8},
  stepActive:{backgroundColor:"#DDF4E7"},
  stepText:{fontFamily:"FundInterSemiBold",fontSize:10,color:"#346E60"},
  amountCard:{backgroundColor:"#FFFFFF",padding:14,borderWidth:1,borderColor:"#E0ECE5",borderRadius:9,gap:4},
  label:{fontFamily:"FundInterSemiBold",color:"#2C5851",fontSize:11},
  amount:{fontFamily:"FundInterBold",fontSize:24,color:"#0A7C5D"},
  channels:{flexDirection:"row",flexWrap:"wrap",gap:9},
  channel:{flex:1,minWidth:125,flexDirection:"row",gap:8,alignItems:"center",padding:12,
    backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DCE9E2",borderRadius:9},
  selected:{backgroundColor:"#EAF9F1",borderColor:"#3EA885"},
  channelName:{flex:1,fontFamily:"FundInterSemiBold",fontSize:12,color:"#2A5B51"},
  input:{padding:12,borderRadius:9,borderWidth:1,borderColor:"#CDDCD4",backgroundColor:"#FFFFFF",
    fontFamily:"FundInterRegular",fontSize:13,color:"#244C42"},
  error:{fontFamily:"FundInterRegular",color:"#A74333",fontSize:11},
  warning:{flexDirection:"row",alignItems:"flex-start",gap:8,backgroundColor:"#EAF7F0",padding:11,borderRadius:8},
  warningText:{flex:1,fontFamily:"FundInterRegular",fontSize:10.5,lineHeight:17,color:"#386E5D"},
  primary:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,padding:12,
    borderRadius:9,backgroundColor:"#08795C",alignSelf:"flex-start"},
  primaryText:{fontFamily:"FundInterSemiBold",fontSize:11,color:"#FFFFFF"},
  disabled:{opacity:0.45},
  review:{backgroundColor:"#FFFFFF",padding:13,gap:11,borderWidth:1,borderColor:"#E0EBE4",borderRadius:10},
  row:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"},
  muted:{fontFamily:"FundInterRegular",fontSize:11,color:"#799186"},
  value:{fontFamily:"FundInterSemiBold",fontSize:11,color:"#244E45",textAlign:"right",flexShrink:1},
  checkRow:{flexDirection:"row",alignItems:"flex-start",gap:10,paddingVertical:7},
  checkText:{fontFamily:"FundInterRegular",flex:1,fontSize:11,lineHeight:18,color:"#486E60"},
  buttons:{flexDirection:"row",flexWrap:"wrap",gap:9},
  secondary:{flexDirection:"row",alignItems:"center",gap:6,padding:11,borderRadius:9,
    borderWidth:1,borderColor:"#CCE2D6",backgroundColor:"#FFFFFF"},
  secondaryText:{fontFamily:"FundInterSemiBold",fontSize:11,color:"#0D7860"},
});
