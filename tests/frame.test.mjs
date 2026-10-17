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
test('AI refinement supports compact 8-bit RGB evidence at 720px without changing the default thumbnail size',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-frame-rgb-'));try{
 const video=path.join(dir,'source.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=160x90:r=4','-t','1','-c:v','libx264',video]);
 const out=path.join(dir,'evidence.jpg');await frame(video,.25,out,undefined,{width:720});const {RawImage}=await import('@huggingface/transformers'),image=await RawImage.read(out);assert.equal(image.width,720);assert.equal(image.channels,3);assert.ok(image.data[0]>200&&image.data[1]<10);await assert.rejects(frame(video,0,out,undefined,{width:NaN}),/resolução/i);
 const normal=path.join(dir,'thumbnail.jpg');await frame(video,0,normal);assert.equal((await RawImage.read(normal)).width,480);
 const tall=path.join(dir,'tall.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:s=1080x1920:r=4','-t','1','-c:v','libx264',tall]);
 const preview=path.join(dir,'tall.jpg');await frame(tall,.25,preview,undefined,{width:720});const t=await RawImage.read(preview);assert.equal(t.height,720,'vertical previews are bounded by their long side');assert.ok(t.width<=406);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('JPEG previews remain writable under long Windows cache paths',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-long-preview-'));try{
 const {mkdir}=await import('node:fs/promises'),nested=path.join(dir,...Array(6).fill('long-cache-directory-0123456789'));await mkdir(nested,{recursive:true});
 const source=path.join(dir,'source.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=64x64:r=1','-t','1','-c:v','libx264',source]);
 const out=path.join(nested,'preview.jpg');await frame(source,0,out,undefined,{width:720});assert.ok((await readFile(out)).length>0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
