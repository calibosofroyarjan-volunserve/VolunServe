"use strict";
/**
 * Read-only, fail-closed normalized deadline for isolated fictional 002 only.
 * Firestore old test documents may use a number or a Timestamp. Invalid,
 * missing or unreasonably distant values are NOT treated as expired/active.
 */
function deadlineMs(value){
  let ms=null;
  if(typeof value==="number")ms=value;
  else if(typeof value==="string"&&/^\d{13}$/.test(value))ms=Number(value);
  else if(value && typeof value==="object"){
    try{
      if(typeof value.toMillis==="function")ms=value.toMillis();
      else{
        const sec=value.seconds??value._seconds;
        const ns=value.nanoseconds??value._nanoseconds??0;
        if(Number.isInteger(sec)&&Number.isInteger(ns)&&ns>=0&&ns<1e9)
          ms=sec*1000+Math.floor(ns/1e6);
      }
    }catch{return null;}
  }
  return Number.isSafeInteger(ms) && ms>=1577836800000 && ms<=4102444800000?ms:null;
}
const toIso=ms=>ms===null?null:new Date(ms).toISOString();
module.exports={deadlineMs,toIso};
