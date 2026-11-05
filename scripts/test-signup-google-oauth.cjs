"use strict";
// Exercise the actual native helper with the installed Expo contract, no network.
const assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
function harness(options={}){
 const calls=[];let configuration;
 const request=options.noRequest?null:{clientId:"same-native-client",redirectUri:"same-production-scheme://",codeVerifier:options.noVerifier?undefined:"private-pkce-verifier"};
 const sdk={makeRedirectUri:()=>"same-production-scheme://",exchangeCodeAsync:async(config,discovery)=>{calls.push("exchange");assert.equal(config.clientId,request.clientId);assert.equal(config.redirectUri,request.redirectUri);assert.equal(config.code,"one-time-code");assert.equal(config.extraParams.code_verifier,request.codeVerifier);assert.equal(discovery.tokenEndpoint,"https://oauth2.googleapis.com/token");if(options.exchangeError)throw Error("Exchange failed");return {idToken:options.noExchangeToken?undefined:"exchanged-id-token"};}};
 const imports={"expo-auth-session":sdk,"expo-auth-session/providers/google":{discovery:{tokenEndpoint:"https://oauth2.googleapis.com/token"},useAuthRequest:config=>{configuration=config;return [request,null,async()=>{calls.push("prompt");return options.result||{type:"success",params:{code:"one-time-code"}};}];}},"expo-web-browser":{maybeCompleteAuthSession:()=>{}},"firebase/auth":{GoogleAuthProvider:{credential:token=>{calls.push("credential");assert(token);return {token};}},signInWithCredential:async(_auth,credential)=>{calls.push("firebase");return {user:{uid:"same-google-uid",token:credential.token}};}},"./firebase":{auth:{}}};
 const module={exports:{}};const js=ts.transpileModule(fs.readFileSync("lib/useSignupGoogle.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function("require","module","exports",js)(name=>{assert(name in imports,"Unexpected import "+name);return imports[name];},module,module.exports);
 return {signIn:module.exports.useSignupGoogle(),calls,config:()=>configuration};
}
(async()=>{
 let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log("PASS "+name);};
 await check("native authorization code is explicitly exchanged with PKCE exactly once",async()=>{const h=harness();assert.equal(h.config().shouldAutoExchangeCode,false);assert.equal((await h.signIn()).token,"exchanged-id-token");assert.deepEqual(h.calls,["prompt","exchange","credential","firebase"]);});
 for(const [name,result] of [["ID token",{type:"success",params:{id_token:"id-token"}}],["authentication ID token",{type:"success",params:{},authentication:{idToken:"id-token"}}]])await check(name+" response needs no code exchange",async()=>{const h=harness({result});assert.equal((await h.signIn()).token,"id-token");assert(!h.calls.includes("exchange"));});
 for(const [name,options] of [["cancel",{result:{type:"cancel"}}],["dismiss",{result:{type:"dismiss"}}],["provider denial",{result:{type:"error",params:{error:"access_denied"}}}],["missing PKCE verifier",{noVerifier:true}],["exchange failure",{exchangeError:true}],["exchange missing ID token",{noExchangeToken:true}],["success without token or code",{result:{type:"success",params:{}}}],["request not loaded",{noRequest:true}]])await check(name+" cannot sign in to Firebase",async()=>{const h=harness(options);await assert.rejects(h.signIn());assert(!h.calls.includes("firebase"));});
 console.log(passed+" native Google OAuth regression cases passed");
})().catch(error=>{console.error(error);process.exitCode=1;});
