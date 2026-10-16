import test from 'node:test';import assert from 'node:assert/strict';
import {createProject,addAsset,addClip,applyPlan,duration} from '../src/project.mjs';
import {planSchema,parseReviewPayload} from '../desktop/ai.mjs';
const fixture=()=>addClip(addClip(addAsset(createProject(),{id:'a',name:'Fala',duration:10,width:1080,height:1920,hasAudio:true}),'a','c'),'a','d');
const plan=operations=>({summary:'s',questions:[],unsupported:[],operations});
const near=(a,b)=>Math.abs(a-b)<1e-6;
test('part of a clip can be sped up, punched in or graded without touching the rest',()=>{
 const q=applyPlan(fixture(),plan([{type:'adjust_ranges',clipId:'c',ranges:[[2,4]],patch:{speed:1.5}},{type:'adjust_ranges',clipId:'c',ranges:[[6,7]],patch:{crop:{x:.05,y:.05,w:.9,h:.9}}},{type:'adjust_ranges',clipId:'c',ranges:[[8,9]],patch:{adjustments:{brightness:.05,contrast:1.05,saturation:1}}}]));
 const pieces=q.clips.filter(c=>c.assetId==='a'&&c.id!=='d');
 assert.deepEqual(pieces.map(c=>[c.in,c.out]),[[0,2],[2,4],[4,6],[6,7],[7,8],[8,9],[9,10]]);assert.equal(pieces[0].id,'c','the first piece keeps the original id');
 assert.equal(pieces[1].speed,1.5);assert.equal(pieces[0].speed??1,1);assert.equal(pieces[3].crop.w,.9);assert.equal(pieces[5].adjustments.brightness,.05);assert.equal(pieces[6].adjustments,undefined);
 assert.ok(near(duration(q),2+2/1.5+6+10));
});
test('every operation on an original clip reaches all of its pieces after a cut',()=>{
 const q=applyPlan(fixture(),plan([{type:'remove_ranges',clipId:'c',ranges:[[1,2]]},{type:'adjust_ranges',clipId:'c',ranges:[[5,6]],patch:{speed:2}},{type:'update',clipId:'c',volume:.5},{type:'remove_ranges',clipId:'c',ranges:[[8,9]]}]));
 const pieces=q.clips.filter(c=>c.id!=='d');
 assert.deepEqual(pieces.map(c=>[c.in,c.out,c.speed??1]),[[0,1,1],[2,5,1],[5,6,2],[6,8,1],[9,10,1]]);assert.ok(pieces.every(c=>c.volume===.5));
 assert.equal(q.clips.find(c=>c.id==='d').volume,1,'the other clip is untouched');
});
test('invalid adjustments are rejected atomically',()=>{
 const p=fixture(),before=structuredClone(p);
 for(const op of [{type:'adjust_ranges',clipId:'c',ranges:[[2,4]],patch:{}},{type:'adjust_ranges',clipId:'c',ranges:[[2,4]],patch:{in:3}},{type:'adjust_ranges',clipId:'c',ranges:[[4,2]],patch:{speed:2}},{type:'adjust_ranges',clipId:'c',ranges:[[2,4]],patch:{speed:9}},{type:'adjust_ranges',clipId:'x',ranges:[[2,4]],patch:{speed:2}}])assert.throws(()=>applyPlan(p,plan([op])));
 assert.deepEqual(p,before);
});
test('the provider can request range adjustments and coverage maps them to their category',()=>{
 assert.ok(planSchema.properties.operations.items.anyOf.some(s=>s.properties.type.const==='adjust_ranges'));
 const p=fixture(),payload=(patch,kind)=>JSON.stringify({plan:plan([{type:'adjust_ranges',clipId:'c',ranges:[[2,4]],patch}]),pendingRequests:[],coverage:[{request:'r',kind,status:'planned',operationIndexes:[0],reason:'m'}]});
 for(const [patch,kind] of [[{speed:1.2},'speed'],[{crop:{x:.05,y:.05,w:.9,h:.9}},'framing'],[{adjustments:{brightness:.03,contrast:1.04,saturation:1.02}},'color'],[{volume:.8},'audio']])assert.doesNotThrow(()=>parseReviewPayload(p,payload(patch,kind)),kind);
 assert.throws(()=>parseReviewPayload(p,payload({speed:1.2},'color')),/cobertura/i);
});
