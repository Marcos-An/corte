import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';
import {run,binaries,probe,renderProject} from '../desktop/media.mjs';import * as m from '../src/project.mjs';
// Entrance/exit presets are stored as a choice only; the MP4 must still show them (image overlay and ASS shape paths).
test('motion presets reach the exported MP4 for image and shape layers',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-motion-export-'));try{
  const source=path.join(dir,'blue.mp4'),image=path.join(dir,'red.png');
  await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:s=320x320:r=30','-t','3','-c:v','libx264',source]);
  await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=80x80','-frames:v','1',image]);
  let base=m.addClip(m.addAsset(m.createProject(),{id:'base',name:'blue',...await probe(source)}),'base','c');base.aspect='1:1';
  const registry=new Map([['base',{path:source}],['image',{path:image}]]);
  const cases={
   image:p=>m.addImageLayer(m.addAsset(p,{id:'image',name:'red',kind:'image',duration:5,width:80,height:80,hasAudio:false}),{id:'layer',assetId:'image',start:.5,end:2.5,x:50,y:50,width:40,rotation:0,opacity:100}),
   shape:p=>m.addShapeLayer(p,{id:'layer',type:'rectangle',start:.5,end:2.5,x:50,y:50,width:40,height:40,rotation:0,opacity:100,fill:'#ff0000',stroke:null,strokeWidth:1}),
  };
  for(const [name,add] of Object.entries(cases)){
   const q=m.setMotion(add(base),'layer',{enter:'fade',exit:'left'}),out=path.join(dir,name+'.mp4');
   await renderProject(q,registry,out,{height:720});
   const centre=async time=>{const raw=path.join(dir,`${name}-${time}.raw`);await run(binaries().ffmpeg,['-v','error','-y','-ss',String(time),'-i',out,'-frames:v','1','-vf','scale=200:200','-f','rawvideo','-pix_fmt','rgb24',raw]);const b=await readFile(raw),i=(100*200+100)*3;return [b[i],b[i+1],b[i+2]];};
   const entering=await centre(.55),settled=await centre(1.5),leaving=await centre(2.47);
   assert.ok(settled[0]>180&&settled[2]<80,`${name}: settled pose is red ${settled}`);
   assert.ok(entering[2]>entering[0],`${name}: fade-in starts mostly transparent ${entering}`);
   assert.ok(leaving[2]>leaving[0],`${name}: exit moves left and fades ${leaving}`);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
