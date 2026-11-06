"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { installPublicAssistanceAppeals } = require("../publicAssistanceAppeals");

function setup({
  verified = true, sourceOverrides = {}, reviewOverrides = {}
} = {}) {
  const id = "case_pet_support_1234";
  const rows = {
    assistanceRequests: {
      [id]: {
        status: "verified",
        verificationStatus: verified ? "verified" : "pending",
        category: "animal_pet_welfare",
        requesterName: "PRIVATE RESIDENT NAME",
        requesterAddress: "PRIVATE HOME STREET",
        publicCampaignPhotoConsent: false,
        publicCampaignPhotoUrl: "https://example.com/private-evidence.jpg",
        ...sourceOverrides,
      },
    },
    assistanceVerificationReviews: {
      [id]: {finalDecision: verified ? "verified" : "pending",...reviewOverrides},
    },
    publicAssistanceAppeals: {},
  };
  const endpoints = { post: {}, get: {} };
  const app = {
    post(path, ...handlers) { endpoints.post[path] = handlers.at(-1); },
    get(path, ...handlers) { endpoints.get[path] = handlers.at(-1); },
  };
  const db = {
    collection(name) {
      return {
        doc(docId) { return { name, id: docId }; },
        where(field,op,value) {
          return {
            limit() {
              return {
                async get() {
                  return { docs: Object.entries(rows[name] || {})
                    .filter(([,data])=>data[field] === value)
                    .map(([key,data])=>({id:key,data:()=>data})) };
                },
              };
            },
          };
        },
      };
    },
    async runTransaction(handler) {
      const writes = [];
      const tx = {
        async get(ref) {
          const value = rows[ref.name]?.[ref.id];
          return {exists: Boolean(value),data:()=>value};
        },
        set(ref,data,options) { writes.push({ref,data,mode:options?.merge?"merge":"set"}); },
        update(ref,data) { writes.push({ref,data,mode:"merge"}); },
      };
      const result=await handler(tx);
      for(const item of writes) {
        rows[item.ref.name] ||= {};
        rows[item.ref.name][item.ref.id] = item.mode === "merge"
          ? {...(rows[item.ref.name][item.ref.id]||{}),...item.data}
          : {...item.data};
      }
      return result;
    },
  };
  const FieldValue = { serverTimestamp(){return {toMillis(){return 1234567890000}};} };
  installPublicAssistanceAppeals({
    app,db,FieldValue,
    requireFirebaseUser(_a,_b,next){next?.()},
    requireOperationalAdmin(_a,_b,next){next?.()},
    cleanText(input,max){return String(input??"").trim().slice(0,max||9999)},
    makeHttpError(statusCode,code,message){return Object.assign(new Error(message),{statusCode,code})},
  });
  async function call(method,path,body) {
    const fn=endpoints[method][path];
    assert(fn,"Endpoint missing "+path);
    let output={status:200};
    const response={
      status(code){output.status=code;return response;},
      json(data){output={...output,...data};return response;},
    };
    await fn({
      params:{requestId:id},
      body:body||{},
      firebaseUser:{uid:"approved_lgu_admin"},
    },response);
    return output;
  }
  return {call, rows, id};
}
const path="/api/admin/assistance/requests/:requestId/public-appeal";
const feed="/api/public/assistance/appeals";
test("verified pet request publishes a public, non-monetary appeal with no extra form", async()=>{
  const s=setup();
  const published=await s.call("post",path,{action:"publish"});
  assert.equal(published.ok,true);
  assert.equal(published.status,"published");
  const result=await s.call("get",feed);
  assert.equal(result.ok,true);
  assert.equal(result.appeals.length,1);
  assert.equal(result.appeals[0].title,"Animal and Pet Welfare Support");
  assert.equal(result.appeals[0].paymentEnabled,false);
  assert.equal(result.appeals[0].publicPhotoUrl,"");
  const output=JSON.stringify(result);
  assert(!output.includes("PRIVATE RESIDENT NAME"));
  assert(!output.includes("PRIVATE HOME STREET"));
  assert(!output.includes("private-evidence.jpg"));
});
test("repeat Publish does not duplicate or rewrite a live appeal",async()=>{
  const s=setup();
  await s.call("post",path,{action:"publish"});
  const second=await s.call("post",path,{action:"publish"});
  assert.equal(second.alreadyPublished,true);
  const data=await s.call("get",feed);
  assert.equal(data.appeals.length,1);
});
test("Close immediately removes the appeal from the public list",async()=>{
  const s=setup();
  await s.call("post",path,{action:"publish"});
  const result=await s.call("post",path,{action:"close"});
  assert.equal(result.status,"closed");
  assert.equal((await s.call("get",feed)).appeals.length,0);
});
test("pending and closed Assistance Requests cannot publish",async()=>{
  for(const value of [setup({verified:false}),setup({sourceOverrides:{status:"assistance_provided"}}),setup({sourceOverrides:{donationCampaignId:"existingCampaign"}})]){
    const result=await value.call("post",path,{action:"publish"});
    assert.equal(result.ok,false);
    assert.equal((await value.call("get",feed)).appeals.length,0);
  }
});
test("only explicit public campaign photo consent permits public photo",async()=>{
  const s=setup({sourceOverrides:{publicCampaignPhotoConsent:true}});
  await s.call("post",path,{action:"publish"});
  assert.equal((await s.call("get",feed)).appeals[0].publicPhotoUrl,"https://example.com/private-evidence.jpg");
});
