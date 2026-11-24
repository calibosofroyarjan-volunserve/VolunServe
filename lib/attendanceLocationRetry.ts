// Browser-only GPS acquisition. The server remains the attendance authority.
export type AttendanceLocation = {latitude:number; longitude:number; accuracy:number | null; timestamp:number};
type BrowserPosition = {coords:{latitude:number;longitude:number;accuracy:number};timestamp:number};
type BrowserGeo = {
  getCurrentPosition(
    success:(position:BrowserPosition)=>void,
    failure:(error:{code:number})=>void,
    options:{enableHighAccuracy:boolean;maximumAge:number;timeout:number}
  ):void;
};
const MAX_ACCURACY_METERS = 50;
const MAX_AGE_MS = 30000;
const ATTEMPTS = 3;
const ATTEMPT_MS = 5000;

function freshAccurate(location:AttendanceLocation):boolean {
  const now = Date.now();
  return Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
    Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180 &&
    typeof location.accuracy === "number" && Number.isFinite(location.accuracy) &&
    location.accuracy >= 0 && location.accuracy <= MAX_ACCURACY_METERS &&
    Number.isFinite(location.timestamp) && location.timestamp <= now + 5000 &&
    now - location.timestamp <= MAX_AGE_MS;
}

export async function getBrowserAttendanceLocation(
  geo:BrowserGeo,
  onAttempt:(attempt:number,total:number)=>void = () => {},
  attemptMs = ATTEMPT_MS
):Promise<AttendanceLocation> {
  let sawLowAccuracy = false;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    onAttempt(attempt, ATTEMPTS);
    const started = Date.now();
    const result = await new Promise<{location?:AttendanceLocation;denied?:boolean}>(resolve => {
      const timer = setTimeout(() => resolve({}), attemptMs);
      const finish = (value:{location?:AttendanceLocation;denied?:boolean}) => {
        clearTimeout(timer);
        resolve(value);
      };
      try {
        geo.getCurrentPosition(
          position => finish({location:{latitude:position.coords.latitude,longitude:position.coords.longitude,
            accuracy:position.coords.accuracy,timestamp:position.timestamp}}),
          error => finish({denied:error.code === 1}),
          {enableHighAccuracy:true,maximumAge:0,timeout:attemptMs}
        );
      } catch { finish({}); }
    });
    if (result.denied) throw new Error("Allow location permission to record attendance.");
    if (result.location && freshAccurate(result.location)) return result.location;
    if (result.location && typeof result.location.accuracy === "number" &&
        result.location.accuracy > MAX_ACCURACY_METERS) sawLowAccuracy = true;
    // Space out poor readings so the browser can obtain a better fix.
    if (attempt < ATTEMPTS) {
      const remaining = Math.max(0, attemptMs - (Date.now() - started));
      if (remaining) await new Promise<void>(resolve => setTimeout(resolve, remaining));
    }
  }
  throw new Error(sawLowAccuracy
    ? "GPS accuracy is too low. Move to an open area or use a GPS-enabled phone and try again."
    : "Unable to obtain a fresh GPS location. Enable GPS and try again.");
}
