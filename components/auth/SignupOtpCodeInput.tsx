import React, {useRef} from "react";
import {Pressable, StyleSheet, Text, TextInput, View} from "react-native";
import {sanitizeSignupOtpInput} from "../../lib/signupEmailOtp";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
};

/** One real input supports paste/OS autofill while six visible cells match
 * the familiar email-code experience. Never persist the code on device.
 */
export default function SignupOtpCodeInput({value,onChange,disabled=false,invalid=false}: Props) {
  const ref=useRef<TextInput>(null);
  const digits=sanitizeSignupOtpInput(value);
  return (
    <View style={styles.group}>
      <Text style={styles.label}>6-digit verification code</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Enter the six-digit email verification code"
        disabled={disabled}
        onPress={() => ref.current?.focus()}
        style={styles.cellRow}
      >
        {Array.from({length:6},(_,index)=>(
          <View key={index} style={[styles.cell,
            invalid && styles.invalidCell,
            index===digits.length && !disabled && styles.focusCell,
          ]}>
            <Text style={styles.digit}>{digits[index] || ""}</Text>
          </View>
        ))}
        <TextInput
          ref={ref}
          testID="resident-email-otp-input"
          value={digits}
          onChangeText={next=>onChange(sanitizeSignupOtpInput(next))}
          editable={!disabled}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          style={styles.realInput}
          accessibilityLabel="Six-digit code"
        />
      </Pressable>
      <Text style={styles.tip}>Enter or paste the code sent to your inbox. Expires after 10 minutes.</Text>
    </View>
  );
}

const styles=StyleSheet.create({
  group:{marginVertical:16},
  label:{fontSize:13,fontWeight:"700",color:"#0f172a",marginBottom:10},
  cellRow:{flexDirection:"row",gap:7,position:"relative",alignItems:"center"},
  cell:{flex:1,minWidth:0,height:58,borderRadius:10,borderColor:"#cbd5e1",
    borderWidth:1,backgroundColor:"#fff",alignItems:"center",justifyContent:"center"},
  focusCell:{borderColor:"#0f766e",borderWidth:2},
  invalidCell:{borderColor:"#dc2626"},
  digit:{fontSize:22,fontWeight:"700",color:"#0f172a"},
  realInput:{position:"absolute",left:0,top:0,width:"100%",height:"100%",opacity:0.01,
    color:"transparent",fontSize:20},
  tip:{fontSize:12,color:"#64748b",lineHeight:18,marginTop:11},
});
