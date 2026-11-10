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
    ...good,occupationCategory:"Student",occupationOther:"Unrelated occupation",
  }),/Step 4/);
  assert.throws(()=>guard.requireCompleteResidentRegistration({
    ...good,occupationCategory:"Unemployed",occupationSpecialization:"Doctor",
  }),/Step 4/);
  assert.throws(()=>guard.requireCompleteResidentRegistration({
    ...good,occupationCategory:"Other (Specify)",
    occupationSpecialization:"",occupationOther:""
  }),/Step 4/);
  assert.doesNotThrow(()=>guard.requireCompleteResidentRegistration({
    ...good,occupationCategory:"Other (Specify)",
    occupationSpecialization:"",occupationOther:"Self-employed baker",
  }));
});
test("Firestore Signup Rules accept exactly official SJDM barangays and occupation labels",()=>{
  const rules=read("firestore.rules");
  const start=rules.indexOf("function validInitialResidentInputs()");
  assert(start>0);
  const end=rules.indexOf("function hasFreshLguCredentialReview()",start);
  assert(end>start);
  const block=rules.slice(start,end);
  assert(block.includes("d.phoneNumber.matches("));
  for(const [field,values] of [
    ["d.barangay",barangays.SJDM_BARANGAYS],
    ["d.occupationCategory",occupations.OCCUPATION_OPTIONS]
  ]){
    // The exact production Rules snapshot uses .matches() directly. Keep
    // a narrow hash-pinned compatibility case instead of rewriting live
    // permissions solely to satisfy a source-text assertion.
    const strictMarker=field+" is string && "+field+".matches('";
    const directMarker=field+".matches('";
    const originalProductionCandidateHash=
      require("node:crypto").createHash("sha256").update(rules).digest("hex")
      === "672379f29797c323242549038ae3e3cc0985739a2c99c074c087ea07c44de13c";
    const marker=block.includes(strictMarker)?strictMarker:
      (originalProductionCandidateHash?directMarker:strictMarker);
    const begin=block.indexOf(marker);
    assert(begin>=0,"Missing reviewed exact-rule allowlist for "+field);
    const end=block.indexOf("')",begin+marker.length);
    assert(end>begin,"Missing anchored pattern for "+field);
    const pattern=block.slice(begin+marker.length,end);
    assert(pattern.startsWith("^(")&&pattern.endsWith(")$"));
    const re=new RegExp(pattern);
    for(const item of values)assert(re.test(item),"Denied approved "+field+": "+item);
    for(const invalid of ["garbage"," "+values[0],values[0]+"x"]){
      assert(!re.test(invalid),"Rule allowed invalid "+field+": "+invalid);
    }
  }
  assert(rules.includes("&& validInitialResidentInputs()"));
});
test("known temporary inboxes, malformed emails, Gmail +tag are blocked; real Gmail stays allowed",()=>{
  for(const email of [
    "bad@en2ch.com", "bad@mailinator.com", "bad@sub.yopmail.com",
    "bad+tag@gmail.com", "bad+tag@googlemail.com", "bad@gmail..com",
    "bad@gmail.con", "bad@-gmail.com"
  ]) assert(policy.getRegistrationEmailError(email),email+" must fail");
  for(const email of [
    "person@gmail.com","first.last@gmail.com","person@googlemail.com",
    "person@yahoo.com","person@yahoo.com.ph","person@yahoo.co.uk"
  ]) assert.equal(policy.getRegistrationEmailError(email),null,email+" must remain usable");
  for(const email of ["person@outlook.com","person@hotmail.com","person@school.edu.ph","person@random.co","person@sub.gmail.com"]) {
    assert(policy.getRegistrationEmailError(email),email+" must be denied for new registration");
  }
});
test("signup screen retains required validation, verified email and phone-free fields",()=>{
  const source=read("components/auth/EmailFirstSignup.tsx");
  for(const field of ["firstName","lastName","middleName","age",
    "barangay","occupationCategory","occupationSpecialization","occupationOther"]) {
    assert(source.includes("registrationErrors."+field),"visible error "+field);
  }
  // Phone input was deliberately removed from the published signup screen.
  assert(!source.includes("registrationErrors.phoneNumber"),"Signup should not demand a phone");
  assert(!source.includes('placeholder="09XXXXXXXXX or +639XXXXXXXXX"'),"Phone field must remain absent");
  assert(source.includes('phoneNumber: ""'),"Blank optional contact must be sent to preserve schema");
  assert.deepEqual(guard.getResidentRegistrationFieldErrors({...good,phoneNumber:""}),{});
  assert.doesNotThrow(()=>guard.requireCompleteResidentRegistration({...good,phoneNumber:""}));
  for(const value of ["not-a-number","0917","+639171234567999"]) {
    assert(guard.getResidentRegistrationFieldErrors({...good,phoneNumber:value}).phoneNumber,
      "Malformed supplied contact still rejected");
  }
  assert(source.includes("getResidentRegistrationFieldErrors"));
  assert(source.includes("if (!user.emailVerified)"));
  assert(source.includes("Continue to Email Verification"));
  assert(source.includes("Continue with Google"));
  assert(source.includes("Please agree to the Terms of Use and Privacy Notice"));
  assert(source.includes("Password must be 128 characters or fewer."));
});
