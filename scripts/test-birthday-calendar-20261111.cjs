"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function loadHelpers() {
  const source = fs.readFileSync("lib/birthDateCalendar.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const module = {exports: {}};
  new Function("module", "exports", js)(module, module.exports);
  return module.exports;
}
const {
  birthDateToISO, birthDateFromISO, birthDateBounds, isBirthDateInRange,
} = loadHelpers();

test("DOB picker parses and formats exact local dates, including leap days", () => {
  assert.equal(birthDateToISO(birthDateFromISO("2000-02-29")), "2000-02-29");
  assert.equal(birthDateToISO(birthDateFromISO("1998-11-11")), "1998-11-11");
  for (const invalid of ["", "2001-02-29", "2000-13-01", "2000-00-01",
    "2000-04-31", "2000-1-1", "2000-12-32", "not-a-date"]) {
    assert.equal(birthDateFromISO(invalid), null, invalid);
  }
});
test("18–100 age cutoffs and inclusive end dates cannot be bypassed", () => {
  const {minDate, maxDate} = birthDateBounds(new Date(2026, 10, 11, 9));
  assert.equal(birthDateToISO(minDate), "1926-11-11");
  assert.equal(birthDateToISO(maxDate), "2008-11-11");
  for (const value of ["1926-11-11", "2008-11-11", "2000-02-29"]) {
    assert(isBirthDateInRange(birthDateFromISO(value), minDate, maxDate), value);
  }
  for (const value of ["1926-11-10", "2008-11-12", "2026-11-11"]) {
    assert.equal(isBirthDateInRange(birthDateFromISO(value), minDate, maxDate), false, value);
  }
  assert.equal(isBirthDateInRange(new Date(NaN), minDate, maxDate), false);
});
test("email-first, legacy web, and legacy native signup use only the shared calendar", () => {
  const picker = fs.readFileSync("components/auth/BirthDateCalendarPicker.tsx", "utf8");
  assert(picker.includes("<Modal") && picker.includes('testID="birthdate-open-calendar"'));
  assert(picker.includes('accessibilityLabel="Select date of birth from calendar"'));
  assert(picker.includes('stage === "year"') && picker.includes('stage === "month"')
    && picker.includes('stage === "day"'));
  assert(picker.includes("isBirthDateInRange(selected, minDate, maxDate)"));
  assert(!picker.includes("<TextInput") && !picker.includes("onChangeText="),
    "Birthday must not permit freeform keyboard typing");
  for (const file of ["components/auth/EmailFirstSignup.tsx","app/signup.web.tsx","app/signup.tsx"]) {
    const source = fs.readFileSync(file,"utf8");
    assert(source.includes("<BirthDateCalendarPicker"),file);
    assert(source.includes("onChange={date =>"),file);
    assert(!source.includes("formatBirthday("),file);
    assert(!source.includes('type: "date"'),file);
    assert(!source.includes("<DateTimePicker"),file);
  }
  const emailFirst = fs.readFileSync("components/auth/EmailFirstSignup.tsx", "utf8");
  assert(emailFirst.includes("setBirth(birthDateToISO(date))"),
    "Continue storing DOB as the original YYYY-MM-DD string");
  assert(emailFirst.includes("birthDateFromISO(birth)"),
    "Calendar must display selected DOB when navigating between steps");
});
