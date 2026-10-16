import test from 'node:test';import assert from 'node:assert/strict';
import {createProject,addAsset,addClip,applyPlan,editProject,planLineage} from '../src/project.mjs';
import {requestHybridEdit} from '../desktop/hybrid.mjs';
import {resolveAnchoredOperations} from '../desktop/timeline-anchors.mjs';
import {parseReviewPayload} from '../desktop/ai.mjs';
import {removeTimelineRange} from '../src/range-selection.mjs';
import {buildSegmentArgs,transitionSegment} from '../desktop/media.mjs';
const two=()=>addClip(addClip(addAsset(createProject(),{id:'a',name:'v',duration:10,width:320,height:240,hasAudio:true}),'a','c'),'a','d');
const plan=operations=>({summary:'s',questions:[],unsupported:[],operations});
test('applyPlan reports which original clip every piece came from',()=>{
 const {project,origin}=planLineage(two(),plan([{type:'remove_ranges',clipId:'c',ranges:[[1,2]]},{type:'remove_ranges',clipId:'d',ranges:[[5,6]]}]));
 assert.deepEqual(project.clips.map(c=>origin(c.id)),['c','c','d','d']);
});
test('another clip of the same source cannot hide an unsafe cut through regenerated ids',async()=>{
 const out=await requestHybridEdit({project:two(),prompt:'Cortes',shareEvidence:true,registry:new Map([['a',{path:'/x.mp4'}]]),connected:async()=>true,transcribe:async()=>[{assetId:'a',words:[],gaps:[{start:5,end:6,reason:'unreliable-word-times'}]}],
  planRequest:async()=>({plan:plan([{type:'remove_ranges',clipId:'c',ranges:[[1,2]]},{type:'remove_ranges',clipId:'d',ranges:[[5,6]]}]),pendingRequests:[],frames:1})});
 assert.deepEqual(out.plan.operations,[]);
});
test('an anchor never spills into pieces of another clip that shares the source',()=>{
 const p=two(),ops=[{type:'remove_ranges',clipId:'d',ranges:[[2,3]]},{type:'place_text',anchor:{clipId:'c',sourceStart:5,sourceEnd:6},layer:{id:'t',text:'x',style:{font:'Arial',size:5,color:'#ffffff',position:'top',preset:'outline',enter:'fade',exit:'fade'}}}];
 const [,text]=resolveAnchoredOperations(p,{plan:plan(ops),coverage:[]},[]).plan.operations;assert.equal(text.layer.start,5);assert.equal(text.layer.end,6);
});
test('a transition between two generated pieces is recognised as kept',()=>{
 const p=addClip(addAsset(createProject(),{id:'a',name:'v',duration:10,width:320,height:240,hasAudio:true}),'a','c'),ops=[{type:'keep_ranges',clipId:'c',ranges:[[1,3],[4,6],[7,9]]},{type:'set_transition_at',index:1,effect:'dissolve',duration:.2}];
 assert.doesNotThrow(()=>parseReviewPayload(p,JSON.stringify({plan:plan(ops),pendingRequests:[],coverage:[{request:'c',kind:'cut',status:'planned',operationIndexes:[0],reason:'m'},{request:'t',kind:'transition',status:'planned',operationIndexes:[1],reason:'m'}]})));
});
test('a tiny adjusted range is adjusted, never cut out',()=>{
 const q=applyPlan(two(),plan([{type:'adjust_ranges',clipId:'c',ranges:[[2,2.01]],patch:{speed:2}}])),pieces=q.clips.filter(c=>c.id!=='d');
 assert.equal(pieces.at(0).in,0);assert.equal(pieces.at(-1).out,10);for(let i=1;i<pieces.length;i++)assert.equal(pieces[i].in,pieces[i-1].out,'no source time is lost');
});
test('a transition window continues the clip zoom instead of restarting it',()=>{
 const p=two(),c={...p.clips[0],zoom:{from:1,to:2}},window=transitionSegment(c,9,10);
 assert.ok(Math.abs(window.zoom.from-1.9)<1e-9&&window.zoom.to===2);assert.match(buildSegmentArgs(window,p.assets[0],'i.mp4','o.mp4','9:16').join(' '),/zoompan=z='1\.9\+0\.1\*min\(1,it\/1\)'/);
});
test('a timeline selection over a frozen frame shortens or removes the still',()=>{
 const frozen=editProject(addClip(addAsset(createProject(),{id:'a',name:'v',duration:4,width:320,height:240,hasAudio:true}),'a','c'),{type:'freeze',clipId:'c',time:2,duration:2});
 const shorter=removeTimelineRange(frozen,2.5,3);assert.equal(shorter.clips[1].freeze,1.5);
 const gone=removeTimelineRange(frozen,2,4);assert.ok(!gone.clips.some(c=>c.freeze));
});
test('freezing keeps the zoom the frame had at that instant',()=>{
 const p=editProject(addClip(addAsset(createProject(),{id:'a',name:'v',duration:4,width:320,height:240,hasAudio:true}),'a','c'),{type:'update',clipId:'c',zoom:{from:1.5,to:1.5}});
 assert.deepEqual(editProject(p,{type:'freeze',clipId:'c',time:2,duration:1}).clips[1].zoom,{from:1.5,to:1.5});
});
test('reviewer cases: a cut in another file, a transition after a multi-range cut, split-and-move anchors',async()=>{
 let p=addAsset(addAsset(createProject(),{id:'a',name:'a',duration:10,width:320,height:240,hasAudio:true}),{id:'b',name:'b',duration:10,width:320,height:240,hasAudio:true});p=addClip(addClip(p,'b','X'),'a','Y');
 const out=await requestHybridEdit({project:p,prompt:'Cortes',shareEvidence:true,registry:new Map([['a',{path:'/a.mp4'}],['b',{path:'/b.mp4'}]]),connected:async()=>true,transcribe:async()=>[{assetId:'a',words:[],gaps:[{start:6,end:7,reason:'unreliable-word-times'}]}],
  planRequest:async()=>({plan:plan([{type:'remove_ranges',clipId:'X',ranges:[[2,3]]},{type:'remove_ranges',clipId:'Y',ranges:[[5,8]]}]),pendingRequests:[],frames:1})});
 assert.deepEqual(out.plan.operations,[]);
 const one=addClip(addAsset(createProject(),{id:'a',name:'v',duration:10,width:320,height:240,hasAudio:true}),'a','c'),ops=[{type:'remove_ranges',clipId:'c',ranges:[[2,3],[5,6]]},{type:'set_transition_at',index:1,effect:'dissolve',duration:.3}];
 assert.doesNotThrow(()=>parseReviewPayload(one,JSON.stringify({plan:plan(ops),pendingRequests:[],coverage:[{request:'c',kind:'cut',status:'planned',operationIndexes:[0],reason:'m'},{request:'t',kind:'transition',status:'planned',operationIndexes:[1],reason:'m'}]})));
 const ab=addClip(addClip(addAsset(createProject(),{id:'a',name:'v',duration:10,width:320,height:240,hasAudio:true}),'a','A'),'a','B');
 const [, ,text]=resolveAnchoredOperations(ab,{plan:plan([{type:'split',clipId:'B',time:5},{type:'move',clipId:'A',index:1},{type:'place_text',anchor:{clipId:'A',sourceStart:6,sourceEnd:7},layer:{id:'t',text:'x',style:{font:'Arial',size:5,color:'#ffffff',position:'top',preset:'outline',enter:'fade',exit:'fade'}}}]),coverage:[]},[]).plan.operations;
 assert.ok(Math.abs(text.layer.start-11)<1e-6&&Math.abs(text.layer.end-12)<1e-6,JSON.stringify(text.layer));
});
test('updates naming a clip never touch its frozen frame',()=>{
 const p=addClip(addAsset(createProject(),{id:'a',name:'v',duration:6,width:320,height:240,hasAudio:true}),'a','c');
 for(const later of [{type:'update',clipId:'c',speed:1.5},{type:'adjust_ranges',clipId:'c',ranges:[[3,5]],patch:{speed:2}}]){const q=applyPlan(p,plan([{type:'freeze_frame',clipId:'c',time:4,duration:1},later]));assert.equal(q.clips.find(c=>c.freeze).speed,undefined);}
});
