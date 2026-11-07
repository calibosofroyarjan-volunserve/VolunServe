import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import AdministrativePreviewModules, { ADMIN_PREVIEW_MODULES, SUPERADMIN_PREVIEW_MODULES } from "./AdministrativePreviewModules";
import { liveUi as ui } from "../../constants/volunserveLiveUi";
import {
  Image, ImageBackground, Pressable, ScrollView, StyleSheet,
  Text, useWindowDimensions, View,
} from "react-native";

type Role = "resident" | "volunteer" | "admin" | "superadmin";
type Module = "home" | "emergency-reports" | "request-assistance" | "community-events" |
  "donations" | "emergency-tasks" | "profile" | "progress" | "certificates" | "updates";
type Icon = React.ComponentProps<typeof Ionicons>["name"];
type NavItem = { key: Module; label: string; icon: Icon; selected: Icon };

const RESIDENT_NAV: NavItem[] = [
  { key: "home", label: "Home", icon: "home-outline", selected: "home" },
  { key: "emergency-reports", label: "Emergency Reports", icon: "alert-circle-outline", selected: "alert-circle" },
  { key: "request-assistance", label: "Request Assistance", icon: "hand-left-outline", selected: "hand-left" },
  { key: "community-events", label: "Community Events", icon: "calendar-outline", selected: "calendar" },
  { key: "donations", label: "Donations", icon: "heart-outline", selected: "heart" },
];
const VOLUNTEER_NAV: NavItem[] = [
  { key: "home", label: "Home", icon: "home-outline", selected: "home" },
  { key: "emergency-tasks", label: "Emergency Tasks", icon: "people-outline", selected: "people" },
  { key: "community-events", label: "Community Events", icon: "calendar-outline", selected: "calendar" },
];
const VALID_MODULES = new Set<Module>([
  ...RESIDENT_NAV.map(item => item.key), ...VOLUNTEER_NAV.map(item => item.key),
  "profile", "progress", "certificates", "updates",
]);
const P = { ink: ui.color.text, green: ui.color.primary, teal: ui.color.primaryHover, muted: ui.color.secondary, line: ui.color.border };
const open = (role: Role, module: Module = "home") =>
  router.push({ pathname: "/public/preview", params: { role, module } } as any);

function Mark({ icon, color = "#087F72", tint = "#E2F8F0", size = 22 }: {
  icon: Icon; color?: string; tint?: string; size?: number;
}) {
  return <View style={[styles.mark, { backgroundColor: tint }]}><Ionicons name={icon} size={size} color={color} /></View>;
}
function Pill({ children, color = P.green }: { children: React.ReactNode; color?: string }) {
  return <View style={styles.pill}><Ionicons name="eye-outline" color={color} size={14} /><Text style={[styles.pillText, { color }]}>{children}</Text></View>;
}
function Panel({ icon, title, subtitle, children }: {
  icon: Icon; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return <View style={styles.panel}>
    <View style={styles.panelHeading}>
      <Mark icon={icon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.panelTitle}>{title}</Text>
        {subtitle ? <Text style={styles.panelSub}>{subtitle}</Text> : null}
      </View>
    </View>
    {children}
  </View>;
}
function DemoRow({ icon, label, description, badge, onPress }: {
  icon: Icon; label: string; description?: string; badge?: string; onPress?: () => void;
}) {
  const inner = <View style={styles.demoRow}>
    <Mark icon={icon} color="#1376CE" tint="#EDF5FE" size={19} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.rowTitle}>{label}</Text>
      {description ? <Text style={styles.rowSub}>{description}</Text> : null}
    </View>
    {badge ? <View style={styles.rowBadge}><Text style={styles.rowBadgeText}>{badge}</Text></View> : null}
    {onPress ? <Ionicons name="chevron-forward" size={19} color="#94AABD" /> : null}
  </View>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>{inner}</Pressable> : inner;
}
function DemoField({ name, value }: { name: string; value: string }) {
  return <View style={styles.demoField}>
    <Text style={styles.fieldLabel}>{name}</Text>
    <View style={styles.fieldContent}><Text style={styles.fieldText}>{value}</Text><Ionicons name="lock-closed-outline" size={15} color="#9EB2BC" /></View>
  </View>;
}
function Gate({ action }: { action: string }) {
  return <View style={styles.gate}>
    <Mark icon="lock-closed-outline" color="#236C59" tint="#DFF7EA" size={21} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.gateTitle}>Preview only — sign in to {action}</Text>
      <Text style={styles.gateDetail}>A verified or approved account is required. Guest mode never saves or submits information.</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Log in" onPress={() => router.push("/login")} style={styles.gateButton}>
      <Text style={styles.gateButtonText}>Log in</Text>
    </Pressable>
  </View>;
}
function SectionHeading({ title, description, icon }: { title: string; description: string; icon: Icon }) {
  return <View style={styles.sectionHeading}>
    <Mark icon={icon} color="#0C857A" size={24} />
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionDescription}>{description}</Text>
    </View>
    <Pill>Guest preview</Pill>
  </View>;
}
function Placeholder({ icon, title, description }: { icon: Icon; title: string; description: string }) {
  return <View style={styles.placeholder}>
    <Mark icon={icon} size={36} color="#7EADBF" tint="#EEF7FC" />
    <Text style={styles.placeholderTitle}>{title}</Text>
    <Text style={styles.placeholderDescription}>{description}</Text>
  </View>;
}
function Hero({ role, narrow }: { role: Role; narrow: boolean }) {
  const volunteer = role === "volunteer";
  return <View style={[styles.dashboardHero, narrow && styles.dashboardHeroCompact]}>
    <View style={styles.dashboardHeroIcon}>
      <Ionicons name={volunteer ? "hand-left-outline" : "home-outline"} size={27} color={ui.color.primary} />
    </View>
    <View style={styles.dashboardHeroCopy}>
      <Text style={styles.dashboardEyebrow}>{volunteer ? "VOLUNTEER OPERATIONS CENTER" : "RESIDENT OPERATIONS CENTER"} · DESIGN PREVIEW</Text>
      <Text style={[styles.dashboardTitle, narrow && styles.dashboardTitleCompact]}>
        {volunteer ? "Ready to serve your community" : "Your community, at a glance"}
      </Text>
      <Text style={styles.dashboardDescription}>
        {volunteer
          ? "Explore emergency task coordination, event participation and verified service records."
          : "Explore emergency reports, assistance requests, events and community support."}
      </Text>
      <View style={styles.dashboardBadges}>
        <View style={styles.dashboardBadge}><Ionicons name="location-outline" color={ui.color.primary} size={16}/><Text style={styles.dashboardBadgeText}>San Jose del Monte, Bulacan</Text></View>
        <View style={styles.dashboardBadge}><Ionicons name="shield-checkmark-outline" color={ui.color.primary} size={16}/><Text style={styles.dashboardBadgeText}>Safe read-only preview</Text></View>
      </View>
    </View>
    {!narrow && <View style={styles.dashboardSealWrap}>
      <Image source={require("../../assets/images/sjdm-rising-city.png")} style={styles.dashboardSeal} resizeMode="contain"/>
    </View>}
  </View>;
}

