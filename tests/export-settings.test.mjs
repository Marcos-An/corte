import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';
import * as m from '../src/project.mjs';import {runExportBatch} from '../desktop/export-batch.mjs';
import {binaries,run,probe,renderProject,dimensions} from '../desktop/media.mjs';import {validateExportOutput,validateExportSettings} from '../src/export-output.mjs';import {trackingFixture} from './tracking-fixture.mjs';import {assFrameInterval,keyframeSamples} from '../src/keyframes.mjs';
test('new export settings accept 4K/60 and retain older saved output options',()=>{
 assert.deepEqual(dimensions('16:9',2160),{width:3840,height:2160});assert.deepEqual(dimensions('9:16',2160),{width:2160,height:3840});
 for(const fps of [24,25,30,50,60])assert.equal(validateExportSettings({fps}).fps,fps);
 assert.deepEqual(validateExportOutput({aspect:null,height:2160,fps:60,quality:'high'}).exportOptions,{aspect:null,height:2160,fps:60,quality:'high'});
 for(const settings of [{fps:120},{fps:'60'},{height:4320},{quality:'fake'}])assert.throws(()=>validateExportSettings(settings));
 // Every animation sample must be visible at the intended frame on all clocks.
 for(const fps of [24,25,30,50,60])for(let i=1;i<fps;i++){const r=assFrameInterval(i/fps,(i+1)/fps,fps);assert.ok(r.start<=i/fps&&r.end>i/fps&&r.end<=(i+1)/fps);}
});
test('60fps interval keeps a real dissolve and every animation frame; batch overrides inherit independently',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-60-clock-'));try{
  let p=m.createProject();p.aspect='16:9';const registry=new Map();
  for(const [i,color]of ['red','blue'].entries()){const file=path.join(dir,color+'.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i',`color=${color}:s=160x90:r=60`,'-t','1.5','-c:v','libx264',file]);p=m.addClip(m.addAsset(p,{id:color,name:color,...await probe(file)}),color,'c'+i);p=m.editProject(p,{type:'trim',clipId:'c'+i,in:.2,out:1.2});registry.set(color,{path:file});}
  p=m.setTransition(p,'c0','c1','dissolve',.2);p=m.addShapeLayer(p,{id:'moving',type:'rectangle',start:0,end:2,x:10,y:20,width:5,height:5,rotation:0,opacity:100,fill:'#00ff00',stroke:null,strokeWidth:0});p=m.setKeyframe(p,'moving',0,{x:10});p=m.setKeyframe(p,'moving',2,{x:90});
  const out=path.join(dir,'range.mp4'),raw=path.join(dir,'range.rgb');await renderProject(p,registry,out,{fps:60,range:{start:.75,end:1.25}});await run(binaries().ffmpeg,['-v','error','-y','-i',out,'-an','-f','rawvideo','-pix_fmt','rgb24',raw]);const bytes=await readFile(raw),stride=1280*720*3;assert.equal(bytes.length/stride,30);
  let last=0;for(let frame=0;frame<30;frame++){let sum=0,n=0;for(let y=100;y<180;y++)for(let x=300;x<1000;x++){const i=frame*stride+(y*1280+x)*3;if(bytes[i]<70&&bytes[i+1]>160&&bytes[i+2]<70){sum+=x;n++;}}assert.ok(n>200);const center=sum/n,expected=1280*(.1+.4*(.75+frame/60));assert.ok(Math.abs(center-expected)<2,'60fps animation frame '+frame+' '+center+' '+expected);assert.ok(center>last+5);last=center;}
  const pixel=(frame)=>{const i=frame*stride+(500*1280+640)*3;return [...bytes.subarray(i,i+3)];};assert.ok(pixel(0)[0]>200&&pixel(29)[2]>200);assert.ok(pixel(15)[0]>70&&pixel(15)[2]>70,'dissolve actually mixes both sources at the cut');
  const result=await runExportBatch({project:p,registry,directory:dir,height:720,fps:60,quality:'high',jobs:[{id:'a',name:'inherited',start:0,end:.4},{id:'b',name:'override',start:0,end:.4,exportOptions:{aspect:null,height:null,fps:25,quality:'compact'}}]});assert.equal(result.error,null);for(const [i,file]of result.completed.entries()){const info=JSON.parse((await run(binaries().ffprobe,['-v','error','-show_streams','-of','json',file.path])).stdout).streams.find(s=>s.codec_type==='video');assert.equal(info.avg_frame_rate,i?'25/1':'60/1');}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('real 4K60 MP4 retains distinct input frames; 30fps zoom has the correct 60fps duration',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-4k-'));try{
  const {p,registry}=await trackingFixture(dir);p.shapeLayers=[];delete p.layerOrder;p.clips[0].out=.4;
  const out=path.join(dir,'4k60.mp4'),start=performance.now();await renderProject(p,registry,out,{height:2160,fps:60,quality:'high'});
  const info=JSON.parse((await run(binaries().ffprobe,['-v','error','-show_streams','-show_format','-of','json',out])).stdout),video=info.streams.find(s=>s.codec_type==='video');assert.equal(video.width,3840);assert.equal(video.height,2160);assert.equal(video.avg_frame_rate,'60/1');assert.equal(Number(video.nb_frames),24);assert.ok(info.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(Number(info.format.duration)-.4)<.03);
  const hashes=(await run(binaries().ffmpeg,['-v','error','-i',out,'-map','0:v','-f','framemd5','-'])).stdout.split('\n').filter(s=>/^0,/.test(s)).map(s=>s.split(',').at(-1).trim());assert.equal(new Set(hashes).size,24);
  const input30=path.join(dir,'source30.mp4');await run(binaries().ffmpeg,['-v','error','-y','-i',registry.get('v').path,'-r','30','-c:v','libx264','-c:a','copy',input30]);registry.set('v',{path:input30});p.clips[0].out=1.5;p.clips[0].zoom={from:1,to:1.4};const zoom=path.join(dir,'zoom60.mp4');await renderProject(p,registry,zoom,{fps:60});const z=JSON.parse((await run(binaries().ffprobe,['-v','error','-show_streams','-of','json',zoom])).stdout).streams.find(s=>s.codec_type==='video');assert.equal(z.avg_frame_rate,'60/1');assert.equal(Number(z.nb_frames),90);assert.ok(Math.abs((await probe(zoom)).duration-1.5)<.04);
  t.diagnostic(JSON.stringify({resolution:'3840x2160',fps:60,distinctFrames:hashes.length,elapsedSeconds:(performance.now()-start)/1000}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
