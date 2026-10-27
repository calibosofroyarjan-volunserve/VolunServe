import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { deleteApp, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, deleteUser, getAuth, sendEmailVerification, signOut } from "firebase/auth";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SJDM_BARANGAYS } from "../constants/sjdmBarangays";
import { firebaseConfig } from "../lib/firebase";

/** Applicant registration creates NO Admin permissions. Only Super Admin can verify and grant Admin role. */
export default function LguStaffApplication() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName:"",email:"",password:"",lguOffice:"",lguPosition:"",appointmentReference:"",barangay:"" });
  const [busy,setBusy]=useState(false);
  const [success,setSuccess]=useState(false);
  const [error,setError]=useState("");
  const update=(key:keyof typeof form,value:string)=>setForm(old=>({...old,[key]:value}));

  const submit=async()=>{
    if(busy)return;
    setError("");
    const fullName=form.fullName.trim().replace(/\s+/g," ");
    const email=form.email.trim().toLowerCase();
    const office=form.lguOffice.trim(),position=form.lguPosition.trim(),reference=form.appointmentReference.trim();
    if(fullName.length<5||fullName.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||
      office.length<3||office.length>160||position.length<3||position.length>120||
      reference.length<5||reference.length>160||form.password.length<12||
      !/[A-Z]/.test(form.password)||!/[a-z]/.test(form.password)||!/[0-9]/.test(form.password)||
      !/[^a-zA-Z0-9]/.test(form.password)||!SJDM_BARANGAYS.includes(form.barangay)){
      setError("Complete all official LGU details, select a valid SJDM barangay and use a 12+ character password with upper/lowercase, number and symbol.");
      return;
    }
    setBusy(true);
    const app=initializeApp(firebaseConfig,"lgu-application-"+Date.now());
    const candidateAuth=getAuth(app);
    const candidateDb=getFirestore(app);
    let newUser:Awaited<ReturnType<typeof createUserWithEmailAndPassword>>["user"]|null=null;
    try{
      newUser=(await createUserWithEmailAndPassword(candidateAuth,email,form.password)).user;
      await setDoc(doc(candidateDb,"users",newUser.uid),{
        uid:newUser.uid,email,fullName,age:0,phoneNumber:"",
        role:"applicant",status:"pending_review",residentAccess:false,volunteerAccess:false,
        region:"Region III – Central Luzon",province:"Bulacan",city:"City of San Jose del Monte",
        barangay:form.barangay,lguOffice:office,lguPosition:position,
        appointmentReference:reference,createdAt:serverTimestamp(),
      });
      void sendEmailVerification(newUser).catch(()=>undefined);
      setForm({fullName:"",email:"",password:"",lguOffice:"",lguPosition:"",appointmentReference:"",barangay:""});
      setSuccess(true);
    }catch(err:any){
      // Roll back newly created Auth account when Firestore application fails.
      if(newUser)await deleteUser(newUser).catch(()=>undefined);
      setError(err?.message||"Could not submit your request. No administrative access has been granted.");
    }finally{
      await signOut(candidateAuth).catch(()=>undefined);
      await deleteApp(app).catch(()=>undefined);
      setBusy(false);
    }
  };
  const fields:[
    keyof typeof form,string,string,boolean
  ][]=[
    ["fullName","Full legal name","Authorized LGU employee's name",false],
    ["email","Official work email","name@example.gov.ph",false],
    ["lguOffice","LGU office / department","City department or office",false],
    ["lguPosition","Position / designation","As stated in appointment",false],
    ["appointmentReference","Appointment reference","Official non-sensitive memo/reference",false],
    ["password","Create a password","12+ characters with mixed characters",true],
  ];
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS==="ios"?"padding":undefined}>
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.panel}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark-outline" size={28} color="#087D60"/>
          <View style={{flex:1}}>
            <Text style={styles.kicker}>VOLUNSERVE · LGU STAFF</Text>
            <Text style={styles.title}>Request LGU Admin Access</Text>
          </View>
        </View>
        {success ? <>
          <Text style={styles.success}>Application submitted. Your account has no Admin privileges while pending. A Super Admin must independently confirm your LGU appointment before granting access. Check your email for verification instructions.</Text>
          <TouchableOpacity style={styles.submit} onPress={()=>router.replace("/admin-login")}>
            <Text style={styles.submitText}>Return to Admin Login</Text>
          </TouchableOpacity>
        </> : <>
          <Text style={styles.notice}>This is an application, not instant Admin registration. Only authorized LGU personnel should apply. The programmer Super Admin verifies eligibility against official LGU records. No Google Sign-In or government ID upload is required.</Text>
          {fields.map(([key,label,hint,secret])=><View key={key} style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput style={styles.input} placeholder={hint} placeholderTextColor="#8CA89A"
              value={form[key]} onChangeText={v=>update(key,v)} editable={!busy}
              autoCapitalize={key==="email"?"none":"sentences"}
              autoCorrect={false} secureTextEntry={secret}
              keyboardType={key==="email"?"email-address":"default"}/>
          </View>)}
          <View style={styles.field}>
            <Text style={styles.label}>Assigned barangay (San Jose del Monte)</Text>
            <ScrollView style={styles.barangays} nestedScrollEnabled>
              {SJDM_BARANGAYS.map(name=><TouchableOpacity key={name} accessibilityRole="radio"
                accessibilityState={{checked:form.barangay===name}}
                onPress={()=>update("barangay",name)} style={[styles.option,form.barangay===name&&styles.selected]}>
                <Text style={{color:form.barangay===name?"#FFFFFF":"#245644",fontSize:12}}>{name}</Text>
              </TouchableOpacity>)}
            </ScrollView>
            {!!form.barangay&&<Text style={styles.selection}>Selected: {form.barangay}</Text>}
          </View>
          {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <TouchableOpacity accessibilityRole="button" style={[styles.submit,busy&&{opacity:.6}]}
            disabled={busy} onPress={()=>void submit()}>
            {busy?<ActivityIndicator color="#FFFFFF"/>:<Text style={styles.submitText}>Submit for Super Admin Verification</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>router.replace("/admin-login")} style={{alignItems:"center",padding:12}}>
            <Text style={{color:"#087D60",fontWeight:"700"}}>Back to LGU Admin Login</Text>
          </TouchableOpacity>
        </>}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:"#F3F8F5"},screen:{padding:18,minHeight:"100%",justifyContent:"center",alignItems:"center"},
 panel:{width:"100%",maxWidth:590,backgroundColor:"#FFFFFF",borderColor:"#DCE9E2",borderWidth:1,
   borderRadius:18,padding:25,gap:8},header:{flexDirection:"row",alignItems:"center",gap:13,marginBottom:13},
 kicker:{fontSize:10,fontWeight:"800",color:"#087D60",letterSpacing:1.4},
 title:{fontSize:23,fontWeight:"900",color:"#153B31"},notice:{fontSize:12,lineHeight:19,color:"#57776A",
   backgroundColor:"#EDF8F1",borderRadius:11,padding:14,marginBottom:9},
 field:{gap:6,marginBottom:6},label:{fontSize:12,fontWeight:"800",color:"#2D5747"},
 input:{borderWidth:1,borderColor:"#D6E6DD",backgroundColor:"#FAFCFA",borderRadius:10,
   paddingHorizontal:13,minHeight:45,color:"#173B2E"},
 barangays:{maxHeight:142,borderWidth:1,borderColor:"#D6E6DD",borderRadius:10},
 option:{paddingVertical:10,paddingHorizontal:13,borderBottomWidth:1,borderBottomColor:"#EAF3ED"},
 selected:{backgroundColor:"#087D60"},selection:{color:"#087D60",fontSize:11},
 error:{fontSize:12,color:"#AD2733",backgroundColor:"#FFF3F1",borderRadius:9,padding:11},
 success:{color:"#185C47",fontSize:13,lineHeight:22,padding:17,backgroundColor:"#E7F8ED",borderRadius:12},
 submit:{backgroundColor:"#087D60",borderRadius:10,alignItems:"center",justifyContent:"center",
   paddingVertical:14,minHeight:49,marginTop:10},submitText:{color:"#FFFFFF",fontSize:13,fontWeight:"800"}
});
