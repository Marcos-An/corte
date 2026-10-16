import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createMediaRegistration} from '../desktop/import-media.mjs';
import {run} from '../desktop/media.mjs';
async function fixture(fn){const dir=await mkdtemp(path.join(tmpdir(),'corte-register-'));try{const file=path.join(dir,'video.mp4');await writeFile(file,'fixture');await fn({dir,file});}finally{await rm(dir,{recursive:true,force:true});}}
const info={duration:9,width:160,height:90,hasAudio:true};
test('validated media becomes available without waiting for a thumbnail; thumbnail failure is nonfatal',()=>fixture(async({dir,file})=>{
 let finish,frameStarted;const started=new Promise(r=>frameStarted=r);const warnings=[];const registration=createMediaRegistration({cache:dir,probe:async()=>info,frame:()=>{frameStarted();return new Promise((_r,reject)=>finish=reject);},onWarning:w=>warnings.push(w)});
 const entry=await registration.register(file);assert.deepEqual(entry.asset,{id:entry.asset.id,name:'video.mp4',...info});assert.ok(entry.thumbnailReady instanceof Promise);
 await started;finish(Error('decoder stalled'));assert.equal(await entry.thumbnailReady,false);assert.equal(warnings.length,1);assert.match(warnings[0],/miniatura/i);
}));
test('metadata probing has a short deadline and reports which file and stage failed',()=>fixture(async({dir,file})=>{
 const registration=createMediaRegistration({cache:dir,probe:async(_file,options)=>{assert.equal(options.timeout,15000);await run(process.execPath,['-e','setTimeout(()=>{},60000)'],{...options,timeout:35});},frame:async()=>{throw Error('must not decode');}});
 await assert.rejects(registration.register(file),e=>/video\.mp4/.test(e.message)&&/validar/i.test(e.message)&&/limite/i.test(e.message));
}));
test('abort is forwarded to metadata; corrupt or mismatched media is not accepted',()=>fixture(async({dir,file})=>{
 const controller=new AbortController();const registration=createMediaRegistration({cache:dir,probe:async(_file,{signal})=>{assert.ok(signal instanceof AbortSignal);controller.abort();signal.throwIfAborted();},frame:async()=>{}});
 await assert.rejects(registration.register(file,{signal:controller.signal}),/cancelad/i);
 const mismatch=createMediaRegistration({cache:dir,probe:async()=>info,frame:async()=>{throw Error('must not decode');}});
 await assert.rejects(mismatch.register(file,{expected:{id:'a',...info,duration:10}}),/diferente/i);
}));
test('progress identifies validation and records elapsed time without sharing full paths',()=>fixture(async({dir,file})=>{
 const progress=[];const registration=createMediaRegistration({cache:dir,probe:async()=>info,frame:async()=>{},onProgress:p=>progress.push(p)});
 const entry=await registration.register(file);await entry.thumbnailReady;assert.equal(progress[0].stage,'media');assert.match(progress[0].message,/video\.mp4/);assert.equal(progress[0].message.includes(dir),false);assert.ok(progress[0].elapsedMs>=0);
}));
test('shutdown cancels active and queued thumbnails without making media invalid',()=>fixture(async({dir,file})=>{
 let started;const timings=[];const active=new Promise(r=>started=r);const registration=createMediaRegistration({cache:dir,onTiming:t=>timings.push(t),probe:async()=>info,frame:async(_f,_t,_o,signal)=>{started();await new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(Error('canceled')),{once:true}));}});
 const first=await registration.register(file);await active;const second=await registration.register(file);registration.cancelThumbnails();assert.equal(await first.thumbnailReady,false);assert.equal(await second.thumbnailReady,false);assert.equal(timings.find(t=>t.stage==='thumbnail').outcome,'canceled');
}));
test('thumbnail cache survives reopening and is invalidated when the source changes',()=>fixture(async({dir,file})=>{
 let frames=0;const options={cache:dir,probe:async()=>info,frame:async(_file,_time,out)=>{frames++;await writeFile(out,'thumbnail');}};
 const a=await createMediaRegistration(options).register(file);assert.equal(await a.thumbnailReady,true);
 const b=await createMediaRegistration(options).register(file);assert.equal(await b.thumbnailReady,true);assert.equal(frames,1,'a new registration instance reuses the persistent thumbnail');assert.equal(a.thumbnail,b.thumbnail);
 await writeFile(file,'fixture changed');const c=await createMediaRegistration(options).register(file);await c.thumbnailReady;assert.equal(frames,2);assert.notEqual(c.thumbnail,a.thumbnail);
}));
test('timings distinguish filesystem, probe and thumbnail without recording names or paths',()=>fixture(async({dir,file})=>{
 const timings=[];const r=createMediaRegistration({cache:dir,probe:async()=>info,frame:async(_f,_t,out)=>writeFile(out,'image'),onTiming:t=>timings.push(t)});const a=await r.register(file);await a.thumbnailReady;
 for(const stage of ['filesystem','probe','thumbnail'])assert.ok(timings.some(t=>t.stage===stage&&t.elapsedMs>=0),stage);
 assert.equal(JSON.stringify(timings).includes(file),false);assert.equal(JSON.stringify(timings).includes('video.mp4'),false);
}));
test('a partially written thumbnail from a failed decoder is never reused as cache',()=>fixture(async({dir,file})=>{
 let calls=0;const r=createMediaRegistration({cache:dir,probe:async()=>info,frame:async(_f,_t,out)=>{calls++;await writeFile(out,calls===1?'partial':'complete');if(calls===1)throw Error('decoder interrupted');}});
 const first=await r.register(file);assert.equal(await first.thumbnailReady,false);const second=await r.register(file);assert.equal(await second.thumbnailReady,true);assert.equal(calls,2,'failed partial output must be regenerated');
}));
