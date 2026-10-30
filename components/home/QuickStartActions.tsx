import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

/**
 * One decision at a time: three main actions, with lower-frequency tasks
 * behind an optional, clearly-labelled disclosure.
 *
 * Navigation only. This component never changes roles, Firestore records,
 * authorization, payments, emergency dispatch, or location state.
 */
type QuickAction = {
  key: string;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  route?: string;
  volunteerAccess?: boolean;
  emergency?: boolean;
};

type Props = {
  mode: "resident" | "volunteer";
  volunteerApproved?: boolean;
  onNavigate: (route: string) => void;
  onVolunteerAccess: () => void | Promise<void>;
};

export default function QuickStartActions({
  mode, volunteerApproved = false, onNavigate, onVolunteerAccess,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const { width } = useWindowDimensions();
  const compact = width < 840;

  const main: QuickAction[] = mode === "volunteer" ? [
    {
      key: "emergency-tasks",
      title: "Emergency Tasks",
      description: "See invitations. Accept or decline an assignment.",
      icon: "alert-circle-outline",
      route: "/volunteer",
      emergency: true,
    },
    {
      key: "community-events",
      title: "Community Events",
      description: "Find events and record your attendance.",
      icon: "calendar-outline",
      route: "/(tabs)/community-events",
    },
    {
      key: "my-progress",
      title: "My Progress",
      description: "Review your service record and volunteer hours.",
      icon: "ribbon-outline",
      route: "/profile?tab=progress",
    },
  ] : [
    {
      key: "report-emergency",
      title: "Report an Emergency",
      description: "Report a fire, flood, accident, or other danger.",
      icon: "alert-circle-outline",
      route: "/disaster-response",
      emergency: true,
    },
    {
      key: "request-assistance",
      title: "Request Assistance",
      description: "Ask the LGU to review your need for support.",
      icon: "hand-left-outline",
      route: "/resident",
    },
    {
      key: "track-requests",
      title: "Track My Requests",
      description: "Check the status of your reports and requests.",
      icon: "document-text-outline",
      route: "/my-cases",
    },
  ];

  const more: QuickAction[] = mode === "volunteer" ? [
    {
      key: "certificates",
      title: "My Certificates",
      description: "View certificates in your Profile.",
      icon: "ribbon-outline",
      route: "/profile?tab=certificates",
    },
  ] : [
    {
      key: "events",
      title: "Community Events",
      description: "Join approved events or propose an activity.",
      icon: "calendar-outline",
      route: "/(tabs)/community-events",
    },
    {
      key: "donate",
      title: "Make a Donation",
      description: "Help an approved community campaign.",
      icon: "heart-outline",
      route: "/donation",
    },
    {
      key: "volunteer",
      title: volunteerApproved ? "Switch to Volunteer Mode" : "Become a Volunteer",
      description: volunteerApproved
        ? "Open your approved Volunteer workspace."
        : "Verify your identity and apply when eligible.",
      icon: "people-outline",
      volunteerAccess: true,
    },
  ];

  const renderAction = (action: QuickAction, secondary = false) => (
    <Pressable
      key={action.key}
      accessibilityRole="button"
      accessibilityLabel={action.title}
      accessibilityHint={action.description}
      onPress={() => {
        if (action.volunteerAccess) {
          void onVolunteerAccess();
        } else if (action.route) {
          onNavigate(action.route);
        }
      }}
      style={({ pressed }) => [
        styles.action,
        secondary && styles.secondaryAction,
        compact && styles.actionCompact,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, action.emergency && styles.urgentIconWrap]}>
        <Ionicons
          name={action.icon}
          size={23}
          color={action.emergency ? "#A32332" : "#17624F"}
        />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{action.title}</Text>
        <Text style={styles.actionDescription}>{action.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color="#56796D" />
    </Pressable>
  );

  return (
    <View style={styles.container} accessibilityLabel="Choose your next action">
      <Text style={styles.eyebrow}>{mode === "volunteer" ? "VOLUNTEER HOME" : "RESIDENT HOME"}</Text>
      <Text style={styles.title}>What would you like to do?</Text>
      <Text style={styles.subtitle}>Choose one action. You can return here anytime.</Text>
      <View style={[styles.actions, !compact && styles.actionsWide]}>
        {main.map(action => renderAction(action))}
      </View>
      {mode === "resident" ? (
        <Text style={styles.safetyNote}>
          In immediate danger, call 911. Online reports do not replace an emergency call.
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Show fewer services" : "More services"}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(value => !value)}
        style={({ pressed }) => [styles.moreToggle, pressed && styles.pressed]}
      >
        <Text style={styles.moreTitle}>{expanded ? "Show fewer services" : "More services"}</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={19} color="#17624F" />
      </Pressable>
      {expanded ? <View style={styles.moreActions}>{more.map(action => renderAction(action, true))}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE8E1",
    padding: 18,
    gap: 9,
    marginBottom: 18,
  },
  eyebrow: { color: "#267360", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  title: { color: "#173C32", fontSize: 22, fontWeight: "800" },
  subtitle: { color: "#556B64", fontSize: 14, lineHeight: 20, marginBottom: 5 },
  actions: { gap: 9 },
  actionsWide: { flexDirection: "row", alignItems: "stretch" },
  action: {
    flex: 1, minWidth: 0, minHeight: 92, backgroundColor: "#F8FBF9",
    borderRadius: 12, borderWidth: 1, borderColor: "#D9E7DF",
    padding: 12, flexDirection: "row", gap: 10, alignItems: "center",
  },
  actionCompact: { minHeight: 76 },
  secondaryAction: { backgroundColor: "#FFFFFF", minHeight: 67 },
  iconWrap: {
    backgroundColor: "#E4F2EC", width: 42, height: 42,
    borderRadius: 10, alignItems: "center", justifyContent: "center",
  },
  urgentIconWrap: { backgroundColor: "#FDECEE" },
  actionCopy: { flex: 1, minWidth: 0, gap: 4 },
  actionTitle: { fontSize: 15, fontWeight: "800", color: "#163F34" },
  actionDescription: { fontSize: 12, lineHeight: 17, color: "#536B62" },
  safetyNote: { fontSize: 12, color: "#755333", lineHeight: 18, marginTop: 2 },
  moreToggle: {
    marginTop: 5, flexDirection: "row", gap: 7,
    alignSelf: "flex-start", minHeight: 44, alignItems: "center", paddingHorizontal: 8,
  },
  moreTitle: { color: "#17624F", fontSize: 14, fontWeight: "800" },
  moreActions: { gap: 8 },
  pressed: { opacity: 0.75 },
});
