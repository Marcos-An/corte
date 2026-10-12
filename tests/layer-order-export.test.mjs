import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {run,binaries,probe,renderProject} from '../desktop/media.mjs';import * as m from '../src/project.mjs';import {saveProjectFile,readProjectFile} from '../desktop/storage.mjs';
test('interleaved text/image/video order survives persistence and actual MP4 frames',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-order-'));
 try{
 const video=path.join(dir,'blue.mp4'),green=path.join(dir,'green.mp4'),image=path.join(dir,'red.png');
 for(const [file,color] of [[video,'blue'],[green,'lime']])await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i',`color=${color}:s=160x160:r=30`,'-t','1','-c:v','libx264',file]);
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=80x80','-frames:v','1',image]);
 const a={id:'v',name:'v',...await probe(video)},b={id:'g',name:'g',...await probe(green)},c={id:'i',name:'i',...await probe(image)};
 let p=m.addClip(m.addAsset(m.addAsset(m.addAsset(m.createProject(),a),b),c),'v','clip');p.aspect='1:1';
 const place={start:0,end:1,x:50,y:50,width:70,rotation:0,opacity:100};p=m.addImageLayer(p,{...place,id:'il',assetId:'i'});p=m.addVideoLayer(p,{...place,id:'vl',assetId:'g',in:0});p=m.addTextLayer(p,{id:'t',text:'TESTE',start:0,end:1,style:{font:'Arial',size:10,color:'#ffffff',preset:'clean',position:'center'}});
 const registry=new Map([['v',{path:video}],['g',{path:green}],['i',{path:image}]]);
 for(const [name,q,color] of [['legacy',p,'white'],['image',m.moveLayer(p,'il','front'),'red'],['video',m.moveLayer(m.moveLayer(p,'il','front'),'vl','front'),'green']]){
 const saved=path.join(dir,name+'.corte');await saveProjectFile(saved,q,registry);const reopened=(await readProjectFile(saved)).project;assert.deepEqual(m.layerOrder(reopened),m.layerOrder(q));
 const out=path.join(dir,name+'.mp4'),raw=path.join(dir,name+'.raw');await renderProject(reopened,registry,out);await run(binaries().ffmpeg,['-v','error','-y','-ss','0.5','-i',out,'-frames:v','1','-vf','scale=180:180','-f','rawvideo','-pix_fmt','rgb24',raw]);const pixels=await readFile(raw);let white=0;
 for(let y=70;y<110;y++)for(let x=45;x<135;x++){const i=(y*180+x)*3;if(pixels[i]>180&&pixels[i+1]>180&&pixels[i+2]>180)white++;}
 if(color==='white')assert.ok(white>50,'legacy text remains over media');else{assert.equal(white,0,'media moved to front must cover the text');const i=(90*180+90)*3;assert.ok(pixels[i+(color==='red'?0:1)]>180);}
 }
 }finally{await rm(dir,{recursive:true,force:true});}
});
