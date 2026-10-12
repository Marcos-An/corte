import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileResponse} from '../desktop/stream.mjs';
test('video protocol serves byte ranges, suffix, full response and rejects invalid range',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-stream-'));const file=path.join(dir,'v.mp4');await writeFile(file,'0123456789');
 try {
  const r=await fileResponse(file,new Request('https://local',{headers:{Range:'bytes=2-5'}}));
  assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 2-5/10');assert.equal(r.headers.get('Content-Length'),'4');assert.equal(await r.text(),'2345');
  const suffix=await fileResponse(file,new Request('https://local',{headers:{Range:'bytes=-3'}}));assert.equal(await suffix.text(),'789');
  const full=await fileResponse(file,new Request('https://local'));assert.equal(full.status,200);assert.equal(await full.text(),'0123456789');
  const bad=await fileResponse(file,new Request('https://local',{headers:{Range:'bytes=20-30'}}));assert.equal(bad.status,416);
  const head=await fileResponse(file,new Request('https://local',{method:'HEAD'}));assert.equal(await head.text(),'');
 } finally {await rm(dir,{recursive:true,force:true});}
});
