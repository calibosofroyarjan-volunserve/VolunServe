/**
 * Camera framing/lighting checks for the private localhost selfie demo.
 * NOT an identity match, anti-spoof/liveness check, or official ID validation.
 * Face detector supplies bounding boxes; these checks never transmit images.
 */
export type LocalFaceBox = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};
export type LocalFaceDetection = { boundingBox?: LocalFaceBox | null };
export type LocalFaceQuality = {
  ready: boolean;
  reason: "no_face" | "multiple_faces" | "off_center" | "too_far" |
    "too_close" | "dark" | "ready";
  label: string;
};
export function evaluateLocalFaceQuality(
  detections: LocalFaceDetection[],
  width: number, height: number, brightness: number,
): LocalFaceQuality {
  const result = (reason: LocalFaceQuality["reason"], label: string,
    ready = false): LocalFaceQuality => ({ ready, reason, label });
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
      width <= 0 || height <= 0) {
    return result("no_face", "Waiting for visible camera frames");
  }
  if (!Array.isArray(detections) || detections.length === 0) {
    return result("no_face", "No face found — face the camera");
  }
  if (detections.length !== 1) {
    return result("multiple_faces", "Only one person should appear");
  }
  const box = detections[0]?.boundingBox;
  if (!box || ![box.originX, box.originY, box.width, box.height]
    .every(v => typeof v === "number" && Number.isFinite(v))) {
    return result("no_face", "Cannot locate the face clearly");
  }
  const centerX = (box.originX + box.width / 2) / width;
  const centerY = (box.originY + box.height / 2) / height;
  const ratioW = box.width / width;
  const ratioH = box.height / height;
  if (ratioW < 0.24 || ratioH < 0.32) {
    return result("too_far", "Move a little closer");
  }
  if (ratioW > 0.72 || ratioH > 0.88) {
    return result("too_close", "Move a little farther away");
  }
  if (Math.abs(centerX - 0.5) > 0.13 || Math.abs(centerY - 0.5) > 0.16) {
    return result("off_center", "Center your face inside the oval");
  }
  if (!Number.isFinite(brightness) || brightness < 60) {
    return result("dark", "Improve the lighting on your face");
  }
  return result("ready", "Green — hold still to capture", true);
}
