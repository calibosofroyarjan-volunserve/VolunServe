import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { loginUser } from "../lib/firebaseAuth";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    try {
      setLoading(true);
      await loginUser(email.trim(), password);
      router.replace("/(tabs)");
    } catch (error: any) {
      Alert.alert("Login Failed", error.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={["#0f766e", "#14b8a6"]}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.wrapper}>
        
        {/* LOGO */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/images/logo.png")}
            style={styles.logo}
            resizeMode="cover"
          />
        </View>

        <Text style={styles.brandTitle}>VolunServe</Text>
        <Text style={styles.brandSub}>
          Disaster Relief & Donation Platform
        </Text>

        {/* FORM */}
        <View style={styles.formCard}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#94a3b8"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#94a3b8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/signup")}>
            <Text style={styles.link}>
              Don’t have an account? Sign Up
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  logoContainer: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    elevation: 20,
    marginBottom: 20,
  },

  logo: {
    width: "100%",
    height: "100%",
  },

  brandTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#ffffff",
  },

  brandSub: {
    fontSize: 14,
    color: "#e6fffa",
    marginBottom: 30,
  },

  formCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 25,
    elevation: 15,
  },

  input: {
    backgroundColor: "#f1f5f9",
    padding: 16,
    borderRadius: 16,
    marginBottom: 18,
  },

  button: {
    backgroundColor: "#0f766e",
    padding: 18,
    borderRadius: 18,
    alignItems: "center",
  },

  buttonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 17,
  },

  link: {
    textAlign: "center",
    marginTop: 20,
    color: "#0f766e",
    fontWeight: "700",
  },
});
