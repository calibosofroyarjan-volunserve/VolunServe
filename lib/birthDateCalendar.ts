/** Local-calendar DOB helpers. Noon avoids DST-midnight edge cases. */
export function birthDateToISO(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function birthDateFromISO(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day) return null;
  return parsed;
}

export function birthDateBounds(today: Date = new Date()): {minDate: Date; maxDate: Date} {
  // Keep original VolunServe public registration limits: 18 through 100 years.
  // The actual age is still checked separately by the existing signup validator.
  return {
    minDate: new Date(today.getFullYear() - 100, today.getMonth(), today.getDate(), 12),
    maxDate: new Date(today.getFullYear() - 18, today.getMonth(), today.getDate(), 12),
  };
}

export function isBirthDateInRange(date: Date, minDate: Date, maxDate: Date): boolean {
  if (!Number.isFinite(date.getTime())) return false;
  const day = birthDateToISO(date);
  return day >= birthDateToISO(minDate) && day <= birthDateToISO(maxDate);
}
