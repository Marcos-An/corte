import {mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {env,AutoProcessor,CLIPVisionModelWithProjection,RawImage} from '@huggingface/transformers';
import {run,binaries} from './media.mjs';
import {MODEL_ID,frameDirectory,cosineDistance,pixelMetrics,selectEvidence,pixelChange,visualCandidates,samplingArgs,semanticChanges} from './local.mjs';
export async function analyzeVisual({assets,directory,models,step,backend:requestedBackend},{signal,onProgress}){
try{
 env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=models;env.useBrowserCache=false;env.useFSCache=false;
 const manifest=JSON.parse(await readFile(path.join(models,'manifest.json'),'utf8'));for(const entry of manifest.files){const actual=createHash('sha256').update(await readFile(path.join(models,entry.path))).digest('hex');if(actual!==entry.sha256)throw new Error('Modelo local corrompido. Reinstale o app.');}
 const processor=await AutoProcessor.from_pretrained(MODEL_ID,{local_files_only:true});let backend=requestedBackend,fallback=false,model;
 onProgress({stage:'worker-diagnostic',event:'worker-start',worker:'vision',processType:'vision',backend});
 const load=device=>CLIPVisionModelWithProjection.from_pretrained(MODEL_ID,{dtype:'q8',device,local_files_only:true});
 try{model=await load(backend);}catch(error){if(backend==='cpu')throw error;backend='cpu';fallback=true;onProgress({stage:'worker-diagnostic',event:'worker-start',worker:'vision',processType:'vision',backend});model=await load('cpu');}
 onProgress({stage:'worker-diagnostic',event:'worker-start',worker:'vision',processType:'vision',backend});
 const evidence=[],reports=[],fps=step===.5?4:step===5?1:2,start=performance.now();
 try{for(const asset of assets){
  if(!asset.file)throw new Error('Mídia ausente.');signal.throwIfAborted();const folder=frameDirectory(directory,asset.id);await mkdir(folder,{recursive:true});
  onProgress({stage:'local',completed:0,total:Math.ceil(asset.duration*fps),asset:asset.name});
  await run(binaries().ffmpeg,samplingArgs(asset.file,fps,folder),{signal:signal,timeout:1800000});
  const samples=[];let previous=null,inferred=0;
  for(let i=0;i<Math.ceil(asset.duration*fps);i++){
   signal.throwIfAborted();const time=i/fps,file=path.join(folder,String(i+1).padStart(6,'0')+'.png');let image;
   try{image=await RawImage.read(file);}catch(error){if(i===Math.ceil(asset.duration*fps)-1)break;throw error;}
   samples.push({time,change:pixelChange(previous,image),...pixelMetrics(image),file});previous=image;
   if(i%40===0)onProgress({stage:'local',completed:i+1,total:Math.ceil(asset.duration*fps),asset:asset.name});
  }
  const candidates=visualCandidates(samples,assets.length);for(const c of candidates)c.file=path.join(folder,`pool-${String(samples.indexOf(c)+1).padStart(6,'0')}.jpg`);
  await semanticChanges(samples,candidates,async i=>{
   signal.throwIfAborted();const image=await RawImage.read(path.join(folder,`pool-${String(i+1).padStart(6,'0')}.jpg`)),inputs=await processor(image);let output;
   try{output=await model(inputs);}catch(error){if(backend==='cpu')throw error;await model.dispose();backend='cpu';fallback=true;onProgress({stage:'worker-diagnostic',event:'worker-start',worker:'vision',processType:'vision',backend});model=await load('cpu');output=await model(inputs);}
   inferred++;return Array.from(output.image_embeds.data);
  });
  const times=selectEvidence(candidates,Math.max(6,Math.floor(48/assets.length)));
  for(const time of times)evidence.push({assetId:asset.id,time,path:candidates.find(s=>s.time===time).file});
  reports.push({assetId:asset.id,localFrames:samples.length,inferredFrames:inferred,localStep:1/fps,selected:times,signals:candidates.slice().sort((a,b)=>b.change-a.change).slice(0,12).map(s=>({sourceTime:s.time,visualChange:Number(s.change.toFixed(3)),sharpness:Math.round(s.sharpness)}))});
 }}finally{await model?.dispose();}
 return {frames:evidence,report:{model:MODEL_ID,dtype:'q8',backend,fallback,elapsedMs:Math.round(performance.now()-start),rssMB:Math.round(process.memoryUsage().rss/1e6),assets:reports,warning:'Sinais locais são candidatos, não prova de eventos nem critério automático de corte. Amostras podem perder eventos rápidos.'}};
}catch(error){if(signal.aborted)throw new Error('Análise cancelada.');throw error;}
}
