/**
 * Source-grounded public infrastructure POIs for SJDM.
 * Places on this map are not live dispatchers, operational LGU assets, or
 * confirmed currently-open shelters. Coordinates represent an OSM-mapped
 * structure (or a third-party geocoded site) and are not survey certificates.
 *
 * Sources: OpenStreetMap via mapcarta place pages; CSJDM office directory.
 * Keep the source link in every public map popup for provenance.
 */
export type SjdmPublicMapPlaceKind =
  | "government" | "cdrrmo" | "fire_station" | "police_station"
  | "evacuation_site" | "barangay_hall";
export type SjdmPublicMapPlace = {
  id: string;
  name: string;
  kind: SjdmPublicMapPlaceKind;
  latitude: number;
  longitude: number;
  sourceUrl: string;
  sourceLabel: string;
  /** Always public mapping only; no guarantee of current operations. */
  note: string;
  positionQuality: "osm_feature" | "third_party_approximate";
  officialInfoUrl?: string;
  officialContact?: string;
};
export const SJDM_PUBLIC_MAP_PLACE_PINS: SjdmPublicMapPlace[] = [
  {
    id: "osm-way-1126178501",
    name: "SJDM New Government Center",
    kind: "government",
    latitude: 14.82785, longitude: 121.04486,
    sourceUrl: "https://www.openstreetmap.org/way/1126178501",
    sourceLabel: "OpenStreetMap building (way 1126178501); official address csjdm.gov.ph",
    note: "City government headquarters in Dulong Bayan. This map pin shows a building, not a live LGU vehicle.",
    positionQuality: "osm_feature",
    officialInfoUrl: "https://csjdm.gov.ph/contact-us/",
    officialContact: "044-919-7370",
  },
  {
    id: "osm-way-1427519892",
    name: "Dulong Bayan Barangay Hall",
    kind: "barangay_hall",
    latitude: 14.82682, longitude: 121.04482,
    sourceUrl: "https://www.openstreetmap.org/way/1427519892",
    sourceLabel: "OpenStreetMap mapped barangay hall building",
    note: "Barangay hall mapped on OpenStreetMap; confirm its current office services with the barangay.",
    positionQuality: "osm_feature",
  },
  {
    id: "osm-node-340384547",
    name: "San Jose del Monte City Police Station",
    kind: "police_station",
    latitude: 14.81062, longitude: 121.04469,
    sourceUrl: "https://www.openstreetmap.org/node/340384547",
    sourceLabel: "OpenStreetMap police station (node 340384547)",
    note: "Police station map reference. Does not indicate live patrols, station staffing or dispatch.",
    positionQuality: "osm_feature",
    officialInfoUrl: "https://csjdm.gov.ph/contact-us/",
    officialContact: "0916-432-0401",
  },
  {
    id: "osm-way-672667289",
    name: "Fire Station (Mapped Site)",
    kind: "fire_station",
    latitude: 14.80924, longitude: 121.04755,
    sourceUrl: "https://www.openstreetmap.org/way/672667289",
    sourceLabel: "OpenStreetMap fire station (way 672667289)",
    note: "OSM-mapped fire-station site. The BFP publishes a NEW office address at the former CDRRM office, Productivity Center, Sapang Palay Proper; verify this map pin before visiting.",
    positionQuality: "osm_feature",
    officialInfoUrl: "https://csjdmfsinfohub.my.canva.site/",
    officialContact: "0932-373-2444",
  },
  {
    id: "mapped-cdrrmo-productivity-complex",
    name: "City Disaster Risk Reduction & Management Office",
    kind: "cdrrmo",
    latitude: 14.82746, longitude: 121.08109,
    sourceUrl: "https://csjdm.gov.ph/city-disaster-risk-reduction-and-management-office/",
    sourceLabel: "CSJDM official CDRRMO office; third-party listed GPS approximate",
    note: "CDRRMO office: Productivity Complex, Sapang Palay Proper. Pin is an approximate site reference, not a live responder.",
    positionQuality: "third_party_approximate",
    officialInfoUrl: "https://csjdm.gov.ph/city-disaster-risk-reduction-and-management-office/",
    officialContact: "0932-600-0119",
  },
];

