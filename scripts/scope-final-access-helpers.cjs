"use strict";
/**
 * Localize unchanged role helpers only inside the collection match blocks that
 * actually call them. Exact reversible transformation, NO deployment or data writes.
 */
const fs=require("node:fs");
const crypto=require("node:crypto");
const assert=require("node:assert/strict");
const [infile,outfile]=process.argv.slice(2);
if(!infile||!outfile)throw Error("Usage: node scope-additional-role-helpers.cjs <input.rules> <output.rules>");
const original=fs.readFileSync(infile,"utf8");
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
let data=original;
const names=["isAdmin","hasResidentAccess","hasVolunteerAccess"];
const summaries=[];
function braceDelta(line) {
  let quoted=null,escaped=false,delta=0;
  for (let i=0;i<line.length;i++) {
    const ch=line[i];
    if(quoted) {
      if(escaped){escaped=false;continue}
      if(ch==="\\"){escaped=true;continue}
      if(ch===quoted)quoted=null;
      continue;
    }
    if(ch==="'"||ch==='"'){quoted=ch;continue}
    if(ch==="/"&&line[i+1]==="/")break;
    if(ch==="{")delta++;
    if(ch==="}")delta--;
  }
  return delta;
}
function extractFunction(text,name){
  const signature="    function "+name+"() {";
  assert.equal(text.split(signature).length-1,1,"Expected one root definition of "+name);
  const start=text.indexOf(signature), open=start+signature.length-1;
  let depth=0,quoted=null,escaped=false,lineComment=false,close=-1;
  for(let i=open;i<text.length;i++){
    const ch=text[i];
    if(lineComment){if(ch==="\n")lineComment=false;continue}
    if(quoted){
      if(escaped){escaped=false;continue}
      if(ch==="\\"){escaped=true;continue}
      if(ch===quoted)quoted=null;
      continue;
    }
    if(ch==="'"||ch==='"'){quoted=ch;continue}
    if(ch==="/"&&text[i+1]==="/"){lineComment=true;i++;continue}
    if(ch==="{")depth++;
    if(ch==="}"){
      depth--;
      if(depth===0){close=i+1;break}
    }
  }
  assert.ok(close>open&&close-start<1000,"Could not identify root function end: "+name);
  assert.match(text.slice(close),/^\r?\n/,"Root helper not on an isolated line");
  close+=text[close]==="\r"?2:1;
  const block=text.slice(start,close);
  assert.ok(block.includes("return "),"Root helper return predicate missing");
  return {start,end:close,block};
}
function move(text,name){
  const {start,end,block}=extractFunction(text,name);
  const removed=text.slice(0,start)+text.slice(end);
  const lines=removed.match(/[^\n]*\n|[^\n]+$/g)||[];
  const calls=[],stack=[];let depth=0;
  const reference=new RegExp("\\b"+name+"\\s*\\(");
  for(let i=0;i<lines.length;i++){
    const line=lines[i].replace(/\r?\n$/,"");
    const match=line.match(/^[ \t]*match (.+?) \{[ \t]*$/);
    if(match)stack.push({path:match[1],header:i,depth:depth+1});
    if(reference.test(line)&&!line.trim().startsWith("//")){
      const current=stack[stack.length-1];
      assert.ok(current&&stack.length>=2,"Root helper caller outside collection match: "+name+" at "+(i+1));
      calls.push({line:i+1,header:current.header,path:current.path});
    }
    depth+=braceDelta(line);
    assert.ok(depth>=0,"Malformed Rules scope braces");
    while(stack.length&&stack[stack.length-1].depth>depth)stack.pop();
  }
  assert.equal(depth,0,"Malformed rules braces");
  const at=[...new Set(calls.map(x=>x.header))];
  assert.ok(at.length>=3&&at.length<80,"Unexpected usage count for "+name+": "+at.length);
  const body=block.replace(/\r?\n$/,"").split(/\r?\n/).map(x=>"    "+x).join("\n")+"\n";
  const injected="      // Unchanged localized "+name+" from root scope.\n"+body;
  for(const index of [...at].sort((a,b)=>b-a)){
    assert.ok(lines[index].includes("match /"),"Invalid helper injection target");
    lines.splice(index+1,0,injected);
  }
  const scoped=lines.join("");
  assert.equal(scoped.split(injected).length-1,at.length,"Injection count mismatch");
  const reverted=scoped.split(injected).join("");
  assert.equal(reverted,removed,"Non-helper Rules changed");
  assert.equal(reverted.slice(0,start)+block+reverted.slice(start),text,"Original policy not reversible");
  summaries.push({name,match_blocks:at.length,calls:calls.length});
  return scoped;
}
for(const name of names)data=move(data,name);
assert.ok(data.includes("function isSuperAdmin()"),"Prior Super Admin helper lost");
fs.writeFileSync(outfile,data);
console.log("PASS exact-reversible role helper localization",JSON.stringify(summaries));
console.log("PASS no allow conditions or other collections modified.");
console.log("PREVIOUS_SOURCE_SHA256",sha(original));
console.log("OPTIMIZED_SOURCE_SHA256",sha(data));