function Home({ role, narrow }: { role: Role; narrow: boolean }) {
  const volunteer = role === "volunteer";
  return <>
    <Hero role={role} narrow={narrow} />
    <View style={styles.workflow}>
      <Text style={styles.workflowStrong}>{volunteer ? "VOLUNTEER WORKFLOW" : "RESIDENT WORKFLOW"}</Text>
      <Text style={styles.workflowText}>{volunteer
        ? "Resident login  →  Admin approval  →  Emergency Tasks  →  My Profile progress and certificates"
        : "Sign in  →  Identity verification  →  Resident services  →  My Reports"}</Text>
    </View>
    <View style={[styles.twoColumns, narrow && styles.stackColumns]}>
      <Panel icon="document-text" title="Your Current Activity"
        subtitle={volunteer ? "Response assignments and volunteer activity." : "Recent emergency reports, assistance, and volunteer access."}>
        {volunteer ? <>
          <DemoRow icon="shield-checkmark-outline" label="Volunteer Assignment Status" description="Assigned emergency responses appear after sign in." badge="Private" onPress={() => open(role, "emergency-tasks")} />
          <DemoRow icon="ribbon-outline" label="Volunteer Progress" description="Review verified service contributions." badge="Preview" onPress={() => open(role, "progress")} />
          <DemoRow icon="document-outline" label="Certificates" description="View issued volunteer certificates in Profile." badge="Preview" onPress={() => open(role, "certificates")} />
        </> : <>
          <DemoRow icon="document-text-outline" label="Latest Report Status" description="Only your own reports are visible after sign in." badge="Private" onPress={() => open(role, "emergency-reports")} />
          <DemoRow icon="people-outline" label="Assistance Request Status" description="Track your submitted assistance requests." badge="Private" onPress={() => open(role, "request-assistance")} />
          <DemoRow icon="shield-checkmark-outline" label="Volunteer Access" description="Volunteer approval is managed by LGU Admin." badge="Private" onPress={() => open("volunteer", "home")} />
        </>}
      </Panel>
      <Panel icon="megaphone" title="Community Updates" subtitle="Important announcements from the local response team.">
        <Placeholder icon="document-text-outline" title="Community announcement preview"
          description="Live notices are not loaded in Guest Preview. Sign in to see the announcements available to your account." />
        <Pressable accessibilityRole="button" onPress={() => open(role, "updates")} style={styles.textButton}><Text style={styles.linkText}>Explore Community Updates  ›</Text></Pressable>
      </Panel>
    </View>
    <Gate action={volunteer ? "view assignments and service history" : "see personal reports and requests"} />
  </>;
}
function OtherModule({ role, module, narrow }: { role: Role; module: Module; narrow: boolean }) {
  const [filter, setFilter] = useState("All");
  const [detail, setDetail] = useState(false);
  const [tab, setTab] = useState<"overview" | "progress" | "certificates">(
    module === "progress" ? "progress" : module === "certificates" ? "certificates" : "overview"
  );
  if (module === "emergency-reports") return <>
    <SectionHeading title="Emergency Reports" description="Report incidents, view emergency response workflow, and use the embedded city map." icon="alert-circle-outline" />
    <View style={[styles.twoColumns, narrow && styles.stackColumns]}>
      <Panel icon="create-outline" title="Submit an Emergency Report" subtitle="Read-only example of the verified Resident reporting form.">
        <View style={styles.fields}><DemoField name="Incident category" value="Choose an emergency category" /><DemoField name="Barangay / location" value="Select an SJDM barangay and map location" />
          <DemoField name="Incident details" value="Describe the emergency and its urgency" /><DemoField name="Photo / video evidence" value="Media upload is disabled in guest mode" /></View>
        <Gate action="submit an emergency report" />
      </Panel>
      <Panel icon="map-outline" title="Emergency Map & Response" subtitle="Map access is embedded in Emergency Reports for real accounts.">
        <Placeholder icon="map-outline" title="SJDM live map placeholder" description="Location pins, response routing, and private incident data are not connected in this public preview." />
        <DemoRow icon="medkit-outline" label="Emergency response" description="LGU teams review cases before dispatch." badge="View only" />
        <DemoRow icon="document-text-outline" label="My Reports" description="Available to the signed-in report owner." badge="Private" />
      </Panel>
    </View>
  </>;
  if (module === "request-assistance") return <>
    <SectionHeading title="Request Assistance" icon="hand-left-outline" description="Verified residents can request support, submit evidence, and track LGU review." />
    <View style={[styles.twoColumns, narrow && styles.stackColumns]}>
      <Panel icon="list-outline" title="Assistance Application" subtitle="Preview of the verified resident's submission process.">
        <View style={styles.steps}>{["Request details", "Evidence & estimated cost", "Review & submit"].map((name, i) =>
          <View key={name} style={styles.step}><Text style={styles.stepNumber}>{i + 1}</Text><Text style={styles.stepText}>{name}</Text></View>)}</View>
        <View style={styles.fields}><DemoField name="Assistance category" value="Select requested assistance" /><DemoField name="Barangay / address" value="SJDM address required" /><DemoField name="Supporting documents" value="Upload receipts / supporting media" /></View>
        <Gate action="request assistance" />
      </Panel>
      <Panel icon="shield-checkmark-outline" title="LGU Review Process" subtitle="A request is not automatically approved.">
        <DemoRow icon="document-text-outline" label="Resident submits request" description="Verified account and supporting evidence required." />
        <DemoRow icon="search-outline" label="Admin evaluates request" description="LGU Admin reviews eligibility and evidence." />
        <DemoRow icon="checkmark-circle-outline" label="Decision and follow-up" description="Status appears in the resident's own account." />
      </Panel>
    </View>
  </>;
  if (module === "community-events") return <>
    <SectionHeading title="Community Events" icon="calendar-outline" description={role === "resident"
      ? "Explore local activities and see how verified residents propose events."
      : "Explore events, volunteer participation, and event attendance."} />
    <View style={styles.chipRow}>{["All", "Upcoming", "Completed"].map(value =>
      <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: value === filter }}
        onPress={() => setFilter(value)} style={[styles.chip, filter === value && styles.chipSelected]}>
        <Text style={[styles.chipText, filter === value && styles.chipTextSelected]}>{value}</Text></Pressable>)}</View>
    <View style={[styles.twoColumns, narrow && styles.stackColumns]}>
      <Panel icon="calendar-outline" title="Explore Events" subtitle="Illustrative layout only — no live events fetched.">
        <View style={styles.sampleCard}>
          <Pill>Example event — not published</Pill>
          <Text style={styles.sampleTitle}>Community Clean-up Drive</Text>
          <Text style={styles.sampleText}>Category: Community Service · Venue: SJDM barangay venue</Text>
          <Text style={styles.sampleText}>The real event page shows organizer details, venue, schedule, and eligible volunteers.</Text>
          <Pressable accessibilityRole="button" onPress={() => setDetail(!detail)} style={styles.minorButton}>
            <Text style={styles.minorButtonText}>{detail ? "Hide sample details" : "View sample details"}</Text><Ionicons name={detail ? "chevron-up" : "chevron-down"} size={17} color="#087864" />
          </Pressable>
          {detail ? <View style={styles.detailBox}><Text style={styles.sampleText}>Details · Location & Map · Volunteers · Media</Text>
            <Text style={styles.sampleText}>All information here is illustrative, not a real event registration.</Text></View> : null}
        </View>
      </Panel>
      <Panel icon={role === "resident" ? "create-outline" : "time-outline"}
        title={role === "resident" ? "Propose an Event" : "Event Attendance"}
        subtitle={role === "resident" ? "Proposals are reviewed and published by LGU Admin." : "Time-in and time-out are validated by the event process."}>
        {role === "resident" ? <>
          <DemoField name="Event information" value="Title, category and description" />
          <DemoField name="Venue and schedule" value="SJDM barangay / venue pin and event time" />
          <Gate action="propose a community event" />
        </> : <>
          <DemoRow icon="log-in-outline" label="Time In" description="Allowed for eligible event participants." badge="Locked" />
          <DemoRow icon="log-out-outline" label="Time Out" description="Recorded after actual participation." badge="Locked" />
          <DemoRow icon="ribbon-outline" label="Verified Attendance" description="LGU Admin verifies completed attendance." badge="Locked" />
          <Gate action="join an event or record attendance" />
        </>}
      </Panel>
    </View>
  </>;
  if (module === "donations") return <>
    <SectionHeading title="Donations" icon="heart-outline" description="See how assistance campaigns, contribution progress, and donation history work." />
    <View style={[styles.twoColumns, narrow && styles.stackColumns]}>
      <Panel icon="heart-outline" title="Assistance Campaigns" subtitle="Illustrative campaign card — not accepting payments.">
        <View style={styles.sampleCard}>
          <Pill>Example only · no real fundraiser</Pill>
          <Text style={styles.sampleTitle}>Community Relief Support</Text>
          <Text style={styles.sampleText}>Eligible assistance requests are reviewed and approved by LGU Admin before fundraising.</Text>
          <View style={styles.progressTrack}><View style={styles.progressBar} /></View>
          <Text style={styles.sampleText}>Example progress visualization — not a real balance.</Text>
        </View>
        <Gate action="make a donation" />
      </Panel>
      <Panel icon="receipt-outline" title="Donation History & Transparency" subtitle="Personal donation records are private.">
        <DemoRow icon="card-outline" label="Payment Method" description="PayMongo-supported sandbox payment flow for testing." badge="Sign in" />
        <DemoRow icon="receipt-outline" label="Receipt & Donation History" description="Only the account owner can view receipts." badge="Private" />
        <DemoRow icon="shield-checkmark-outline" label="Fund Review" description="LGU Admin controls approval and fund release." />
      </Panel>
    </View>
  </>;
  if (module === "emergency-tasks") return <>
    <SectionHeading title="Emergency Tasks" icon="people-outline" description="Approved volunteers can view their LGU emergency assignments and response workflow." />
    <View style={[styles.twoColumns, narrow && styles.stackColumns]}>
      <Panel icon="clipboard-outline" title="My Emergency Assignments" subtitle="Assignments are private, including when a volunteer is offline.">
        <View style={styles.chipRow}>{["All", "Pending", "In Progress", "Completed"].map(value =>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: value === filter }} key={value}
            onPress={() => setFilter(value)} style={[styles.chip, filter === value && styles.chipSelected]}>
            <Text style={[styles.chipText, filter === value && styles.chipTextSelected]}>{value}</Text></Pressable>)}</View>
        <Placeholder icon="shield-checkmark-outline" title="No private assignments shown" description="Sign in as an approved Volunteer to see tasks assigned by LGU Admin. No real case data is exposed to guests." />
        <Gate action="accept or update an assignment" />
      </Panel>
      <Panel icon="navigate-outline" title="Volunteer Response Workflow" subtitle="Actions are disabled in Guest Preview.">
        <DemoRow icon="checkmark-circle-outline" label="Accept / Decline" description="Review the assigned task and respond." badge="Locked" />
        <DemoRow icon="map-outline" label="Response Map" description="Embedded route map for your assigned case." badge="Locked" />
        <DemoRow icon="location-outline" label="On-Site Updates" description="Record arrival and case contribution." badge="Locked" />
        <DemoRow icon="checkmark-done-outline" label="Completion" description="LGU Admin confirms the final outcome." badge="Locked" />
      </Panel>
    </View>
  </>;
  if (module === "profile" || module === "progress" || module === "certificates") return <>
    <SectionHeading title="My Profile" icon="person-circle-outline" description="Account details, volunteer progress, and certificates are inside Profile, not on the sidebar." />
    <View style={styles.chipRow}>{([["overview", "Profile"], ["progress", "My Progress"], ["certificates", "Certificates"]] as const).map(([key, label]) =>
      <Pressable accessibilityRole="button" accessibilityState={{selected:key === tab}} key={key}
        onPress={() => setTab(key)} style={[styles.chip, tab === key && styles.chipSelected]}>
        <Text style={[styles.chipText, tab === key && styles.chipTextSelected]}>{label}</Text></Pressable>)}</View>
    <View style={[styles.twoColumns, narrow && styles.stackColumns]}>
      <Panel icon={tab === "overview" ? "person-outline" : tab === "progress" ? "ribbon-outline" : "document-text-outline"}
        title={tab === "overview" ? "Account Profile" : tab === "progress" ? "Volunteer Progress" : "Issued Certificates"}
        subtitle="Account-specific information is not available to guests.">
        {tab === "overview" ? <>
          <DemoRow icon="person-outline" label="Personal Information" description="Private profile and verification status." badge="Sign in" />
          <DemoRow icon="shield-checkmark-outline" label="Verification" description="Verified Resident status requires LGU approval." badge="Sign in" />
        </> : tab === "progress" ? <>
          <DemoRow icon="time-outline" label="Verified Volunteer Hours" description="Shows actual approved service hours after login." badge="Private" />
          <DemoRow icon="calendar-outline" label="Completed Activities" description="Only verified participation is counted." badge="Private" />
        </> : <Placeholder icon="ribbon-outline" title="Certificates are private" description="LGU-verified volunteer certificates appear here after participation is confirmed." />}
        <Gate action="view your profile and service records" />
      </Panel>
      <Panel icon="information-circle-outline" title="Account Access" subtitle="Guest Preview does not create or verify an account.">
        <DemoRow icon="mail-outline" label="Sign up / Sign in" description="Create an account or use your existing account." />
        <DemoRow icon="id-card-outline" label="Resident Identity Verification" description="Requires government ID review and LGU approval." />
        <DemoRow icon="people-outline" label="Volunteer Approval" description="Only an approved Volunteer may participate in response tasks." />
      </Panel>
    </View>
  </>;
  return <>
    <SectionHeading title="Community Updates" icon="megaphone-outline" description="This preview does not retrieve private or targeted LGU announcements." />
    <Panel icon="megaphone-outline" title="Announcements" subtitle="Announcements available to your account appear after login.">
      <Placeholder icon="document-text-outline" title="No live announcements in preview" description="Do not treat this demonstration as a source of official emergency updates." />
    </Panel>
    <Gate action="see account-specific announcements" />
  </>;
}

