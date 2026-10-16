import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {createProject,addAsset,addClip,editProject,applyPlan,validateProject} from '../src/project.mjs';
import {zoomAt,zoomedCrop} from '../src/clip-time.mjs';
import {buildSegmentArgs,run,binaries,probe} from '../desktop/media.mjs';
import {parseReviewPayload} from '../desktop/ai.mjs';
const p=addClip(addAsset(createProject(),{id:'a',name:'v',duration:4,width:320,height:240,hasAudio:false}),'a','c');
test('a smooth zoom is a clip property interpolated over the clip and centred on its framing',()=>{
 const q=editProject(p,{type:'update',clipId:'c',zoom:{from:1,to:1.2}}),c=q.clips[0];
 assert.equal(zoomAt(c,0),1);assert.ok(Math.abs(zoomAt(c,2)-1.1)<1e-9);assert.equal(zoomAt({...c,zoom:undefined},2),1);
 assert.deepEqual(zoomedCrop({x:0,y:0,w:1,h:1},2),{x:.25,y:.25,w:.5,h:.5});
 for(const zoom of [{from:.9,to:1},{from:1,to:2.5},{from:1},{from:1,to:1.1,x:1}])assert.throws(()=>validateProject({...p,clips:[{...p.clips[0],zoom}]}),/zoom/i);
});
test('export animates the zoom per frame only when the clip has one',()=>{
 const plain=buildSegmentArgs(p.clips[0],p.assets[0],'in.mp4','out.mp4','9:16').join(' ');assert.doesNotMatch(plain,/eval=frame/);
 const zoomed=buildSegmentArgs({...p.clips[0],zoom:{from:1,to:1.2}},p.assets[0],'in.mp4','out.mp4','9:16').join(' ');assert.match(zoomed,/scale=w='trunc\(iw\*\(1\+0\.2\*t\/4\)\/2\)\*2':h=-2:eval=frame,crop=/);
});
test('the rendered frames actually move in: the last frame is a magnified centre of the first',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-zoom-'));try{
  const src=path.join(dir,'s.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=s=320x240:r=30:d=2','-c:v','libx264','-pix_fmt','yuv420p',src]);
  const a={id:'a',name:'s',...await probe(src)},c={id:'c',assetId:'a',in:0,out:2,volume:1,crop:{x:0,y:0,w:1,h:1},zoom:{from:1,to:2}},out=path.join(dir,'o.mp4');
  await run(binaries().ffmpeg,buildSegmentArgs(c,a,src,out,'16:9',720));
  const grab=async(t,f)=>{await run(binaries().ffmpeg,['-v','error','-y','-ss',String(t),'-i',out,'-frames:v','1','-vf','scale=32:18','-f','rawvideo','-pix_fmt','gray',f]);return (await import('node:fs/promises')).readFile(f);};
  const first=await grab(0,path.join(dir,'a.raw')),last=await grab(1.9,path.join(dir,'b.raw'));let diff=0;for(let i=0;i<first.length;i++)diff+=Math.abs(first[i]-last[i]);
  assert.ok(diff/first.length>8,`frames differ by zooming (${(diff/first.length).toFixed(1)})`);assert.ok(Math.abs((await probe(out)).duration-2)<.1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('the AI can zoom a whole clip or only part of it, counted as framing',()=>{
 const plan=ops=>JSON.stringify({plan:{summary:'z',questions:[],unsupported:[],operations:ops},pendingRequests:[],coverage:[{request:'zoom',kind:'framing',status:'planned',operationIndexes:[0],reason:'pedido'}]});
 assert.doesNotThrow(()=>parseReviewPayload(p,plan([{type:'update',clipId:'c',zoom:{from:1,to:1.1}}])));
 const out=parseReviewPayload(p,plan([{type:'adjust_ranges',clipId:'c',ranges:[[1,2]],patch:{zoom:{from:1,to:1.12}}}]));assert.equal(applyPlan(p,out.plan).clips[1].zoom.to,1.12);
});
