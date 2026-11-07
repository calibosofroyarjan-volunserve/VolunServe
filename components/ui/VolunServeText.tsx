import React from "react";
import { Platform, Text, type TextProps, type TextStyle, type StyleProp } from "react-native";
import { volunserveUi as ui } from "../../constants/volunserveUi";

export type VolunServeTextRole = keyof typeof ui.typography;
type Props = TextProps & {
  role?: VolunServeTextRole;
  color?: "primary" | "default" | "muted" | "danger";
};
const webFont = Platform.OS === "web" ? ui.typography.webStack : undefined;

/** One controlled type scale across Admin, Volunteer and Resident UI. */
export default function VolunServeText({
  role = "body",
  color = "default",
  style,
  children,
  ...props
}: Props) {
  const colors = {
    primary: ui.color.primary,
    default: ui.color.text,
    muted: ui.color.muted,
    danger: ui.color.danger,
  };
  const typography = ui.typography[role];
  const foundation: TextStyle = {
    fontFamily: webFont,
    fontSize: typography.fontSize,
    lineHeight: typography.lineHeight,
    fontWeight: typography.fontWeight as TextStyle["fontWeight"],
    color: colors[color],
  };
  return (
    <Text {...props} style={[foundation, style as StyleProp<TextStyle>]}>
      {children}
    </Text>
  );
}
