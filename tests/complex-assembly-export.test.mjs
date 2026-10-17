import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {binaries,run,probe,renderProject} from '../desktop/media.mjs';import {createProject,addAsset,addClip,applyPlan,duration} from '../src/project.mjs';
test('interval order, inserted ending, transition and imported voice reach actual MP4 pixels and PCM',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-story-export-'));try{
  const video=path.join(dir,'video.mp4'),voice=path.join(dir,'voice.wav'),out=path.join(dir,'out.mp4');
  await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=160x160:r=30','-t','8','-vf',"drawbox=color=lime:t=fill:enable='gte(t,2)*lt(t,4)',drawbox=color=blue:t=fill:enable='gte(t,4)*lt(t,6)',drawbox=color=yellow:t=fill:enable='gte(t,6)'",'-c:v','libx264',video]);
  await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','sine=frequency=1100:duration=3','-c:a','pcm_s16le',voice]);
  let p=addClip(addAsset(createProject(),{id:'v',name:'Restaurant',...await probe(video)}),'v','c');p.aspect='1:1';p=addAsset(p,{id:'a',name:'Narration',...await probe(voice)});
  const q=applyPlan(p,{summary:'Story',questions:[],unsupported:[],operations:[{type:'move_range',clipId:'c',sourceStart:2,sourceEnd:4,index:0},
   {type:'insert_clip',index:3,clip:{id:'end',assetId:'v',in:6,out:8,volume:0,crop:{x:0,y:0,w:1,h:1}}},
   {type:'set_transition_at',index:0,effect:'dissolve',duration:.4,makeRoom:true},
   {type:'add_video',layer:{id:'poster',assetId:'v',in:2,freeze:true,start:4,end:9,x:50,y:50,width:100,rotation:0,opacity:100}},
   {type:'add_audio',track:{id:'vo',assetId:'a',in:0,out:3,start:0,volume:1,role:'narration',fadeIn:.1,fadeOut:.1}}]});
  await renderProject(q,new Map([['v',{path:video}],['a',{path:voice}]]),out);assert.ok(Math.abs((await probe(out)).duration-duration(q))<.08);
  const raw=path.join(dir,'frame.raw');await run(binaries().ffmpeg,['-v','error','-y','-ss','0.5','-i',out,'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24',raw]);const rgb=await readFile(raw);assert.ok(rgb[1]>180&&rgb[0]<60,'selected green interval opens the film');
  await run(binaries().ffmpeg,['-v','error','-y','-ss','8.5','-i',out,'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24',raw]);const held=await readFile(raw);assert.ok(held[1]>180&&held[0]<60,'poster frame holds beyond its original source duration');
  const pcm=path.join(dir,'audio.raw');await run(binaries().ffmpeg,['-v','error','-y','-ss','0.5','-i',out,'-t','0.4','-vn','-ac','1','-f','s16le',pcm]);const bytes=await readFile(pcm);let energy=0;for(let i=0;i<bytes.length;i+=2)energy+=bytes.readInt16LE(i)**2;assert.ok(Math.sqrt(energy/(bytes.length/2))>1000,'imported voice is audible');
 }finally{await rm(dir,{recursive:true,force:true});}
});
