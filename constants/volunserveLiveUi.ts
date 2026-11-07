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
    page: { fontSize: 25, lineHeight: 32, fontWeight: "700" },
    section: { fontSize: 18, lineHeight: 25, fontWeight: "700" },
    card: { fontSize: 16, lineHeight: 23, fontWeight: "700" },
    body: { fontSize: 14, lineHeight: 21, fontWeight: "400" },
    label: { fontSize: 13, lineHeight: 19, fontWeight: "600" },
    meta: { fontSize: 12, lineHeight: 18, fontWeight: "500" },
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { control: 10, card: 14, section: 18 },
  minTap: 44,
} as const;
