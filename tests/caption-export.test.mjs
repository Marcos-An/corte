import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {run,binaries,renderProject} from '../desktop/media.mjs';
test('export burns timed captions into actual MP4 frames',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-caption-export-'));
 try{const input=path.join(dir,'input.mp4');await run(binaries().ffmpeg,['-y','-f','lavfi','-i','color=black:size=320x240:rate=30','-t','2','-c:v','libx264',input]);
 const p={version:1,name:'Teste',aspect:'1:1',assets:[{id:'a',name:'Teste',duration:2,width:320,height:240,hasAudio:false}],clips:[{id:'c',assetId:'a',in:0,out:2,volume:1,crop:{x:0,y:0,w:1,h:1}}],transcripts:[{assetId:'a',words:[{start:0,end:1,text:'Olá'}]}]};
 const output=path.join(dir,'out.mp4');await renderProject(p,new Map([['a',{path:input}]]),output);
 const pixels=path.join(dir,'pixels.raw');await run(binaries().ffmpeg,['-y','-ss','0.5','-i',output,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24',pixels]);
 const b=await readFile(pixels);assert.ok(b.some(v=>v>100),'caption pixels must appear on black source');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('karaoke highlight moves between real words in exported video',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-karaoke-export-'));
 try{const input=path.join(dir,'input.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=black:size=320x320:rate=25','-t','2','-c:v','libx264',input]);
 const p={version:1,name:'Karaoke',aspect:'1:1',assets:[{id:'a',name:'Teste',duration:2,width:320,height:320,hasAudio:false}],clips:[{id:'c',assetId:'a',in:0,out:2,volume:1,crop:{x:0,y:0,w:1,h:1}}],captionStyle:{font:'Arial',size:8,color:'#ffffff',accent:'#eac39b',position:'center',preset:'karaoke'},transcripts:[{assetId:'a',words:[{start:0,end:2,text:'Olá mundo',tokens:[{start:0,end:1,text:'Olá'},{start:1,end:2,text:'mundo'}]}]}]};
 const output=path.join(dir,'out.mp4');await renderProject(p,new Map([['a',{path:input}]]),output,{height:720});
 const centers=[];for(const [i,time] of [.25,1.25].entries()){const raw=path.join(dir,`${i}.raw`);await run(binaries().ffmpeg,['-v','error','-y','-ss',String(time),'-i',output,'-frames:v','1','-vf','scale=320:320','-f','rawvideo','-pix_fmt','rgb24',raw]);const pixels=await readFile(raw);let count=0,sum=0;for(let j=0;j<pixels.length;j+=3){const [r,g,b]=pixels.subarray(j,j+3);if(r>160&&g>130&&b>80&&r-g>15&&g-b>15){count++;sum+=(j/3)%320;}}assert.ok(count>30,'actual accent pixels appear');centers.push(sum/count);}assert.ok(centers[1]>centers[0]+20,'highlight advances to second word');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('independent text burns into MP4 only inside its interval without transcripts',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-text-export-'));
 try{
  const input=path.join(dir,'input.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=black:size=320x320:rate=25','-t','2','-c:v','libx264',input]);
  const p={version:1,name:'Texto',aspect:'1:1',assets:[{id:'a',name:'Teste',duration:2,width:320,height:320,hasAudio:false}],clips:[{id:'c',assetId:'a',in:0,out:2,volume:1,crop:{x:0,y:0,w:1,h:1}}],textLayers:[{id:'t',text:'Título próprio',start:.5,end:1.5,style:{font:'Arial',size:8,color:'#ff0000',position:'center',positionX:30,positionY:30,preset:'clean'}}]};
  const output=path.join(dir,'out.mp4');await renderProject(p,new Map([['a',{path:input}]]),output);
  for(const time of [.25,1,1.75]){
   const raw=path.join(dir,time+'.raw');await run(binaries().ffmpeg,['-v','error','-y','-ss',String(time),'-i',output,'-frames:v','1','-vf','scale=320:320','-f','rawvideo','-pix_fmt','rgb24',raw]);
   const b=await readFile(raw);let count=0,x=0,y=0;
   for(let i=0;i<b.length;i+=3)if(b[i]>120&&b[i]>b[i+1]*2&&b[i]>b[i+2]*2){count++;x+=(i/3)%320;y+=Math.floor(i/3/320);}
   if(time===1){assert.ok(count>30);assert.ok(Math.abs(x/count-96)<15);assert.ok(Math.abs(y/count-96)<15);}
   else assert.equal(count,0,'no text outside configured interval');
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
