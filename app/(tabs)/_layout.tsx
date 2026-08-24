import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const visibleTabs = [
  {
    name: "index",
    label: "Home",
    activeIcon: "home",
    inactiveIcon: "home-outline",
  },
  {
    name: "map-tracking",
    label: "Map",
    activeIcon: "location",
    inactiveIcon: "location-outline",
  },
  {
    name: "disaster-response",
    label: "Report",
    activeIcon: "alert-circle",
    inactiveIcon: "alert-circle-outline",
  },
  {
    name: "volunteer",
    label: "Events",
    activeIcon: "calendar",
    inactiveIcon: "calendar-outline",
  },
  {
    name: "profile",
    label: "Profile",
    activeIcon: "person",
    inactiveIcon: "person-outline",
  },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    />
  );
}

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.tabBarWrapper,
        {
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
      ]}
    >
      <View style={styles.tabBar}>
        {visibleTabs.map((item) => {
          const routeIndex = state.routes.findIndex(
            (route: any) => route.name === item.name
          );

          if (routeIndex === -1) return null;

          const route = state.routes[routeIndex];
          const focused = state.index === routeIndex;

          return (
            <Pressable
              key={item.name}
              style={({ pressed }) => [
                styles.tabItem,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            >
              <View
                style={[
                  styles.tabInner,
                  focused && styles.tabInnerActive,
                ]}
              >
                <Ionicons
                  name={
                    focused
                      ? (item.activeIcon as any)
                      : (item.inactiveIcon as any)
                  }
                  size={24}
                  color={focused ? "#078F82" : "#7A8799"}
                />

                <Text
                  style={[
                    styles.tabText,
                    focused && styles.tabTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E6EDF2",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 10,
  },

  tabBar: {
    height: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingTop: 8,
  },

  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  tabInner: {
    minWidth: 64,
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  tabInnerActive: {
    backgroundColor: "#E7F8F4",
  },

  tabText: {
    fontSize: 11.5,
    color: "#7A8799",
    marginTop: 3,
    fontWeight: "500",
  },

  tabTextActive: {
    color: "#078F82",
    fontWeight: "800",
  },
});