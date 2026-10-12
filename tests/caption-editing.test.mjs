import test from 'node:test';import assert from 'node:assert/strict';
import {createProject,addAsset,addClip,editProject,History} from '../src/project.mjs';
import {captionEntries} from '../src/captions.mjs';
import {editCaption,addCaptionAt} from '../src/caption-editing.mjs';
function fixture(){let p=addClip(addAsset(createProject(),{id:'a',name:'a',duration:10,width:640,height:360,hasAudio:true}),'a','c');p=addClip(p,'a','d');p.transcripts=[{assetId:'a',words:[{text:'olá',start:0,end:2}]}];return p;}
test('delete caption only from selected occurrence; undo and source transcript preserved',()=>{
 const p=fixture(),h=new History(p),q=editCaption(p,captionEntries(p)[0],null);h.commit(q);
 assert.equal(captionEntries(q).length,1);assert.equal(q.transcripts[0].words.length,1);assert.equal(q.clips.length,2);assert.equal(captionEntries(h.undo()).length,2);
});
test('add and move caption in source coordinates survive video reordering and reject overlap',()=>{
 let p=fixture();p=addCaptionAt(p,3);let entry=captionEntries(p).find(c=>c.start===3);assert.ok(entry);
 p=editCaption(p,entry,{text:'novo',start:4,end:6});assert.equal(captionEntries(p)[1].text,'novo');
 assert.throws(()=>editCaption(p,captionEntries(p)[1],{start:1,end:3}));
 const moved=editProject(p,{type:'move',clipId:'c',index:1});assert.equal(captionEntries(moved).find(c=>c.text==='novo').start,14);
 assert.throws(()=>addCaptionAt(p,1));
});
test('moving a 100ms caption tolerates floating point rounding without allowing shorter captions',()=>{
 const p=fixture();p.clips[0].captionWords=[{start:9,end:9.1,text:'curta'}];const entry=captionEntries(p).find(c=>c.text==='curta');
 const q=editCaption(p,entry,{start:9+.03,end:9.1+.03});assert.equal(captionEntries(q).find(c=>c.text==='curta').start,9.03);
 assert.throws(()=>editCaption(p,entry,{start:9,end:9.09}));
});
test('text and placement edits preserve source timing and tokens when a phrase crosses trimmed clip edges',()=>{
 let p=fixture();p.transcripts=[{assetId:'a',words:[{start:0,end:3,text:'olá mundo',tokens:[{start:0,end:1.5,text:'olá'},{start:1.5,end:3,text:'mundo'}]}]}];p=editProject(p,{type:'trim',clipId:'c',in:.5,out:2.5});p=editProject(p,{type:'update',clipId:'c',speed:2});const entry=captionEntries(p)[0],q=editCaption(p,entry,{text:'Oi mundo',place:{positionX:40,positionY:60}});assert.equal(q.clips[0].captionWords[0].start,0);assert.equal(q.clips[0].captionWords[0].end,3);assert.deepEqual(q.clips[0].captionWords[0].tokens,[{start:0,end:1.5,text:'Oi'},{start:1.5,end:3,text:'mundo'}]);assert.deepEqual(q.transcripts,p.transcripts);assert.equal(captionEntries(q)[0].end,1);assert.equal(captionEntries(q)[1].text,'olá mundo');assert.throws(()=>editCaption(p,entry,{start:-.1,end:1.1}));const retimed=editCaption(p,entry,{start:.1,end:.9});assert.equal(retimed.clips[0].captionWords[0].start,.7);assert.equal(retimed.clips[0].captionWords[0].end,2.3);
});
