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


/**
 * Lightweight, local, best-effort rectangular card-framing heuristic.
 * Detects contrasting card-like borders; it does NOT identify a government ID
 * or validate any document. All pixels stay inside the browser.
 */
export function assessDocumentFrame(pixels, width, height) {
  if (!pixels || !Number.isInteger(width) || !Number.isInteger(height)
      || width < 40 || height < 30 || pixels.length !== width * height * 4) {
    return {acceptable:false,message:"Camera frame unavailable."};
  }
  const gray = new Float32Array(width * height);
  for (let j=0,p=0;j<gray.length;j++,p+=4) {
    gray[j]=0.2126*pixels[p]+0.7152*pixels[p+1]+0.0722*pixels[p+2];
  }
  const lum=(x,y)=>gray[y*width+x];
  const verticalStrength=(x)=>{
    let sum=0,n=0;
    for(let y=Math.round(height*.28);y<=Math.round(height*.72);y+=2){
      sum+=Math.abs(lum(x+2,y)-lum(x-2,y));n++;
    }
    return n?sum/n:0;
  };
  const horizontalStrength=(y)=>{
    let sum=0,n=0;
    for(let x=Math.round(width*.29);x<=Math.round(width*.71);x+=2){
      sum+=Math.abs(lum(x,y+2)-lum(x,y-2));n++;
    }
    return n?sum/n:0;
  };
  function findPeak(from,to,strength){
    let best={pos:-1,score:0};
    for(let i=Math.round(from);i<=Math.round(to);i++){
      const score=strength(i);
      if(score>best.score)best={pos:i,score};
    }
    return best;
  }
  const left=findPeak(width*.07,width*.36,verticalStrength);
  const right=findPeak(width*.64,width*.93,verticalStrength);
  const top=findPeak(height*.10,height*.43,horizontalStrength);
  const bottom=findPeak(height*.57,height*.90,horizontalStrength);
  if([left,right,top,bottom].some(b=>b.pos<0||b.score<15)){
    return {acceptable:false,message:"Place the ID against a contrasting background, fully inside the guide."};
  }
  const w=right.pos-left.pos,h=bottom.pos-top.pos;
  const aspect=w/h,cx=(right.pos+left.pos)/(2*width),cy=(top.pos+bottom.pos)/(2*height);
  if(w/width<.45||h/height<.30||w/width>.93||h/height>.80||aspect<1.32||aspect>2.30){
    return {acceptable:false,message:"Move the ID closer and keep its four edges visible."};
  }
  if(Math.abs(cx-.5)>.10||Math.abs(cy-.5)>.12){
    return {acceptable:false,message:"Center the ID within the green frame."};
  }
  return {acceptable:true,message:"Card-like edges visible. Hold steady for automatic capture."};
}
