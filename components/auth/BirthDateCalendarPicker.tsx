import {Feather} from "@expo/vector-icons";
import React, {useState} from "react";
import {Modal, Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import {birthDateToISO, isBirthDateInRange} from "../../lib/birthDateCalendar";

type Stage = "year" | "month" | "day";
type Props = {
  value: Date | null;
  onChange: (date: Date) => void;
  minDate: Date;
  maxDate: Date;
  invalid?: boolean;
  error?: string | null;
  label?: string;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const YEAR_PAGE_SIZE = 12;

function initialYear(value: Date | null, minDate: Date, maxDate: Date): number {
  const proposed = value ? value.getFullYear() : maxDate.getFullYear() - 10;
  return Math.max(minDate.getFullYear(), Math.min(maxDate.getFullYear(), proposed));
}

export default function BirthDateCalendarPicker({
  value, onChange, minDate, maxDate, invalid = false, error, label = "Date of Birth",
}: Props) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("year");
  const [year, setYear] = useState(() => initialYear(value, minDate, maxDate));
  const [month, setMonth] = useState(() => value?.getMonth() ?? 0);
  const [yearPage, setYearPage] = useState(() =>
    Math.floor(initialYear(value, minDate, maxDate) / YEAR_PAGE_SIZE) * YEAR_PAGE_SIZE
  );

  const openPicker = () => {
    const firstYear = initialYear(value, minDate, maxDate);
    setYear(firstYear);
    setMonth(value?.getMonth() ?? 0);
    setYearPage(Math.floor(firstYear / YEAR_PAGE_SIZE) * YEAR_PAGE_SIZE);
    setStage("year");
    setOpen(true);
  };

  const yearIsAllowed = (candidate: number) =>
    candidate >= minDate.getFullYear() && candidate <= maxDate.getFullYear();
  const monthIsAllowed = (candidate: number) =>
    (year > minDate.getFullYear() || candidate >= minDate.getMonth()) &&
    (year < maxDate.getFullYear() || candidate <= maxDate.getMonth());
  const chooseDate = (day: number) => {
    const selected = new Date(year, month, day, 12);
    if (!isBirthDateInRange(selected, minDate, maxDate)) return;
    onChange(selected);
    setOpen(false);
  };
  const firstWeekday = new Date(year, month, 1, 12).getDay();
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const calendarCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label} <Text style={styles.required}>*</Text></Text>
      <Pressable
        testID="birthdate-open-calendar"
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel="Select date of birth from calendar"
        accessibilityHint="Choose birth year, month and day; typing is not required"
        style={[styles.input, invalid && styles.invalid]}
      >
        <Feather name="calendar" size={19} color="#0f766e" />
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value ? birthDateToISO(value) : "Select birthday"}
        </Text>
        <Feather name="chevron-down" size={18} color="#64748b" />
      </Pressable>
      <Text style={styles.hint}>Select your birth year, month and day from the calendar.</Text>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable
            style={styles.backdrop}
            accessibilityLabel="Close birthday calendar"
            onPress={() => setOpen(false)}
          />
          <View style={styles.dialog}>
            <View style={styles.header}>
              {stage !== "year" ? (
                <Pressable
                  accessibilityRole="button" accessibilityLabel="Previous selection"
                  onPress={() => setStage(stage === "day" ? "month" : "year")}
                  style={styles.iconButton}
                >
                  <Feather name="arrow-left" size={21} color="#334155" />
                </Pressable>
              ) : <View style={styles.iconButton} />}
              <View style={styles.headerCenter}>
                <Text style={styles.title}>Select birthday</Text>
                <Text style={styles.subtitle}>
                  {stage === "year" ? "Choose your birth year" :
                    stage === "month" ? "Choose your birth month" : MONTHS[month] + " " + year}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button" accessibilityLabel="Close birthday calendar"
                onPress={() => setOpen(false)} style={styles.iconButton}
              >
                <Feather name="x" size={21} color="#334155" />
              </Pressable>
            </View>
            <ScrollView style={styles.calendarBody} contentContainerStyle={styles.calendarContent}>
              {stage === "year" && (
                <>
                  <View style={styles.pageHeader}>
                    <Pressable
                      accessibilityRole="button" accessibilityLabel="Earlier birth years"
                      disabled={yearPage <= minDate.getFullYear()}
                      onPress={() => setYearPage(previous => previous - YEAR_PAGE_SIZE)}
                      style={[styles.pageArrow, yearPage <= minDate.getFullYear() && styles.disabled]}
                    ><Feather name="chevron-left" size={22} color="#0f766e" /></Pressable>
                    <Text style={styles.pageTitle}>
                      {String(yearPage) + " – " + String(yearPage + YEAR_PAGE_SIZE - 1)}
                    </Text>
                    <Pressable
                      accessibilityRole="button" accessibilityLabel="Later birth years"
                      disabled={yearPage + YEAR_PAGE_SIZE - 1 >= maxDate.getFullYear()}
                      onPress={() => setYearPage(previous => previous + YEAR_PAGE_SIZE)}
                      style={[styles.pageArrow, yearPage + YEAR_PAGE_SIZE - 1 >= maxDate.getFullYear() && styles.disabled]}
                    ><Feather name="chevron-right" size={22} color="#0f766e" /></Pressable>
                  </View>
                  <View style={styles.grid}>
                    {Array.from({length: YEAR_PAGE_SIZE}, (_, index) => yearPage + index).map(candidate => {
                      const allowed = yearIsAllowed(candidate);
                      return (
                        <View key={candidate} style={styles.yearCell}>
                          <Pressable
                            accessibilityRole="button" accessibilityLabel={"Birth year " + candidate}
                            disabled={!allowed}
                            onPress={() => {setYear(candidate); setStage("month");}}
                            style={[styles.choice, year === candidate && styles.selected, !allowed && styles.disabled]}
                          ><Text style={[styles.choiceText, year === candidate && styles.selectedText]}>{candidate}</Text></Pressable>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
              {stage === "month" && (
                <View style={styles.grid}>
                  {MONTHS.map((name, index) => {
                    const allowed = monthIsAllowed(index);
                    return (
                      <View key={name} style={styles.monthCell}>
                        <Pressable
                          accessibilityRole="button" accessibilityLabel={"Birth month " + name}
                          disabled={!allowed}
                          onPress={() => {setMonth(index); setStage("day");}}
                          style={[styles.choice, month === index && value?.getFullYear() === year && styles.selected, !allowed && styles.disabled]}
                        ><Text style={[styles.choiceText, month === index && value?.getFullYear() === year && styles.selectedText]}>{name.slice(0, 3)}</Text></Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
              {stage === "day" && (
                <>
                  <View style={styles.grid}>
                    {WEEKDAYS.map((name, index) => (
                      <View key={index} style={styles.dayCell}>
                        <Text style={styles.weekday}>{name}</Text>
                      </View>
                    ))}
                    {Array.from({length: calendarCells}, (_, index) => index - firstWeekday + 1)
                      .map((day, index) => {
                        const exists = day >= 1 && day <= daysInMonth;
                        const candidate = new Date(year, month, day, 12);
                        const allowed = exists && isBirthDateInRange(candidate, minDate, maxDate);
                        const selected = value?.getFullYear() === year &&
                          value?.getMonth() === month && value?.getDate() === day;
                        return (
                          <View key={index} style={styles.dayCell}>
                            {exists ? (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={"Birth day " + day + " " + MONTHS[month] + " " + year}
                                disabled={!allowed}
                                onPress={() => chooseDate(day)}
                                style={[styles.dayChoice, selected && styles.selected, !allowed && styles.disabled]}
                              ><Text style={[styles.choiceText, selected && styles.selectedText]}>{day}</Text></Pressable>
                            ) : null}
                          </View>
                        );
                      })}
                  </View>
                </>
              )}
            </ScrollView>
            <Text style={styles.footer}>Available dates: age 18–100. No manual typing.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {marginBottom: 16},
  label: {fontSize: 14, fontWeight: "700", color: "#0f172a", marginBottom: 7},
  required: {color: "#dc2626"},
  input: {minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: "#cfdbe3",
    backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13},
  invalid: {borderColor: "#dc2626", borderWidth: 1.5},
  value: {flex: 1, fontSize: 15, fontWeight: "600", color: "#0f172a"},
  placeholder: {color: "#94a3b8", fontWeight: "500"},
  hint: {fontSize: 12, color: "#64748b", marginTop: 6},
  error: {fontSize: 12, fontWeight: "700", color: "#b91c1c", marginTop: 5},
  overlay: {flex: 1, justifyContent: "center", alignItems: "center", padding: 16},
  backdrop: {position: "absolute", top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(15,23,42,0.58)"},
  dialog: {backgroundColor: "#fff", borderRadius: 16, width: "100%", maxWidth: 420,
    maxHeight: "90%", paddingBottom: 12, overflow: "hidden"},
  header: {flexDirection: "row", alignItems: "center", padding: 14,
    borderBottomWidth: 1, borderBottomColor: "#e2e8f0"},
  iconButton: {width: 40, minHeight: 40, alignItems: "center", justifyContent: "center"},
  headerCenter: {flex: 1, alignItems: "center"},
  title: {fontSize: 18, color: "#0f172a", fontWeight: "800"},
  subtitle: {fontSize: 13, color: "#64748b", marginTop: 2},
  calendarBody: {maxHeight: 390},
  calendarContent: {padding: 12},
  pageHeader: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10},
  pageArrow: {minHeight: 44, width: 44, justifyContent: "center", alignItems: "center"},
  disabled: {opacity: 0.28},
  pageTitle: {fontSize: 15, fontWeight: "700", color: "#334155"},
  grid: {flexDirection: "row", flexWrap: "wrap"},
  yearCell: {width: "25%", padding: 4},
  monthCell: {width: "33.333%", padding: 4},
  dayCell: {width: "14.2857%", padding: 2, alignItems: "center", justifyContent: "center"},
  choice: {minHeight: 52, justifyContent: "center", alignItems: "center",
    borderRadius: 9, borderWidth: 1, borderColor: "#e2e8f0"},
  choiceText: {color: "#0f172a", fontSize: 14, fontWeight: "600"},
  selected: {backgroundColor: "#0f766e", borderColor: "#0f766e"},
  selectedText: {color: "#fff"},
  weekday: {fontWeight: "800", color: "#64748b", paddingVertical: 10, fontSize: 13},
  dayChoice: {width: 42, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 22},
  footer: {fontSize: 12, textAlign: "center", color: "#64748b", padding: 10},
});
