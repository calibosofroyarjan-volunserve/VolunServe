import React from "react";

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Stack } from "expo-router";

import {
  GestureHandlerRootView,
} from "react-native-gesture-handler";

import { useFonts } from "expo-font";

const ioniconsFont = require(
  "@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"
);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Ionicons: ioniconsFont,
    ionicons: ioniconsFont,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator
          size="large"
          color="#078C83"
        />

        <Text style={styles.loadingText}>
          Loading VolunServe...
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(public)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(superadmin)" />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },

  loadingText: {
    marginTop: 10,
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
  },
});