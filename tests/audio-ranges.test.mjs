import test from 'node:test';import assert from 'node:assert/strict';import * as m from '../src/project.mjs';import {audioLevel} from '../src/audio-envelope.mjs';import {captionEntries} from '../src/captions.mjs';import {planSchema,buildPrompt,parseReviewPayload} from '../desktop/ai.mjs';
function fixture(role='music'){return m.addMusic(m.createProject(),{id:'a',name:'Áudio',kind:'audio',duration:12,width:0,height:0,hasAudio:true},{id:'audio',in:2,out:10,start:1,volume:.8,fadeIn:3,fadeOut:2,role});}
test('manual interval volume preserves source, placement, untouched audio, fade curve and history',()=>{
 const p=fixture(),h=new m.History(p),q=m.adjustAudioRange(p,'audio',2,4,.2);h.commit(q);
 assert.deepEqual(q.music.map(c=>[c.in,c.out,c.start,c.volume]),[[2,3,1,.8],[3,5,2,.2],[5,10,4,.8]]);
 for(const c of q.music)for(const t of [.01,(c.out-c.in)/2,c.out-c.in-.01])assert.ok(Math.abs(audioLevel(c,t,c.out-c.in)-audioLevel(p.music[0],c.start-1+t,8)*c.volume/.8)<1e-9);
 assert.equal(p.music.length,1);assert.deepEqual(h.undo(),p);assert.deepEqual(h.redo(),q);
});
test('AI repeated and overlapping interval edits follow original audio identity without affecting narration',()=>{
 let p=fixture();p=m.addMusic(p,p.assets[0],{id:'voice',in:0,out:8,start:1,volume:.7,role:'narration'});
 const q=m.applyPlan(p,{summary:'Volumes manuais',questions:[],unsupported:[],operations:[{type:'adjust_audio_range',audioId:'audio',start:2,end:4,volume:.2},{type:'adjust_audio_range',audioId:'audio',start:3,end:7,volume:.5}]});
 const at=t=>q.music.find(c=>c.role==='music'&&t>=c.start&&t<c.start+c.out-c.in).volume;
 assert.deepEqual([at(1.5),at(2.5),at(3.5),at(6.5),at(8.5)],[.8,.2,.5,.5,.8]);assert.equal(q.music.find(c=>c.id==='voice').volume,.7);
 assert.ok(JSON.stringify(planSchema).includes('adjust_audio_range'));assert.ok(buildPrompt(p,'Baixe a música entre 2 e 4 segundos',[]).includes('adjust_audio_range'));
 const payload={plan:{summary:'Volume parcial',questions:[],unsupported:[],operations:[{type:'adjust_audio_range',audioId:'audio',start:2,end:4,volume:.2}]},pendingRequests:[],coverage:[{request:'Volume da música',kind:'audio',status:'planned',operationIndexes:[0],reason:'Tempos fornecidos'}]};assert.doesNotThrow(()=>parseReviewPayload(p,JSON.stringify(payload)));payload.coverage[0].kind='color';assert.throws(()=>parseReviewPayload(p,JSON.stringify(payload)),/cobertura/i);
});
test('narration interval retains caption words and timed transcript across parts',()=>{
 const p=fixture('narration');p.captionSource='narration';p.music[0].captionWords=[{start:2,end:4,text:'Uma voz'}];const q=m.adjustAudioRange(p,'audio',2,4,.3);
 assert.equal(captionEntries(q).map(c=>c.end-c.start).reduce((a,b)=>a+b,0),2);assert.ok(q.music.every(c=>c.role==='narration'));
});
test('invalid intervals, tiny fragments and corrupt fade continuity fail without mutation',()=>{
 const p=fixture(),before=structuredClone(p);for(const args of [[0,2,.2],[2,10,.2],[2,2.01,.2],[1.01,3,.2],[2,3,3],[NaN,3,.2]])assert.throws(()=>m.adjustAudioRange(p,'audio',...args));assert.deepEqual(p,before);
 const q=fixture();q.music[0].fadeWindow={offset:10,duration:8,scale:1};assert.throws(()=>m.validateProject(q),/Continuidade/);
});
test('editing a split fade retains continuity on inward trim and resets it on new fade settings',()=>{
 const p=m.adjustAudioRange(fixture(),'audio',2,4,.2),c=p.music[1];const q=m.editMusic(p,c.id,{in:c.in+.2});assert.ok(Math.abs(q.music[1].fadeWindow.offset-c.fadeWindow.offset-.2)<1e-9);
 const r=m.editMusic(q,c.id,{fadeIn:.5});assert.equal(r.music[1].fadeWindow,undefined);assert.equal(r.music[1].fadeIn,.5);
});
