import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, useWindowDimensions, View,
} from "react-native";
import { SJDM_BARANGAYS } from "../../constants/sjdmBarangays";
import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";
import {
  boundaryBounds, insideSjdmBoundary, loadSjdmBoundary, type SjdmBoundary,
} from "../../lib/sjdmMapBoundary";
import {
  LGU_FACILITY_ICONS, LGU_FACILITY_TYPES, type LguFacilityType,
  verifiedLguMapFacility,
} from "../../lib/lguMapFacilities";

type Kind = "evacuation" | "lgu";
type RecordRow = { id: string; [key: string]: any };
type Draft = {
  name: string; address: string; barangay: string; latitude: string;
  longitude: string; facilityType: LguFacilityType; capacity: string;
  occupied: string; verificationSource: string; status: string;
  verificationStatus: "pending" | "verified";
};
const EMPTY: Draft = {
  name: "", address: "", barangay: "", latitude: "", longitude: "",
  facilityType: "cdrrmo", capacity: "", occupied: "0",
  verificationSource: "", status: "pending_verification",
  verificationStatus: "pending",
};
const CATEGORY_LABELS: Record<LguFacilityType, string> = {
  city_government: "City Government", cdrrmo: "Disaster Response / CDRRMO",
  fire_station: "Fire Station", police_station: "Police Station",
  health_center: "Health Facility", barangay_hall: "Barangay Hall",
};
const FIELD_LIMIT = { name: 160, address: 320, verificationSource: 300 };
const dateOf = (value: any) => {
  try {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
      : "No recorded update";
  } catch { return "No recorded update"; }
};
const OPTIONS: { value: Kind; label: string; icon: string }[] = [
  { value: "evacuation", label: "Evacuation Centers", icon: "home-outline" },
  { value: "lgu", label: "LGU Facilities", icon: "business-outline" },
];
const TYPES = LGU_FACILITY_TYPES.map(value => ({ value, label: CATEGORY_LABELS[value], icon: LGU_FACILITY_ICONS[value] }));
const LAYOUT_NOTE = "Only LGU-verified facilities with independently confirmed coordinates are published on the map. Live means database updates—not real-time building occupancy.";

// Defined outside the screen so editing an input does not remount it on each keystroke.
const Field = ({ label, value, onChange, placeholder, keyboardType = "default", disabled = false }:{
  label: string; value: string; onChange: (next:string)=>void; placeholder: string; keyboardType?: any; disabled?: boolean;
}) => <View style={styles.field}>
  <Text style={styles.fieldLabel}>{label}<Text style={styles.required}> *</Text></Text>
  <TextInput value={value} onChangeText={onChange} placeholder={placeholder}
    placeholderTextColor="#849B92" keyboardType={keyboardType} style={styles.input} editable={!disabled} />
</View>;

