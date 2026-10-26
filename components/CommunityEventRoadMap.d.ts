import type { ComponentType } from "react";
type Point = { latitude: number; longitude: number };
declare const CommunityEventRoadMap: ComponentType<{
  eventId: string;
  title: string;
  category: string;
  destination: Point;
  origin?: Point | null;
  height?: number;
}>;
export default CommunityEventRoadMap;
