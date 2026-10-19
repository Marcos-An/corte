// Both speech models run in an isolated child: bundled model on CPU, accurate model accelerator first.
// Audio runs in overlapping windows; edit transcripts also carry measured pauses.
import {mkdtemp,readFile,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {env,pipeline} from '@huggingface/transformers';import {run,binaries} from './media.mjs';import {normalizeRecognition} from '../src/captions.mjs';
import {normalizeEditRecognition,speechWindows,mergeSpeechWindow} from './edit-transcript.mjs';import {detectPauses} from './speech-edit.mjs';
import {inferenceOptions} from './inference-profile.mjs';
import {groupCaptionTokens} from '../src/caption-timing.mjs';
export const DEFAULT_SPEECH_MODEL='onnx-community/whisper-small_timestamped';
export async function recognizeSpeech({models,assets,purpose='captions',speechModel=DEFAULT_SPEECH_MODEL,manifest=null,backend='cpu',temporaryDirectory},{signal,onProgress=()=>{}}){
 env.allowRemoteModels=false;env.localModelPath=models;env.useFSCache=false;env.useBrowserCache=false;
 for(const entry of manifest?.files||[]){const h=createHash('sha256');h.update(await readFile(path.join(models,entry.path)));if(h.digest('hex')!==entry.sha256)throw Error('Modelo de fala corrompido. Baixe novamente nas configurações.');}
 onProgress({stage:'captions',completed:0,total:assets.length});
 let device=backend,fallback=false,pipe,temp;const load=d=>pipeline('automatic-speech-recognition',speechModel,inferenceOptions(d));
 const reportBackend=()=>onProgress({stage:'worker-diagnostic',event:'worker-start',worker:'speech',processType:'speech',backend:device});
 const toCpu=async()=>{await pipe?.dispose();device='cpu';fallback=true;reportBackend();pipe=await load('cpu');};
 try{
  try{pipe=await load(device);}catch(error){if(device==='cpu')throw error;await toCpu();}
  reportBackend();
  temp=await mkdtemp(path.join(temporaryDirectory||tmpdir(),'corte-captions-'));const transcripts=[];
  for(const asset of assets){signal?.throwIfAborted();const merged={words:[],gaps:[],context:[],pauses:[]};
   for(const window of speechWindows(asset.duration)){signal?.throwIfAborted();const {offset,length}=window,file=path.join(temp,'audio.pcm');
    await run(binaries().ffmpeg,['-y','-ss',String(offset),'-i',asset.file,'-t',String(length),'-vn','-ar','16000','-ac','1','-f','f32le',file],{signal});
    const b=await readFile(file),samples=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));let power=0;for(const s of samples)power+=s*s;
    if(samples.length&&Math.sqrt(power/samples.length)>.001){
     const options={language:'portuguese',task:'transcribe',return_timestamps:'word'};let result;
     try{result=await pipe(samples,options);}catch(error){if(device==='cpu'||signal?.aborted)throw error;await toCpu();result=await pipe(samples,options);}
     mergeSpeechWindow(merged,purpose==='edit'?{...normalizeEditRecognition(result,length),pauses:detectPauses(samples,16000)}:{words:normalizeRecognition(result,length),gaps:[]},window);
    }else if(purpose==='edit')mergeSpeechWindow(merged,{words:[],gaps:[],pauses:[{start:0,end:length}]},window);
    onProgress({stage:'captions',completed:Math.min(window.to,asset.duration),total:asset.duration,asset:asset.name});
   }
   transcripts.push({assetId:asset.id,words:purpose==='captions'?groupCaptionTokens(merged.words,asset.duration):merged.words,recognizer:speechModel,...(purpose==='edit'?{gaps:merged.gaps,pauses:merged.pauses,...(merged.context.length?{context:merged.context}:{})}:{provider:'local',model:speechModel})});
  }
  return {transcripts,report:{model:speechModel,backend:device,fallback}};
 }finally{await pipe?.dispose();if(temp)await rm(temp,{recursive:true,force:true});}
}
