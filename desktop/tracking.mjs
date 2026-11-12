import {mkdtemp,rm,readFile} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
import {run,binaries} from './media.mjs';import {createRegionTracker} from './region-tracker.mjs';
import {trackingRequest} from '../src/region-tracking.mjs';import {sourceTime,clipSpeed} from '../src/clip-time.mjs';
import {runIsolated} from './visual-process.mjs';
export function trackRegion(project,registry,layerId,{signal,onProgress}={}){
 const request=trackingRequest(project,layerId),entry=registry.get(request.asset.id);if(!entry)throw Error('Mídia ausente.');
 return runIsolated({entry:new URL('./tracking-child.mjs',import.meta.url),backend:'cpu',worker:'tracking',data:{project,layerId,file:entry.path},signal,onProgress,crashError:'O acompanhamento foi interrompido. O projeto não foi alterado.'});
}
export async function trackRegionLocal({project,layerId,file},{signal,onProgress=()=>{}}={}){
 const {layer,clip,clipStart,asset,region}=trackingRequest(project,layerId),length=layer.end-layer.start,fps=12,scale=Math.min(1,480/Math.max(asset.width,asset.height)),width=Math.round(asset.width*scale),height=Math.round(asset.height*scale),dir=await mkdtemp(path.join(tmpdir(),'corte-tracking-'));
 try{
  const raw=path.join(dir,'frames.gray');onProgress({stage:'tracking',fraction:0,message:'Preparando imagens para acompanhar…'});
  await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-ss',String(sourceTime(clip,layer.start-clipStart)),'-i',file,'-an','-t',String(length),'-vf',`setpts=(PTS-STARTPTS)/${clipSpeed(clip)},scale=${width}:${height},fps=${fps},format=gray`,'-f','rawvideo',raw],{signal,timeout:180000});
  const bytes=await readFile(raw),stride=width*height,count=Math.floor(bytes.length/stride);if(count<2)throw Error('Intervalo curto demais para acompanhar.');
  const tracker=createRegionTracker(bytes.subarray(0,stride),width,height,region),points=[{time:0,...region,confidence:1}];
  for(let i=1;i<count;i++){
   signal?.throwIfAborted();const pose=tracker.next(bytes.subarray(i*stride,(i+1)*stride)),time=i/fps;
   if(pose.lost)return {status:'lost',lostAt:layer.start+time,reason:pose.reason,points:[],sampleFps:fps};
   points.push({time,...pose});onProgress({stage:'tracking',fraction:i/count,message:`Acompanhando ${time.toFixed(1)} de ${length.toFixed(1)} s…`});
   // Yield so IPC cancellation is observed even during the CPU loop.
   await new Promise(resolve=>setImmediate(resolve));
  }
  points.push({...points.at(-1),time:length});return {status:'complete',points,sampleFps:fps,minConfidence:Math.min(...points.map(p=>p.confidence))};
 }finally{await rm(dir,{recursive:true,force:true});}
}
