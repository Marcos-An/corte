import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {realpath,stat,lstat,rename,rm} from 'node:fs/promises';
import {allowedMedia} from './storage.mjs';
// A thumbnail is optional presentation data, never a prerequisite for opening a project.
export function createMediaRegistration({cache,probe,frame,onProgress=()=>{},onWarning=()=>{},onTiming=()=>{}}){
 let thumbnails=Promise.resolve(),background=new AbortController();
 async function register(file,{assetId,expected,signal}={}){
  if(!allowedMedia(file))throw Error('Formato não suportado. Use vídeo, áudio ou imagem PNG, JPEG ou WebP.');
  const name=path.basename(file),started=performance.now(),job=new AbortController(),operationId=randomUUID();
  const timed=async(stage,fn,operationSignal=signal)=>{const start=performance.now();try{const result=await fn();onTiming({operationId,stage,elapsedMs:performance.now()-start,outcome:'ok'});return result;}catch(error){onTiming({operationId,stage,elapsedMs:performance.now()-start,outcome:operationSignal?.aborted?'canceled':'error'});throw error;}};
  const progress=()=>onProgress({stage:'media',message:`Validando ${name} · ${Math.floor((performance.now()-started)/1000)} s…`,elapsedMs:Math.round(performance.now()-started)});
  progress();const interval=setInterval(progress,1000);let timer,abort;
  let real,info,signature;
  try{
   const interrupted=new Promise((_resolve,reject)=>{
    abort=()=>{job.abort();reject(Error('Importação/abertura cancelada.'));};
    timer=setTimeout(()=>{job.abort();reject(Error('Tempo limite de 15 s ao validar a mídia. Tente novamente; verifique se o arquivo está disponível no disco.'));},15000);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   });
   await Promise.race([interrupted,(async()=>{
    await timed('filesystem',async()=>{job.signal.throwIfAborted();real=await realpath(file);job.signal.throwIfAborted();signature=await stat(real);if(!signature.isFile())throw Error('Selecione um arquivo de mídia.');});
    job.signal.throwIfAborted();info=await timed('probe',()=>probe(real,{signal:job.signal,timeout:15000}));job.signal.throwIfAborted();
   })()]);
  }catch(error){throw Error(signal?.aborted?'Importação/abertura cancelada.':`Não foi possível validar ${name}: ${error.message}`);}
  finally{clearInterval(interval);clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  if(expected&&['duration','width','height','hasAudio','kind'].some(k=>(k==='kind'?(expected[k]||'video'):expected[k])!==(k==='kind'?(info[k]||'video'):info[k])))throw Error(`Arquivo diferente do original: ${name}. Importe-o como nova mídia.`);
  const token=randomUUID(),asset=expected||{id:assetId||randomUUID(),name,...info},thumbnail=info.kind==='audio'?null:path.join(cache,createHash('sha256').update(JSON.stringify(['thumbnail-v2-atomic',real,signature.size,signature.mtimeMs,signature.ctimeMs])).digest('hex')+'.jpg');
  const entry={path:real,asset,thumbnail,token},thumbnailSignal=signal?AbortSignal.any([signal,background.signal]):background.signal;
  entry.thumbnailReady=thumbnail?thumbnails=thumbnails.then(async()=>{
   if(thumbnailSignal.aborted)return false;
   try{return await timed('thumbnail',async()=>{const cached=await lstat(thumbnail).catch(()=>null);if(cached?.isFile()&&cached.size>0){onTiming({operationId,stage:'thumbnail-cache',elapsedMs:0,outcome:'ok'});return true;}const partial=path.join(cache,randomUUID()+'.partial.jpg');try{await frame(real,info.kind==='image'?0:Math.min(info.duration/2,2),partial,thumbnailSignal,{timeout:15000});thumbnailSignal.throwIfAborted();await rename(partial,thumbnail);return true;}finally{await rm(partial,{force:true}).catch(()=>{});}},thumbnailSignal);}
   catch{if(!thumbnailSignal.aborted)onWarning(`Não foi possível gerar a miniatura de ${name}. A mídia pode ser usada sem miniatura.`);return false;}
  }):Promise.resolve(false);
  return entry;
 }
 return {register,cancelThumbnails(){background.abort();background=new AbortController();}};
}
