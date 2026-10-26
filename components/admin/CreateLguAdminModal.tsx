
import Ionicons from "@expo/vector-icons/Ionicons";
import React, {useState} from "react";
import {ActivityIndicator,Modal,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View} from "react-native";
import {createAdminAccount} from "../../lib/adminAccounts";

type FormState={fullName:string;email:string;password:string;lguOffice:string;lguPosition:string;appointmentReference:string;credentialsReviewed:boolean};
const EMPTY:FormState={fullName:"",email:"",password:"",lguOffice:"",lguPosition:"",appointmentReference:"",credentialsReviewed:false};

/** Super Admin creates independent LGU login after reviewing external appointment evidence.
 * This is a manual authorization attestation, not automated government document verification.
 */
export default function CreateLguAdminModal({visible,onClose,onCreated}:{visible:boolean;onClose:()=>void;onCreated:(email:string)=>void}){
  const [form,setForm]=useState<FormState>(EMPTY);
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const update=(field:keyof FormState,value:string|boolean)=>setForm(old=>({...old,[field]:value}));
  const close=()=>{if(!busy){setError("");onClose();}};
  const submit=async()=>{
    if(busy)return;
    setError("");
    setBusy(true);
    try{
      const account=await createAdminAccount(form);
      setForm(EMPTY);
      setShowPassword(false);
      onCreated(account.email);
    }catch(err:any){setError(err?.message||"Could not create the Admin account. Check permissions and credentials.");}
    finally{setBusy(false);}
  };
  const fields:ReadonlyArray<{key:Exclude<keyof FormState,"credentialsReviewed">;label:string;hint:string}>=[
    {key:"fullName",label:"Full legal name",hint:"Match the verified LGU appointment"},
    {key:"email",label:"Authorized LGU Admin email",hint:"Separate email for this Admin login"},
    {key:"lguOffice",label:"LGU office / department",hint:"E.g. City Social Welfare"},
    {key:"lguPosition",label:"Official position",hint:"As shown on the appointment record"},
    {key:"appointmentReference",label:"Authorization memorandum reference",hint:"Memorandum/reference only — not an ID number"},
    {key:"password",label:"Temporary password",hint:"12+ characters, upper/lowercase, number & symbol"},
  ];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
    <View style={styles.shade}>
      <View style={styles.modal}>
        <View style={styles.header}>
          <View style={styles.headerIcon}><Ionicons name="shield-checkmark-outline" size={21} color="#0A8566"/></View>
          <View style={{flex:1}}>
            <Text style={styles.title}>Create LGU Admin</Text>
            <Text style={styles.caption}>A separate Firebase account for an authorized official.</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close creation dialog" disabled={busy} onPress={close}>
            <Ionicons name="close-circle-outline" size={24} color="#657F70"/>
          </TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator contentContainerStyle={styles.scroll}>
          <View style={styles.notice}><Ionicons name="information-circle-outline" size={18} color="#147A62"/>
            <Text style={styles.noticeText}>Review genuine LGU eligibility evidence outside the system before proceeding. This form records the Super Admin's manual decision; it does not authenticate government documents automatically.</Text>
          </View>
          {fields.map(field=><View key={field.key} style={styles.field}>
            <Text style={styles.label}>{field.label}</Text>
            <View style={styles.inputRow}>
              <TextInput value={form[field.key]} onChangeText={value=>update(field.key,value)}
                autoCapitalize={field.key==="email"?"none":"sentences"}
                keyboardType={field.key==="email"?"email-address":"default"}
                secureTextEntry={field.key==="password"&&!showPassword}
                placeholder={field.hint} placeholderTextColor="#91A99E"
                style={styles.input}/>
              {field.key==="password"&&<TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword?"Hide password":"Show password"} onPress={()=>setShowPassword(value=>!value)} style={styles.eye}>
                <Ionicons name={showPassword?"eye-off-outline":"eye-outline"} color="#618578" size={20}/>
              </TouchableOpacity>}
            </View>
          </View>)}
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:form.credentialsReviewed}}
            onPress={()=>update("credentialsReviewed",!form.credentialsReviewed)} style={styles.checkrow}>
            <Ionicons name={form.credentialsReviewed?"checkbox":"square-outline"} color="#0D8464" size={22}/>
            <Text style={styles.checkText}>I personally reviewed official LGU appointment/authorization evidence and confirmed this official is eligible for Admin access. I understand this action is audit logged.</Text>
          </TouchableOpacity>
          {!!error&&<View style={styles.error}><Ionicons name="alert-circle-outline" color="#C13730" size={18}/><Text style={styles.errorText}>{error}</Text></View>}
          <View style={styles.footer}>
            <TouchableOpacity disabled={busy} onPress={close} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy||!form.credentialsReviewed} onPress={()=>void submit()}
              style={[styles.submit,(busy||!form.credentialsReviewed)&&styles.disabled]}>
              {busy?<ActivityIndicator size="small" color="#FFFFFF"/>:<Ionicons name="person-add-outline" color="#FFFFFF" size={18}/>}
              <Text style={styles.submitText}>{busy?"Creating…":"Create Authorized Admin"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles=StyleSheet.create({
 shade:{flex:1,backgroundColor:"rgba(10,37,31,.66)",alignItems:"center",justifyContent:"center",padding:14},
 modal:{width:"100%",maxWidth:570,maxHeight:"92%",backgroundColor:"#FFFFFF",borderRadius:20,overflow:"hidden"},
 header:{flexDirection:"row",alignItems:"center",gap:12,padding:18,backgroundColor:"#F0FAF4",borderBottomWidth:1,borderBottomColor:"#D7ECDD"},
 headerIcon:{width:43,height:43,borderRadius:12,backgroundColor:"#E0F4E8",alignItems:"center",justifyContent:"center"},
 title:{fontSize:17,fontWeight:"900",color:"#194638"},
 caption:{fontSize:11,color:"#688578",marginTop:4,lineHeight:17},
 scroll:{padding:19,paddingBottom:24},
 notice:{backgroundColor:"#F0FAF5",borderRadius:11,padding:12,flexDirection:"row",gap:8,alignItems:"flex-start",marginBottom:15},
 noticeText:{color:"#4D7561",fontSize:11,lineHeight:18,flex:1},
 field:{marginBottom:13},
 label:{color:"#315649",fontSize:11,fontWeight:"800",marginBottom:7},
 inputRow:{flexDirection:"row",alignItems:"center",borderColor:"#D5E8DC",borderWidth:1,backgroundColor:"#FBFEFC",borderRadius:10,overflow:"hidden"},
 input:{flex:1,backgroundColor:"transparent",minHeight:43,color:"#1B493A",fontSize:12,paddingVertical:10,paddingHorizontal:12,minWidth:0},
 eye:{paddingHorizontal:12,paddingVertical:10},
 checkrow:{backgroundColor:"#EAF8EF",borderRadius:11,padding:12,flexDirection:"row",alignItems:"flex-start",gap:10,marginTop:4},
 checkText:{color:"#466E5D",fontSize:11,lineHeight:18,flex:1},
 error:{backgroundColor:"#FFF1EF",padding:12,borderRadius:9,flexDirection:"row",gap:8,marginTop:14,alignItems:"center"},
 errorText:{fontSize:11,color:"#B23630",lineHeight:18,flex:1},
 footer:{flexDirection:"row",justifyContent:"flex-end",flexWrap:"wrap",gap:10,marginTop:19},
 cancel:{borderColor:"#C8DDD1",borderWidth:1,borderRadius:10,paddingHorizontal:18,paddingVertical:12,justifyContent:"center"},
 cancelText:{fontSize:11,fontWeight:"800",color:"#497060"},
 submit:{backgroundColor:"#078261",borderRadius:10,paddingHorizontal:18,paddingVertical:12,flexDirection:"row",gap:8,alignItems:"center"},
 submitText:{fontSize:11,fontWeight:"900",color:"#FFFFFF"},
 disabled:{opacity:.5},
});
