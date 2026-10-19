import test from 'node:test';import assert from 'node:assert/strict';
import {createProject,addAsset,addClip,editProject,History,addMusic} from '../src/project.mjs';
import {captionEntries,toSrt,projectCaptions} from '../src/captions.mjs';
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
test('manual text replacement after trimming whole words remains fully visible and timing edits use the real clip offset',()=>{
 let p=fixture();p.transcripts=[{assetId:'a',words:[{start:1,end:4,text:'Não gostei',tokens:[{text:'Não',start:1,end:2},{text:'gostei',start:3,end:4}]}]}];p=editProject(p,{type:'trim',clipId:'c',in:2,out:8});const entry=captionEntries(p)[0];assert.equal(entry.text,'gostei');assert.equal(entry.start,1);
 const q=editCaption(p,entry,{text:'Quero voltar'});assert.equal(captionEntries(q)[0].text,'Quero voltar');assert.equal(q.clips[0].captionWords[0].tokens,undefined);assert.deepEqual(q.transcripts,p.transcripts);assert.equal(captionEntries(q).find(c=>c.clipId==='d').text,'Não gostei');
 const timed=editCaption(p,entry,{start:1.2,end:1.8});assert.ok(Math.abs(timed.clips[0].captionWords[0].start-3.2)<1e-9);assert.ok(Math.abs(timed.clips[0].captionWords[0].end-3.8)<1e-9);
});
test('word timing cannot extend a caption page across the next page boundary',()=>{
 const p=fixture(),long='Palavra_super_longa_com_mais_de_trinta_caracteres';p.transcripts=[{assetId:'a',words:[{start:0,end:4,text:long+' próxima',tokens:[{text:long,start:0,end:3},{text:'próxima',start:1,end:4}]}]}];const entries=captionEntries(p);assert.equal(entries[0].end,1);assert.equal(entries[1].start,1);
});

test('narration captions stop at the montage end without changing source speech or audio, and return when extended',()=>{
 let p=fixture();p.clips=p.clips.slice(0,1);p.clips[0].out=4;p=addMusic(p,{id:'voice',name:'Voz',kind:'audio',duration:8,width:0,height:0,hasAudio:true},{id:'n',role:'narration',in:1,out:7,start:2,volume:.6});p.captionSource='narration';p.transcripts.push({assetId:'voice',words:[{start:2,end:4,text:'Prato bonito',tokens:[{text:'Prato',start:2,end:3},{text:'bonito',start:3,end:4}]},{start:5,end:6,text:'Final'}]});
 const saved=structuredClone(p),entries=captionEntries(p).filter(c=>c.clipId==='n');assert.equal(entries.length,1);assert.equal(entries[0].text,'Prato');assert.equal(entries[0].start,3);assert.equal(entries[0].end,4);assert.ok(entries[0].tokens.every(t=>t.end<=4));assert.deepEqual(p,saved);
 const longer=structuredClone(p);longer.clips[0].out=10;assert.deepEqual(captionEntries(longer).map(c=>c.text),['Prato bonito','Final']);const history=new History(longer);history.commit(p);assert.equal(captionEntries(history.undo()).length,2);assert.equal(captionEntries(history.redo())[0].text,'Prato');assert.equal(captionEntries(JSON.parse(JSON.stringify(p)))[0].end,4);assert.match(toSrt(projectCaptions(p)),/00:00:03,000 --> 00:00:04,000/);assert.ok(!toSrt(projectCaptions(p)).includes('bonito'));const fast=structuredClone(longer);fast.clips[0].speed=2.5;assert.equal(captionEntries(fast)[0].text,'Prato');const held=structuredClone(p);held.clips[0].freeze=8;assert.deepEqual(captionEntries(held).map(c=>c.text),['Prato bonito','Final']);
 const earlier=structuredClone(p);earlier.clips[0].out=1;assert.deepEqual(captionEntries(earlier),[]);
 const audioOnly=structuredClone(p);audioOnly.clips=[];assert.deepEqual(captionEntries(audioOnly).map(c=>c.text),['Prato bonito','Final']);
 const legacy=structuredClone(p);delete legacy.transcripts.at(-1).words[0].tokens;assert.equal(captionEntries(legacy)[0].end,4);
});
