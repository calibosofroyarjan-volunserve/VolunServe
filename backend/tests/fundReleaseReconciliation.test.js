"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { installFundReleaseDemoRoutes } = require("../fundReleaseDemoRoutes");

const manualId = "ManualCampaign00001";
const verifiedId = "PaymongoCampaign002";
const residentId = "ResidentVerified001";
const sourceId = "SourceAssist000002";

function fixture() {
  const campaign = id => ({
    title:"Surgery / Treatment Support", monetaryGoal:5000,
    verifiedAmountReceived:5000, sourceType:"community_assistance_request",
    sourceAssistanceRequestId:id===manualId?"SourceAssist000001":sourceId,
  });
  const tables = {
    donationCampaigns: new Map([[manualId,campaign(manualId)],[verifiedId,campaign(verifiedId)]]),
    donations: new Map([
      ["manual",{campaignId:manualId,donationType:"monetary",
        status:"received",paymentProvider:"manual",actualAmountReceived:5000}],
      ["paid1",{campaignId:verifiedId,donationType:"monetary",status:"received",
        paymentProvider:"paymongo",paymentStatus:"paid",paymongoLivemode:false,
        paymongoCheckoutSessionId:"cs_paid_001",verifiedBy:"paymongo_webhook",actualAmountReceived:4900}],
      ["paid2",{campaignId:verifiedId,donationType:"monetary",status:"received",
        paymentProvider:"paymongo",paymentStatus:"paid",paymongoLivemode:false,
        paymongoCheckoutSessionId:"cs_paid_002",verifiedBy:"paymongo_webhook",actualAmountReceived:100}],
      ["pending",{campaignId:verifiedId,donationType:"monetary",status:"payment_pending",
        paymentProvider:"paymongo",actualAmountReceived:8000}],
    ]),
    assistanceRequests:new Map([
      ["SourceAssist000001",{requesterUid:residentId,verificationStatus:"verified",
        supportDecision:"donation_support",donationCampaignId:manualId}],
      [sourceId,{requesterUid:residentId,verificationStatus:"verified",
        supportDecision:"donation_support",donationCampaignId:verifiedId}],
    ]),
    fundReleaseDemos:new Map(),
    users:new Map([["Admin00001",{role:"admin",status:"approved"}]]),
    notifications:new Map(),
  };
  const snapshot=(id,data)=>({id,exists:!!data,data:()=>data});
  const reference=(name,id)=>({
    name,id,async get(){return snapshot(id,tables[name].get(id));}
  });
  const query=(name,filters=[],max=Infinity)=>({
    where(field,op,value){return query(name,[...filters,[field,op,value]],max);},
    limit(n){return query(name,filters,n);},
    doc(id){return reference(name,id);},
    async get(){
      const docs=[...tables[name]].filter(([,data])=>
        filters.every(([field,op,value])=>op==="=="?
          data[field]===value:value.includes(data[field])))
        .slice(0,max).map(([id,data])=>snapshot(id,data));
      return {size:docs.length,docs};
    }
  });
  const db={
    collection:name=>query(name),
    runTransaction:async callback=>callback({
      get:ref=>ref.get(),
      create(ref,data){
        assert.equal(tables[ref.name].has(ref.id),false);
        tables[ref.name].set(ref.id,data);
      },
      set(ref,data){tables[ref.name].set(ref.id,data);},
      update(ref,data){tables[ref.name].set(ref.id,{
        ...tables[ref.name].get(ref.id),...data
      });},
    }),
  };
  const routes=new Map();
  const app={
    get:(path,...handlers)=>routes.set("GET "+path,handlers),
    post:(path,...handlers)=>routes.set("POST "+path,handlers),
  };
  installFundReleaseDemoRoutes({
    app,db,
    FieldValue:{
      serverTimestamp:()=>new Date("2026-10-26T00:00:00Z"),
      arrayUnion:item=>item,
    },
    requireFirebaseUser:(req,res,next)=>next(),
    requireAdminOrSuperAdmin:(req,res,next)=>next(),
    loadUserProfile:async uid=>uid===residentId?{identityVerified:true}:null,
    getProfileRole:p=>p?.role,
    isVerifiedResidentProfile:p=>p?.identityVerified===true,
    isVerifiedTestPaymongoDonation:d=>
      d.paymentProvider==="paymongo"&&d.status==="received"&&
      d.paymentStatus==="paid"&&d.paymongoLivemode===false&&
      d.verifiedBy==="paymongo_webhook"&&!!d.paymongoCheckoutSessionId&&
      Number(d.actualAmountReceived)>0,
  });
  async function invoke(method,path,body={},role="admin"){
    const handlers=routes.get(method+" "+path);
    assert.ok(handlers,path+" missing");
    const request={
      firebaseUser:{uid:"Admin00001"},volunServeProfile:{role},body,params:{}
    };
    const response={
      statusCode:200,payload:null,
      status(code){this.statusCode=code;return this;},
      json(data){this.payload=data;return this;},
    };
    for(const handler of handlers){
      let continued=false;
      await handler(request,response,()=>{continued=true;});
      if(!continued || response.payload)break;
    }
    return response;
  }
  return {invoke,tables};
}
test("same-title campaigns do not merge manual and webhook-confirmed balances",async()=>{
  const {invoke}=fixture();
  const response=await invoke("GET","/api/admin/donations/fund-releases");
  assert.equal(response.statusCode,200);
  const old=response.payload.funding.find(x=>x.campaignId===manualId);
  const payable=response.payload.funding.find(x=>x.campaignId===verifiedId);
  assert.equal(old.recordedFunding,5000);
  assert.equal(old.providerVerifiedTestAmount,0);
  assert.equal(old.manualLegacyAmount,5000);
  assert.equal(old.ready,false);
  assert.equal(old.reason,"manual_records_only");
  assert.equal(payable.providerVerifiedTestAmount,5000);
  assert.equal(payable.providerVerifiedCount,2);
  assert.equal(payable.pendingCount,1);
  assert.equal(payable.ready,true);
});
test("release review rejects legacy balance and accepts only provider-funded goal, once",async()=>{
  const {invoke,tables}=fixture();
  const body={amount:5000,reviewNote:"Reviewed approved assistance evidence and receipts."};
  const old=await invoke("POST","/api/admin/donations/fund-releases/review",
    {...body,campaignId:manualId});
  assert.equal(old.statusCode,409);
  const okay=await invoke("POST","/api/admin/donations/fund-releases/review",
    {...body,campaignId:verifiedId});
  assert.equal(okay.statusCode,201);
  assert.equal(tables.fundReleaseDemos.get(verifiedId).status,"reviewed");
  assert.equal(tables.fundReleaseDemos.get(verifiedId).amountCents,500000);
  const again=await invoke("POST","/api/admin/donations/fund-releases/review",
    {...body,campaignId:verifiedId});
  assert.equal(again.statusCode,409);
});
test("programmer Super Admin cannot access LGU financial records",async()=>{
  const {invoke}=fixture();
  const response=await invoke("GET","/api/admin/donations/fund-releases",{},"superadmin");
  assert.equal(response.statusCode,403);
  assert.equal(response.payload.error,"lgu_admin_required");
});
