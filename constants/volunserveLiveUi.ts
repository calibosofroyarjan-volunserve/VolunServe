import { Platform } from "react-native";

/** VolunServe cross-platform typography foundation. No external font assets. */
export const volunserveTypography = {
  family: Platform.select({
    web: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    ios: "System",
    android: "sans-serif",
    default: "System",
  }) || "System",
  size: {
    micro: 10, caption: 11, meta: 12, label: 13, body: 14,
    bodyStrong: 15, card: 16, section: 18, subheading: 20,
    titleSmall: 22, title: 24, page: 26, hero: 30,
    display: 34, xl: 40, giant: 48,
  },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700", heavy: "800" },
} as const;

/**
 * VolunServe production-aligned design tokens.
 *
 * Presentation only. Keep the verified live Resident Home illustration, city
 * seal, dark emerald navigation, role-specific hero sections and card layout.
 *
 * This file is deliberately independent of auth, Firestore, network APIs and
 * Firebase Hosting build/runtime configuration.
 */
export const liveUi = {
  color: {
    canvas: "#F6F8F7",
    surface: "#FFFFFF",
    text: "#17382E",
    secondary: "#536B60",
    primary: "#176B52",
    primarySoft: "#E8F3ED",
    border: "#DCE5DF",
    sidebar: "#103D30",
    sidebarActive: "#1B604B",
    sidebarText: "#DDECE3",
    danger: "#B42318",
  },
  type: {
    eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: "700" },
    page: { fontSize: 26, lineHeight: 34, fontWeight: "700" },
    section: { fontSize: 18, lineHeight: 26, fontWeight: "700" },
    card: { fontSize: 16, lineHeight: 24, fontWeight: "700" },
    body: { fontSize: 14, lineHeight: 22, fontWeight: "400" },
    label: { fontSize: 13, lineHeight: 20, fontWeight: "600" },
    meta: { fontSize: 12, lineHeight: 18, fontWeight: "500" },
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { control: 10, card: 14, section: 18 },
  minTap: 44,
} as const;
