import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';
import {trackingFixture} from './tracking-fixture.mjs';import {trackRegion,trackRegionLocal} from '../desktop/tracking.mjs';import {trackingRequest,trackedBlur,trackedReframe} from '../src/region-tracking.mjs';import {cropAt} from '../src/tracked-crop.mjs';import {applyKeyframes} from '../src/keyframes.mjs';import * as m from '../src/project.mjs';import {saveProjectFile,readProjectFile} from '../desktop/storage.mjs';import {renderProject,run,binaries,probe} from '../desktop/media.mjs';
import {createRegionTracker} from '../desktop/region-tracker.mjs';
test('indistinguishable nearby targets and featureless seeds are rejected',()=>{
 const w=160,h=120,region={x:.5,y:.5,w:24/w,h:30/h},frame=(centers)=>{const bytes=new Uint8Array(w*h).fill(40);for(const center of centers)for(let y=45;y<75;y++)for(let x=center-12;x<center+12;x++)bytes[y*w+x]=50+((x-center+12)*43+(y-45)*67+(x-center)**2*3)%190;return bytes;};
 assert.throws(()=>createRegionTracker(new Uint8Array(w*h).fill(80),w,h,region),/poucos detalhes/);
 const tracker=createRegionTracker(frame([80]),w,h,region),result=tracker.next(frame([65,95]));assert.equal(result.lost,true);assert.match(result.reason,/parecidas/);
});
test('local tracker follows actual encoded motion, exports blur/reframing, and persists editable trajectories',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-track-'));try{
  const {p,file,registry}=await trackingFixture(dir),before=structuredClone(p),start=performance.now(),result=await trackRegion(p,registry,'target');assert.equal(result.status,'complete',JSON.stringify(result));
  let maxError=0;for(const point of result.points.filter(p=>p.time<1.9)){const cx=60+point.time*48,cy=90+Math.sin(point.time*2)*12;maxError=Math.max(maxError,Math.hypot(point.x*320-cx,point.y*180-cy));}assert.ok(maxError<5,'source pixel error '+maxError);
  const q=trackedBlur(p,'target',result);assert.ok(q.shapeLayers[0].keyframes.length>2&&q.shapeLayers[0].keyframes.length<=200);assert.deepEqual(p,before);assert.deepEqual(q.clips,p.clips);
  const saved=path.join(dir,'track.corte');await saveProjectFile(saved,q,registry);assert.deepEqual((await readProjectFile(saved)).project,q);
  const output=path.join(dir,'blur60.mp4');await renderProject(q,registry,output,{fps:60});assert.ok((await probe(output)).hasAudio);
  // Compare decoded target texture against the same frame with no mask.
  const base=structuredClone(p);base.shapeLayers=[];delete base.layerOrder;const clean=path.join(dir,'clean.mp4');await renderProject(base,registry,clean,{fps:60});
  const sample=async(file,time,name)=>{const raw=path.join(dir,name+'.rgb');await run(binaries().ffmpeg,['-v','error','-y','-ss',String(time),'-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24',raw]);return readFile(raw);};
  const deviation=(bytes,x,y,w=1280)=>{let sum=0,sq=0,n=0;for(let dy=-18;dy<18;dy++)for(let dx=-18;dx<18;dx++){const v=bytes[((Math.round(y)+dy)*w+Math.round(x)+dx)*3];sum+=v;sq+=v*v;n++;}return Math.sqrt(sq/n-(sum/n)**2);};
  for(const time of [.25,1,1.75]){const pose=applyKeyframes(q.shapeLayers[0],time),b=await sample(clean,time,'base'),g=await sample(output,time,'mask');assert.ok(deviation(g,pose.x*12.8,pose.y*7.2)<deviation(b,pose.x*12.8,pose.y*7.2)*.35,'mask follows target at '+time);}
  const framed=trackedReframe(p,'target',result);assert.equal(framed.shapeLayers.length,0);assert.equal(m.duration(framed),m.duration(p));assert.ok(cropAt(framed.clips[0],1.5).x>cropAt(framed.clips[0],0).x);
  const reframe=path.join(dir,'reframe.mp4');await renderProject(framed,registry,reframe,{fps:60});for(const time of [.25,1,1.75]){const bytes=await sample(reframe,time,'reframe');let sum=0,n=0;for(let y=180;y<540;y++)for(let x=200;x<1080;x++){const i=(y*1280+x)*3;if(bytes[i]>100&&Math.abs(bytes[i]-bytes[i+1])<15){sum+=x;n++;}}assert.ok(n>100);const crop=cropAt(framed.clips[0],time),expected=((60+time*48)/320-crop.x)/crop.w*1280;assert.ok(Math.abs(sum/n-expected)<25,'reframing follows target, clamped at source edges '+time+': '+sum/n+' expected '+expected);}
  const history=new m.History(p);history.commit(framed);assert.deepEqual(history.undo(),p);assert.deepEqual(history.redo(),framed);
  const sliced=m.applyPlan(framed,{summary:'slice',questions:[],unsupported:[],operations:[{type:'trim',clipId:'c',in:.5,out:1.8},{type:'update',clipId:'c',speed:2}]});assert.deepEqual(cropAt(sliced.clips[0],.25),cropAt(framed.clips[0],1));
  t.diagnostic(JSON.stringify({maxSourcePixelError:maxError,minConfidence:result.minConfidence,keyframes:q.shapeLayers[0].keyframes.length,elapsedSeconds:(performance.now()-start)/1000}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('occlusion, cancellation, crossing cuts and invalid seed geometry cannot silently apply a track',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-track-lost-'));try{const {p,file,registry}=await trackingFixture(dir,{occluded:true}),before=structuredClone(p),result=await trackRegionLocal({project:p,layerId:'target',file});assert.equal(result.status,'lost');assert.ok(result.lostAt>=.9&&result.lostAt<=1.2);assert.deepEqual(result.points,[]);assert.throws(()=>trackedBlur(p,'target',result));assert.deepEqual(p,before);
 const controller=new AbortController();controller.abort();await assert.rejects(trackRegion(p,registry,'target',{signal:controller.signal}),/cancelada/);
 const split=m.applyPlan(p,{summary:'split',questions:[],unsupported:[],operations:[{type:'split',clipId:'c',time:1}]});assert.throws(()=>trackingRequest(split,'target'),/único trecho/);
 const bad=structuredClone(p);bad.shapeLayers[0].x=1;assert.throws(()=>trackingRequest(bad,'target'),/inteiramente/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
