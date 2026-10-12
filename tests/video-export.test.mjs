import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {run,binaries,probe,renderProject} from '../desktop/media.mjs';import {createProject,addAsset,addClip,addVideoLayer} from '../src/project.mjs';
test('actual overlay MP4 follows source trim, montage interval and does not duplicate audio',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-video-layer-'));
 try{
 const base=path.join(dir,'base.mp4'),overlay=path.join(dir,'overlay.mp4'),out=path.join(dir,'out.mp4');
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:s=160x160:r=30','-t','2','-c:v','libx264',base]);
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=80x80:r=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-filter_complex',"[0:v]drawbox=color=lime:t=fill:enable='lt(t,0.5)'[v]",'-map','[v]','-map','1:a','-t','2','-c:v','libx264','-c:a','aac',overlay]);
 const a={id:'a',name:'base',...await probe(base)},b={id:'b',name:'overlay',...await probe(overlay)};
 let p=addClip(addAsset(addAsset(createProject(),a),b),'a','c');p.aspect='1:1';p=addVideoLayer(p,{id:'l',assetId:'b',start:.5,end:1.5,in:.5,x:50,y:50,width:40,rotation:0,opacity:100});
 await renderProject(p,new Map([['a',{path:base}],['b',{path:overlay}]]),out);
 for(const t of [.25,.75,1.75]){
 const raw=path.join(dir,t+'.raw');await run(binaries().ffmpeg,['-v','error','-y','-ss',String(t),'-i',out,'-frames:v','1','-vf','scale=100:100','-f','rawvideo','-pix_fmt','rgb24',raw]);const data=await readFile(raw),i=(50*100+50)*3;
 if(t===.75)assert.ok(data[i]>180&&data[i+1]<60,'overlay starts at source trim instead of its green opening');else assert.ok(data[i+2]>180&&data[i]<60,'overlay absent outside interval');
 }
 const raw=path.join(dir,'audio.raw');await run(binaries().ffmpeg,['-v','error','-y','-i',out,'-vn','-f','s16le','-ac','1',raw]);const data=await readFile(raw);let peak=0;for(let i=0;i<data.length;i+=2)peak=Math.max(peak,Math.abs(data.readInt16LE(i)));assert.ok(peak<10,'overlay source audio is not mixed automatically');
 }finally{await rm(dir,{recursive:true,force:true});}
});
