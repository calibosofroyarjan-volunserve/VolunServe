import type React from "react";
declare const CommunityEventPinPicker: React.ComponentType<{
  barangay?: string;
  venue?: string;
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
}>;
export default CommunityEventPinPicker;
