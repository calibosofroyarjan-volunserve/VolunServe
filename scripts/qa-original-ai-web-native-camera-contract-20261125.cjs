"use strict";
/**
 * Actual restored VolunServe React Native camera action closures, evaluated
 * under synthetic cameras and stubbed native APIs. All source pinned in CI.
 * No real face, ID, camera, account, HTTP, Firebase or storage provider.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");

const nativePath = path.join(__dirname,"app","identity-verification.tsx");
const webPath = path.join(__dirname,"app","identity-verification.web.tsx");
const clientPath = path.join(__dirname,"lib","identityVerification.ts");
const native = fs.readFileSync(nativePath,"utf8");
const web = fs.readFileSync(webPath,"utf8");
const client = fs.readFileSync(clientPath,"utf8");
const tree = ts.createSourceFile(nativePath,native,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const component=tree.statements.find(x=>ts.isFunctionDeclaration(x)&&x.name?.text==="IdentityVerification");
assert.ok(component?.body,"Restored native original-AI component missing");
function action(name,locals){
  const declaration=component.body.statements
    .filter(ts.isVariableStatement)
    .flatMap(x=>x.declarationList.declarations)
    .find(x=>x.name.getText(tree)===name);
  assert.ok(declaration?.initializer,"Actual native action missing: "+name);
  const js=ts.transpileModule("module.exports = "+declaration.initializer.getText(tree)+";",{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}
  }).outputText;
  const module={exports:null};
  vm.runInNewContext(js,{module,...locals},{filename:name+".isolated.js",timeout:1000});
  return module.exports;
}
const front={uri:"file:///synthetic-front.jpg",name:"fake-id-front.jpg",type:"image/jpeg"};
const back={uri:"file:///synthetic-back.jpg",name:"fake-id-back.jpg",type:"image/jpeg"};
const sampleSelfie={uri:"file:///synthetic-selfie.jpg",name:"fake-selfie.jpg",type:"image/jpeg"};
const screening={
  status:"inconclusive",
  declaredIdType:"national_id",
  detectedIdType:null
};
function deferred(){
  let resolve;let reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

function nativeIdFixture({granted=true,cancelled=false,fail=false}={}){
  const record={picking:[],front:[],back:[],outcome:[],message:[],alert:[],camera:0};
  const revision={current:12};
  const ImagePicker={
    requestCameraPermissionsAsync:async()=>({granted}),
    MediaTypeOptions:{Images:"images"},
    CameraType:{back:"back"},
    launchCameraAsync:async(opts)=>{
      record.camera++;
      assert.equal(opts.cameraType,"back");
      assert.equal(opts.allowsEditing,false);
      if(fail)throw Error("Synthetic camera stopped");
      return cancelled?{canceled:true,assets:[]}:{
        canceled:false,assets:[{uri:"file:///fake-source.jpg",mimeType:"image/jpeg"}]
      };
    }
  };
  const Alert={alert:(...args)=>record.alert.push(args)};
  const locals={
    pickingId:false,submitting:false,ImagePicker,Alert,
    documentPrecheckRevisionRef:revision,
    setPickingId:value=>record.picking.push(value),
    setDocumentPrecheckMessage:value=>record.message.push(value),
    setDocumentPrecheckOutcome:value=>record.outcome.push(value),
    setIdDocument:value=>record.front.push(value),
    setIdBackDocument:value=>record.back.push(value),
    setLocalMessage:()=>{},
    mediaFromAsset:(asset,prefix)=>({uri:asset.uri,name:prefix+".jpg",type:"image/jpeg"})
  };
  return {record,revision,run:side=>action("captureIdSide",locals)(side)};
}
test("Native ID camera: denied permission never launches native picker",async()=>{
  const c=nativeIdFixture({granted:false});
  await c.run("front");
  assert.equal(c.record.camera,0);
  assert.deepEqual(c.record.picking,[true,false]);
  assert.equal(c.record.front.length,0);
  assert.match(c.record.alert[0][1],/camera access/i);
});
test("Native ID camera: user cancellation leaves existing ID and precheck unchanged",async()=>{
  const c=nativeIdFixture({cancelled:true});
  await c.run("front");
  assert.equal(c.record.camera,1);
  assert.equal(c.record.front.length,0);
  assert.equal(c.record.back.length,0);
  assert.equal(c.revision.current,12);
  assert.deepEqual(c.record.picking,[true,false]);
});
for(const side of ["front","back"]){
  test("Native ID camera: physical "+side+" capture updates only selected side and invalidates old precheck",async()=>{
    const c=nativeIdFixture();
    await c.run(side);
    assert.equal(c.record.camera,1);
    assert.equal(c.record[side].length,1);
    assert.equal(c.record[side==="front"?"back":"front"].length,0);
    assert.equal(c.record[side][0].name,"government-id-"+side+".jpg");
    assert.equal(c.revision.current,13);
    assert.equal(c.record.outcome.at(-1),null);
    assert.deepEqual(c.record.picking,[true,false]);
  });
}
test("Native ID camera: capture error leaves no photo and releases busy indicator",async()=>{
  const c=nativeIdFixture({fail:true});
  await c.run("back");
  assert.equal(c.record.back.length,0);
  assert.deepEqual(c.record.picking,[true,false]);
  assert.match(c.record.alert[0][1],/Synthetic camera stopped/);
});

function nativePrecheckFixture(opts={}){
  const record={checks:0,prechecks:0,message:[],outcome:[],local:[],steps:[],status:[],selfie:[],camera:[],checkBusy:[],permission:0};
  const revision={current:15};
  const {result={outcome:"pass",message:"Synthetic government ID scanned"},doc=front,
    reverse=back,consent=true,idType="national_id",readyPromise=null,
    permissionGranted=true}=opts;
  const locals={
    documentChecking:false,idDocument:doc,idBackDocument:reverse,idType,
    documentConsent:consent,documentPrecheckRevisionRef:revision,
    setDocumentPrecheckMessage:x=>record.message.push(x),
    setDocumentChecking:x=>record.checkBusy.push(x),
    setDocumentPrecheckOutcome:x=>record.outcome.push(x),
    setLocalMessage:x=>record.local.push(x),
    setStep:x=>record.steps.push(x),
    setStatusResult:x=>record.status.push(x),
    setSelfie:x=>record.selfie.push(x),
    setCameraReady:x=>record.camera.push(x),
    checkIdentityEngineReady:async()=>{record.checks++;if(readyPromise)await readyPromise;},
    precheckIdentityDocument:async input=>{
      record.prechecks++;
      assert.equal(input.consent,true);
      assert.equal(input.idType,idType);
      assert.equal(input.idDocument,doc);
      assert.equal(input.idBackDocument,idType==="passport"?null:reverse);
      return result;
    },
    cameraPermission:{granted:permissionGranted},
    requestCameraPermission:async()=>{record.permission++;return {granted:true};}
  };
  return {record,revision,run:()=>action("openFaceScan",locals)()};
}
test("Native precheck: missing ID front stops before authenticated AI request",async()=>{
  const c=nativePrecheckFixture({doc:null});
  await c.run();
  assert.equal(c.record.checks,0);
  assert.equal(c.record.prechecks,0);
  assert.equal(c.record.steps.length,0);
  assert.match(c.record.message[0],/front of a supported government ID/i);
});
test("Native precheck: non-passport needs both front and back images",async()=>{
  const c=nativePrecheckFixture({reverse:null});
  await c.run();
  assert.equal(c.record.checks,0);
  assert.equal(c.record.prechecks,0);
  assert.match(c.record.message[0],/reverse/i);
});
test("Native precheck: preliminary ID consent required before AI request",async()=>{
  const c=nativePrecheckFixture({consent:false});
  await c.run();
  assert.equal(c.record.checks,0);
  assert.equal(c.record.prechecks,0);
  assert.match(c.record.message[0],/Agree/i);
});
test("Native precheck: unsupported/retry ID cannot open camera",async()=>{
  const c=nativePrecheckFixture({result:{outcome:"retry",message:"Unsupported fake school ID"}});
  await c.run();
  assert.equal(c.record.prechecks,1);
  assert.deepEqual(c.record.steps,[]);
  assert.deepEqual(c.record.status,[]);
  assert.equal(c.record.permission,0);
});
test("Native precheck: confirmed OCR-only Admin review stays Pending, never selfie",async()=>{
  const c=nativePrecheckFixture({result:{
    outcome:"review",status:"pending",
    decision:"pending_admin_review",verificationId:"synthetic-pending-20261125",
    documentScreening:screening,message:"Requires Admin review"
  }});
  await c.run();
  assert.equal(c.record.prechecks,1);
  assert.deepEqual(c.record.steps,[3]);
  assert.equal(c.record.status[0].identityStatus,"pending");
  assert.equal(c.record.status[0].identityVerified,false);
  assert.equal(c.record.status[0].verificationId,"synthetic-pending-20261125");
  assert.equal(c.record.permission,0);
  assert.ok(!c.record.steps.includes(2));
});
test("Native precheck: unconfirmed Admin review never invents Pending status",async()=>{
  const c=nativePrecheckFixture({result:{
    outcome:"review",status:undefined,
    decision:"pending_admin_review",documentScreening:screening,
    message:"Needs manual check"
  }});
  await c.run();
  assert.deepEqual(c.record.steps,[]);
  assert.deepEqual(c.record.status,[]);
  assert.match(c.record.message.at(-1),/pending record was not confirmed/);
  assert.equal(c.record.permission,0);
});
test("Native precheck: approved document check opens selfie step but NOT Verified Resident",async()=>{
  const c=nativePrecheckFixture({permissionGranted:false});
  await c.run();
  assert.deepEqual(c.record.steps,[2]);
  assert.equal(c.record.permission,1);
  assert.deepEqual(c.record.status,[]);
  assert.deepEqual(c.record.checkBusy,[true,false]);
});
test("Native precheck: cancelled in-flight OCR cannot resurrect selfie screen",async()=>{
  const wait=deferred();
  const c=nativePrecheckFixture({readyPromise:wait.promise});
  const running=c.run();
  c.revision.current++;
  wait.resolve();
  await running;
  assert.equal(c.record.prechecks,0);
  assert.deepEqual(c.record.steps,[]);
  assert.deepEqual(c.record.status,[]);
  assert.deepEqual(c.record.checkBusy,[true,false]);
});
test("Native passport precheck does not send nonexistent reverse side",async()=>{
  const c=nativePrecheckFixture({idType:"passport",reverse:null});
  await c.run();
  assert.equal(c.record.prechecks,1);
  assert.deepEqual(c.record.steps,[2]);
});

function nativeSelfieFixture(opts={}){
  const record={alerts:[],picking:[],selfies:[],msgs:[],photos:0,permissions:0};
  const {granted=true,cameraReady=true,photoUri="file:///synthetic-selfie.jpg",
    photoThrows=false}=opts;
  const locals={
    pickingSelfie:false,submitting:false,
    cameraPermission:{granted},
    requestCameraPermission:async()=>{record.permissions++;return {granted:false};},
    Alert:{alert:(...args)=>record.alerts.push(args)},
    cameraRef:{current:cameraReady?{
      takePictureAsync:async options=>{
        record.photos++;
        assert.equal(options.quality,0.92);
        if(photoThrows)throw Error("Fake camera failure");
        return {uri:photoUri};
      }
    }:null},
    setPickingSelfie:x=>record.picking.push(x),
    mediaFromCameraUri:async uri=>({...sampleSelfie,uri}),
    setSelfie:x=>record.selfies.push(x),
    setLocalMessage:x=>record.msgs.push(x)
  };
  return {record,run:()=>action("captureFace",locals)()};
}
test("Native selfie: denied camera permission blocks taking picture",async()=>{
  const c=nativeSelfieFixture({granted:false});
  await c.run();
  assert.equal(c.record.photos,0);
  assert.equal(c.record.permissions,1);
  assert.match(c.record.alerts[0][1],/allow camera access/i);
});
test("Native selfie: missing camera reference blocks capture safely",async()=>{
  const c=nativeSelfieFixture({cameraReady:false});
  await c.run();
  assert.equal(c.record.photos,0);
  assert.match(c.record.alerts[0][0],/Camera Not Ready/);
});
test("Native selfie: real camera API result converts into private media, releases spinner",async()=>{
  const c=nativeSelfieFixture();
  await c.run();
  assert.equal(c.record.photos,1);
  assert.equal(c.record.selfies.length,1);
  assert.equal(c.record.selfies[0].name,"fake-selfie.jpg");
  assert.deepEqual(c.record.picking,[true,false]);
});
test("Native selfie: missing returned URI does not create a selfie",async()=>{
  const c=nativeSelfieFixture({photoUri:""});
  await c.run();
  assert.equal(c.record.selfies.length,0);
  assert.deepEqual(c.record.picking,[true,false]);
  assert.match(c.record.alerts[0][0],/Unable to Capture Face/);
});
test("Native selfie: capture error resets busy indicator and stays in capture",async()=>{
  const c=nativeSelfieFixture({photoThrows:true});
  await c.run();
  assert.equal(c.record.selfies.length,0);
  assert.deepEqual(c.record.picking,[true,false]);
  assert.match(c.record.alerts[0][1],/Fake camera failure/);
});

test("Web/native API client routes and consent are exactly the restored original flow",()=>{
  for(const route of [
    "/api/identity/document/precheck-with-evidence",
    "/api/identity/verify-with-evidence"
  ])assert.ok(client.includes(route));
  assert.match(client,/body\.append\("identityEvidenceConsent", "true"\)/);
  assert.match(client,/formData\.append\("identityEvidenceConsent", "true"\)/);
  assert.match(web,/navigator\.mediaDevices\.getUserMedia/);
  assert.match(web,/stopIdCamera/);
  assert.match(native,/ImagePicker\.requestCameraPermissionsAsync\(\)/);
  assert.match(native,/requestCameraPermission\(\)/);
  assert.match(native,/if \(result\.status === "pending"\)/);
  assert.ok(!native.includes("automatic Verified Resident after only OCR"));
  assert.match(client,/Staging identity verification is blocked: this build is connected to production Firebase/);
});
