import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {stat,mkdir,rename,rm,readdir} from 'node:fs/promises';import {run,probe,binaries} from './media.mjs';
export function proxyArgs(entry,out){return ['-hide_banner','-loglevel','error','-y','-threads','2','-i',entry.path,'-map','0:v:0','-map','0:a:0?','-vf',"scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,setsar=1",'-c:v','libx264','-preset','veryfast','-crf','26','-g','30','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','128k','-ar','48000','-ac','2','-t',String(entry.asset.duration),'-movflags','+faststart',out];}
export function createPreviewProxy({cache,inspect=probe,execute=run}={}){
 const directory=path.join(cache,'preview-proxies');
 async function location(entry){const s=await stat(entry.path);return path.join(directory,createHash('sha256').update(JSON.stringify(['preview-v1-720-30',path.resolve(entry.path),s.size,s.mtimeMs,s.ctimeMs,entry.asset.duration,entry.asset.width,entry.asset.height,entry.asset.hasAudio])).digest('hex')+'.mp4');}
 function valid(info,asset){return info.kind!=='audio'&&info.kind!=='image'&&info.width>=2&&info.height>=2&&Math.max(info.width,info.height)<=720&&Math.abs(info.width/info.height-asset.width/asset.height)<.025&&info.hasAudio===asset.hasAudio&&Math.abs(info.duration-asset.duration)<.12;}
 async function cached(entry,{signal}={}){
  if(entry.asset.kind==='audio'||entry.asset.kind==='image')return null;
  try{const file=await location(entry),s=await stat(file);if(!s.isFile()||!s.size)return null;const info=await inspect(file,{signal,timeout:15000});return valid(info,entry.asset)?file:null;}catch{return null;}
 }
 async function prepare(entries,{signal,onProgress=()=>{}}={}){
  const videos=entries.filter(e=>!['audio','image'].includes(e.asset.kind)),result={completed:[],errors:[],canceled:false,total:videos.length};await mkdir(directory,{recursive:true});
  for(const [index,entry]of videos.entries()){
   if(signal?.aborted){result.canceled=true;break;}let partial;const started=performance.now();
   const notify=()=>{try{onProgress({stage:'preview-proxy',completed:index,total:videos.length,elapsedMs:Math.round(performance.now()-started)});}catch{}};notify();const timer=setInterval(notify,1000);
   try{const reused=await cached(entry,{signal});signal?.throwIfAborted();if(reused){entry.previewProxy=reused;result.completed.push({id:entry.asset.id,cached:true});continue;}
    delete entry.previewProxy;const file=await location(entry);partial=path.join(directory,randomUUID()+'.partial.mp4');await execute(binaries().ffmpeg,proxyArgs(entry,partial),{signal,timeout:21600000});signal?.throwIfAborted();const info=await inspect(partial,{signal,timeout:15000});if(!valid(info,entry.asset))throw Error('Prévia gerada fora dos limites de tempo ou imagem.');
    // If the source changed during encoding, the result must never be reused for its new contents.
    if(file!==await location(entry))throw Error('A mídia mudou durante a preparação.');await rename(partial,file);partial=null;entry.previewProxy=file;result.completed.push({id:entry.asset.id,cached:false});
   }catch{if(signal?.aborted){result.canceled=true;break;}result.errors.push(entry.asset.id);}finally{clearInterval(timer);if(partial)await rm(partial,{force:true}).catch(()=>{});}
  }return result;
 }
 async function clear(){let removed=0,failed=0;for(const file of await readdir(directory).catch(()=>[])){if(!/^(?:[a-f0-9]{64}\.mp4|[a-f0-9-]{36}\.partial\.mp4)$/.test(file))continue;try{await rm(path.join(directory,file),{force:true});removed++;}catch{failed++;}}return {removed,failed};}
 return {cached,prepare,clear};
}
