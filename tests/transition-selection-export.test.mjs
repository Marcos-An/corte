import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import * as project from '../src/project.mjs';
import {binaries,run,probe,renderProject} from '../desktop/media.mjs';

test('a requested transition can stay wholly inside the surviving selections at different speeds',()=>{
 let p=project.createProject();
 p=project.addAsset(p,{id:'a',name:'source',duration:12,width:160,height:90,hasAudio:false});
 p=project.addClip(p,'a','left');p=project.editProject(p,{type:'trim',clipId:'left',in:0,out:4});
 p=project.addClip(p,'a','right');p=project.editProject(p,{type:'trim',clipId:'right',in:6,out:12});
 p.clips[0].speed=2;p.clips[1].speed=1.5;
 const q=project.simulatePlan(p,{summary:'Internal transition handles',questions:[],unsupported:[],operations:[{type:'set_transition_at',index:0,effect:'dissolve',duration:.4,makeRoom:true,insideSelection:true}]});
 assert.equal(q.clips[0].out,3.6);assert.equal(q.clips[1].in,6.3);
 const cut=(q.clips[0].out-q.clips[0].in)/2;
 for(const offset of [-.2,0,.199]){const at=project.transitionAt(q,cut+offset);assert.ok(at.leftTime<4.00001);assert.ok(at.rightTime>=5.99999);}
 assert.equal(p.clips[0].out,4,'original selection is not mutated');
 assert.throws(()=>project.simulatePlan(p,{summary:'Invalid request',questions:[],unsupported:[],operations:[{type:'set_transition_at',index:0,effect:'dissolve',duration:.4,insideSelection:true}]}),/margem|prepara/i);
});

test('real export never blends the green footage removed between red and blue',async()=>{
 const dir=await fs.mkdtemp(path.join(tmpdir(),'corte-inside-transition-'));
 try{
  const file=path.join(dir,'source.mp4');
  await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=160x90:r=30:d=6','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-vf',"drawbox=color=lime:t=fill:enable='gte(t,2)*lt(t,4)',drawbox=color=blue:t=fill:enable='gte(t,4)'",'-t','6','-c:v','libx264','-c:a','aac',file]);
  let p=project.addClip(project.addAsset(project.createProject(),{id:'a',name:'marked source',...await probe(file)}),'a','clip');p.aspect='16:9';
  p=project.simulatePlan(p,{summary:'Remove marked footage and use retained handles',questions:[],unsupported:[],operations:[{type:'remove_ranges',clipId:'clip',ranges:[[2,4]]},{type:'set_transition_at',index:0,effect:'dissolve',duration:.4,makeRoom:true,insideSelection:true}]});
  const output=path.join(dir,'render.mp4');await renderProject(p,new Map([['a',{path:file}]]),output);
  const raw=path.join(dir,'pixels.rgb');await run(binaries().ffmpeg,['-v','error','-y','-i',output,'-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24',raw]);
  const pixels=await fs.readFile(raw);let maxGreen=0,mixed=0;
  for(let i=0;i<pixels.length;i+=3){maxGreen=Math.max(maxGreen,pixels[i+1]);if(pixels[i]>30&&pixels[i+2]>30)mixed++;}
  assert.ok(maxGreen<15,`Removed green frames must never return: maximum green ${maxGreen}`);
  assert.ok(mixed>=3,'Dissolve must visibly blend the kept red and blue footage');
  const metadata=await probe(output);assert.ok(metadata.hasAudio);assert.ok(Math.abs(metadata.duration-3.6)<.04);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
