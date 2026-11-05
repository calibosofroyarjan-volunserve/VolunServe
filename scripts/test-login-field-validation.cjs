"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), ts = require("typescript");
const moduleBox = {exports:{}};
const js = ts.transpileModule(fs.readFileSync("lib/loginInputValidation.ts","utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function("module","exports",js)(moduleBox,moduleBox.exports);
const {getLoginEmailError:getError,getLoginEmailSuggestion:getHint} = moduleBox.exports;
const tests = [
  ["blank email",()=>assert.match(getError(""),/Enter your email/)],
  ["malformed domain",()=>assert.match(getError("user@gmail.."),/complete email/)],
  ["missing at",()=>assert.match(getError("user.gmail.com"),/complete email/)],
  ["invalid spaces",()=>assert.match(getError("user @gmail.com"),/complete email/)],
  ["Gmail",()=>assert.equal(getError("user@gmail.com"),null)],
  ["Yahoo Philippines",()=>assert.equal(getError("user@yahoo.com.ph"),null)],
  ["Outlook",()=>assert.equal(getError("user@outlook.com"),null)],
  ["business country-code domain",()=>assert.equal(getError("user@business.co"),null)],
  ["Gmail typo hints",()=>assert.match(getHint("user@gmail.co"),/@gmail.com/)],
  ["Outlook typo hints",()=>assert.match(getHint("user@outlook.con"),/@outlook.com/)],
  ["typo never blocks existing login",()=>assert.equal(getError("user@gmail.co"),null)],
  ["unknown provider never blocked",()=>assert.equal(getError("user@custom-provider.co"),null)],
];
for(const path of ["app/login.web.tsx","app/login.tsx"]){
  const s=fs.readFileSync(path,"utf8");
  tests.push([path+" inline error UI",()=>{assert(s.includes("inlineEmailError"));assert(s.includes("inlinePasswordError"));assert(s.includes("styles.invalidInput"));assert(s.includes("Check your sign-in details"));}]);
  tests.push([path+" preserves auth routes",()=>{for(const key of ["homeRouteForProfile","handleGoogleLogin","PasswordResetDialog","PremiumAuthShell"])assert(s.includes(key));}]);
}
let count=0;for(const [name,fn] of tests){fn();count++;console.log("PASS "+name);}
console.log(count+" Login validation tests passed");
