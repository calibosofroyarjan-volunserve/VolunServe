import Ionicons from "@expo/vector-icons/Ionicons";
import React, {useState} from "react";
import {ActivityIndicator,Pressable,StyleSheet,Text,View} from "react-native";
import WalletBrandLogo from "./WalletBrandLogo";

type Channel="gcash"|"maya";
export type ResidentReleaseWallet={
  configured:true;method:Channel;walletLast4:string;testOnly:true;
};
type Props={
  amount:number;disabled:boolean;wallet:ResidentReleaseWallet;
  recipientName:string;
  onSubmit:(details:{method:Channel;confirmedSandbox:true})=>Promise<void>;
};
const php=(n:number)=>"₱"+Number(n||0).toLocaleString("en-PH",{
  minimumFractionDigits:2,maximumFractionDigits:2,
});
/** This is an internal test release record, never a provider-backed payout.
 * The LGU Admin can see a Resident-owned fictional wallet alias, not edit it.
 */
export default function SandboxPayoutForm({
  amount,disabled,wallet,recipientName,onSubmit,
}:Props){
  const [stage,setStage]=useState<"preview"|"confirm">("preview");
  const [accepted,setAccepted]=useState(false);
  return <View style={s.card}>
    <View style={s.header}>
      <View style={s.heading}>
        <Text style={s.eyebrow}>LGU RELEASE OPERATIONS</Text>
        <Text style={s.title}>Assistance release instruction</Text>
        <Text style={s.desc}>Destination provided by the identity-verified requesting Resident.</Text>
      </View>
      <View style={s.mode}><Text style={s.modeText}>INTERNAL TEST</Text></View>
    </View>
    <View style={s.steps}>
      <View style={[s.step,stage==="preview"&&s.stepSelected]}>
        <Text style={s.stepText}>01 · Resident destination</Text>
      </View>
      <View style={[s.step,stage==="confirm"&&s.stepSelected]}>
        <Text style={s.stepText}>02 · Confirm test release</Text>
      </View>
    </View>
    <View style={s.amountWrap}>
      <Text style={s.label}>Authorized assistance amount</Text>
      <Text style={s.amount}>{php(amount)}</Text>
      <Text style={s.desc}>Fixed by the approved request and provider-confirmed test donations</Text>
    </View>
    <View style={s.wallet}>
      <View style={s.provider}>
        <WalletBrandLogo brand={wallet.method} width={92} height={31}/>
        <View style={s.verified}>
          <Ionicons name="lock-closed-outline" color="#168362" size={15}/>
          <Text style={s.verifiedText}>Resident-provided alias</Text>
        </View>
      </View>
      <View style={s.line}>
        <Text style={s.label}>Verified account</Text>
        <Text style={s.value}>{recipientName}</Text>
      </View>
      <View style={s.line}>
        <Text style={s.label}>Wallet reference</Text>
        <Text style={s.value}>•••• {wallet.walletLast4}</Text>
      </View>
      <Text style={s.note}>Destination is locked to the matched Resident profile. Admin cannot change this wallet.</Text>
    </View>
    {stage==="preview"?
      <Pressable accessibilityRole="button" disabled={disabled||amount<=0}
        onPress={()=>{setAccepted(false);setStage("confirm");}}
        style={[s.primary,(disabled||amount<=0)&&s.disabled]}>
        <Text style={s.primaryText}>Review test release</Text>
        <Ionicons name="arrow-forward-outline" size={17} color="#FFF"/>
      </Pressable>:
      <>
        <View style={s.disclosure}>
          <Ionicons name="information-circle-outline" size={18} color="#257E60"/>
          <Text style={s.disclosureText}>This action creates a VolunServe internal test record only. No GCash or Maya transfer is initiated, and recipient confirmation refers to the notice, not actual receipt of money.</Text>
        </View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{checked:accepted}}
          onPress={()=>setAccepted(a=>!a)} style={s.check}>
          <Ionicons name={accepted?"checkbox-outline":"square-outline"}
            color={accepted?"#0B8265":"#85A095"} size={22}/>
          <Text style={s.checkText}>I reviewed the recipient and the locked test destination and understand no real funds will be sent.</Text>
        </Pressable>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" disabled={disabled}
            onPress={()=>setStage("preview")} style={s.secondary}>
            <Text style={s.secondaryText}>Back</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={!accepted||disabled}
            style={[s.primary,(!accepted||disabled)&&s.disabled]}
            onPress={()=>void onSubmit({method:wallet.method,confirmedSandbox:true})}>
            {disabled?<ActivityIndicator size="small" color="#FFF"/>:
              <Ionicons name="shield-checkmark-outline" size={17} color="#FFF"/>}
            <Text style={s.primaryText}>Record test release</Text>
          </Pressable>
        </View>
      </>}
  </View>;
}
const s=StyleSheet.create({
  card:{backgroundColor:"#F9FCFA",borderRadius:13,padding:16,gap:13,
    borderWidth:1,borderColor:"#DAEAE2"},
  header:{flexDirection:"row",alignItems:"flex-start",gap:10,flexWrap:"wrap"},
  heading:{flex:1,minWidth:180,gap:4},
  eyebrow:{fontSize:9,fontWeight:"700",color:"#128162",letterSpacing:0.7},
  title:{fontFamily:"FundInterBold",fontSize:16,color:"#205146"},
  desc:{fontFamily:"FundInterRegular",fontSize:11,color:"#64877B",lineHeight:17},
  mode:{paddingHorizontal:9,paddingVertical:6,borderRadius:7,backgroundColor:"#EDF8F1"},
  modeText:{fontSize:9,fontWeight:"700",color:"#327B66"},
  steps:{flexDirection:"row",gap:7,flexWrap:"wrap"},
  step:{backgroundColor:"#F0F4F2",borderRadius:8,paddingHorizontal:10,paddingVertical:8},
  stepSelected:{backgroundColor:"#DDF3E7"},
  stepText:{fontSize:10,fontWeight:"600",color:"#457668"},
  amountWrap:{padding:14,backgroundColor:"#FFF",borderRadius:10,
    borderWidth:1,borderColor:"#E0ECE4",gap:5},
  label:{fontSize:11,color:"#71877D"},
  amount:{fontSize:25,fontFamily:"FundInterBold",color:"#0C8262"},
  wallet:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#D9EBE0",
    padding:13,borderRadius:10,gap:10},
  provider:{flexDirection:"row",gap:10,alignItems:"center",justifyContent:"space-between",
    flexWrap:"wrap"},
  verified:{flexDirection:"row",alignItems:"center",gap:6,backgroundColor:"#EDF9F0",
    padding:7,borderRadius:8},
  verifiedText:{fontSize:10,color:"#248264",fontWeight:"600"},
  line:{flexDirection:"row",justifyContent:"space-between",gap:12,flexWrap:"wrap"},
  value:{fontSize:11,color:"#214F43",fontWeight:"700"},
  note:{fontSize:10,lineHeight:16,color:"#658879"},
  disclosure:{flexDirection:"row",gap:9,padding:12,backgroundColor:"#EDF9F1",
    borderRadius:9,alignItems:"flex-start"},
  disclosureText:{fontSize:11,color:"#396E5A",lineHeight:18,flex:1},
  check:{flexDirection:"row",gap:9,alignItems:"flex-start"},
  checkText:{flex:1,fontSize:11,lineHeight:18,color:"#4A7062"},
  actions:{flexDirection:"row",flexWrap:"wrap",gap:9},
  primary:{flexDirection:"row",alignItems:"center",justifyContent:"center",
    gap:8,backgroundColor:"#08785C",padding:13,borderRadius:9,alignSelf:"flex-start"},
  primaryText:{fontSize:11,fontWeight:"700",color:"#FFF"},
  secondary:{padding:12,borderRadius:9,borderWidth:1,borderColor:"#D2E4D7",
    backgroundColor:"#FFF"},
  secondaryText:{fontSize:11,fontWeight:"600",color:"#167960"},
  disabled:{opacity:0.45},
});
