import test from 'node:test';import assert from 'node:assert/strict';
import {refineBorders,requestQualityPlan} from '../desktop/quality.mjs';
import {createProject,addAsset,addClip,applyPlan} from '../src/project.mjs';
const project=()=>addClip(addAsset(createProject(),{id:'a',name:'video',duration:1,width:96,height:170,hasAudio:true}),'a','c');
test('border waits until recovery is confirmed, not partial or isolated sharp frames',()=>assert.deepEqual(refineBorders([10,30,60,100,30,100,100,100].map((sharpness,i)=>({time:i/10,sharpness})),100,.8),[[0,.7]]));
test('local quality plan operates without cloud, preserves source times and validates before applying',async()=>{
 const p=project();p.clips[0].in=.2;
 const result=await requestQualityPlan({project:p,registry:new Map([['a',{path:'/authorized.mp4'}]]),scan:async()=>({rows:[10,10,10,100,100,100,100,100,100,100].map((sharpness,i)=>({time:i/10,sharpness}))})});
 assert.deepEqual(result.plan.operations[0].ranges,[[.2,.5]]);assert.equal(applyPlan(p,result.plan).clips[0].in,.5);
});
test('missing media, cancellation and total removal never produce an applicable plan',async()=>{
 let called=false;const scan=async()=>{called=true;return {rows:[]}};
 await assert.rejects(requestQualityPlan({project:project(),registry:new Map(),scan}),/ausente/);assert.equal(called,false);
 const signal=AbortSignal.abort();await assert.rejects(requestQualityPlan({project:project(),registry:new Map(),signal,scan}),/cancelada/);
 assert.deepEqual(refineBorders([0,.1,.2].map(time=>({time,sharpness:100})),100,.3),[]);
});
test('a clip entirely within a detected bad region is rejected atomically',async()=>{
 const p=project();p.clips[0].out=.25;
 await assert.rejects(requestQualityPlan({project:p,registry:new Map([['a',{path:'/authorized.mp4'}]]),scan:async()=>({rows:[10,10,10,100,100,100,100,100,100,100].map((sharpness,i)=>({time:i/10,sharpness}))})}),/todo o trecho/);
});
test('actual FFmpeg scan honors cancellation without producing a plan',async()=>{
 const {scanQuality}=await import('../desktop/quality.mjs'),{run,binaries}=await import('../desktop/media.mjs');
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path');
 const dir=await mkdtemp(path.join(tmpdir(),'corte-quality-'));
 try{const file=path.join(dir,'video.mp4');await run(binaries().ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=size=96x170:rate=10','-t','30','-c:v','libx264',file]);const controller=new AbortController();
 await assert.rejects(scanQuality(file,{signal:controller.signal,onProgress:()=>controller.abort()}),/cancelada/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('cancelled scan waits for FFmpeg close before returning and releasing media',async t=>{
 const {createRequire,syncBuiltinESMExports}=await import('node:module'),{EventEmitter}=await import('node:events'),{PassThrough}=await import('node:stream');const require=createRequire(import.meta.url),cp=require('node:child_process');
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
 const stub=t.mock.method(cp,'spawn',()=>child);syncBuiltinESMExports();
 const {scanQuality}=await import('../desktop/quality.mjs');const controller=new AbortController();let finished=false;
 const result=scanQuality('fixture.mp4',{signal:controller.signal});const rejection=assert.rejects(result,/cancelada/).then(()=>{finished=true;});
 try{controller.abort();child.emit('error',Object.assign(new Error('abort'),{name:'AbortError'}));await new Promise(r=>setImmediate(r));assert.equal(finished,false,'AbortError is not proof that FFmpeg released the media');}
 finally{child.emit('close',1);await rejection;stub.mock.restore();syncBuiltinESMExports();child.stdout.destroy();child.stderr.destroy();}
});
