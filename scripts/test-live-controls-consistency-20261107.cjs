"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = file => fs.readFileSync(file, "utf8");
const button = read("components/ui/VolunServeButton.tsx");
const field = read("components/ui/VolunServeField.tsx");
const pager = read("components/ui/ListPagination.tsx");
const admin = read("app/(admin)/create-announcement.tsx");
const superadmin = read("app/(superadmin)/system-settings.tsx");
const resident = read("app/(tabs)/volunteer-application.tsx");
const home = read("components/home/Home.web.tsx");
const volunteerWeb = read("app/(tabs)/volunteer.web.tsx");
const volunteerNative = read("app/(tabs)/volunteer.tsx");

assert(button.includes('accessibilityRole="button"') &&
  button.includes("accessibilityState={{ disabled: blocked, busy: loading }}") &&
  button.includes("disabled={blocked}") &&
  button.includes("minHeight: ui.minTap") &&
  button.includes("onPress={onPress}"),
  "Shared button must be a real action with loading, disabled and accessible states");
assert(field.includes("onChangeText") === false, "Field should pass event handlers without intercepting submission");
assert(field.includes("accessibilityLabel={accessibilityLabel || label}") &&
  field.includes('accessibilityRole="alert"') &&
  field.includes("!!error && styles.invalid") &&
  field.includes("minHeight: ui.minTap"),
  "Shared forms must show labels and actionable inline errors");
assert(pager.includes("Number.isFinite(pageSize)") &&
  pager.includes("Number.isFinite(total)") &&
  pager.includes("Number.isFinite(page)") &&
  pager.includes("minHeight: ui.minTap") &&
  pager.includes("onChange(safePage + 1)") && pager.includes("onChange(safePage - 1)"),
  "All existing paged queues need safe responsive page controls");
assert(admin.includes('label="Publish Announcement"') &&
  admin.includes("onPress={handleSubmit}") &&
  admin.includes('label="Title"') && admin.includes('label="Message"') &&
  admin.includes('collection(db, "announcements")') &&
  admin.includes('createdBy: user.uid') &&
  admin.includes("await addDoc("),
  "Admin announcement submit must retain authorized Firestore writes");
assert(superadmin.includes('label="Save System Settings"') &&
  superadmin.includes("onPress={saveSettings}") &&
  superadmin.includes("const saveSettings = async") &&
  superadmin.includes("isSuperAdmin") &&
  superadmin.includes("createAdminLog("),
  "Super Admin settings must preserve real save and role checks");
assert(resident.includes('label="Submit Volunteer Application"') &&
  resident.includes("disabled={!formValid || submitting}") &&
  resident.includes("onPress={submitApplication}") &&
  resident.includes("await batch.commit()") &&
  resident.includes('volunteerStatus: "pending"'),
  "Resident volunteer application must preserve pending review and disabled state");
assert(home.includes("setNotificationMenuOpen(open => !open)") &&
  home.includes('router.push("/notifications")'), "Home bell navigation must stay functional");
assert(volunteerWeb.includes("runTransaction(") && volunteerNative.includes("runTransaction(") &&
  volunteerWeb.includes("openLiveMap()") && volunteerNative.includes("openLiveMap()"),
  "Volunteer live response assignments and map must remain");
for(const path of ["app/(tabs)/_layout.tsx", "app/(admin)/_layout.tsx", "app/(superadmin)/_layout.tsx"]) {
 const s=read(path);
 assert(s.includes("ui.color.sidebar"),"Role sidebar visual identity changed: "+path);
}
console.log("PASS shared actions/forms/pagination and retained four-role account and volunteer workflows");
