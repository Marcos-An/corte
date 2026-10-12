import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {binaries,run,frame} from '../desktop/media.mjs';
test('frame extraction rejects empty EOF output rather than reusing a previous image',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-frame-'));
 try{const video=path.join(dir,'short.mp4'),out=path.join(dir,'image.jpg');
 await run(binaries().ffmpeg,['-v','error','-f','lavfi','-i','color=c=red:s=64x64:d=1','-c:v','libx264',video]);
 await frame(video,0,out);assert.ok((await readFile(out)).length>0);
 await assert.rejects(frame(video,1.5,out),/frame|imagem/i);
 await assert.rejects(readFile(out),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
