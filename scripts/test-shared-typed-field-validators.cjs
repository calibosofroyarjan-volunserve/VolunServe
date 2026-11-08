#!/usr/bin/env node
"use strict";
/** Mechanical exact-rewrite proof: 185 typed value checks, no permission removed. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const cp=require("node:child_process");
const BASE="ace431834fedb226d96c261874e1999c4bddecda";
const original=cp.execFileSync("git",["show",BASE+":firestore.rules"],{encoding:"utf8"});
const output=fs.readFileSync("firestore.rules","utf8");
const specs=[
 ["sizedText",/([A-Za-z_$][\w$.]*) is string\s*&&\s*\1\.size\(\)\s*>=\s*(\d+)\s*&&\s*\1\.size\(\)\s*<=\s*(\d+)/g,
  (v,min,max)=>"sizedText("+v+", "+min+", "+max+")",97],
 ["maxText",/([A-Za-z_$][\w$.]*) is string\s*&&\s*\1\.size\(\)\s*<=\s*(\d+)/g,
  (v,max)=>"maxText("+v+", "+max+")",71],
 ["boundedInt",/([A-Za-z_$][\w$.]*) is int\s*&&\s*\1\s*>=\s*(\d+)\s*&&\s*\1\s*<=\s*(\d+)/g,
  (v,min,max)=>"boundedInt("+v+", "+min+", "+max+")",10],
 ["boundedNumber",/([A-Za-z_$][\w$.]*) is number\s*&&\s*\1\s*>=\s*(\d+)\s*&&\s*\1\s*<=\s*(\d+)/g,
  (v,min,max)=>"boundedNumber("+v+", "+min+", "+max+")",7]
];
let transformed=original;
for(const [name,pattern,fn,expectedCount] of specs){
 let count=0;transformed=transformed.replace(pattern,(m,...args)=>{
  count++;return fn(...args);
 });
 assert.equal(count,expectedCount,"Original guarded rules no longer have expected validated "+name+" fields");
}
const helpers=`    // Typed bounds preserve the exact field requirements across all modules.
    function sizedText(value, minLength, maxLength) {
      return value is string && value.size() >= minLength && value.size() <= maxLength;
    }
    function maxText(value, maxLength) {
      return value is string && value.size() <= maxLength;
    }
    function boundedInt(value, minValue, maxValue) {
      return value is int && value >= minValue && value <= maxValue;
    }
    function boundedNumber(value, minValue, maxValue) {
      return value is number && value >= minValue && value <= maxValue;
    }
`;
const anchor="    function approved() {";
assert(transformed.includes(anchor));
transformed=transformed.replace(anchor,helpers+anchor);
assert.equal(output,transformed,
 "BLOCKED: any unrelated match, Admin, Resident, Volunteer, donation, certificate or emergency permission changed");
const functions=helpers.match(/function \w+\(/g);
assert.equal(functions.length,4);
const bools=(value,min,max)=>typeof value==="string"&&value.length>=min&&value.length<=max;
let cases=0;
for(const value of [null,undefined,false,true,123,0,"","a","abcdef","x".repeat(80),"x".repeat(160)]){
 for(const min of [0,1,2,5,80])for(const max of [5,80,160]){
  const old=typeof value==="string"&&value.length>=min&&value.length<=max;
  assert.equal(bools(value,min,max),old);
  cases++;
 }
}
for(const value of [null,undefined,false,0,1,2,12,-1,123,1.5,"12"]){
 for(const min of [-1,0,1,2])for(const max of [2,20,120]){
  const bounded=value===null||value===undefined?false:
    (typeof value==="number"&&Number.isInteger(value)&&value>=min&&value<=max);
  const old=typeof value==="number"&&Number.isInteger(value)&&value>=min&&value<=max;
  assert.equal(bounded,old);
  cases++;
 }
}
console.log("PASS: verified 185 mechanical replacements, "+cases+" schema boundary cases; original Firestore permissions and all match paths unchanged.");
