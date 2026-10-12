import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,writeFile,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';
import {run,binaries,probe} from '../desktop/media.mjs';import {transcribeLocally} from '../desktop/transcribe.mjs';
const speech=process.env.CORTE_TEST_SPEECH;if(!speech)throw new Error('Defina CORTE_TEST_SPEECH com áudio autorizado.');
const dir=await mkdtemp(path.join(tmpdir(),'corte-asr-test-'));
try{
 const file=path.join(dir,'speech.mp4');await run(binaries().ffmpeg,['-y','-f','lavfi','-i','color=black:size=320x240:rate=30','-i',speech,'-shortest','-c:v','libx264','-c:a','aac',file]);
 const a={id:'a',name:'Fala',...await probe(file)},p={version:1,name:'Teste',aspect:'9:16',assets:[a],clips:[{id:'c',assetId:'a',in:0,out:a.duration,volume:1,crop:{x:0,y:0,w:1,h:1}}]};
 const before=new Set((await readdir(tmpdir())).filter(n=>n.startsWith('corte-captions-')));
 const result=await transcribeLocally({project:p,registry:new Map([['a',{path:file}]])});assert.match(result[0].words.map(w=>w.text).join(' '),/receita deliciosa/i);assert.ok(result[0].words.every(w=>w.end>w.start&&w.end<=a.duration));
 await writeFile(path.resolve(import.meta.dirname,'../../validacao-legendas-local.json'),JSON.stringify({fixture:'fala sintética PT-BR (Luciana)',transcripts:result},null,2));console.log('PASS real local ASR Portuguese, word timestamps');
 assert.deepEqual((await readdir(tmpdir())).filter(n=>n.startsWith('corte-captions-')&&!before.has(n)),[],'transcription must clean temporary audio before resolving');
 const silent=path.join(dir,'silence.mp4');await run(binaries().ffmpeg,['-y','-f','lavfi','-i','color=black:size=320x240:rate=30','-f','lavfi','-i','anullsrc','-t','2','-c:v','libx264','-c:a','aac',silent]);
 const q=structuredClone(p);q.assets[0].duration=2;q.clips[0].out=2;
 assert.deepEqual((await transcribeLocally({project:q,registry:new Map([['a',{path:silent}]])}))[0].words,[]);console.log('PASS real silence no hallucinated captions');
 const cancel=new AbortController();await assert.rejects(()=>transcribeLocally({project:p,registry:new Map([['a',{path:file}]]),signal:cancel.signal,onProgress:event=>{if(event.asset)cancel.abort();}}),/cancelada/);
 assert.deepEqual((await readdir(tmpdir())).filter(n=>n.startsWith('corte-captions-')&&!before.has(n)),[]);console.log('PASS cancellation cleans temporary audio');
}finally{await rm(dir,{recursive:true,force:true});}
