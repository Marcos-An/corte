// Real offline recognition: the same audio has distinct cached analyses per language setting.
import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {probe} from '../desktop/media.mjs';import {transcribeLocally} from '../desktop/transcribe.mjs';import * as m from '../src/project.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'corte-speech-language-'));
try{
 const audio=path.resolve(import.meta.dirname,'fixtures/captions-en-US.m4a'),truth=JSON.parse((await readFile(path.resolve(import.meta.dirname,'fixtures/captions-en-US.json'),'utf8')).replace(/^\ufeff/,'')),asset={id:'a',name:'English speech',kind:'audio',...await probe(audio)};
 let p=m.createProject();p=m.addMusic(p,asset,{id:'n',role:'narration',start:0,in:0,out:asset.duration,volume:1});p.captionSource='narration';const registry=new Map([['a',{path:audio}]]),report=[];
 for(const language of ['en','en','auto','auto','pt','en']){
  const events=[],started=performance.now(),[t]=await transcribeLocally({project:{...p,speechLanguage:language},registry,cache:dir,onProgress:e=>events.push(e)}),cached=events.some(e=>e.cached);
  assert.equal(t.language,language);assert.ok(t.words.every(w=>w.start>=0&&w.end<=asset.duration));
  if(language==='en'||language==='auto')for(const word of truth.expectedWords)assert.ok(t.words.map(w=>w.text).join(' ').toLowerCase().includes(word),`${language}: missing ${word}`);
  report.push({language,cached,elapsedMs:Math.round(performance.now()-started),text:t.words.map(w=>w.text).join(' ')});
 }
 assert.deepEqual(report.map(r=>r.cached),[false,true,false,true,false,true]);console.log(JSON.stringify({passed:true,mediaSent:false,report}));
}finally{await rm(dir,{recursive:true,force:true});}
