import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {normalizeWordTranscript,transcribeAudio,transcribeCloud} from '../desktop/cloud-captions.mjs';
import {captionEntries,captionRuns,validateTranscript} from '../src/captions.mjs';
import {createProject,addAsset,addClip,validateProject} from '../src/project.mjs';
import {binaries,run,probe} from '../desktop/media.mjs';
const style={preset:'karaoke'};
function projectWith(words,duration=2){const p=addClip(addAsset(createProject(),{id:'a',name:'a',duration,width:320,height:240,hasAudio:true}),'a');p.transcripts=[{assetId:'a',words}];return p;}

test('zero-duration words survive generation and project validation without invented highlighting',()=>{
 const words=[{word:'Eu',start:0,end:0},{word:'quero',start:0,end:.4},{word:'um',start:.4,end:.4},{word:'café.',start:.4,end:1},{word:'Sim.',start:1,end:1}];
 const phrases=normalizeWordTranscript({words},2),p=projectWith(phrases);
 validateProject(JSON.parse(JSON.stringify(p)));
 assert.equal(captionEntries(p).map(c=>c.text).join(' '),words.map(w=>w.word).join(' '));
 assert.deepEqual(phrases.flatMap(c=>c.tokens),words.map(({word,...t})=>({...t,text:word})));
 const runs=phrases.flatMap(c=>captionRuns(c,.2,style));assert.equal(runs.find(r=>r.text==='Eu').active,false);assert.equal(runs.find(r=>r.text==='quero').active,true);
 assert.ok(phrases.every(c=>c.end>c.start));
});

test('coincident word timestamps do not create invisible zero-duration caption pages',()=>{
 const tokens='Estas palavras precisam continuar inteiras mesmo quando os tempos coincidem.'.split(' ').map((text,i,a)=>({text,start:0,end:i===a.length-1?2:0}));
 const entries=captionEntries(projectWith([{start:0,end:2,text:tokens.map(t=>t.text).join(' '),tokens}]));
 assert.equal(entries.map(c=>c.text).join(' '),tokens.map(t=>t.text).join(' '));assert.ok(entries.every(c=>c.end>c.start));
});

test('API normalization bounds encoder padding to source duration without changing provider data',async()=>{
 const response={words:[{word:'Olá',start:0,end:.5},{word:'mundo.',start:.5,end:1.1}]},original=structuredClone(response);
 const phrases=await transcribeAudio({key:'test',audio:new Uint8Array([1]),duration:1,audioDuration:1.116,wordTiming:true,fetcher:async()=>({ok:true,json:async()=>response})});
 assert.equal(phrases.at(-1).end,1);assert.equal(phrases.at(-1).tokens.at(-1).end,1);assert.deepEqual(response,original);validateProject(projectWith(phrases,1));
});

test('whitespace-only provider tokens do not reject otherwise valid speech',()=>{
 const phrases=normalizeWordTranscript({words:[{word:' ',start:0,end:0},{word:'Olá',start:0,end:1}]},1);
 assert.equal(phrases.map(c=>c.text).join(' '),'Olá');
});

test('unusable API timings report the failing index and reason without exposing transcript text',()=>{
 for(const invalid of [{word:'private-text',start:.5,end:2},{word:'private-text',start:.6,end:.5},{word:'private-text',start:-.1,end:.5},{word:'private-text',start:null,end:1},{word:42,start:.5,end:1}]){
  assert.throws(()=>normalizeWordTranscript({words:[{word:'valid',start:0,end:.4},invalid]},1),e=>/API.*palavra 2/i.test(e.message)&&!e.message.includes('private-text')&&!e.message.includes('valid'));
 }
 assert.throws(()=>normalizeWordTranscript({words:[{word:'a',start:.5,end:.7},{word:'b',start:.4,end:1}]},1),/API.*palavra 2.*ordem/i);
 assert.throws(()=>normalizeWordTranscript({words:[{word:'a',start:0,end:0}]},1),/API.*sem.*duração/i);
});

test('instantaneous tokens do not weaken persisted caption interval validation',()=>{
 assert.throws(()=>validateTranscript({assetId:'a',words:[{text:'a',start:0,end:0}]},1));
 validateTranscript({assetId:'a',words:[{text:'a b',start:0,end:1,tokens:[{text:'a',start:0,end:0},{text:'b',start:0,end:1}]}]},1);
 assert.throws(()=>validateTranscript({assetId:'a',words:[{text:'a',start:0,end:1,tokens:[{text:'a',start:.5,end:.4}]}]},1));
});

test('cloud generation measures the actual MP3 duration before accepting its tail timestamps',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-caption-timestamps-'));
 try{
  const file=path.join(dir,'input.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=s=320x240:r=25','-f','lavfi','-i','sine=frequency=440','-t','1','-c:v','libx264','-c:a','aac',file]);
  const info=await probe(file),p=addClip(addAsset(createProject(),{...info,id:'a',name:'test.mp4'}),'a');let requests=0;
  const transcripts=await transcribeCloud({project:p,registry:new Map([['a',{path:file}]]),key:'test',cache:dir,fetcher:async(_url,{body})=>{requests++;assert.equal(body.get('model'),'whisper-1');return {ok:true,json:async()=>({words:[{word:'Olá',start:0,end:info.duration+.1}]})};}});
  assert.equal(requests,1);assert.equal(transcripts[0].words[0].end,info.duration);validateProject({...p,transcripts});assert.equal(p.transcripts,undefined);
 }finally{await rm(dir,{recursive:true,force:true});}
});
