import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {run,binaries,probe,renderProject} from '../desktop/media.mjs';import {createProject,addAsset,addClip,addImageLayer,editProject} from '../src/project.mjs';import {saveProjectFile,readProjectFile} from '../desktop/storage.mjs';
test('PNG transparency, layer timing, blur background and persistence survive actual export',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-image-export-'));
 try{
  const source=path.join(dir,'video.mp4'),png=path.join(dir,'logo.png');
  await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:s=320x240:r=25','-t','2','-c:v','libx264',source]);
  await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=80x40','-f','lavfi','-i','color=black:s=80x40','-filter_complex','[0:v]format=rgb24[red];[1:v]format=gray,drawbox=x=20:y=10:w=40:h=20:color=white:t=fill[alpha];[red][alpha]alphamerge','-frames:v','1',png]);
  const a={id:'v',name:'video.mp4',...await probe(source)},image={id:'i',name:'logo.png',...await probe(png)};assert.equal(image.kind,'image');assert.equal(image.hasAudio,false);
  let p=addClip(addAsset(addAsset(createProject(),a),image),'v','c');p=editProject(p,{type:'update',clipId:'c',background:'blur'});
  p=addImageLayer(p,{id:'layer',assetId:'i',start:.5,end:1.5,x:50,y:50,width:40,rotation:0,opacity:100});
  const registry=new Map([['v',{path:source}],['i',{path:png}]]),saved=path.join(dir,'test.corte'),output=path.join(dir,'out.mp4');
  await saveProjectFile(saved,p,registry);const reopened=await readProjectFile(saved);assert.deepEqual(reopened.project,p);await renderProject(reopened.project,registry,output);
  for(const time of [.25,1,1.75]){
   const raw=path.join(dir,time+'.raw');await run(binaries().ffmpeg,['-v','error','-y','-ss',String(time),'-i',output,'-frames:v','1','-vf','scale=180:320','-f','rawvideo','-pix_fmt','rgb24',raw]);
   const b=await readFile(raw),pixel=(x,y)=>[...b.subarray((y*180+x)*3,(y*180+x)*3+3)];
   assert.ok(pixel(90,15)[2]>100,'blurred source fills previously black padding');
   assert.ok(pixel(57,160)[2]>100,'transparent edge retains background');
   if(time===1)assert.ok(pixel(90,160)[0]>150&&pixel(90,160)[2]<80,'image visible during its interval');
   else assert.ok(pixel(90,160)[2]>150&&pixel(90,160)[0]<80,'image absent outside its interval');
  }
  const colored=editProject(p,{type:'update',clipId:'c',background:'color',backgroundColor:'#00ff00'}),colorOut=path.join(dir,'color.mp4');
  await saveProjectFile(saved,colored,registry);assert.deepEqual((await readProjectFile(saved)).project,colored);await renderProject(colored,registry,colorOut);
  const green=path.join(dir,'green.raw');await run(binaries().ffmpeg,['-v','error','-y','-ss','0.25','-i',colorOut,'-frames:v','1','-vf','scale=180:320','-f','rawvideo','-pix_fmt','rgb24',green]);
  const pixels=await readFile(green),i=(15*180+90)*3;assert.ok(pixels[i+1]>200&&pixels[i]<30&&pixels[i+2]<30,'custom green background reaches the actual MP4');
  let still=addClip(addAsset(createProject(),image),'i','s');still=editProject(still,{type:'trim',clipId:'s',in:0,out:1});await renderProject(still,registry,path.join(dir,'still.mp4'));assert.ok(Math.abs((await probe(path.join(dir,'still.mp4'))).duration-1)<.1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
