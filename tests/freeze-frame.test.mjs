import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {createProject,addAsset,addClip,editProject,applyPlan,validateProject,duration} from '../src/project.mjs';
import {clipDuration,sourceTime,montageTime} from '../src/clip-time.mjs';
import {buildSegmentArgs,run,binaries,probe} from '../desktop/media.mjs';
import {parseReviewPayload} from '../desktop/ai.mjs';
const p=addClip(addAsset(createProject(),{id:'a',name:'v',duration:6,width:320,height:240,hasAudio:true}),'a','c');
test('a frozen frame holds one source instant for its own duration',()=>{
 const f={id:'f',assetId:'a',in:2,out:2.04,volume:1,crop:{x:0,y:0,w:1,h:1},freeze:1.5};
 assert.equal(clipDuration(f),1.5);assert.equal(sourceTime(f,1.2),2);assert.equal(montageTime(f,2.03),0);
});
test('freezing splits the clip at the instant and inserts the still between the two parts',()=>{
 const q=editProject(p,{type:'freeze',clipId:'c',time:2,duration:1.5});
 assert.deepEqual(q.clips.map(c=>[c.in,Number(c.out.toFixed(2)),c.freeze??null]),[[0,2,null],[2,2.04,1.5],[2,6,null]]);assert.equal(q.clips[0].id,'c');assert.ok(Math.abs(duration(q)-7.5)<1e-9);
 const end=editProject(p,{type:'freeze',clipId:'c',time:6,duration:2});assert.equal(end.clips.length,2);assert.equal(end.clips[1].freeze,2);assert.ok(end.clips[1].in<=6-.04+1e-9,'the last frame is still a real frame');
 for(const op of [{type:'freeze',clipId:'c',time:2,duration:0},{type:'freeze',clipId:'c',time:2,duration:11},{type:'freeze',clipId:'c',time:9,duration:1}])assert.throws(()=>editProject(p,op),/congel/i);
 const photo=addClip(addAsset(createProject(),{id:'i',name:'i.png',kind:'image',duration:5,width:20,height:20,hasAudio:false}),'i','pc');assert.throws(()=>editProject(photo,{type:'freeze',clipId:'pc',time:1,duration:1}),/congel/i);
 assert.throws(()=>validateProject({...p,clips:[{...p.clips[0],freeze:1}]}),/congel/i,'a frozen clip spans a single frame');
});
test('the AI can freeze a frame of a clip even after cutting it',()=>{
 const plan=ops=>({summary:'f',questions:[],unsupported:[],operations:ops});
 const q=applyPlan(p,plan([{type:'remove_ranges',clipId:'c',ranges:[[1,2]]},{type:'freeze_frame',clipId:'c',time:4,duration:1}]));
 assert.deepEqual(q.clips.map(c=>[c.in,Number(c.out.toFixed(2)),c.freeze??null]),[[0,1,null],[2,4,null],[4,4.04,1],[4,6,null]]);
 assert.doesNotThrow(()=>parseReviewPayload(p,JSON.stringify({plan:plan([{type:'freeze_frame',clipId:'c',time:3,duration:1}]),pendingRequests:[],coverage:[{request:'congelar',kind:'composition',status:'planned',operationIndexes:[0],reason:'cartaz'}]})));
});
test('export renders the frozen frame as a silent still of the right length',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-freeze-'));try{
  const src=path.join(dir,'s.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=s=320x240:r=30:d=3','-f','lavfi','-i','sine=f=440:d=3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',src]);
  const a={id:'a',name:'s',...await probe(src)},f={id:'f',assetId:'a',in:1,out:1.04,volume:1,crop:{x:0,y:0,w:1,h:1},freeze:1.5},out=path.join(dir,'o.mp4');await run(binaries().ffmpeg,buildSegmentArgs(f,a,src,out,'16:9',720));
  assert.ok(Math.abs((await probe(out)).duration-1.5)<.1);
  const grab=async(t,n)=>{const file=path.join(dir,n);await run(binaries().ffmpeg,['-v','error','-y','-ss',String(t),'-i',out,'-frames:v','1','-vf','scale=32:18','-f','rawvideo','-pix_fmt','gray',file]);return readFile(file);};
  const x=await grab(.1,'a.raw'),y=await grab(1.3,'b.raw');let diff=0;for(let i=0;i<x.length;i++)diff+=Math.abs(x[i]-y[i]);assert.ok(diff/x.length<2,`still frame (${(diff/x.length).toFixed(2)})`);
  const pcm=path.join(dir,'a.pcm');await run(binaries().ffmpeg,['-v','error','-y','-i',out,'-vn','-f','s16le','-ac','1','-ar','8000',pcm]);const samples=new Int16Array((await readFile(pcm)).buffer);assert.ok(samples.every(s=>Math.abs(s)<50),'frozen frames are silent');
 }finally{await rm(dir,{recursive:true,force:true});}
});
