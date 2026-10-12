// Offline real inference on the authorized video. No GPT calls.
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {scanLocally} from '../desktop/local.mjs';
import {probe} from '../desktop/media.mjs';
import {createProject,addAsset,addClip} from '../src/project.mjs';
if(!process.env.CORTE_TEST_VIDEO)throw new Error('Defina vídeo autorizado.');
const dir=await mkdtemp(path.join(tmpdir(),'corte-local-')),asset={id:'test',name:'Vídeo autorizado',...await probe(process.env.CORTE_TEST_VIDEO)};
try{const p=addClip(addAsset(createProject(),asset),'test','clip');const result=await scanLocally({project:p,registry:new Map([['test',{path:process.env.CORTE_TEST_VIDEO}]]),directory:dir,step:2});
 assert.ok(result.report.assets[0].localFrames>60);assert.ok(result.frames.length<=48);assert.ok(result.frames.some(f=>f.time>=34&&f.time<=37));assert.ok(result.frames.some(f=>f.time>=108));
 await writeFile(path.resolve(import.meta.dirname,'../../validacao-analise-local.json'),JSON.stringify(result.report,null,2));console.log('PASS LOCAL OFFLINE',JSON.stringify(result.report));
 const activeAbort=new AbortController();await assert.rejects(()=>scanLocally({project:p,registry:new Map([['test',{path:process.env.CORTE_TEST_VIDEO}]]),directory:dir,step:2,signal:activeAbort.signal,onProgress:()=>activeAbort.abort()}),/cancelada/);console.log('PASS local cancellation during processing.');
 const abort=new AbortController();abort.abort();await assert.rejects(()=>scanLocally({project:p,registry:new Map(),directory:dir,signal:abort.signal}),/cancelada/);
}finally{await rm(dir,{recursive:true,force:true});}
