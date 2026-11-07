/**
 * VolunServe visual language — one source of truth for all four workspaces.
 * Brand green identifies the platform; red/orange is reserved for true urgency,
 * errors and destructive actions rather than used as a second theme.
 *
 * Typography: an accessible system-sans stack (Inter where installed).
 * This does not require a font download and works on Expo web and mobile.
 */
export const volunserveUi = {
  brand: {
    name: "VolunServe",
    descriptor: "Community service & volunteering",
    area: "City of San Jose del Monte, Bulacan",
    tagline: "Serve together. Strengthen communities.",
  },
  color: {
    background: "#F7F9F8",
    surface: "#FFFFFF",
    surfaceMuted: "#F2F6F3",
    text: "#18332B",
    muted: "#587067",
    subtleText: "#667F72",
    primary: "#176B52",
    primaryPressed: "#12543F",
    primarySoft: "#E8F4EE",
    border: "#DBE6DF",
    borderStrong: "#B7CDC0",
    danger: "#B42318",
    dangerSoft: "#FFF0ED",
    warning: "#A45B13",
    warningSoft: "#FEF3E4",
    info: "#235F91",
    infoSoft: "#EAF3FA",
    success: "#176B52",
    successSoft: "#E8F4EE",
    sidebar: "#113B30",
    sidebarActive: "#1B604B",
    white: "#FFFFFF",
  },
  typography: {
    family: "System",
    webStack: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    pageTitle: { fontSize: 26, lineHeight: 33, fontWeight: "700" },
    sectionTitle: { fontSize: 18, lineHeight: 25, fontWeight: "700" },
    cardTitle: { fontSize: 16, lineHeight: 23, fontWeight: "700" },
    body: { fontSize: 14, lineHeight: 21, fontWeight: "400" },
    caption: { fontSize: 12, lineHeight: 18, fontWeight: "500" },
    label: { fontSize: 13, lineHeight: 19, fontWeight: "600" },
  },
  spacing: { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32 },
  radius: { small: 8, control: 10, card: 12 },
  icon: { inline: 16, navigation: 20, feature: 22 },
  minTouchHeight: 44,
  maxContentWidth: 1200,
} as const;
