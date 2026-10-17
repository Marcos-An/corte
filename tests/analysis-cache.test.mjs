import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {cachedEvidence,evidenceIdentity} from '../desktop/analysis-cache.mjs';
async function fixture(run){const root=await mkdtemp(path.join(tmpdir(),'corte-evidence-'));try{const file=path.join(root,'source.mp4');await writeFile(file,'source');await run({root,file,assets:[{id:'source',file,duration:10}]});}finally{await rm(root,{recursive:true,force:true});}}
test('completed evidence survives rounds; source, model and sampling changes invalidate it',()=>fixture(async({root,file,assets})=>{
 let calls=0,hits=0;const configuration={model:'clip-revision-1',step:2};
 const get=(config=configuration)=>cachedEvidence({root,kind:'vision',assets,configuration:config,onHit:()=>hits++,compute:async folder=>{calls++;const image=path.join(folder,'frame.jpg');await writeFile(image,'image');return {frames:[{path:image,time:1}],index:[],report:{calls}};}});
 const first=await get();assert.deepEqual(await get(),first);assert.equal(calls,1);assert.equal(hits,1);
 await get({...configuration,step:.5});await get({...configuration,model:'clip-revision-2'});assert.equal(calls,3);
 await writeFile(file,'different source');await get();assert.equal(calls,4);
 await rm(first.frames[0].path);await get(configuration);assert.equal(calls,4,'current source cache is independent of the old source');
}));
test('deleted evidence is regenerated and canceled work never becomes a completed cache entry',()=>fixture(async({root,assets})=>{
 let calls=0;const options={root,kind:'vision',assets,configuration:{version:1},compute:async folder=>{calls++;const file=path.join(folder,'frame.jpg');await writeFile(file,'frame');return {frames:[{path:file}]};}};
 const first=await cachedEvidence(options);await rm(first.frames[0].path);await cachedEvidence(options);assert.equal(calls,2);
 const abort=new AbortController();await assert.rejects(cachedEvidence({...options,kind:'speech',signal:abort.signal,compute:async()=>{abort.abort();return [{words:[]}];}}));
 await cachedEvidence({...options,kind:'speech'});assert.equal(calls,3);
}));
test('a source replaced while scanning cannot seed a stale cache',()=>fixture(async({root,file,assets})=>{
 await assert.rejects(cachedEvidence({root,kind:'vision',assets,configuration:{},compute:async()=>{await writeFile(file,'replacement');return {frames:[]};}}),/mudou/);
}));
test('reordering clips between editing stages reuses the same source evidence',()=>fixture(async({assets})=>{
 const sources=[...assets,{...assets[0],id:'second'}];
 assert.equal(await evidenceIdentity(sources,{step:2}),await evidenceIdentity(sources.toReversed(),{step:2}));
}));
test('a worker cannot publish a cache containing deleted preview images',()=>fixture(async({root,assets})=>{
 await assert.rejects(cachedEvidence({root,kind:'vision',assets,configuration:{},compute:async folder=>({frames:[{path:path.join(folder,'missing.jpg')}],index:[]})}),{code:'ENOENT'});
}));
