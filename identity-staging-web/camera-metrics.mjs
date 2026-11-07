// Browser-only camera guidance. The numbers are heuristics, not identity evidence.
export function evaluateLighting(pixels) {
  if (!pixels || pixels.length < 16) return {brightness:0,contrast:0,acceptable:false};
  let sum=0,sumSq=0,n=0;
  for(let i=0;i<pixels.length;i+=4){
    const v=0.2126*pixels[i]+0.7152*pixels[i+1]+0.0722*pixels[i+2];
    sum+=v;sumSq+=v*v;n++;
  }
  const brightness=sum/n;
  const contrast=Math.sqrt(Math.max(0,sumSq/n-brightness*brightness));
  return {brightness,contrast,acceptable:brightness>=58&&brightness<=215&&contrast>=15};
}
export function assessFaceBoxes(detections, width, height) {
  const faces=Array.isArray(detections)?detections:[];
  if(faces.length!==1) return {acceptable:false,message:faces.length===0?"Show one face in the oval.":"Multiple faces detected — only one person allowed."};
  const box=faces[0].boundingBox||{};
  const x=Number(box.originX),y=Number(box.originY),w=Number(box.width),h=Number(box.height);
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0||width<=0||height<=0) return {acceptable:false,message:"Face position is not available."};
  const centerX=(x+w/2)/width,centerY=(y+h/2)/height,ratio=w/width;
  if(centerX<0.32||centerX>0.68||centerY<0.3||centerY>0.69) return {acceptable:false,message:"Move your face to the center."};
  if(ratio<0.18) return {acceptable:false,message:"Move closer to the camera."};
  if(ratio>0.62) return {acceptable:false,message:"Move a little farther away."};
  return {acceptable:true,message:"One centered face detected. Hold still for capture."};
}
export function frameDifference(a,b) {
  if(!a||!b||a.length!==b.length) return Infinity;
  let total=0,n=0;
  for(let i=0;i<a.length;i+=16){
    total+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
    n+=3;
  }
  return n?total/n:Infinity;
}
