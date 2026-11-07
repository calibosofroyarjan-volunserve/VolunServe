/**
 * VolunServe production design foundations.
 * Based on VERIFIED live Firebase Hosting revision:
 * e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4.
 *
 * Only presentation tokens. No authentication, authorization, Firestore,
 * volunteer task transition, donation, or certificate behavior is changed.
 */
export const liveUi = {
  color: {
    canvas: "#F6F8F7",
    surface: "#FFFFFF",
    mutedSurface: "#F1F5F2",
    text: "#17382E",
    secondary: "#536B60",
    primary: "#176B52",
    primaryHover: "#12533F",
    primarySoft: "#E8F3ED",
    border: "#DCE5DF",
    sidebar: "#103D30",
    sidebarActive: "#1B604B",
    sidebarText: "#DDECE3",
    danger: "#B42318",
    warning: "#AA6619",
    white: "#FFFFFF",
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
  spacing: { small: 8, input: 12, content: 16, section: 20, page: 24 },
  radius: { control: 10, card: 12 },
  minTap: 44,
} as const;
