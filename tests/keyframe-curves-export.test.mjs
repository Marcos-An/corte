import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';
import {binaries,run,probe,renderProject} from '../desktop/media.mjs';import {saveProjectFile,readProjectFile} from '../desktop/storage.mjs';import * as m from '../src/project.mjs';
test('cropped nonlinear image, video, shape and text curves reach measured MP4 positions and alpha',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-curved-export-'));try{
  const base=path.join(dir,'base.mp4'),video=path.join(dir,'red.mp4'),image=path.join(dir,'red.png');
  for(const [file,color,seconds]of [[base,'black',4],[video,'red',1]])await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i',`color=${color}:s=160x160:r=30`,'-t',String(seconds),'-c:v','libx264',file]);
  await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=80x80','-frames:v','1',image]);
  let p=m.addClip(m.addAsset(m.createProject(),{id:'b',name:'base',...await probe(base)}),'b','c');p.aspect='1:1';p=m.addAsset(p,{id:'v',name:'red video',...await probe(video)});p=m.addAsset(p,{id:'i',name:'red image',...await probe(image)});
  const types=['image','video','shape','text'],easings=['ease-in','ease-out','ease-in-out','ease-in'];
  for(const [index,id]of types.entries()){
   const start=index+.1,end=index+.9,pose={id,start,end,x:20,y:50,width:20,rotation:0,opacity:100};
   if(id==='image')p=m.addImageLayer(p,{...pose,assetId:'i'});else if(id==='video')p=m.addVideoLayer(p,{...pose,assetId:'v',in:0});else if(id==='shape')p=m.addShapeLayer(p,{...pose,type:'rectangle',height:20,fill:'#ff0000',stroke:null,strokeWidth:0});else p=m.addTextLayer(p,{id,start,end,text:'HH',style:{font:'Bebas Neue',size:6,color:'#ff0000',position:'center',preset:'clean',strokeWidth:0}});
   p=m.setKeyframe(p,id,0,{x:20,y:50,size:id==='text'?6:20,opacity:40,easing:easings[index]});p=m.setKeyframe(p,id,.8,{x:80,y:50,size:id==='text'?8:30,opacity:100});
   p=({image:m.editImageLayer,video:m.editVideoLayer,shape:m.editShapeLayer,text:m.editTextLayer})[id](p,id,{start:index+.2,end:index+.8});
  }
  const registry=new Map([['b',{path:base}],['v',{path:video}],['i',{path:image}]]),saved=path.join(dir,'curves.corte');await saveProjectFile(saved,p,registry);p=(await readProjectFile(saved)).project;
  const out=path.join(dir,'curves.mp4');await renderProject(p,registry,out,{height:720});assert.ok(Math.abs((await probe(out)).duration-4)<.08);
  for(const [index,id]of types.entries())for(const u of [.25,.75]){
   const time=index+.1+.8*u,raw=path.join(dir,`${id}-${u}.raw`);await run(binaries().ffmpeg,['-v','error','-y','-ss',String(time),'-i',out,'-frames:v','1','-vf','scale=720:720','-f','rawvideo','-pix_fmt','rgb24',raw]);
   const b=await readFile(raw),points=[],reds=[];for(let i=0;i<b.length;i+=3)if(b[i]>18&&b[i]>b[i+1]+12&&b[i]>b[i+2]+12){points.push([i/3%720,Math.floor(i/3/720)]);reds.push(b[i]);}
   assert.ok(points.length>10,`${id} rendered`);// Measure the flat colour core on the native pixel grid; codec edge ringing is not opacity.
   reds.sort((a,b)=>a-b);const red=reds[Math.floor(reds.length*(id==='text'?.9:.75))],f=easings[index]==='ease-in'?u*u:easings[index]==='ease-out'?1-(1-u)**2:u*u*(3-2*u),x=(20+60*f)*7.2,left=Math.min(...points.map(p=>p[0])),right=Math.max(...points.map(p=>p[0]));
   assert.ok(Math.abs((left+right)/2-x)<3,`${id} ${u}: centre ${(left+right)/2} vs ${x}`);assert.ok(Math.abs(red-255*(.4+.6*f))<20,`${id} ${u}: alpha ${red}`);
   if(id!=='text')assert.ok(Math.abs(right-left-(20+10*f)*7.2)<5,`${id} curved size`);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
