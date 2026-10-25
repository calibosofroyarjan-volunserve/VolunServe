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
    fundReleaseWalletProfiles:new Map(),
    users:new Map([["Admin00001",{role:"admin",status:"approved"}],
      [residentId,{role:"resident",status:"approved",identityVerified:true}]]),
    notifications:new Map(),
  };
  const snapshot=(id,data)=>({id,exists:!!data,data:()=>data});
  const reference=(name,id)=>({
    name,id,async get(){return snapshot(id,tables[name].get(id));},
    async set(data,opts={}){tables[name].set(id,opts.merge
      ? {...(tables[name].get(id)||{}),...data}:data);},
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
    loadUserProfile:async uid=>uid===residentId?{
      identityVerified:true,fullName:"Demo Verified Resident",
      barangay:"Barangay Sample",photoUrl:"should-not-be-exposed",
      profilePictureUrl:"https://cdn.example.org/profile.png",
      email:"private@example.com",phoneNumber:"09991234567",
    }:null,
    getProfileRole:p=>p?.role,
    isVerifiedResidentProfile:p=>p?.identityVerified===true,
    isVerifiedTestPaymongoDonation:d=>
      d.paymentProvider==="paymongo"&&d.status==="received"&&
      d.paymentStatus==="paid"&&d.paymongoLivemode===false&&
      d.verifiedBy==="paymongo_webhook"&&!!d.paymongoCheckoutSessionId&&
      Number(d.actualAmountReceived)>0,
  });
  async function invoke(method,path,body={},role="admin"){
    const uid=role==="resident"?residentId:"Admin00001";
    const template=path.replace("/"+verifiedId+"/","/:id/")
      .replace("/"+manualId+"/","/:id/");
    const handlers=routes.get(method+" "+template);
    assert.ok(handlers,path+" missing");
    const request={
      firebaseUser:{uid},volunServeProfile:{role},body,
      params:{id:path.includes("/"+verifiedId+"/")?verifiedId:manualId}
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

test("Resident owns their fictional wallet alias; Admin cannot override release destination",async()=>{
  const {invoke,tables}=fixture();
  const base="/api/admin/donations/fund-releases";
  const review=await invoke("POST",base+"/review",{
    campaignId:verifiedId,amount:5000,
    reviewNote:"Reviewed the linked assistance and provider confirmed test donations.",
  });
  assert.equal(review.statusCode,201);
  const auth=await invoke("POST",base+"/"+verifiedId+"/authorize",{
    decision:"approve",reason:"Matched all verified test transactions with the approved request.",
  });
  assert.equal(auth.statusCode,200);

  const before=await invoke("POST",base+"/"+verifiedId+"/simulate",{
    method:"maya",confirmedSandbox:true,
  });
  assert.equal(before.statusCode,409);
  assert.equal(before.payload.error,"resident_wallet_required");

  const short=await invoke("POST","/api/funds/my-release-wallet",{
    method:"gcash",walletLast4:"12",confirmedTestOnly:true,
  },"resident");
  assert.equal(short.statusCode,400);
  assert.equal(short.payload.error,"invalid_wallet_alias");
  const noConsent=await invoke("POST","/api/funds/my-release-wallet",{
    method:"gcash",walletLast4:"1234",
  },"resident");
  assert.equal(noConsent.statusCode,400);
  assert.equal(noConsent.payload.error,"test_only_confirmation_required");

  const saved=await invoke("POST","/api/funds/my-release-wallet",{
    method:"maya",walletLast4:"1234",confirmedTestOnly:true,
    ownerUid:"Attacker0001",
  },"resident");
  assert.equal(saved.statusCode,200);
  assert.equal(saved.payload.wallet.method,"maya");
  const storedWallet=tables.fundReleaseWalletProfiles.get(residentId);
  assert.equal(storedWallet.ownerUid,residentId);
  assert.equal(storedWallet.walletLast4,"1234");
  assert.equal(Object.hasOwn(storedWallet,"fullWalletNumber"),false);
  assert.equal(Object.hasOwn(storedWallet,"testWalletNumber"),false);

  const self=await invoke("GET","/api/funds/my-release-wallet",{},"resident");
  assert.equal(self.payload.wallet.configured,true);
  const beneficiary=await invoke("GET",base+"/"+verifiedId+"/beneficiary");
  assert.equal(beneficiary.payload.beneficiary.wallet.method,"maya");
  assert.equal(beneficiary.payload.beneficiary.wallet.walletLast4,"1234");
  assert.equal(Object.hasOwn(beneficiary.payload.beneficiary.wallet,"ownerUid"),false);

  const override=await invoke("POST",base+"/"+verifiedId+"/simulate",{
    method:"gcash",confirmedSandbox:true,testWalletNumber:"09990001234",
  });
  assert.equal(override.statusCode,400);
  assert.equal(override.payload.error,"admin_wallet_override_blocked");

  const mismatch=await invoke("POST",base+"/"+verifiedId+"/simulate",{
    method:"gcash",confirmedSandbox:true,
  });
  assert.equal(mismatch.statusCode,409);
  assert.equal(mismatch.payload.error,"resident_wallet_mismatch");

  const result=await invoke("POST",base+"/"+verifiedId+"/simulate",{
    method:"maya",confirmedSandbox:true,
  });
  assert.equal(result.statusCode,200);
  const stored=tables.fundReleaseDemos.get(verifiedId);
  assert.equal(stored.status,"simulated_sent");
  assert.equal(stored.method,"maya");
  assert.equal(stored.walletLast4,"1234");
  assert.equal(stored.releaseProcessor,"volunserve_internal_sandbox");
  assert.equal(stored.deliveryStatus,"simulation_only");
  assert.equal(typeof stored.audit.at,"string");
  assert.ok(!Number.isNaN(Date.parse(stored.audit.at)));
  assert.equal(Object.hasOwn(stored,"testWalletNumber"),false);
  assert.equal(Object.hasOwn(stored,"walletNumber"),false);
  assert.ok(stored.simulationReference.startsWith("VS-DEMO-"));
  assert.ok(tables.notifications.has(
    "fund_demo_"+verifiedId+"_simulated_sent_resident_"+residentId));

  const replay=await invoke("POST",base+"/"+verifiedId+"/simulate",{
    method:"maya",confirmedSandbox:true,
  });
  assert.equal(replay.statusCode,409);
  assert.equal(replay.payload.error,"already_released");
});
test("release stops if requesting Resident becomes unverified or linked request changes",async()=>{
  const {invoke,tables}=fixture();
  const base="/api/admin/donations/fund-releases";
  await invoke("POST",base+"/review",{campaignId:verifiedId,amount:5000,
    reviewNote:"Matched linked assistance and two provider confirmed test transactions."});
  await invoke("POST",base+"/"+verifiedId+"/authorize",{
    decision:"approve",reason:"Approved verified assistance release for internal test."});
  await invoke("POST","/api/funds/my-release-wallet",{
    method:"gcash",walletLast4:"8888",confirmedTestOnly:true,
  },"resident");

  tables.users.get(residentId).identityVerified=false;
  const unverified=await invoke("POST",base+"/"+verifiedId+"/simulate",{
    method:"gcash",confirmedSandbox:true});
  assert.equal(unverified.statusCode,409);
  assert.equal(unverified.payload.error,"recipient_not_verified");
  tables.users.get(residentId).identityVerified=true;

  tables.assistanceRequests.get(sourceId).donationCampaignId=manualId;
  const brokenLink=await invoke("POST",base+"/"+verifiedId+"/simulate",{
    method:"gcash",confirmedSandbox:true});
  assert.equal(brokenLink.statusCode,409);
  assert.equal(brokenLink.payload.error,"verified_beneficiary_required");
});
test("Super Admin cannot submit a simulated GCash/Maya payout",async()=>{
  const {invoke}=fixture();
  const r=await invoke("POST",
    "/api/admin/donations/fund-releases/"+verifiedId+"/simulate",{
      method:"gcash",testWalletNumber:"09990001234",confirmedSandbox:true,
    },"superadmin");
  assert.equal(r.statusCode,403);
  assert.equal(r.payload.error,"lgu_admin_required");
});

test("Admin beneficiary profile matches linked verified requester, not campaign title",async()=>{
  const {invoke,tables}=fixture();
  const route="/api/admin/donations/fund-releases/"+verifiedId+"/beneficiary";
  const r=await invoke("GET",route);
  assert.equal(r.statusCode,200);
  assert.equal(r.payload.beneficiary.displayName,"Demo Verified Resident");
  assert.equal(r.payload.beneficiary.barangay,"Barangay Sample");
  assert.equal(r.payload.beneficiary.verified,true);
  assert.equal(r.payload.beneficiary.assistanceRequestId,sourceId);
  assert.equal(r.payload.beneficiary.campaignId,verifiedId);
  assert.equal(r.payload.beneficiary.photoUrl,"https://cdn.example.org/profile.png");
  assert.equal(Object.hasOwn(r.payload.beneficiary,"email"),false);
  assert.equal(Object.hasOwn(r.payload.beneficiary,"phoneNumber"),false);
  assert.equal(Object.hasOwn(r.payload.beneficiary,"documents"),false);
  assert.equal(Object.hasOwn(r.payload.beneficiary,"requesterUid"),false);

  const other=await invoke("GET",
    "/api/admin/donations/fund-releases/"+manualId+"/beneficiary");
  assert.equal(other.statusCode,200);
  assert.notEqual(other.payload.beneficiary.assistanceRequestId,
    r.payload.beneficiary.assistanceRequestId);
  assert.equal(other.payload.beneficiary.campaignId,manualId);

  tables.assistanceRequests.get(sourceId).donationCampaignId=manualId;
  const invalid=await invoke("GET",route);
  assert.equal(invalid.statusCode,409);
  assert.equal(invalid.payload.error,"verified_beneficiary_required");
});
test("Super Admin cannot view private fund-release beneficiary profiles",async()=>{
  const {invoke}=fixture();
  const r=await invoke("GET",
    "/api/admin/donations/fund-releases/"+verifiedId+"/beneficiary",
    {},"superadmin");
  assert.equal(r.statusCode,403);
  assert.equal(r.payload.error,"lgu_admin_required");
});
test("existing release cannot silently change verified recipient",async()=>{
  const {invoke,tables}=fixture();
  const base="/api/admin/donations/fund-releases";
  const review=await invoke("POST",base+"/review",{
    campaignId:verifiedId,amount:5000,
    reviewNote:"Reviewed authentic backend-confirmed test payment records."
  });
  assert.equal(review.statusCode,201);
  tables.fundReleaseDemos.get(verifiedId).recipientUid="OtherResident00001";
  const result=await invoke("GET",base+"/"+verifiedId+"/beneficiary");
  assert.equal(result.statusCode,409);
  assert.equal(result.payload.error,"recipient_record_mismatch");
});
