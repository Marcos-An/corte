import test from 'node:test';import assert from 'node:assert/strict';
import {createProject,addAsset,addClip,applyPlan,planLineage,duration,History} from '../src/project.mjs';
import {parseReviewPayload} from '../desktop/ai.mjs';import {resolveAnchoredOperations} from '../desktop/timeline-anchors.mjs';
const fixture=()=>addClip(addClip(addAsset(createProject(),{id:'v',name:'Restaurant',duration:20,width:640,height:360,hasAudio:true}),'v','c'),'v','d');
const plan=operations=>({summary:'Montagem',operations,questions:[],unsupported:[]});
test('an interval becomes the opening without duplicating, losing or resurrecting source footage',()=>{
 const p=fixture(),before=structuredClone(p),run=planLineage(p,plan([{type:'remove_ranges',clipId:'c',ranges:[[7,8]]},{type:'move_range',clipId:'c',sourceStart:5,sourceEnd:10,index:0}]));
 assert.deepEqual(run.project.clips.slice(0,2).map(c=>[c.in,c.out]),[[5,7],[8,10]]);assert.equal(duration(run.project),39);
 assert.deepEqual(p,before);assert.ok(run.project.clips.filter(c=>run.origin(c.id)==='c').every(c=>c.out<=7||c.in>=8));
 const history=new History(p);history.commit(run.project);assert.deepEqual(history.undo(),p);
 for(const patch of [{sourceStart:-1},{sourceEnd:100},{index:99},{clipId:'unknown'},{sourceStart:1,sourceEnd:1.001}])assert.throws(()=>applyPlan(p,plan([{type:'move_range',clipId:'c',sourceStart:5,sourceEnd:10,index:0,...patch}])));
});
test('new imported footage and narration can be placed atomically and referenced later',()=>{
 let p=fixture();p=addAsset(p,{id:'voice',name:'VO',kind:'audio',duration:8,width:0,height:0,hasAudio:true});
 const ops=[{type:'insert_clip',index:0,clip:{id:'opening',assetId:'v',in:12,out:15,volume:0,crop:{x:0,y:0,w:1,h:1}}},{type:'update',clipId:'opening',adjustments:{brightness:.02,contrast:1.04,saturation:1.03}},
 {type:'add_audio',track:{id:'vo',assetId:'voice',in:0,out:8,start:0,volume:1,role:'narration',fadeIn:.1,fadeOut:.2}}];
 const q=applyPlan(p,plan(ops));assert.equal(q.clips[0].id,'opening');assert.equal(q.music[0].role,'narration');assert.equal(q.music[0].out,8);
 for(const bad of [{...ops[0],clip:{...ops[0].clip,id:'c'}},{...ops[0],clip:{...ops[0].clip,assetId:'unimported'}},{...ops[2],track:{...ops[2].track,assetId:'v'}}])assert.throws(()=>applyPlan(p,plan([bad])));
});
test('a source anchor cannot stretch across unrelated footage after partial reordering',()=>{
 const p=fixture(),ops=[{type:'move_range',clipId:'c',sourceStart:5,sourceEnd:10,index:3},{type:'place_text',anchor:{clipId:'c',sourceStart:2,sourceEnd:12},layer:{id:'t',text:'Kokoro',style:{font:'Arial',size:5,color:'#ffffff',position:'bottom',preset:'clean'}}}];
 assert.throws(()=>resolveAnchoredOperations(p,{plan:plan(ops)},[]),/separada|reordenada/);
});
test('review coverage recognises partial reordering as an actual order operation',()=>{
 const p=fixture(),op={type:'move_range',clipId:'c',sourceStart:5,sourceEnd:10,index:0};
 assert.doesNotThrow(()=>parseReviewPayload(p,JSON.stringify({plan:plan([op]),pendingRequests:[],coverage:[{request:'Abrir pela fachada',kind:'order',status:'planned',operationIndexes:[0],reason:'Fachada no intervalo selecionado'}]}),{stage:1}));
});
