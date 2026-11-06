/**
 * VolunServe visual foundation.
 * Reuse these tokens for shared controls and new pages instead of introducing
 * a different palette, border radius and text scale for every module.
 */
export const volunserveUi = {
  color: {
    background: "#F7F9F8",
    surface: "#FFFFFF",
    text: "#18332B",
    muted: "#587067",
    primary: "#176B52",
    primaryPressed: "#12543F",
    primarySoft: "#E8F4EE",
    border: "#DBE6DF",
    danger: "#B42318",
    dangerSoft: "#FFF0ED",
  },
  radius: { small: 8, control: 10, card: 12 },
  minTouchHeight: 44,
} as const;
