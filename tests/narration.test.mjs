import test from 'node:test';import assert from 'node:assert/strict';
import {createProject,addMusic,validateProject,History,editMusic} from '../src/project.mjs';
import {captionEntries} from '../src/captions.mjs';
const asset={id:'voice',name:'voz.wav',kind:'audio',duration:8,width:0,height:0,hasAudio:true};
test('narration role persists independently through edits and history, legacy music unchanged',()=>{
 const p=addMusic(createProject(),asset,{id:'n',in:1,out:5,start:2,role:'narration'});
 assert.equal(p.music[0].role,'narration');
 const h=new History(p);h.commit(editMusic(p,'n',{start:4}));assert.equal(h.undo().music[0].role,'narration');
 assert.equal(addMusic(createProject(),asset,{in:0,out:2}).music[0].role,undefined);
 assert.throws(()=>validateProject({...p,music:[{...p.music[0],role:'invalid'}]}));
});
test('caption source narration uses its trim and placement, excludes music and defaults to legacy video',()=>{
 const p=addMusic(createProject(),asset,{id:'n',in:1,out:5,start:2,role:'narration'});
 p.transcripts=[{assetId:'voice',words:[{start:0,end:2,text:'Olá'},{start:3,end:4,text:'mundo'}]}];
 assert.equal(captionEntries(p).length,0);
 p.captionSource='narration';
 assert.deepEqual(captionEntries(p).map(({start,end,text})=>({start,end,text})),[{start:2,end:3,text:'Olá'},{start:4,end:5,text:'mundo'}]);
 assert.throws(()=>validateProject({...p,captionSource:'music'}));
});
test('transcription estimate includes narration only, never added music',async()=>{
 const {captionEstimate}=await import('../desktop/cloud-captions.mjs');
 let p=addMusic(createProject(),asset,{in:0,out:5,role:'narration'});
 p=addMusic(p,{...asset,id:'song'},{in:0,out:5});p.captionSource='narration';
 assert.equal(captionEstimate(p).assets,1);assert.equal(captionEstimate(p).seconds,8);
});
test('narration and per-occurrence caption edits survive saved project and history',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path');
 const {saveProjectFile,readProjectFile}=await import('../desktop/storage.mjs');
 const dir=await mkdtemp(path.join(tmpdir(),'corte-narration-save-'));
 try{const p=addMusic(createProject(),asset,{id:'n',in:0,out:5,role:'narration'});p.captionSource='narration';p.music[0].captionWords=[{text:'Voz',start:1,end:2}];
 const file=path.join(dir,'project.corte');await saveProjectFile(file,p,new Map([['voice',{path:path.join(dir,'voice.wav')}]]),new History(p).serialize());
 const saved=await readProjectFile(file);assert.deepEqual(saved.project,p);assert.deepEqual(History.from(saved.history).current,p);
 }finally{await rm(dir,{recursive:true,force:true});}
});
