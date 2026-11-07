import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { liveUi as ui } from "../../constants/volunserveLiveUi";
import VolunServeButton from "../ui/VolunServeButton";
import VolunServeField from "../ui/VolunServeField";

/**
 * Actual Expo Web / React Native design-review route for ALL FOUR portals.
 * It reuses the app's real VolunServe brand tokens and shared controls.
 * Every value is invented sample data. No authentication, Firebase import,
 * HTTP request, data mutation, donation or identity verification can occur.
 */
type Role = "resident" | "volunteer" | "admin" | "superadmin";
type Icon = React.ComponentProps<typeof Ionicons>["name"];
type Nav = { key: string; label: string; icon: Icon; description: string };
type RecordRow = { title: string; detail: string; state: string; icon: Icon };

const NAV: Record<Role, Nav[]> = {
  resident: [
    { key: "home", label: "Home", icon: "home-outline", description: "Your community at a glance" },
    { key: "emergency-reports", label: "Emergency Reports", icon: "alert-circle-outline", description: "Report and follow up on local incidents" },
    { key: "request-assistance", label: "Request Assistance", icon: "hand-left-outline", description: "Support requests in San Jose del Monte" },
    { key: "community-events", label: "Community Events", icon: "calendar-outline", description: "Discover local activities" },
    { key: "donations", label: "Donations", icon: "heart-outline", description: "Transparent community fundraising" },
    { key: "notifications", label: "Notifications", icon: "notifications-outline", description: "Important community messages" },
    { key: "profile", label: "My Profile", icon: "person-circle-outline", description: "Account and verification details" },
  ],
  volunteer: [
    { key: "home", label: "Home", icon: "home-outline", description: "Your volunteering overview" },
    { key: "emergency-tasks", label: "Emergency Tasks", icon: "hand-left-outline", description: "Assigned emergency response tasks" },
    { key: "community-events", label: "Community Events", icon: "calendar-outline", description: "Community event participation" },
    { key: "event-attendance", label: "Event Attendance", icon: "time-outline", description: "Time-in and time-out history" },
    { key: "certificates", label: "My Certificates", icon: "ribbon-outline", description: "Verified volunteer service" },
    { key: "notifications", label: "Notifications", icon: "notifications-outline", description: "Assignments and updates" },
    { key: "profile", label: "My Profile", icon: "person-circle-outline", description: "Volunteer information" },
  ],
  admin: [
    { key: "home", label: "Command Center", icon: "grid-outline", description: "Municipal operations overview" },
    { key: "identity-reviews", label: "Identity Reviews", icon: "shield-checkmark-outline", description: "Pending resident verifications" },
    { key: "emergency-reports", label: "Emergency Reports", icon: "alert-circle-outline", description: "Resident reports and volunteer assignments" },
    { key: "assistance-requests", label: "Assistance Requests", icon: "hand-left-outline", description: "Review requests and evidence" },
    { key: "community-events", label: "Community Events", icon: "calendar-outline", description: "Publish events and manage participation" },
    { key: "event-attendance", label: "Event Attendance", icon: "time-outline", description: "Validated time records" },
    { key: "certificates", label: "Certificates", icon: "ribbon-outline", description: "Review issued certificates" },
    { key: "donations", label: "Donation Management", icon: "heart-outline", description: "Donation and disbursement oversight" },
    { key: "announcements", label: "Announcements", icon: "megaphone-outline", description: "Official public advisories" },
    { key: "profile", label: "My Profile", icon: "person-circle-outline", description: "Admin account information" },
  ],
  superadmin: [
    { key: "home", label: "System Overview", icon: "grid-outline", description: "System-wide information" },
    { key: "admin-accounts", label: "Admin Accounts", icon: "people-outline", description: "Admin access and personnel status" },
    { key: "system-records", label: "System Records", icon: "albums-outline", description: "Read-only data overview" },
    { key: "audit-logs", label: "Audit Logs", icon: "time-outline", description: "Track administrative actions" },
    { key: "system-settings", label: "System Settings", icon: "settings-outline", description: "System configuration preview" },
    { key: "profile", label: "My Profile", icon: "person-circle-outline", description: "Super Admin account" },
  ],
};
const ROLE_INFO: Record<Role, { label: string; subtitle: string; icon: Icon }> = {
  resident: { label: "Resident", subtitle: "Resident Services", icon: "home-outline" },
  volunteer: { label: "Volunteer", subtitle: "Volunteer Services", icon: "hand-left-outline" },
  admin: { label: "Admin", subtitle: "LGU Operations", icon: "shield-checkmark-outline" },
  superadmin: { label: "Super Admin", subtitle: "System Administration", icon: "settings-outline" },
};
const ROLES: Role[] = ["resident", "volunteer", "admin", "superadmin"];
const SAMPLE_ROWS: Record<Role, RecordRow[]> = {
  resident: [
    { title: "Sample community hazard report", detail: "Brgy. Muzon • Reference DR-001", state: "Under Review", icon: "alert-circle-outline" },
    { title: "Sample request for assistance", detail: "Brgy. Gaya-Gaya • Reference RA-002", state: "Pending", icon: "hand-left-outline" },
    { title: "Community clean-up orientation", detail: "Sample local event • Brgy. Sapang Palay", state: "Published", icon: "calendar-outline" },
    { title: "Relief supplies fundraiser", detail: "Demo campaign; no actual funds collected", state: "Preview", icon: "heart-outline" },
    { title: "Account verification", detail: "Sample account access and review", state: "Verified", icon: "shield-checkmark-outline" },
    { title: "Public safety notice", detail: "Official advisory layout sample", state: "Published", icon: "megaphone-outline" },
  ],
  volunteer: [
    { title: "Flood assistance assignment", detail: "Brgy. San Rafael • Sample response task", state: "Invitation", icon: "water-outline" },
    { title: "Community event attendance", detail: "Sample service record • 2.5 hours", state: "Completed", icon: "time-outline" },
    { title: "Volunteer orientation", detail: "Training session • San Jose del Monte", state: "Published", icon: "calendar-outline" },
    { title: "Certificate of Participation", detail: "Demo PDF record, no download", state: "Issued", icon: "ribbon-outline" },
    { title: "New assigned task", detail: "Notification example • Assigned by Admin", state: "Unread", icon: "notifications-outline" },
    { title: "Community emergency task", detail: "Brgy. Graceville • Sample invitation", state: "Pending", icon: "hand-left-outline" },
  ],
  admin: [
    { title: "Resident identity verification", detail: "Demo Applicant A • Manual review", state: "Pending", icon: "shield-checkmark-outline" },
    { title: "Flood incident report", detail: "Demo Incident E-102 • Field verification", state: "Under Review", icon: "alert-circle-outline" },
    { title: "Assistance evidence review", detail: "Demo Request A-104 • Submitted receipts", state: "Pending", icon: "documents-outline" },
    { title: "Community safety orientation", detail: "Demo Event C-110 • Volunteer attendance", state: "Published", icon: "calendar-outline" },
    { title: "Sample donation reconciliation", detail: "Demo Campaign D-103 • Sandbox only", state: "Reviewed", icon: "heart-outline" },
    { title: "Community advisory", detail: "Sample public announcement", state: "Published", icon: "megaphone-outline" },
  ],
  superadmin: [
    { title: "Sample admin access request", detail: "Demo Staff A • Awaiting approval", state: "Pending", icon: "person-add-outline" },
    { title: "Login activity entry", detail: "Demo Audit L-221 • System record", state: "Recorded", icon: "time-outline" },
    { title: "Administrative role update", detail: "Demo Admin Staff B • Permissions", state: "Reviewed", icon: "shield-checkmark-outline" },
    { title: "Emergency records overview", detail: "Sample aggregate, no personal data", state: "Read Only", icon: "albums-outline" },
    { title: "System configuration", detail: "Demonstration settings snapshot", state: "Preview", icon: "settings-outline" },
    { title: "App activity record", detail: "Demo audit entry • No live users", state: "Recorded", icon: "document-text-outline" },
  ],
};
const SHOW_FORM: Record<Role, string[]> = {
  resident: ["request-assistance", "emergency-reports"],
  volunteer: ["emergency-tasks"],
  admin: ["announcements", "community-events"],
  superadmin: ["system-settings", "admin-accounts"],
};

