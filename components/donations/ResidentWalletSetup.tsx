import Ionicons from "@expo/vector-icons/Ionicons";
import React, {useCallback,useEffect,useState} from "react";
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View} from "react-native";
import {auth} from "../../lib/firebase";
import WalletBrandLogo from "./WalletBrandLogo";

type Channel="gcash"|"maya";
type Wallet={configured:boolean;method?:Channel;walletLast4?:string;testOnly:true};
const ROOT="https://volunserve.onrender.com/api/funds/my-release-wallet";

/** Verified Resident's private *fictional* TEST destination.
 * This never verifies ownership of an actual provider wallet and never initiates payments.
 */
export default function ResidentWalletSetup({enabled}:{enabled:boolean}) {
  const [wallet,setWallet]=useState<Wallet|null>(null);
  const [channel,setChannel]=useState<Channel>("gcash");
  const [alias,setAlias]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [editing,setEditing]=useState(false);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const request=useCallback(async(data?:Record<string,unknown>)=>{
    const token=await auth.currentUser?.getIdToken();
    if(!token)throw Error("Sign in to configure your test wallet.");
    const r=await fetch(ROOT,{
      method:data?"POST":"GET",
      headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
      ...(data?{body:JSON.stringify(data)}:{}),
    });
    const body=await r.json().catch(()=>null);
    if(!r.ok||!body?.ok)throw Error(body?.message||"Unable to load wallet setup.");
    return body;
  },[]);
  useEffect(()=>{
    if(!enabled)return;
    let current=true;
    setLoading(true);
    void request().then(data=>{
      if(!current)return;
      const existing=data.wallet as Wallet;
      setWallet(existing);
      if(existing?.configured){
        setChannel(existing.method||"gcash");
        setAlias(existing.walletLast4||"");
        setEditing(false);
      }else setEditing(true);
    }).catch(e=>{if(current)setError(String(e?.message||"Wallet setup unavailable."));})
      .finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[enabled,request]);
  const save=async()=>{
    if(saving||!confirmed||!/^[0-9]{4}$/.test(alias))return;
    setSaving(true);setError("");setNotice("");
    try{
      const data=await request({method:channel,walletLast4:alias,confirmedTestOnly:true});
      setWallet(data.wallet as Wallet);
      setEditing(false);
      setConfirmed(false);
      setNotice("Your fictional wallet destination is saved. LGU Admin can now review the masked alias.");
    }catch(e:any){setError(e?.message||"Unable to save wallet selection.");}
    finally{setSaving(false);}
  };
  if(!enabled)return null;
  return <View style={s.panel}>
    <View style={s.header}>
      <View style={s.heading}>
        <Text style={s.eyebrow}>VERIFIED RESIDENT · PRIVATE DETAILS</Text>
        <Text style={s.title}>My assistance wallet</Text>
        <Text style={s.muted}>Choose the destination for your approved assistance-release demonstration.</Text>
      </View>
      <View style={s.testTag}><Text style={s.testText}>TEST ONLY</Text></View>
    </View>
    {!!error&&<Text style={s.error}>{error}</Text>}
    {!!notice&&<Text style={s.success}>{notice}</Text>}
    {loading?<ActivityIndicator color="#148367"/>:wallet?.configured&&!editing?
      <View style={s.saved}>
        <WalletBrandLogo brand={wallet.method||"gcash"} width={90} height={28}/>
        <View style={s.savedText}>
          <Text style={s.savedTitle}>Fictional wallet ending •••• {wallet.walletLast4}</Text>
          <Text style={s.muted}>Only the last four digits are stored. No wallet ownership check or real transfer.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={()=>{setEditing(true);setConfirmed(false);}}
          style={s.editButton}><Ionicons name="create-outline" size={16} color="#167B5F"/>
          <Text style={s.editText}>Edit</Text></Pressable>
      </View>:<>
        <Text style={s.label}>Select e-wallet</Text>
        <View style={s.choices}>
          {(["gcash","maya"] as const).map(method=><Pressable key={method}
            accessibilityRole="radio" accessibilityState={{selected:channel===method}}
            onPress={()=>setChannel(method)}
            style={[s.choice,channel===method&&s.choiceActive]}>
            <WalletBrandLogo brand={method} width={88} height={28}/>
            <Ionicons name={channel===method?"checkmark-circle":"ellipse-outline"}
              size={19} color={channel===method?"#0B8264":"#90AAA0"}/>
          </Pressable>)}
        </View>
        <Text style={s.label}>Fictional 4-digit wallet alias</Text>
        <TextInput accessibilityLabel="Fictional test wallet last four digits"
          keyboardType="number-pad" maxLength={4} placeholder="e.g. 1234"
          value={alias} onChangeText={value=>setAlias(value.replace(/\D/g,"").slice(0,4))}
          style={s.input}/>
        <Text style={s.muted}>Do not enter your actual wallet number, PIN, OTP or account credentials.</Text>
        <Pressable accessibilityRole="checkbox" accessibilityState={{checked:confirmed}}
          onPress={()=>setConfirmed(value=>!value)} style={s.ack}>
          <Ionicons name={confirmed?"checkbox-outline":"square-outline"} size={21}
            color={confirmed?"#148367":"#8DABA0"}/>
          <Text style={s.ackText}>I understand this is a fictional destination for internal testing. No GCash/Maya funds will be sent.</Text>
        </Pressable>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" onPress={()=>void save()}
            disabled={saving||!confirmed||!/^[0-9]{4}$/.test(alias)}
            style={[s.save,(saving||!confirmed||!/^[0-9]{4}$/.test(alias))&&s.disabled]}>
            {saving?<ActivityIndicator color="#FFF" size="small"/>:
              <Ionicons name="shield-checkmark-outline" color="#FFF" size={17}/>}
            <Text style={s.saveText}>Save wallet alias</Text>
          </Pressable>
          {wallet?.configured&&<Pressable accessibilityRole="button"
            onPress={()=>{setEditing(false);setConfirmed(false);}}
            style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>}
        </View>
      </>}
  </View>;
}
const s=StyleSheet.create({
  panel:{borderWidth:1,borderColor:"#D6EADF",backgroundColor:"#F8FCFA",borderRadius:14,
    padding:15,gap:12},
  header:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:10},
  heading:{flex:1,minWidth:190,gap:4},
  eyebrow:{fontSize:9,fontWeight:"700",letterSpacing:0.7,color:"#168166"},
  title:{fontSize:17,fontWeight:"700",color:"#1C4C41"},
  muted:{fontSize:11,color:"#6E8A7D",lineHeight:17},
  testTag:{paddingVertical:6,paddingHorizontal:9,borderRadius:7,backgroundColor:"#E3F4EB"},
  testText:{fontSize:9,fontWeight:"700",color:"#168166"},
  label:{fontSize:11,fontWeight:"700",color:"#38695A"},
  choices:{flexDirection:"row",gap:9,flexWrap:"wrap"},
  choice:{flex:1,minWidth:135,minHeight:57,flexDirection:"row",alignItems:"center",
    justifyContent:"space-between",backgroundColor:"#FFF",borderRadius:11,
    borderWidth:1,borderColor:"#D9E9E1",padding:11},
  choiceActive:{borderColor:"#138865",backgroundColor:"#EAF8F1"},
  input:{backgroundColor:"#FFF",borderRadius:10,borderColor:"#D3E5DA",borderWidth:1,
    padding:12,fontSize:15,color:"#264B40",maxWidth:220,letterSpacing:3},
  ack:{flexDirection:"row",alignItems:"flex-start",gap:9},
  ackText:{flex:1,fontSize:11,lineHeight:18,color:"#517566"},
  actions:{flexDirection:"row",gap:10,flexWrap:"wrap"},
  save:{backgroundColor:"#08795C",padding:12,borderRadius:9,flexDirection:"row",gap:7,alignItems:"center"},
  saveText:{color:"#FFF",fontWeight:"700",fontSize:11},
  disabled:{opacity:0.45},
  cancel:{borderColor:"#CFE2D6",borderWidth:1,padding:12,borderRadius:9},
  cancelText:{color:"#168064",fontWeight:"700",fontSize:11},
  saved:{flexDirection:"row",gap:11,alignItems:"center",flexWrap:"wrap"},
  savedText:{flex:1,minWidth:160,gap:3},
  savedTitle:{fontSize:12,fontWeight:"700",color:"#214A3E"},
  editButton:{padding:10,backgroundColor:"#FFF",borderRadius:9,borderWidth:1,
    borderColor:"#D6E9DE",flexDirection:"row",alignItems:"center",gap:5},
  editText:{fontSize:11,color:"#177D62",fontWeight:"700"},
  error:{fontSize:11,color:"#A1492B",backgroundColor:"#FFF2E9",padding:8,borderRadius:7},
  success:{fontSize:11,color:"#08744E",backgroundColor:"#E5F7ED",padding:8,borderRadius:7},
});
