import { Feather } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

/**
 * Calendar-only date of birth field for Resident registration.
 * The stored value stays YYYY-MM-DD, matching the existing Firestore age policy.
 * No keyboard entry, additional dependency, or Firestore change is needed.
 */
type Props = {
  value: string;
  onChange: (birthDate: string) => void;
  error?: string | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function ageOn(candidate: Date, today: Date): number {
  let age = today.getFullYear() - candidate.getFullYear();
  if (
    today.getMonth() < candidate.getMonth() ||
    (today.getMonth() === candidate.getMonth() && today.getDate() < candidate.getDate())
  ) age--;
  return age;
}

function formatBirthDate(year: number, month: number, day: number): string {
  return String(year) + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

export default function BirthdateCalendar({ value, onChange, error }: Props) {
  const today = new Date();
  const earliestYear = today.getFullYear() - 101;
  const latestYear = today.getFullYear() - 18;
  const [visible, setVisible] = useState(false);
  const [year, setYear] = useState(Math.max(earliestYear, Math.min(latestYear, 2000)));
  const [month, setMonth] = useState(0);

  const years = Array.from(
    { length: latestYear - earliestYear + 1 },
    (_, index) => latestYear - index
  );
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const selectedDate = parsed
    ? new Date(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3]))
    : null;
  const selectedLabel = selectedDate && !Number.isNaN(selectedDate.getTime())
    ? selectedDate.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    })
    : "";

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from(
    { length: firstWeekday + daysInMonth },
    (_, index) => index < firstWeekday ? 0 : index - firstWeekday + 1
  );

  const openCalendar = () => {
    if (parsed) {
      setYear(Number(parsed[1]));
      setMonth(Number(parsed[2]) - 1);
    } else {
      setYear(Math.max(earliestYear, Math.min(latestYear, 2000)));
      setMonth(0);
    }
    setVisible(true);
  };

  const chooseDate = (day: number) => {
    const date = new Date(year, month, day);
    const age = ageOn(date, new Date());
    if (age < 18 || age > 100) return;
    onChange(formatBirthDate(year, month, day));
    setVisible(false);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        Date of Birth <Text style={styles.required}>*</Text>
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Date of Birth. Open calendar to choose your birthday"
        onPress={openCalendar}
        style={[styles.dateButton, !!error && styles.dateButtonError]}
      >
        <Feather name="calendar" size={18} color="#64748b" />
        <Text style={[styles.dateText, !value && styles.placeholder]}>
          {selectedLabel || "Select date of birth"}
        </Text>
        <Feather name="chevron-down" size={18} color="#64748b" />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      ) : (
        <Text style={styles.hint}>Select your birthday from the calendar (ages 18–100).</Text>
      )}

      <Modal
        transparent
        visible={visible}
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close birth date calendar"
            onPress={() => setVisible(false)}
            style={styles.backdrop}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleGroup}>
                <Text style={styles.modalTitle}>Choose your birthday</Text>
                <Text style={styles.modalSubtitle}>Select a year, month and day</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close calendar"
                onPress={() => setVisible(false)}
                style={styles.closeButton}
              >
                <Feather name="x" size={20} color="#475569" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={styles.modalContents}>
              <View style={styles.pickerRow}>
                <View style={styles.pickerShell}>
                  <Picker
                    accessibilityLabel="Birth month"
                    selectedValue={month}
                    onValueChange={(next) => setMonth(Number(next))}
                    style={styles.picker}
                  >
                    {MONTHS.map((name, index) => (
                      <Picker.Item key={name} label={name} value={index} />
                    ))}
                  </Picker>
                </View>
                <View style={styles.pickerShell}>
                  <Picker
                    accessibilityLabel="Birth year"
                    selectedValue={year}
                    onValueChange={(next) => setYear(Number(next))}
                    style={styles.picker}
                  >
                    {years.map((option) => (
                      <Picker.Item key={option} label={String(option)} value={option} />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.weekdays}>
                {WEEKDAYS.map((label) => (
                  <View key={label} style={styles.weekdayCell}>
                    <Text style={styles.weekdayText}>{label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.dayGrid}>
                {cells.map((day, index) => {
                  if (!day) return <View key={"offset-" + index} style={styles.dayCell} />;
                  const date = new Date(year, month, day);
                  const age = ageOn(date, today);
                  const eligible = age >= 18 && age <= 100;
                  const active = value === formatBirthDate(year, month, day);
                  return (
                    <View key={day} style={styles.dayCell}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={"Select " + MONTHS[month] + " " + day + ", " + year}
                        accessibilityState={{ disabled: !eligible, selected: active }}
                        disabled={!eligible}
                        onPress={() => chooseDate(day)}
                        style={[styles.dayButton, active && styles.daySelected]}
                      >
                        <Text style={[
                          styles.dayText,
                          !eligible && styles.dayDisabled,
                          active && styles.daySelectedText,
                        ]}>
                          {day}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              <Text style={styles.calendarFootnote}>
                Only birthdates corresponding to ages 18–100 can be selected.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "800", color: "#0f172a", marginBottom: 7 },
  required: { color: "#c62828" },
  dateButton: {
    height: 46, flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#cfdbe3", backgroundColor: "#ffffff",
    borderRadius: 8, paddingHorizontal: 13, gap: 10,
  },
  dateButtonError: { borderColor: "#dc2626" },
  dateText: { flex: 1, color: "#0f172a", fontSize: 14, fontWeight: "500" },
  placeholder: { color: "#94a3b8" },
  hint: { fontSize: 12, color: "#52525b", marginTop: 5, lineHeight: 18 },
  error: { fontSize: 12, color: "#b91c1c", fontWeight: "700", marginTop: 5, marginBottom: 6 },
  modalRoot: {
    flex: 1, alignItems: "center", justifyContent: "center", padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15, 23, 42, 0.62)",
  },
  modalCard: {
    backgroundColor: "#ffffff", borderRadius: 16, width: "100%", maxWidth: 420,
    maxHeight: "88%", overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: "#e2e8f0",
  },
  modalTitleGroup: { flex: 1 },
  modalTitle: { color: "#0f172a", fontSize: 18, fontWeight: "800" },
  modalSubtitle: { color: "#64748b", fontSize: 12, marginTop: 4 },
  closeButton: { minWidth: 38, minHeight: 38, justifyContent: "center", alignItems: "center" },
  modalContents: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20 },
  pickerRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  pickerShell: {
    flex: 1, borderWidth: 1, borderColor: "#cbd5e1",
    borderRadius: 9, overflow: "hidden",
  },
  picker: { width: "100%", height: 46, color: "#0f172a", backgroundColor: "#ffffff" },
  weekdays: { flexDirection: "row", marginBottom: 6 },
  weekdayCell: { width: "14.285714%", alignItems: "center", justifyContent: "center", height: 28 },
  weekdayText: { fontSize: 12, fontWeight: "700", color: "#64748b" },
  dayGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: "14.285714%", height: 43, alignItems: "center", justifyContent: "center" },
  dayButton: { width: 37, height: 37, borderRadius: 19, justifyContent: "center", alignItems: "center" },
  daySelected: { backgroundColor: "#047857" },
  dayText: { fontSize: 14, color: "#0f172a", fontWeight: "600" },
  dayDisabled: { color: "#cbd5e1" },
  daySelectedText: { color: "#ffffff", fontWeight: "800" },
  calendarFootnote: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: "center" },
});
