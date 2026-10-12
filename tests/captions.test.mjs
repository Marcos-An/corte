import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCaptions,toSrt,validateTranscript} from '../src/captions.mjs';
test('source captions follow trims, repeat clips and reorder without mutating transcript',()=>{
 const words=[{start:1,end:2,text:'Olá'},{start:3,end:4,text:'mundo'}];
 const p={clips:[{assetId:'a',in:2,out:5},{assetId:'a',in:0,out:2}],transcripts:[{assetId:'a',words}]};
 assert.deepEqual(projectCaptions(p),[{start:1,end:2,text:'mundo'},{start:4,end:5,text:'Olá'}]);
 assert.equal(words[0].start,1);
 assert.match(toSrt(projectCaptions(p)),/00:00:01,000 --> 00:00:02,000\nmundo/);
});
test('invalid timestamps and text rejected; silence yields no captions',()=>{
 assert.deepEqual(projectCaptions({clips:[],transcripts:[]}),[]);
 assert.throws(()=>validateTranscript({assetId:'a',words:[{start:2,end:1,text:'x'}]},5));
 assert.throws(()=>validateTranscript({assetId:'a',words:[{start:0,end:6,text:'x'}]},5));
 assert.throws(()=>validateTranscript({assetId:'a',words:[{start:0,end:1,text:42}]},5));
});
test('project validates and persists source transcripts, retaining legacy project compatibility',async()=>{
 const {createProject,addAsset,validateProject}=await import('../src/project.mjs');
 const p=addAsset(createProject(),{id:'a',name:'Vídeo',duration:5,width:320,height:240,hasAudio:true});
 p.transcripts=[{assetId:'a',words:[{start:0,end:1,text:'Olá'}]}];assert.equal(validateProject(p),p);
 p.transcripts[0].words[0].end=9;assert.throws(()=>validateProject(p));
});
test('recognition normalization rejects missing/invalid word times instead of inventing sync',async()=>{
 const {normalizeRecognition}=await import('../src/captions.mjs');
 assert.deepEqual(normalizeRecognition({chunks:[{text:' Olá',timestamp:[0,1]}]},2),[{start:0,end:1,text:'Olá'}]);
 assert.throws(()=>normalizeRecognition({chunks:[{text:'x',timestamp:[null,1]}]},2));
 assert.throws(()=>normalizeRecognition({chunks:[{text:'x',timestamp:[0,null]}]},2));
 assert.deepEqual(normalizeRecognition({text:'',chunks:[]},2),[]);
});
test('ASS export keeps timestamps and escapes user text without interpreting styling commands',async()=>{
 const {toAss}=await import('../src/captions.mjs');const ass=toAss([{start:1,end:2,text:'Olá {\\pos(0,0)}'}],720,1280);
 assert.match(ass,/PlayResX: 720/);assert.match(ass,/0:00:01.00,0:00:02.00/);assert.ok(!ass.includes('{\\pos(0,0)}'));
});
test('approved font families remain explicit and safe in preview/export',async()=>{
 const {captionStyle,toAss}=await import('../src/captions.mjs');
 const style={font:'Verdana',size:7,color:'#ffffff',position:'bottom',preset:'outline'};
 assert.equal(captionStyle(style).font,'Verdana');
 assert.match(toAss([{start:0,end:1,text:'Olá'}],720,1280,style),/Default,Verdana,50,/);
 assert.throws(()=>captionStyle({...style,font:'Injected,Style'}));
});
