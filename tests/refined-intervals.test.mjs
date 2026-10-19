import test from 'node:test';import assert from 'node:assert/strict';
import * as m from '../src/project.mjs';import {clipDuration,zoomAt} from '../src/clip-time.mjs';import {audioLevel} from '../src/audio-envelope.mjs';
import {INTERVAL_CONTROLS,intervalPatch} from '../src/interval-controls.mjs';import {buildPrompt,planSchema} from '../desktop/ai.mjs';import {validateScopedPlan} from '../src/editor-experience.mjs';
const plan=operations=>({summary:'Refinar',questions:[],unsupported:[],operations});
function fixture(){let p=m.addClip(m.addAsset(m.createProject(),{id:'a',name:'Vídeo',duration:20,width:320,height:240,hasAudio:true}),'a','first');p=m.editProject(p,{type:'update',clipId:'first',speed:2});return m.addClip(p,'a','second');}
test('montage intervals cross clip boundaries and speed without moving cuts or affecting neighbours',()=>{
 const p=fixture(),q=m.applyPlan(p,plan([{type:'adjust_timeline',clipId:null,start:8,end:12,patch:{volume:.4}},{type:'adjust_timeline',clipId:null,start:9,end:11,patch:{adjustments:{brightness:.15}}}]));
 assert.equal(m.duration(q),m.duration(p));for(const [at,volume,brightness]of [[7,1,0],[8.5,.4,0],[9.5,.4,.15],[10.5,.4,.15],[11.5,.4,0],[13,1,0]]){const c=m.clipAt(q,at).clip;assert.equal(c.volume,volume);assert.equal(c.adjustments?.brightness??0,brightness);}
 assert.equal(m.clipAt(q,9).sourceTime,18);assert.equal(m.clipAt(q,11).sourceTime,1);
});
test('scoped intervals use selected-clip local seconds and preserve other clips',()=>{
 const p=fixture(),q=m.applyPlan(p,plan([{type:'adjust_timeline',clipId:'second',start:2,end:4,patch:{volume:.25}}]));assert.equal(m.clipAt(q,3).clip.volume,1);assert.equal(m.clipAt(q,11).clip.volume,1);assert.equal(m.clipAt(q,13).clip.volume,.25);assert.equal(m.clipAt(q,15).clip.volume,1);
});
test('partial colour changes preserve other settings and consecutive changes on already split pieces',()=>{
 let p=fixture();p=m.editProject(p,{type:'update',clipId:'first',adjustments:{contrast:1.2,saturation:.8,temperature:.1}});
 const q=m.applyPlan(p,plan([{type:'adjust_timeline',clipId:null,start:1,end:5,patch:{adjustments:{brightness:.2}}},{type:'adjust_timeline',clipId:null,start:3,end:7,patch:{adjustments:{sharpness:.3}}}]));
 for(const at of [.5,2,4,6,8]){const a=m.clipAt(q,at).clip.adjustments;assert.equal(a.contrast,1.2);assert.equal(a.saturation,.8);assert.equal(a.temperature,.1);assert.equal(a.brightness,at>=1&&at<5?.2:0);assert.equal(a.sharpness??0,at>=3&&at<7?.3:0);}
});
test('range adjustments preserve existing zoom and long overlapping fades continuously',()=>{
 let p=fixture();p=m.editProject(p,{type:'update',clipId:'second',fadeIn:8,fadeOut:8,zoom:{from:1,to:1.5}});const original=p.clips[1];
 const q=m.applyPlan(p,plan([{type:'adjust_timeline',clipId:null,start:12,end:14,patch:{adjustments:{brightness:.1}}},{type:'adjust_timeline',clipId:null,start:13,end:16,patch:{volume:.5}}]));
 for(let local=.1;local<19.9;local+=.2){const at=m.clipAt(q,10+local),c=at.clip,t=(at.sourceTime-c.in)/(c.speed??1);assert.ok(Math.abs(zoomAt(c,t)-zoomAt(original,local))<1e-7);const expected=audioLevel(original,local,20)*(local>=3&&local<6?.5:1);assert.ok(Math.abs(audioLevel(c,t,clipDuration(c))-expected)<1e-7,`fade continuity ${local}`);}
});
test('invalid, out-of-range and partial frozen intervals reject atomically',()=>{
 const p=fixture(),before=structuredClone(p);for(const change of [{start:-1,end:2},{start:1,end:40},{start:3,end:2},{patch:{volume:3}},{patch:{adjustments:{other:.1}}}])assert.throws(()=>m.applyPlan(p,plan([{type:'adjust_timeline',clipId:null,start:1,end:2,patch:{volume:.5},...change}])));
 assert.deepEqual(p,before);const frozen=m.editProject(p,{type:'freeze',clipId:'first',time:2,duration:2});assert.throws(()=>m.applyPlan(frozen,plan([{type:'adjust_timeline',clipId:null,start:1.2,end:1.8,patch:{volume:0}}])));
});
test('controls validate bounds, preserve zero and expose each interval operation to scoped AI',()=>{
 for(const [key,c]of Object.entries(INTERVAL_CONTROLS)){assert.doesNotThrow(()=>intervalPatch(key,c.min));assert.doesNotThrow(()=>intervalPatch(key,c.max));assert.throws(()=>intervalPatch(key,c.max+1));assert.throws(()=>intervalPatch(key,NaN));}
 assert.deepEqual(intervalPatch('brightness',0),{adjustments:{brightness:0}});assert.deepEqual(intervalPatch('volume',0),{volume:0});
 const p=fixture(),operation={type:'adjust_timeline',clipId:'second',start:2,end:4,patch:{volume:.5}};assert.doesNotThrow(()=>validateScopedPlan(p,plan([operation]),'second'));
 const prompt=buildPrompt(p,'volume',[],{scopeClipId:'second'});assert.ok(prompt.includes('"scopeClipId":"second"'));assert.ok(planSchema.properties.operations.items.anyOf.some(s=>s.properties.type.const==='adjust_timeline'));
});
test('intervals resolve against preceding cuts; speed, save validation and freezing retain fade positions',()=>{
 const p=fixture();let q=m.applyPlan(p,plan([{type:'remove_ranges',clipId:'first',ranges:[[0,4]]},{type:'adjust_timeline',clipId:null,start:7,end:10,patch:{volume:.5}}]));assert.equal(m.duration(q),28);assert.equal(m.clipAt(q,7.5).clip.volume,.5);assert.equal(m.clipAt(q,10.5).clip.volume,1);
 let faded=m.editProject(p,{type:'update',clipId:'second',fadeIn:8,fadeOut:8});faded=m.applyPlan(faded,plan([{type:'adjust_timeline',clipId:'second',start:2,end:4,patch:{adjustments:{brightness:.1}}}]));const piece=faded.clips.find(c=>c.in===2&&c.assetId==='a'&&c.speed!==2),sped=m.editProject(faded,{type:'update',clipId:piece.id,speed:2}),c=sped.clips.find(c=>c.id===piece.id);assert.equal(c.fadeWindow.scale,2);assert.ok(Math.abs(audioLevel(c,.5,clipDuration(c))-audioLevel(piece,1,clipDuration(piece)))<1e-8);
 assert.doesNotThrow(()=>m.validateProject(JSON.parse(JSON.stringify(sped))));const frozen=m.editProject(faded,{type:'freeze',clipId:piece.id,time:3,duration:1});assert.equal(frozen.clips.find(c=>c.in===3&&!c.freeze&&c.speed!==2).fadeWindow.offset,3);
 for(const patch of [null,{}, {brightness:NaN},{brightness:2}])assert.throws(()=>m.editProject(p,{type:'update',clipId:'second',adjustments:patch}));
});
