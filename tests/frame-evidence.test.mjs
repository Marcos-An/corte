import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {prepareFrameEvidence} from '../desktop/frame-evidence.mjs';
test('frame preparation bounds concurrency, preserves order and caches exact source/time evidence',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-frames-'));try{
 const file=path.join(dir,'source.mp4');await writeFile(file,'source');let active=0,peak=0,calls=0;
 const selected=[{assetId:'a',time:3},{assetId:'a',time:1},{assetId:'a',time:2}],registry=new Map([['a',{path:file}]]);
 const extract=async(_file,time,out)=>{calls++;peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,time===3?30:3));await writeFile(out,'frame');active--;};
 const options={selected,registry,directory:dir,cache:dir,extract,parallel:2};
 const result=await prepareFrameEvidence(options);assert.deepEqual(result.map(f=>f.time),[3,1,2]);assert.equal(peak,2);
 await prepareFrameEvidence(options);assert.equal(calls,3,'no repeated decode of the same evidence');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('failure cancels peer extraction and is not returned as a partially prepared image list',async()=>{
 let peerStopped=false;
 const selected=[{assetId:'a',time:1},{assetId:'a',time:2}];
 await assert.rejects(prepareFrameEvidence({selected,registry:new Map([['a',{path:'/source'}]]),directory:'/unused',parallel:2,
 extract:async(_file,time,_out,signal)=>{if(time===1){await new Promise(r=>setTimeout(r,10));throw Error('decoder failed');}await new Promise(r=>signal.addEventListener('abort',r,{once:true}));peerStopped=true;signal.throwIfAborted();}}),/decoder failed/);
 assert.equal(peerStopped,true);
});
