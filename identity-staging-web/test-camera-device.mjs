import test from "node:test";
import assert from "node:assert/strict";
import {cameraErrorMessage,videoInputList,cameraConstraints} from "./camera-device.mjs";

test("NotFoundError with no video inputs explains missing webcam rather than suggesting only permissions",()=>{
 const message=cameraErrorMessage({name:"NotFoundError"},0);
 assert.match(message,/no camera detected/i);
 assert.match(message,/USB webcam|phone/i);
});
test("NotFoundError with a connected input has hardware troubleshooting",()=>{
 assert.match(cameraErrorMessage({name:"NotFoundError"},1),/no usable camera/i);
});
test("permission error gives Edge and Windows controls",()=>{
 assert.match(cameraErrorMessage({name:"NotAllowedError"}),/microsoft edge/i);
});
test("busy camera suggests closing other software",()=>{
 assert.match(cameraErrorMessage({name:"NotReadableError"}),/teams|zoom/i);
});
test("device listing only returns video inputs and handles missing names",()=>{
 const devices=videoInputList([{kind:"audioinput",deviceId:"secret",label:"mic"},{kind:"videoinput",deviceId:"a",label:"USB Webcam"},{kind:"videoinput",deviceId:"b",label:""}]);
 assert.deepEqual(devices,[{id:"a",name:"USB Webcam"},{id:"b",name:"Camera 2"}]);
});
test("manual selection uses an exact camera device, automatic uses facing preference",()=>{
 const manual=cameraConstraints("front","camera123");
 assert.deepEqual(manual.video.deviceId,{exact:"camera123"});
 assert.equal(manual.video.facingMode,undefined);
 assert.equal(cameraConstraints("selfie").video.facingMode.ideal,"user");
 assert.equal(cameraConstraints("front").video.facingMode.ideal,"environment");
});