export const SJDM_PUBLIC_PLACE_ICON: Record<SjdmPublicMapPlaceKind, string> = {
  government: "🏛️",
  cdrrmo: "🛟",
  fire_station: "🚒",
  police_station: "🚓",
  evacuation_site: "🏠",
  barangay_hall: "🏢",
};

/** Optional, always source-labelled live-fetch POIs from OpenStreetMap.
 * Fails back to the independent grounded map places above when unavailable.
 * Not a real-time occupancy/response feed. OSM location data can be stale.
 */
export async function fetchMappedSjdmPublicPlaces(
  signal?: AbortSignal,
): Promise<SjdmPublicMapPlace[]> {
  const south=14.70, west=120.98, north=14.96, east=121.22;
  const bbox=`${south},${west},${north},${east}`;
  const query=`[out:json][timeout:20];(nwr["amenity"~"^(townhall|police|fire_station)$"](${bbox});nwr["emergency"~"^(evacuation_centre|evacuation_center|assembly_point)$"](${bbox});nwr["evacuation_center"](${bbox});nwr["emergency:social_facility"="shelter"](${bbox});nwr["social_facility"="shelter"]["social_facility:for"="displaced"](${bbox}););out center 180;`;
  // Public map-data service redundancy. Failure must never suppress the
  // source-confirmed static markers or force an empty operational LGU map.
  const endpoints=[
    "https://overpass-api.de/api/interpreter?data=",
    "https://overpass.kumi.systems/api/interpreter?data=",
  ];
  let payload:unknown=null;
  for (const endpoint of endpoints) {
    try {
      const res=await fetch(endpoint+encodeURIComponent(query),
        {signal,headers:{Accept:"application/json"}});
      if(!res.ok) continue;
      payload=await res.json();
      break;
    } catch (error) {
      if(signal?.aborted) throw error;
    }
  }
  if (!payload || typeof payload !== "object" ||
      !("elements" in payload) || !Array.isArray(payload.elements)) return [];
  const output:SjdmPublicMapPlace[]=[];
  for (const feature of payload.elements.slice(0,180)) {
    if (!feature || typeof feature!=="object") continue;
    const tags=feature.tags;
    if(!tags || typeof tags!=="object") continue;
    const name=typeof tags.name==="string" ? tags.name.trim() : "";
    if(name.length<3 || name.length>120) continue;
    const lat=Number(feature.lat??feature.center?.lat);
    const lon=Number(feature.lon??feature.center?.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) continue;
    let kind:SjdmPublicMapPlaceKind|null=null;
    switch(tags.amenity) {
      case "fire_station":kind="fire_station";break;
      case "police":kind="police_station";break;
      case "townhall":kind="government";break;
    }
    if (!kind && (["evacuation_centre","evacuation_center","assembly_point"].includes(tags.emergency)
      || tags["emergency:social_facility"]==="shelter"
      || (tags.social_facility==="shelter" && tags["social_facility:for"]==="displaced")
      || (typeof tags.evacuation_center==="string" &&
          !["no","false","0"].includes(tags.evacuation_center.toLowerCase()))))
      kind="evacuation_site";
    if(!kind || !["node","way","relation"].includes(feature.type) ||
       !Number.isSafeInteger(feature.id) || feature.id <= 0) continue;
    output.push({
      id:"osm-"+feature.type+"-"+feature.id,
      name,kind,latitude:lat,longitude:lon,
      sourceUrl:"https://www.openstreetmap.org/"+feature.type+"/"+feature.id,
      sourceLabel:"OpenStreetMap tagged mapped place",
      note:kind==="evacuation_site"
        ? "Publicly mapped assembly/evacuation location; NOT confirmed open or available by LGU."
        : "Publicly mapped fixed facility. No verified live service or response tracking.",
      positionQuality:"osm_feature",
    });
  }
  return output;
}
