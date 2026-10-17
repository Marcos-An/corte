import test from 'node:test';import assert from 'node:assert/strict';import {createProject,addAsset,addClip,applyPlan} from '../src/project.mjs';import {parseReviewPayload} from '../desktop/ai.mjs';import {requestHybridEdit} from '../desktop/hybrid.mjs';
const project=addClip(addAsset(createProject(),{id:'a',name:'Source',duration:30,width:320,height:240,hasAudio:true}),'a','c');
const style={font:'Arial',size:5,color:'#ffffff',position:'bottom',preset:'clean'};
const item=(request,kind,operationIndexes)=>({request,kind,operationIndexes,status:'planned',reason:'Evidence'});
test('one uncertain cut no longer discards safe edits; source anchors are rebased and absolute timings are deferred',async()=>{
 const operations=[{type:'remove_ranges',clipId:'c',ranges:[[1,2],[5,6]]},{type:'update',clipId:'c',adjustments:{brightness:.03,contrast:1.03,saturation:1.02}},
  {type:'place_text',anchor:{clipId:'c',sourceStart:10,sourceEnd:12},layer:{id:'anchored',text:'Kokoro',style}},
  {type:'add_text',layer:{id:'absolute',text:'Later',start:20,end:22,style}}];
 const payload={plan:{summary:'Composite',operations,questions:[],unsupported:[]},pendingRequests:[],coverage:[item('Cuts','cut',[0]),item('Natural color','color',[1]),item('Anchored title','text',[2]),item('Absolute title','text',[3])]};
 const gaps=[{start:5,end:6,reason:'unreliable-word-times'}],transcripts=[{assetId:'a',words:[],gaps}];
 const result=await requestHybridEdit({project,prompt:'Complex',shareEvidence:true,registry:new Map([['a',{path:'/source.mp4'}]]),connected:async()=>true,transcribe:async()=>transcripts,
  planRequest:async()=>({...parseReviewPayload(project,JSON.stringify(payload),{transcripts}),frames:1})});
 assert.ok(result.plan.operations.length>0);assert.deepEqual(result.plan.operations[0].ranges,[[1,2]]);
 const q=applyPlan(project,result.plan);assert.equal(q.textLayers.length,1);assert.equal(q.textLayers[0].id,'anchored');assert.equal(q.textLayers[0].start,9);assert.equal(q.textLayers[0].end,11);
 assert.equal(result.coverage[0].status,'partial');assert.equal(result.coverage[1].status,'planned');assert.equal(result.coverage[3].status,'pending');assert.ok(result.pendingRequests.some(s=>s.includes('Absolute title')));
 assert.ok(result.analysisWarnings.some(s=>s.includes('independentes')));
});
