import path from 'node:path';import {freemem} from 'node:os';import {frame} from './media.mjs';import {cachedEvidence} from './analysis-cache.mjs';
// Bound peak HEVC decoder memory; preserve provider image order while independent seeks run concurrently.
export async function prepareFrameEvidence({selected,registry,directory,cache,signal,onProgress=()=>{},phase,extract=frame,parallel=freemem()<4*1073741824?1:2}){
 const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 const output=new Array(selected.length);let next=0,completed=0,failure=null;
 const worker=async()=>{while(next<selected.length&&!combined.aborted){
  const i=next++,f=selected[i];
  try{
   if(f.path)output[i]=f;
   else{
    const file=registry.get(f.assetId)?.path;if(!file)throw Error('Mídia ausente.');
    const value=await cachedEvidence({root:cache&&path.join(cache,'local-evidence'),kind:'refine',assets:[{id:f.assetId,file}],configuration:{version:1,time:f.time,width:720},signal:combined,
     compute:async folder=>{const out=folder?path.join(folder,'frame.jpg'):path.join(directory,`refine-${i}.jpg`);await extract(file,f.time,out,combined,{width:720});return {frames:[{assetId:f.assetId,time:f.time,path:out}]};}});
    output[i]={...f,path:value.frames[0].path};
   }
   onProgress({stage:'frames',phase,completed:++completed,total:selected.length});
  }catch(error){if(!failure)failure=error;controller.abort();}
 }};
 await Promise.all(Array.from({length:Math.max(1,Math.min(2,parallel,selected.length))},worker));
 if(signal?.aborted)throw Error('Análise cancelada.');if(failure)throw failure;return output;
}
