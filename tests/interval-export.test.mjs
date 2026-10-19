import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {run,binaries,probe,renderProject} from '../desktop/media.mjs';import * as m from '../src/project.mjs';
test('interval volume, brightness and inherited fades agree with decoded MP4 pixels and PCM',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-interval-export-'));try{
 const source=path.join(dir,'source.mp4'),out=path.join(dir,'out.mp4'),pcm=path.join(dir,'audio.raw');
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=gray:s=160x160:r=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-c:v','libx264','-c:a','aac',source]);
 let p=m.addClip(m.addAsset(m.createProject(),{id:'a',name:'gray',...await probe(source)}),'a','c');p.aspect='1:1';p=m.editProject(p,{type:'update',clipId:'c',fadeIn:4,fadeOut:4});
 p=m.applyPlan(p,{summary:'Refinar',questions:[],unsupported:[],operations:[{type:'adjust_timeline',clipId:null,start:2,end:6,patch:{volume:.5}},{type:'adjust_timeline',clipId:null,start:3,end:5,patch:{adjustments:{brightness:.15}}}]});
 await renderProject(p,new Map([['a',{path:source}]]),out,{height:720});await run(binaries().ffmpeg,['-v','error','-y','-i',out,'-vn','-ac','1','-ar','48000','-f','f32le',pcm]);
 const b=await readFile(pcm),rms=t=>{let sum=0,start=Math.round((t-.025)*48000);for(let i=start;i<start+2400;i++)sum+=b.readFloatLE(i*4)**2;return Math.sqrt(sum/2400);};
 const reference=rms(1)/.25;for(const t of [1,2.5,3.5,4.5,5.5,7]){const fade=Math.min(1,t/4)*Math.min(1,(8-t)/4),volume=t>=2&&t<6?.5:1;assert.ok(Math.abs(rms(t)/reference-fade*volume)<.04,'decoded audio amplitude at '+t+' actual='+rms(t)/reference+' expected='+fade*volume);}
 const pixels=[];for(const t of [1,4,7]){const f=path.join(dir,`pixel-${t}.raw`);await run(binaries().ffmpeg,['-v','error','-y','-ss',String(t),'-i',out,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo',f]);pixels.push([...await readFile(f)]);}
 assert.ok(pixels[1][0]-pixels[0][0]>30,'brightness only in requested interval');assert.ok(Math.abs(pixels[2][0]-pixels[0][0])<3,'outside unchanged');assert.ok(Math.abs((await probe(out)).duration-8)<.1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
