const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const picker = read("components/CommunityEventPinPicker.web.tsx");
const map = read("components/InteractiveEventPinMap.web.tsx");
const native = read("components/CommunityEventPinPicker.native.tsx");
const screen = read("app/(tabs)/community-events.tsx");
const backend = read("backend/server.js");

assert(picker.includes("<InteractiveEventPinMap"), "Web picker must have an interactive fallback");
assert(map.includes("tiles.openfreemap.org/styles/liberty"), "Actual vector map tiles required");
assert(map.includes('map.on("click", event => move('), "Tap-to-pin event missing");
assert(map.includes('draggable:true'), "Pin must support drag adjustment");
assert(map.includes("event.source !== frame.current?.contentWindow"),
  "Iframe messages must be validated against the current frame");
assert(map.includes('data?.token !== token.current'), "Map messages must validate a unique token");
assert(map.includes('sandbox: "allow-scripts"'), "Fallback iframe needs a restrictive sandbox");
assert(map.includes('lat < 14.65 || lat > 15.0') && map.includes('lng < 120.88 || lng > 121.30'),
  "Fallback picker must enforce the same region as the proposal API");
assert(picker.includes("validVenue(draft.latitude,draft.longitude)"),
  "Confirmation must reject invalid out-of-region draft");
assert(picker.includes("onChange(draft.latitude, draft.longitude)"),
  "Only explicitly confirmed coordinates may be submitted");
assert(picker.includes("onChangeRef.current(null, null)"),
  "Changing a previously confirmed pin must invalidate the stored coordinates");
assert(picker.includes("Enter Coordinates") && picker.includes("manualOpen"),
  "Coordinates should remain available as an optional fallback");
assert(picker.includes("GOOGLE_JS_KEY"), "Keep configured Google Maps JavaScript support");
assert(!picker.includes("GOOGLE_EMBED_KEY"), "A preview-only iframe must not be the default map picker");
assert(screen.includes("<CommunityEventPinPicker"), "Live Community Events flow must use real pin picker");
assert(native.includes('onPress={event=>pick('), "Existing native tap flow must remain available");
assert(backend.includes("disaster") || backend.includes("community"), "Backend remains present");
console.log("PASS interactive web pin picker, API-key fallback, safe confirmation, native parity");