export default function SjdmFacilities() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, profile, loading: sessionLoading } = useUserSession();
  const isAdmin = !!user && profile?.role === "admin" &&
    profile?.status === "approved" && profile?.adminStatus !== "suspended";
  const [kind, setKind] = useState<Kind>("evacuation");
  const [centers, setCenters] = useState<RecordRow[]>([]);
  const [facilities, setFacilities] = useState<RecordRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [boundary, setBoundary] = useState<SjdmBoundary | null>(null);
  const [boundaryPending, setBoundaryPending] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Draft>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [barangayOpen, setBarangayOpen] = useState(false);
  const PAGE_SIZE = 5;
  const compact = width < 740;
  const rows = kind === "evacuation" ? centers : facilities;

  useEffect(() => {
    let active = true;
    void loadSjdmBoundary().then(value => {
      if (!active) return;
      setBoundary(value);
      setBoundaryPending(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setCenters([]); setFacilities([]); setLoadingRows(false);
      return;
    }
    setLoadingRows(true);
    const unsubs = [
      onSnapshot(collection(db, "evacuation_centers"),
        snapshot => { setCenters(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); setLoadingRows(false); },
        cause => { setError("Unable to read evacuation records: " + (cause?.message || "Check permissions")); setLoadingRows(false); }),
      onSnapshot(collection(db, "lguMapFacilities"),
        snapshot => { setFacilities(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); setLoadingRows(false); },
        cause => { setError("Unable to read LGU facility records: " + (cause?.message || "Check permissions")); setLoadingRows(false); }),
    ];
    return () => unsubs.forEach(stop => stop());
  }, [isAdmin]);

  const filtered = useMemo(() => rows.filter(item =>
    [item.name, item.barangay, item.address, item.status, item.facilityType]
      .some(value => String(value || "").toLowerCase().includes(search.toLowerCase().trim()))
  ).sort((a,b) => {
    const aTime = a.updatedAt?.toMillis?.() || 0;
    const bTime = b.updatedAt?.toMillis?.() || 0;
    return bTime - aTime;
  }), [rows, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(Math.min(page, pages - 1) * PAGE_SIZE, (Math.min(page, pages - 1) + 1) * PAGE_SIZE);
  const activeCount = rows.filter(item => item.status === "active" && item.verificationStatus === "verified").length;
  const selectKind = (next: Kind) => {
    setKind(next); setPage(0); setSearch(""); setShowForm(false); setError(""); setNotice("");
  };
  const setField = (field: keyof Draft, value: string) =>
    setForm(current => ({ ...current, [field]: value }));

  const editRow = (item?: RecordRow) => {
    setError(""); setNotice(""); setBarangayOpen(false); setConfirmed(false);
    setEditing(item?.id || null);
    setForm(item ? {
      name: String(item.name || ""), address: String(item.address || ""),
      barangay: String(item.barangay || ""),
      latitude: String(item.latitude ?? ""), longitude: String(item.longitude ?? ""),
      facilityType: LGU_FACILITY_TYPES.includes(item.facilityType) ? item.facilityType : "cdrrmo",
      capacity: String(item.capacity ?? ""), occupied: String(item.occupied ?? "0"),
      verificationSource: String(item.verificationSource || ""),
      status: String(item.status || "inactive"),
      verificationStatus: item.verificationStatus === "verified" ? "verified" : "pending",
    } : { ...EMPTY, status: kind === "evacuation" ? "pending_verification" : "inactive" });
    setShowForm(true);
  };

  const save = async () => {
    if (saving || !isAdmin || !user) return;
    setError(""); setNotice("");
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!boundary || boundaryPending) {
      setError("The SJDM city reference is unavailable; recording a new location is blocked.");
      return;
    }
    if (form.name.trim().length < 3 || form.name.trim().length > FIELD_LIMIT.name ||
        form.address.trim().length < 3 || form.address.trim().length > FIELD_LIMIT.address ||
        !SJDM_BARANGAYS.includes(form.barangay)) {
      setError("Enter a complete facility name, street address and a valid SJDM barangay.");
      return;
    }
    if (form.latitude.trim() === "" || form.longitude.trim() === "" ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      !insideSjdmBoundary(boundary, lat, lng)) {
      setError("The coordinates must be a confirmed location INSIDE the SJDM reference boundary.");
      return;
    }
    if (form.verificationSource.trim().length > FIELD_LIMIT.verificationSource ||
      form.verificationSource.trim().length < 10) {
      setError("State the independently checked official source, document or LGU inspection reference (at least 10 characters).");
      return;
    }
    const publishing = form.status === "active";
    if (publishing && form.verificationStatus !== "verified") {
      setError("An active map pin must have independently verified status.");
      return;
    }
    if (form.verificationStatus === "verified" && !confirmed) {
      setError("Confirm that you independently checked the actual place, coordinates and official record.");
      return;
    }
    let capacity = 0, occupied = 0;
    if (kind === "evacuation") {
      capacity = Number(form.capacity); occupied = Number(form.occupied);
      if (!Number.isInteger(capacity) || capacity < 1 ||
          !Number.isInteger(occupied) || occupied < 0 || occupied > capacity) {
        setError("Capacity must be a positive whole number and occupancy must be between zero and capacity.");
        return;
      }
    }
    const base = {
      name: form.name.trim(), address: form.address.trim(), barangay: form.barangay,
      latitude: lat, longitude: lng, status: form.status,
      verificationStatus: form.verificationStatus, verificationSource: form.verificationSource.trim(),
      updatedBy: user.uid, updatedAt: serverTimestamp(),
    };
    const collectionName = kind === "evacuation" ? "evacuation_centers" : "lguMapFacilities";
    const payload = kind === "evacuation" ? {
      ...base, capacity, occupied,
      ...(form.verificationStatus === "verified" ? { lastVerifiedAt: serverTimestamp() } : {}),
    } : { ...base, facilityType: form.facilityType };
    setSaving(true);
    try {
      if (editing) await updateDoc(doc(db, collectionName, editing), payload);
      else await addDoc(collection(db, collectionName), payload);
      setNotice("Saved to Firebase. Only ACTIVE + VERIFIED records are visible as official map pins. Recheck the public map.");
      setShowForm(false); setEditing(null); setConfirmed(false);
    } catch (cause: any) {
      setError(cause?.message || "Saving failed. Check LGU Admin permissions and deployed Firestore rules.");
    } finally {
      setSaving(false);
    }
  };

  if (sessionLoading) return <View style={styles.loading}><ActivityIndicator color="#07835F" /><Text>Checking LGU Admin access…</Text></View>;
  if (!isAdmin) return <View style={styles.loading}><Ionicons name="lock-closed-outline" size={36} color="#A43B35" />
    <Text style={styles.title}>LGU Admin access required</Text>
    <Text style={styles.hint}>Only approved operational Admin accounts can manage SJDM facility status.</Text></View>;

  return <ScrollView style={styles.root} contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled">
    <View style={styles.heading}>
      <View style={styles.headingIcon}><Ionicons name="map-outline" color="#FFFFFF" size={28}/></View>
      <View style={{flex:1}}>
        <Text style={styles.kicker}>VOLUNSERVE · LGU OPERATIONS</Text>
        <Text style={styles.title}>SJDM Facilities & Evacuation Centers</Text>
        <Text style={styles.hint}>Official-map records and approved shelter availability for San Jose del Monte, Bulacan.</Text>
      </View>
    </View>
    <View style={styles.infoStrip}>
      <Ionicons name="shield-checkmark-outline" color="#08765A" size={19}/>
      <Text style={styles.infoText}>{LAYOUT_NOTE}</Text>
    </View>
    {boundaryPending || !boundary ? <View style={styles.warnStrip}>
      <Text style={styles.warnText}>{boundaryPending ? "Loading SJDM city reference…" :
        "SJDM boundary reference unavailable. Facility updates are blocked to prevent out-of-city pins."}</Text>
    </View> : <Text style={styles.source}>
      SJDM border is an attributed reference polygon, not a legal cadastral survey. Geographic map limits are not proof of a facility's current operation.
    </Text>}
    <View style={styles.tabRow}>
      {OPTIONS.map(option => <TouchableOpacity key={option.value} accessibilityRole="tab"
        accessibilityState={{selected:kind===option.value}} onPress={()=>selectKind(option.value)}
        style={[styles.tab,kind===option.value&&styles.activeTab]}>
        <Text style={[styles.tabText,kind===option.value&&styles.activeTabText]}>{option.label}</Text>
      </TouchableOpacity>)}
    </View>
    <View style={[styles.metrics,compact&&{flexWrap:"wrap"}]}>
      <View style={styles.metric}><Text style={styles.metricCount}>{rows.length}</Text><Text style={styles.metricLabel}>Registered locations</Text></View>
      <View style={styles.metric}><Text style={styles.metricCount}>{activeCount}</Text><Text style={styles.metricLabel}>Active, verified</Text></View>
      <View style={styles.metric}><Text style={styles.metricCount}>{rows.length-activeCount}</Text><Text style={styles.metricLabel}>Not shown as active</Text></View>
    </View>
    <View style={styles.actionRow}>
      <TextInput placeholder="Search official records…" placeholderTextColor="#8A9F96" value={search}
        onChangeText={value=>{setSearch(value);setPage(0);}} style={[styles.search,compact&&{minWidth:140}]} />
      <TouchableOpacity style={styles.newButton} onPress={()=>editRow()}>
        <Ionicons name="add-outline" size={17} color="#FFFFFF"/><Text style={styles.newText}>Add verified record</Text>
      </TouchableOpacity>
    </View>
    {error ? <View style={styles.warnStrip}><Text style={styles.warnText}>{error}</Text></View> : null}
    {notice ? <View style={styles.infoStrip}><Text style={styles.infoText}>{notice}</Text></View> : null}
    {showForm ? <View style={styles.formCard}>
      <View style={styles.formTitleRow}>
        <View style={{flex:1}}><Text style={styles.formTitle}>{editing ? "Update record" : "New verified location"}</Text>
          <Text style={styles.hint}>Never use guessed GPS pins or unconfirmed shelter occupancy.</Text></View>
        <TouchableOpacity accessibilityLabel="Close facility editor" onPress={()=>setShowForm(false)} disabled={saving}>
          <Ionicons name="close-circle-outline" size={24} color="#56766A"/>
        </TouchableOpacity>
      </View>
      <View style={[styles.formGrid,compact&&{flexDirection:"column"}]}>
        <View style={styles.formColumn}>
          <Field disabled={saving} label="Official facility name" placeholder="As confirmed by the responsible LGU" value={form.name} onChange={value=>setField("name",value)}/>
          <Field disabled={saving} label="Full address" placeholder="Street, barangay, SJDM, Bulacan" value={form.address} onChange={value=>setField("address",value)}/>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>SJDM barangay<Text style={styles.required}> *</Text></Text>
            <TouchableOpacity style={styles.input} onPress={()=>setBarangayOpen(value=>!value)}>
              <Text style={styles.inputValue}>{form.barangay || "Choose an SJDM barangay"}</Text>
            </TouchableOpacity>
            {barangayOpen && <ScrollView nestedScrollEnabled style={styles.barangayList}>
              {SJDM_BARANGAYS.map(value=><TouchableOpacity key={value}
                style={styles.pickRow} onPress={()=>{setField("barangay",value);setBarangayOpen(false);}}>
                <Text style={styles.pickText}>{value}</Text>
              </TouchableOpacity>)}
            </ScrollView>}
          </View>
          <Field disabled={saving} label="Latitude" placeholder="Verified decimal latitude" value={form.latitude}
            keyboardType="numbers-and-punctuation" onChange={value=>setField("latitude",value)}/>
          <Field disabled={saving} label="Longitude" placeholder="Verified decimal longitude" value={form.longitude}
            keyboardType="numbers-and-punctuation" onChange={value=>setField("longitude",value)}/>
        </View>
        <View style={styles.formColumn}>
          {kind === "lgu" && <View style={styles.field}>
            <Text style={styles.fieldLabel}>LGU facility type<Text style={styles.required}> *</Text></Text>
            <View style={styles.chipWrap}>{TYPES.map(option=><TouchableOpacity key={option.value}
              style={[styles.chip,form.facilityType===option.value&&styles.chipSelected]}
              onPress={()=>setField("facilityType",option.value)}>
              <Text style={styles.chipText}>{option.icon+" "+option.label}</Text>
            </TouchableOpacity>)}</View>
          </View>}
          {kind === "evacuation" && <>
            <Field disabled={saving} label="Capacity (last confirmed)" placeholder="Enter officially reported capacity"
              value={form.capacity} keyboardType="number-pad" onChange={value=>setField("capacity",value)}/>
            <Field disabled={saving} label="Occupancy (last confirmed)" placeholder="Last approved LGU count, not a live sensor"
              value={form.occupied} keyboardType="number-pad" onChange={value=>setField("occupied",value)}/>
          </>}
          <Field disabled={saving} label="Official verification source" placeholder="Office/record reference, inspection date, or official document"
            value={form.verificationSource} onChange={value=>setField("verificationSource",value)}/>
          <Text style={styles.fieldLabel}>Verification state</Text>
          <View style={styles.chipWrap}>{(["pending","verified"] as const).map(value=><TouchableOpacity
            key={value} style={[styles.chip,form.verificationStatus===value&&styles.chipSelected]}
            onPress={()=>{setField("verificationStatus",value);setConfirmed(false);
              if(value==="pending"&&form.status==="active")setField("status",kind==="evacuation"?"pending_verification":"inactive");}}>
            <Text style={styles.chipText}>{value==="verified"?"Verified by LGU":"Pending independent check"}</Text>
          </TouchableOpacity>)}</View>
          <Text style={styles.fieldLabel}>Operating status</Text>
          <View style={styles.chipWrap}>
            {(kind==="evacuation"?["pending_verification","active","inactive","closed"]:["active","inactive"]).map(value=><TouchableOpacity
              key={value} style={[styles.chip,form.status===value&&styles.chipSelected]}
              onPress={()=>setField("status",value)}>
              <Text style={styles.chipText}>{value.replaceAll("_"," ")}</Text>
            </TouchableOpacity>)}
          </View>
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:confirmed}}
            onPress={()=>setConfirmed(x=>!x)} style={styles.confirmation}>
            <Ionicons name={confirmed?"checkbox":"square-outline"} color="#087B5A" size={23}/>
            <Text style={styles.confirmationText}>I independently verified the original official source, facility name, location and current status. I understand this change will be logged under my Admin account.</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.cancelButton} onPress={()=>setShowForm(false)} disabled={saving}><Text>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.newButton,(saving||!boundary)&&{opacity:0.55}]}
          onPress={()=>void save()} disabled={saving||!boundary}>
          {saving?<ActivityIndicator size="small" color="#FFFFFF"/>:<Ionicons name="save-outline" size={17} color="#FFFFFF"/>}
          <Text style={styles.newText}>{saving?"Saving to Firebase…":"Save record"}</Text>
        </TouchableOpacity>
      </View>
    </View> : null}
    <View style={styles.listCard}>
      <Text style={styles.listTitle}>{kind==="evacuation"?"Evacuation center records":"Fixed LGU facility records"}</Text>
      <Text style={styles.hint}>Only ACTIVE + VERIFIED records can appear as operational map pins. Other records remain in Admin review.</Text>
      {loadingRows?<ActivityIndicator style={{margin:24}} color="#0D805E"/>:
        visible.length===0?<Text style={styles.empty}>No matching LGU records yet. No sample pins have been invented.</Text>:
        visible.map(item=>{
          const active = item.status==="active"&&item.verificationStatus==="verified";
          const isFacility = kind==="lgu" && verifiedLguMapFacility(item.id,item);
          return <View key={item.id} style={styles.listRow}>
            <View style={styles.recordIcon}><Text style={{fontSize:20}}>{kind==="evacuation"?"🏠":isFacility?LGU_FACILITY_ICONS[isFacility.facilityType]:"🏢"}</Text></View>
            <View style={{flex:1,minWidth:150}}>
              <Text style={styles.recordTitle}>{item.name||"Unnamed facility"}</Text>
              <Text style={styles.recordSub}>{item.barangay||"Unknown barangay"} · {item.address||"Address missing"}</Text>
              {kind==="evacuation"?<Text style={styles.recordSub}>Last LGU count: {item.occupied??"?"}/{item.capacity??"?"} · Verified: {dateOf(item.lastVerifiedAt)}</Text>:null}
              <Text style={styles.recordSub}>Updated: {dateOf(item.updatedAt)} · {item.verificationSource||"No source on record"}</Text>
              <Text style={[styles.status,{color:active?"#097556":"#A46620"}]}>{active?"ACTIVE · LGU VERIFIED":"NOT PUBLISHED AS ACTIVE"}</Text>
            </View>
            <TouchableOpacity accessibilityLabel={"Edit "+String(item.name||"facility")}
              style={styles.editButton} onPress={()=>editRow(item)}>
              <Ionicons name="create-outline" color="#087D5B" size={19}/><Text style={styles.editText}>Review</Text>
            </TouchableOpacity>
          </View>;
        })}
      <View style={[styles.actionRow,{justifyContent:"flex-end"}]}>
        <TouchableOpacity style={styles.pageButton} disabled={page===0} onPress={()=>setPage(x=>Math.max(0,x-1))}><Text>Previous</Text></TouchableOpacity>
        <Text style={styles.pageLabel}>Page {Math.min(page,pages-1)+1} / {pages}</Text>
        <TouchableOpacity style={styles.pageButton} disabled={page>=pages-1} onPress={()=>setPage(x=>Math.min(pages-1,x+1))}><Text>Next</Text></TouchableOpacity>
      </View>
    </View>
    <TouchableOpacity style={styles.mapLink} onPress={()=>router.push("/(admin)/admin-live-map" as any)}>
      <Ionicons name="navigate-outline" size={18} color="#087B5A"/><Text style={styles.mapLinkText}>Open operational map to check published icons</Text>
    </TouchableOpacity>
  </ScrollView>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:"#F3F8F5"},
  page:{padding:20,paddingBottom:56,gap:13,maxWidth:1320,width:"100%",alignSelf:"center"},
  loading:{flex:1,alignItems:"center",justifyContent:"center",gap:16,padding:35},
  heading:{flexDirection:"row",alignItems:"center",gap:15,paddingVertical:12},
  headingIcon:{width:55,height:55,borderRadius:18,backgroundColor:"#087D5B",alignItems:"center",justifyContent:"center"},
  kicker:{fontSize:11,color:"#168264",fontWeight:"800",letterSpacing:1.5},
  title:{fontSize:22,color:"#153B31",fontWeight:"900",marginTop:4},
  hint:{fontSize:12,color:"#617B70",lineHeight:19,marginTop:5},
  infoStrip:{padding:13,backgroundColor:"#E7F8EF",borderColor:"#C4EAD7",borderWidth:1,borderRadius:12,flexDirection:"row",gap:9,alignItems:"center"},
  infoText:{color:"#155B43",fontSize:12,flex:1,lineHeight:18},
  warnStrip:{padding:12,backgroundColor:"#FFF3ED",borderColor:"#E9B5A6",borderWidth:1,borderRadius:10},
  warnText:{color:"#9B3D26",fontSize:12,lineHeight:18},
  source:{fontSize:11,color:"#7C9188"},
  tabRow:{flexDirection:"row",gap:8,flexWrap:"wrap"},
  tab:{paddingHorizontal:15,paddingVertical:11,borderRadius:12,borderColor:"#CCE2D6",borderWidth:1,backgroundColor:"#FFFFFF"},
  activeTab:{backgroundColor:"#087D5B"},
  tabText:{fontSize:13,fontWeight:"700",color:"#476A59"},activeTabText:{color:"#FFFFFF"},
  metrics:{flexDirection:"row",gap:12},
  metric:{backgroundColor:"#FFFFFF",borderColor:"#DBE9E1",borderWidth:1,borderRadius:15,padding:17,flexGrow:1,minWidth:120},
  metricCount:{fontSize:25,fontWeight:"900",color:"#155D46"},metricLabel:{fontSize:11,color:"#698277",marginTop:5},
  actionRow:{flexDirection:"row",alignItems:"center",gap:10,flexWrap:"wrap",marginVertical:6},
  search:{flex:1,minWidth:210,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#D7E6DC",borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontSize:13,color:"#183F32"},
  newButton:{flexDirection:"row",gap:8,alignItems:"center",justifyContent:"center",paddingHorizontal:15,paddingVertical:13,borderRadius:12,backgroundColor:"#098260"},
  newText:{fontSize:12,color:"#FFFFFF",fontWeight:"800"},
  formCard:{padding:20,borderRadius:18,borderColor:"#CDE2D5",borderWidth:1,backgroundColor:"#FFFFFF",gap:13},
  formTitleRow:{flexDirection:"row",alignItems:"center",gap:12},formTitle:{fontSize:18,color:"#12543E",fontWeight:"900"},
  formGrid:{flexDirection:"row",gap:22},formColumn:{flex:1,minWidth:0,gap:9},
  field:{gap:7,marginBottom:9},fieldLabel:{fontSize:12,fontWeight:"800",color:"#365C4C",marginBottom:6},
  required:{color:"#D33C30"},input:{borderColor:"#CDE0D5",borderWidth:1,borderRadius:11,backgroundColor:"#FBFDFB",paddingVertical:12,paddingHorizontal:12,fontSize:13,color:"#214736"},
  inputValue:{color:"#214736",fontSize:13},
  barangayList:{maxHeight:190,borderColor:"#D7E8DE",borderWidth:1,borderRadius:10},
  pickRow:{paddingHorizontal:12,paddingVertical:10,borderBottomColor:"#EDF3EE",borderBottomWidth:1},
  pickText:{fontSize:13,color:"#294E3E"},
  chipWrap:{flexDirection:"row",gap:7,flexWrap:"wrap",marginBottom:12},
  chip:{paddingVertical:9,paddingHorizontal:11,borderRadius:9,borderColor:"#CCDFD1",borderWidth:1,backgroundColor:"#F9FCF9"},
  chipSelected:{backgroundColor:"#D9F5E7",borderColor:"#098461"},
  chipText:{fontSize:11,color:"#275A44",fontWeight:"700"},
  confirmation:{flexDirection:"row",alignItems:"flex-start",gap:10,padding:12,backgroundColor:"#EFFAF3",borderRadius:12},
  confirmationText:{flex:1,color:"#2C5B47",fontSize:12,lineHeight:19},
  cancelButton:{paddingHorizontal:14,paddingVertical:12,backgroundColor:"#EDF2EE",borderRadius:10},
  listCard:{padding:16,borderColor:"#DDEBE2",borderWidth:1,borderRadius:16,backgroundColor:"#FFFFFF"},
  listTitle:{fontSize:16,fontWeight:"900",color:"#18503D"},
  empty:{textAlign:"center",paddingVertical:30,color:"#627A6D",fontSize:13},
  listRow:{flexDirection:"row",gap:10,alignItems:"center",paddingVertical:15,borderBottomWidth:1,borderBottomColor:"#E6EEE8"},
  recordIcon:{width:39,height:39,backgroundColor:"#E6F6EE",borderRadius:12,alignItems:"center",justifyContent:"center"},
  recordTitle:{fontSize:13,fontWeight:"900",color:"#194B38"},recordSub:{fontSize:11,color:"#607B6D",marginTop:3,lineHeight:16},
  status:{fontSize:10,fontWeight:"800",marginTop:6,letterSpacing:0.3},
  editButton:{flexDirection:"row",alignItems:"center",gap:4,padding:9,backgroundColor:"#EAF8F1",borderRadius:10},
  editText:{fontSize:11,color:"#087D5B",fontWeight:"800"},
  pageButton:{padding:10,borderRadius:10,backgroundColor:"#EEF6F0"},
  pageLabel:{fontSize:12,color:"#537464",fontWeight:"700"},
  mapLink:{flexDirection:"row",gap:9,alignItems:"center",padding:15,backgroundColor:"#E5F6EE",borderRadius:13},
  mapLinkText:{fontWeight:"800",color:"#087D5B",fontSize:12},
});
