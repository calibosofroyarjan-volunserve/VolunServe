/**
 * Browser webcam preview readiness, shared by ID scan and selfie capture.
 *
 * Browser permission/MediaStream "active" is not evidence that pixels are
 * visible. Do not mark a camera ready until a LIVE video track produces a
 * decoded frame with nonzero dimensions on the mounted <video> element.
 * No recording, storage, images or biometric telemetry.
 */
export async function waitForCameraPreview(
  video: HTMLVideoElement,
  stream: MediaStream,
  timeoutMs = 9000,
): Promise<void> {
  if (!stream.getVideoTracks().some(track => track.readyState === "live")) {
    throw new Error("The selected camera has no active video track. Reconnect the webcam and retry.");
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const events = ["loadeddata", "canplay", "playing", "resize"];

    const cleanup = () => {
      clearTimeout(timeout);
      for (const event of events) video.removeEventListener(event, check);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (!stream.getVideoTracks().some(track => track.readyState === "live")) {
        finish(new Error("The webcam stopped sending video. Check the connection and retry."));
        return;
      }
      if (
        video.srcObject === stream &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) finish();
    };
    const timeout = setTimeout(() => {
      finish(new Error(
        "Camera permission is on, but no webcam picture appeared. Check Windows camera privacy settings, close other camera apps, and retry.",
      ));
    }, timeoutMs);

    for (const event of events) video.addEventListener(event, check);
    try {
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      // Do not await play() alone: some browser/driver combinations leave
      // its promise pending forever; the bounded first-frame check owns the
      // readiness deadline and gives the user an actionable message.
      Promise.resolve(video.play()).then(check, error => {
        finish(new Error(
          error?.message || "The browser could not play the webcam preview. Allow camera access and retry.",
        ));
      });
      check();
    } catch (error: any) {
      finish(new Error(error?.message || "Unable to initialize the webcam preview."));
    }
  });
}
