import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {createDiagnostics} from '../desktop/diagnostics.mjs';
test('local timings are bounded, sanitized and readable without paths or raw errors',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-timings-'));try{const file=path.join(dir,'timings.jsonl'),log=createDiagnostics(file,{limitBytes:600});
 for(let i=0;i<12;i++)log.record({stage:'probe',elapsedMs:i,outcome:'ok',path:'/private/video.mp4',message:'SECRET',operationId:'sample'});
 await log.flush();const text=await log.read();assert.ok(Buffer.byteLength(text)<=600);assert.doesNotMatch(text,/private|SECRET|video\.mp4/);assert.ok(text.split('\n').filter(Boolean).every(s=>JSON.parse(s).stage==='probe'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
