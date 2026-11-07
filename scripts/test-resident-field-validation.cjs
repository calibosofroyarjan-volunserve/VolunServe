"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const read = path => fs.readFileSync(path,"utf8");
function transpile(source, modules = {}) {
  const module = {exports:{}};
  const js = ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  new Function("require","module","exports",js)(key=>{
    if(!(key in modules)) throw Error("Unexpected import "+key);
    return modules[key];
  },module,module.exports);
  return module.exports;
}
const barangays=transpile(read("constants/sjdmBarangays.ts"));
const occupations=transpile(read("constants/occupationOptions.ts"));
const guard=transpile(read("lib/requireCompleteResidentRegistration.ts"),{
  "../constants/sjdmBarangays":barangays,
  "../constants/occupationOptions":occupations,
});
const policy=transpile(read("lib/registrationEmailPolicy.ts"),{
  "./disposableEmailDomains.generated":transpile(read("lib/disposableEmailDomains.generated.ts")),
});
const good={
  firstName:"María",middleName:"P.",lastName:"Santos",age:23,
  phoneNumber:"+639171234567",region:"Region III – Central Luzon",
  province:"Bulacan",city:"City of San Jose del Monte",
  barangay:"Muzon Proper",occupationCategory:"Student",
  occupationSpecialization:"College",occupationOther:"",
};
test("valid Filipino personal details and actual SJDM occupation pass",()=>{
  assert.deepEqual(guard.getResidentRegistrationFieldErrors(good),{});
  assert.doesNotThrow(()=>guard.requireCompleteResidentRegistration(good));
  assert.doesNotThrow(()=>guard.requireCompleteResidentRegistration({...good,middleName:""}));
  assert.doesNotThrow(()=>guard.requireCompleteResidentRegistration({...good,phoneNumber:"09171234567"}));
});
test("every missing or invalid personal detail has a specific error and blocks profile creation",()=>{
  const cases=[
    ["firstName",""],["firstName","A"],["firstName","Maria9"],
    ["firstName","M".repeat(81)],["lastName",""],["lastName","S"],
    ["middleName","P9"],["age",17],["age",101],["age",23.4],
    ["phoneNumber","123"],["phoneNumber","+638171234567"],["phoneNumber","09171234"],
  ];
  for(const [key,value] of cases) {
    const sample={...good,[key]:value};
    const errors=guard.getResidentRegistrationFieldErrors(sample);
    assert(errors[key],key+" rejected");
    assert.throws(()=>guard.requireCompleteResidentRegistration(sample),/Step 3/);
  }
});
test("only actual SJDM barangays, occupations and required specializations pass",()=>{
  assert.equal(barangays.SJDM_BARANGAYS.length,62);
  assert.equal(occupations.OCCUPATION_OPTIONS.length,10);
  const cases=[
    ["barangay",""],["barangay","Muzon"],["barangay","Quezon City"],
    ["occupationCategory",""],["occupationCategory","Invented"],
    ["occupationSpecialization","Doctor"],["occupationSpecialization",""],
    ["province","Cavite"],["city","Quezon City"],["region",""],
  ];
  for(const [key,value] of cases) {
    const sample={...good,[key]:value};
    const errors=guard.getResidentRegistrationFieldErrors(sample);
    const expected=key==="province"?"city":key;
    assert(errors[expected],key+" rejected");
    assert.throws(()=>guard.requireCompleteResidentRegistration(sample),/Step 4/);
  }
  assert.throws(()=>guard.requireCompleteResidentRegistration({
    ...good,occupationCategory:"Other (Specify)",
    occupationSpecialization:"",occupationOther:""
  }),/Step 4/);
  assert.doesNotThrow(()=>guard.requireCompleteResidentRegistration({
    ...good,occupationCategory:"Other (Specify)",
    occupationSpecialization:"",occupationOther:"Self-employed baker",
  }));
});
test("Firestore create rules contain official SJDM and occupation lists, not only non-empty fields",()=>{
  const rules=read("firestore.rules");
  const start=rules.indexOf("function validInitialResidentInputs()");
  assert(start>0);
  const end=rules.indexOf("function hasFreshLguCredentialReview()",start);
  assert(end>start);
  const block=rules.slice(start,end);
  assert(block.includes("d.phoneNumber.matches("));
  assert(block.includes("d.barangay in ["));
  for(const item of barangays.SJDM_BARANGAYS) assert(block.includes("'"+item+"'"),item);
  for(const item of occupations.OCCUPATION_OPTIONS) assert(block.includes("'"+item+"'"),item);
  assert(rules.includes("&& validInitialResidentInputs()"));
});
test("known temporary inboxes, malformed emails, Gmail +tag are blocked; real Gmail stays allowed",()=>{
  for(const email of [
    "bad@en2ch.com", "bad@mailinator.com", "bad@sub.yopmail.com",
    "bad+tag@gmail.com", "bad+tag@googlemail.com", "bad@gmail..com",
    "bad@gmail.con", "bad@-gmail.com"
  ]) assert(policy.getRegistrationEmailError(email),email+" must fail");
  for(const email of [
    "person@gmail.com","first.last@gmail.com","person@yahoo.com",
    "person@outlook.com","person@school.edu.ph"
  ]) assert.equal(policy.getRegistrationEmailError(email),null,email+" must remain usable");
});
test("signup screen shows the same per-field errors, retains optional Google and verified email gates",()=>{
  const source=read("components/auth/EmailFirstSignup.tsx");
  for(const field of ["firstName","lastName","middleName","age","phoneNumber",
    "barangay","occupationCategory","occupationSpecialization","occupationOther"]) {
    assert(source.includes("registrationErrors."+field),"visible error "+field);
  }
  assert(source.includes("getResidentRegistrationFieldErrors"));
  assert(source.includes("if (!user.emailVerified)"));
  assert(source.includes("Continue to Email Verification"));
  assert(source.includes("Continue with Google"));
  assert(source.includes("Please agree to the Terms of Use and Privacy Notice"));
  assert(source.includes("Password must be 128 characters or fewer."));
});
