import {parentPort,workerData} from 'node:worker_threads';
import {mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {env,AutoProcessor,CLIPVisionModelWithProjection,RawImage} from '@huggingface/transformers';
import {run,binaries} from './media.mjs';
import {MODEL_ID,frameDirectory,cosineDistance,pixelMetrics,selectEvidence} from './local.mjs';
const abort=new AbortController();parentPort.on('message',m=>{if(m.cancel)abort.abort();});
const {assets,directory,models,step}=workerData;
try{
 env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=models;env.useBrowserCache=false;env.useFSCache=false;
 const manifest=JSON.parse(await readFile(path.join(models,'manifest.json'),'utf8'));for(const entry of manifest.files){const actual=createHash('sha256').update(await readFile(path.join(models,entry.path))).digest('hex');if(actual!==entry.sha256)throw new Error('Modelo local corrompido. Reinstale o app.');}
 const processor=await AutoProcessor.from_pretrained(MODEL_ID,{local_files_only:true});let backend=process.platform==='darwin'?'coreml':process.platform==='win32'?'dml':'cpu',fallback=false,model;
 const load=device=>CLIPVisionModelWithProjection.from_pretrained(MODEL_ID,{dtype:'q8',device,local_files_only:true});
 try{model=await load(backend);}catch{backend='cpu';fallback=true;model=await load('cpu');}
 const evidence=[],reports=[],fps=step===.5?4:step===5?1:2,start=performance.now();
 try{for(const asset of assets){
  if(!asset.file)throw new Error('Mídia ausente.');abort.signal.throwIfAborted();const folder=frameDirectory(directory,asset.id);await mkdir(folder,{recursive:true});
  parentPort.postMessage({progress:{stage:'local',completed:0,total:Math.ceil(asset.duration*fps),asset:asset.name}});
  await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-i',asset.file,'-vf',`fps=${fps}:start_time=0,scale=480:-2`,'-q:v','4',path.join(folder,'%06d.jpg')],{signal:abort.signal,timeout:1800000});
  const samples=[];let previous=null;
  for(let i=0;i<Math.ceil(asset.duration*fps);i++){
   abort.signal.throwIfAborted();const time=i/fps,file=path.join(folder,String(i+1).padStart(6,'0')+'.jpg');let image;
   try{image=await RawImage.read(file);}catch(error){if(i===Math.ceil(asset.duration*fps)-1)break;throw error;}
   const inputs=await processor(image);let output;try{output=await model(inputs);}catch(error){if(backend==='cpu')throw error;await model.dispose();backend='cpu';fallback=true;model=await load('cpu');output=await model(inputs);}
   const vector=Array.from(output.image_embeds.data),metrics=pixelMetrics(image);samples.push({time,change:previous?cosineDistance(previous,vector):0,...metrics,file});previous=vector;
   if(i%10===0)parentPort.postMessage({progress:{stage:'local',completed:i+1,total:Math.ceil(asset.duration*fps),asset:asset.name}});
  }
  const times=selectEvidence(samples,Math.max(6,Math.floor(48/assets.length)));for(const time of times){const sample=samples.find(s=>s.time===time);evidence.push({assetId:asset.id,time,path:sample.file});}
  reports.push({assetId:asset.id,localFrames:samples.length,localStep:1/fps,selected:times,signals:samples.slice().sort((a,b)=>b.change-a.change).slice(0,12).map(s=>({sourceTime:s.time,visualChange:Number(s.change.toFixed(3)),sharpness:Math.round(s.sharpness)}))});
 }}finally{await model?.dispose();}
 parentPort.postMessage({result:{frames:evidence,report:{model:MODEL_ID,dtype:'q8',backend,fallback,elapsedMs:Math.round(performance.now()-start),rssMB:Math.round(process.memoryUsage().rss/1e6),assets:reports,warning:'Sinais locais são candidatos, não prova de eventos nem critério automático de corte. Amostras podem perder eventos rápidos.'}}});
}catch(error){parentPort.postMessage({error:abort.signal.aborted?'Análise cancelada.':error.message});}
