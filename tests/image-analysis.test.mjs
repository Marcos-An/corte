import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {run,binaries,frame} from '../desktop/media.mjs';import {samplingArgs} from '../desktop/local.mjs';
test('photos on the primary timeline have sample coverage and can be inspected at nonzero source times',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-still-analysis-'));try{
  const photo=path.join(dir,'photo.png');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=160x90','-frames:v','1',photo]);
  await run(binaries().ffmpeg,samplingArgs(photo,2,dir,{kind:'image',duration:3}));
  assert.equal((await readdir(dir)).filter(f=>/^pool-\d+\.png$/.test(f)).length,6);
  await frame(photo,2.5,path.join(dir,'inspection.jpg'),undefined,{width:720});
 }finally{await rm(dir,{recursive:true,force:true});}
});
