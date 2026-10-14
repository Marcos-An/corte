import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {selectEvidence,refinementTimes,pixelMetrics,cosineDistance,modelPath} from '../desktop/local.mjs';
import {createProject,addAsset,addClip} from '../src/project.mjs';
test('local selection preserves coverage and adds dense evidence around visual changes, not fixed objects',()=>{
 const samples=Array.from({length:200},(_,i)=>({time:i*.5,change:i===75?1:.001,blur:10}));
 const times=selectEvidence(samples,24);assert.ok(times.length<=24);assert.ok(times.includes(0));assert.ok(times.includes(99.5));assert.ok(times.includes(37.5));assert.ok(times.some(t=>Math.abs(t-37.5)===.5));
 assert.ok(times.some(t=>t>70));assert.throws(()=>selectEvidence(samples,1));
});
test('metrics differentiate blank/texture and embedding changes without class labels',()=>{
 const blank={width:4,height:4,channels:3,data:new Uint8Array(48).fill(40)},texture={...blank,data:Uint8Array.from({length:48},(_,i)=>i%6<3?0:255)};
 assert.ok(pixelMetrics(texture).sharpness>pixelMetrics(blank).sharpness);assert.equal(cosineDistance([1,0],[1,0]),0);assert.equal(cosineDistance([1,0],[0,1]),1);
 assert.match(modelPath(),/models/);
});
test('refinement targets proposed source ranges including both borders and retains global overview',()=>{
 const p=addClip(addAsset(createProject(),{id:'a',name:'a.mp4',duration:100,width:640,height:360,hasAudio:false}),'a','c');
 const result=refinementTimes(p,{operations:[{type:'remove_ranges',clipId:'c',ranges:[[35,37]]}]},[{assetId:'a',time:80},{assetId:'a',time:0}],30);
 assert.ok(result.some(f=>f.time===35.25));assert.ok(result.some(f=>f.time===34.5));assert.ok(result.some(f=>f.time===37.5));assert.ok(result.some(f=>f.time===80));assert.ok(result.length<=30);
 assert.deepEqual(refinementTimes(p,{operations:[{type:'update',clipId:'c',volume:.5}]},[],30),[]);
});
test('media output directories cannot escape temporary root or collide through path sanitization',async()=>{
 const {frameDirectory}=await import('../desktop/local.mjs');const root='/tmp/analysis';assert.notEqual(frameDirectory(root,'a/b'),frameDirectory(root,'a_b'));assert.equal(path.dirname(frameDirectory(root,'../../secret')),path.normalize(root));assert.equal(frameDirectory(root,'asset'),frameDirectory(root,'asset'));
});
