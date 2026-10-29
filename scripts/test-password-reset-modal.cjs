"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("The shared Kohen-style reset dialog renders natively and on web with centered dark backdrop",()=>{
  const modal=read("components/auth/PasswordResetModal.tsx");
  const parsed=ts.transpileModule(modal,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
  const errors=(parsed.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,"TypeScript/JSX parser errors: "+errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText,"\n")).join("; "));
  for(const expected of [
    '<Modal visible={visible} transparent animationType="fade"',
    'KeyboardAvoidingView','styles.overlay','styles.dialog','Reset your password',
    'Email Address','Password reset email address','Send Reset Link','Cancel',
    'Close password reset dialog','accessibilityRole="alert"',
    'backgroundColor:"rgba(7,19,25,0.67)"','maxWidth:430',
  ]) assert.ok(modal.includes(expected),"Missing modal requirement "+expected);
  assert.match(modal,/await sendPasswordResetEmail\(auth, cleanEmail\)/);
  assert.match(modal,/const cleanEmail = email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(modal,/if \(busy \|\| complete\) return/);
  assert.match(modal,/if \(!\/\^/);
  assert.match(modal,/code === "auth\/user-not-found"/);
  assert.match(modal,/setComplete\(true\)/);
  assert.match(modal,/if \(!busy\) onClose\(\)/);
  assert.doesNotMatch(modal,/20 minutes|user exists|no account found|window\.alert|window\.confirm/);
});

test("Forgot password on all three login routes OPENS the same dialog without submitting on click",()=>{
  for(const entry of ["app/login.web.tsx","app/login.tsx","app/admin-login.tsx"]){
    const source=read(entry);
    assert.match(source,/import PasswordResetModal from "\.\.\/components\/auth\/PasswordResetModal";/,entry);
    assert.match(source,/const \[resetVisible, setResetVisible\] = useState\(false\)/,entry);
    assert.match(source,/<PasswordResetModal visible=\{resetVisible\} initialEmail=\{email\}/,entry);
    assert.match(source,/onClose=\{\(\) => setResetVisible\(false\)\}/,entry);
    assert.match(source,/setResetVisible\(true\)/,entry);
    assert.doesNotMatch(source,/sendPasswordResetEmail\(/,entry+" must not automatically submit a reset");
    assert.match(source,/PremiumAuthShell active=/,entry);
    assert.match(source,/loginUser/,entry);
  }
  const web=read("app/login.web.tsx");
  const native=read("app/login.tsx");
  const admin=read("app/admin-login.tsx");
  for(const source of [web,native]){
    assert.match(source,/onPress=\{handleForgotPassword\}/);
    assert.match(source,/Continue with Google/);
    assert.match(source,/router\.push\("\/signup"\)/);
    assert.match(source,/AuthFeedback/);
  }
  assert.match(admin,/onPress=\{resetPassword\}/);
  assert.match(admin,/administrative onClose=/);
  assert.match(admin,/profile\.adminStatus !== "suspended"/);
  assert.doesNotMatch(admin,/GoogleAuthProvider|connectGoogleAccountWeb/);
});
