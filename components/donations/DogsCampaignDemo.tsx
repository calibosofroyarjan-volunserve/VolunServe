import Ionicons from "@expo/vector-icons/Ionicons";
import {LinearGradient} from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import React,{useState} from "react";
import {Image,StyleSheet,Text,TextInput,TouchableOpacity,View} from "react-native";

/** Presentation-only campaign embedded in the REAL Donations screen.
 *  Nothing here reads/writes Firebase or calls PayMongo/GCash/Maya.
 *  The live campaign list, checkout, records, progress and counts are separate.
 */
const GOAL=1000;
const AMOUNTS=[100,200,500,1000];
const money=(value:number)=>"₱"+value.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function DogsCampaignDemo(){
  const [expanded,setExpanded]=useState(false);
  const [photo,setPhoto]=useState<string|null>(null);
  const [amount,setAmount]=useState("100");
  const [donations,setDonations]=useState<number[]>([]);
  const [notice,setNotice]=useState("");
  const total=donations.reduce((sum,item)=>sum+item,0);
  const remaining=Math.max(0,GOAL-total);
  const choosePhoto=async()=>{
    try{
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:0.75});
      if(!result.canceled&&result.assets[0]?.uri)setPhoto(result.assets[0].uri);
    }catch{
      setNotice("Unable to open photos. You can still demonstrate the donation flow.");
    }
  };
  const recordDonation=()=>{
    const value=Number(amount);
    if(!Number.isFinite(value)||value<=0||!Number.isInteger(value)){
      setNotice("Enter a valid whole-peso sample amount.");return;
    }
    if(value>remaining){
      setNotice("Choose an amount within the remaining demo goal.");return;
    }
    setDonations(previous=>[...previous,value]);
    setNotice("Sample donation recorded locally only. No PayMongo transaction or money transfer occurred.");
  };
  return <View style={s.outer}>
    <View style={s.top}>
      <Ionicons name="paw-outline" size={16} color="#0B8E69"/>
      <Text style={s.overline}>ANIMAL / PET WELFARE</Text>
      <View style={s.badge}><Text style={s.badgeText}>PRESENTATION DEMO · NOT LIVE</Text></View>
    </View>
    <LinearGradient colors={["#F2FFF9","#EAF9F2","#D9F4E5"]} style={s.content}>
      <TouchableOpacity onPress={choosePhoto} accessibilityLabel="Choose sample dog photo from this device" style={s.photoBox}>
        {photo?<Image source={{uri:photo}} style={s.photo}/>:
          <View style={s.photoEmpty}>
            <Ionicons name="paw" size={47} color="#128D6C"/>
            <Text style={s.photoHint}>Choose dog photo</Text>
          </View>}
        <View style={s.photoBadge}><Ionicons name="images-outline" size={13} color="#0A7159"/>
          <Text style={s.photoBadgeText}>Sample photo</Text></View>
      </TouchableOpacity>
      <View style={s.copy}>
        <Text style={s.title}>Help Feed and Care for Dogs in Need</Text>
        <Text style={s.desc}>A sample campaign showing how donations may support dog food, basic veterinary care and animal welfare.</Text>
        <View style={s.metric}><Text style={s.metricStrong}>{money(total)} demo</Text><Text style={s.metricLight}>of {money(GOAL)} sample goal</Text></View>
        <View style={s.track}><View style={[s.progress,{width:(Math.min(100,total/GOAL*100)+"%") as any}]}/></View>
        <TouchableOpacity accessibilityRole="button" style={s.button} onPress={()=>setExpanded(v=>!v)}>
          <Text style={s.buttonText}>{expanded?"Close Demo Details":"View Dog Donation Details"}</Text>
          <Ionicons name={expanded?"chevron-up":"arrow-forward"} color="#FFFFFF" size={17}/>
        </TouchableOpacity>
      </View>
    </LinearGradient>
    {expanded&&<View style={s.detail}>
      <View style={s.warning}>
        <Ionicons name="information-circle-outline" size={19} color="#92651D"/>
        <Text style={s.warningText}>This is a sample inside Donations, not an LGU-published or verified case. Contributions and receipts below are simulations in this browser session. Refreshing resets them.</Text>
      </View>
      <Text style={s.sectionTitle}>About this sample cause</Text>
      <Text style={s.body}>Estimated needs: dog food, basic treatment and supplies. Funding target {money(GOAL)} (illustrative). A real campaign requires the Resident's actual request, evidence, LGU verification, approved location and published public photo.</Text>
      <Text style={s.sectionTitle}>Try a sample donation</Text>
      <View style={s.presetRow}>
        {AMOUNTS.map(value=><TouchableOpacity key={value} accessibilityRole="button"
          style={[s.preset,amount===String(value)&&s.presetSelected]}
          onPress={()=>{setAmount(String(value));setNotice("");}}>
          <Text style={[s.presetText,amount===String(value)&&s.presetTextSelected]}>₱{value.toLocaleString("en-PH")}</Text>
        </TouchableOpacity>)}
      </View>
      <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric"
        placeholder="Custom sample amount" placeholderTextColor="#8DA99D" style={s.input}/>
      <TouchableOpacity accessibilityRole="button" style={[s.button,s.demoButton,remaining===0&&s.disabled]}
        disabled={remaining===0} onPress={recordDonation}>
        <Ionicons name="heart-outline" color="#FFFFFF" size={17}/>
        <Text style={s.buttonText}>{remaining===0?"Demo goal reached":"Simulate Donation · No Charge"}</Text>
      </TouchableOpacity>
      {!!notice&&<Text style={s.notice}>{notice}</Text>}
      {!!donations.length&&<View style={s.history}>
        <Text style={s.sectionTitle}>Sample donation history (not a real receipt)</Text>
        {donations.map((value,index)=><View key={index} style={s.historyRow}>
          <Text style={s.historyText}>DEMO-{String(index+1).padStart(3,"0")}</Text>
          <Text style={s.historyText}>{money(value)} · Simulated only</Text>
        </View>)}
        <TouchableOpacity onPress={()=>{setDonations([]);setNotice("");}} accessibilityRole="button">
          <Text style={s.reset}>Reset sample transactions</Text>
        </TouchableOpacity>
      </View>}
    </View>}
  </View>;
}
const s=StyleSheet.create({
 outer:{borderWidth:1,borderColor:"#BCE7D3",borderRadius:18,backgroundColor:"#FFFFFF",marginBottom:17,overflow:"hidden"},
 top:{flexDirection:"row",alignItems:"center",gap:7,paddingHorizontal:15,paddingVertical:12,flexWrap:"wrap"},
 overline:{fontSize:10,fontWeight:"800",letterSpacing:0.9,color:"#087B60",flexGrow:1},
 badge:{borderRadius:50,backgroundColor:"#FFF4D8",paddingHorizontal:10,paddingVertical:6},
 badgeText:{fontSize:9,fontWeight:"800",color:"#8D6417",letterSpacing:0.4},
 content:{flexDirection:"row",gap:17,padding:17,flexWrap:"wrap"},
 photoBox:{width:218,height:177,borderRadius:14,overflow:"hidden",backgroundColor:"#E3F5EB",borderWidth:1,borderColor:"#C5E5D4",position:"relative"},
 photo:{width:"100%",height:"100%"},
 photoEmpty:{flex:1,alignItems:"center",justifyContent:"center",gap:9},
 photoHint:{fontSize:10,fontWeight:"700",color:"#39846A"},
 photoBadge:{position:"absolute",bottom:9,left:9,borderRadius:30,paddingHorizontal:9,paddingVertical:6,backgroundColor:"rgba(255,255,255,0.94)",flexDirection:"row",alignItems:"center",gap:5},
 photoBadgeText:{fontSize:9,color:"#0A7159",fontWeight:"700"},
 copy:{flex:1,minWidth:210,justifyContent:"center",gap:9},
 title:{fontSize:20,fontWeight:"800",color:"#104A37",letterSpacing:-0.45},
 desc:{fontSize:12,color:"#567B6D",lineHeight:19,maxWidth:660},
 metric:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:8,marginTop:2},
 metricStrong:{fontSize:14,fontWeight:"800",color:"#08785A"},
 metricLight:{fontSize:11,color:"#6A887C"},
 track:{height:7,backgroundColor:"#D1E9DB",borderRadius:20,overflow:"hidden"},
 progress:{height:"100%",backgroundColor:"#0F9E72",borderRadius:20},
 button:{backgroundColor:"#078B6D",borderRadius:10,minHeight:43,paddingHorizontal:17,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:10,alignSelf:"flex-start",marginTop:2},
 buttonText:{color:"#FFFFFF",fontSize:12,fontWeight:"800"},
 detail:{padding:18,borderTopWidth:1,borderTopColor:"#D8EDE3",gap:11},
 warning:{borderRadius:11,padding:13,backgroundColor:"#FFF8E9",flexDirection:"row",alignItems:"flex-start",gap:9},
 warningText:{flex:1,fontSize:11,lineHeight:18,color:"#856536"},
 sectionTitle:{fontSize:14,fontWeight:"800",color:"#204A3D"},
 body:{fontSize:11.5,lineHeight:20,color:"#607E72"},
 presetRow:{flexDirection:"row",gap:8,flexWrap:"wrap"},
 preset:{borderRadius:10,borderWidth:1,borderColor:"#CDE2D7",backgroundColor:"#F6FBF8",paddingHorizontal:13,paddingVertical:9},
 presetSelected:{borderColor:"#0B9870",backgroundColor:"#E2F7EC"},
 presetText:{fontSize:11,fontWeight:"700",color:"#456B5B"},
 presetTextSelected:{color:"#067C5B"},
 input:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#CFE4D9",borderRadius:10,paddingHorizontal:13,paddingVertical:11,fontSize:13,color:"#214A3C",maxWidth:380},
 demoButton:{marginTop:0},
 disabled:{opacity:0.55},
 notice:{fontSize:11,color:"#6B745A",lineHeight:17},
 history:{gap:9,marginTop:4},
 historyRow:{flexDirection:"row",justifyContent:"space-between",gap:12,borderBottomWidth:1,borderBottomColor:"#E2EDE7",paddingVertical:7,flexWrap:"wrap"},
 historyText:{fontSize:11,color:"#496B5D",fontWeight:"600"},
 reset:{color:"#087F65",fontSize:11,fontWeight:"700",marginTop:6},
});
