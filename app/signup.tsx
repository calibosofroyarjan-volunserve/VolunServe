import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { signUpUser } from '../lib/firebaseAuth';

export default function Signup() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    email: '',
    address: '',
    occupation: '',
    password: '',
    confirmPassword: '',
    role: 'volunteer' as 'volunteer' | 'resident'
  });

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignup = async () => {
    const {
      fullName,
      phoneNumber,
      email,
      password,
      confirmPassword,
      address,
      occupation,
      role
    } = formData;

    if (!fullName || !phoneNumber || !email || !password) {
      Alert.alert('Error', 'Please fill required fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (!agreeTerms) {
      Alert.alert('Error', 'Accept terms to continue');
      return;
    }

    try {
      setLoading(true);

      await signUpUser({
        fullName,
        email,
        password,
        phoneNumber,
        address,
        occupation,
        role
      });

      Alert.alert('Success!', 'Account created!', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.title}>Create Your Account</Text>
      <Text style={styles.subtitle}>Join Volunserve SJDM</Text>

      <Field label="Full Name *" placeholder="Juan Dela Cruz" field="fullName" formData={formData} updateField={updateField} />
      <Field label="Phone Number *" placeholder="09XX XXX XXXX" field="phoneNumber" keyboard="phone-pad" formData={formData} updateField={updateField} />
      <Field label="Email Address *" placeholder="you@example.com" field="email" keyboard="email-address" formData={formData} updateField={updateField} />
      <Field label="Address in SJDM" placeholder="Barangay, SJDM" field="address" formData={formData} updateField={updateField} />
      <Field label="Occupation" placeholder="Software Engineer" field="occupation" formData={formData} updateField={updateField} />

      <View style={styles.field}>
        <Text style={styles.label}>I want to join as: *</Text>
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={formData.role}
            onValueChange={(v) => setFormData(p => ({ ...p, role: v as any }))}
            style={{ height: 50 }}
          >
            <Picker.Item label="Volunteer" value="volunteer" />
            <Picker.Item label="Resident" value="resident" />
          </Picker>
        </View>
      </View>

      <Field label="Password *" placeholder="••••••••" field="password" secure formData={formData} updateField={updateField} />
      <Field label="Confirm Password *" placeholder="••••••••" field="confirmPassword" secure formData={formData} updateField={updateField} />

      <TouchableOpacity style={styles.check} onPress={() => setAgreeTerms(!agreeTerms)}>
        <View style={[styles.box, agreeTerms && styles.boxOn]}>
          {agreeTerms && <Text style={{ color: '#fff', fontWeight: 'bold' }}>✓</Text>}
        </View>
        <Text style={styles.checkText}>I agree to terms and conditions</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, loading && { opacity: 0.5 }]}
        onPress={handleSignup}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Account</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/login')}>
        <Text style={styles.link}>
          Already have account? <Text style={{ color: '#4f46e5', fontWeight: '600' }}>Sign in</Text>
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({ label, placeholder, field, secure, keyboard, formData, updateField }: any) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        value={formData[field]}
        onChangeText={(v) => updateField(field, v)}
        secureTextEntry={secure}
        keyboardType={keyboard}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'words'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 20 },
  field: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#334155' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 14 },
  pickerBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, overflow: 'hidden' },
  check: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  box: { width: 20, height: 20, borderWidth: 2, borderColor: '#cbd5e1', borderRadius: 4, marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  boxOn: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  checkText: { flex: 1, fontSize: 13, color: '#64748b' },
  btn: { backgroundColor: '#4f46e5', padding: 16, borderRadius: 10, alignItems: 'center', marginBottom: 14 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', fontSize: 14, color: '#64748b' },
});
