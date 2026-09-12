import type { ComponentType } from "react";

export type AssistanceLocationMapProps = {
  latitude: number;
  longitude: number;
  title?: string;
};

declare const AssistanceLocationMap: ComponentType<AssistanceLocationMapProps>;

export default AssistanceLocationMap;