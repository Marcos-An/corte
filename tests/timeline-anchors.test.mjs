import test from 'node:test';import assert from 'node:assert/strict';
import {resolveAnchoredOperations} from '../desktop/timeline-anchors.mjs';
import {createProject,addAsset,addClip,applyPlan} from '../src/project.mjs';
const style={font:'Arial',size:5,color:'#ffffff',position:'top',preset:'outline',enter:'fade',exit:'fade'};
const fixture=()=>{
 let p=addAsset(createProject(),{id:'a',name:'Fala',duration:40,width:1080,height:1920,hasAudio:true});
 p=addAsset(p,{id:'b',name:'Fachada',duration:20,width:1080,height:1920,hasAudio:false});
 p=addAsset(p,{id:'img',name:'Melona.png',kind:'image',duration:5,width:600,height:600,hasAudio:false});
 p=addClip(addClip(p,'a','c'),'b','d');
 const words=[['oi',1,1.4],['essa',7.58,7.8],['bebida',7.8,8.22],['verde',9.36,10.2],['radioativo',10.2,11.08],['mas',11.26,11.52],['melão',20,20.6]].map(([text,start,end])=>({text,start,end}));
 return {p,transcripts:[{assetId:'a',words}]};
};
const visual={x:50,y:50,width:100,rotation:0,opacity:100};
const result=(ops,coverage=ops.map((_,i)=>({request:'r'+i,kind:'composition',status:'planned',operationIndexes:[i],reason:'m'})))=>({plan:{summary:'s',questions:[],unsupported:[],operations:ops},pendingRequests:[],coverage});
const near=(a,b)=>Math.abs(a-b)<1e-6;
test('an overlay anchored to words lands where those words play after earlier cuts',()=>{
 const {p,transcripts}=fixture(),ops=[{type:'remove_ranges',clipId:'c',ranges:[[0,5]]},{type:'place_overlay',anchor:{clipId:'c',from:3,to:4},layer:{id:'manga',assetId:'b',in:2,...visual}}];
 const out=resolveAnchoredOperations(p,result(ops),transcripts),[,op]=out.plan.operations;
 assert.equal(op.type,'add_video');assert.ok(near(op.layer.start,4.36)&&near(op.layer.end,6.08),JSON.stringify(op.layer));assert.equal(op.layer.in,2);assert.equal(op.layer.assetId,'b');
 assert.doesNotThrow(()=>applyPlan(p,out.plan),'the resolved plan is an ordinary valid plan');
});
test('image overlays, speed changes and reordering are all followed',()=>{
 const {p,transcripts}=fixture(),ops=[{type:'update',clipId:'c',speed:2},{type:'move',clipId:'d',index:0},{type:'place_overlay',anchor:{clipId:'c',from:6,to:6},layer:{id:'melona',assetId:'img',in:0,...visual,width:45}}];
 const [, ,op]=resolveAnchoredOperations(p,result(ops),transcripts).plan.operations;
 assert.equal(op.type,'add_image');assert.equal('in' in op.layer,false);assert.ok(near(op.layer.start,20+10)&&near(op.layer.end,20+10.3),JSON.stringify(op.layer));assert.equal(op.layer.width,45);
});
test('text can anchor to a stretch of the original video without speech',()=>{
 const {p,transcripts}=fixture(),ops=[{type:'move',clipId:'d',index:0},{type:'remove_ranges',clipId:'d',ranges:[[0,4]]},{type:'place_text',anchor:{clipId:'d',sourceStart:5,sourceEnd:9},layer:{id:'kokoro',text:'Kokoro — novo restaurante em Dourados',style}}];
 const [, ,op]=resolveAnchoredOperations(p,result(ops),transcripts).plan.operations;
 assert.equal(op.type,'add_text');assert.ok(near(op.layer.start,1)&&near(op.layer.end,5));assert.equal(op.layer.text,'Kokoro — novo restaurante em Dourados');
});
test('a stretch partly removed by a cut snaps to what remains; fully removed or misordered anchors are rejected',()=>{
 const {p,transcripts}=fixture(),place=anchor=>({type:'place_overlay',anchor,layer:{id:'x',assetId:'b',in:0,...visual}});
 const [,snap]=resolveAnchoredOperations(p,result([{type:'remove_ranges',clipId:'c',ranges:[[9,10]]},place({clipId:'c',from:3,to:4})]),transcripts).plan.operations;
 assert.ok(near(snap.layer.start,9)&&near(snap.layer.end,10.08),JSON.stringify(snap.layer));
 assert.throws(()=>resolveAnchoredOperations(p,result([{type:'remove_ranges',clipId:'c',ranges:[[9,12]]},place({clipId:'c',from:3,to:4})]),transcripts),/removid/i);
 assert.throws(()=>resolveAnchoredOperations(p,result([place({clipId:'c',from:3,to:4}),{type:'remove_ranges',clipId:'c',ranges:[[0,5]]}]),transcripts),/depois/i);
 assert.throws(()=>resolveAnchoredOperations(p,result([place({clipId:'c',from:3,to:9})]),transcripts),/palavras/i);
 assert.throws(()=>resolveAnchoredOperations(p,result([{type:'place_overlay',anchor:{clipId:'c',from:3,to:4},layer:{id:'x',assetId:'b',in:19,...visual}}]),transcripts),/fonte/i);
 assert.throws(()=>resolveAnchoredOperations(p,result([place({clipId:'zz',sourceStart:1,sourceEnd:2})]),transcripts),/trecho/i);
});
test('plans without anchored operations pass through untouched',()=>{
 const {p,transcripts}=fixture(),plain=result([{type:'set_aspect',aspect:'9:16'}]);
 assert.equal(resolveAnchoredOperations(p,plain,transcripts),plain);
});
test('a source still covers a longer anchored speech without stretching moving overlays',()=>{
 const {p,transcripts}=fixture();const layer={id:'poster',assetId:'b',in:19,...visual};
 const op={type:'place_still',anchor:{clipId:'c',sourceStart:1,sourceEnd:12},layer};
 const resolved=resolveAnchoredOperations(p,result([op]),transcripts);const q=applyPlan(p,resolved.plan);
 assert.equal(q.videoLayers[0].freeze,true);assert.equal(q.videoLayers[0].end-q.videoLayers[0].start,11);
 assert.throws(()=>resolveAnchoredOperations(p,result([{...op,type:'place_overlay'}]),transcripts));
 assert.throws(()=>resolveAnchoredOperations(p,result([{...op,layer:{...layer,in:20}}]),transcripts));
});
