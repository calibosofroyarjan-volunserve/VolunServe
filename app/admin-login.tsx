import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import React, { useState } from "react";
import PremiumAuthShell, { authCornerCut } from "../components/auth/PremiumAuthShell";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { auth } from "../lib/firebase";
import {
  isApprovedProfile,
  loginUser,
} from "../lib/firebaseAuth";

/**
 * A dedicated sign-in ENTRY POINT for operational Admin and Super Admin accounts.
 * Accounts still use Firebase Authentication; this is not a second password database.
 * The root protected route guard, backend and Firestore rules remain authoritative.
 * Resident/Volunteer sessions must never gain administrative access.
 */
export default function AdministrativeLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const signIn = async () => {
    if (working) return;
    setError("");
    setNotice("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError("Enter your authorized administrative email and password.");
      return;
    }
    setWorking(true);
    try {
      if (Platform.OS === "web") {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      }
      const { profile } = await loginUser(cleanEmail, password);
      const admin = profile.role === "admin";
      const superAdmin = profile.role === "superadmin";
      const permitted =
        isApprovedProfile(profile) &&
        (superAdmin || (admin && profile.adminStatus !== "suspended"));
      if (!permitted) {
        // Reject a valid Resident/Volunteer password at this restricted entry.
        await signOut(auth);
        setError(profile.role === "applicant" ? "Your LGU staff application is awaiting independent Super Admin credential approval. You cannot access the Admin Command Center yet." : "This portal is reserved for an active Admin or Super Admin account. Residents should use the community sign-in.");
        return;
      }
      router.replace(
        (superAdmin ? "/(superadmin)" : "/(admin)/command-center") as any,
      );
    } catch (err: any) {
      setError(err?.message || "Sign-in failed. Please check your credentials.");
    } finally {
      setWorking(false);
    }
  };

  const resetPassword = async () => {
    if (working) return;
    setError("");
    setNotice("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Enter your administrative email first to request a reset.");
      return;
    }
    setWorking(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setNotice("If this email has an eligible password account, a reset link has been sent. Check your inbox and spam folder.");
    } catch (err: any) {
      if (err?.code === "auth/invalid-email") {
        setError("Enter a valid email address.");
      } else {
        setNotice("If this email has an eligible password account, check your inbox and spam folder.");
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PremiumAuthShell active="admin">
        <Text style={styles.label}>Administrative Email</Text>
        <View style={[styles.inputBox, authCornerCut(10)]}>
          <Ionicons name="mail-outline" size={21} color="#194F41" />
          <TextInput accessibilityLabel="Administrative email" style={styles.input}
            value={email} onChangeText={setEmail} editable={!working}
            autoCapitalize="none" autoCorrect={false} textContentType="emailAddress"
            autoComplete="email" keyboardType="email-address"
            placeholder="Email address" placeholderTextColor="#91A3AE" />
        </View>
        <Text style={[styles.label, { marginTop: 5 }]}>Password</Text>
        <View style={[styles.inputBox, authCornerCut(10)]}>
          <Ionicons name="lock-closed-outline" size={21} color="#657A89" />
          <TextInput accessibilityLabel="Administrative password" style={styles.input}
            value={password} onChangeText={setPassword} editable={!working}
            autoCapitalize="none" secureTextEntry={!showPassword}
            textContentType="password" autoComplete="password"
            placeholder="Password" placeholderTextColor="#91A3AE"
            onSubmitEditing={() => void signIn()} />
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            onPress={() => setShowPassword(value => !value)} disabled={working}
            style={styles.eye}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20} color="#245947" />
          </TouchableOpacity>
        </View>
        <View style={styles.options}>
          <TouchableOpacity accessibilityRole="checkbox"
            accessibilityState={{checked: rememberMe}}
            disabled={working} onPress={()=>setRememberMe(value=>!value)}
            style={styles.rememberRow}>
            <Ionicons name={rememberMe?"checkbox-outline":"square-outline"} size={20} color="#08795E"/>
            <Text style={styles.rememberText}>Remember me</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.forgot} accessibilityRole="button"
            disabled={working} onPress={() => void resetPassword()}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
        {!!error && (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel="Sign in to LGU administration"
          disabled={working} onPress={() => void signIn()}
          style={[styles.submit, working && styles.disabled]}>
          <LinearGradient colors={["#16A780","#00573F"]} start={{x:0,y:0}} end={{x:1,y:1}}
            style={StyleSheet.absoluteFillObject} pointerEvents="none"/>
          {working ? <ActivityIndicator color="#FFFFFF" /> :
            <View style={styles.rowCenter}>
              <Text style={styles.submitText}>Login as Admin</Text>
              <Ionicons name="arrow-forward-outline" size={20} color="#FFFFFF" />
            </View>}
        </TouchableOpacity>
        <View style={styles.divider}>
          <View style={styles.dividerLine}/>
          <Text style={styles.dividerText}>Authorized accounts only</Text>
          <View style={styles.dividerLine}/>
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/admin-request")}
          disabled={working} style={styles.outlineAction}>
          <Ionicons name="document-text-outline" size={19} color="#087B62" />
          <Text style={styles.outlineActionText}>Request LGU Admin Access</Text>
        </TouchableOpacity>
        <Text style={styles.footer}>LGU staff applicants receive no privileges until independently verified and approved by Super Admin.</Text>
      </PremiumAuthShell>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#E8FBEF"},
  label:{position:"absolute",opacity:0,width:0,height:0},
  inputBox:{minHeight:57,flexDirection:"row",alignItems:"center",
    paddingHorizontal:17,gap:12,backgroundColor:"rgba(255,255,255,.84)",
    borderWidth:1,borderColor:"#C8E0D2",borderRadius:13,marginBottom:4},
  input:{flex:1,minWidth:0,fontSize:15,paddingVertical:14,color:"#103F33"},
  eye:{padding:7},
  options:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",
    flexWrap:"wrap",gap:10,marginTop:3,marginBottom:2},
  rememberRow:{flexDirection:"row",alignItems:"center",gap:7,minHeight:42},
  rememberText:{color:"#527766",fontSize:13},
  forgot:{justifyContent:"center",minHeight:42},
  forgotText:{color:"#076B51",fontSize:13,fontWeight:"800"},
  errorBox:{flexDirection:"row",gap:8,padding:12,alignItems:"center",
    backgroundColor:"#FFF1ED",borderWidth:1,borderColor:"#FCD5C9",borderRadius:12},
  errorText:{flex:1,fontSize:12,lineHeight:18,color:"#B42318"},
  notice:{fontSize:12,lineHeight:18,color:"#08795E"},
  submit:{minHeight:59,overflow:"hidden",alignItems:"center",justifyContent:"center",
    borderRadius:16,backgroundColor:"#007F62",marginTop:6,
    shadowColor:"#00684A",shadowOpacity:0.18,shadowRadius:10,
    shadowOffset:{width:0,height:5},elevation:3},
  rowCenter:{flexDirection:"row",gap:11,justifyContent:"center",alignItems:"center"},
  submitText:{color:"#FFFFFF",fontWeight:"800",fontSize:16},
  disabled:{opacity:0.55},
  divider:{flexDirection:"row",alignItems:"center",gap:10,marginTop:8,marginBottom:4},
  dividerLine:{flex:1,height:1,backgroundColor:"#CAE0D5"},
  dividerText:{color:"#648577",fontSize:12},
  outlineAction:{minHeight:54,flexDirection:"row",alignItems:"center",
    justifyContent:"center",gap:10,borderRadius:17,
    borderWidth:1,borderColor:"#A5CEBA",backgroundColor:"rgba(255,255,255,.40)"},
  outlineActionText:{color:"#075B44",fontWeight:"800",fontSize:15},
  footer:{color:"#668777",textAlign:"center",fontSize:11,lineHeight:17,marginTop:4},
});
