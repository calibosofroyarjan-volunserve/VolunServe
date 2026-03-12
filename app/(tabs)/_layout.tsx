import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { auth, db } from "../../lib/firebase";

export default function TabsLayout() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthenticated(false);
        setLoading(false);
      } else {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          const userRole = snap.data()?.role?.trim().toLowerCase();
          setRole(userRole);
          setAuthenticated(true);
        } catch (err) {
          console.log("Role fetch error:", err);
          setAuthenticated(false);
        } finally {
          setLoading(false);
        }
      }
    });

    return unsub;
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }

  if (!authenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0f766e",
        tabBarInactiveTintColor: "#94a3b8",

        tabBarStyle: {
          backgroundColor: "#ffffff",
          height: 70,
          paddingBottom: 10,
          paddingTop: 6,
          borderTopWidth: 0.5,
          borderColor: "#e2e8f0",
          elevation: 8,
        },

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >

      {/* HOME */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      {/* RESIDENTS */}
      <Tabs.Screen
        name="resident"
        options={{
          title: "Residents",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" size={size} color={color} />
          ),
        }}
      />

      {/* DISASTER RESPONSE */}
      <Tabs.Screen
        name="disaster-response"
        options={{
          title: "Disaster",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="warning-outline" size={size} color={color} />
          ),
        }}
      />

      {/* VOLUNTEER */}
      <Tabs.Screen
        name="volunteer"
        options={{
          title: "Volunteer",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />

      {/* MAP TRACKING */}
      <Tabs.Screen
        name="map-tracking"
        options={{
          title: "Map",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />

      {/* DONATIONS */}
      <Tabs.Screen
        name="donation"
        options={{
          title: "Donations",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" size={size} color={color} />
          ),
        }}
      />

      {/* PROFILE */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />

      {/* VOLUNTEER IMPACT */}
      <Tabs.Screen
        name="volunteer-impact"
        options={{
          title: "Impact",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ribbon-outline" size={size} color={color} />
          ),
        }}
      />

    </Tabs>
  );
}