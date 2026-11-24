import React, { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { auth, firebaseConfig } from "../lib/firebase";

// Live website page; ONLY the dedicated QA backend handles Didit Sandbox.
// No Firestore imports, no production role or Resident state writes.
const demoActive = process.env.EXPO_PUBLIC_DIDIT_PRESENTATION_ENABLED === "true" &&
  firebaseConfig.projectId === "volunserve-3aa5b" &&
  (process.env.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET || "production") === "production";
const API = "https://volunserve-didit-qa-backend.onrender.com/api/demo/didit";

type Status = "demo_approved_simulated" | "demo_school_id_flagged" |
  "demo_declined" | "demo_review_or_processing";
async function callApi(path:string, method:"GET"|"POST", data?:object) {
  if (!demoActive) throw new Error("Didit Sandbox presentation is currently disabled.");
  const user = auth.currentUser;
  if (!user || !user.emailVerified) throw new Error("Sign in with a verified-email test Resident account.");
  const idToken = await user.getIdToken();
  const res = await fetch(API+path, {
    method,
    headers: { Authorization:"Bearer "+idToken, "Content-Type":"application/json" },
    ...(method === "POST" ? {body:JSON.stringify(data || {})} : {}),
  });
  const json:any=await res.json().catch(()=>({}));
  if (!res.ok) {
    const messages:Record<string,string> = {
      demo_test_account_only:"This production account has not been authorized for the thesis demo.",
      presentation_demo_disabled:"Presentation mode is not yet enabled on the QA backend.",
      didit_sandbox_unavailable:"Unable to start the Didit Sandbox. Check the Sandbox workflow and API key.",
      demo_limit_reached:"The demonstration session limit was reached.",
      invalid_demo_session:"Your demo session expired. Start a new presentation session.",
    };
    throw new Error(messages[json.error]||json.message||"Didit demo server could not complete the request.");
  }
  return json;
}
export default function DiditSandboxPresentation() {
  const router=useRouter();
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [token,setToken]=useState("");
  const [status,setStatus]=useState<Status|null>(null);
  const [error,setError]=useState("");
  async function start() {
    if(!consent || busy)return;
    setBusy(true);setError("");
    try {
      const data=await callApi("/start","POST",{consent:true});
      const url=new URL(data.url);
      if(url.protocol!=="https:" || (url.hostname!=="didit.me" && !url.hostname.endsWith(".didit.me"))) {
        throw new Error("Unexpected verification destination.");
      }
      setToken(String(data.token||""));
      setStatus(null);
      await Linking.openURL(url.toString());
    } catch(e:any){setError(String(e?.message||"Could not start Sandbox."));}
    finally{setBusy(false);}
  }
  async function refresh() {
    if(!token || busy)return;
    setBusy(true);setError("");
    try {
      const data=await callApi("/status?token="+encodeURIComponent(token),"GET");
      setStatus(data.result as Status);
    } catch(e:any){setError(String(e?.message||"Could not refresh Sandbox."));}
    finally{setBusy(false);}
  }
  const statusText:Record<Status,string>={
    demo_approved_simulated:"Approved — SANDBOX SIMULATION ONLY",
    demo_school_id_flagged:"School/Student ID detected in reported document type — Demo declined",
    demo_declined:"Declined — SANDBOX SIMULATION ONLY",
    demo_review_or_processing:"Processing / Needs review — SANDBOX SIMULATION ONLY",
  };
  return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <View style={styles.card}>
      <Text style={styles.eyebrow}>VOLUNSERVE · THESIS DEMONSTRATION</Text>
      <Text style={styles.title}>Didit Identity Verification</Text>
      <Text style={styles.subtitle}>Sandbox walkthrough for an authorized demo account</Text>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>SANDBOX DEMO — Results are simulated. This page NEVER changes your VolunServe Resident role, identity verification status, or Firebase production records.</Text>
      </View>
      <Text style={styles.body}>Allowed document categories: Philippine National ID, Passport, and Driver's License. School IDs are not supported.</Text>
      <Text style={styles.body}>Didit Sandbox cannot reliably identify a School ID from the image or perform actual anti-spoofing and face verification. A selected National ID category does not prove the uploaded document is a National ID.</Text>
      <Text style={styles.body}>For a presentation, use synthetic/test data. Do not upload a real National ID or expose personal documents in a recording.</Text>
      {!demoActive ? <Text style={styles.error}>Presentation mode is disabled for this build.</Text> : (
        <>
          {!token ? (
            <TouchableOpacity style={styles.consent} onPress={()=>setConsent(v=>!v)} accessibilityRole="checkbox" accessibilityState={{checked:consent}}>
              <Text style={styles.body}>{consent?"☑":"☐"} I understand this is a simulated provider test; I consent to using Didit's Sandbox for the demo.</Text>
            </TouchableOpacity>
          ) : null}
          {!token ? <TouchableOpacity style={[styles.button,(!consent||busy)&&styles.disabled]} disabled={!consent||busy} onPress={()=>void start()}>
            <Text style={styles.buttonText}>{busy?"Connecting to Sandbox…":"Start Didit Sandbox Demo"}</Text>
          </TouchableOpacity> : (
            <TouchableOpacity style={[styles.button,busy&&styles.disabled]} disabled={busy} onPress={()=>void refresh()}>
              <Text style={styles.buttonText}>{busy?"Checking provider…":"Refresh Demo Result"}</Text>
            </TouchableOpacity>
          )}
          {status ? <View style={styles.result}><Text style={styles.resultText}>{statusText[status]||"Unknown demo result"}</Text></View> : null}
          {token&&!status ? <Text style={styles.body}>Complete the Didit flow in the new tab, return here, then press Refresh Demo Result.</Text> : null}
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>Back to Resident verification</Text></TouchableOpacity>
    </View>
  </ScrollView>;
}
const styles=StyleSheet.create({
  container:{flex:1,backgroundColor:"#F3F7FB"},
  content:{padding:24,alignItems:"center",justifyContent:"center",flexGrow:1},
  card:{width:"100%",maxWidth:640,backgroundColor:"#fff",borderRadius:16,padding:24,borderWidth:1,borderColor:"#DDE7F0"},
  eyebrow:{fontSize:11,fontWeight:"800",letterSpacing:1.3,color:"#0F766E",marginBottom:9},
  title:{fontSize:25,color:"#15355F",fontWeight:"800",marginBottom:8},
  subtitle:{fontSize:14,color:"#475569",marginBottom:16},
  notice:{backgroundColor:"#FFF7ED",padding:14,borderRadius:9,marginBottom:16},
  noticeText:{color:"#92400E",fontSize:13,lineHeight:20,fontWeight:"700"},
  body:{fontSize:13,color:"#475569",lineHeight:20,marginBottom:12},
  consent:{padding:12,borderColor:"#CBD5E1",borderWidth:1,borderRadius:9,marginVertical:6},
  button:{padding:16,backgroundColor:"#0F766E",borderRadius:9,marginVertical:12,alignItems:"center"},
  disabled:{opacity:0.45},
  buttonText:{fontSize:14,fontWeight:"800",color:"white"},
  result:{padding:14,borderRadius:9,backgroundColor:"#EFF6FF",marginVertical:12},
  resultText:{color:"#1D4ED8",fontSize:14,fontWeight:"800"},
  error:{color:"#B91C1C",fontSize:13,marginVertical:12},
  back:{alignSelf:"center",padding:12,marginTop:12},
  backText:{color:"#2563EB",fontWeight:"700"},
});
