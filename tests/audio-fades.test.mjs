import test from 'node:test';import assert from 'node:assert/strict';import * as m from '../src/project.mjs';
const p=m.addClip(m.addAsset(m.createProject(),{id:'v',name:'v',duration:4,width:320,height:240,hasAudio:true}),'v','c');
test('audio fades are optional, validated, editable for clips/music/narration and undoable',()=>{
 let q=m.editProject(p,{type:'update',clipId:'c',fadeIn:1,fadeOut:2});assert.equal(q.clips[0].fadeIn,1);assert.equal(p.clips[0].fadeIn,undefined);
 q=m.addMusic(q,{id:'a',name:'a',kind:'audio',duration:4,width:0,height:0,hasAudio:true},{in:0,out:4,start:0});const id=q.music[0].id;q=m.editMusic(q,id,{fadeIn:.5,fadeOut:1});assert.equal(q.music[0].fadeOut,1);q.music[0].role='narration';m.validateProject(q);
 const h=new m.History(q);h.commit(m.editMusic(q,id,{fadeIn:0}));assert.equal(h.current.music[0].fadeIn,0);assert.deepEqual(h.undo(),q);
 for(const value of [-1,11,NaN,'1',null]){assert.throws(()=>m.editProject(p,{type:'update',clipId:'c',fadeIn:value}));assert.throws(()=>m.editMusic(q,id,{fadeOut:value}));}
});
test('split keeps fades at outer edges; shorter trims use the same clamped linear envelope',async()=>{
 const {audioLevel,audioFades}=await import('../src/audio-envelope.mjs');
 const q=m.editProject(p,{type:'update',clipId:'c',fadeIn:1,fadeOut:1}),s=m.editProject(q,{type:'split',clipId:'c',time:2,newId:'r'});assert.equal(s.clips[0].fadeOut,0);assert.equal(s.clips[1].fadeIn,0);assert.equal(s.clips[0].fadeIn,1);assert.equal(s.clips[1].fadeOut,1);
 assert.equal(audioLevel(q.clips[0],0,4),0);assert.equal(audioLevel(q.clips[0],.5,4),.5);assert.equal(audioLevel(q.clips[0],2,4),1);assert.equal(audioLevel(q.clips[0],3.5,4),.5);assert.equal(audioLevel(q.clips[0],4,4),0);
 assert.deepEqual(audioFades(q.clips[0],.5),{fadeIn:.5,fadeOut:.5});assert.equal(audioLevel(q.clips[0],.25,.5),.25,'overlapping fades multiply');assert.equal(audioLevel(p.clips[0],1,4),1,'legacy default');
});
test('initial music fades are preserved; range removal keeps ramps at the outside edges only',()=>{
 const q=m.addMusic(p,{id:'a',name:'a',kind:'audio',duration:4,width:0,height:0,hasAudio:true},{in:0,out:4,fadeIn:.5,fadeOut:1});assert.equal(q.music[0].fadeIn,.5);assert.equal(q.music[0].fadeOut,1);
 const f=m.editProject(p,{type:'update',clipId:'c',fadeIn:1,fadeOut:1}),r=m.applyPlan(f,{summary:'remove',questions:[],unsupported:[],operations:[{type:'remove_ranges',clipId:'c',ranges:[[1,3]]}]});assert.equal(r.clips[0].fadeIn,1);assert.equal(r.clips[0].fadeOut,0);assert.equal(r.clips[1].fadeIn,0);assert.equal(r.clips[1].fadeOut,1);
});
