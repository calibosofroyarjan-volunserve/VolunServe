import { Ionicons } from "@expo/vector-icons";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut,
} from "firebase/auth";
import React from "react";
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { firebaseConfig, usingFirebaseEmulators } from "../../lib/firebase";

/** Applicant-authenticated withdrawal; no public ID media, tokens or URLs. */
export default function LguStaffWithdrawalPanel() {
  const [email,setEmail]=React.useState("");
  const [password,setPassword]=React.useState("");
  const [busy,setBusy]=React.useState(false);
  const [message,setMessage]=React.useState("");
  const [completed,setCompleted]=React.useState(false);
  const submit=async()=>{
    if(busy||completed)return;
    setMessage("");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())||!password){
      setMessage("Enter the email and password used in the original staff application.");
      return;
    }
    const emulatorRequested=process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS==="true";
    if(emulatorRequested&&!usingFirebaseEmulators){
      setMessage("Native emulator routing is unavailable. Synthetic applicants must never contact production.");
      return;
    }
    const configured=process.env.EXPO_PUBLIC_LGU_FACE_SCREEN_API_URL?.trim();
    if(usingFirebaseEmulators&&!configured){
      setMessage("Configure the local test-only privacy backend before emulator testing.");
      return;
    }
    const base=(configured||
      process.env.EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL?.trim()||
      "https://volunserve.onrender.com")
      .replace(/\/api\/identity\/(verify|status|engine-health)\/?$/,"")
      .replace(/\/+$/,"");
    const localEndpoint=/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
    if(usingFirebaseEmulators?!localEndpoint:!/^https:\/\//.test(base)){
      setMessage("Private withdrawal requires a protected backend in this environment.");
      return;
    }
    setBusy(true);
    const temporaryApp=initializeApp(firebaseConfig,"lgu-withdrawal-"+Date.now());
    const auth=getAuth(temporaryApp);
    try{
      if(usingFirebaseEmulators){
        connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
      }
      const credential=await signInWithEmailAndPassword(auth,email.trim().toLowerCase(),password);
      const token=await credential.user.getIdToken();
      const response=await fetch(base+"/api/lgu-staff/privacy/request-withdrawal",{
        method:"POST",
        headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        body:"{}",
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result.ok!==true){
        throw new Error("Unable to process withdrawal. Contact the authorized system administrator.");
      }
      setCompleted(true);
      setMessage("Withdrawal requested successfully. Admin access is blocked. Private evidence removal requires separate controlled processing; the account is not deleted.");
    }catch{
      setMessage("Could not verify this applicant or complete withdrawal. Check the credentials and private backend.");
    }finally{
      setPassword("");
      await signOut(auth).catch(()=>undefined);
      await deleteApp(temporaryApp).catch(()=>undefined);
      setBusy(false);
    }
  };
  return (
    <View style={styles.panel}>
      <View style={styles.titleRow}>
        <Ionicons name="shield-outline" size={20} color="#08775D"/>
        <Text style={styles.heading}>Withdraw an existing LGU application</Text>
      </View>
      <Text style={styles.help}>
        Sign in with the original applicant account. Withdrawal prevents Admin approval and creates a private evidence-deletion request. Evidence is erased separately by an authorized Super Admin; your account and audit records are not automatically deleted.
      </Text>
      {!completed&&<>
        <Text style={styles.label}>Applicant email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail}
          editable={!busy} autoCapitalize="none" autoCorrect={false}
          autoComplete="email" keyboardType="email-address"
          placeholder="Official applicant email" placeholderTextColor="#8EA89E"/>
        <Text style={styles.label}>Applicant password</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword}
          editable={!busy} secureTextEntry autoComplete="off" autoCorrect={false}
          placeholder="Password" placeholderTextColor="#8EA89E"/>
        <TouchableOpacity accessibilityRole="button" disabled={busy}
          style={[styles.button,busy&&styles.disabled]} onPress={()=>void submit()}>
          {busy?<ActivityIndicator color="#FFFFFF"/>:<Text style={styles.buttonLabel}>
            Confirm withdrawal request
          </Text>}
        </TouchableOpacity>
      </>}
      {!!message&&<Text accessibilityRole="alert" style={completed?styles.success:styles.help}>{message}</Text>}
    </View>
  );
}
const styles=StyleSheet.create({
  panel:{backgroundColor:"#EDF9F2",borderColor:"#B6DEC8",borderWidth:1,borderRadius:14,
    padding:16,gap:9,marginTop:8},
  titleRow:{flexDirection:"row",alignItems:"center",gap:7},
  heading:{fontSize:15,fontWeight:"800",color:"#14523F",flex:1},
  help:{fontSize:12,color:"#496F5E",lineHeight:19},
  label:{fontSize:12,fontWeight:"700",color:"#235741"},
  input:{minHeight:45,borderWidth:1,borderColor:"#BCD9CA",borderRadius:10,
    backgroundColor:"#FFFFFF",paddingHorizontal:12,color:"#173E31",fontSize:14},
  button:{minHeight:45,borderRadius:10,backgroundColor:"#08775D",
    alignItems:"center",justifyContent:"center",paddingHorizontal:12},
  buttonLabel:{fontSize:13,fontWeight:"800",color:"#FFFFFF"},
  disabled:{opacity:0.6},
  success:{color:"#08775D",fontWeight:"700",lineHeight:19,fontSize:12},
});
