// Local-only device selection and camera diagnostics. No camera identifiers are transmitted.
export function cameraErrorMessage(error, discoveredCount=null){
 const name=String(error?.name||"");
 if(name==="NotFoundError"||name==="DevicesNotFoundError"){
  return discoveredCount===0
   ?"No camera detected. Connect a USB webcam or use a phone with a camera. On Windows, open the Camera app and check Device Manager > Cameras. A browser cannot create a camera device."
   :"No usable camera found. Check that your webcam is connected and enabled in Windows, then close other camera apps and retry. Try the Windows Camera app.";
 }
 if(name==="NotAllowedError"||name==="PermissionDeniedError"||name==="SecurityError"){
  return "Camera permission is blocked. In Microsoft Edge, click the lock/tune icon beside the website address, allow Camera, and reload. Also check Windows Settings > Privacy & security > Camera.";
 }
 if(name==="NotReadableError"||name==="TrackStartError"||name==="AbortError"){
  return "Camera device exists but could not start. Close Windows Camera, Teams, Zoom or other programs using it; reconnect the camera or restart Edge.";
 }
 if(name==="OverconstrainedError"){
  return "The requested camera or video setting is unsupported. Choose Automatic camera and retry.";
 }
 if(name==="TypeError")return "Camera API is unavailable. Open the HTTPS staging site in a current version of Edge or Chrome.";
 return "Could not start the camera. Check Windows Camera, browser permissions and connected video devices, then retry.";
}
export function videoInputList(devices){
 return (Array.isArray(devices)?devices:[])
  .filter(device=>device?.kind==="videoinput")
  .map((device,index)=>({id:String(device.deviceId||""),name:String(device.label||"Camera "+(index+1)).slice(0,90)}));
}
export function cameraConstraints(stage,selectedId=""){
 const video={
  width:{ideal:1280},height:{ideal:960},
  ...(selectedId?{deviceId:{exact:selectedId}}:{facingMode:{ideal:stage==="selfie"?"user":"environment"}}),
 };
 return {audio:false,video};
}
