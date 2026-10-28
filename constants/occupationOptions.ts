/** Shared occupation choices for resident registration and profile editing. */
export const OCCUPATION_OPTIONS = [
  "Medical Professional",
  "Emergency Responder",
  "Government Employee",
  "Student",
  "Private Sector Employee",
  "NGO Worker",
  "Skilled Worker",
  "Unemployed",
  "Retired",
  "Other (Specify)",
];

export const SPECIALIZATIONS: Record<string, string[]> = {
  "Medical Professional": ["Doctor", "Nurse", "Midwife", "Medical Technologist", "Pharmacist", "Other Medical Staff"],
  "Emergency Responder": ["Firefighter", "EMT", "Rescue Volunteer", "DRRM Officer", "Other Responder"],
  "Government Employee": ["Health Office", "Social Welfare", "Public Safety", "Administrative Staff", "Other Office"],
  Student: ["Senior High School", "College", "Fresh Graduate", "Technical-Vocational"],
  "Private Sector Employee": ["Operations", "Customer Service", "Engineering", "Management", "Other Department"],
  "NGO Worker": ["Program Officer", "Field Coordinator", "Volunteer Manager", "Other Role"],
  "Skilled Worker": ["Electrician", "Plumber", "Driver", "Welder", "Carpenter", "Other Skill"],
};
