import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {env,AutoProcessor,AutoTokenizer,CLIPVisionModelWithProjection,CLIPTextModelWithProjection,RawImage} from '@huggingface/transformers';
import {run,binaries} from './media.mjs';
import {inferenceOptions} from './inference-profile.mjs';
import {MODEL_ID,frameDirectory,cosineDistance,pixelMetrics,selectEvidence,pixelChange,visualCandidates,samplingArgs,semanticChanges,blurryRanges} from './local.mjs';
export async function analyzeVisual({assets,directory,models,step,backend:requestedBackend,index:wantIndex=false},{signal,onProgress}){
try{
 env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=models;env.useBrowserCache=false;env.useFSCache=false;
 const manifest=JSON.parse(await readFile(path.join(models,'manifest.json'),'utf8'));for(const entry of manifest.files){const actual=createHash('sha256').update(await readFile(path.join(models,entry.path))).digest('hex');if(actual!==entry.sha256)throw new Error('Modelo local corrompido. Reinstale o app.');}
 const processor=await AutoProcessor.from_pretrained(MODEL_ID,{local_files_only:true});let backend=requestedBackend,fallback=false,model;
 onProgress({stage:'worker-diagnostic',event:'worker-start',worker:'vision',processType:'vision',backend});
 const load=device=>CLIPVisionModelWithProjection.from_pretrained(MODEL_ID,inferenceOptions(device));
 try{model=await load(backend);}catch(error){if(backend==='cpu')throw error;backend='cpu';fallback=true;onProgress({stage:'worker-diagnostic',event:'worker-start',worker:'vision',processType:'vision',backend});model=await load('cpu');}
 onProgress({stage:'worker-diagnostic',event:'worker-start',worker:'vision',processType:'vision',backend});
 const evidence=[],reports=[],index=[],sharpnessByAsset=new Map(),fps=step===.5?4:step===5?1:2,start=performance.now();
 try{for(const asset of assets){
  if(!asset.file)throw new Error('Mídia ausente.');signal.throwIfAborted();const folder=frameDirectory(directory,asset.id);await mkdir(folder,{recursive:true});
  onProgress({stage:'local',completed:0,total:Math.ceil(asset.duration*fps),asset:asset.name});
  const decodeStart=performance.now();let progressBuffer='';
  await run(binaries().ffmpeg,samplingArgs(asset.file,fps,folder,asset),{signal,timeout:1800000,onData:chunk=>{
   progressBuffer+=chunk;const lines=progressBuffer.split('\n');progressBuffer=lines.pop();
   for(const line of lines){const match=/^out_time_us=(\d+)/.exec(line);if(match)onProgress({stage:'local',task:'decode',completed:Math.min(Math.ceil(asset.duration*fps),Math.floor(Number(match[1])/1e6*fps)),total:Math.ceil(asset.duration*fps),asset:asset.name});}
  }});
  const decodeMs=Math.round(performance.now()-decodeStart),screenStart=performance.now();
  const samples=[];let previous=null,inferred=0;
  for(let i=0;i<Math.ceil(asset.duration*fps);i++){
   signal.throwIfAborted();const time=i/fps,file=path.join(folder,String(i+1).padStart(6,'0')+'.png');let image;
   try{image=await RawImage.read(file);}catch(error){if(i===Math.ceil(asset.duration*fps)-1)break;throw error;}
   samples.push({time,change:pixelChange(previous,image),...pixelMetrics(image),file});previous=image;
   if(i%40===0)onProgress({stage:'local',completed:i+1,total:Math.ceil(asset.duration*fps),asset:asset.name});
  }
  const screeningMs=Math.round(performance.now()-screenStart),inferenceStart=performance.now();
  const candidates=visualCandidates(samples,assets.length);
  // One embedding per frame, shared by change detection and the per-second search index; blur is measured on the same preview.
  const vectors=new Map(),sharpness=new Map(),pool=i=>path.join(folder,`pool-${String(i+1).padStart(6,'0')}.jpg`);
  const lossless=i=>path.join(folder,`pool-${String(i+1).padStart(6,'0')}.png`);
  const savePreview=async(image,i)=>writeFile(pool(i),await image.toSharp().jpeg({quality:80}).toBuffer());
  const embed=async i=>{
   if(vectors.has(i))return vectors.get(i);
   signal.throwIfAborted();const image=await RawImage.read(lossless(i)),inputs=await processor(image);await savePreview(image,i);let output;
   try{output=await model(inputs);}catch(error){if(backend==='cpu')throw error;await model.dispose();backend='cpu';fallback=true;onProgress({stage:'worker-diagnostic',event:'worker-start',worker:'vision',processType:'vision',backend});model=await load('cpu');output=await model(inputs);}
   inferred++;const vector=Array.from(output.image_embeds.data);vectors.set(i,vector);sharpness.set(i,pixelMetrics(image).sharpness);return vector;
  };
  await semanticChanges(samples,candidates,embed);
  // The per-second search index (and the blur map built from it) is only needed by reviewed proposals.
  const perSecond=[];sharpnessByAsset.set(asset.id,perSecond);if(wantIndex)for(let i=0;i<samples.length;i+=fps){const vector=await embed(i),norm=Math.hypot(...vector)||1;perSecond.push({time:samples[i].time,sharpness:sharpness.get(i)});index.push({assetId:asset.id,time:samples[i].time,path:pool(i),vector:vector.map(x=>Number((x/norm).toFixed(5)))});}
  const inferenceMs=Math.round(performance.now()-inferenceStart),times=selectEvidence(candidates,Math.max(6,Math.floor(48/assets.length)));
  for(const time of times){const i=samples.findIndex(s=>s.time===time);if(!vectors.has(i))await savePreview(await RawImage.read(lossless(i)),i);evidence.push({assetId:asset.id,time,path:pool(i)});}
  reports.push({assetId:asset.id,localFrames:samples.length,inferredFrames:inferred,decodeMs,screeningMs,inferenceMs,localStep:1/fps,selected:times,signals:candidates.slice().sort((a,b)=>b.change-a.change).slice(0,12).map(s=>({sourceTime:s.time,visualChange:Number(s.change.toFixed(3)),sharpness:Math.round(s.sharpness)}))});
  // Only compact evidence/index JPEGs survive in the persistent cache.
  for(let i=0;i<samples.length;i++){await rm(path.join(folder,String(i+1).padStart(6,'0')+'.png'),{force:true});await rm(lossless(i),{force:true});}
 }}finally{await model?.dispose();}
 const all=[...sharpnessByAsset.values()].flat().map(s=>s.sharpness).sort((a,b)=>a-b),reference=all[Math.floor(all.length/2)];
 for(const report of reports){const blurry=all.length?blurryRanges(sharpnessByAsset.get(report.assetId)||[],.3,reference):[];if(blurry.length)report.blurry=blurry;}
 return {frames:evidence,index,report:{model:MODEL_ID,dtype:'q8',backend,fallback,elapsedMs:Math.round(performance.now()-start),rssMB:Math.round(process.memoryUsage().rss/1e6),assets:reports,warning:'Sinais locais são candidatos, não prova de eventos nem critério automático de corte. Amostras podem perder eventos rápidos.'}};
}catch(error){if(signal.aborted)throw new Error('Análise cancelada.');throw error;}
}
// Query text for the per-second index, embedded in this disposable process like the images.
export async function embedTexts({texts,models,manifest}){
 for(const entry of manifest?.files||[]){const actual=createHash('sha256').update(await readFile(path.join(models,entry.path))).digest('hex');if(actual!==entry.sha256)throw new Error('Modelo de busca visual corrompido.');}
 if(!manifest?.files?.length)throw new Error('Manifesto da busca visual ausente.');
 env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=models;env.useBrowserCache=false;env.useFSCache=false;
 if(!Array.isArray(texts)||!texts.length||texts.length>12||texts.some(t=>typeof t!=='string'||!t.trim()||t.length>200))throw Error('Consultas visuais inválidas.');
 const tokenizer=await AutoTokenizer.from_pretrained(MODEL_ID,{local_files_only:true}),model=await CLIPTextModelWithProjection.from_pretrained(MODEL_ID,inferenceOptions('cpu'));
 try{const output=await model(tokenizer(texts,{padding:true,truncation:true})),size=output.text_embeds.dims.at(-1),data=Array.from(output.text_embeds.data);
  return texts.map((_,i)=>{const v=data.slice(i*size,(i+1)*size),n=Math.hypot(...v)||1;return v.map(x=>x/n);});}
 finally{await model.dispose();}
}
