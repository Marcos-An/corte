import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {run,binaries,probe,renderProject} from '../desktop/media.mjs';import {createProject,addAsset,addClip,editProject} from '../src/project.mjs';
test('real FFmpeg export combines cropped/trimmed audio and silent footage without modifying sources',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-render-test-')),aFile=path.join(dir,'audio.mp4'),bFile=path.join(dir,'silent.mp4');
 try {
  await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=red:s=320x240:r=30','-f','lavfi','-i','sine=frequency=600:sample_rate=48000','-t','2','-c:v','libx264','-c:a','aac',aFile]);
  await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=blue:s=320x240:r=30','-t','2','-c:v','libx264',bFile]);
  const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex'),before=await hash(aFile);
  const a={id:'a',name:'a',...await probe(aFile)},b={id:'b',name:'b',...await probe(bFile)};
  let p=addClip(addClip(addAsset(addAsset(createProject(),a),b),'a','c'),'b','d');
  p=editProject(p,{type:'trim',clipId:'c',in:.5,out:1.5});p=editProject(p,{type:'update',clipId:'c',crop:{x:0,y:0,w:1,h:.75},volume:.5});
  p=editProject(p,{type:'trim',clipId:'d',in:0,out:1});p=editProject(p,{type:'set_aspect',aspect:'1:1'});
  const registry=new Map([['a',{path:aFile}],['b',{path:bFile}]]),output=path.join(dir,'out.mp4');
  await renderProject(p,registry,output);const result=await probe(output);assert.equal(result.width,720);assert.equal(result.height,720);assert.ok(result.hasAudio);assert.ok(Math.abs(result.duration-2)<.15);
  const decoded=await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-ss','1.5','-i',output,'-vf','crop=2:2:359:359','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
  // Playback/export decoded a real frame; process succeeded (not merely file existence).
  assert.ok(decoded.stdout.length>0);assert.equal(await hash(aFile),before);
  await assert.rejects(()=>renderProject(p,registry,aFile),/original/);
  const abort=new AbortController();abort.abort();await assert.rejects(()=>renderProject(p,registry,path.join(dir,'cancel.mp4'),{signal:abort.signal}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