function navigate(role: Role, module: string) {
  router.replace({ pathname: "/public/preview", params: { role, module } } as any);
}
function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}
function StatusPill({ children, neutral = false }: { children: string; neutral?: boolean }) {
  return (
    <View style={[styles.pill, neutral && styles.pillNeutral]}>
      <View style={[styles.pillDot, neutral && styles.pillDotNeutral]} />
      <Text style={[styles.pillText, neutral && styles.pillTextNeutral]}>{children}</Text>
    </View>
  );
}
function EmptyNotice({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.emptyNotice}>
    <Ionicons name="document-text-outline" size={26} color={ui.color.secondary} />
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyCopy}>{detail}</Text>
  </View>;
}
function Metric({ icon, value, label, note }: { icon: Icon; value: string; label: string; note: string }) {
  return <View style={styles.metric}>
    <View style={styles.metricTop}>
      <View style={styles.metricIcon}><Ionicons name={icon} size={19} color={ui.color.primary} /></View>
      <Text style={styles.metricNote}>{note}</Text>
    </View>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>;
}
function Section({ icon, title, subtitle, children, onMore }: {
  icon: Icon; title: string; subtitle?: string; children: React.ReactNode; onMore?: () => void;
}) {
  return <View style={styles.section}>
    <View style={styles.sectionHeading}>
      <View style={styles.sectionMark}><Ionicons name={icon} size={19} color={ui.color.primary} /></View>
      <View style={styles.sectionHeadingCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {onMore ? <Pressable accessibilityRole="button" onPress={onMore} style={styles.moreButton}>
        <Text style={styles.moreText}>View all</Text><Ionicons name="arrow-forward-outline" size={15} color={ui.color.primary}/>
      </Pressable> : null}
    </View>
    {children}
  </View>;
}
function Overview({ role, mobile }: { role: Role; mobile: boolean }) {
  const [opened, setOpened] = useState<string | null>(null);
  const tiles = role === "resident"
    ? [{ icon: "alert-circle-outline" as Icon, value: "02", label: "My reports", note: "Sample" },
       { icon: "hand-left-outline" as Icon, value: "01", label: "Assistance requests", note: "Sample" },
       { icon: "calendar-outline" as Icon, value: "05", label: "Published events", note: "Demo" },
       { icon: "heart-outline" as Icon, value: "03", label: "Community campaigns", note: "Demo" }]
    : role === "volunteer"
    ? [{ icon: "hand-left-outline" as Icon, value: "02", label: "Task invitations", note: "Demo" },
       { icon: "time-outline" as Icon, value: "16h", label: "Service hours", note: "Sample" },
       { icon: "ribbon-outline" as Icon, value: "03", label: "Certificates", note: "Demo" },
       { icon: "calendar-outline" as Icon, value: "05", label: "Community events", note: "Demo" }]
    : role === "admin"
    ? [{ icon: "shield-checkmark-outline" as Icon, value: "08", label: "Identity reviews", note: "Demo" },
       { icon: "alert-circle-outline" as Icon, value: "06", label: "Emergency reports", note: "Demo" },
       { icon: "hand-left-outline" as Icon, value: "04", label: "Assistance requests", note: "Demo" },
       { icon: "people-outline" as Icon, value: "12", label: "Volunteer assignments", note: "Demo" }]
    : [{ icon: "people-outline" as Icon, value: "06", label: "Admin accounts", note: "Demo" },
       { icon: "shield-checkmark-outline" as Icon, value: "04", label: "Pending access", note: "Demo" },
       { icon: "albums-outline" as Icon, value: "38", label: "System records", note: "Demo" },
       { icon: "time-outline" as Icon, value: "13", label: "Recent audit logs", note: "Demo" }];
  return <>
    <View style={[styles.metricGrid, mobile && styles.metricGridMobile]}>
      {tiles.map(item => <Metric key={item.label} {...item} />)}
    </View>
    <View style={[styles.sectionRow, mobile && styles.sectionRowMobile]}>
      <Section icon="pulse-outline" title="Recent activity" subtitle="Fictional entries for layout review"
        onMore={() => navigate(role, NAV[role][1].key)}>
        {SAMPLE_ROWS[role].slice(0,4).map(item => <Pressable key={item.title} accessibilityRole="button"
          accessibilityLabel={"Open sample: " + item.title}
          onPress={() => setOpened(opened === item.title ? null : item.title)}
          style={[styles.record, opened === item.title && styles.recordActive]}>
          <View style={styles.recordIcon}><Ionicons name={item.icon} color={ui.color.primary} size={17} /></View>
          <View style={styles.recordCopy}>
            <Text style={styles.recordTitle}>{item.title}</Text>
            <Text style={styles.recordDetail}>{item.detail}</Text>
            {opened === item.title ? <Text style={styles.recordExpanded}>Sample only. No live record, status change, or personal data was accessed.</Text> : null}
          </View>
          <Ionicons name={opened === item.title ? "chevron-up" : "chevron-forward"} color={ui.color.secondary} size={18}/>
        </Press>)}
      </Section>
      <Section icon="megaphone-outline" title="Community updates" subtitle="Public notices and reminders">
        <EmptyNotice title="Demo advisory preview"
          detail="These are representative layouts. The design review does not read production announcements." />
        <VolunServeButton label="Preview announcements" icon="arrow-forward-outline" variant="secondary"
          onPress={() => navigate(role, role === "admin" ? "announcements" : "notifications")} />
      </Section>
    </View>
  </>;
}
function RecordBrowser({ role, module }: { role: Role; module: string }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const records = SAMPLE_ROWS[role].filter(row =>
    (status === "All" || status === "Pending" && /pending|review|invitation/i.test(row.state) ||
      status === "Completed" && /issued|reviewed|published|completed|verified|recorded/i.test(row.state)) &&
    (row.title + " " + row.detail).toLowerCase().includes(search.toLowerCase()));
  const pages = Math.max(1, Math.ceil(records.length / 5));
  const safePage = Math.min(page, pages);
  const showing = records.slice((safePage - 1) * 5, safePage * 5);
  return <Section icon="list-outline" title="Sample records" subtitle="Search, filter, paginate and expand rows">
    <View style={styles.controls}>
      <View style={styles.search}>
        <Ionicons name="search-outline" size={18} color={ui.color.secondary} />
        <TextInput placeholder="Search demo records" placeholderTextColor={ui.color.secondary}
          accessibilityLabel="Search sample records" value={search}
          onChangeText={value => {setSearch(value);setPage(1);}} style={styles.searchInput}/>
      </View>
      <View style={styles.filters}>
        {(["All","Pending","Completed"] as const).map(value =>
          <Pressable key={value} accessibilityRole="button" accessibilityLabel={"Filter " + value}
            accessibilityState={{ selected: value === status }} onPress={() => {setStatus(value);setPage(1);}}
            style={[styles.filter, status === value && styles.filterActive]}>
            <Text style={[styles.filterText, status === value && styles.filterTextActive]}>{value}</Text>
          </Pressable>)}
      </View>
    </View>
    {showing.length ? showing.map(row => <View key={row.title}>
      <Pressable onPress={() => {setDetail(detail === row.title ? null : row.title);setMessage("");}}
        accessibilityRole="button" accessibilityLabel={"View sample " + row.title}
        accessibilityState={{ expanded: detail === row.title }} style={styles.record}>
        <View style={styles.recordIcon}><Ionicons name={row.icon} size={19} color={ui.color.primary}/></View>
        <View style={styles.recordCopy}>
          <Text style={styles.recordTitle}>{row.title}</Text>
          <Text style={styles.recordDetail}>{row.detail}</Text>
        </View>
        <View style={styles.recordStatus}><Text style={styles.recordStatusText}>{row.state}</Text></View>
        <Ionicons name={detail === row.title ? "chevron-up" : "chevron-down"} size={17} color={ui.color.secondary}/>
      </Pressable>
      {detail === row.title ? <View style={styles.detailArea}>
        <Text style={styles.detailTitle}>Record details • Demo data</Text>
        <Text style={styles.detailText}>This expanded panel shows spacing, states and action placement. Nothing is connected to live records.</Text>
        <VolunServeButton label="Test action (read-only)" icon="eye-outline" variant="secondary"
          onPress={() => setMessage("Demo action acknowledged — no record was changed.")}/>
        {message ? <Text accessibilityRole="alert" style={styles.feedback}>{message}</Text> : null}
      </View> : null}
    </View>) : <EmptyNotice title="No matching sample records" detail="Clear the search or try another filter."/>}
    <View style={styles.pagination}>
      <Text style={styles.pageCopy}>{records.length ? (safePage-1)*5+1 : 0}–{Math.min(safePage*5,records.length)} of {records.length} · 5 per page</Text>
      <View style={styles.pageActions}>
        <VolunServeButton label="Previous" variant="secondary" disabled={safePage===1} onPress={()=>setPage(safePage-1)}/>
        <Text style={styles.pageCopy}>{safePage} / {pages}</Text>
        <VolunServeButton label="Next" variant="secondary" disabled={safePage===pages} onPress={()=>setPage(safePage+1)}/>
      </View>
    </View>
  </Section>;
}
function SampleForm({ role, module }: { role: Role; module: string }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState("");
  const isSettings = module === "system-settings";
  const formTitle = module === "announcements" ? "Draft announcement"
    : isSettings ? "System settings preview"
    : module === "admin-accounts" ? "Review admin account"
    : module === "emergency-tasks" ? "Task response preview"
    : module === "community-events" ? "Event details"
    : module === "request-assistance" ? "Sample assistance request"
    : "Sample emergency report";
  const invalidTitle = title.trim().length < 5 || title.trim().length > 100;
  const invalidNotes = notes.trim().length < 12 || notes.trim().length > 500;
  function submit() {
    setTouched(true);
    setResult(invalidTitle || invalidNotes ? "Please correct the sample fields highlighted above."
      : "Preview validation passed. No request, approval, or data change was submitted.");
  }
  return <Section icon={isSettings ? "settings-outline" : "create-outline"} title={formTitle}
    subtitle="Test field validation and button states — this form never submits data">
    <VolunServeField label={isSettings ? "Setting name" : "Title / reference"} required
      value={title} maxLength={100} placeholder={isSettings ? "Sample setting name" : "Enter sample title (5–100 characters)"}
      onChangeText={value=>{setTitle(value);setResult("");}}
      error={touched && invalidTitle ? "Please enter 5–100 characters." : null}/>
    <VolunServeField label={isSettings ? "Description" : "Description / reason"} required
      value={notes} multiline maxLength={500} placeholder="Enter 12–500 characters"
      onChangeText={value=>{setNotes(value);setResult("");}}
      error={touched && invalidNotes ? "Please enter 12–500 characters." : null}/>
    <View style={styles.formActions}>
      <VolunServeButton label="Clear sample" variant="secondary" icon="refresh-outline"
        onPress={()=>{setTitle("");setNotes("");setTouched(false);setResult("");}} />
      <VolunServeButton label="Validate sample form" icon="checkmark-circle-outline" onPress={submit}/>
    </View>
    {result ? <View style={[styles.formMessage,(!invalidTitle&&!invalidNotes)&&styles.formSuccess]}>
      <Ionicons name={invalidTitle||invalidNotes ? "alert-circle-outline" : "checkmark-circle-outline"}
        size={19} color={invalidTitle||invalidNotes ? ui.color.danger : ui.color.primary} />
      <Text accessibilityRole="alert" style={styles.formMessageText}>{result}</Text>
    </View> : null}
    <Text style={styles.smallPrint}>Guest Preview does not create, save, approve, reject, upload, notify, pay or modify production records.</Text>
  </Section>;
}
export default function DesignReviewWorkspace() {
  const params = useLocalSearchParams<{ role?: string; module?: string }>();
  const role: Role = ROLES.includes(params.role as Role) ? params.role as Role : "resident";
  const nav = NAV[role];
  const module = nav.some(n => n.key === params.module) ? String(params.module) : "home";
  const current = nav.find(n=>n.key===module)||nav[0];
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  const [drawer, setDrawer] = useState(false);
  const [roleMenu, setRoleMenu] = useState(false);
  const [notification, setNotification] = useState(false);
  const overviewName = ROLE_INFO[role].label;
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(false);
  const headerText = useMemo(()=> module==="home"
    ? role==="resident" ? "Welcome to your community"
      : role==="volunteer" ? "Ready to make a difference?"
      : role==="admin" ? "Your operations at a glance"
      : "System-wide overview"
    : current.label, [module,role,current.label]);

  const sidebar = <View style={styles.sidebar}>
    <View style={styles.sidebarBrand}>
      <Image source={require("../../assets/images/logo.png")} style={styles.logo}/>
      <View style={{flex:1}}>
        <Text style={styles.brand}>VolunServe</Text>
        <Text style={styles.brandSub}>CITY OF SAN JOSE DEL MONTE</Text>
      </View>
      {mobile ? <Pressable onPress={()=>setDrawer(false)} accessibilityRole="button"
          accessibilityLabel="Close navigation" style={styles.sidebarClose}>
        <Ionicons name="close" size={23} color={ui.color.sidebarText}/>
      </Pressable> : null}
    </View>
    <Text style={styles.navEyebrow}>{ROLE_INFO[role].subtitle.toUpperCase()}</Text>
    <ScrollView style={styles.navScroll} contentContainerStyle={styles.navContainer}>
      {nav.map(item=><Pressable key={item.key} accessibilityRole="button"
        accessibilityLabel={"Open "+item.label} accessibilityState={{selected:module===item.key}}
        onPress={()=>{setDrawer(false);navigate(role,item.key);}}
        style={[styles.navLink,module===item.key && styles.navLinkActive]}>
        <View style={[styles.navIcon,module===item.key && styles.navIconActive]}>
          <Ionicons name={item.icon} size={19} color={ui.color.white}/>
        </View>
        <Text style={styles.navText}>{item.label}</Text>
        {module===item.key ? <View style={styles.navCurrent}/> : null}
      </Pressable>)}
    </ScrollView>
    <View style={styles.sideFooter}>
      <Ionicons name="shield-checkmark-outline" size={17} color={ui.color.sidebarText}/>
      <Text style={styles.sideFooterText}>READ-ONLY DESIGN REVIEW</Text>
    </View>
  </View>;

  return <View style={styles.app}>
    {!mobile ? <View style={styles.sidebarWrap}>{sidebar}</View> : null}
    <View style={styles.contentWrap}>
      <View style={[styles.topbar,mobile&&styles.topbarMobile]}>
        {mobile ? <Pressable accessibilityRole="button" accessibilityLabel="Open navigation"
          onPress={()=>setDrawer(true)} style={styles.iconButton}>
          <Ionicons name="menu-outline" size={23} color={ui.color.text}/>
        </Pressable> : <Text style={styles.breadcrumb}>VolunServe / {ROLE_INFO[role].label} / {current.label}</Text>}
        <View style={{flex:1}}/>
        {!mobile ? <StatusPill neutral>Design review · Sample data</StatusPill> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Preview notifications" style={styles.iconButton}
          onPress={()=>setNotification(v=>!v)}><Ionicons name="notifications-outline" size={21} color={ui.color.text}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Change preview role"
          accessibilityState={{expanded:roleMenu}} style={styles.roleSwitcher} onPress={()=>setRoleMenu(v=>!v)}>
          <View style={styles.roleAvatar}><Ionicons name={ROLE_INFO[role].icon} size={17} color={ui.color.primary}/></View>
          {!mobile ? <View><Text style={styles.roleName}>{ROLE_INFO[role].label}</Text><Text style={styles.roleMeta}>Sample account</Text></View> : null}
          <Ionicons name="chevron-down-outline" size={16} color={ui.color.secondary}/>
        </Pressable>
      </View>
      {notification ? <View style={[styles.topPopover,mobile&&styles.topPopoverMobile]}>
        <Text style={styles.popoverTitle}>Notifications preview</Text>
        <Text style={styles.popoverCopy}>No live notifications are loaded. This menu demonstrates placement, spacing and dismissal.</Text>
        <VolunServeButton label="Close" variant="secondary" onPress={()=>setNotification(false)}/>
      </View> : null}
      {roleMenu ? <View style={[styles.roleMenu,mobile&&styles.roleMenuMobile]}>
        <Label>SWITCH WORKSPACE</Label>
        {ROLES.map(r=><Pressable key={r} accessibilityRole="button" accessibilityLabel={"Preview "+ROLE_INFO[r].label}
          onPress={()=>{setRoleMenu(false);setDrawer(false);navigate(r,"home");}} style={styles.roleOption}>
          <Ionicons name={ROLE_INFO[r].icon} color={ui.color.primary} size={19}/>
          <Text style={styles.roleOptionText}>{ROLE_INFO[r].label}</Text>
          {role===r ? <Ionicons name="checkmark" color={ui.color.primary} size={18}/> : null}
        </Pressable>)}
      </View> : null}
      <ScrollView key={role+":"+module} style={styles.scroll}
        contentContainerStyle={[styles.content,mobile&&styles.contentMobile]} keyboardShouldPersistTaps="handled">
        <View style={[styles.pageIntro,mobile&&styles.pageIntroMobile]}>
          <View style={styles.pageIntroText}>
            <Label>{ROLE_INFO[role].subtitle.toUpperCase()} · SAMPLE UI</Label>
            <Text style={[styles.heading,mobile&&styles.headingMobile]}>{headerText}</Text>
            <Text style={styles.pageDescription}>{current.description}. Explore desktop and mobile layout, navigation and local demo controls.</Text>
          </View>
          {!mobile ? <View style={styles.introIcon}><Ionicons name={current.icon} size={31} color={ui.color.primary}/></View> : null}
        </View>
        <View style={styles.readOnlyBanner}>
          <Ionicons name="eye-outline" size={18} color={ui.color.primary}/>
          <Text style={styles.bannerCopy}>Read-only interactive design preview. All names, records, counts and outcomes are fictional.</Text>
        </View>
        {module==="home" ? <Overview role={role} mobile={mobile}/> :
          <>
            <View style={[styles.moduleLead,mobile&&styles.moduleLeadMobile]}>
              <View style={styles.moduleIcon}><Ionicons name={current.icon} size={23} color={ui.color.primary}/></View>
              <View style={{flex:1,minWidth:0}}>
                <Text style={styles.moduleTitle}>{current.label}</Text>
                <Text style={styles.moduleDescription}>{current.description}</Text>
              </View>
              {!mobile ? <StatusPill neutral>Preview only</StatusPill> : null}
            </View>
            {module==="profile" ?
              <Section icon="person-circle-outline" title="Sample account information" subtitle="No real identity is displayed">
                <View style={styles.record}><View style={styles.recordIcon}><Ionicons name="person-outline" color={ui.color.primary} size={20}/></View>
                  <View style={styles.recordCopy}><Text style={styles.recordTitle}>Demo {ROLE_INFO[role].label}</Text>
                  <Text style={styles.recordDetail}>Sample profile · San Jose del Monte, Bulacan</Text></View><StatusPill neutral>Demo</StatusPill>
                </View>
                <EmptyNotice title="Account changes disabled" detail="Use a real isolated staging environment to test profile editing or verification."/>
              </Section> : null}
            {module!=="profile" ? <RecordBrowser key={role+module} role={role} module={module}/> : null}
            {SHOW_FORM[role].includes(module) ? <SampleForm key={role+module} role={role} module={module}/> : null}
            {module==="notifications" ? <Section icon="notifications-outline" title="Sample announcements" subtitle="Click to see a local state change">
              <Pressable accessibilityRole="button" onPress={()=>setSelectedAnnouncement(v=>!v)} style={styles.record}>
                <View style={styles.recordIcon}><Ionicons name="megaphone-outline" color={ui.color.primary} size={20}/></View>
                <View style={styles.recordCopy}><Text style={styles.recordTitle}>Community information bulletin</Text>
                  <Text style={styles.recordDetail}>Demonstration notice; no live publisher data</Text>
                  {selectedAnnouncement ? <Text style={styles.recordExpanded}>Opened locally in preview. Nothing was marked read in Firebase.</Text> : null}
                </View><Ionicons name="chevron-forward" color={ui.color.secondary} size={18}/>
              </Pressable>
            </Section> : null}
          </>}
        <View style={styles.footer}>
          <Text style={styles.footerText}>VOLUNSERVE DESIGN REVIEW · Browser and mobile · No production Firebase or backend access</Text>
          <Pressable accessibilityRole="button" onPress={()=>router.push("/public")}
            style={styles.footerLink}><Text style={styles.footerLinkText}>Exit preview</Text>
            <Ionicons name="arrow-forward-outline" size={15} color={ui.color.primary}/></Pressable>
        </View>
      </ScrollView>
    </View>
    {mobile && drawer ? <View style={styles.drawerLayer}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu overlay" onPress={()=>setDrawer(false)} style={styles.backdrop}/>
      <View style={styles.drawerPanel}>{sidebar}</View>
    </View> : null}
  </View>;
}

const styles=StyleSheet.create({
  app:{flex:1,flexDirection:"row",backgroundColor:ui.color.canvas},
  sidebarWrap:{width:254,flexShrink:0,height:"100%"},
  sidebar:{flex:1,backgroundColor:ui.color.sidebar,paddingTop:22,paddingHorizontal:14,paddingBottom:16},
  sidebarBrand:{flexDirection:"row",alignItems:"center",gap:10,paddingHorizontal:6,marginBottom:30},
  logo:{width:43,height:43,borderRadius:22,flexShrink:0},
  brand:{fontSize:19,fontWeight:"700",color:ui.color.white},
  brandSub:{fontSize:9,fontWeight:"600",color:ui.color.sidebarText,letterSpacing:0.3},
  navEyebrow:{fontSize:10,fontWeight:"700",color:"#9ED1BE",letterSpacing:1,paddingHorizontal:12,marginBottom:13},
  navScroll:{flex:1},navContainer:{gap:4,paddingBottom:10},
  navLink:{minHeight:46,flexDirection:"row",alignItems:"center",gap:11,paddingHorizontal:9,borderRadius:ui.radius.control},
  navLinkActive:{backgroundColor:ui.color.sidebarActive},
  navIcon:{width:32,height:32,borderRadius:9,backgroundColor:"rgba(255,255,255,0.08)",alignItems:"center",justifyContent:"center"},
  navIconActive:{backgroundColor:"rgba(255,255,255,0.14)"},
  navText:{color:ui.color.sidebarText,fontSize:13,fontWeight:"600",flex:1},
  navCurrent:{width:3,height:21,borderRadius:2,backgroundColor:"#BCEAD6"},
  sideFooter:{borderTopWidth:1,borderTopColor:"rgba(255,255,255,0.12)",paddingTop:16,flexDirection:"row",alignItems:"center",gap:9},
  sideFooterText:{color:ui.color.sidebarText,fontSize:10,fontWeight:"700",letterSpacing:0.35},
  sidebarClose:{minWidth:44,minHeight:44,alignItems:"center",justifyContent:"center"},
  contentWrap:{flex:1,minWidth:0,position:"relative"},
  topbar:{minHeight:76,paddingHorizontal:25,backgroundColor:ui.color.surface,
    borderBottomWidth:1,borderColor:ui.color.border,flexDirection:"row",alignItems:"center",gap:11,zIndex:2},
  topbarMobile:{minHeight:65,paddingHorizontal:13,gap:8},
  breadcrumb:{fontSize:13,color:ui.color.secondary,fontWeight:"500",flexShrink:1},
  iconButton:{minHeight:44,minWidth:44,borderRadius:ui.radius.control,borderWidth:1,borderColor:ui.color.border,
    justifyContent:"center",alignItems:"center",backgroundColor:ui.color.surface},
  roleSwitcher:{flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:10,minHeight:44,borderWidth:1,
    borderColor:ui.color.border,borderRadius:ui.radius.control,backgroundColor:ui.color.surface},
  roleAvatar:{height:30,width:30,borderRadius:15,alignItems:"center",justifyContent:"center",backgroundColor:ui.color.primarySoft},
  roleName:{fontSize:12,fontWeight:"700",color:ui.color.text},roleMeta:{fontSize:10,color:ui.color.secondary,marginTop:2},
  roleMenu:{position:"absolute",top:69,right:26,zIndex:25,width:248,backgroundColor:ui.color.surface,
    borderWidth:1,borderColor:ui.color.border,borderRadius:ui.radius.card,padding:12,elevation:8},
  roleMenuMobile:{top:61,right:11},
  topPopover:{position:"absolute",top:69,right:205,zIndex:24,width:280,padding:16,backgroundColor:ui.color.surface,
    borderColor:ui.color.border,borderWidth:1,borderRadius:ui.radius.card,gap:10,elevation:8},
  topPopoverMobile:{right:12,top:61},
  popoverTitle:{color:ui.color.text,fontSize:15,fontWeight:"700"},popoverCopy:{color:ui.color.secondary,fontSize:13,lineHeight:19},
  roleOption:{flexDirection:"row",alignItems:"center",gap:10,minHeight:45,paddingHorizontal:9,borderRadius:ui.radius.control},
  roleOptionText:{flex:1,fontSize:13,fontWeight:"600",color:ui.color.text},
  scroll:{flex:1},content:{paddingHorizontal:25,paddingTop:24,paddingBottom:35,gap:17,maxWidth:1540,width:"100%",alignSelf:"center"},
  contentMobile:{paddingHorizontal:13,paddingTop:16,gap:13},
  pageIntro:{flexDirection:"row",alignItems:"center",gap:18,padding:23,backgroundColor:ui.color.surface,
    borderRadius:ui.radius.card,borderWidth:1,borderColor:ui.color.border},
  pageIntroMobile:{padding:17},
  pageIntroText:{flex:1,minWidth:0,gap:7},
  eyebrow:{fontSize:11,color:ui.color.primary,fontWeight:"700",letterSpacing:0.75,lineHeight:16},
  heading:{color:ui.color.text,fontSize:27,lineHeight:34,fontWeight:"700"},
  headingMobile:{fontSize:22,lineHeight:29},
  pageDescription:{fontSize:13,lineHeight:20,color:ui.color.secondary,maxWidth:730},
  introIcon:{width:58,height:58,borderRadius:16,backgroundColor:ui.color.primarySoft,
    alignItems:"center",justifyContent:"center"},
  readOnlyBanner:{padding:12,borderRadius:ui.radius.control,backgroundColor:ui.color.primarySoft,
    flexDirection:"row",alignItems:"center",gap:10},
  bannerCopy:{flex:1,color:ui.color.text,fontSize:12,lineHeight:18},
  pill:{flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:10,paddingVertical:7,
    borderRadius:40,backgroundColor:ui.color.primarySoft,alignSelf:"flex-start"},
  pillNeutral:{backgroundColor:ui.color.mutedSurface},
  pillDot:{width:7,height:7,borderRadius:4,backgroundColor:ui.color.primary},
  pillDotNeutral:{backgroundColor:ui.color.secondary},
  pillText:{color:ui.color.primary,fontSize:11,fontWeight:"700"},
  pillTextNeutral:{color:ui.color.secondary},
  metricGrid:{flexDirection:"row",gap:12,flexWrap:"wrap"},
  metricGridMobile:{gap:9},
  metric:{flexGrow:1,flexBasis:165,minWidth:0,borderWidth:1,borderColor:ui.color.border,
    backgroundColor:ui.color.surface,borderRadius:ui.radius.card,padding:17,gap:9},
  metricTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},
  metricIcon:{width:38,height:38,borderRadius:ui.radius.control,backgroundColor:ui.color.primarySoft,alignItems:"center",justifyContent:"center"},
  metricNote:{fontSize:11,color:ui.color.secondary},
  metricValue:{fontSize:29,fontWeight:"700",color:ui.color.text,lineHeight:35},
  metricLabel:{fontSize:13,color:ui.color.secondary,fontWeight:"600"},
  sectionRow:{flexDirection:"row",gap:13,alignItems:"stretch"},
  sectionRowMobile:{flexDirection:"column"},
  section:{flex:1,minWidth:0,backgroundColor:ui.color.surface,borderColor:ui.color.border,
    borderWidth:1,borderRadius:ui.radius.card,padding:17,gap:13},
  sectionHeading:{flexDirection:"row",alignItems:"center",gap:10},
  sectionMark:{width:38,height:38,alignItems:"center",justifyContent:"center",
    borderRadius:ui.radius.control,backgroundColor:ui.color.primarySoft},
  sectionHeadingCopy:{flex:1,minWidth:0},sectionTitle:{fontSize:16,lineHeight:22,fontWeight:"700",color:ui.color.text},
  sectionSubtitle:{fontSize:12,lineHeight:18,color:ui.color.secondary,marginTop:2},
  moreButton:{flexDirection:"row",alignItems:"center",gap:5,minHeight:44,paddingHorizontal:6},
  moreText:{fontSize:12,fontWeight:"700",color:ui.color.primary},
  record:{flexDirection:"row",alignItems:"center",gap:11,paddingVertical:13,
    borderBottomWidth:1,borderColor:ui.color.border,minHeight:61},
  recordActive:{backgroundColor:ui.color.mutedSurface},
  recordIcon:{width:37,height:37,backgroundColor:ui.color.primarySoft,
    borderRadius:11,alignItems:"center",justifyContent:"center",flexShrink:0},
  recordCopy:{flex:1,minWidth:0,gap:3},
  recordTitle:{fontSize:13,lineHeight:19,fontWeight:"700",color:ui.color.text},
  recordDetail:{fontSize:12,lineHeight:18,color:ui.color.secondary},
  recordExpanded:{fontSize:12,lineHeight:18,color:ui.color.primary,marginTop:6},
  recordStatus:{backgroundColor:ui.color.mutedSurface,borderRadius:9,paddingHorizontal:9,paddingVertical:7},
  recordStatusText:{color:ui.color.secondary,fontSize:11,fontWeight:"600"},
  emptyNotice:{minHeight:160,alignItems:"center",justifyContent:"center",gap:8,padding:15},
  emptyTitle:{color:ui.color.text,fontWeight:"700",fontSize:14,textAlign:"center"},
  emptyCopy:{fontSize:12,lineHeight:19,color:ui.color.secondary,textAlign:"center",maxWidth:390},
  controls:{gap:11},
  search:{height:45,flexDirection:"row",alignItems:"center",gap:8,
    paddingHorizontal:13,borderWidth:1,borderColor:ui.color.border,borderRadius:ui.radius.control},
  searchInput:{flex:1,minWidth:0,height:"100%",color:ui.color.text,fontSize:13},
  filters:{flexDirection:"row",gap:7,flexWrap:"wrap"},
  filter:{minHeight:40,paddingHorizontal:14,justifyContent:"center",alignItems:"center",
    borderWidth:1,borderColor:ui.color.border,borderRadius:ui.radius.control},
  filterActive:{backgroundColor:ui.color.primarySoft,borderColor:ui.color.primary},
  filterText:{fontSize:12,fontWeight:"600",color:ui.color.secondary},
  filterTextActive:{color:ui.color.primary},
  detailArea:{backgroundColor:ui.color.mutedSurface,padding:15,gap:10,borderRadius:ui.radius.control,marginVertical:5},
  detailTitle:{color:ui.color.text,fontSize:13,fontWeight:"700"},
  detailText:{color:ui.color.secondary,fontSize:12,lineHeight:19},
  feedback:{color:ui.color.primary,fontSize:12,lineHeight:18},
  pagination:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",paddingTop:5},
  pageActions:{flexDirection:"row",alignItems:"center",gap:9,flexWrap:"wrap"},
  pageCopy:{fontSize:12,color:ui.color.secondary,fontWeight:"500"},
  formActions:{flexDirection:"row",flexWrap:"wrap",gap:10},
  formMessage:{padding:13,gap:9,backgroundColor:"#FFF0EF",borderRadius:ui.radius.control,
    flexDirection:"row",alignItems:"center"},
  formSuccess:{backgroundColor:ui.color.primarySoft},
  formMessageText:{flex:1,color:ui.color.text,fontSize:12,lineHeight:19},
  smallPrint:{color:ui.color.secondary,fontSize:11,lineHeight:17},
  moduleLead:{backgroundColor:ui.color.surface,borderWidth:1,borderColor:ui.color.border,
    borderRadius:ui.radius.card,padding:18,flexDirection:"row",alignItems:"center",gap:11},
  moduleLeadMobile:{padding:14},
  moduleIcon:{width:47,height:47,borderRadius:12,backgroundColor:ui.color.primarySoft,
    alignItems:"center",justifyContent:"center"},
  moduleTitle:{fontSize:19,lineHeight:26,fontWeight:"700",color:ui.color.text},
  moduleDescription:{fontSize:12,lineHeight:18,color:ui.color.secondary,marginTop:3},
  footer:{borderTopWidth:1,borderColor:ui.color.border,paddingTop:16,marginTop:5,
    flexDirection:"row",gap:8,justifyContent:"space-between",alignItems:"center",flexWrap:"wrap"},
  footerText:{fontSize:10,lineHeight:16,color:ui.color.secondary,flex:1},
  footerLink:{minHeight:44,flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:8},
  footerLinkText:{fontSize:12,color:ui.color.primary,fontWeight:"700"},
  drawerLayer:{...StyleSheet.absoluteFillObject,zIndex:50,flexDirection:"row"},
  backdrop:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(4,25,20,0.48)"},
  drawerPanel:{width:"84%",maxWidth:285,height:"100%"},
});
