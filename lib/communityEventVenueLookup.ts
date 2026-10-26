/**
 * One-shot event venue lookup, never live/user GPS. No autocomplete requests:
 * called only after Barangay + venue are selected (or custom input finishes).
 * OSM Nominatim public endpoint is best-effort, not an official LGU place registry.
 * In production with significant traffic, replace this with a rate-limited
 * server-side/cached geocoding provider rather than relying on public Nominatim.
 */
import { Platform } from "react-native";

export type VenueCandidate = { latitude: number; longitude: number; label: string };
type NominatimPlace = {
  lat?: string; lon?: string; display_name?: string; name?: string;
  category?: string; type?: string; class?: string;
  address?: Record<string,string>;
};

const SJDM = { minLat:14.65,maxLat:15.0,minLng:120.88,maxLng:121.30 };
const cache = new Map<string, VenueCandidate | null>();
const pending = new Map<string, Promise<VenueCandidate | null>>();
let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

const normalize = (value: string) => value.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const within = (lat:number,lng:number) => Number.isFinite(lat) && Number.isFinite(lng) &&
  lat>=SJDM.minLat && lat<=SJDM.maxLat && lng>=SJDM.minLng && lng<=SJDM.maxLng;
const irrelevant = new Set(["administrative","city","town","village","suburb","residential",
  "county","state","municipality","postcode"]);
const recognizedVenue = (place: NominatimPlace, venue: string) => {
  const name = normalize(place.name || place.display_name?.split(",")[0] || "");
  const requested = normalize(venue);
  const type = normalize(place.type || "");
  // A generic barangay-area centroid is NOT an actual hall / covered court / school.
  if (irrelevant.has(type) || normalize(place.category || place.class || "") === "boundary") return false;
  if (name.includes(requested)) return true;
  if (requested === "barangay hall") return name.includes("barangay") &&
    (name.includes("hall") || type === "townhall");
  if (requested === "covered court") return name.includes("court") || type === "sports centre";
  if (requested === "multi purpose hall") return name.includes("multipurpose") ||
    name.includes("multi purpose");
  if (requested === "community center") return name.includes("community") ||
    type === "community centre";
  if (requested === "public plaza") return name.includes("plaza") || type === "square";
  if (requested === "school grounds") return type === "school" || name.includes("school");
  return false;
};

async function lookup(barangay: string, venue: string): Promise<VenueCandidate | null> {
  const q = [venue, "Barangay " + barangay,"San Jose del Monte","Bulacan","Philippines"].join(", ");
  const params = new URLSearchParams({
    q, format:"jsonv2", addressdetails:"1", limit:"5", countrycodes:"ph",
    viewbox:"120.88,15.0,121.30,14.65", bounded:"1"
  });
  const headers: Record<string,string> = {Accept:"application/json"};
  if (Platform.OS !== "web") headers["User-Agent"] = "VolunServe/1.0 (https://volunserve.com)";
  const response = await fetch("https://nominatim.openstreetmap.org/search?" + params, {headers});
  if (!response.ok) throw new Error("Venue search unavailable");
  const places: NominatimPlace[] = await response.json();
  if (!Array.isArray(places)) return null;
  const targetBarangay = normalize(barangay);
  const candidates = places.filter(place => {
    const lat=Number(place.lat),lng=Number(place.lon);
    const address = normalize([place.display_name,...Object.values(place.address||{})].join(" "));
    return within(lat,lng) && address.includes(targetBarangay) && recognizedVenue(place,venue);
  });
  // Never fabricate coordinates for an unrecognized/ambiguous real-world venue.
  if (candidates.length !== 1) return null;
  const selected = candidates[0];
  return { latitude:+Number(selected.lat).toFixed(6), longitude:+Number(selected.lon).toFixed(6),
    label:String(selected.display_name || venue).slice(0,250) };
}

/** Rate-limit uncached queries per client; cache results and coalesce same-key requests. */
export function findCommunityEventVenue(barangay: string, venue: string): Promise<VenueCandidate | null> {
  const a=barangay.trim(),v=venue.trim();
  if (!a || !v || a.length>80 || v.length>150) return Promise.resolve(null);
  const key=normalize(a)+"|"+normalize(v);
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  const inflight=pending.get(key);
  if (inflight) return inflight;
  const result=queue.catch(()=>{}).then(async () => {
    const delay=Math.max(0,1100-(Date.now()-lastRequestAt));
    if (delay>0) await new Promise<void>(resolve=>setTimeout(resolve,delay));
    lastRequestAt=Date.now();
    const venueResult=await lookup(a,v);
    cache.set(key,venueResult);
    return venueResult;
  });
  pending.set(key,result);
  queue=result.catch(()=>{});
  void result.finally(()=>pending.delete(key)).catch(()=>{});
  return result;
}
