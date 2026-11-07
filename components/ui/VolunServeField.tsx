import React from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { liveUi as ui } from "../../constants/volunserveLiveUi";

export type VolunServeFieldProps = TextInputProps & {
  label: string;
  helper?: string;
  error?: string | null;
  required?: boolean;
};

/** Shared labeled control; validation remains owned by each module's submit flow. */
export default function VolunServeField({
  label,
  helper,
  error,
  required = false,
  multiline,
  style,
  placeholderTextColor = "#70857A",
  accessibilityLabel,
  ...inputProps
}: VolunServeFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}{required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={accessibilityLabel || label}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        placeholderTextColor={placeholderTextColor}
        style={[styles.input, multiline && styles.multiline, !!error && styles.invalid, style]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { width: "100%", marginBottom: ui.spacing.content },
  label: {
    color: ui.color.text,
    fontSize: ui.type.label.fontSize,
    fontWeight: "600",
    lineHeight: ui.type.label.lineHeight,
    marginBottom: 7,
  },
  required: { color: ui.color.danger },
  input: {
    width: "100%",
    minHeight: ui.minTap,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: ui.color.border,
    backgroundColor: ui.color.surface,
    color: ui.color.text,
    borderRadius: ui.radius.control,
    fontSize: ui.type.body.fontSize,
    lineHeight: ui.type.body.lineHeight,
  },
  multiline: { minHeight: 128, textAlignVertical: "top" },
  invalid: { borderColor: ui.color.danger },
  helper: {
    color: ui.color.secondary,
    fontSize: ui.type.meta.fontSize,
    lineHeight: ui.type.meta.lineHeight,
    marginTop: 5,
  },
  error: {
    color: ui.color.danger,
    fontSize: ui.type.meta.fontSize,
    lineHeight: ui.type.meta.lineHeight,
    marginTop: 5,
  },
});
