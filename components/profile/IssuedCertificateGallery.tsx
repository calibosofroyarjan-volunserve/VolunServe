import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CertificateMiniPreview } from "../../app/(tabs)/certificate";

export type GalleryCertificate = {
  id?: string;
  certificateId?: string;
  certificateType?: string;
  certificateTitle?: string;
  title?: string;
  volunteerName?: string;
  eventTitle?: string;
  eventDate?: string;
  eventBarangay?: string;
  eventLocation?: string;
  issuedAt?: unknown;
  issuedByName?: string;
  verifiedServiceMinutes?: number;
  serviceMinutes?: number;
  verifiedHelps?: number;
  peopleHelped?: number;
  verificationStatus?: string;
  status?: string;
  [key: string]: unknown;
};
const COLOR = "#086F57";
function dateLabel(input: unknown): string {
  if (!input) return "Date unavailable";
  try {
    const date = typeof (input as any)?.toDate === "function"
      ? (input as any).toDate()
      : new Date(String(input));
    return Number.isNaN(date.getTime()) ? "Date unavailable" :
      date.toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"});
  } catch { return "Date unavailable"; }
}
function minutesLabel(input: unknown) {
  const n=Number(input||0);
  return Number.isFinite(n) ? `${Math.max(0,Math.floor(n))} min` : "0 min";
}
export function IssuedCertificateGallery({
  certificates, name, onView, compact = false,
}:{
  certificates: GalleryCertificate[];
  name: string;
  onView: (record: GalleryCertificate) => void;
  compact?: boolean;
}) {
  const issued=certificates.filter(item =>
    (item.verificationStatus || item.status || "").toLowerCase() === "issued");
  if(!issued.length) {
    return <View style={styles.empty}>
      <Ionicons name="ribbon-outline" size={31} color="#94A8A3"/>
      <Text style={styles.emptyHeading}>No issued certificates yet</Text>
      <Text style={styles.emptyCopy}>Official certificates will appear here after the required verification.</Text>
    </View>;
  }
  return <View style={styles.gallery}>
    {issued.map((item,index) => {
      const isEvent=item.certificateType==="community_event_participation";
      const title=isEvent?"Certificate of Participation":"Certificate of Volunteer Service";
      const record:GalleryCertificate={
        ...item,
        certificateId:item.certificateId||item.id||"",
        certificateTitle:item.certificateTitle||item.title||title,
        volunteerName:item.volunteerName||name,
        verificationStatus:"issued",
        verifiedServiceMinutes:Number(item.verifiedServiceMinutes??item.serviceMinutes??0),
      };
      return <View key={String(item.certificateId||item.id||index)}
        style={[styles.card,compact&&styles.compactCard]}>
        <Pressable accessibilityRole="button"
          accessibilityLabel={`Preview issued certificate ${record.certificateId || title}`}
          onPress={()=>onView(record)} style={styles.thumbnail}>
          <CertificateMiniPreview certificate={record as any} displayName={name}/>
        </Pressable>
        <View style={styles.cardInfo}>
          <View style={styles.titleRow}>
            <View style={styles.titleWrap}>
              <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
              <Text style={styles.eventName} numberOfLines={2}>
                {isEvent?String(item.eventTitle||"Community Event"):"Verified Emergency Response"}
              </Text>
            </View>
            <View style={styles.status}><Ionicons name="checkmark-circle" size={13} color="#067D55"/>
              <Text style={styles.statusText}>Issued</Text></View>
          </View>
          <View style={styles.metaLine}>
            <Ionicons name="calendar-outline" size={14} color="#62827C"/>
            <Text style={styles.metaText}>Issued: {dateLabel(item.issuedAt)}</Text>
          </View>
          <View style={styles.metaLine}>
            <Ionicons name="time-outline" size={14} color="#62827C"/>
            <Text style={styles.metaText}>Service: {minutesLabel(record.verifiedServiceMinutes)}</Text>
          </View>
          <Text style={styles.idText} numberOfLines={1}>ID: {String(record.certificateId||"—")}</Text>
          <Pressable accessibilityRole="button"
            accessibilityLabel={`View issued certificate ${record.certificateId||title}`}
            onPress={()=>onView(record)} style={styles.viewButton}>
            <Ionicons name="eye-outline" size={17} color="#FFFFFF"/>
            <Text style={styles.viewText}>View Certificate</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF"/>
          </Pressable>
        </View>
      </View>;
    })}
  </View>;
}
const styles=StyleSheet.create({
  gallery:{flexDirection:"row",flexWrap:"wrap",gap:16},
  card:{flexGrow:1,flexBasis:285,maxWidth:440,borderRadius:13,backgroundColor:"#FFFFFF",
    borderWidth:1,borderColor:"#DBE9E3",overflow:"hidden",padding:14,gap:12},
  compactCard:{flexBasis:"100%",maxWidth:"100%"},
  thumbnail:{height:215,borderRadius:9,overflow:"hidden",backgroundColor:"#F9FAF5",
    borderWidth:1,borderColor:"#D6E5DC",justifyContent:"center"},
  cardInfo:{gap:10},
  titleRow:{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:8},
  titleWrap:{flex:1,minWidth:0,gap:3},
  cardTitle:{fontWeight:"800",fontSize:15,color:"#123B36"},
  eventName:{fontSize:12,color:"#627F7A"},
  status:{alignItems:"center",flexDirection:"row",gap:5,backgroundColor:"#E0F7E9",paddingHorizontal:8,
    paddingVertical:6,borderRadius:20},
  statusText:{fontWeight:"800",fontSize:10,color:"#08764E"},
  metaLine:{flexDirection:"row",alignItems:"center",gap:7},
  metaText:{fontSize:12,color:"#335A52",fontWeight:"600"},
  idText:{fontSize:10,color:"#728983"},
  viewButton:{marginTop:3,minHeight:41,backgroundColor:COLOR,borderRadius:9,
    flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8},
  viewText:{fontSize:12,fontWeight:"800",color:"#FFFFFF"},
  empty:{borderWidth:1,borderColor:"#DBE8E3",backgroundColor:"#F9FCFA",borderRadius:12,
    minHeight:180,alignItems:"center",justifyContent:"center",gap:9,padding:24},
  emptyHeading:{color:"#264C43",fontWeight:"800",fontSize:15},
  emptyCopy:{textAlign:"center",color:"#748C86",fontSize:12,lineHeight:19},
});
