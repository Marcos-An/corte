import test from 'node:test';import assert from 'node:assert/strict';import * as m from '../src/project.mjs';import {captionEntries} from '../src/captions.mjs';import {editCaption,addCaptionAt} from '../src/caption-editing.mjs';import {removeTimelineRange} from '../src/range-selection.mjs';import {nextClipTime} from '../src/editor-experience.mjs';
const p=m.addClip(m.addAsset(m.createProject(),{id:'v',name:'v',duration:10,width:320,height:240,hasAudio:true}),'v','c');
test('speed is validated and source/montage mapping is shared by seek, cut, ranges and next boundary',()=>{
 let q=m.editProject(p,{type:'trim',clipId:'c',in:2,out:6});q=m.editProject(q,{type:'update',clipId:'c',speed:2});assert.equal(q.clips[0].speed,2);assert.equal(m.duration(q),2);assert.equal(m.clipAt(q,.5).sourceTime,3);assert.equal(nextClipTime(q,0),2);
 const h=new m.History(q);h.commit(m.editProject(q,{type:'update',clipId:'c',speed:.5}));assert.equal(m.duration(h.current),8);assert.deepEqual(h.undo(),q);
 const split=m.editProject(q,{type:'split',clipId:'c',time:4,newId:'r'});assert.equal(m.duration(split),2);assert.equal(m.clipAt(split,1.5).sourceTime,5);assert.equal(split.clips[1].speed,2);
 const removed=removeTimelineRange(q,.5,1.5);assert.deepEqual(removed.clips.map(c=>[c.in,c.out]),[[2,3],[5,6]]);assert.equal(m.duration(removed),1);
 for(const speed of [0,.1,4.1,NaN,'2',null])assert.throws(()=>m.editProject(p,{type:'update',clipId:'c',speed}));assert.equal(m.duration(p),10,'legacy default');
});
test('captions and karaoke tokens map to montage time, while edits and added captions stay in source time',()=>{
 let q=m.editProject(p,{type:'trim',clipId:'c',in:2,out:6});q=m.editProject(q,{type:'update',clipId:'c',speed:2});q.transcripts=[{assetId:'v',words:[{start:3,end:4,text:'Oi mundo',tokens:[{start:3,end:3.5,text:'Oi'},{start:3.5,end:4,text:'mundo'}]}]}];let entry=captionEntries(q)[0];assert.equal(entry.start,.5);assert.equal(entry.end,1);assert.deepEqual(entry.tokens.map(t=>[t.start,t.end]),[[.5,.75],[.75,1]]);
 q=editCaption(q,entry,{start:1,end:1.5});assert.equal(q.clips[0].captionWords[0].start,4);assert.equal(q.clips[0].captionWords[0].end,5);q=addCaptionAt(q,.1);assert.equal(q.clips[0].captionWords[0].start,2.2);assert.ok(Math.abs(captionEntries(q)[0].start-.1)<1e-9);
});
test('speed scales real transition margins and playback source positions without changing montage length',()=>{
 let q=m.editProject(p,{type:'trim',clipId:'c',in:2,out:4});q=m.addClip(q,'v','r');q=m.editProject(q,{type:'trim',clipId:'r',in:1,out:5});q=m.editProject(q,{type:'update',clipId:'c',speed:2});q=m.editProject(q,{type:'update',clipId:'r',speed:.5});assert.equal(m.transitionLimit(q,'c','r'),1);q=m.setTransition(q,'c','r','dissolve',1);const at=m.transitionAt(q,.75);assert.equal(at.cut,1);assert.equal(at.leftTime,3.5);assert.equal(at.rightTime,.875);assert.equal(m.duration(q),9);
});
test('text editing remains possible when a valid existing caption becomes shorter than 100ms at 4x',()=>{
 let q=m.editProject(p,{type:'update',clipId:'c',speed:4});q.transcripts=[{assetId:'v',words:[{start:2,end:2.2,text:'Oi'}]}];const entry=captionEntries(q)[0];q=editCaption(q,entry,{text:'Olá'});assert.equal(q.clips[0].captionWords[0].text,'Olá');assert.equal(q.clips[0].captionWords[0].start,2);assert.equal(q.clips[0].captionWords[0].end,2.2);
});
test('speed belongs to main clips, not independent music/narration tracks',()=>{
 const q=m.addMusic(p,{id:'a',name:'a',kind:'audio',duration:4,width:0,height:0,hasAudio:true},{in:0,out:4});q.music[0].speed=2;assert.throws(()=>m.validateProject(q),/Velocidade/);
});
