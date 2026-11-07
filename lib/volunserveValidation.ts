/**
 * Shared, pure client-side input validation for VolunServe forms.
 * Use these same rules for inline field hints and submit-time checks.
 * Client validation is not authorization: Firestore Rules / backend must still
 * validate privileges, ownership, amounts, identity and server-side evidence.
 */
export type ValidationKind = "text" | "email" | "phone" | "integer" | "amount" | "selection" | "date";
export type FieldRule = {
  label: string;
  kind?: ValidationKind;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  choices?: readonly string[];
};
export type ValidationSchema = Record<string, FieldRule>;
export type ValidationErrors = Record<string, string>;

const isBlank = (value: unknown): boolean =>
  value === null || value === undefined ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

export function validateField(value: unknown, rule: FieldRule): string | null {
  const label = rule.label;
  if (isBlank(value)) return rule.required ? `Enter ${label.toLowerCase()}.` : null;

  if (rule.kind === "selection") {
    const selected: unknown[] = Array.isArray(value) ? value : [value];
    if (selected.some(entry => typeof entry !== "string" || !entry.trim())) {
      return `Select a valid ${label.toLowerCase()}.`;
    }
    if (rule.choices && selected.some(entry => !rule.choices!.includes(entry as string))) {
      return `Select a listed ${label.toLowerCase()}.`;
    }
    return null;
  }

  if (rule.kind === "integer" || rule.kind === "amount") {
    const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    if (!Number.isFinite(numeric)) return `Enter a valid ${label.toLowerCase()}.`;
    if (rule.kind === "integer" && !Number.isInteger(numeric)) return `Enter a whole number for ${label.toLowerCase()}.`;
    if (rule.min !== undefined && numeric < rule.min) return `${label} must be at least ${rule.min}.`;
    if (rule.max !== undefined && numeric > rule.max) return `${label} must not exceed ${rule.max}.`;
    return null;
  }

  if (typeof value !== "string") return `Enter a valid ${label.toLowerCase()}.`;
  const text = value.trim();
  if (rule.minLength !== undefined && text.length < rule.minLength) {
    return `Enter ${label.toLowerCase()} using at least ${rule.minLength} characters.`;
  }
  if (rule.maxLength !== undefined && text.length > rule.maxLength) {
    return `${label} must be ${rule.maxLength} characters or fewer.`;
  }

  if (rule.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return "Enter an email address in the format name@example.com.";
  }
  if (rule.kind === "phone" && !/^\+?[0-9()\s-]{8,30}$/.test(text)) {
    return "Enter a contact number using 8–30 digits and permitted separators.";
  }
  if (rule.kind === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(Date.parse(text)) ||
    new Date(text).toISOString().slice(0, 10) !== text)) {
    return `Enter a valid date for ${label.toLowerCase()} (YYYY-MM-DD).`;
  }

  return null;
}

export function validateValues(schema: ValidationSchema, values: Record<string, unknown>): ValidationErrors {
  const errors: ValidationErrors = {};
  for (const [key, rule] of Object.entries(schema)) {
    const error = validateField(values[key], rule);
    if (error) errors[key] = error;
  }
  return errors;
}

export const announcementValidation: ValidationSchema = {
  title: { label: "announcement title", kind: "text", required: true, minLength: 3, maxLength: 120 },
  message: { label: "announcement message", kind: "text", required: true, minLength: 10, maxLength: 2000 },
};

export const volunteerApplicationValidation: ValidationSchema = {
  skills: { label: "at least one skill", kind: "selection", required: true },
  availability: { label: "availability", kind: "selection", required: true },
  preferredActivity: { label: "preferred activity", kind: "text", required: true, minLength: 1, maxLength: 160 },
  experienceTraining: { label: "experience or training", kind: "text", required: true, minLength: 5, maxLength: 1500 },
  motivation: { label: "motivation", kind: "text", required: true, minLength: 15, maxLength: 2000 },
  emergencyContact: { label: "emergency contact", kind: "text", maxLength: 60 },
};

/**
 * Coverage checklist: a policy exists for each input-bearing module,
 * but policies become ACTIVE only when integrated into its form and backend.
 * Never advertise this catalog alone as live validation or permission gating.
 */
export const moduleValidationPolicies: Record<string, ValidationSchema> = {
  "resident-signup": {
    email: { label: "email address", kind: "email", required: true, maxLength: 254 },
    password: { label: "password", kind: "text", required: true, minLength: 8 },
  },
  "resident-identity": {
    idType: { label: "ID type", kind: "selection", required: true },
    consent: { label: "identity-verification consent", kind: "selection", required: true, choices: ["yes"] },
  },
  "emergency-report": {
    title: { label: "incident title", required: true, minLength: 5, maxLength: 120 },
    details: { label: "incident description", required: true, minLength: 20, maxLength: 2000 },
    location: { label: "incident location", required: true, minLength: 5, maxLength: 240 },
  },
  "request-assistance": {
    reason: { label: "reason for assistance", required: true, minLength: 20, maxLength: 2000 },
    requestedAmount: { label: "requested amount", kind: "amount", min: 0, max: 10000000 },
  },
  "community-event": {
    title: { label: "event title", required: true, minLength: 5, maxLength: 120 },
    location: { label: "event venue", required: true, minLength: 3, maxLength: 240 },
    capacity: { label: "event capacity", kind: "integer", required: true, min: 1, max: 100000 },
  },
  donation: { amount: { label: "donation amount", kind: "amount", required: true, min: 1, max: 10000000 } },
  "volunteer-application": volunteerApplicationValidation,
  "volunteer-completion": {
    situation: { label: "situation summary", required: true, minLength: 10, maxLength: 1200 },
    contribution: { label: "service provided", required: true, minLength: 10, maxLength: 1200 },
    peopleHelped: { label: "people helped", kind: "integer", required: true, min: 0, max: 999 },
  },
  "event-attendance": { eventId: { label: "event selection", required: true } },
  announcement: announcementValidation,
  "admin-profile": {
    fullName: { label: "full name", required: true, minLength: 2, maxLength: 120 },
    phoneNumber: { label: "contact number", kind: "phone", maxLength: 30 },
  },
  "system-settings": {
    cityName: { label: "city name", required: true, minLength: 3, maxLength: 120 },
    retentionHours: { label: "retention hours", kind: "integer", required: true, min: 1, max: 720 },
  },
};
