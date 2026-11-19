import React from "react";
import {StyleSheet,Text,View} from "react-native";

type Props={password:string};

export default function SignupPasswordStrength({password}:Props){
  if (!password) return null;
  const checks=[
    {label:"8 or more characters",ok:password.length>=8},
    {label:"Uppercase and lowercase letters",ok:/[A-Z]/.test(password)&&/[a-z]/.test(password)},
    {label:"At least one number",ok:/[0-9]/.test(password)},
    {label:"At least one special character",ok:/[^A-Za-z0-9]/.test(password)},
  ];
  const score=checks.filter(v=>v.ok).length;
  const tone=score>=4?"#047857":score>=3?"#a16207":"#b91c1c";
  const name=score>=4?"Strong":score>=3?"Almost there":"Needs improvement";
  return (
    <View style={styles.container}>
      <View style={styles.bars}>
        {checks.map((part,i)=><View
          key={part.label}
          style={[styles.bar,{backgroundColor:i<score?tone:"#e2e8f0"}]}
        />)}
      </View>
      <Text style={[styles.status,{color:tone}]}>{name}</Text>
      {checks.map(({label,ok})=>(
        <View key={label} style={styles.row}>
          <Text style={[styles.marker,ok&&styles.good]}>{ok?"✓":"○"}</Text>
          <Text style={[styles.requirement,ok&&styles.requirementGood]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles=StyleSheet.create({
  container:{marginTop:-4,marginBottom:17,paddingHorizontal:2},
  bars:{flexDirection:"row",gap:7,marginBottom:8},
  bar:{height:5,borderRadius:4,flex:1},
  status:{fontSize:12.5,fontWeight:"800",marginBottom:7},
  row:{flexDirection:"row",alignItems:"center",marginVertical:2},
  marker:{width:22,fontSize:16,color:"#64748b"},
  good:{color:"#047857"},
  requirement:{fontSize:12.5,color:"#64748b"},
  requirementGood:{color:"#166534"},
});
