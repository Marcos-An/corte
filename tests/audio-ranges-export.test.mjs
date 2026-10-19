import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {binaries,run,probe,renderProject} from '../desktop/media.mjs';import * as m from '../src/project.mjs';import {saveProjectFile,readProjectFile} from '../desktop/storage.mjs';
test('split music/narration interval volume and preserved fades render into real MP4 PCM',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-audio-ranges-'));
 try{
  const video=path.join(dir,'v.mp4'),audio=path.join(dir,'a.wav');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=c=blue:s=160x160:r=30','-t','6','-c:v','libx264',video]);await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','sine=f=880:r=48000','-t','8',audio]);
  for(const role of ['music','narration']){
   let p=m.addClip(m.addAsset(m.createProject(),{id:'v',name:'Vídeo',...await probe(video)}),'v','c');p.aspect='1:1';p=m.addMusic(p,{id:'a',name:'Áudio',...await probe(audio)},{id:'a1',role,in:1,out:7,start:0,volume:1,fadeIn:2,fadeOut:2});p=m.adjustAudioRange(p,'a1',1,3,.25);
   const registry=new Map([['v',{path:video}],['a',{path:audio}]]),file=path.join(dir,role+'.corte'),out=path.join(dir,role+'.mp4'),raw=path.join(dir,role+'.raw');await saveProjectFile(file,p,registry);assert.deepEqual((await readProjectFile(file)).project,p);await renderProject(p,registry,out);
   await run(binaries().ffmpeg,['-v','error','-y','-i',out,'-vn','-ac','1','-ar','48000','-f','f32le',raw]);const b=await readFile(raw);const rms=t=>{let sum=0;for(let i=Math.round((t-.025)*48000),end=i+2400;i<end;i++)sum+=b.readFloatLE(i*4)**2;return Math.sqrt(sum/2400);},full=rms(3.5);
   for(const [t,ratio] of [[.5,.25],[1.5,.1875],[2.5,.25],[4.5,.75],[5.5,.25]])assert.ok(Math.abs(rms(t)/full-ratio)<.06,`${role} gain/fade at ${t}: ${rms(t)/full}`);
   assert.ok(Math.abs((await probe(out)).duration-6)<.08);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
