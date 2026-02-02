import { Tabs } from 'expo-router';
import React from 'react';

export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { backgroundColor: '#f8fafc', height: 70 },
      }}
    >
      {/* Dashboard */}
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />

      {/* Main pages */}
      <Tabs.Screen name="donation" options={{ title: 'Donation' }} />
      <Tabs.Screen name="volunteer" options={{ title: 'Volunteer' }} />
      <Tabs.Screen name="disaster-volunteer" options={{ title: 'Disaster Volunteer' }} />
      <Tabs.Screen name="map-tracking" options={{ title: 'Map Tracking' }} />
    </Tabs>
  );
}