export default function GuestWorkspace({ landing = false }: { landing?: boolean }) {
  const params = useLocalSearchParams<{ role?: string; module?: string }>();
  const role: Role = params.role === "admin" ? "admin" : params.role === "superadmin" ? "superadmin" : params.role === "volunteer" ? "volunteer" : "resident";
  const requested = params.module as Module;
  const allowed: NavItem[] = role === "admin"
    ? ADMIN_PREVIEW_MODULES.map(item => ({key:item.key as Module,label:item.label,icon:item.icon,selected:item.icon}))
    : role === "superadmin"
    ? SUPERADMIN_PREVIEW_MODULES.map(item => ({key:item.key as Module,label:item.label,icon:item.icon,selected:item.icon}))
    : role === "volunteer" ? VOLUNTEER_NAV : RESIDENT_NAV;
  const isAdmin = role === "admin" || role === "superadmin";
  const module: Module = (isAdmin
    ? (allowed.some(item=>item.key===requested) ? requested : allowed[0].key)
    : (VALID_MODULES.has(requested) &&
      (allowed.some(item => item.key === requested) || ["profile", "progress", "certificates", "updates"].includes(requested))
      ? requested : "home"));
  const { width } = useWindowDimensions();
  const narrow = width < 1040;
  const smallPhone = width < 420;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  if (landing) {
    return <ScrollView style={styles.landing} contentContainerStyle={styles.landingContents}>
      <View style={styles.landingBrand}><Image source={require("../../assets/images/logo.png")} style={styles.landingLogo} />
        <View><Text style={styles.brandTitleDark}>VolunServe</Text><Text style={styles.brandCaptionDark}>CITY OF SAN JOSE DEL MONTE</Text></View>
        <View style={{ flex: 1 }} /><Pill>Public read-only access</Pill></View>
      <ImageBackground source={require("../../assets/images/sjdm-aerial.png")} style={styles.landingHero} imageStyle={{ borderRadius: 22 }}>
        <LinearGradient colors={["rgba(4,47,44,0.92)", "rgba(4,44,53,0.67)"]} style={StyleSheet.absoluteFill} />
        <Text style={styles.landingEyebrow}>WELCOME TO VOLUNSERVE</Text>
        <Text style={styles.landingTitle}>Explore the community{"\n"}before you sign in.</Text>
        <Text style={styles.landingSubtitle}>Choose the workspace you want to view. Browse the same module structure in a safe, read-only guest demonstration.</Text>
      </ImageBackground>
      <Text style={styles.chooseTitle}>Which workspace would you like to preview?</Text>
      <View style={[styles.twoColumns, narrow && styles.stackColumns]}>
        {(["resident", "volunteer", "admin", "superadmin"] as const).map(value =>
          <Pressable key={value} accessibilityRole="button" accessibilityLabel={"Preview " + value + " workspace"}
            style={({pressed}) => [styles.choiceCard, pressed && { opacity: 0.8 }]} onPress={() => open(value, "home")}>
            <Mark icon={value === "resident" ? "home-outline" : value === "volunteer" ? "hand-left-outline" : value === "admin" ? "shield-checkmark-outline" : "settings-outline"} color={ui.color.primary} size={27} />
            <Text style={styles.choiceTitle}>{value === "resident" ? "Verified Resident" : value === "volunteer" ? "Volunteer" : value === "admin" ? "LGU Admin" : "Super Admin"} Workspace</Text>
            <Text style={styles.choiceDescription}>{value === "resident"
              ? "Home · Emergency Reports · Request Assistance · Community Events · Donations"
              : value === "volunteer" ? "Home · Emergency Tasks · Community Events · Profile Progress · Certificates"
              : value === "admin" ? "Command Center · Identity Reviews · Emergency Reports · Events · Donations"
              : "System Overview · Admin Accounts · Audit Logs · Records · Settings"}</Text>
            <View style={styles.choiceAction}><Text style={styles.choiceActionText}>Preview {value === "resident" ? "Resident" : value === "volunteer" ? "Volunteer" : value === "admin" ? "Admin" : "Super Admin"}</Text>
              <Ionicons name="arrow-forward" color="#087F6D" size={21} /></View>
          </Pressable>)}
      </View>
      <View style={styles.landingFooter}>
        <Ionicons name="lock-closed-outline" size={19} color="#377D70" />
        <Text style={styles.landingFooterText}>Not a real verified account. No Firebase sign-in, personal data, submissions, payments, or LGU approval.</Text>
        <Pressable onPress={() => router.push("/login")} accessibilityRole="button"><Text style={styles.linkText}>Sign in  ›</Text></Pressable>
      </View>
    </ScrollView>;
  }
  const sideBar = <View style={styles.sidebar}>
    <View style={styles.sidebarLeaf} pointerEvents="none"><Ionicons name="leaf-outline" size={150} color="#2D927A" /></View>
    <View style={styles.sidebarBrand}>
      <Image source={require("../../assets/images/logo.png")} style={styles.sidebarLogo} />
      <View><Text style={styles.sidebarName}>VolunServe</Text><Text style={styles.sidebarSub}>CITY OF SAN JOSE DEL MONTE</Text></View>
    </View>
    <Text style={styles.sidebarLabel}>{role === "resident" ? "RESIDENT SERVICES" : role === "volunteer" ? "VOLUNTEER WORKSPACE" : role === "admin" ? "ADMIN OPERATIONS" : "SYSTEM GOVERNANCE"}</Text>
    <ScrollView style={styles.navScroll} contentContainerStyle={styles.navContent}>
      {allowed.map(item => <Pressable key={item.key} accessibilityRole="button"
        accessibilityState={{selected:module === item.key}} accessibilityLabel={item.label}
        onPress={() => {setDrawerOpen(false);open(role, item.key);}}
        style={[styles.navItem, module === item.key && styles.navItemSelected]}>
        <View style={styles.navIcon}><Ionicons name={module === item.key ? item.selected : item.icon} size={20} color="#FFF" /></View>
        <Text style={styles.navLabel}>{item.label}</Text>
        {module === item.key ? <View style={styles.navMark} /> : null}
      </Pressable>)}
    </ScrollView>
    <Pressable accessibilityRole="button" onPress={() => {setDrawerOpen(false);router.push("/public");}} style={styles.switchSide}>
      <Ionicons name="swap-horizontal-outline" size={18} color="#C7F3DE" />
      <Text style={styles.switchSideText}>Change preview workspace</Text>
    </Pressable>
  </View>;
  return <View style={styles.root}>
    {!narrow ? <View style={{ width: 272, height: "100%" }}>{sideBar}</View> : null}
    <View style={styles.main}>
      <View style={styles.top}>
        {narrow ? <Pressable accessibilityRole="button" accessibilityLabel="Open navigation" onPress={() => setDrawerOpen(true)} style={styles.topIcon}><Ionicons name="menu" size={23} color={P.ink} /></Pressable> : <View style={{flex:1}} />}
        <View style={styles.topStatus}><View style={styles.statusDot} /><Text style={styles.topStatusText}>Guest · Read-only</Text></View>
        <Pressable style={styles.topIcon} accessibilityRole="button" accessibilityLabel="Community updates preview" onPress={() => open(role, "updates")}>
          <Ionicons name="notifications-outline" size={22} color={P.ink} /></Pressable>
        <Pressable style={styles.account} accessibilityRole="button" accessibilityLabel="Guest account menu" accessibilityState={{expanded:accountOpen}}
          onPress={() => setAccountOpen(v => !v)}>
          <Mark icon="person-circle-outline" size={22} color="#3474C4" tint="#E1ECFF" />
          {!narrow ? <View><Text style={styles.accountName}>Guest Preview</Text><Text style={styles.accountRole}>{role === "resident" ? "Resident view" : role === "volunteer" ? "Volunteer view" : role === "admin" ? "Admin view" : "Super Admin view"}</Text></View> : null}
          <Ionicons name="chevron-down" size={17} color="#1F4260" /></Pressable>
      </View>
      {accountOpen ? <View style={styles.accountDropdown}>
        {([["profile", "View Profile"], ["progress", "My Progress"], ["certificates", "Certificates"]] as const).map(([key, label]) =>
          <Pressable accessibilityRole="button" key={key} style={styles.accountOption} onPress={() => {setAccountOpen(false);open(role,key);}}>
            <Text style={styles.accountOptionText}>{label}</Text><Ionicons name="chevron-forward" size={15} color="#81909E" />
          </Pressable>)}
        <Pressable accessibilityRole="button" style={styles.accountOption} onPress={() => {setAccountOpen(false);router.push("/public");}}>
          <Text style={styles.accountOptionText}>Switch workspace</Text><Ionicons name="swap-horizontal-outline" size={16} color="#81909E" />
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.accountOption} onPress={() => router.push("/login")}><Text style={styles.accountOptionText}>Log in</Text><Ionicons name="log-in-outline" size={16} color="#81909E" /></Pressable>
      </View> : null}
      <ScrollView style={styles.contentScroll} contentContainerStyle={styles.content} key={role + ":" + module}>
        {isAdmin ? <AdministrativePreviewModules key={role+":"+module} role={role as "admin" | "superadmin"} module={module} onNavigate={(next)=>open(role,next as Module)}/>
          : module === "home" ? <Home role={role} narrow={narrow} />
          : <OtherModule key={role + ":" + module} role={role} module={module} narrow={narrow} />}
        <View style={styles.bottomBar}><Text style={styles.bottomText}>DESIGN PREVIEW · Sample screens only. No account permissions or production data.</Text>
          <Pressable onPress={() => router.push("/signup")} accessibilityRole="button"><Text style={styles.linkText}>Create an account  ›</Text></Pressable></View>
      </ScrollView>
    </View>
    {narrow && drawerOpen ? <View style={styles.mobileOverlay}>
      <Pressable style={styles.scrim} accessibilityLabel="Close navigation" accessibilityRole="button" onPress={() => setDrawerOpen(false)} />
      <View style={styles.mobileSidebar}>{sideBar}
        <Pressable accessibilityRole="button" onPress={() => setDrawerOpen(false)} style={styles.closeMobile}><Ionicons name="close" size={25} color="#FFF" /></Pressable>
      </View>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  dashboardHero: {
    minHeight: 205, flexDirection: "row", alignItems: "flex-start", gap: 16,
    backgroundColor: ui.color.surface, borderWidth: 1, borderColor: ui.color.border,
    borderRadius: ui.radius.card, padding: 22,
  },
  dashboardHeroCompact: { minHeight: 0, padding: 16, gap: 12 },
  dashboardHeroIcon: {
    width: 48, height: 48, flexShrink: 0, borderRadius: ui.radius.control,
    backgroundColor: ui.color.primarySoft, justifyContent: "center", alignItems: "center",
  },
  dashboardHeroCopy: { flex: 1, minWidth: 0, gap: 8 },
  dashboardEyebrow: { fontSize: 11, lineHeight: 16, fontWeight: "700", letterSpacing: 0.65, color: ui.color.primary },
  dashboardTitle: { fontSize: 26, lineHeight: 34, fontWeight: "700", color: ui.color.text },
  dashboardTitleCompact: { fontSize: 21, lineHeight: 29 },
  dashboardDescription: { fontSize: 14, lineHeight: 21, color: ui.color.secondary, maxWidth: 650 },
  dashboardBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  dashboardBadge: {
    minHeight: 34, flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: ui.color.primarySoft, paddingHorizontal: 10,
    paddingVertical: 6, borderRadius: ui.radius.control,
  },
  dashboardBadgeText: { fontSize: 11, lineHeight: 17, color: ui.color.primary, fontWeight: "600" },
  dashboardSealWrap: {
    width: 110, height: 110, flexShrink: 0, borderRadius: ui.radius.card,
    backgroundColor: ui.color.mutedSurface, justifyContent: "center", alignItems: "center",
  },
  dashboardSeal: { width: 92, height: 92 },

  root:{flex:1,flexDirection:"row",backgroundColor:ui.color.canvas},
  sidebar:{width:"100%",height:"100%",backgroundColor:ui.color.sidebar,paddingHorizontal:16,paddingTop:20,paddingBottom:18,overflow:"hidden"},
  sidebarLeaf:{position:"absolute",bottom:80,left:-70,opacity:0.08},
  sidebarBrand:{flexDirection:"row",alignItems:"center",gap:10,marginBottom:23,paddingLeft:5},
  sidebarLogo:{width:46,height:46,borderRadius:23},sidebarName:{fontSize:20,fontWeight:"700",color:ui.color.white},
  sidebarSub:{fontSize:10,fontWeight:"600",color:ui.color.sidebarText},
  sidebarLabel:{fontSize:11,letterSpacing:0.9,fontWeight:"700",color:ui.color.sidebarText,marginBottom:16,marginLeft:8},
  navScroll:{flex:1},navContent:{gap:5,paddingBottom:14},
  navItem:{minHeight:ui.minTap+5,borderRadius:ui.radius.control,flexDirection:"row",alignItems:"center",paddingHorizontal:9,gap:10},
  navItemSelected:{backgroundColor:ui.color.sidebarActive,borderWidth:1,borderColor:ui.color.sidebarActive},
  navIcon:{backgroundColor:"rgba(255,255,255,0.08)",width:38,height:38,borderRadius:ui.radius.control,alignItems:"center",justifyContent:"center"},
  navLabel:{fontSize:13,lineHeight:19,color:ui.color.sidebarText,fontWeight:"600",flex:1},
  navMark:{width:4,height:23,borderRadius:2,backgroundColor:"#C5FFEB"},
  switchSide:{flexDirection:"row",alignItems:"center",gap:9,paddingVertical:13},
  switchSideText:{color:ui.color.sidebarText,fontSize:13,fontWeight:"600"},
  main:{flex:1,minWidth:0,position:"relative"},top:{minHeight:70,flexDirection:"row",alignItems:"center",justifyContent:"flex-end",paddingHorizontal:16,gap:10,flexWrap:"wrap"},
  topStatus:{minHeight:ui.minTap,flexDirection:"row",alignItems:"center",gap:8,backgroundColor:ui.color.primarySoft,borderWidth:1,borderColor:ui.color.border,borderRadius:ui.radius.control,paddingHorizontal:12},
  statusDot:{width:9,height:9,borderRadius:5,backgroundColor:"#00A277"},
  topStatusText:{fontSize:12,fontWeight:"600",color:ui.color.primary},
  topIcon:{width:ui.minTap,height:ui.minTap,borderRadius:ui.radius.control,backgroundColor:ui.color.surface,borderWidth:1,borderColor:ui.color.border,alignItems:"center",justifyContent:"center"},
  account:{minHeight:ui.minTap,borderRadius:ui.radius.control,flexDirection:"row",alignItems:"center",gap:7,paddingHorizontal:9,backgroundColor:ui.color.surface,borderWidth:1,borderColor:ui.color.border},
  accountName:{fontSize:12,fontWeight:"700",color:P.ink},accountRole:{fontSize:11,color:P.muted},
  accountDropdown:{position:"absolute",top:68,right:12,zIndex:10,width:220,maxWidth:"95%",backgroundColor:ui.color.surface,borderColor:ui.color.border,borderWidth:1,borderRadius:ui.radius.card,padding:7,elevation:5},
  accountOption:{minHeight:ui.minTap,paddingHorizontal:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  accountOptionText:{fontSize:13,fontWeight:"600",color:P.ink},
  contentScroll:{flex:1},content:{paddingHorizontal:16,paddingBottom:32,gap:16},
  hero:{minHeight:285,borderRadius:19,overflow:"hidden",justifyContent:"center",backgroundColor:"#204B56"},
  heroPicture:{borderRadius:19},
  heroInner:{minHeight:285,padding:29,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:15},
  heroInnerNarrow:{padding:24,minHeight:250},
  heroLeft:{flex:1.15,gap:8},heroEyebrow:{color:"#DFFCF4",fontSize:11,fontWeight:"900",letterSpacing:1.4},
  heroTitle:{fontWeight:"900",fontSize:34,color:"#FFF"},heroTitleSmall:{fontSize:28},heroAccent:{color:"#6DEBBF"},
  heroSub:{color:"#F0F8F8",fontSize:13,fontWeight:"600"},
  locationStrip:{alignSelf:"flex-start",marginTop:10,backgroundColor:"#2369B1",borderRadius:12,paddingVertical:11,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:8},
  locationCopy:{color:"#FFF",fontSize:12,fontWeight:"900"},heroFoot:{color:"#CFE8EC",fontSize:10},
  citySealWrap:{width:172,height:172,borderRadius:100,borderWidth:2,borderColor:"#FFB42E",alignItems:"center",justifyContent:"center",backgroundColor:"rgba(255,255,255,0.10)"},
  citySeal:{width:150,height:150},heroRight:{flex:0.75,gap:8},heroRightTitle:{color:"#FFF",fontWeight:"900",fontSize:21},
  heroRightSub:{fontSize:11,color:"#FFF"},heroAccentBar:{height:4,width:45,backgroundColor:"#78EDAA",borderRadius:5,marginTop:6},
  workflow:{padding:12,borderBottomWidth:1,borderColor:"#D7E6E9",flexDirection:"row",gap:14,alignItems:"center",flexWrap:"wrap"},
  workflowStrong:{fontSize:11,fontWeight:"900",color:"#076F56",letterSpacing:0.4},
  workflowText:{fontSize:12,color:"#466F62"},
  twoColumns:{flexDirection:"row",alignItems:"stretch",gap:14},stackColumns:{flexDirection:"column"},
  panel:{flex:1,minWidth:0,backgroundColor:ui.color.surface,borderWidth:1,borderColor:ui.color.border,borderRadius:ui.radius.card,padding:18,gap:14},
  panelHeading:{flexDirection:"row",alignItems:"center",gap:11,marginBottom:2},
  mark:{width:45,height:45,borderRadius:18,alignItems:"center",justifyContent:"center",flexShrink:0},
  panelTitle:{fontSize:ui.type.card.fontSize,lineHeight:ui.type.card.lineHeight,fontWeight:"700",color:P.ink},panelSub:{fontSize:12,color:P.muted,marginTop:4,lineHeight:18},
  demoRow:{flexDirection:"row",alignItems:"center",gap:11,paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#E8EFF4"},
  rowTitle:{fontSize:13,color:P.ink,fontWeight:"700"},rowSub:{fontSize:12,color:P.muted,marginTop:4,lineHeight:18},
  rowBadge:{backgroundColor:ui.color.primarySoft,borderRadius:ui.radius.control,paddingHorizontal:10,paddingVertical:8},
  rowBadgeText:{color:ui.color.primary,fontSize:11,fontWeight:"600"},
  placeholder:{minHeight:175,alignItems:"center",justifyContent:"center",padding:18,gap:9},
  placeholderTitle:{color:ui.color.text,fontSize:15,fontWeight:"700",textAlign:"center"},
  placeholderDescription:{color:ui.color.secondary,fontSize:12,lineHeight:18,textAlign:"center",maxWidth:330},
  textButton:{alignSelf:"flex-end",padding:11,minHeight:ui.minTap,justifyContent:"center"},linkText:{color:ui.color.primary,fontWeight:"700",fontSize:13},
  gate:{borderRadius:ui.radius.card,padding:15,backgroundColor:ui.color.primarySoft,borderWidth:1,borderColor:ui.color.border,flexDirection:"row",alignItems:"center",gap:11,flexWrap:"wrap"},
  gateTitle:{fontSize:13,color:ui.color.text,fontWeight:"700"},gateDetail:{fontSize:12,color:ui.color.secondary,lineHeight:18,marginTop:3},
  gateButton:{backgroundColor:ui.color.primary,borderRadius:ui.radius.control,paddingHorizontal:16,paddingVertical:11,minHeight:ui.minTap,justifyContent:"center"},
  gateButtonText:{color:ui.color.white,fontSize:13,fontWeight:"700"},
  sectionHeading:{backgroundColor:ui.color.surface,borderColor:ui.color.border,borderWidth:1,borderRadius:ui.radius.card,flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:12,padding:18},
  sectionTitle:{fontSize:ui.type.page.fontSize,lineHeight:ui.type.page.lineHeight,color:P.ink,fontWeight:"700"},sectionDescription:{fontSize:13,color:P.muted,lineHeight:20,marginTop:3},
  pill:{flexDirection:"row",gap:5,alignSelf:"flex-start",alignItems:"center",paddingHorizontal:9,paddingVertical:6,borderRadius:999,backgroundColor:"#E4F7ED"},
  pillText:{fontSize:11,fontWeight:"700"},
  fields:{gap:13},demoField:{gap:6,flex:1,minWidth:0},
  fieldLabel:{fontSize:ui.type.label.fontSize,fontWeight:"600",color:ui.color.text},
  fieldContent:{minHeight:45,backgroundColor:"#F7FAFB",borderWidth:1,borderColor:"#DCE6E9",borderRadius:10,padding:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:6},
  fieldText:{fontSize:13,color:ui.color.secondary,flex:1},
  steps:{flexDirection:"row",flexWrap:"wrap",gap:10,paddingBottom:10},
  step:{flexDirection:"row",alignItems:"center",gap:6},stepNumber:{width:22,height:22,overflow:"hidden",borderRadius:11,backgroundColor:"#0B8368",color:"#FFF",fontSize:11,fontWeight:"900",textAlign:"center",textAlignVertical:"center"},
  stepText:{fontSize:11,fontWeight:"700",color:"#246A56"},
  chipRow:{flexDirection:"row",alignItems:"center",gap:8,flexWrap:"wrap"},
  chip:{minHeight:ui.minTap,justifyContent:"center",paddingVertical:9,paddingHorizontal:14,borderColor:ui.color.border,borderWidth:1,borderRadius:ui.radius.control,backgroundColor:ui.color.surface},
  chipSelected:{backgroundColor:ui.color.primary,borderColor:ui.color.primary},
  chipText:{color:ui.color.secondary,fontSize:12,fontWeight:"600"},chipTextSelected:{color:ui.color.white},
  sampleCard:{padding:15,borderRadius:ui.radius.card,backgroundColor:ui.color.mutedSurface,borderWidth:1,borderColor:ui.color.border,gap:11},
  sampleTitle:{fontSize:16,fontWeight:"700",color:P.ink},sampleText:{fontSize:13,color:ui.color.secondary,lineHeight:20},
  minorButton:{backgroundColor:ui.color.primarySoft,borderRadius:ui.radius.control,padding:11,minHeight:ui.minTap,alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:7},
  minorButtonText:{color:ui.color.primary,fontSize:13,fontWeight:"700"},
  detailBox:{backgroundColor:"#FFF",borderRadius:9,padding:12,gap:5},
  progressTrack:{height:12,borderRadius:7,backgroundColor:"#CDE5D7",overflow:"hidden"},
  progressBar:{width:"42%",height:"100%",backgroundColor:"#0B9574"},
  bottomBar:{borderTopColor:"#DAE8EF",borderTopWidth:1,paddingTop:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"},
  bottomText:{color:ui.color.secondary,fontSize:11,fontWeight:"600",flexShrink:1},
  mobileOverlay:{...StyleSheet.absoluteFillObject,zIndex:20,flexDirection:"row"},
  scrim:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,20,25,0.55)"},
  mobileSidebar:{width:278,height:"100%",position:"relative"},
  closeMobile:{position:"absolute",right:8,top:7,padding:5},
  landing:{flex:1,backgroundColor:ui.color.canvas},
  landingContents:{width:"100%",maxWidth:1120,alignSelf:"center",padding:20,gap:20},
  landingBrand:{flexDirection:"row",alignItems:"center",gap:12,flexWrap:"wrap"},
  landingLogo:{width:55,height:55},brandTitleDark:{fontSize:26,color:"#063E33",fontWeight:"900"},
  brandCaptionDark:{fontSize:10,color:"#0D745C",fontWeight:"800"},
  landingHero:{minHeight:275,borderRadius:22,overflow:"hidden",padding:32,justifyContent:"center",gap:10},
  landingEyebrow:{color:"#8BF1CB",fontWeight:"900",fontSize:12,letterSpacing:1.5},
  landingTitle:{color:"#FFF",fontWeight:"900",fontSize:33},
  landingSubtitle:{color:"#E5F3F2",fontSize:14,maxWidth:580,lineHeight:22},
  chooseTitle:{fontSize:21,color:P.ink,fontWeight:"900"},
  choiceCard:{flex:1,minWidth:220,backgroundColor:ui.color.surface,borderColor:ui.color.border,borderWidth:1,borderRadius:ui.radius.card,padding:20,gap:13,minHeight:205},
  choiceTitle:{fontSize:19,fontWeight:"700",color:P.ink},
  choiceDescription:{color:P.muted,fontSize:13,lineHeight:20,flex:1},
  choiceAction:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  choiceActionText:{color:ui.color.primary,fontSize:13,fontWeight:"700"},
  landingFooter:{borderTopWidth:1,borderColor:"#D6E9E3",paddingTop:16,flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:10},
  landingFooterText:{color:"#52796F",fontSize:11,flex:1,minWidth:200},
});
