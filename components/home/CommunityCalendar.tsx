import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { db } from "../../lib/firebase";

type EventItem = {id:string;title:string;date:string;time?:string;location?:string;barangay?:string;status?:string};
type MemberMode = "resident"|"volunteer";
const weekdays=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const GREEN="#087F68";
export function philippinesToday(now=new Date()) {
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(now);
  const part=(name:string)=>parts.find(p=>p.type===name)?.value||"";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
const utcDate=(year:number,month:number,day:number)=>new Date(Date.UTC(year,month-1,day));
const iso=(y:number,m:number,d:number)=>`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
const validDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value+"T00:00:00Z"));
export default function CommunityCalendar({uid,mode}:{uid?:string|null;mode:MemberMode}) {
  const router=useRouter();
  const {width}=useWindowDimensions();
  const compact=width<760;
  const [today,setToday]=useState(()=>philippinesToday());
  const [selected,setSelected]=useState(()=>philippinesToday());
  const [events,setEvents]=useState<EventItem[]>([]);
  const [joinedIds,setJoinedIds]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [joinedLoaded,setJoinedLoaded]=useState(false);
  const [month,setMonth]=useState(()=>{
    const day=philippinesToday();
    return {y:Number(day.slice(0,4)),m:Number(day.slice(5,7))};
  });
  useEffect(()=>{
    const timer=setInterval(()=>{
      const current=philippinesToday();
      if(current!==today)setToday(current);
    },60*1000);
    return()=>clearInterval(timer);
  },[today]);
  useEffect(()=>{
    if(!uid){setEvents([]);setLoading(false);return;}
    setLoading(true);
    return onSnapshot(
      query(collection(db,"communityEvents"),where("publicationStatus","==","published")),
      snap=>{
        setEvents(snap.docs.map(d=>({id:d.id,...d.data()} as EventItem))
          .filter(e=>validDate(e.date)&&typeof e.title==="string"));
        setLoading(false);setError("");
      },
      ()=>{setLoading(false);setError("Community calendar is temporarily unavailable.");}
    );
  },[uid]);
  useEffect(()=>{
    if(!uid||mode!=="volunteer"){setJoinedIds([]);setJoinedLoaded(true);return;}
    setJoinedLoaded(false);
    return onSnapshot(
      query(collection(db,"communityEventParticipants"),where("uid","==",uid)),
      snap=>{
        setJoinedIds([...new Set(snap.docs.map(d=>d.data())
          .filter(data=>data.status==="joined"&&typeof data.eventId==="string")
          .map(data=>data.eventId))]);
        setJoinedLoaded(true);
      },()=>{setJoinedIds([]);setJoinedLoaded(true);}
    );
  },[uid,mode]);
  const relevant=useMemo(()=>events.filter(e=>mode==="resident"||joinedIds.includes(e.id))
    .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||"").localeCompare(b.time||"")),[events,joinedIds,mode]);
  const eventDates=useMemo(()=>new Set(relevant.map(e=>e.date)),[relevant]);
  const dayEvents=useMemo(()=>relevant.filter(e=>e.date===selected),[relevant,selected]);
  const future=useMemo(()=>relevant.filter(e=>e.date>selected).slice(0,3),[relevant,selected]);
  const monthDays=useMemo(()=>{
    const first=utcDate(month.y,month.m,1).getUTCDay();
    const last=utcDate(month.y,month.m+1,0).getUTCDate();
    return [...Array(first).fill(null),...Array.from({length:last},(_,i)=>i+1)];
  },[month]);
  const monthTitle=utcDate(month.y,month.m,1).toLocaleDateString("en-PH",{month:"long",year:"numeric",timeZone:"UTC"});
  const changeMonth=(direction:number)=>{
    const next=utcDate(month.y,month.m+direction,1);
    setMonth({y:next.getUTCFullYear(),m:next.getUTCMonth()+1});
    setSelected(iso(next.getUTCFullYear(),next.getUTCMonth()+1,1));
  };
  const openEvents=()=>router.push("/community-events");
  return <View style={styles.panel}>
    <View style={[styles.heading,compact&&styles.mobileHeading]}>
      <View style={styles.headingLeft}>
        <View style={styles.iconBox}><Ionicons name="calendar-outline" size={21} color={GREEN}/></View>
        <View style={{flex:1,minWidth:0}}>
          <Text style={styles.title}>Community Calendar</Text>
          <Text style={styles.subtitle}>{mode==="volunteer"?"Your joined volunteer schedules":"Approved community event schedules"} · Philippine time</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={openEvents} style={styles.openButton}>
        <Text style={styles.openText}>Browse Events</Text><Ionicons name="arrow-forward" size={15} color={GREEN}/>
      </Pressable>
    </View>
    <View style={[styles.body,compact&&styles.bodyMobile]}>
      <View style={[styles.calendar,compact&&styles.calendarMobile]}>
        <View style={styles.monthHeader}>
          <Pressable accessibilityLabel="Previous month" onPress={()=>changeMonth(-1)} style={styles.monthArrow}>
            <Ionicons name="chevron-back" size={17} color="#345F53"/>
          </Pressable>
          <Text style={styles.monthTitle}>{monthTitle}</Text>
          <Pressable accessibilityLabel="Next month" onPress={()=>changeMonth(1)} style={styles.monthArrow}>
            <Ionicons name="chevron-forward" size={17} color="#345F53"/>
          </Pressable>
        </View>
        <View style={styles.days}>
          {weekdays.map(day=><View style={styles.dayCell} key={day}><Text style={styles.weekday}>{day}</Text></View>)}
          {monthDays.map((day,index)=>{
            const date=day?iso(month.y,month.m,day):"";
            return <View key={index} style={styles.dayCell}>
              {day?<Pressable accessibilityRole="button" accessibilityLabel={`Select ${date}`}
                accessibilityState={{selected:date===selected}} onPress={()=>setSelected(date)}
                style={[styles.dayButton,date===today&&styles.today,date===selected&&styles.selected]}>
                <Text style={[styles.dayText,date===today&&styles.todayText,date===selected&&styles.selectedText]}>{day}</Text>
                {eventDates.has(date)&&<View style={[styles.eventDot,date===selected&&styles.selectedDot]}/>}
              </Pressable>:null}
            </View>;
          })}
        </View>
        <Pressable onPress={()=>{
          const date=philippinesToday();setToday(date);setSelected(date);
          setMonth({y:Number(date.slice(0,4)),m:Number(date.slice(5,7))});
        }} style={styles.todayAction}><Ionicons name="locate-outline" size={14} color={GREEN}/><Text style={styles.todayActionText}>Go to Today</Text></Pressable>
      </View>
      <View style={styles.eventPane}>
        <View style={styles.selectedDayHeading}>
          <Text style={styles.selectedDayTitle}>{utcDate(Number(selected.slice(0,4)),Number(selected.slice(5,7)),Number(selected.slice(8))).toLocaleDateString("en-PH",{weekday:"long",month:"long",day:"numeric",year:"numeric",timeZone:"UTC"})}</Text>
          <Text style={styles.selectedHint}>{dayEvents.length} scheduled event{dayEvents.length===1?"":"s"}</Text>
        </View>
        {loading||(mode==="volunteer"&&!joinedLoaded)?<Text style={styles.info}>Loading approved activities...</Text>:
          error?<Text style={styles.info}>{error}</Text>:
          dayEvents.length?<View style={styles.events}>{dayEvents.slice(0,4).map(e=><Pressable key={e.id} onPress={openEvents} style={styles.eventRow}>
            <View style={styles.eventBar}/><View style={{flex:1,minWidth:0}}>
              <Text style={styles.eventTitle} numberOfLines={2}>{e.title}</Text>
              <Text style={styles.eventInfo} numberOfLines={2}>{[e.time,e.barangay||e.location].filter(Boolean).join(" · ")}</Text>
              <Text style={styles.eventStatus}>{e.status||"Published"}</Text>
            </View><Ionicons name="chevron-forward" color="#789A8F" size={17}/>
          </Pressable>)}</View>:
          <View style={styles.empty}><Ionicons name="calendar-clear-outline" size={23} color="#A1B3AD"/>
            <Text style={styles.emptyText}>No {mode==="volunteer"?"joined":"approved"} events scheduled for this date.</Text>
          </View>}
        {!dayEvents.length&&future.length>0&&<View style={styles.upcoming}>
          <Text style={styles.upcomingTitle}>NEXT UPCOMING</Text>
          {future.map(e=><Pressable key={e.id} onPress={openEvents} style={styles.upcomingRow}>
            <View style={styles.dateChip}>
              <Text style={styles.chipDay}>{Number(e.date.slice(8))}</Text>
              <Text style={styles.chipMonth}>{utcDate(Number(e.date.slice(0,4)),Number(e.date.slice(5,7)),1).toLocaleDateString("en-PH",{month:"short",timeZone:"UTC"})}</Text>
            </View>
            <View style={{flex:1}}><Text style={styles.upcomingEvent} numberOfLines={1}>{e.title}</Text>
            <Text style={styles.eventInfo} numberOfLines={1}>{e.barangay||e.location||"SJDM"}</Text></View>
          </Pressable>)}
        </View>}
      </View>
    </View>
  </View>;
}
const styles=StyleSheet.create({
  panel:{backgroundColor:"#FFFFFF",borderRadius:18,padding:18,borderWidth:1,borderColor:"#DFEBE7",gap:15},
  heading:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:15},
  mobileHeading:{flexWrap:"wrap"},
  headingLeft:{flexDirection:"row",alignItems:"center",gap:12,flex:1,minWidth:0},
  iconBox:{height:42,width:42,borderRadius:21,alignItems:"center",justifyContent:"center",backgroundColor:"#E7F6F0"},
  title:{color:"#153D35",fontWeight:"800",fontSize:17},
  subtitle:{color:"#718A80",fontSize:11.5,lineHeight:17,marginTop:4},
  openButton:{flexDirection:"row",alignItems:"center",gap:6,padding:9},
  openText:{color:GREEN,fontWeight:"800",fontSize:11},
  body:{flexDirection:"row",alignItems:"flex-start",gap:20},
  bodyMobile:{flexDirection:"column"},
  calendar:{flexGrow:0,flexShrink:0,width:"43%",maxWidth:440,minWidth:270},
  calendarMobile:{width:"100%",maxWidth:"100%",minWidth:0},
  monthHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingBottom:9},
  monthTitle:{color:"#21473D",fontSize:15,fontWeight:"800"},
  monthArrow:{height:32,width:32,alignItems:"center",justifyContent:"center",backgroundColor:"#F1F7F4",borderRadius:9},
  days:{flexDirection:"row",flexWrap:"wrap",borderTopWidth:1,borderTopColor:"#ECF1EE",paddingTop:10},
  dayCell:{width:"14.2857%",alignItems:"center",minHeight:38},
  weekday:{fontSize:10,fontWeight:"800",color:"#718A7D",marginBottom:6},
  dayButton:{width:34,height:34,alignItems:"center",justifyContent:"center",borderRadius:10},
  today:{borderWidth:1,borderColor:GREEN},
  selected:{backgroundColor:GREEN,borderWidth:1,borderColor:GREEN},
  dayText:{fontSize:12,fontWeight:"700",color:"#41665A"},
  todayText:{color:GREEN},selectedText:{color:"#FFFFFF"},
  eventDot:{position:"absolute",width:4,height:4,borderRadius:2,backgroundColor:"#0DA47A",bottom:3},
  selectedDot:{backgroundColor:"#FFFFFF"},
  todayAction:{flexDirection:"row",alignItems:"center",gap:5,alignSelf:"flex-start",padding:8},
  todayActionText:{color:GREEN,fontSize:11,fontWeight:"800"},
  eventPane:{flex:1,minWidth:0,alignSelf:"stretch",gap:12},
  selectedDayHeading:{paddingBottom:12,borderBottomWidth:1,borderBottomColor:"#E9F0EC",gap:5},
  selectedDayTitle:{fontSize:14,fontWeight:"800",color:"#224C41"},
  selectedHint:{fontSize:11,color:"#789087"},
  events:{gap:9},eventRow:{flexDirection:"row",alignItems:"center",gap:12,backgroundColor:"#F6FAF8",
    borderRadius:10,borderWidth:1,borderColor:"#E1EEE6",padding:13},
  eventBar:{width:4,alignSelf:"stretch",borderRadius:3,backgroundColor:GREEN},
  eventTitle:{fontSize:12.5,fontWeight:"800",color:"#204A3D"},
  eventInfo:{fontSize:10.5,color:"#68847A",marginTop:4},
  eventStatus:{fontSize:10,fontWeight:"800",color:"#0B896A",marginTop:4,textTransform:"capitalize"},
  info:{fontSize:12,color:"#728C84",padding:14},
  empty:{minHeight:105,alignItems:"center",justifyContent:"center",gap:8,padding:15,backgroundColor:"#F7FBF9",borderRadius:11},
  emptyText:{fontSize:11.5,color:"#728C82",textAlign:"center",lineHeight:17},
  upcoming:{gap:8,marginTop:5},upcomingTitle:{fontSize:10,fontWeight:"900",color:"#5A8678",letterSpacing:0.7},
  upcomingRow:{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:5},
  dateChip:{width:39,height:42,backgroundColor:"#EAF7F0",borderRadius:9,alignItems:"center",justifyContent:"center"},
  chipDay:{fontSize:15,fontWeight:"900",color:GREEN},
  chipMonth:{fontSize:9,color:"#648D7C",fontWeight:"800",textTransform:"uppercase"},
  upcomingEvent:{fontSize:11.5,fontWeight:"700",color:"#244C3F"},
});
