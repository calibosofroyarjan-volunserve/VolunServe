
import Ionicons from "@expo/vector-icons/Ionicons";
import {useRouter} from "expo-router";
import React,{useState} from "react";
import {ActivityIndicator,Alert,ScrollView,Text,TouchableOpacity,useWindowDimensions,View} from "react-native";
import {activeModeForProfile,hasVolunteerAccess,setActiveUserMode} from "../../lib/firebaseAuth";
import {useUserSession} from "../../lib/useUserSession";

/** Contextual progress, not a second registration flow or authentication bypass.
 *  Resident and Volunteer always share the same signed-in account.
 */
export default function RoleJourney(){
  const {width}=useWindowDimensions();
  const mobile=width<680;
  const router=useRouter();
  const {user,profile}=useUserSession();
  const [busy,setBusy]=useState(false);
  if(!user||!profile||profile.role==="admin"||profile.role==="superadmin")return null;
  const isVerified=profile.identityVerified===true||profile.identityStatus==="verified";
  const isPending=profile.identityStatus==="pending";
  const approvedVolunteer=hasVolunteerAccess(profile);
  const volunteerMode=approvedVolunteer&&activeModeForProfile(profile)==="volunteer";
  const stages=[
    {label:"Resident account",done:true},
    {label:"Identity verified",done:isVerified},
    {label:"Volunteer approved",done:approvedVolunteer},
    {label:"Volunteer mode",done:volunteerMode},
  ];
  const next=isPending&&!isVerified
    ? {title:"Identity review pending",detail:"Your ID/selfie is awaiting a decision. You can view the status without starting another account.",button:"View Verification",route:"/identity-verification"}
    : !isVerified
    ? {title:"Verify your identity",detail:"Complete the ID and selfie review to unlock protected Resident services.",button:"Start Verification",route:"/identity-verification"}
    : !approvedVolunteer
    ? {title:"Verified Resident",detail:"You can request assistance and submit event proposals. Apply separately if you want Volunteer access.",button:"Volunteer Application",route:"/volunteer-application"}
    : volunteerMode
    ? {title:"Approved Volunteer",detail:"Your existing Resident account is in Volunteer Mode. Review assigned tasks and progress.",button:"View Volunteer Tasks",route:"/volunteer"}
    : {title:"Volunteer access approved",detail:"Your Resident access stays available. Switch to Volunteer Mode without signing up again.",button:"Switch to Volunteer",route:"mode"};
  const action=async()=>{
    if(busy)return;
    if(next.route!=="mode"){router.push(next.route as any);return;}
    setBusy(true);
    try{
      await setActiveUserMode("volunteer");
      router.replace("/(tabs)");
    }catch(error:any){
      Alert.alert("Unable to switch mode",error?.message||"Please try again.");
    }finally{setBusy(false);}
  };
  return <View style={{backgroundColor:"#FFFFFF",borderRadius:16,borderWidth:1,borderColor:"#DCEBE3",padding:mobile?13:17,marginBottom:mobile?15:19}}>
    <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:12}}>
      <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
        <Ionicons name="trail-sign-outline" size={17} color="#08785D"/>
        <Text style={{fontSize:12,fontWeight:"900",color:"#194838"}}>Your account journey</Text>
      </View>
      <View style={{paddingHorizontal:9,paddingVertical:5,borderRadius:30,backgroundColor:"#E7F7ED"}}>
        <Text style={{fontSize:9,fontWeight:"800",color:"#0C8064"}}>{volunteerMode?"VOLUNTEER":isVerified?"VERIFIED RESIDENT":"BASIC RESIDENT"}</Text>
      </View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexGrow:1,gap:6,alignItems:"center",paddingVertical:4}}>
      {stages.map((step,index)=><React.Fragment key={step.label}>
        {index>0&&<Ionicons name="chevron-forward" size={12} color="#9AB9A9"/>}
        <View style={{backgroundColor:step.done?"#E5F8EC":"#F4F7F5",borderRadius:9,paddingHorizontal:10,paddingVertical:9,flexDirection:"row",alignItems:"center",gap:6}}>
          <Ionicons name={step.done?"checkmark-circle":"ellipse-outline"} size={15} color={step.done?"#087B5F":"#9FB3AA"}/>
          <Text style={{color:step.done?"#127354":"#769184",fontSize:10,fontWeight:step.done?"800":"600"}}>{step.label}</Text>
        </View>
      </React.Fragment>)}
    </ScrollView>
    <View style={{flexDirection:mobile?"column":"row",alignItems:mobile?"stretch":"center",gap:10,marginTop:10,backgroundColor:"#F5FAF7",borderRadius:12,padding:12}}>
      <View style={{flex:1}}>
        <Text style={{fontSize:12,fontWeight:"800",color:"#21483C"}}>{next.title}</Text>
        <Text style={{fontSize:10.5,lineHeight:17,color:"#6A8A7A",marginTop:4}}>{next.detail}</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void action()}
        style={{paddingHorizontal:15,paddingVertical:10,backgroundColor:"#078A69",borderRadius:9,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,opacity:busy?0.6:1}}>
        {busy?<ActivityIndicator color="#FFFFFF" size="small"/>:<Ionicons name="arrow-forward" color="#FFFFFF" size={15}/>}
        <Text style={{color:"#FFFFFF",fontSize:11,fontWeight:"800"}}>{next.button}</Text>
      </TouchableOpacity>
    </View>
  </View>;
}
