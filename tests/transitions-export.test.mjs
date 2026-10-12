import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {run,binaries,probe,renderProject} from '../desktop/media.mjs';import * as m from '../src/project.mjs';import {saveProjectFile,readProjectFile} from '../desktop/storage.mjs';
test('transition MP4 keeps duration/audio and reads moving source handles, not frozen endpoints',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-transition-'));
 try{
 const left=path.join(dir,'left.mp4'),right=path.join(dir,'right.mp4');
 for(const [file,color,freq] of [[left,'red',440],[right,'blue',880]]){
 const args=['-v','error','-y','-f','lavfi','-i',`color=${color}:s=160x160:r=30`,'-f','lavfi','-i',`sine=frequency=${freq}:sample_rate=48000`];if(color==='red')args.push('-vf',"drawbox=color=lime:t=fill:enable='gte(t,1.5)'");args.push('-t','3','-c:v','libx264','-c:a','aac',file);await run(binaries().ffmpeg,args);
 }
 const a={id:'a',name:'left',...await probe(left)},b={id:'b',name:'right',...await probe(right)};let p=m.addClip(m.addAsset(m.addAsset(m.createProject(),a),b),'a','l');p=m.editProject(p,{type:'trim',clipId:'l',in:.5,out:1.5});p=m.addClip(p,'b','r');p=m.editProject(p,{type:'trim',clipId:'r',in:.5,out:1.5});p.aspect='1:1';p.clips[0].captionWords=[{start:1.25,end:1.45,text:'Fala'}];p.captionStyle={font:'Arial',size:12,color:'#ffffff',position:'bottom',preset:'clean'};
 const registry=new Map([['a',{path:left}],['b',{path:right}]]);
 for(const type of ['dissolve','fade','slide']){
 const q=m.setTransition(p,'l','r',type,.6),saved=path.join(dir,type+'.corte'),out=path.join(dir,type+'.mp4');await saveProjectFile(saved,q,registry);const reopened=(await readProjectFile(saved)).project;assert.deepEqual(reopened.transitions,q.transitions);await renderProject(reopened,registry,out);assert.ok(Math.abs((await probe(out)).duration-2)<.04,'transition must not shorten timeline');
 const pixel=async(time,x=80)=>{const raw=path.join(dir,`${type}-${time}.raw`);await run(binaries().ffmpeg,['-v','error','-y','-ss',String(time),'-i',out,'-frames:v','1','-vf','scale=160:160','-f','rawvideo','-pix_fmt','rgb24',raw]);const data=await readFile(raw),i=(80*160+x)*3;return [...data.subarray(i,i+3)];};
 const before=await pixel(.4),after=await pixel(1.6);assert.ok(before[0]>180&&before[2]<40);assert.ok(after[2]>180&&after[0]<40);
 if(type==='dissolve'){const pre=await pixel(.9),post=await pixel(1.1);assert.ok(pre[0]>80&&pre[2]>30,'both sources blend before cut');assert.ok(post[1]>30&&post[2]>80&&post[0]<30,'green tail confirms live source handle after cut');}
 if(type==='fade'){const middle=await pixel(1);assert.ok(Math.max(...middle)<30,'black midpoint '+JSON.stringify(middle));}
 if(type==='slide'){const l=await pixel(.9,15),r=await pixel(.9,145);assert.ok(l[0]>180&&l[2]<40,'outgoing content on left');assert.ok(r[2]>180&&r[0]<40,'incoming content on right');}
 for(const [time,visible] of [[.85,true],[1.05,false]]){
 const raw=path.join(dir,`${type}-caption-${time}.raw`);await run(binaries().ffmpeg,['-v','error','-y','-ss',String(time),'-i',out,'-frames:v','1','-vf','scale=160:160','-f','rawvideo','-pix_fmt','rgb24',raw]);const pixels=await readFile(raw);let white=0;for(let y=120;y<160;y++)for(let x=0;x<160;x++){const i=(y*160+x)*3;if(pixels[i]>180&&pixels[i+1]>180&&pixels[i+2]>180)white++;}assert.equal(white>5,visible,`caption timing must not shift: ${type} ${time} white=${white}`);
 }
 const raw=path.join(dir,type+'-audio.raw');await run(binaries().ffmpeg,['-v','error','-y','-i',out,'-vn','-ac','1','-ar','48000','-f','s16le',raw]);const pcm=await readFile(raw);
 for(const [time,hz] of [[.8,440],[1.2,880]]){let crossings=0;const first=Math.floor(time*48000),last=first+2400;for(let i=first+1;i<last;i++)if(pcm.readInt16LE((i-1)*2)<=0&&pcm.readInt16LE(i*2)>0)crossings++;assert.ok(Math.abs(crossings/.05-hz)<70,'source audio switches at the original cut, not at the transition window');}
 for(const t of [.5,.9,1.1,1.5]){let energy=0;for(let i=Math.floor(t*48000);i<Math.floor((t+.02)*48000);i++)energy+=pcm.readInt16LE(i*2)**2;assert.ok(Math.sqrt(energy/960)>1000,'original audio stays audible through transition');}
 }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('a photo transitions into video without requiring artificial image source handles',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-photo-transition-'));
 try{
 const png=path.join(dir,'photo.png'),video=path.join(dir,'blue.mp4'),out=path.join(dir,'out.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=80x80','-frames:v','1',png]);await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:s=80x80:r=30','-t','2','-c:v','libx264',video]);
 const a={id:'i',name:'photo',...await probe(png)},b={id:'v',name:'video',...await probe(video)};let p=m.addClip(m.addAsset(m.addAsset(m.createProject(),a),b),'i','l');p=m.editProject(p,{type:'trim',clipId:'l',in:0,out:1});p=m.addClip(p,'v','r');p=m.editProject(p,{type:'trim',clipId:'r',in:.5,out:1.5});p.aspect='1:1';p=m.setTransition(p,'l','r','dissolve',.6);await renderProject(p,new Map([['i',{path:png}],['v',{path:video}]]),out);
 const raw=path.join(dir,'mix.raw');await run(binaries().ffmpeg,['-v','error','-y','-ss','1','-i',out,'-frames:v','1','-vf','scale=100:100','-f','rawvideo','-pix_fmt','rgb24',raw]);const pixels=await readFile(raw),i=(50*100+50)*3;assert.ok(pixels[i]>60&&pixels[i+2]>60,'real photo and video blend');assert.ok(Math.abs((await probe(out)).duration-2)<.04);
 }finally{await rm(dir,{recursive:true,force:true});}
});
